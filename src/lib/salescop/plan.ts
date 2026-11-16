import { and, asc, eq, inArray } from "drizzle-orm";
import { endOfDay, format, setHours, setMinutes, startOfDay, addHours } from "date-fns";
import { db, t } from "@/db";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { analyzeOperation, syncFindings, type Finding, type Snapshot } from "./analysis";
import { getSalesCopSettings } from "./settings";
import { logExecution } from "./log";

export type Priority = "URGENTE" | "ALTA" | "MEDIA" | "BAIXA";
export const PRIORITY_ORDER: Record<Priority, number> = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
export const PRIORITY_TIME: Record<Priority, string> = { URGENTE: "08:30", ALTA: "09:30", MEDIA: "11:00", BAIXA: "15:00" };

const sevToPriority = (s: Finding["severity"]): Priority => (s === "CRITICO" ? "URGENTE" : s === "ALTO" ? "ALTA" : s === "MEDIO" ? "MEDIA" : "BAIXA");
const EXPECTED: Record<string, string> = {
  PRIMEIRO_CONTATO: "Lead contatado, histórico registrado e etapa atualizada.",
  FOLLOW_UP: "Próxima atividade agendada no CRM.",
  FOLLOW_UP_ATRASADO: "Follow-up realizado e próxima atividade reagendada.",
  LEAD_PARADO: "Lead avançado de etapa, reativado ou encerrado com motivo.",
  SEM_MOVIMENTACAO: "Contato retomado e situação do lead atualizada.",
  PROPOSTA: "Retorno da proposta obtido e prazo de decisão definido.",
  RISCO_PERDA: "Negociação retomada com próximo passo definido.",
  REUNIAO: "Reunião confirmada pelo lead/cliente.",
  RESPONSAVEL: "Lead com vendedor responsável atribuído.",
  SEM_HISTORICO: "Histórico de atendimento registrado.",
  VENDEDOR_INATIVO: "Atividades do dia registradas no CRM.",
};
const ACTION_TITLE: Record<string, (name: string) => string> = {
  PRIMEIRO_CONTATO: (n) => `Fazer o primeiro contato com ${n}`,
  FOLLOW_UP: (n) => `Agendar próxima atividade para ${n}`,
  FOLLOW_UP_ATRASADO: (n) => `Realizar follow-up atrasado: ${n}`,
  LEAD_PARADO: (n) => `Reativar lead parado: ${n}`,
  SEM_MOVIMENTACAO: (n) => `Retomar contato com ${n}`,
  PROPOSTA: (n) => `Cobrar retorno da proposta: ${n}`,
  RISCO_PERDA: (n) => `Salvar oportunidade em risco: ${n}`,
  REUNIAO: (n) => `Confirmar reunião: ${n}`,
  RESPONSAVEL: (n) => `Atribuir responsável ao lead ${n}`,
  SEM_HISTORICO: (n) => `Registrar histórico de atendimento: ${n}`,
  VENDEDOR_INATIVO: (n) => `Registrar as atividades do dia (${n})`,
};

export type PlanItemDraft = { ruleKey: string; title: string; description: string; justification: string; expectedResult: string; priority: Priority; recommendedTime: string; dueAt: Date; assigneeId: string | null; leadId: string | null; appointmentId: string | null; clientId: string | null };

