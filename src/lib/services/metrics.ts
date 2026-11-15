import { and, eq, gte, lte, inArray, isNotNull, sql, asc } from "drizzle-orm";
import { eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval, format, startOfMonth, endOfMonth, differenceInDays, isSameDay, isSameMonth, isSameWeek, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { db, t } from "@/db";
import { num } from "@/lib/format";
import { getSetting } from "@/lib/bootstrap";
import { isStepLate } from "./journey";

/** Métricas do dashboard para um período. scopeUserId limita leads/compromissos ao usuário (perfis sem visão total). */
export async function dashboardMetrics(from: Date, to: Date, scopeUserId?: string) {
  const now = new Date();
  const leadScope = scopeUserId ? eq(t.leads.ownerId, scopeUserId) : undefined;
  const [leadsIn, won, lostCount, stages, apptsAll, clientsAll, reportsPending, tasksLate, payMonth, payAll, sources, sellers] = await Promise.all([
    db.query.leads.findMany({ where: and(eq(t.leads.archived, false), gte(t.leads.enteredAt, from), lte(t.leads.enteredAt, to), leadScope), with: { stage: true, source: true } }),
    db.query.leads.findMany({ where: and(eq(t.leads.archived, false), isNotNull(t.leads.wonAt), gte(t.leads.wonAt, from), lte(t.leads.wonAt, to), leadScope), with: { owner: { columns: { id: true, name: true } } } }),
    db.select({ c: sql<number>`count(*)::int` }).from(t.leads).where(and(eq(t.leads.archived, false), isNotNull(t.leads.lostAt), gte(t.leads.lostAt, from), lte(t.leads.lostAt, to), leadScope)),
    db.select().from(t.pipelineStages).orderBy(asc(t.pipelineStages.order)),
    db.query.appointments.findMany({ where: and(gte(t.appointments.startAt, from), lte(t.appointments.startAt, to), scopeUserId ? eq(t.appointments.ownerId, scopeUserId) : undefined), with: { type: true } }),
    db.query.clients.findMany({ with: { journeySteps: true, installments: true } }),
    db.select({ c: sql<number>`count(*)::int` }).from(t.reports).where(eq(t.reports.status, "PENDENTE")),
    db.select({ clientId: t.tasks.clientId }).from(t.tasks).where(and(inArray(t.tasks.status, ["PENDENTE", "EM_ANDAMENTO"]), lte(t.tasks.dueAt, now))),
    db.select({ v: sql<string>`coalesce(sum(${t.payments.amount}),0)` }).from(t.payments).where(and(gte(t.payments.paidAt, startOfMonth(now)), lte(t.payments.paidAt, endOfMonth(now)))),
    db.select({ v: sql<string>`coalesce(sum(${t.payments.amount}),0)` }).from(t.payments).where(and(gte(t.payments.paidAt, from), lte(t.payments.paidAt, to))),
    db.select().from(t.leadSources),
    db.select({ id: t.users.id, name: t.users.name, avatarUrl: t.users.avatarUrl, monthlyGoal: t.users.monthlyGoal }).from(t.users).where(and(eq(t.users.active, true), inArray(t.users.role, ["COMERCIAL", "GESTOR", "ADMIN"]))),
  ]);
  const openStages = stages.filter((s) => !s.isWon && !s.isLost).map((s) => s.id);
  const negotiating = await db.select({ c: sql<number>`count(*)::int`, v: sql<string>`coalesce(sum(${t.leads.value}),0)` }).from(t.leads).where(and(eq(t.leads.archived, false), inArray(t.leads.stageId, openStages), leadScope));
  const proposalStage = stages.find((s) => s.name.toLowerCase().includes("proposta"));
  const negStage = stages.find((s) => s.name.toLowerCase().includes("negocia"));
  const proposals = await db.select({ c: sql<number>`count(*)::int`, v: sql<string>`coalesce(sum(${t.leads.value}),0)` }).from(t.leads).where(and(eq(t.leads.archived, false), inArray(t.leads.stageId, [proposalStage?.id, negStage?.id].filter((x): x is string => !!x)), leadScope));
  const goalCfg = await getSetting<{ monthly: number }>("goals", { monthly: 0 });
  const revenueWon = won.reduce((s, l) => s + num(l.value), 0);
  const monthWon = (await db.select({ v: sql<string>`coalesce(sum(${t.leads.value}),0)` }).from(t.leads).where(and(eq(t.leads.archived, false), gte(t.leads.wonAt, startOfMonth(now)), lte(t.leads.wonAt, endOfMonth(now)), leadScope)))[0].v;
  const goal = scopeUserId ? num(sellers.find((s) => s.id === scopeUserId)?.monthlyGoal) || goalCfg.monthly : goalCfg.monthly;

  // Séries temporais
  const days = differenceInDays(to, from);
  const buckets = days <= 31 ? eachDayOfInterval({ start: from, end: to }) : days <= 120 ? eachWeekOfInterval({ start: from, end: to }) : eachMonthOfInterval({ start: from, end: to });
  const same = days <= 31 ? isSameDay : days <= 120 ? isSameWeek : isSameMonth;
  const fmt = (d: Date) => (days <= 31 ? format(d, "dd/MM") : days <= 120 ? `sem ${format(d, "dd/MM")}` : format(d, "MMM/yy", { locale: ptBR }));
  const series = buckets.map((b) => ({ label: fmt(b), vendas: won.filter((l) => l.wonAt && same(l.wonAt, b)).length, faturamento: won.filter((l) => l.wonAt && same(l.wonAt, b)).reduce((s, l) => s + num(l.value), 0), leads: leadsIn.filter((l) => same(l.enteredAt, b)).length }));

  const bySource = sources.map((s) => ({ name: s.name, value: leadsIn.filter((l) => l.sourceId === s.id).length })).filter((x) => x.value > 0);
  const noSource = leadsIn.filter((l) => !l.sourceId).length; if (noSource) bySource.push({ name: "Sem origem", value: noSource });
  const bySeller = sellers.map((u) => { const l = leadsIn.filter((x) => x.ownerId === u.id).length; const w = won.filter((x) => x.ownerId === u.id); const m = apptsAll.filter((a) => a.ownerId === u.id && a.status === "REALIZADO" && a.type?.isCommercial).length; return { id: u.id, label: u.name.split(" ")[0], name: u.name, avatarUrl: u.avatarUrl, leads: l, vendas: w.length, faturamento: w.reduce((s, x) => s + num(x.value), 0), reunioes: m, conversao: l ? Math.round((w.length / l) * 1000) / 10 : 0 }; }).filter((s) => s.leads || s.vendas || s.reunioes);
  const funnel = stages.filter((s) => !s.isLost).map((s) => ({ label: s.name, color: s.color, count: leadsIn.filter((l) => l.stageId === s.id).length }));

  return {
    leadsReceived: leadsIn.length, negotiating: negotiating[0].c, negotiatingValue: num(negotiating[0].v), proposals: proposals[0].c, proposalsValue: num(proposals[0].v),
    sales: won.length, lost: lostCount[0].c, conversion: leadsIn.length ? (won.length / leadsIn.length) * 100 : 0, ticket: won.length ? revenueWon / won.length : 0,
    revenueWon, receivedPeriod: num(payAll[0].v), receivedMonth: num(payMonth[0].v), monthWon: num(monthWon), goal, remaining: Math.max(0, goal - num(monthWon)),
    activeClients: clientsAll.filter((c) => c.status === "ATIVO").length, onboarding: clientsAll.filter((c) => c.status === "ONBOARDING").length,
    projects: clientsAll.filter((c) => c.status === "ATIVO" || c.status === "ONBOARDING").length,
    clientsLateTasks: new Set(tasksLate.map((x) => x.clientId).filter(Boolean)).size, clientsLateSteps: clientsAll.filter((c) => c.journeySteps.some((s) => isStepLate(s))).length,
    overdueClients: clientsAll.filter((c) => c.installments.some((i) => i.status === "ATRASADO")).length,
    meetingsScheduled: apptsAll.filter((a) => a.status === "AGENDADO").length, meetingsDone: apptsAll.filter((a) => a.status === "REALIZADO").length, reportsPending: reportsPending[0].c,
    series, bySource, bySeller, funnel,
    recentWon: won.sort((a, b) => +(b.wonAt ?? 0) - +(a.wonAt ?? 0)).slice(0, 6),
  };
}
export type DashboardMetrics = Awaited<ReturnType<typeof dashboardMetrics>>;
export { startOfDay };
