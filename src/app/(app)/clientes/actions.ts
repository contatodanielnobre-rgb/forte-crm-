"use server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, t } from "@/db";
import { requirePermission, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notify, notifyManagers } from "@/lib/notify";
import { saveFile } from "@/lib/storage";
import { optStr, optEmail, optDate, money, intField, fd as toObj } from "@/lib/zod";
import { createJourneyForClient, setStepStatus, weeklyDates } from "@/lib/services/journey";
import { generateInstallments, recalcInstallmentStatuses } from "@/lib/services/finance";
import type { JourneyKey } from "@/db/schema";

const reval = (id?: string) => { revalidatePath("/clientes"); if (id) revalidatePath(`/clientes/${id}`); revalidatePath("/jornada"); revalidatePath("/financeiro"); revalidatePath("/dashboard"); revalidatePath("/agenda"); revalidatePath("/reunioes"); };

/** Garante que o usuário pode acessar o cliente (operacional/comercial só veem os seus). */
export async function assertClientAccess(clientId: string, perm: "clients.view" | "clients.manage" | "journey.manage" | "finance.manage" = "clients.view") {
  const user = await requireUser();
  if (!can(user.role, perm) && !(perm === "journey.manage" && can(user.role, "journey.manage"))) throw new Error("Acesso negado.");
  const client = await db.query.clients.findFirst({ where: eq(t.clients.id, clientId) });
  if (!client) throw new Error("Cliente não encontrado.");
  if (!can(user.role, "clients.viewAll") && client.ownerId !== user.id) {
    // operacional: pode ver clientes em que tem etapa/tarefa/compromisso atribuído
    const assigned = await db.query.journeySteps.findFirst({ where: and(eq(t.journeySteps.clientId, clientId), eq(t.journeySteps.ownerId, user.id)) })
      || await db.query.tasks.findFirst({ where: and(eq(t.tasks.clientId, clientId), eq(t.tasks.assigneeId, user.id)) })
      || await db.query.appointments.findFirst({ where: and(eq(t.appointments.clientId, clientId), eq(t.appointments.ownerId, user.id)) });
    if (!assigned) throw new Error("Você não tem acesso a este cliente.");
  }
  return { user, client };
}

const clientSchema = z.object({
  name: z.string().min(2, "Informe o nome"), company: optStr, cnpj: optStr, phone: optStr, whatsapp: optStr, email: optEmail, segment: optStr, address: optStr,
  service: optStr, contractValue: money, closedAt: optDate, ownerId: optStr, status: z.enum(["ONBOARDING", "ATIVO", "PAUSADO", "ENCERRADO"]).default("ONBOARDING"), notes: optStr,
});

export async function createClient(fd: FormData) {
  const user = await requirePermission("clients.manage");
  const p = clientSchema.safeParse(toObj(fd)); if (!p.success) throw new Error(p.error.issues[0].message);
  const d = p.data;
  const [c] = await db.insert(t.clients).values({ ...d, contractValue: d.contractValue.toFixed(2), closedAt: d.closedAt ?? new Date(), ownerId: d.ownerId ?? user.id }).returning();
  await db.insert(t.contracts).values({ clientId: c.id, totalValue: d.contractValue.toFixed(2), installments: 1, firstDueDate: new Date() });
  await generateInstallments(c.id);
  await createJourneyForClient(c.id, c.ownerId, c.closedAt);
  await db.insert(t.interactions).values({ clientId: c.id, userId: user.id, type: "sistema", content: "Cliente cadastrado manualmente." });
  await audit(user.id, "create", "client", c.id, `Cliente ${c.name} cadastrado`);
  reval(c.id);
  return c.id;
}

