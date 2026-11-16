"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, t } from "@/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { fd as toObj, intField } from "@/lib/zod";
import { analyzeOperation, syncFindings } from "@/lib/salescop/analysis";
import { generateDailyPlan, approvePlan as approvePlanSvc, rejectPlan as rejectPlanSvc } from "@/lib/salescop/plan";
import { saveAiReport, buildAiReport, type AiReportKind } from "@/lib/salescop/reports";
import { askSalesCop, narrate } from "@/lib/salescop/ai";
import { runRoutine } from "@/lib/salescop/routine";
import { getSalesCopSettings, saveSalesCopSettings, ROUTINE_STEPS, HEALTH_CRITERIA, type SalesCopSettings, type RoutineStepKey, type AutonomyMode } from "@/lib/salescop/settings";
import { sendWhatsAppText } from "@/lib/salescop/whatsapp";
import { logExecution } from "@/lib/salescop/log";

const reval = () => ["/sales-cop", "/sales-cop/plano", "/sales-cop/fiscalizacao", "/sales-cop/equipe", "/sales-cop/gargalos", "/sales-cop/relatorios", "/sales-cop/configuracoes", "/dashboard", "/pipeline", "/agenda"].forEach((p) => revalidatePath(p));

// ── Análise / fiscalização ──
export async function runInspection() {
  const user = await requirePermission("salescop.manage");
  const snap = await analyzeOperation();
  const r = await syncFindings(snap.findings);
  await logExecution({ kind: "acao", action: "inspection", summary: `Fiscalização manual: ${snap.findings.length} pendências (${r.resolved} resolvidas).`, actorId: user.id });
  reval();
  return { findings: snap.findings.length, resolved: r.resolved, health: snap.health.score };
}
export async function setFindingStatus(id: string, status: "RESOLVIDO" | "IGNORADO" | "ABERTO") {
  const user = await requirePermission("salescop.view");
  const f = await db.query.aiFindings.findFirst({ where: eq(t.aiFindings.id, id) });
  if (!f) throw new Error("Registro não encontrado.");
  if (!can(user.role, "salescop.manage") && f.userId !== user.id) throw new Error("Você só pode tratar as próprias pendências.");
  await db.update(t.aiFindings).set({ status, resolvedAt: status === "ABERTO" ? null : new Date(), resolvedById: status === "ABERTO" ? null : user.id }).where(eq(t.aiFindings.id, id));
  await audit(user.id, "update", "ai_finding", id, `Irregularidade "${f.title}" marcada como ${status}`);
  reval();
}
export async function confirmAppointment(id: string) {
  const user = await requirePermission("agenda.view");
  const a = await db.query.appointments.findFirst({ where: eq(t.appointments.id, id) });
  if (!a) throw new Error("Reunião não encontrada.");
  if (!can(user.role, "pipeline.viewAll") && a.ownerId !== user.id) throw new Error("Você só pode confirmar as próprias reuniões.");
  await db.update(t.appointments).set({ confirmedAt: new Date() }).where(eq(t.appointments.id, id));
  await db.update(t.aiFindings).set({ status: "RESOLVIDO", resolvedAt: new Date(), resolvedById: user.id }).where(and(eq(t.aiFindings.appointmentId, id), eq(t.aiFindings.ruleKey, "REUNIAO")));
  await audit(user.id, "update", "appointment", id, `Reunião "${a.title}" confirmada`);
  reval();
}

