import "server-only";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { addDays, addMonths, addWeeks, format } from "date-fns";
import { db, t } from "@/db";
import { createId } from "@/lib/id";
import { notify } from "@/lib/notify";
import { moveLeadToStage } from "@/lib/services/leads";
import { sendChatMessage, WindowClosedError } from "./messages";
import { WhatsAppApiError, WhatsAppNotConfigured } from "./cloud-api";
import { logInteraction } from "./core";

export type ChatTaskType = (typeof t.chatTaskTypeEnum.enumValues)[number];
export type ChatTaskStatus = (typeof t.chatTaskStatusEnum.enumValues)[number];
export const TASK_TYPES: { key: ChatTaskType; label: string; send: boolean }[] = [
  { key: "ENVIAR_MENSAGEM", label: "Enviar mensagem", send: true },
  { key: "ENVIAR_AUDIO", label: "Enviar áudio", send: true },
  { key: "ENVIAR_DOCUMENTO", label: "Enviar documento", send: true },
  { key: "ENVIAR_IMAGEM", label: "Enviar imagem", send: true },
  { key: "LIGACAO", label: "Fazer ligação", send: false },
  { key: "FOLLOW_UP", label: "Realizar follow-up", send: false },
  { key: "REUNIAO", label: "Agendar reunião", send: false },
  { key: "RETORNAR_CONTATO", label: "Retornar contato", send: false },
  { key: "OUTRA", label: "Outra atividade", send: false },
];
export const TASK_STATUS_LABEL: Record<ChatTaskStatus, string> = { AGENDADA: "Agendada", EM_PROCESSAMENTO: "Em processamento", ENVIADA: "Enviada", FALHOU: "Falhou", CANCELADA: "Cancelada", CONCLUIDA: "Concluída", AGUARDANDO_ENVIO_MANUAL: "Aguardando envio manual" };
export const SEND_TYPES = TASK_TYPES.filter((x) => x.send).map((x) => x.key);
export const isSendType = (k: ChatTaskType) => SEND_TYPES.includes(k);
const typeLabel = (k: ChatTaskType) => TASK_TYPES.find((x) => x.key === k)?.label ?? k;
const DONE_LABEL: Partial<Record<ChatTaskType, string>> = { LIGACAO: "Ligação realizada", FOLLOW_UP: "Follow-up realizado", REUNIAO: "Reunião concluída", RETORNAR_CONTATO: "Contato retornado", OUTRA: "Atividade concluída" };
const SENT_LABEL: Partial<Record<ChatTaskType, string>> = { ENVIAR_MENSAGEM: "Mensagem agendada enviada", ENVIAR_AUDIO: "Áudio agendado enviado", ENVIAR_DOCUMENTO: "Documento agendado enviado", ENVIAR_IMAGEM: "Imagem agendada enviada" };

type Task = typeof t.chatScheduledTasks.$inferSelect;
export type TaskInput = {
  title: string; type: ChatTaskType; runAt: Date; description?: string | null; recurrence?: string;
  conversationId?: string | null; leadId?: string | null; clientId?: string | null; assigneeId: string; mediaId?: string | null;
};

export function validateTaskInput(i: TaskInput, opts: { hasPhone: boolean }) {
  if (!i.title || i.title.trim().length < 2) throw new Error("Informe o nome da tarefa.");
  if (!(i.runAt instanceof Date) || Number.isNaN(+i.runAt)) throw new Error("Informe data e horário válidos.");
  if (!i.conversationId && !i.leadId && !i.clientId) throw new Error("Selecione o contato relacionado.");
  if (isSendType(i.type)) {
    if (!opts.hasPhone) throw new Error("O contato não tem telefone/WhatsApp cadastrado para envio.");
    if (i.type === "ENVIAR_MENSAGEM" && !i.description?.trim()) throw new Error("Escreva a mensagem que será enviada.");
    if (i.type !== "ENVIAR_MENSAGEM" && !i.mediaId) throw new Error(i.type === "ENVIAR_AUDIO" ? "Grave ou anexe o áudio." : "Anexe o arquivo que será enviado.");
    if (+i.runAt < Date.now() - 60_000) throw new Error("A data/horário do envio já passou.");
  }
  if (!["NONE", "DAILY", "WEEKLY", "MONTHLY"].includes(i.recurrence ?? "NONE")) throw new Error("Recorrência inválida.");
}