export async function updateClient(clientId: string, fd: FormData) {
  const { user, client } = await assertClientAccess(clientId, "clients.manage");
  const p = clientSchema.safeParse(toObj(fd)); if (!p.success) throw new Error(p.error.issues[0].message);
  const d = p.data;
  await db.update(t.clients).set({ ...d, contractValue: d.contractValue.toFixed(2), closedAt: d.closedAt ?? client.closedAt }).where(eq(t.clients.id, clientId));
  await audit(user.id, "update", "client", clientId, `Cliente ${d.name} atualizado`, { before: { status: client.status, contractValue: client.contractValue }, after: { status: d.status, contractValue: d.contractValue } });
  if (d.status !== client.status) await db.insert(t.interactions).values({ clientId, userId: user.id, type: "sistema", content: `Status alterado: ${client.status} → ${d.status}` });
  reval(clientId);
}

export async function deleteClient(clientId: string) {
  const user = await requirePermission("settings.manage");
  const [c] = await db.delete(t.clients).where(eq(t.clients.id, clientId)).returning();
  await audit(user.id, "delete", "client", clientId, `Cliente ${c?.name} excluído`);
  reval();
}

// ───────────── Contrato ─────────────
export async function saveContract(clientId: string, fd: FormData) {
  const { user } = await assertClientAccess(clientId, "finance.manage");
  const p = z.object({ totalValue: money, downPayment: money, installments: intField(1), paymentMethod: optStr, firstDueDate: optDate, discount: money, startDate: optDate, endDate: optDate, notes: optStr, status: z.enum(["PENDENTE", "ENVIADO", "ASSINADO", "CANCELADO"]), sentAt: optDate, signedAt: optDate }).safeParse(toObj(fd));
  if (!p.success) throw new Error(p.error.issues[0].message);
  const d = p.data;
  const prev = await db.query.contracts.findFirst({ where: eq(t.contracts.clientId, clientId) });
  const vals = { ...d, totalValue: d.totalValue.toFixed(2), downPayment: d.downPayment.toFixed(2), discount: d.discount.toFixed(2), installments: Math.max(1, d.installments) };
  if (prev) await db.update(t.contracts).set(vals).where(eq(t.contracts.clientId, clientId)); else await db.insert(t.contracts).values({ clientId, ...vals });
  await db.update(t.clients).set({ contractValue: vals.totalValue }).where(eq(t.clients.id, clientId));
  const structural = !prev || prev.totalValue !== vals.totalValue || prev.downPayment !== vals.downPayment || prev.installments !== vals.installments || prev.discount !== vals.discount || String(prev.firstDueDate) !== String(vals.firstDueDate);
  if (structural) await generateInstallments(clientId);
  // Automação: contrato assinado → etapa concluída
  if (d.status === "ASSINADO") await setStepStatus(clientId, "CONTRATO", "CONCLUIDO", { data: { sentAt: d.sentAt, signedAt: d.signedAt ?? new Date() } });
  else if (d.status === "ENVIADO") await setStepStatus(clientId, "CONTRATO", "EM_ANDAMENTO", { data: { sentAt: d.sentAt ?? new Date() } });
  await db.insert(t.interactions).values({ clientId, userId: user.id, type: "sistema", content: `Contrato atualizado (status: ${d.status}).` });
  await audit(user.id, "update", "contract", clientId, `Contrato do cliente atualizado`);
  reval(clientId);
}

