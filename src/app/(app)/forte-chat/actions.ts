"use server";
import { z } from "zod";
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, t } from "@/db";
import { requirePermission, type SessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { setSetting } from "@/lib/chat/settings-store";
import { assertConversationAccess, findConversationByPhone, getChatSettings, logInteraction, toWaId, upsertConversation, type ChatSettings } from "@/lib/chat/core";
import { cloudConfigured, cloudMarkRead } from "@/lib/chat/cloud-api";
import { cancelChatTask, completeChatTask, createChatTask, isSendType, sendTaskNow, TASK_TYPES, updateChatTask, validateTaskInput, type ChatTaskType } from "@/lib/chat/tasks";
import { canUseMedia } from "@/lib/chat/media-access";
import { moveLead } from "../pipeline/actions";
import { stageByFlag } from "@/lib/services/leads";
import { num } from "@/lib/format";

const reval = () => { revalidatePath("/forte-chat"); revalidatePath("/forte-chat/tarefas"); revalidatePath("/agenda"); };

async function manageable(user: SessionUser, conversationId: string) {
  const conv = await assertConversationAccess(user, conversationId);
  return conv;
}

// ───────────── Conversa ─────────────
export async function markConversationRead(conversationId: string) {
  const user = await requirePermission("chat.view");
  const conv = await assertConversationAccess(user, conversationId);
  if (conv.unreadCount === 0) return;
  await db.update(t.chatConversations).set({ unreadCount: 0 }).where(eq(t.chatConversations.id, conversationId));
  if (cloudConfigured()) {
    const [last] = await db.select({ wa: t.chatMessages.waMessageId }).from(t.chatMessages).where(and(eq(t.chatMessages.conversationId, conversationId), eq(t.chatMessages.direction, "IN"))).orderBy(desc(t.chatMessages.createdAt)).limit(1);
    if (last?.wa) await cloudMarkRead(last.wa).catch(() => {}); // confirmação de leitura no WhatsApp do contato
  }
}

export async function setConversationStatus(conversationId: string, status: "ABERTA" | "AGUARDANDO" | "RESOLVIDA") {
  const user = await requirePermission("chat.view");
  await manageable(user, conversationId);
  if (!["ABERTA", "AGUARDANDO", "RESOLVIDA"].includes(status)) throw new Error("Status inválido.");
  await db.update(t.chatConversations).set({ status }).where(eq(t.chatConversations.id, conversationId));
}

export async function toggleArchive(conversationId: string) {
  const user = await requirePermission("chat.view");
  const conv = await manageable(user, conversationId);
  await db.update(t.chatConversations).set({ archived: !conv.archived }).where(eq(t.chatConversations.id, conversationId));
  return !conv.archived;
}

export async function toggleFavorite(conversationId: string) {
  const user = await requirePermission("chat.view");
  await assertConversationAccess(user, conversationId);
  const del = await db.delete(t.chatFavorites).where(and(eq(t.chatFavorites.userId, user.id), eq(t.chatFavorites.conversationId, conversationId))).returning();
  if (!del.length) await db.insert(t.chatFavorites).values({ userId: user.id, conversationId }).onConflictDoNothing();
  return !del.length;
}

export async function assignConversation(conversationId: string, assigneeId: string | null) {
  const user = await requirePermission("chat.view");
  const conv = await assertConversationAccess(user, conversationId);
  const isMgr = can(user.role, "chat.viewAll");
  if (!isMgr && assigneeId !== user.id) throw new Error("Apenas gestores podem atribuir conversas a outras pessoas.");
  if (!isMgr && conv.assigneeId && conv.assigneeId !== user.id) throw new Error("Esta conversa já tem responsável.");
  if (assigneeId) { const u = await db.query.users.findFirst({ where: and(eq(t.users.id, assigneeId), eq(t.users.active, true)) }); if (!u) throw new Error("Usuário inválido."); }
  await db.update(t.chatConversations).set({ assigneeId }).where(eq(t.chatConversations.id, conversationId));
  await audit(user.id, "assign", "chat_conversation", conversationId, `Responsável da conversa ${conv.waId} alterado`);
  if (assigneeId && assigneeId !== user.id) { const { notify } = await import("@/lib/notify"); await notify([assigneeId], "Conversa atribuída a você", `WhatsApp ${conv.profileName ?? conv.waId}`, `/forte-chat?c=${conversationId}`); }
}

// ───────────── Contatos ─────────────
/** Busca contatos já cadastrados (leads e clientes visíveis ao usuário) para iniciar conversa / vincular. */
export async function searchContacts(q: string) {
  const user = await requirePermission("chat.view");
  const term = `%${q.trim()}%`;
  if (q.trim().length < 2) return [];
  const d = q.replace(/\D/g, "");
  const leadScope = can(user.role, "pipeline.viewAll") ? undefined : eq(t.leads.ownerId, user.id);
  const clientScope = can(user.role, "clients.viewAll") ? undefined : eq(t.clients.ownerId, user.id);
  const [leads, clients] = await Promise.all([
    can(user.role, "pipeline.view") ? db.select({ id: t.leads.id, name: t.leads.name, company: t.leads.company, phone: t.leads.phone }).from(t.leads).where(and(eq(t.leads.archived, false), leadScope, or(ilike(t.leads.name, term), ilike(t.leads.company, term), d.length >= 4 ? ilike(sql`regexp_replace(coalesce(${t.leads.phone}, ''), '\\D', '', 'g')`, `%${d}%`) : undefined))).orderBy(asc(t.leads.name)).limit(15) : [],
    db.select({ id: t.clients.id, name: t.clients.name, company: t.clients.company, phone: sql<string | null>`coalesce(${t.clients.whatsapp}, ${t.clients.phone})`, leadId: t.clients.leadId }).from(t.clients).where(and(clientScope, or(ilike(t.clients.name, term), ilike(t.clients.company, term), d.length >= 4 ? ilike(sql`regexp_replace(coalesce(${t.clients.whatsapp}, ${t.clients.phone}, ''), '\\D', '', 'g')`, `%${d}%`) : undefined))).orderBy(asc(t.clients.name)).limit(15),
  ]);
  const clientLeadIds = new Set(clients.map((c) => c.leadId).filter(Boolean));
  return [
    ...clients.map((c) => ({ kind: "cliente" as const, id: c.id, name: c.name, company: c.company, phone: c.phone })),
    ...leads.filter((l) => !clientLeadIds.has(l.id)).map((l) => ({ kind: "lead" as const, id: l.id, name: l.name, company: l.company, phone: l.phone })),
  ];
}

async function contactPhone(user: SessionUser, kind: "lead" | "cliente", id: string) {
  if (kind === "lead") {
    const lead = await db.query.leads.findFirst({ where: eq(t.leads.id, id) });
    if (!lead) throw new Error("Lead não encontrado.");
    if (!can(user.role, "pipeline.viewAll") && lead.ownerId !== user.id) throw new Error("Você só pode conversar com seus próprios leads.");
    const client = await db.query.clients.findFirst({ where: eq(t.clients.leadId, lead.id), columns: { id: true } });
    return { phone: lead.phone, leadId: lead.id, clientId: client?.id ?? null, ownerId: lead.ownerId };
  }
  const c = await db.query.clients.findFirst({ where: eq(t.clients.id, id) });
  if (!c) throw new Error("Cliente não encontrado.");
  if (!can(user.role, "clients.viewAll") && c.ownerId !== user.id) throw new Error("Você só pode conversar com seus clientes.");
  return { phone: c.whatsapp || c.phone, leadId: c.leadId, clientId: c.id, ownerId: c.ownerId };
}

/** Abre (ou reaproveita) a conversa de um contato já cadastrado. Nunca duplica: um número = uma conversa. */
export async function startConversation(kind: "lead" | "cliente", id: string) {
  const user = await requirePermission("chat.view");
  const c = await contactPhone(user, kind, id);
  const waId = toWaId(c.phone);
  if (waId.length < 10) throw new Error("Este contato não tem telefone/WhatsApp válido cadastrado.");
  const conv = await upsertConversation(waId, { leadId: c.leadId, clientId: c.clientId, assigneeId: c.ownerId ?? user.id });
  // completa vínculos que faltavam
  const patch: Partial<typeof t.chatConversations.$inferInsert> = {};
  if (!conv.leadId && c.leadId) patch.leadId = c.leadId;
  if (!conv.clientId && c.clientId) patch.clientId = c.clientId;
  if (conv.archived) patch.archived = false;
  if (Object.keys(patch).length) await db.update(t.chatConversations).set(patch).where(eq(t.chatConversations.id, conv.id));
  return conv.id;
}

/** Vincula uma conversa de número desconhecido a um lead/cliente existente (não cria duplicado). */
export async function linkConversation(conversationId: string, kind: "lead" | "cliente", id: string) {
  const user = await requirePermission("chat.view");
  const conv = await assertConversationAccess(user, conversationId);
  const c = await contactPhone(user, kind, id);
  await db.update(t.chatConversations).set({ leadId: c.leadId ?? conv.leadId, clientId: c.clientId ?? conv.clientId, assigneeId: conv.assigneeId ?? c.ownerId ?? user.id }).where(eq(t.chatConversations.id, conversationId));
  // etiquetas soltas da conversa passam para o cadastro
  const loose = await db.select().from(t.chatContactLabels).where(eq(t.chatContactLabels.conversationId, conversationId));
  for (const l of loose) await attachLabelRows(l.labelId, { leadId: c.leadId, clientId: c.clientId, conversationId: null });
  await db.delete(t.chatContactLabels).where(eq(t.chatContactLabels.conversationId, conversationId));
  if (!c.phone) { if (c.clientId) await db.update(t.clients).set({ whatsapp: conv.waId }).where(eq(t.clients.id, c.clientId)); else if (c.leadId) await db.update(t.leads).set({ phone: conv.waId }).where(eq(t.leads.id, c.leadId)); }
  await logInteraction({ leadId: c.leadId, clientId: c.clientId }, user.id, `WhatsApp ${conv.waId} vinculado ao cadastro pelo FORTE CHAT.`, "sistema");
  reval();
}

/** Cadastra o número desconhecido como novo lead (verifica antes se já existe). */
export async function createLeadFromConversation(conversationId: string, fd: FormData) {
  const user = await requirePermission("pipeline.manage");
  const conv = await assertConversationAccess(user, conversationId);
  if (conv.leadId || conv.clientId) throw new Error("Esta conversa já está vinculada a um contato.");
  const { findContactByPhone } = await import("@/lib/chat/core");
  const existing = await findContactByPhone(conv.waId);
  if (existing.lead || existing.client) throw new Error(`Já existe um cadastro com este telefone (${existing.client?.name ?? existing.lead?.name}). Use "Vincular a contato existente".`);
  const p = z.object({ name: z.string().trim().min(2, "Informe o nome"), company: z.string().trim().optional(), email: z.string().trim().optional(), value: z.string().optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) throw new Error(p.error.issues[0].message);
  const stage = await stageByFlag("isDefault");
  if (!stage) throw new Error("Nenhuma etapa padrão configurada no pipeline.");
  const source = await db.query.leadSources.findFirst({ where: eq(t.leadSources.name, "WhatsApp") });
  const ownerId = can(user.role, "pipeline.viewAll") ? conv.assigneeId ?? user.id : user.id;
  const [lead] = await db.insert(t.leads).values({ name: p.data.name, company: p.data.company || null, email: p.data.email || null, phone: conv.waId, value: num(p.data.value).toFixed(2), stageId: stage.id, sourceId: source?.id ?? null, ownerId }).returning();
  await db.insert(t.interactions).values({ leadId: lead.id, userId: user.id, type: "sistema", content: "Lead cadastrado a partir do FORTE CHAT." });
  await db.update(t.chatConversations).set({ leadId: lead.id, assigneeId: conv.assigneeId ?? ownerId }).where(eq(t.chatConversations.id, conversationId));
  const loose = await db.select().from(t.chatContactLabels).where(eq(t.chatContactLabels.conversationId, conversationId));
  for (const l of loose) await attachLabelRows(l.labelId, { leadId: lead.id, clientId: null, conversationId: null });
  await db.delete(t.chatContactLabels).where(eq(t.chatContactLabels.conversationId, conversationId));
  await audit(user.id, "create", "lead", lead.id, `Lead ${lead.name} cadastrado pelo FORTE CHAT`);
  revalidatePath("/pipeline"); reval();
}

/** Atualiza a etapa do pipeline sem sair do chat — usa a mesma action do Kanban (mesmas permissões e automações). */
export async function moveConversationLead(conversationId: string, stageId: string, lossReasonId?: string | null) {
  const user = await requirePermission("chat.view");
  const conv = await assertConversationAccess(user, conversationId);
  if (!conv.leadId) throw new Error("Esta conversa não está vinculada a um lead.");
  const stage = await db.query.pipelineStages.findFirst({ where: eq(t.pipelineStages.id, stageId) });
  if (stage?.isLost && !lossReasonId) throw new Error("Informe o motivo da perda.");
  const res = await moveLead(conv.leadId, stageId, lossReasonId ?? null, "pelo FORTE CHAT");
  if (res.converted) { const c = await db.query.clients.findFirst({ where: eq(t.clients.leadId, conv.leadId), columns: { id: true } }); if (c) await db.update(t.chatConversations).set({ clientId: c.id }).where(eq(t.chatConversations.id, conversationId)); }
  reval();
  return res;
}

// ───────────── Etiquetas ─────────────
const labelSchema = z.object({ name: z.string().trim().min(2, "Informe o nome").max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida") });
export async function createLabel(fd: FormData) {
  const user = await requirePermission("chat.manage");
  const p = labelSchema.safeParse(Object.fromEntries(fd)); if (!p.success) throw new Error(p.error.issues[0].message);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${t.chatLabels.order}), 0)::int` }).from(t.chatLabels);
  await db.insert(t.chatLabels).values({ ...p.data, order: max + 1 }).onConflictDoNothing();
  await audit(user.id, "create", "chat_label", null, `Etiqueta ${p.data.name} criada`);
  reval();
}
export async function updateLabel(id: string, fd: FormData) {
  const user = await requirePermission("chat.manage");
  const p = labelSchema.safeParse(Object.fromEntries(fd)); if (!p.success) throw new Error(p.error.issues[0].message);
  await db.update(t.chatLabels).set(p.data).where(eq(t.chatLabels.id, id));
  await audit(user.id, "update", "chat_label", id, `Etiqueta ${p.data.name} atualizada`);
  reval();
}
export async function deleteLabel(id: string) {
  const user = await requirePermission("chat.manage");
  const [l] = await db.delete(t.chatLabels).where(eq(t.chatLabels.id, id)).returning();
  if (l) await audit(user.id, "delete", "chat_label", id, `Etiqueta ${l.name} excluída`);
  reval();
}

async function attachLabelRows(labelId: string, c: { leadId: string | null; clientId: string | null; conversationId: string | null }) {
  const rows: (typeof t.chatContactLabels.$inferInsert)[] = [];
  if (c.leadId) rows.push({ labelId, leadId: c.leadId });
  if (c.clientId) rows.push({ labelId, clientId: c.clientId });
  if (!rows.length && c.conversationId) rows.push({ labelId, conversationId: c.conversationId });
  for (const r of rows) await db.insert(t.chatContactLabels).values(r).onConflictDoNothing();
}

/** Liga/desliga etiqueta no contato. Fica gravada no cadastro do lead e do cliente (sincronizada com o CRM). */
export async function toggleContactLabel(conversationId: string, labelId: string) {
  const user = await requirePermission("chat.view");
  const conv = await assertConversationAccess(user, conversationId);
  const match = or(eq(t.chatContactLabels.conversationId, conv.id), conv.leadId ? eq(t.chatContactLabels.leadId, conv.leadId) : undefined, conv.clientId ? eq(t.chatContactLabels.clientId, conv.clientId) : undefined);
  const removed = await db.delete(t.chatContactLabels).where(and(eq(t.chatContactLabels.labelId, labelId), match)).returning();
  if (!removed.length) await attachLabelRows(labelId, { leadId: conv.leadId, clientId: conv.clientId, conversationId: conv.id });
  return !removed.length;
}

// ───────────── Mensagens ─────────────
/** Exclusão no CRM. A Cloud API não permite apagar uma mensagem já entregue no WhatsApp do contato — isso é informado ao usuário. */
export async function deleteChatMessage(messageId: string) {
  const user = await requirePermission("chat.view");
  const msg = await db.query.chatMessages.findFirst({ where: eq(t.chatMessages.id, messageId) });
  if (!msg) throw new Error("Mensagem não encontrada.");
  await assertConversationAccess(user, msg.conversationId);
  const mgr = can(user.role, "chat.viewAll");
  if (!mgr && !(msg.direction === "OUT" && msg.senderId === user.id)) throw new Error("Você só pode excluir mensagens que você enviou.");
  await db.update(t.chatMessages).set({ deletedAt: new Date(), deletedById: user.id }).where(eq(t.chatMessages.id, messageId));
  await audit(user.id, "delete", "chat_message", messageId, `Mensagem excluída do FORTE CHAT (${msg.direction === "OUT" ? "enviada" : "recebida"})`, { body: msg.body?.slice(0, 500) });
}

// ───────────── Tarefas agendadas ─────────────
const taskSchema = z.object({
  title: z.string().trim().min(2, "Informe o nome da tarefa"), type: z.enum(TASK_TYPES.map((x) => x.key) as [ChatTaskType, ...ChatTaskType[]]),
  runAt: z.string().min(1, "Informe data e horário").transform((v) => new Date(v)), description: z.string().optional().nullable().transform((v) => v?.trim() || null),
  recurrence: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).default("NONE"), assigneeId: z.string().optional().nullable(), mediaId: z.string().optional().nullable().transform((v) => v || null),
  conversationId: z.string().optional().nullable().transform((v) => v || null), contact: z.string().optional().nullable(), // "lead:ID" | "cliente:ID"
});

async function resolveTaskInput(user: SessionUser, fd: FormData) {
  const p = taskSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) throw new Error(p.error.issues[0].message);
  const d = p.data;
  let conversationId = d.conversationId, leadId: string | null = null, clientId: string | null = null, hasPhone = false, ownerId: string | null = null;
  if (conversationId) {
    const conv = await assertConversationAccess(user, conversationId);
    leadId = conv.leadId; clientId = conv.clientId; hasPhone = true; ownerId = conv.assigneeId;
  } else if (d.contact) {
    const [kind, id] = d.contact.split(":") as ["lead" | "cliente", string];
    const c = await contactPhone(user, kind, id);
    leadId = c.leadId; clientId = c.clientId; ownerId = c.ownerId;
    const waId = toWaId(c.phone);
    if (waId.length >= 10) { hasPhone = true; if (isSendType(d.type)) conversationId = (await upsertConversation(waId, { leadId, clientId, assigneeId: c.ownerId ?? user.id })).id; else conversationId = (await findConversationByPhone(waId))?.id ?? null; }
  }
  const assigneeId = can(user.role, "chat.viewAll") ? d.assigneeId || ownerId || user.id : user.id;
  if (d.mediaId && !(await canUseMedia(user, d.mediaId))) throw new Error("Arquivo sem permissão de uso.");
  const input = { title: d.title, type: d.type, runAt: d.runAt, description: d.description, recurrence: d.recurrence, conversationId, leadId, clientId, assigneeId, mediaId: d.type === "ENVIAR_MENSAGEM" ? null : d.mediaId };
  validateTaskInput(input, { hasPhone });
  return input;
}

async function taskFor(user: SessionUser, id: string) {
  const task = await db.query.chatScheduledTasks.findFirst({ where: eq(t.chatScheduledTasks.id, id) });
  if (!task) throw new Error("Tarefa não encontrada.");
  if (!can(user.role, "chat.viewAll") && task.assigneeId !== user.id && task.createdById !== user.id) throw new Error("Acesso negado a esta tarefa.");
  return task;
}

export async function createScheduledTask(fd: FormData) {
  const user = await requirePermission("chat.view");
  const input = await resolveTaskInput(user, fd);
  const task = await createChatTask(input, user.id);
  await audit(user.id, "create", "chat_task", task.id, `Tarefa agendada: ${task.title}`);
  reval();
  return task.id;
}
export async function updateScheduledTask(id: string, fd: FormData) {
  const user = await requirePermission("chat.view");
  const task = await taskFor(user, id);
  const input = await resolveTaskInput(user, fd);
  await updateChatTask(task, input);
  await audit(user.id, "update", "chat_task", id, `Tarefa editada: ${input.title}`);
  reval();
}
export async function cancelScheduledTask(id: string) {
  const user = await requirePermission("chat.view");
  await cancelChatTask(await taskFor(user, id), user.id);
  await audit(user.id, "cancel", "chat_task", id, "Tarefa cancelada");
  reval();
}
export async function completeScheduledTask(id: string, note?: string | null) {
  const user = await requirePermission("chat.view");
  await completeChatTask(await taskFor(user, id), user.id, note);
  reval();
}
export async function sendScheduledTaskNow(id: string) {
  const user = await requirePermission("chat.view");
  await taskFor(user, id);
  const r = await sendTaskNow(id, user.id);
  reval();
  return r;
}

// ───────────── Painel do contato (3ª coluna) ─────────────
export async function getContactPanel(conversationId: string) {
  const user = await requirePermission("chat.view");
  const conv = await assertConversationAccess(user, conversationId);
  const now = new Date();
  const [lead, client] = await Promise.all([
    conv.leadId ? db.query.leads.findFirst({ where: eq(t.leads.id, conv.leadId), with: { stage: true, owner: { columns: { id: true, name: true } }, source: { columns: { name: true } } } }) : null,
    conv.clientId ? db.query.clients.findFirst({ where: eq(t.clients.id, conv.clientId), with: { owner: { columns: { id: true, name: true } } } }) : null,
  ]);
  const ref = [conv.leadId ? eq(t.interactions.leadId, conv.leadId) : undefined, conv.clientId ? eq(t.interactions.clientId, conv.clientId) : undefined].filter(Boolean);
  const apRef = [conv.leadId ? eq(t.appointments.leadId, conv.leadId) : undefined, conv.clientId ? eq(t.appointments.clientId, conv.clientId) : undefined].filter(Boolean);
  const [interactions, chatTasks, meetings, nextAppts] = await Promise.all([
    ref.length ? db.query.interactions.findMany({ where: or(...ref), orderBy: [desc(t.interactions.createdAt)], limit: 25, with: { user: { columns: { name: true } } } }) : [],
    db.query.chatScheduledTasks.findMany({ where: and(or(eq(t.chatScheduledTasks.conversationId, conv.id), conv.leadId ? eq(t.chatScheduledTasks.leadId, conv.leadId) : undefined, conv.clientId ? eq(t.chatScheduledTasks.clientId, conv.clientId) : undefined), inArray(t.chatScheduledTasks.status, ["AGENDADA", "EM_PROCESSAMENTO", "AGUARDANDO_ENVIO_MANUAL", "FALHOU"])), orderBy: [asc(t.chatScheduledTasks.runAt)], limit: 15, with: { assignee: { columns: { name: true } }, media: { columns: { id: true, fileName: true, kind: true, mimeType: true, durationSec: true, size: true } } } }),
    apRef.length ? db.query.appointments.findMany({ where: and(or(...apRef), lt(t.appointments.startAt, now)), orderBy: [desc(t.appointments.startAt)], limit: 5, with: { type: { columns: { name: true, color: true } } } }) : [],
    apRef.length ? db.query.appointments.findMany({ where: and(or(...apRef), gte(t.appointments.startAt, now), eq(t.appointments.status, "AGENDADO")), orderBy: [asc(t.appointments.startAt)], limit: 5, with: { type: { columns: { name: true, color: true } } } }) : [],
  ]);
  let finance = null;
  if (client && can(user.role, "finance.view")) {
    const inst = await db.select().from(t.installments).where(eq(t.installments.clientId, client.id));
    const pays = await db.select({ amount: t.payments.amount }).from(t.payments).where(eq(t.payments.clientId, client.id));
    const contract = await db.query.contracts.findFirst({ where: eq(t.contracts.clientId, client.id) });
    const paid = pays.reduce((s, p) => s + num(p.amount), 0);
    const open = inst.filter((i) => i.status !== "PAGO" && i.status !== "CANCELADO");
    finance = { contractValue: num(contract?.totalValue ?? client.contractValue), contractStatus: contract?.status ?? null, paid, openAmount: open.reduce((s, i) => s + num(i.amount), 0), overdue: inst.filter((i) => i.status === "ATRASADO" || (i.status !== "PAGO" && i.status !== "CANCELADO" && i.dueDate < now)).length, nextDue: open.sort((a, b) => +a.dueDate - +b.dueDate)[0]?.dueDate ?? null };
  }
  const [stages, lossReasons] = await Promise.all([db.select().from(t.pipelineStages).orderBy(asc(t.pipelineStages.order)), db.select().from(t.lossReasons).orderBy(asc(t.lossReasons.name))]);
  return JSON.parse(JSON.stringify({
    conv: { id: conv.id, waId: conv.waId, profileName: conv.profileName, createdAt: conv.createdAt },
    lead: lead ? { id: lead.id, name: lead.name, company: lead.company, phone: lead.phone, email: lead.email, value: num(lead.value), stage: lead.stage, owner: lead.owner, source: lead.source?.name ?? null, nextActivityAt: lead.nextActivityAt, segment: lead.segment } : null,
    client: client ? { id: client.id, name: client.name, company: client.company, phone: client.whatsapp ?? client.phone, email: client.email, status: client.status, owner: client.owner, contractValue: num(client.contractValue), service: client.service } : null,
    interactions: interactions.map((i) => ({ id: i.id, type: i.type, content: i.content, createdAt: i.createdAt, user: i.user?.name ?? null })),
    chatTasks, meetings, nextAppts, finance, stages, lossReasons,
    canMove: !!lead && can(user.role, "pipeline.manage") && (can(user.role, "pipeline.viewAll") || lead.ownerId === user.id),
    canOpenLead: can(user.role, "pipeline.view"), canOpenClient: can(user.role, "clients.view"),
  }));
}

// ───────────── Configurações ─────────────
export async function saveChatSettings(fd: FormData) {
  const user = await requirePermission("chat.manage");
  const cur = await getChatSettings();
  const next: ChatSettings = { ...cur, autoCreateLead: fd.get("autoCreateLead") === "on", unassignedVisibleToAll: fd.get("unassignedVisibleToAll") === "on", logMessagesInHistory: fd.get("logMessagesInHistory") === "on" };
  await setSetting("chat", next);
  await audit(user.id, "update", "settings", "chat", "Configurações do FORTE CHAT atualizadas", next);
  reval();
}
