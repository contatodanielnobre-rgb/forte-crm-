"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, t } from "@/db";
import { requireUser, requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { setAppointmentStatus } from "@/lib/services/appointments";
import { optStr, intField, fd as toObj } from "@/lib/zod";

const reval = (clientId?: string | null) => { ["/agenda", "/reunioes", "/dashboard", "/ranking", "/pipeline", "/jornada"].forEach((p) => revalidatePath(p)); if (clientId) revalidatePath(`/clientes/${clientId}`); };

async function assertAppt(id: string) {
  const user = await requireUser();
  const ap = await db.query.appointments.findFirst({ where: eq(t.appointments.id, id) });
  if (!ap) throw new Error("Compromisso não encontrado.");
  if (!can(user.role, "clients.viewAll") && ap.ownerId !== user.id) throw new Error("Você só pode alterar seus próprios compromissos.");
  return { user, ap };
}

const schema = z.object({ title: z.string().min(2, "Informe o título"), startAt: z.string().min(1, "Informe a data").transform((v) => new Date(v)), durationMin: intField(60), typeId: optStr, link: optStr, description: optStr, ownerId: optStr, clientId: optStr, leadId: optStr });

export async function createAppointment(fd: FormData) {
  const user = await requirePermission("agenda.view");
  const p = schema.safeParse(toObj(fd)); if (!p.success) throw new Error(p.error.issues[0].message);
  const ownerId = can(user.role, "clients.viewAll") ? p.data.ownerId ?? user.id : user.id;
  const [ap] = await db.insert(t.appointments).values({ ...p.data, ownerId }).returning();
  if (ownerId !== user.id) await notify([ownerId], "Novo compromisso atribuído", `${ap.title} — ${ap.startAt.toLocaleString("pt-BR")}`, "/agenda");
  await audit(user.id, "create", "appointment", ap.id, `Compromisso "${ap.title}" criado`);
  reval(ap.clientId);
}
export async function updateAppointment(id: string, fd: FormData) {
  const { user, ap } = await assertAppt(id);
  const p = schema.safeParse(toObj(fd)); if (!p.success) throw new Error(p.error.issues[0].message);
  const ownerId = can(user.role, "clients.viewAll") ? p.data.ownerId ?? ap.ownerId : ap.ownerId;
  await db.update(t.appointments).set({ ...p.data, ownerId }).where(eq(t.appointments.id, id));
  await audit(user.id, "update", "appointment", id, `Compromisso "${p.data.title}" atualizado`);
  reval(ap.clientId);
}
export async function deleteAppointment(id: string) {
  const { user, ap } = await assertAppt(id);
  await db.delete(t.appointments).where(eq(t.appointments.id, id));
  await audit(user.id, "delete", "appointment", id, `Compromisso "${ap.title}" excluído`);
  reval(ap.clientId);
}
export async function changeAppointmentStatus(id: string, status: "AGENDADO" | "REALIZADO" | "CANCELADO" | "NAO_COMPARECEU") {
  const { user, ap } = await assertAppt(id);
  await setAppointmentStatus(id, status, user.id);
  reval(ap.clientId);
}

/** Ata da reunião + tarefas geradas. */
export async function saveMinutes(appointmentId: string, fd: FormData) {
  const { user, ap } = await assertAppt(appointmentId);
  const o = toObj(fd);
  const existing = await db.query.meetings.findFirst({ where: eq(t.meetings.appointmentId, appointmentId) });
  const vals = { participants: o.participants || null, agenda: o.agenda || null, decisions: o.decisions || null, notes: o.notes || null, clientId: ap.clientId };
  let meetingId = existing?.id;
  if (existing) await db.update(t.meetings).set(vals).where(eq(t.meetings.id, existing.id)); else { const [m] = await db.insert(t.meetings).values({ appointmentId, ...vals }).returning(); meetingId = m.id; }
  if (ap.status !== "REALIZADO") await setAppointmentStatus(appointmentId, "REALIZADO", user.id);
  // tarefas: linhas "título | responsávelId | yyyy-mm-dd"
  const rows: { title: string; assigneeId: string | null; dueAt: Date | null }[] = [];
  for (let i = 0; i < 8; i++) if (o[`task${i}`]?.trim()) rows.push({ title: o[`task${i}`].trim(), assigneeId: o[`assignee${i}`] || null, dueAt: o[`due${i}`] ? new Date(o[`due${i}`]) : null });
  if (rows.length) {
    await db.insert(t.tasks).values(rows.map((r) => ({ ...r, clientId: ap.clientId, meetingId })));
    for (const r of rows) if (r.assigneeId && r.assigneeId !== user.id) await notify([r.assigneeId], "Nova tarefa da reunião", r.title, ap.clientId ? `/clientes/${ap.clientId}?aba=tarefas` : "/reunioes");
  }
  if (ap.clientId) await db.insert(t.interactions).values({ clientId: ap.clientId, userId: user.id, type: "reuniao", content: `Ata registrada: ${ap.title}${o.decisions ? ` — Decisões: ${o.decisions.slice(0, 200)}` : ""}` });
  await audit(user.id, "update", "meeting", appointmentId, `Ata registrada para "${ap.title}"`);
  reval(ap.clientId);
}
export async function setTaskStatus(taskId: string, status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA") {
  const user = await requireUser();
  const task = await db.query.tasks.findFirst({ where: eq(t.tasks.id, taskId) });
  if (!task) throw new Error("Tarefa não encontrada.");
  if (!can(user.role, "clients.viewAll") && task.assigneeId !== user.id) throw new Error("Acesso negado.");
  await db.update(t.tasks).set({ status, completedAt: status === "CONCLUIDA" ? new Date() : null }).where(eq(t.tasks.id, taskId));
  reval(task.clientId);
}