/** Constrói os itens do plano diário a partir da análise (determinístico, baseado nas regras). */
export function buildPlanItems(snap: Snapshot, now = new Date()): { items: PlanItemDraft[]; summary: string; skipped: number } {
  const cap = Math.max(5, snap.settings.goals.dailyContacts);
  const perSeller = new Map<string, number>();
  const seen = new Set<string>();
  const items: PlanItemDraft[] = [];
  let skipped = 0;
  const managers: string[] = []; // itens sem responsável vão para gestores (resolvidos na aprovação)
  const dedupe = (f: Finding) => `${f.leadId ?? f.appointmentId ?? f.userId}`;
  const sorted = [...snap.findings].filter((f) => f.kind !== "GARGALO" && f.ruleKey !== "SEM_HISTORICO");
  for (const f of sorted) {
    const k = dedupe(f);
    if (seen.has(k) && f.ruleKey !== "REUNIAO") continue; // uma ação por lead (a mais grave)
    const assignee = f.ruleKey === "RESPONSAVEL" ? null : f.userId ?? null;
    if (assignee) { const c = perSeller.get(assignee) ?? 0; if (c >= cap) { skipped++; continue; } perSeller.set(assignee, c + 1); }
    seen.add(k);
    const priority = sevToPriority(f.severity);
    const name = f.title.includes(":") ? f.title.split(":").slice(1).join(":").trim() : f.title;
    const timeStr = PRIORITY_TIME[priority];
    const [hh, mm] = timeStr.split(":").map(Number);
    const dueAt = priority === "URGENTE" ? addHours(now, 2) : priority === "ALTA" ? setMinutes(setHours(startOfDay(now), 13), 0) : endOfDay(now);
    items.push({ ruleKey: f.ruleKey, title: (ACTION_TITLE[f.ruleKey] ?? ((n: string) => `Regularizar: ${n}`))(name), description: f.recommendation, justification: f.detail, expectedResult: EXPECTED[f.ruleKey] ?? "Pendência regularizada e registrada no CRM.", priority, recommendedTime: format(setMinutes(setHours(startOfDay(now), hh), mm), "HH:mm"), dueAt, assigneeId: assignee, leadId: f.leadId ?? null, appointmentId: f.appointmentId ?? null, clientId: f.clientId ?? null });
    if (!assignee) managers.push(f.title);
  }
  items.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.recommendedTime.localeCompare(b.recommendedTime));
  const by = (rule: string[]) => items.filter((i) => rule.includes(i.ruleKey)).length;
  const lines: string[] = [];
  if (by(["PRIMEIRO_CONTATO"])) lines.push(`Recuperar ${by(["PRIMEIRO_CONTATO"])} lead(s) sem primeiro contato.`);
  if (by(["FOLLOW_UP", "FOLLOW_UP_ATRASADO"])) lines.push(`Realizar follow-up de ${by(["FOLLOW_UP", "FOLLOW_UP_ATRASADO"])} oportunidade(s).`);
  if (by(["REUNIAO"])) lines.push(`Confirmar ${by(["REUNIAO"])} reunião(ões).`);
  if (by(["LEAD_PARADO", "SEM_MOVIMENTACAO"])) lines.push(`Reativar ${by(["LEAD_PARADO", "SEM_MOVIMENTACAO"])} oportunidade(s) parada(s).`);
  if (by(["PROPOSTA"])) lines.push(`Verificar ${by(["PROPOSTA"])} proposta(s) sem retorno.`);
  if (by(["RISCO_PERDA"])) lines.push(`Priorizar ${by(["RISCO_PERDA"])} oportunidade(s) em risco.`);
  if (by(["RESPONSAVEL"])) lines.push(`Atribuir responsável a ${by(["RESPONSAVEL"])} lead(s).`);
  if (by(["VENDEDOR_INATIVO"])) lines.push(`Cobrar registro de atividades de ${by(["VENDEDOR_INATIVO"])} vendedor(es).`);
  if (!items.length) lines.push("Nenhuma pendência detectada pelas regras de fiscalização. Operação em dia — manter o ritmo de contatos e follow-ups.");
  const summary = `Índice de Saúde Comercial: ${snap.health.score} (${snap.health.state}). Meta: ${snap.kpis.goalPct.toFixed(0)}% realizada.\n` + lines.map((l, i) => `${i + 1}. ${l}`).join("\n") + (skipped ? `\n(${skipped} pendência(s) ficaram fora do plano por exceder a capacidade diária de ${cap} atividades por vendedor.)` : "");
  return { items, summary, skipped };
}

export const planDate = (d = new Date()) => format(d, "yyyy-MM-dd");

/** Gera (ou regenera, se ainda em rascunho) o plano do dia. Retorna o plano com itens. */
export async function generateDailyPlan(opts: { actorId?: string | null; date?: Date; force?: boolean; via?: "manual" | "rotina" } = {}) {
  const started = Date.now();
  const date = planDate(opts.date);
  const existing = await db.query.aiActionPlans.findFirst({ where: eq(t.aiActionPlans.date, date) });
  if (existing && existing.status !== "RASCUNHO" && !opts.force) return getPlan(date);
  const snap = await analyzeOperation();
  await syncFindings(snap.findings);
  const { items, summary } = buildPlanItems(snap);
  const snapshot = { kpis: snap.kpis, health: snap.health, intelligence: snap.intelligence, generatedAt: snap.generatedAt };
  let planId = existing?.id;
  if (existing && existing.status === "RASCUNHO") {
    await db.delete(t.aiPlanItems).where(eq(t.aiPlanItems.planId, existing.id));
    await db.update(t.aiActionPlans).set({ summary, snapshot, generatedBy: "regras", createdById: opts.actorId ?? existing.createdById }).where(eq(t.aiActionPlans.id, existing.id));
  } else if (!existing) {
    const [p] = await db.insert(t.aiActionPlans).values({ date, summary, snapshot, generatedBy: "regras", createdById: opts.actorId ?? null }).returning();
    planId = p.id;
  } else {
    // força regeneração de plano já aprovado: mantém itens concluídos, substitui os demais
    await db.delete(t.aiPlanItems).where(and(eq(t.aiPlanItems.planId, existing.id), inArray(t.aiPlanItems.status, ["PENDENTE", "REJEITADO"])));
    await db.update(t.aiActionPlans).set({ summary, snapshot }).where(eq(t.aiActionPlans.id, existing.id));
  }
  if (items.length) await db.insert(t.aiPlanItems).values(items.map((i, order) => ({ ...i, planId: planId!, order })));
  await logExecution({ kind: opts.via === "rotina" ? "rotina" : "acao", action: "generate_daily_plan", summary: `Plano ${date} gerado com ${items.length} atividades (${snap.findings.length} pendências analisadas).`, output: { items: items.length, findings: snap.findings.length, health: snap.health.score }, durationMs: Date.now() - started, actorId: opts.actorId ?? null });
  return getPlan(date);
}