export async function createChatTask(i: TaskInput, actorId: string) {
  const [task] = await db.insert(t.chatScheduledTasks).values({ ...i, title: i.title.trim(), recurrence: i.recurrence ?? "NONE", createdById: actorId }).returning();
  // espelho na tabela de tarefas (aparece no SALES COP, ficha do cliente e Minhas Tarefas)
  const [mirror] = await db.insert(t.tasks).values({ title: `${typeLabel(i.type)}: ${task.title}`, description: i.description ?? null, dueAt: i.runAt, assigneeId: i.assigneeId, leadId: i.leadId ?? null, clientId: i.clientId ?? null, source: "chat" }).returning();
  let appointmentId: string | null = null;
  if (i.type === "REUNIAO") appointmentId = await createMeeting(task, actorId);
  await db.update(t.chatScheduledTasks).set({ taskId: mirror.id, appointmentId }).where(eq(t.chatScheduledTasks.id, task.id));
  if (i.leadId) {
    const lead = await db.query.leads.findFirst({ where: eq(t.leads.id, i.leadId), columns: { nextActivityAt: true } });
    if (!lead?.nextActivityAt || lead.nextActivityAt < new Date() || lead.nextActivityAt > i.runAt) await db.update(t.leads).set({ nextActivityAt: i.runAt }).where(eq(t.leads.id, i.leadId));
  }
  await logInteraction({ leadId: i.leadId ?? null, clientId: i.clientId ?? null }, actorId, `Tarefa agendada no FORTE CHAT: ${typeLabel(i.type)} — ${task.title} (${format(i.runAt, "dd/MM/yyyy 'às' HH:mm")})`, "sistema").catch(() => {});
  if (i.assigneeId !== actorId) await notify([i.assigneeId], "Nova tarefa agendada para você", `${typeLabel(i.type)}: ${task.title} — ${format(i.runAt, "dd/MM HH:mm")}`, "/forte-chat/tarefas");
  return { ...task, taskId: mirror.id, appointmentId };
}

async function createMeeting(task: Task, actorId: string) {
  const types = await db.select().from(t.appointmentTypes);
  const type = (task.clientId ? types.find((x) => x.name === "Reunião semanal com cliente") : types.find((x) => x.isCommercial)) ?? types[0];
  const [ap] = await db.insert(t.appointments).values({ title: task.title, description: task.description, startAt: task.runAt, ownerId: task.assigneeId, leadId: task.leadId, clientId: task.clientId, typeId: type?.id ?? null }).returning();
  await logInteraction({ leadId: task.leadId, clientId: task.clientId }, actorId, `Reunião agendada: ${task.title} (${format(task.runAt, "dd/MM/yyyy 'às' HH:mm")})`, "reuniao").catch(() => {});
  // mesma automação do pipeline: reunião comercial agendada move o lead para "Reunião Agendada" se estiver antes
  if (type?.isCommercial && task.leadId) {
    const lead = await db.query.leads.findFirst({ where: eq(t.leads.id, task.leadId), with: { stage: true } });
    const target = await db.query.pipelineStages.findFirst({ where: eq(t.pipelineStages.name, "Reunião Agendada") });
    if (lead && target && lead.stage.order < target.order && !lead.stage.isWon && !lead.stage.isLost) await moveLeadToStage(lead.id, target.id, actorId, { note: "automático ao agendar reunião no FORTE CHAT" });
  }
  return ap.id;
}

export async function updateChatTask(task: Task, i: TaskInput) {
  if (!["AGENDADA", "AGUARDANDO_ENVIO_MANUAL", "FALHOU"].includes(task.status)) throw new Error("Só é possível editar tarefas que ainda não foram executadas.");
  await db.update(t.chatScheduledTasks).set({ ...i, title: i.title.trim(), status: "AGENDADA", nextAttemptAt: null, lastError: null, remindedAt: null }).where(eq(t.chatScheduledTasks.id, task.id));
  if (task.taskId) await db.update(t.tasks).set({ title: `${typeLabel(i.type)}: ${i.title.trim()}`, description: i.description ?? null, dueAt: i.runAt, assigneeId: i.assigneeId, status: "PENDENTE", completedAt: null }).where(eq(t.tasks.id, task.taskId));
  if (task.appointmentId) await db.update(t.appointments).set({ title: i.title.trim(), startAt: i.runAt, ownerId: i.assigneeId, description: i.description ?? null }).where(eq(t.appointments.id, task.appointmentId));
}