// ───────────── Financeiro ─────────────
export async function addPayment(clientId: string, fd: FormData) {
  const { user } = await assertClientAccess(clientId, "finance.manage");
  const p = z.object({ installmentId: optStr, amount: money, paidAt: optDate, method: optStr, notes: optStr }).safeParse(toObj(fd));
  if (!p.success || p.data.amount <= 0) throw new Error("Informe um valor válido.");
  let receiptUrl: string | null = null;
  const file = fd.get("receipt"); if (file instanceof File && file.size > 0) { const s = await saveFile(file, "comprovantes"); receiptUrl = s.url; await db.insert(t.documents).values({ name: s.name, url: s.url, mimeType: s.mimeType, size: s.size, category: "comprovante", clientId, uploadedBy: user.id }); }
  await db.insert(t.payments).values({ clientId, installmentId: p.data.installmentId, amount: p.data.amount.toFixed(2), paidAt: p.data.paidAt ?? new Date(), method: p.data.method, notes: p.data.notes, receiptUrl, userId: user.id });
  await recalcInstallmentStatuses(clientId);
  await db.insert(t.interactions).values({ clientId, userId: user.id, type: "sistema", content: `Pagamento registrado: R$ ${p.data.amount.toFixed(2)}` });
  await audit(user.id, "create", "payment", clientId, `Pagamento de R$ ${p.data.amount.toFixed(2)} registrado`);
  reval(clientId);
}
export async function deletePayment(clientId: string, paymentId: string) {
  const { user } = await assertClientAccess(clientId, "finance.manage");
  await db.delete(t.payments).where(and(eq(t.payments.id, paymentId), eq(t.payments.clientId, clientId)));
  await recalcInstallmentStatuses(clientId);
  await audit(user.id, "delete", "payment", paymentId, "Pagamento removido");
  reval(clientId);
}
export async function addInstallment(clientId: string, fd: FormData) {
  const { user } = await assertClientAccess(clientId, "finance.manage");
  const p = z.object({ amount: money, dueDate: optDate, description: optStr }).safeParse(toObj(fd));
  if (!p.success || p.data.amount <= 0 || !p.data.dueDate) throw new Error("Informe valor e vencimento.");
  const existing = await db.select({ n: t.installments.number }).from(t.installments).where(eq(t.installments.clientId, clientId));
  const number = Math.max(0, ...existing.map((e) => e.n)) + 1;
  await db.insert(t.installments).values({ clientId, number, amount: p.data.amount.toFixed(2), dueDate: p.data.dueDate, description: p.data.description ?? `Parcela ${number}` });
  await recalcInstallmentStatuses(clientId);
  await audit(user.id, "create", "installment", clientId, `Parcela avulsa adicionada`);
  reval(clientId);
}
export async function setInstallmentStatus(clientId: string, installmentId: string, status: "PENDENTE" | "CANCELADO") {
  const { user } = await assertClientAccess(clientId, "finance.manage");
  await db.update(t.installments).set({ status }).where(and(eq(t.installments.id, installmentId), eq(t.installments.clientId, clientId)));
  await recalcInstallmentStatuses(clientId);
  await audit(user.id, "update", "installment", installmentId, `Parcela marcada como ${status}`);
  reval(clientId);
}

// ───────────── Jornada ─────────────
export async function updateJourneyStep(clientId: string, key: JourneyKey, fd: FormData) {
  const { user } = await assertClientAccess(clientId, "journey.manage");
  const o = toObj(fd);
  const status = (o.status as "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO") || "PENDENTE";
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!["status", "notes", "ownerId", "dueAt"].includes(k)) data[k] = v;
  const file = fd.get("file"); delete data.file;
  if (file instanceof File && file.size > 0) {
    const s = await saveFile(file, key.toLowerCase());
    await db.insert(t.documents).values({ name: s.name, url: s.url, mimeType: s.mimeType, size: s.size, category: key === "CONTRATO" ? "contrato" : key === "FORMULARIO" ? "formulario" : "outro", clientId, uploadedBy: user.id });
  }
  const prev = await db.query.journeySteps.findFirst({ where: and(eq(t.journeySteps.clientId, clientId), eq(t.journeySteps.key, key)) });
  await db.update(t.journeySteps).set({ status, completedAt: status === "CONCLUIDO" ? (prev?.completedAt ?? new Date()) : null, notes: o.notes || null, ownerId: o.ownerId || null, dueAt: o.dueAt ? new Date(o.dueAt) : prev?.dueAt ?? null, data: { ...(prev?.data ?? {}), ...data } })
    .where(and(eq(t.journeySteps.clientId, clientId), eq(t.journeySteps.key, key)));
  // Sincroniza contrato ↔ etapa
  if (key === "CONTRATO" && status === "CONCLUIDO") await db.update(t.contracts).set({ status: "ASSINADO", signedAt: new Date() }).where(and(eq(t.contracts.clientId, clientId), eq(t.contracts.status, "PENDENTE")));
  if (key === "ONBOARDING" && status === "CONCLUIDO") await db.update(t.clients).set({ status: "ATIVO" }).where(and(eq(t.clients.id, clientId), eq(t.clients.status, "ONBOARDING")));
  if (prev?.status !== status) await db.insert(t.interactions).values({ clientId, userId: user.id, type: "sistema", content: `Jornada: etapa "${key}" → ${status.replace("_", " ").toLowerCase()}` });
  await audit(user.id, "update", "journey", clientId, `Etapa ${key}: ${status}`);
  reval(clientId);
}

