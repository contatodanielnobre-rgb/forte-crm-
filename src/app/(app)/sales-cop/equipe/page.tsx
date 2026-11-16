import { Trophy, Users } from "lucide-react";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Avatar, Badge, Empty, PageHeader, Progress } from "@/components/ui";
import { PeriodFilter } from "@/components/period-filter";
import { Bars } from "@/components/charts";
import { PERIODS, resolvePeriod } from "@/lib/period";
import { analyzeOperation } from "@/lib/salescop/analysis";
import { brl, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ p?: string; de?: string; ate?: string }> }) {
  const user = await requirePage("salescop.view");
  const manage = can(user.role, "salescop.manage");
  const sp = await searchParams;
  const period = resolvePeriod(sp.p ?? "mes", sp.de, sp.ate);
  const snap = await analyzeOperation({ from: period.from, to: period.to, scopeUserId: manage ? null : user.id });
  const S = snap.sellers;
  const best = S[0], belowGoal = S.filter((s) => s.flags.includes("abaixo da meta")), stalled = S.filter((s) => s.flags.includes("muitos leads parados")), lowConv = S.filter((s) => s.flags.includes("baixa conversão")), training = S.filter((s) => s.flags.includes("baixa conversão") || s.flags.includes("lento no primeiro contato") || s.flags.includes("reuniões sem desfecho"));
  const stageIssue = S.filter((s) => s.flags.includes("reuniões sem desfecho") || s.flags.includes("lento no primeiro contato")).map((s) => `${s.name.split(" ")[0]} (${s.flags.includes("lento no primeiro contato") ? "primeiro contato" : "reuniões"})`);
  const Card = ({ title, items, empty }: { title: string; items: string[]; empty: string }) => <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">{title}</p>{items.length ? <ul className="text-sm space-y-1">{items.map((x, i) => <li key={i}>• {x}</li>)}</ul> : <p className="text-sm text-muted">{empty}</p>}</div>;

  return (
    <div className="space-y-5">
      <PageHeader title="Desempenho da Equipe" subtitle="Inteligência individual por vendedor — produtividade e resultados, não apenas quantidade de tarefas" actions={<PeriodFilter periods={PERIODS} value={period.key} />} />
      {S.length === 0 ? <div className="card"><Empty icon={Users} title="Sem vendedores com atividade no período" /></div> : <>
        {manage && <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          <Card title="Quem está performando melhor" items={best ? [`${best.name} — score ${best.score} (${pct(best.goalPct, 0)} da meta, conversão ${pct(best.conversion)})`] : []} empty="—" />
          <Card title="Quem está abaixo da meta" items={belowGoal.map((s) => `${s.name} — ${pct(s.goalPct, 0)} (faltam ${brl(Math.max(0, s.goal - s.revenue))})`)} empty="Todos no ritmo da meta." />
          <Card title="Quem possui muitos leads parados" items={stalled.map((s) => `${s.name} — ${s.stalledLeads} de ${s.openLeads} leads ativos`)} empty="Nenhum vendedor com acúmulo de leads parados." />
          <Card title="Quem tem baixa conversão" items={lowConv.map((s) => `${s.name} — ${pct(s.conversion)} sobre ${s.leadsReceived} leads`)} empty="Conversões dentro do esperado." />
          <Card title="Quem precisa de treinamento" items={training.map((s) => `${s.name} — ${s.flags.filter((f) => ["baixa conversão", "lento no primeiro contato", "reuniões sem desfecho"].includes(f)).join(", ")}`)} empty="Nenhuma necessidade de treinamento identificada." />
          <Card title="Dificuldades em etapa específica" items={stageIssue} empty="Nenhuma dificuldade concentrada em uma etapa." />
        </div>}

        <div className="card overflow-x-auto">
          <div className="p-4 border-b border-line flex items-center gap-2"><Trophy size={16} className="text-gold" /><p className="font-medium">Ranking de produtividade e resultados</p><span className="text-xs text-muted">· score = 40% produtividade + 60% resultado</span></div>
          <table className="table"><thead><tr><th>#</th><th>Vendedor</th><th>Leads</th><th>Contatos</th><th>1º contato</th><th>Qualif.</th><th>Reuniões</th><th>Propostas</th><th>Vendas</th><th>Faturamento</th><th>Ticket</th><th>Conversão</th><th>Follow-ups</th><th>Atrasos</th><th>Meta</th><th>Score</th></tr></thead><tbody>
            {S.map((s) => <tr key={s.id}>
              <td className={cn("font-semibold", s.position === 1 ? "text-gold" : s.position === 2 ? "text-silver" : s.position === 3 ? "text-bronze" : "text-muted")}>{s.position}º</td>
              <td><div className="flex items-center gap-2"><Avatar name={s.name} src={s.avatarUrl} size={26} /><div><p className="font-medium whitespace-nowrap">{s.name}</p>{s.flags.length > 0 && <p className="text-[10px] text-brand">{s.flags.join(" · ")}</p>}</div></div></td>
              <td className="tabular-nums">{s.leadsReceived}<span className="text-muted text-xs"> / {s.openLeads} ativos</span></td>
              <td className="tabular-nums">{s.contacts}</td>
              <td className="tabular-nums">{s.avgFirstResponseHours === null ? "—" : <span className={s.avgFirstResponseHours > snap.settings.rules.firstContactHours ? "text-brand" : "text-emerald-600"}>{s.avgFirstResponseHours}h</span>}</td>
              <td className="tabular-nums">{s.qualified}</td>
              <td className="tabular-nums">{s.meetingsDone}<span className="text-muted text-xs"> / {s.meetingsScheduled} agend.</span></td>
              <td className="tabular-nums">{s.proposals}</td>
              <td className="tabular-nums">{s.sales}</td>
              <td className="tabular-nums whitespace-nowrap">{brl(s.revenue)}</td>
              <td className="tabular-nums whitespace-nowrap">{brl(s.ticket)}</td>
              <td className="tabular-nums">{pct(s.conversion)}</td>
              <td className="tabular-nums">{s.followUps}</td>
              <td className="tabular-nums">{s.lateActivities ? <Badge tone="red">{s.lateActivities}</Badge> : 0}</td>
              <td className="min-w-[120px]"><div className="flex items-center gap-2"><Progress value={s.goalPct} tone={s.goalPct >= 100 ? "green" : "brand"} className="w-16" /><span className="text-xs tabular-nums">{pct(s.goalPct, 0)}</span></div></td>
              <td><Badge tone={s.score >= 70 ? "green" : s.score >= 40 ? "amber" : "red"}>{s.score}</Badge><p className="text-[10px] text-muted mt-0.5 whitespace-nowrap">prod {s.productivityScore} · res {s.resultScore}</p></td>
            </tr>)}
          </tbody></table>
        </div>

        {manage && S.length > 1 && <div className="grid lg:grid-cols-2 gap-4">
          <div className="card p-4"><p className="font-medium mb-3">Contatos × reuniões × vendas</p><Bars data={S.map((s) => ({ label: s.name.split(" ")[0], contatos: s.contacts, reunioes: s.meetingsDone, vendas: s.sales }))} keys={[{ key: "contatos", name: "Contatos", color: "#3B82F6" }, { key: "reunioes", name: "Reuniões", color: "#F59E0B" }, { key: "vendas", name: "Vendas", color: "#10B981" }]} height={240} /></div>
          <div className="card p-4"><p className="font-medium mb-3">Faturamento por vendedor</p><Bars data={S.map((s) => ({ label: s.name.split(" ")[0], faturamento: s.revenue }))} keys={[{ key: "faturamento", name: "Faturamento" }]} money height={240} /></div>
        </div>}
      </>}
    </div>
  );
}