export async function cancelChatTask(task: Task, actorId: string) {
  const [u] = await db.update(t.chatScheduledTasks).set({ status: "CANCELADA", executedAt: new Date() }).where(and(eq(t.chatScheduledTasks.id, task.id), inArray(t.chatScheduledTasks.status, ["AGENDADA", "AGUARDANDO_ENVIO_MANUAL", "FALHOU"]))).returning();
  if (!u) throw new Error("Esta tarefa não pode mais ser cancelada (já executada ou em processamento).");
  if (task.taskId) await db.delete(t.tasks).where(eq(t.tasks.id, task.taskId));
  if (task.appointmentId) await db.update(t.appointments).set({ status: "CANCELADO" }).where(eq(t.appointments.id, task.appointmentId));
  await logInteraction({ leadId: task.leadId, clientId: task.clientId }, actorId, `Tarefa cancelada no FORTE CHAT: ${typeLabel(task.type)} — ${task.title}`, "sistema").catch(() => {});
}

/** Conclusão manual de atividades que não são envio (ligação, follow-up, reunião...). Também usada para registrar envio feito fora do sistema (fica CONCLUÍDA, nunca ENVIADA). */
export async function completeChatTask(task: Task, actorId: string, note?: string | null) {
  const [u] = await db.update(t.chatScheduledTasks).set({ status: "CONCLUIDA", executedAt: new Date(), lastError: note ?? task.lastError }).where(and(eq(t.chatScheduledTasks.id, task.id), inArray(t.chatScheduledTasks.status, ["AGENDADA", "AGUARDANDO_ENVIO_MANUAL", "FALHOU"]))).returning();
  if (!u) throw new Error("Esta tarefa já foi finalizada.");
  if (task.taskId) await db.update(t.tasks).set({ status: "CONCLUIDA", completedAt: new Date() }).where(eq(t.tasks.id, task.taskId));
  if (task.appointmentId) await db.update(t.appointments).set({ status: "REALIZADO" }).where(eq(t.appointments.id, task.appointmentId));
  const label = isSendType(task.type) ? `${typeLabel(task.type)} registrado como concluído fora do sistema` : DONE_LABEL[task.type] ?? "Atividade concluída";
  await logInteraction({ leadId: task.leadId, clientId: task.clientId }, actorId, `${label}: ${task.title}${note ? ` — ${note}` : ""}`, task.type === "LIGACAO" ? "ligacao" : task.type === "REUNIAO" ? "reuniao" : "sistema").catch(() => {});
  await spawnNext(u);
}

/** Próxima ocorrência de uma tarefa recorrente. */
async function spawnNext(task: Task) {
  if (task.recurrence === "NONE") return;
  const step = (d: Date) => (task.recurrence === "DAILY" ? addDays(d, 1) : task.recurrence === "WEEKLY" ? addWeeks(d, 1) : addMonths(d, 1));
  let next = step(task.runAt); while (next < new Date()) next = step(next);
  const exists = await db.query.chatScheduledTasks.findFirst({ where: eq(t.chatScheduledTasks.parentId, task.id), columns: { id: true } });
  if (exists) return;
  const created = await createChatTask({ title: task.title, type: task.type, runAt: next, description: task.description, recurrence: task.recurrence, conversationId: task.conversationId, leadId: task.leadId, clientId: task.clientId, assigneeId: task.assigneeId ?? task.createdById!, mediaId: task.mediaId }, task.createdById ?? task.assigneeId!);
  await db.update(t.chatScheduledTasks).set({ parentId: task.id }).where(eq(t.chatScheduledTasks.id, created.id));
}