export async function getPlan(date = planDate()) {
  const plan = await db.query.aiActionPlans.findFirst({ where: eq(t.aiActionPlans.date, date), with: { items: { orderBy: [asc(t.aiPlanItems.order)], with: { assignee: { columns: { id: true, name: true, avatarUrl: true } }, lead: { columns: { id: true, name: true, company: true, value: true } }, task: { columns: { id: true, status: true, completedAt: true } }, appointment: { columns: { id: true, title: true, startAt: true, confirmedAt: true } } } }, createdBy: { columns: { name: true } }, approvedBy: { columns: { name: true } } } });
  if (!plan) return null;
  // sincroniza conclusão a partir das tarefas reais
  const toComplete = plan.items.filter((i) => i.status === "APROVADO" && i.task?.status === "CONCLUIDA").map((i) => i.id);
  if (toComplete.length) { await db.update(t.aiPlanItems).set({ status: "CONCLUIDO" }).where(inArray(t.aiPlanItems.id, toComplete)); plan.items.forEach((i) => { if (toComplete.includes(i.id)) i.status = "CONCLUIDO"; }); }
  return plan;
}
export type Plan = NonNullable<Awaited<ReturnType<typeof getPlan>>>;

/** Aprova o plano: cria tarefas reais no CRM para os itens pendentes (respeitando o modo de autonomia). */
export async function approvePlan(planId: string, actorId: string | null, opts: { via?: "manual" | "rotina" } = {}) {
  const settings = await getSalesCopSettings();
  if (settings.mode === "OBSERVADOR") throw new Error("No modo Observador o SALES COP não cria tarefas. Altere o nível de autonomia em Configurações do Agente.");
  const plan = await db.query.aiActionPlans.findFirst({ where: eq(t.aiActionPlans.id, planId), with: { items: true } });
  if (!plan) throw new Error("Plano não encontrado.");
  const managers = await db.select({ id: t.users.id }).from(t.users).where(and(eq(t.users.active, true), inArray(t.users.role, ["ADMIN", "GESTOR"])));
  const fallback = actorId ?? managers[0]?.id ?? null;
  let created = 0;
  for (const item of plan.items.filter((i) => i.status === "PENDENTE")) {
    const assigneeId = item.assigneeId ?? fallback;
    const [task] = await db.insert(t.tasks).values({ title: item.title, description: [item.description, item.justification ? `Motivo: ${item.justification}` : null, item.expectedResult ? `Resultado esperado: ${item.expectedResult}` : null].filter(Boolean).join("\n"), dueAt: item.dueAt, assigneeId, leadId: item.leadId, clientId: item.clientId, priority: item.priority, source: "salescop", planItemId: item.id }).returning();
    await db.update(t.aiPlanItems).set({ status: "APROVADO", taskId: task.id, assigneeId }).where(eq(t.aiPlanItems.id, item.id));
    created++;
  }
  await db.update(t.aiActionPlans).set({ status: "APROVADO", approvedById: actorId, approvedAt: new Date() }).where(eq(t.aiActionPlans.id, planId));
  const assignees = [...new Set(plan.items.map((i) => i.assigneeId ?? fallback).filter(Boolean))] as string[];
  await notify(assignees, "SALES COP AI: plano de operação do dia", `Você tem atividades no plano de ${plan.date.split("-").reverse().join("/")}.`, "/sales-cop/plano", "info");
  await audit(actorId, "approve", "ai_action_plan", planId, `Plano ${plan.date} aprovado — ${created} tarefas criadas`);
  await logExecution({ kind: opts.via === "rotina" ? "rotina" : "acao", action: "approve_plan", summary: `Plano ${plan.date} aprovado; ${created} tarefas criadas no CRM.`, output: { created }, actorId });
  return created;
}

export async function rejectPlan(planId: string, actorId: string) {
  await db.update(t.aiActionPlans).set({ status: "REJEITADO" }).where(eq(t.aiActionPlans.id, planId));
  await audit(actorId, "reject", "ai_action_plan", planId, "Plano rejeitado");
  await logExecution({ kind: "acao", action: "reject_plan", summary: "Plano rejeitado pelo gestor.", actorId });
}

/** Encerramento do dia: compara planejado × realizado e grava no snapshot. */
export async function closePlan(date = planDate()) {
  const plan = await getPlan(date);
  if (!plan) return null;
  const total = plan.items.length, done = plan.items.filter((i) => i.status === "CONCLUIDO").length, approved = plan.items.filter((i) => i.status === "APROVADO").length, rejected = plan.items.filter((i) => i.status === "REJEITADO").length;
  const result = { total, done, approved, rejected, pct: total ? Math.round((done / Math.max(1, total - rejected)) * 100) : 100, closedAt: new Date().toISOString() };
  await db.update(t.aiActionPlans).set({ status: plan.status === "RASCUNHO" ? "ENCERRADO" : plan.status, snapshot: { ...(plan.snapshot ?? {}), result } }).where(eq(t.aiActionPlans.id, plan.id));
  return result;
}
