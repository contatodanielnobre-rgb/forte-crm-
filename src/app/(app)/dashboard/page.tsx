import Link from "next/link";
import { and, asc, eq, gte, lte, inArray, lt } from "drizzle-orm";
import { endOfDay, startOfDay } from "date-fns";
import { Inbox, Handshake, FileText, Trophy, Percent, Receipt, Wallet, CalendarCheck, Target, Users, Route, Video, FileBarChart, AlertTriangle, ListTodo } from "lucide-react";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PageHeader, Kpi, Progress, Badge, Avatar } from "@/components/ui";
import { PeriodFilter } from "@/components/period-filter";
import { AreaMoney, Bars, Donut, Lines } from "@/components/charts";
import { PERIODS, resolvePeriod } from "@/lib/period";
import { dashboardMetrics } from "@/lib/services/metrics";
import { computeRanking } from "@/lib/services/ranking";
import { recalcInstallmentStatuses } from "@/lib/services/finance";
import { brl, pct, fmtTime, fmtDate } from "@/lib/format";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ p?: string; de?: string; ate?: string }> }) {
  const user = await requirePage("dashboard.view");
  const sp = await searchParams;
  const period = resolvePeriod(sp.p, sp.de, sp.ate);
  await recalcInstallmentStatuses();
  const viewAll = can(user.role, "pipeline.viewAll");
  const m = await dashboardMetrics(period.from, period.to, viewAll ? undefined : user.id);
  const now = new Date();
  const [today, lateLeads, ranking] = await Promise.all([
    db.query.appointments.findMany({ where: and(gte(t.appointments.startAt, startOfDay(now)), lte(t.appointments.startAt, endOfDay(now)), eq(t.appointments.status, "AGENDADO"), viewAll ? undefined : eq(t.appointments.ownerId, user.id)), orderBy: [asc(t.appointments.startAt)], with: { type: true, client: { columns: { id: true, name: true } }, lead: { columns: { name: true } }, owner: { columns: { name: true } } } }),
    db.query.leads.findMany({ where: and(eq(t.leads.archived, false), lt(t.leads.nextActivityAt, now), inArray(t.leads.stageId, (await db.select({ id: t.pipelineStages.id }).from(t.pipelineStages).where(and(eq(t.pipelineStages.isWon, false), eq(t.pipelineStages.isLost, false)))).map((s) => s.id)), viewAll ? undefined : eq(t.leads.ownerId, user.id)), orderBy: [asc(t.leads.nextActivityAt)], limit: 6, with: { owner: { columns: { name: true } } } }),
    can(user.role, "ranking.view") ? computeRanking(period.from, period.to) : Promise.resolve([]),
  ]);
  const goalPct = m.goal ? Math.min(100, (m.monthWon / m.goal) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader title={`Olá, ${user.name.split(" ")[0]}`} subtitle={`Visão geral da operação · ${fmtDate(period.from)} a ${fmtDate(period.to)}`} actions={<PeriodFilter periods={PERIODS} value={period.key} />} />

      {/* O que precisa fazer hoje */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-4 lg:col-span-1">
          <p className="font-medium flex items-center gap-2 mb-3"><CalendarCheck size={16} className="text-brand" /> Hoje <span className="text-muted font-normal text-sm">· {today.length} compromissos</span></p>
          <ul className="space-y-2 max-h-56 overflow-y-auto">{today.map((a) => <li key={a.id} className="flex items-center gap-2 text-sm"><span className="w-1.5 h-8 rounded-full" style={{ background: a.type?.color ?? "#999" }} /><div className="min-w-0 flex-1"><p className="truncate font-medium">{a.title}</p><p className="text-xs text-muted truncate">{fmtTime(a.startAt)} · {a.client ? <Link href={`/clientes/${a.client.id}`} className="hover:text-brand">{a.client.name}</Link> : a.lead?.name ?? a.type?.name}{viewAll && a.owner ? ` · ${a.owner.name.split(" ")[0]}` : ""}</p></div></li>)}{today.length === 0 && <li className="text-sm text-muted">Nenhum compromisso hoje. <Link href="/agenda" className="text-brand">Ver agenda</Link></li>}</ul>
        </div>
        <div className="card p-4">
          <p className="font-medium flex items-center gap-2 mb-3"><AlertTriangle size={16} className="text-amber-500" /> Leads que precisam de atendimento</p>
          <ul className="space-y-2 max-h-56 overflow-y-auto">{lateLeads.map((l) => <li key={l.id} className="text-sm flex items-center justify-between gap-2"><div className="min-w-0"><Link href="/pipeline" className="font-medium hover:text-brand truncate block">{l.name}</Link><p className="text-xs text-muted">Atividade prevista {fmtDate(l.nextActivityAt, "dd/MM HH:mm")}{viewAll && l.owner ? ` · ${l.owner.name.split(" ")[0]}` : ""}</p></div><span className="text-sm font-medium tabular-nums">{brl(l.value)}</span></li>)}{lateLeads.length === 0 && <li className="text-sm text-muted">Nenhum lead com atividade atrasada. 👏</li>}</ul>
        </div>
        <div className="card p-4">
          <p className="font-medium flex items-center gap-2 mb-3"><Target size={16} className="text-brand" /> Meta do mês</p>
          <p className="kpi-value">{brl(m.monthWon)} <span className="text-sm text-muted font-normal">de {brl(m.goal)}</span></p>
          <Progress value={goalPct} className="my-3" tone={goalPct >= 100 ? "green" : "brand"} />
          <p className="text-sm text-muted">{goalPct >= 100 ? "Meta atingida! 🎉" : `Faltam ${brl(m.remaining)} (${pct(100 - goalPct, 0)})`}</p>
          <div className="flex flex-wrap gap-2 mt-3 text-xs"><Link href="/pipeline" className="btn-secondary btn-sm">Ver pipeline</Link>{m.clientsLateSteps > 0 && <Link href="/jornada?filtro=atrasados" className="btn-secondary btn-sm text-red-600">{m.clientsLateSteps} clientes com etapa atrasada</Link>}{m.overdueClients > 0 && can(user.role, "finance.view") && <Link href="/financeiro" className="btn-secondary btn-sm text-red-600">{m.overdueClients} clientes inadimplentes</Link>}</div>
        </div>
      </div>

      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Indicadores comerciais</p>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <Kpi label="Leads recebidos" value={m.leadsReceived} icon={Inbox} tone="blue" />
          <Kpi label="Em negociação" value={m.negotiating} hint={brl(m.negotiatingValue)} icon={Handshake} tone="amber" />
          <Kpi label="Propostas enviadas" value={m.proposals} hint={brl(m.proposalsValue)} icon={FileText} tone="gray" />
          <Kpi label="Vendas fechadas" value={m.sales} hint={`${m.lost} perdidos`} icon={Trophy} tone="green" />
          <Kpi label="Taxa de conversão" value={pct(m.conversion)} icon={Percent} tone="brand" />
          <Kpi label="Ticket médio" value={brl(m.ticket)} icon={Receipt} tone="gray" />
          <Kpi label="Faturamento (vendas)" value={brl(m.revenueWon)} hint="contratado no período" icon={Wallet} tone="green" />
          <Kpi label="Faturamento do mês" value={brl(m.monthWon)} hint={`${brl(m.receivedMonth)} recebido`} icon={Wallet} tone="brand" />
          <Kpi label="Meta mensal" value={brl(m.goal)} icon={Target} tone="gold" />
          <Kpi label="Restante p/ meta" value={brl(m.remaining)} icon={Target} tone={m.remaining > 0 ? "amber" : "green"} />
        </div>
      </section>
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Indicadores operacionais</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Clientes ativos" value={m.activeClients} icon={Users} tone="green" />
          <Kpi label="Em onboarding" value={m.onboarding} icon={Route} tone="blue" />
          <Kpi label="Reuniões agendadas" value={m.meetingsScheduled} icon={Video} tone="blue" />
          <Kpi label="Reuniões realizadas" value={m.meetingsDone} icon={CalendarCheck} tone="green" />
          <Kpi label="Relatórios pendentes" value={m.reportsPending} icon={FileBarChart} tone={m.reportsPending ? "amber" : "gray"} />
          <Kpi label="Projetos em andamento" value={m.projects} icon={Route} tone="gray" />
          <Kpi label="Clientes c/ tarefas atrasadas" value={m.clientsLateTasks} icon={ListTodo} tone={m.clientsLateTasks ? "red" : "gray"} />
        </div>
      </section>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-4 lg:col-span-2"><p className="font-medium mb-3">Evolução das vendas e faturamento</p><AreaMoney data={m.series} keys={[{ key: "faturamento", name: "Faturamento" }]} height={240} /></div>
        <div className="card p-4"><p className="font-medium mb-3">Leads por origem</p>{m.bySource.length ? <Donut data={m.bySource} /> : <p className="text-sm text-muted">Sem leads no período.</p>}</div>
        <div className="card p-4"><p className="font-medium mb-3">Vendas por período</p><Bars data={m.series} keys={[{ key: "leads", name: "Leads", color: "#3B82F6" }, { key: "vendas", name: "Vendas", color: "#10B981" }]} height={240} /></div>
        <div className="card p-4"><p className="font-medium mb-3">Conversão por vendedor</p>{m.bySeller.length ? <Lines data={m.bySeller} keys={[{ key: "conversao", name: "Conversão %" }]} pctAxis height={240} /> : <p className="text-sm text-muted">Sem dados.</p>}</div>
        <div className="card p-4"><p className="font-medium mb-3">Funil do período</p><ul className="space-y-2">{m.funnel.map((f) => { const max = Math.max(1, ...m.funnel.map((x) => x.count)); return <li key={f.label} className="text-xs"><div className="flex justify-between mb-0.5"><span>{f.label}</span><span className="tabular-nums text-muted">{f.count}</span></div><div className="h-2 rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(f.count / max) * 100}%`, background: f.color }} /></div></li>; })}</ul></div>
      </div>

      {ranking.length > 0 && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="card p-4 lg:col-span-2"><p className="font-medium mb-3">Desempenho da equipe</p><Bars data={m.bySeller} keys={[{ key: "faturamento", name: "Faturamento" }]} money height={240} /></div>
          <div className="card p-4"><div className="flex items-center justify-between mb-3"><p className="font-medium flex items-center gap-2"><Trophy size={16} className="text-gold" /> Ranking</p><Link href="/ranking" className="text-xs text-brand">Ver completo</Link></div>
            <ol className="space-y-2">{ranking.slice(0, 5).map((r) => <li key={r.user.id} className="flex items-center gap-3 text-sm"><span className={`w-6 text-center font-semibold ${r.position === 1 ? "text-gold" : r.position === 2 ? "text-silver" : r.position === 3 ? "text-bronze" : "text-muted"}`}>{r.position}º</span><Avatar name={r.user.name} src={r.user.avatarUrl} size={28} /><div className="flex-1 min-w-0"><p className="font-medium truncate">{r.user.name}</p><p className="text-xs text-muted">{r.sales} vendas · {brl(r.revenue)}</p></div><Badge tone="gold">{r.points} pts</Badge></li>)}</ol>
          </div>
        </div>
      )}
    </div>
  );
}
