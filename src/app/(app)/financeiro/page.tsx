import Link from "next/link";
import { asc, gte, inArray } from "drizzle-orm";
import { addDays, format, startOfMonth, subMonths, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Wallet, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, Kpi, Badge } from "@/components/ui";
import { ModalButton, CloseOnDone } from "@/components/modal-button";
import { Field, SubmitButton } from "@/components/ui";
import { AreaMoney, Bars } from "@/components/charts";
import { brl, fmtDate, num, toInputDate } from "@/lib/format";
import { recalcInstallmentStatuses } from "@/lib/services/finance";
import { addPayment } from "../clientes/actions";

export const metadata = { title: "Financeiro" };
export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const user = await requirePage("finance.view");
  await recalcInstallmentStatuses();
  const canEdit = can(user.role, "finance.manage");
  const now = new Date();
  const [contracts, insts, pays, clients] = await Promise.all([
    db.select().from(t.contracts).where(inArray(t.contracts.status, ["PENDENTE", "ENVIADO", "ASSINADO"])),
    db.query.installments.findMany({ with: { client: { columns: { id: true, name: true, company: true } } }, orderBy: [asc(t.installments.dueDate)] }),
    db.select().from(t.payments).where(gte(t.payments.paidAt, startOfMonth(subMonths(now, 11)))),
    db.select({ id: t.clients.id, name: t.clients.name }).from(t.clients),
  ]);
  const contracted = contracts.reduce((s, c) => s + num(c.totalValue) - num(c.discount), 0);
  const allPays = await db.select({ amount: t.payments.amount, clientId: t.payments.clientId }).from(t.payments);
  const received = allPays.reduce((s, p) => s + num(p.amount), 0);
  const overdueList = insts.filter((i) => i.status === "ATRASADO");
  const overdue = overdueList.reduce((s, i) => s + num(i.amount), 0);
  const upcoming = insts.filter((i) => (i.status === "PENDENTE" || i.status === "PARCIAL") && i.dueDate >= now && i.dueDate <= addDays(now, 15));
  const monthly = Array.from({ length: 12 }, (_, k) => { const m = subMonths(startOfMonth(now), 11 - k); const label = format(m, "MMM/yy", { locale: ptBR }); const rec = pays.filter((p) => p.paidAt >= m && p.paidAt <= endOfMonth(m)).reduce((s, p) => s + num(p.amount), 0); const prev = insts.filter((i) => i.dueDate >= m && i.dueDate <= endOfMonth(m) && i.status !== "CANCELADO").reduce((s, i) => s + num(i.amount), 0); return { label, recebido: rec, previsto: prev }; });
  const byClient = new Map<string, number>(); allPays.forEach((p) => byClient.set(p.clientId, (byClient.get(p.clientId) ?? 0) + num(p.amount)));
  const topClients = [...byClient.entries()].map(([id, v]) => ({ label: clients.find((c) => c.id === id)?.name ?? "—", valor: v })).sort((a, b) => b.valor - a.valor).slice(0, 8);
  const monthRec = pays.filter((p) => p.paidAt >= startOfMonth(now)).reduce((s, p) => s + num(p.amount), 0);

  const Row = ({ i, tone }: { i: (typeof insts)[number]; tone: "red" | "amber" }) => (
    <li className="p-3 flex items-center gap-3 text-sm">
      <div className="flex-1 min-w-0"><Link href={`/clientes/${i.client.id}?aba=financeiro`} className="font-medium hover:text-brand">{i.client.name}</Link><p className="text-xs text-muted">{i.description} · vence {fmtDate(i.dueDate)}</p></div>
      <span className="font-medium tabular-nums">{brl(i.amount)}</span><Badge tone={tone}>{tone === "red" ? `${Math.floor((+now - +i.dueDate) / 864e5)}d atraso` : `em ${Math.ceil((+i.dueDate - +now) / 864e5)}d`}</Badge>
      {canEdit && <ModalButton label="Receber" title={`Receber — ${i.client.name}`} className="btn-primary btn-sm" size="sm">
        <CloseOnDone action={addPayment.bind(null, i.client.id)} success="Pagamento registrado." className="space-y-3">
          <input type="hidden" name="installmentId" value={i.id} />
          <Field label="Valor (R$)"><input name="amount" type="number" step="0.01" className="input" defaultValue={Number(i.amount)} required /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Data"><input name="paidAt" type="date" className="input" defaultValue={toInputDate(now)} /></Field><Field label="Forma"><input name="method" className="input" defaultValue="Pix" /></Field></div>
          <Field label="Comprovante"><input type="file" name="receipt" className="text-xs" /></Field>
          <div className="flex justify-end"><SubmitButton>Confirmar</SubmitButton></div>
        </CloseOnDone></ModalButton>}
    </li>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Financeiro" subtitle="Receita contratada, recebida e pendente — contratos fechados não contam como dinheiro recebido." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Faturamento contratado" value={brl(contracted)} hint={`${contracts.length} contratos ativos`} icon={Wallet} tone="gray" />
        <Kpi label="Total recebido" value={brl(received)} hint={`${brl(monthRec)} neste mês`} icon={CheckCircle2} tone="green" />
        <Kpi label="Total a receber" value={brl(Math.max(0, contracted - received))} hint={`${upcoming.length} parcelas vencem em 15 dias`} icon={Clock} tone="blue" />
        <Kpi label="Valores em atraso" value={brl(overdue)} hint={`${overdueList.length} parcelas · ${new Set(overdueList.map((i) => i.clientId)).size} clientes`} icon={AlertTriangle} tone={overdue > 0 ? "red" : "gray"} />
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card p-4"><p className="font-medium mb-1">Receita mensal</p><p className="text-xs text-muted mb-3">Recebido vs. previsto (parcelas por vencimento) nos últimos 12 meses</p><AreaMoney data={monthly} keys={[{ key: "recebido", name: "Recebido", color: "#10B981" }, { key: "previsto", name: "Previsto", color: "#D91E3A" }]} /></div>
        <div className="card p-4"><p className="font-medium mb-3">Receita por cliente</p>{topClients.length ? <Bars data={topClients} keys={[{ key: "valor", name: "Recebido" }]} money horizontal height={260} /> : <p className="text-sm text-muted">Sem recebimentos.</p>}</div>
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card"><p className="p-4 border-b border-line font-medium flex items-center gap-2"><AlertTriangle size={16} className="text-red-500" /> Inadimplência ({overdueList.length})</p>{overdueList.length === 0 ? <p className="p-6 text-sm text-muted text-center">Nenhuma parcela em atraso. 🎉</p> : <ul className="divide-y divide-line">{overdueList.map((i) => <Row key={i.id} i={i} tone="red" />)}</ul>}</div>
        <div className="card"><p className="p-4 border-b border-line font-medium flex items-center gap-2"><Clock size={16} className="text-amber-500" /> Próximos vencimentos (15 dias)</p>{upcoming.length === 0 ? <p className="p-6 text-sm text-muted text-center">Nada vence nos próximos 15 dias.</p> : <ul className="divide-y divide-line">{upcoming.map((i) => <Row key={i.id} i={i} tone="amber" />)}</ul>}</div>
      </div>
      <div className="card overflow-x-auto"><p className="p-4 border-b border-line font-medium">Contratos</p>
        <table className="table"><thead><tr><th>Cliente</th><th>Valor</th><th>Entrada</th><th>Parcelas</th><th>Pago</th><th>Em aberto</th><th>Status</th></tr></thead><tbody>
          {contracts.map((c) => { const ci = insts.filter((i) => i.clientId === c.clientId); const paid = allPays.filter((p) => p.clientId === c.clientId).reduce((s, p) => s + num(p.amount), 0); const total = num(c.totalValue) - num(c.discount); return (
            <tr key={c.id}><td><Link href={`/clientes/${c.clientId}?aba=financeiro`} className="font-medium hover:text-brand">{clients.find((x) => x.id === c.clientId)?.name}</Link></td><td className="tabular-nums">{brl(total)}</td><td className="tabular-nums">{brl(c.downPayment)}</td><td>{c.installments}x · {c.paymentMethod ?? "—"}</td><td className="tabular-nums text-emerald-600">{brl(paid)}</td><td className="tabular-nums">{brl(Math.max(0, total - paid))}</td><td><Badge tone={ci.some((i) => i.status === "ATRASADO") ? "red" : c.status === "ASSINADO" ? "green" : "amber"}>{ci.some((i) => i.status === "ATRASADO") ? "Em atraso" : c.status}</Badge></td></tr>
          ); })}
        </tbody></table>
      </div>
    </div>
  );
}