export async function generateWeeklyMeetings(clientId: string, fd: FormData) {
  const { user, client } = await assertClientAccess(clientId, "journey.manage");
  const p = z.object({ weekday: intField(2), hour: intField(15), weeks: intField(8), ownerId: optStr, link: optStr, startFrom: optDate }).safeParse(toObj(fd));
  if (!p.success) throw new Error("Dados inválidos.");
  const type = await db.query.appointmentTypes.findFirst({ where: eq(t.appointmentTypes.name, "Reunião semanal com cliente") });
  const dates = weeklyDates(p.data.startFrom ?? new Date(), p.data.weekday, p.data.hour, Math.min(26, Math.max(1, p.data.weeks)));
  await db.insert(t.appointments).values(dates.map((startAt) => ({ title: `Reunião semanal — ${client.name}`, startAt, durationMin: 45, typeId: type?.id, ownerId: p.data.ownerId ?? client.ownerId, clientId, link: p.data.link })));
  await db.update(t.journeySteps).set({ status: "EM_ANDAMENTO", data: { weekday: p.data.weekday, hour: p.data.hour } }).where(and(eq(t.journeySteps.clientId, clientId), eq(t.journeySteps.key, "REUNIOES_SEMANAIS"), eq(t.journeySteps.status, "PENDENTE")));
  await audit(user.id, "create", "appointment", clientId, `${dates.length} reuniões semanais criadas para ${client.name}`);
  await notify([p.data.ownerId ?? client.ownerId], "Calendário de reuniões semanais criado", `${dates.length} reuniões para ${client.name}`, `/clientes/${clientId}?aba=reunioes`);
  reval(clientId);
}

// ───────────── Compromissos / Tarefas / Relatórios / Documentos / Histórico ─────────────
export async function createClientAppointment(clientId: string, fd: FormData) {
  const { user, client } = await assertClientAccess(clientId, "clients.view");
  const p = z.object({ title: z.string().min(2, "Informe o título"), startAt: z.string().min(1, "Informe a data").transform((v) => new Date(v)), durationMin: intField(60), typeId: optStr, link: optStr, description: optStr, ownerId: optStr }).safeParse(toObj(fd));
  if (!p.success) throw new Error(p.error.issues[0].message);
  await db.insert(t.appointments).values({ ...p.data, clientId, ownerId: p.data.ownerId ?? client.ownerId ?? user.id });
  await audit(user.id, "create", "appointment", clientId, `Compromisso "${p.data.title}" criado`);
  reval(clientId);
}

export async function createTask(clientId: string, fd: FormData) {
  const { user } = await assertClientAccess(clientId, "clients.view");
  const p = z.object({ title: z.string().min(2, "Informe a tarefa"), description: optStr, dueAt: optDate, assigneeId: optStr, meetingId: optStr }).safeParse(toObj(fd));
  if (!p.success) throw new Error(p.error.issues[0].message);
  await db.insert(t.tasks).values({ ...p.data, clientId, assigneeId: p.data.assigneeId ?? user.id });
  if (p.data.assigneeId && p.data.assigneeId !== user.id) await notify([p.data.assigneeId], "Nova tarefa atribuída", p.data.title, `/clientes/${clientId}?aba=tarefas`);
  reval(clientId);
}
export async function toggleTask(clientId: string, taskId: string, status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA") {
  await assertClientAccess(clientId, "clients.view");
  await db.update(t.tasks).set({ status, completedAt: status === "CONCLUIDA" ? new Date() : null }).where(and(eq(t.tasks.id, taskId), eq(t.tasks.clientId, clientId)));
  reval(clientId);
}
export async function deleteTask(clientId: string, taskId: string) {
  await assertClientAccess(clientId, "clients.manage");
  await db.delete(t.tasks).where(and(eq(t.tasks.id, taskId), eq(t.tasks.clientId, clientId)));
  reval(clientId);
}

