import { addMonths, startOfDay } from "date-fns";
import { and, eq, sql, inArray } from "drizzle-orm";
import { db, t } from "@/db";
import { num } from "@/lib/format";

/** (Re)gera parcelas a partir do contrato. Remove parcelas sem pagamentos e preserva as pagas. */
export async function generateInstallments(clientId: string) {
  const [c] = await db.select().from(t.contracts).where(eq(t.contracts.clientId, clientId));
  if (!c) return;
  const paidIds = (await db.selectDistinct({ id: t.payments.installmentId }).from(t.payments).where(eq(t.payments.clientId, clientId))).map((p) => p.id).filter((x): x is string => !!x);
  // apaga parcelas sem pagamento
  if (paidIds.length) await db.delete(t.installments).where(and(eq(t.installments.clientId, clientId), sql`${t.installments.id} NOT IN ${paidIds}`));
  else await db.delete(t.installments).where(eq(t.installments.clientId, clientId));
  const kept = await db.select({ number: t.installments.number }).from(t.installments).where(eq(t.installments.clientId, clientId));
  const keptNumbers = new Set(kept.map((k) => k.number));

  const total = num(c.totalValue) - num(c.discount);
  const down = Math.min(num(c.downPayment), total);
  const n = Math.max(1, c.installments);
  const base = c.firstDueDate ? startOfDay(c.firstDueDate) : startOfDay(new Date());
  const rows: (typeof t.installments.$inferInsert)[] = [];
  if (down > 0 && !keptNumbers.has(0)) rows.push({ clientId, number: 0, description: "Entrada", amount: down.toFixed(2), dueDate: base });
  const rest = total - down;
  const per = Math.floor((rest / n) * 100) / 100;
  let acc = 0;
  for (let i = 1; i <= n; i++) {
    const amount = i === n ? +(rest - acc).toFixed(2) : per; acc += per;
    if (keptNumbers.has(i)) continue;
    rows.push({ clientId, number: i, description: `Parcela ${i}/${n}`, amount: amount.toFixed(2), dueDate: addMonths(base, down > 0 ? i : i - 1) });
  }
  if (rows.length) await db.insert(t.installments).values(rows);
  await recalcInstallmentStatuses(clientId);
}

/** Recalcula status das parcelas com base nos pagamentos e vencimentos. */
export async function recalcInstallmentStatuses(clientId?: string) {
  const where = clientId ? eq(t.installments.clientId, clientId) : undefined;
  const insts = await db.select().from(t.installments).where(where);
  if (!insts.length) return;
  const sums = await db.select({ id: t.payments.installmentId, total: sql<string>`coalesce(sum(${t.payments.amount}),0)` }).from(t.payments).where(inArray(t.payments.installmentId, insts.map((i) => i.id))).groupBy(t.payments.installmentId);
  const paidBy = new Map(sums.map((s) => [s.id, num(s.total)]));
  const today = startOfDay(new Date());
  for (const i of insts) {
    if (i.status === "CANCELADO") continue;
    const paid = paidBy.get(i.id) ?? 0;
    const amount = num(i.amount);
    let status: typeof i.status = "PENDENTE";
    if (paid >= amount - 0.009) status = "PAGO";
    else if (paid > 0) status = startOfDay(i.dueDate) < today ? "ATRASADO" : "PARCIAL";
    else if (startOfDay(i.dueDate) < today) status = "ATRASADO";
    if (status !== i.status) await db.update(t.installments).set({ status }).where(eq(t.installments.id, i.id));
  }
}

export async function clientFinanceSummary(clientId: string) {
  const [c] = await db.select().from(t.contracts).where(eq(t.contracts.clientId, clientId));
  const insts = await db.select().from(t.installments).where(eq(t.installments.clientId, clientId));
  const pays = await db.select().from(t.payments).where(eq(t.payments.clientId, clientId));
  const contracted = c ? num(c.totalValue) - num(c.discount) : 0;
  const received = pays.reduce((s, p) => s + num(p.amount), 0);
  const overdue = insts.filter((i) => i.status === "ATRASADO").reduce((s, i) => s + num(i.amount), 0);
  return { contract: c ?? null, installments: insts.sort((a, b) => a.number - b.number), payments: pays.sort((a, b) => +b.paidAt - +a.paidAt), contracted, received, pending: Math.max(0, contracted - received), overdue };
}