// ── Plano de ação ──
export async function generatePlan(force = false) {
  const user = await requirePermission("salescop.manage");
  await generateDailyPlan({ actorId: user.id, force, via: "manual" });
  reval();
}
export async function approvePlan(planId: string) {
  const user = await requirePermission("salescop.manage");
  const n = await approvePlanSvc(planId, user.id);
  reval();
  return n;
}
export async function rejectPlan(planId: string) {
  const user = await requirePermission("salescop.manage");
  await rejectPlanSvc(planId, user.id);
  reval();
}
export async function updatePlanItem(itemId: string, fd: FormData) {
  const user = await requirePermission("salescop.manage");
  const o = toObj(fd);
  const patch: Partial<typeof t.aiPlanItems.$inferInsert> = {};
  if (o.priority) patch.priority = o.priority as "URGENTE" | "ALTA" | "MEDIA" | "BAIXA";
  if (o.assigneeId !== undefined) patch.assigneeId = o.assigneeId || null;
  if (o.title) patch.title = o.title.slice(0, 200);
  if (o.recommendedTime !== undefined) patch.recommendedTime = o.recommendedTime || null;
  if (o.dueAt) patch.dueAt = new Date(o.dueAt);
  await db.update(t.aiPlanItems).set(patch).where(eq(t.aiPlanItems.id, itemId));
  const item = await db.query.aiPlanItems.findFirst({ where: eq(t.aiPlanItems.id, itemId) });
  if (item?.taskId) await db.update(t.tasks).set({ title: item.title, priority: item.priority, assigneeId: item.assigneeId, dueAt: item.dueAt }).where(eq(t.tasks.id, item.taskId));
  await audit(user.id, "update", "ai_plan_item", itemId, `Item do plano ajustado`);
  reval();
}
export async function rejectPlanItem(itemId: string) {
  const user = await requirePermission("salescop.manage");
  const item = await db.query.aiPlanItems.findFirst({ where: eq(t.aiPlanItems.id, itemId) });
  if (!item) throw new Error("Item não encontrado.");
  if (item.taskId) await db.delete(t.tasks).where(and(eq(t.tasks.id, item.taskId), eq(t.tasks.source, "salescop")));
  await db.update(t.aiPlanItems).set({ status: "REJEITADO", taskId: null }).where(eq(t.aiPlanItems.id, itemId));
  await audit(user.id, "reject", "ai_plan_item", itemId, `Recomendação rejeitada: ${item.title}`);
  reval();
}
export async function restorePlanItem(itemId: string) {
  await requirePermission("salescop.manage");
  await db.update(t.aiPlanItems).set({ status: "PENDENTE" }).where(eq(t.aiPlanItems.id, itemId));
  reval();
}
export async function completePlanItem(itemId: string, done = true) {
  const user = await requirePermission("salescop.view");
  const item = await db.query.aiPlanItems.findFirst({ where: eq(t.aiPlanItems.id, itemId) });
  if (!item) throw new Error("Item não encontrado.");
  if (!can(user.role, "salescop.manage") && item.assigneeId !== user.id) throw new Error("Você só pode concluir as próprias atividades.");
  await db.update(t.aiPlanItems).set({ status: done ? "CONCLUIDO" : item.taskId ? "APROVADO" : "PENDENTE" }).where(eq(t.aiPlanItems.id, itemId));
  if (item.taskId) await db.update(t.tasks).set({ status: done ? "CONCLUIDA" : "PENDENTE", completedAt: done ? new Date() : null }).where(eq(t.tasks.id, item.taskId));
  await audit(user.id, "update", "ai_plan_item", itemId, `${item.title}: ${done ? "concluída" : "reaberta"}`);
  reval();
}
export async function addPlanItem(planId: string, fd: FormData) {
  const user = await requirePermission("salescop.manage");
  const o = toObj(fd);
  if (!o.title?.trim()) throw new Error("Informe a atividade.");
  const plan = await db.query.aiActionPlans.findFirst({ where: eq(t.aiActionPlans.id, planId), with: { items: { columns: { order: true } } } });
  if (!plan) throw new Error("Plano não encontrado.");
  const order = Math.max(0, ...plan.items.map((i) => i.order)) + 1;
  const [item] = await db.insert(t.aiPlanItems).values({ planId, order, title: o.title.trim(), description: o.description || null, justification: "Adicionada manualmente pelo gestor.", priority: (o.priority as "URGENTE" | "ALTA" | "MEDIA" | "BAIXA") || "MEDIA", recommendedTime: o.recommendedTime || null, dueAt: o.dueAt ? new Date(o.dueAt) : null, assigneeId: o.assigneeId || null, leadId: o.leadId || null, status: plan.status === "APROVADO" ? "APROVADO" : "PENDENTE" }).returning();
  if (plan.status === "APROVADO") {
    const settings = await getSalesCopSettings();
    if (settings.mode !== "OBSERVADOR") { const [task] = await db.insert(t.tasks).values({ title: item.title, description: item.description, dueAt: item.dueAt, assigneeId: item.assigneeId ?? user.id, leadId: item.leadId, priority: item.priority, source: "salescop", planItemId: item.id }).returning(); await db.update(t.aiPlanItems).set({ taskId: task.id }).where(eq(t.aiPlanItems.id, item.id)); if (item.assigneeId) await notify([item.assigneeId], "SALES COP AI: nova atividade", item.title, "/sales-cop/plano"); }
  }
  reval();
}

// ── Relatórios ──
export async function generateReport(kind: AiReportKind, userId?: string | null, withAi = true) {
  const user = await requirePermission("salescop.view");
  const scopedUser = can(user.role, "salescop.manage") ? userId ?? null : user.id;
  if (kind !== "vendedor" && !can(user.role, "salescop.manage")) throw new Error("Sem permissão para relatórios da equipe.");
  let narrative: string | null = null;
  if (withAi) {
    const r = await buildAiReport(kind, { userId: kind === "vendedor" ? scopedUser : null });
    narrative = await narrate(`Escreva a análise do SALES COP para o "${r.title}" em até 10 linhas, em tópicos: o que está funcionando, o que está errado, quem precisa de atenção, oportunidades de melhoria e as recomendações prioritárias. Diferencie fatos de hipóteses. Use somente os dados fornecidos.`, r.content, user.id);
  }
  const row = await saveAiReport(kind, { userId: kind === "vendedor" ? scopedUser : null, narrative, generatedBy: narrative ? "ia" : "regras", actorId: user.id });
  reval();
  return row.id;
}