/** Executa o envio de uma tarefa já travada (lockToken). Nunca marca ENVIADA sem o wamid da Meta. */
async function executeLocked(task: Task, lockToken: string, actorId: string | null) {
  const [attempt] = await db.insert(t.chatTaskAttempts).values({ taskId: task.id, status: "EM_ANDAMENTO", actorId }).returning();
  const attemptsNow = task.attempts + 1;
  const release = (patch: Partial<typeof t.chatScheduledTasks.$inferInsert>) => db.update(t.chatScheduledTasks).set({ ...patch, attempts: attemptsNow, lockToken: null, lockedAt: null }).where(and(eq(t.chatScheduledTasks.id, task.id), eq(t.chatScheduledTasks.lockToken, lockToken))).returning();
  try {
    const conv = task.conversationId ? await db.query.chatConversations.findFirst({ where: eq(t.chatConversations.id, task.conversationId) }) : null;
    if (!conv) throw new Error("Contato sem conversa/WhatsApp vinculado.");
    const res = await sendChatMessage({ conv, actorId: actorId ?? task.assigneeId, text: task.type === "ENVIAR_MENSAGEM" ? task.description : task.description || null, mediaId: task.type === "ENVIAR_MENSAGEM" ? null : task.mediaId, idempotencyKey: `task:${task.id}`, scheduledTaskId: task.id });
    await db.update(t.chatTaskAttempts).set({ status: "OK", detail: res.duplicate ? "Já enviada anteriormente (envio duplicado evitado)." : "Enviada pela Cloud API.", waMessageId: res.message.waMessageId, finishedAt: new Date() }).where(eq(t.chatTaskAttempts.id, attempt.id));
    const [u] = await release({ status: "ENVIADA", executedAt: new Date(), resultMessageId: res.message.id, lastError: null, nextAttemptAt: null });
    if (task.taskId) await db.update(t.tasks).set({ status: "CONCLUIDA", completedAt: new Date() }).where(eq(t.tasks.id, task.taskId));
    await logInteraction({ leadId: task.leadId, clientId: task.clientId }, actorId ?? task.assigneeId, `${SENT_LABEL[task.type] ?? "Envio agendado realizado"}: ${task.title}`, "whatsapp").catch(() => {});
    if (u) await spawnNext(u);
    return { ok: true as const, status: "ENVIADA" as const };
  } catch (e) {
    const msg = (e as Error).message;
    const permanent = e instanceof WindowClosedError || e instanceof WhatsAppNotConfigured || !(e instanceof WhatsAppApiError) || !e.transient;
    const manual = e instanceof WindowClosedError || e instanceof WhatsAppNotConfigured;
    await db.update(t.chatTaskAttempts).set({ status: manual ? "BLOQUEADO" : "ERRO", detail: msg, finishedAt: new Date() }).where(eq(t.chatTaskAttempts.id, attempt.id));
    let status: ChatTaskStatus;
    if (manual) status = "AGUARDANDO_ENVIO_MANUAL";
    else if (!permanent && attemptsNow < task.maxAttempts) status = "AGENDADA";
    else status = "FALHOU";
    const backoffMin = 5 * 2 ** (attemptsNow - 1); // 5, 10, 20 min
    await release({ status, lastError: msg, nextAttemptAt: status === "AGENDADA" ? new Date(Date.now() + backoffMin * 60_000) : null });
    if (status !== "AGENDADA" && task.assigneeId) await notify([task.assigneeId], status === "FALHOU" ? "Falha no envio agendado" : "Envio agendado precisa de ação manual", `${task.title}: ${msg}`, "/forte-chat/tarefas", "warning");
    return { ok: false as const, status, error: msg };
  }
}

/** Disparo manual (botão "Enviar agora" / "Tentar novamente"). */
export async function sendTaskNow(taskId: string, actorId: string) {
  const lockToken = createId(16);
  const [task] = await db.update(t.chatScheduledTasks).set({ status: "EM_PROCESSAMENTO", lockToken, lockedAt: new Date() })
    .where(and(eq(t.chatScheduledTasks.id, taskId), inArray(t.chatScheduledTasks.status, ["AGENDADA", "AGUARDANDO_ENVIO_MANUAL", "FALHOU"]), inArray(t.chatScheduledTasks.type, SEND_TYPES))).returning();
  if (!task) throw new Error("Esta tarefa não está disponível para envio (já enviada, cancelada ou em processamento).");
  // tentativa manual não consome o limite automático
  const r = await executeLocked({ ...task, attempts: Math.min(task.attempts, task.maxAttempts - 1) }, lockToken, actorId);
  if (!r.ok) throw new Error(r.error);
  return r;
}

