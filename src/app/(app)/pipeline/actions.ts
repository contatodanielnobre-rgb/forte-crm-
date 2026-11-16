"use server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, t } from "@/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { moveLeadToStage, stageByFlag } from "@/lib/services/leads";
import { notify } from "@/lib/notify";

import { optStr, optEmail, optDate, money, intField, fd as toObj } from "@/lib/zod";
const leadSchema = z.object({
  name: z.string().min(2, "Informe o nome do lead"),
  company: optStr, phone: optStr, email: optEmail, segment: optStr,
  value: money, sourceId: optStr, ownerId: optStr, stageId: optStr, nextActivityAt: optDate, notes: optStr,
});

async function assertLeadAccess(leadId: string) {
  const user = await requirePermission("pipeline.manage");
  const lead = await db.query.leads.findFirst({ where: eq(t.leads.id, leadId) });
  if (!lead) throw new Error("Lead não encontrado.");
  if (!can(user.role, "pipeline.viewAll") && lead.ownerId !== user.id) throw new Error("Você só pode alterar seus próprios leads.");
  return { user, lead };
}
const revalidate = () => { revalidatePath("/pipeline"); revalidatePath("/dashboard"); revalidatePath("/ranking"); };

export async function createLead(fd: FormData) {
  const user = await requirePermission("pipeline.manage");
  const p = leadSchema.safeParse(toObj(fd));
  if (!p.success) throw new Error(p.error.issues[0].message);
  const d = p.data;
  const stageId = d.stageId ?? (await stageByFlag("isDefault"))?.id;
  if (!stageId) throw new Error("Nenhuma etapa padrão configurada.");
  const ownerId = can(user.role, "pipeline.viewAll") ? d.ownerId ?? user.id : user.id;
  const [lead] = await db.insert(t.leads).values({ ...d, value: d.value.toFixed(2), stageId, ownerId }).returning();
  await db.insert(t.interactions).values({ leadId: lead.id, userId: user.id, type: "sistema", content: "Lead cadastrado." });
  await audit(user.id, "create", "lead", lead.id, `Lead ${lead.name} cadastrado`);
  if (ownerId !== user.id) await notify([ownerId], "Novo lead atribuído a você", lead.name, "/pipeline");
  revalidate();
  return lead.id;
}

export async function updateLead(leadId: string, fd: FormData) {
  const { user, lead } = await assertLeadAccess(leadId);
  const p = leadSchema.safeParse(toObj(fd));
  if (!p.success) throw new Error(p.error.issues[0].message);
  const d = p.data;
  const ownerId = can(user.role, "pipeline.viewAll") ? d.ownerId ?? lead.ownerId : lead.ownerId;
  const { stageId: _s, ...rest } = d; void _s;
  await db.update(t.leads).set({ ...rest, value: d.value.toFixed(2), ownerId }).where(eq(t.leads.id, leadId));
  await audit(user.id, "update", "lead", leadId, `Lead ${d.name} atualizado`);
  if (d.stageId && d.stageId !== lead.stageId) await moveLeadToStage(leadId, d.stageId, user.id);
  if (ownerId && ownerId !== lead.ownerId) await notify([ownerId], "Lead atribuído a você", d.name, "/pipeline");
  revalidate();
}

export async function moveLead(leadId: string, stageId: string, lossReasonId?: string | null, note?: string | null) {
  const { user } = await assertLeadAccess(leadId);
  const res = await moveLeadToStage(leadId, stageId, user.id, { lossReasonId, note });
  revalidate(); revalidatePath("/clientes"); revalidatePath("/jornada");
  return res;
}

export async function archiveLead(leadId: string) {
  const { user, lead } = await assertLeadAccess(leadId);
  await db.update(t.leads).set({ archived: true }).where(eq(t.leads.id, leadId));
  await audit(user.id, "archive", "lead", leadId, `Lead ${lead.name} arquivado`);
  revalidate();
}
export async function deleteLead(leadId: string) {
  const { user, lead } = await assertLeadAccess(leadId);
  const client = await db.query.clients.findFirst({ where: eq(t.clients.leadId, leadId) });
  if (client) throw new Error("Este lead já virou cliente. Arquive-o em vez de excluir.");
  await db.delete(t.leads).where(eq(t.leads.id, leadId));
  await audit(user.id, "delete", "lead", leadId, `Lead ${lead.name} excluído`);
  revalidate();
}

export async function addInteraction(leadId: string, fd: FormData) {
  const { user } = await assertLeadAccess(leadId);
  const type = String(fd.get("type") || "nota"); const content = String(fd.get("content") || "").trim();
  if (!content) throw new Error("Escreva o conteúdo do registro.");
  await db.insert(t.interactions).values({ leadId, userId: user.id, type, content });
  await db.update(t.leads).set({ lastContactAt: new Date() }).where(eq(t.leads.id, leadId));
  revalidate();
}

export async function scheduleActivity(leadId: string, fd: FormData) {
  const { user, lead } = await assertLeadAccess(leadId);
  const p = z.object({ title: z.string().min(2), startAt: z.string().min(1).transform((v) => new Date(v)), durationMin: intField(60), typeId: optStr, link: optStr, description: optStr }).safeParse(toObj(fd));
  if (!p.success) throw new Error("Preencha título e data.");
  await db.insert(t.appointments).values({ ...p.data, leadId, ownerId: lead.ownerId ?? user.id });
  await db.update(t.leads).set({ nextActivityAt: p.data.startAt }).where(eq(t.leads.id, leadId));
  await db.insert(t.interactions).values({ leadId, userId: user.id, type: "sistema", content: `Atividade agendada: ${p.data.title}` });
  // Move automaticamente para "Reunião Agendada" se estiver em etapa anterior
  const type = p.data.typeId ? await db.query.appointmentTypes.findFirst({ where: eq(t.appointmentTypes.id, p.data.typeId) }) : null;
  if (type?.isCommercial) {
    const target = await db.query.pipelineStages.findFirst({ where: eq(t.pipelineStages.name, "Reunião Agendada") });
    const cur = await db.query.pipelineStages.findFirst({ where: eq(t.pipelineStages.id, lead.stageId) });
    if (target && cur && cur.order < target.order) await moveLeadToStage(leadId, target.id, user.id, { note: "automático ao agendar reunião" });
  }
  revalidate(); revalidatePath("/agenda");
}

export async function listLeadDetail(leadId: string) {
  const user = await requirePermission("pipeline.view");
  const lead = await db.query.leads.findFirst({
    where: can(user.role, "pipeline.viewAll") ? eq(t.leads.id, leadId) : and(eq(t.leads.id, leadId), eq(t.leads.ownerId, user.id)),
    with: { owner: { columns: { id: true, name: true, avatarUrl: true } }, source: { columns: { name: true } }, lossReason: { columns: { name: true } }, interactions: { with: { user: { columns: { name: true } } }, orderBy: (i, { desc }) => [desc(i.createdAt)] }, appointments: { orderBy: (a, { desc }) => [desc(a.startAt)], with: { type: true } }, client: { columns: { id: true } }, tasks: { orderBy: (x, { desc }) => [desc(x.createdAt)], with: { assignee: { columns: { name: true } } } } },
  });
  return lead ?? null;
}