// ── Chat com o agente ──
export async function askAgent(question: string, history: { role: "user" | "assistant"; content: string }[] = []) {
  const user = await requirePermission("salescop.view");
  const q = question.trim().slice(0, 2000);
  if (!q) throw new Error("Escreva a pergunta.");
  const res = await askSalesCop({ question: q, actor: { id: user.id, name: user.name, role: user.role }, channel: "web", history });
  reval();
  return res;
}

// ── Rotina ──
export async function runRoutineStep(step?: RoutineStepKey) {
  const user = await requirePermission("salescop.manage");
  const r = await runRoutine({ step, force: true, actorId: user.id });
  reval();
  return r;
}

// ── Configurações ──
export async function saveAgentSettings(fd: FormData) {
  const user = await requirePermission("salescop.settings");
  const o = toObj(fd);
  const current = await getSalesCopSettings();
  const n = (k: string, def: number) => intField(def).parse(o[k]);
  const b = (k: string) => o[k] === "on" || o[k] === "true";
  const stageMaxDaysByStage: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) if (k.startsWith("stage_days_") && v !== "") stageMaxDaysByStage[k.slice(11)] = intField(current.rules.stageMaxDays).parse(v);
  const patch: Partial<SalesCopSettings> = {
    mode: (["OBSERVADOR", "OPERACIONAL", "AUTONOMO"].includes(o.mode) ? o.mode : current.mode) as AutonomyMode,
    rules: { firstContactHours: n("firstContactHours", 2), followUpMaxDays: n("followUpMaxDays", 2), stageMaxDays: n("stageMaxDays", 7), stageMaxDaysByStage, meetingConfirmHours: n("meetingConfirmHours", 24), proposalMaxDays: n("proposalMaxDays", 3), sellerInactivityDays: n("sellerInactivityDays", 1), stalledLeadDays: n("stalledLeadDays", 5), riskValueMin: n("riskValueMin", 0) },
    stageMap: { qualified: o.stage_qualified || null, meetingScheduled: o.stage_meetingScheduled || null, meetingDone: o.stage_meetingDone || null, proposal: o.stage_proposal || null, negotiation: o.stage_negotiation || null },
    health: { weights: Object.fromEntries(HEALTH_CRITERIA.map((c) => [c.key, n(`w_${c.key}`, current.health.weights[c.key])])) as SalesCopSettings["health"]["weights"], greenFrom: n("greenFrom", 75), yellowFrom: n("yellowFrom", 50), conversionGoalPct: n("conversionGoalPct", 15) },
    goals: { dailyContacts: n("dailyContacts", 20), dailyFollowUps: n("dailyFollowUps", 10) },
    routine: { enabled: b("routineEnabled"), weekdaysOnly: b("weekdaysOnly"), steps: Object.fromEntries(ROUTINE_STEPS.map((s) => [s.key, { time: /^\d{2}:\d{2}$/.test(o[`time_${s.key}`] ?? "") ? o[`time_${s.key}`] : s.defaultTime, enabled: b(`step_${s.key}`) }])) as SalesCopSettings["routine"]["steps"] },
    ai: { enabled: b("aiEnabled"), model: (o.aiModel || current.ai.model).trim(), maxDailyCalls: n("maxDailyCalls", 200), temperature: Math.max(0, Math.min(1, Number(o.temperature ?? current.ai.temperature) || 0)) },
    whatsapp: { enabled: b("waEnabled"), notifyAdmins: b("waNotifyAdmins"), notifySellers: b("waNotifySellers"), adminPhones: (o.adminPhones ?? "").trim(), dailyPlanTime: o.dailyPlanTime || current.whatsapp.dailyPlanTime },
  };
  await saveSalesCopSettings(patch);
  await audit(user.id, "update", "settings", "salescop", `Configurações do SALES COP AI atualizadas (modo ${patch.mode})`);
  reval();
}
export async function sendTestWhatsApp() {
  const user = await requirePermission("salescop.settings");
  const r = await sendWhatsAppText({ userId: user.id, text: `SALES COP AI: teste de integração realizado com sucesso por ${user.name}.`, actorId: user.id, kind: "teste" });
  if (r.status !== "OK") throw new Error(r.reason ?? "Falha no envio.");
  reval();
}