/**
 * Processador do backend. Chamado por /api/chat/scheduler (cron) e oportunisticamente quando alguém usa o chat.
 * - trava atômica por linha (FOR UPDATE SKIP LOCKED) → duas execuções simultâneas nunca enviam a mesma tarefa;
 * - chave de idempotência por tarefa → nunca envia duas vezes;
 * - travas antigas (processo interrompido) são resolvidas sem reenviar às cegas.
 */
export async function processDueChatTasks(limit = 20) {
  const now = new Date();
  const out = { sent: 0, failed: 0, manual: 0, retried: 0, reminders: 0, recovered: 0 };

  // 1) travas órfãs (> 10 min)
  const stale = await db.select().from(t.chatScheduledTasks).where(and(eq(t.chatScheduledTasks.status, "EM_PROCESSAMENTO"), lte(t.chatScheduledTasks.lockedAt, new Date(+now - 10 * 60_000))));
  for (const s of stale) {
    const msg = await db.query.chatMessages.findFirst({ where: eq(t.chatMessages.idempotencyKey, `task:${s.id}`) });
    const patch = msg?.waMessageId ? { status: "ENVIADA" as const, resultMessageId: msg.id, executedAt: msg.sentAt ?? now } : msg ? { status: "FALHOU" as const, lastError: "Processamento interrompido durante o envio; confira a conversa antes de reenviar." } : { status: "AGENDADA" as const };
    await db.update(t.chatScheduledTasks).set({ ...patch, lockToken: null, lockedAt: null }).where(and(eq(t.chatScheduledTasks.id, s.id), eq(t.chatScheduledTasks.status, "EM_PROCESSAMENTO")));
    out.recovered++;
  }

  // 2) envios vencidos
  const lockToken = createId(16);
  const claimed = await db.execute<{ id: string }>(sql`
    update chat_scheduled_tasks set status = 'EM_PROCESSAMENTO', lock_token = ${lockToken}, locked_at = now()
    where id in (
      select id from chat_scheduled_tasks
      where status = 'AGENDADA' and type in ('ENVIAR_MENSAGEM','ENVIAR_AUDIO','ENVIAR_DOCUMENTO','ENVIAR_IMAGEM')
        and coalesce(next_attempt_at, run_at) <= now()
      order by run_at limit ${limit} for update skip locked
    ) returning id`);
  const ids = (claimed as unknown as { id: string }[]).map((r) => r.id);
  if (ids.length) {
    const tasks = await db.select().from(t.chatScheduledTasks).where(inArray(t.chatScheduledTasks.id, ids));
    for (const task of tasks) {
      const r = await executeLocked(task, lockToken, null);
      if (r.ok) out.sent++; else if (r.status === "AGENDADA") out.retried++; else if (r.status === "AGUARDANDO_ENVIO_MANUAL") out.manual++; else out.failed++;
    }
  }

  // 3) lembretes das atividades (ligação, follow-up, reunião...) no horário
  const due = await db.update(t.chatScheduledTasks).set({ remindedAt: now })
    .where(and(eq(t.chatScheduledTasks.status, "AGENDADA"), isNull(t.chatScheduledTasks.remindedAt), lte(t.chatScheduledTasks.runAt, new Date(+now + 10 * 60_000)), or(...TASK_TYPES.filter((x) => !x.send).map((x) => eq(t.chatScheduledTasks.type, x.key))))).returning();
  for (const d of due) { if (d.assigneeId) await notify([d.assigneeId], `Lembrete: ${typeLabel(d.type)}`, `${d.title} — ${format(d.runAt, "dd/MM HH:mm")}`, d.conversationId ? `/forte-chat?c=${d.conversationId}` : "/forte-chat/tarefas", "warning"); out.reminders++; }
  return out;
}

/** Throttle para o processamento oportunista (no máximo 1x a cada 30s por instância). */
let lastRun = 0;
export async function maybeProcess() {
  if (Date.now() - lastRun < 30_000) return;
  lastRun = Date.now();
  try { await processDueChatTasks(5); } catch (e) { console.error("chat scheduler", e); }
}