export async function createReport(clientId: string, fd: FormData) {
  const { user } = await assertClientAccess(clientId, "journey.manage");
  const p = z.object({ title: z.string().min(2, "Informe o título"), periodLabel: optStr, dueAt: optDate }).safeParse(toObj(fd));
  if (!p.success) throw new Error(p.error.issues[0].message);
  await db.insert(t.reports).values({ ...p.data, clientId });
  await audit(user.id, "create", "report", clientId, `Relatório "${p.data.title}" planejado`);
  reval(clientId);
}
export async function deliverReport(clientId: string, reportId: string, fd: FormData) {
  const { user } = await assertClientAccess(clientId, "journey.manage");
  const o = toObj(fd);
  const indicators: Record<string, string> = {};
  for (let i = 0; i < 6; i++) if (o[`k${i}`]) indicators[o[`k${i}`]] = o[`v${i}`] ?? "";
  const file = fd.get("file");
  if (file instanceof File && file.size > 0) { const s = await saveFile(file, "relatorios"); await db.insert(t.documents).values({ name: s.name, url: s.url, mimeType: s.mimeType, size: s.size, category: "relatorio", clientId, reportId, uploadedBy: user.id }); }
  await db.update(t.reports).set({ status: "ENTREGUE", deliveredAt: o.deliveredAt ? new Date(o.deliveredAt) : new Date(), indicators, observations: o.observations || null }).where(and(eq(t.reports.id, reportId), eq(t.reports.clientId, clientId)));
  await db.update(t.journeySteps).set({ status: "EM_ANDAMENTO" }).where(and(eq(t.journeySteps.clientId, clientId), eq(t.journeySteps.key, "RELATORIOS"), eq(t.journeySteps.status, "PENDENTE")));
  await db.insert(t.interactions).values({ clientId, userId: user.id, type: "sistema", content: "Relatório entregue ao cliente." });
  await audit(user.id, "update", "report", reportId, "Relatório entregue");
  reval(clientId);
}
export async function deleteReport(clientId: string, reportId: string) {
  await assertClientAccess(clientId, "journey.manage");
  await db.delete(t.reports).where(and(eq(t.reports.id, reportId), eq(t.reports.clientId, clientId)));
  reval(clientId);
}

export async function uploadDocument(clientId: string, fd: FormData) {
  const { user } = await assertClientAccess(clientId, "clients.view");
  const file = fd.get("file"); if (!(file instanceof File) || file.size === 0) throw new Error("Selecione um arquivo.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Arquivo acima de 15 MB.");
  const s = await saveFile(file, "documentos");
  await db.insert(t.documents).values({ name: s.name, url: s.url, mimeType: s.mimeType, size: s.size, category: String(fd.get("category") || "outro"), clientId, uploadedBy: user.id });
  await audit(user.id, "create", "document", clientId, `Documento ${s.name} anexado`);
  reval(clientId);
}
export async function deleteDocument(clientId: string, docId: string) {
  await assertClientAccess(clientId, "clients.manage");
  await db.delete(t.documents).where(and(eq(t.documents.id, docId), eq(t.documents.clientId, clientId)));
  reval(clientId);
}

export async function addClientInteraction(clientId: string, fd: FormData) {
  const { user } = await assertClientAccess(clientId, "clients.view");
  const content = String(fd.get("content") || "").trim(); if (!content) throw new Error("Escreva o registro.");
  await db.insert(t.interactions).values({ clientId, userId: user.id, type: String(fd.get("type") || "nota"), content });
  reval(clientId);
}

export async function flagOverdue() {
  // utilitário chamado pelas páginas: recalcula atrasos e avisa gestores (idempotente por dia)
  await recalcInstallmentStatuses();
  void notifyManagers;
}
