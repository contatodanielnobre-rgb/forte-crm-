import { and, eq, gte, lte, sql, inArray } from "drizzle-orm";
import { endOfMonth, startOfMonth } from "date-fns";
import { db, t } from "@/db";
import { num, periodKey } from "@/lib/format";
import { getSetting } from "@/lib/bootstrap";

export async function ruleMap() {
  const rules = await db.select().from(t.scoringRules);
  return Object.fromEntries(rules.map((r) => [r.key, r])) as Record<string, (typeof rules)[number]>;
}

/** Registra pontos de forma idempotente (userId + ruleKey + referenceId). */
export async function awardPoints(userId: string | null | undefined, ruleKey: string, referenceId: string, description: string, earnedAt = new Date()) {
  if (!userId) return;
  const rules = await ruleMap();
  const rule = rules[ruleKey];
  if (!rule || rule.points <= 0) return;
  await db.insert(t.pointEntries).values({ userId, ruleKey, points: rule.points, referenceId, description, earnedAt }).onConflictDoNothing();
}
export async function revokePoints(userId: string | null | undefined, ruleKey: string, referenceId: string) {
  if (!userId) return;
  await db.delete(t.pointEntries).where(and(eq(t.pointEntries.userId, userId), eq(t.pointEntries.ruleKey, ruleKey), eq(t.pointEntries.referenceId, referenceId)));
}

/** Verifica bônus de meta mensal para o vendedor no mês da venda. */
export async function checkGoalBonuses(userId: string | null | undefined, when = new Date()) {
  if (!userId) return;
  const [u] = await db.select().from(t.users).where(eq(t.users.id, userId));
  if (!u) return;
  const globalGoal = (await getSetting<{ monthly: number }>("goals", { monthly: 0 })).monthly;
  const goal = num(u.monthlyGoal) > 0 ? num(u.monthlyGoal) : globalGoal;
  if (goal <= 0) return;
  const from = startOfMonth(when), to = endOfMonth(when);
  const [{ total }] = await db.select({ total: sql<string>`coalesce(sum(${t.leads.value}),0)` }).from(t.leads).where(and(eq(t.leads.ownerId, userId), gte(t.leads.wonAt, from), lte(t.leads.wonAt, to), eq(t.leads.archived, false)));
  const sold = num(total);
  const ref = `goal-${periodKey(when)}`;
  if (sold >= goal) await awardPoints(userId, "META_ATINGIDA", ref, `Meta mensal atingida (${periodKey(when)})`, when);
  if (sold >= goal * 1.2) await awardPoints(userId, "META_120", ref, `Meta superada em 120% (${periodKey(when)})`, when);
}

export type RankingRow = {
  user: { id: string; name: string; avatarUrl: string | null; role: string; monthlyGoal: string };
  sales: number; revenue: number; received: number; meetings: number; leads: number; conversion: number; goal: number; goalPct: number; points: number; position: number;
};

export async function computeRanking(from: Date, to: Date): Promise<RankingRow[]> {
  const sellers = await db.select().from(t.users).where(and(eq(t.users.active, true), inArray(t.users.role, ["COMERCIAL", "GESTOR", "ADMIN"])));
  if (!sellers.length) return [];
  const ids = sellers.map((s) => s.id);
  const globalGoal = (await getSetting<{ monthly: number }>("goals", { monthly: 0 })).monthly;
  const won = await db.select({ ownerId: t.leads.ownerId, c: sql<number>`count(*)::int`, v: sql<string>`coalesce(sum(${t.leads.value}),0)` }).from(t.leads).where(and(inArray(t.leads.ownerId, ids), gte(t.leads.wonAt, from), lte(t.leads.wonAt, to), eq(t.leads.archived, false))).groupBy(t.leads.ownerId);
  const allLeads = await db.select({ ownerId: t.leads.ownerId, c: sql<number>`count(*)::int` }).from(t.leads).where(and(inArray(t.leads.ownerId, ids), gte(t.leads.enteredAt, from), lte(t.leads.enteredAt, to), eq(t.leads.archived, false))).groupBy(t.leads.ownerId);
  const meetings = await db.select({ ownerId: t.appointments.ownerId, c: sql<number>`count(*)::int` }).from(t.appointments).innerJoin(t.appointmentTypes, eq(t.appointments.typeId, t.appointmentTypes.id)).where(and(inArray(t.appointments.ownerId, ids), eq(t.appointments.status, "REALIZADO"), eq(t.appointmentTypes.isCommercial, true), gte(t.appointments.startAt, from), lte(t.appointments.startAt, to))).groupBy(t.appointments.ownerId);
  const received = await db.select({ ownerId: t.clients.ownerId, v: sql<string>`coalesce(sum(${t.payments.amount}),0)` }).from(t.payments).innerJoin(t.clients, eq(t.payments.clientId, t.clients.id)).where(and(inArray(t.clients.ownerId, ids), gte(t.payments.paidAt, from), lte(t.payments.paidAt, to))).groupBy(t.clients.ownerId);
  const points = await db.select({ userId: t.pointEntries.userId, p: sql<number>`coalesce(sum(${t.pointEntries.points}),0)::int` }).from(t.pointEntries).where(and(inArray(t.pointEntries.userId, ids), gte(t.pointEntries.earnedAt, from), lte(t.pointEntries.earnedAt, to))).groupBy(t.pointEntries.userId);
  const by = <T extends { ownerId?: string | null; userId?: string }>(rows: T[]) => new Map(rows.map((r) => [r.ownerId ?? r.userId, r]));
  const W = by(won), L = by(allLeads), M = by(meetings), R = by(received), P = by(points);
  const months = Math.max(1, Math.round((+to - +from) / (1000 * 60 * 60 * 24 * 30.4)));
  const rows = sellers.map((u) => {
    const sales = W.get(u.id)?.c ?? 0, revenue = num(W.get(u.id)?.v), leads = L.get(u.id)?.c ?? 0;
    const goal = (num(u.monthlyGoal) > 0 ? num(u.monthlyGoal) : globalGoal) * months;
    return { user: { id: u.id, name: u.name, avatarUrl: u.avatarUrl, role: u.role, monthlyGoal: u.monthlyGoal }, sales, revenue, received: num(R.get(u.id)?.v), meetings: M.get(u.id)?.c ?? 0, leads, conversion: leads ? (sales / leads) * 100 : 0, goal, goalPct: goal ? (revenue / goal) * 100 : 0, points: P.get(u.id)?.p ?? 0, position: 0 };
  });
  const visible = rows.filter((r) => r.user.role !== "ADMIN" || r.sales > 0 || r.leads > 0 || r.meetings > 0);
  visible.sort((a, b) => b.points - a.points || b.revenue - a.revenue || b.sales - a.sales);
  visible.forEach((r, i) => (r.position = i + 1));
  return visible;
}
