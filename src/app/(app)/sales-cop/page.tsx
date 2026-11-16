import Link from "next/link";
import { Inbox, Sparkles, PhoneMissed, PauseCircle, Clock, ListTodo, Video, CalendarCheck, FileText, Trophy, Wallet, Target, Percent, Gauge, CheckCircle2, XCircle, UserCog, AlertTriangle, Search, Zap, ShieldAlert, PlayCircle } from "lucide-react";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Kpi, Progress } from "@/components/ui";
import { ActionButton } from "@/components/action-form";
import { HealthRing } from "@/components/salescop/brand";
import { AgentChat } from "@/components/salescop/agent-chat";
import { analyzeOperation } from "@/lib/salescop/analysis";
import { getPlan } from "@/lib/salescop/plan";
import { aiAvailable } from "@/lib/salescop/ai";
import { brl, pct, fmtDateTime } from "@/lib/format";
import { askAgent, generatePlan, runInspection } from "./actions";

export const dynamic = "force-dynamic";

export default async function CommandCenter() {
  const user = await requirePage("salescop.view");
  const manage = can(user.role, "salescop.manage");
  const snap = await analyzeOperation({ scopeUserId: manage ? null : user.id });
  const plan = await getPlan();
  const k = snap.kpis, h = snap.health, I = snap.intelligence;
  const aiOn = aiAvailable() && snap.settings.ai.enabled;
  const greeting = `Olá, ${user.name.split(" ")[0]}. Índice de Saúde Comercial em ${h.score} (${h.state}). ${snap.findings.length ? `Há ${snap.findings.length} pendências na fiscalização` : "Nenhuma pendência na fiscalização"}${plan ? ` e o plano de hoje está ${plan.status === "APROVADO" ? "em execução" : plan.status.toLowerCase()}` : " e o plano de hoje ainda não foi gerado"}. Em que posso ajudar?`;
  const Section = ({ title, icon: Icon, items, tone, empty }: { title: string; icon: typeof Inbox; items: string[]; tone: string; empty: string }) => (
    <div className="card p-4">
      <p className={`font-medium flex items-center gap-2 mb-2 ${tone}`}><Icon size={16} /> {title}</p>
      {items.length ? <ul className="space-y-1.5 text-sm">{items.slice(0, 8).map((x, i) => <li key={i} className="flex gap-2"><span className="text-muted">•</span><span>{x}</span></li>)}</ul> : <p className="text-sm text-muted">{empty}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Índice de saúde */}
        <div className="relative overflow-hidden rounded-2xl bg-[#0a0a0c] text-white border border-white/5 p-5 flex flex-col">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(217,30,58,.18),transparent_60%)]" />
          <div className="relative flex items-center gap-4">
            <HealthRing score={h.score} state={h.state} />
            <div>
              <p className="text-[10px] tracking-[0.25em] text-white/50 uppercase">Índice de</p>
              <p className="text-lg font-bold tracking-wide leading-tight">SAÚDE COMERCIAL</p>
              <p className="text-xs text-white/60 mt-1.5">{h.state === "VERDE" ? "Operação saudável." : h.state === "AMARELO" ? "Operação exige atenção." : "Operação em situação crítica."}</p>
              <p className="text-[10px] text-white/40 mt-1">Analisado {fmtDateTime(snap.generatedAt)}</p>
            </div>
          </div>
          <ul className="relative mt-4 space-y-1.5">
            {h.criteria.map((c) => <li key={c.key} className="text-xs"><div className="flex justify-between"><span className="text-white/70">{c.label} <span className="text-white/30">· peso {c.weight}</span></span><span className="tabular-nums font-medium">{c.score}</span></div><div className="h-1.5 rounded-full bg-white/10 mt-1"><div className="h-full rounded-full" style={{ width: `${c.score}%`, background: c.score >= 75 ? "#10B981" : c.score >= 50 ? "#F59E0B" : "#D91E3A" }} /></div></li>)}
          </ul>
          {manage && <div className="relative mt-4 flex flex-wrap gap-2">
            <ActionButton action={runInspection} className="btn-sm bg-white/10 text-white hover:bg-white/20 rounded-lg px-3 inline-flex items-center gap-1.5 text-xs" success="Fiscalização atualizada."><Search size={13} /> Rodar fiscalização</ActionButton>
            <ActionButton action={generatePlan} className="btn-sm bg-brand text-white hover:bg-brand-600 rounded-lg px-3 inline-flex items-center gap-1.5 text-xs" success="Plano do dia gerado."><PlayCircle size={13} /> {plan ? "Atualizar plano" : "Gerar plano do dia"}</ActionButton>
          </div>}
        </div>

        {/* Chat */}
        <div className="lg:col-span-2"><AgentChat ask={askAgent} greeting={greeting} aiOn={aiOn} /></div>
      </div>

      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Indicadores da operação · {manage ? "equipe" : "meus leads"}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <Kpi label="Leads ativos" value={k.activeLeads} icon={Inbox} tone="blue" />
          <Kpi label="Leads novos" value={k.newLeads} icon={Sparkles} tone="blue" />
          <Kpi label="Sem primeiro contato" value={k.noFirstContact} icon={PhoneMissed} tone={k.noFirstContact ? "red" : "gray"} />
          <Kpi label="Sem movimentação / parados" value={k.stalledLeads} icon={PauseCircle} tone={k.stalledLeads ? "amber" : "gray"} />
          <Kpi label="Follow-ups atrasados" value={k.lateFollowUps} icon={Clock} tone={k.lateFollowUps ? "red" : "gray"} />
          <Kpi label="Atividades pendentes" value={k.pendingTasks} hint={`${k.lateTasks} atrasadas`} icon={ListTodo} tone={k.lateTasks ? "amber" : "gray"} />
          <Kpi label="Reuniões agendadas" value={k.meetingsScheduled} hint={k.meetingsUnconfirmed ? `${k.meetingsUnconfirmed} sem confirmação` : undefined} icon={Video} tone="blue" />
          <Kpi label="Reuniões realizadas" value={k.meetingsDone} icon={CalendarCheck} tone="green" />
          <Kpi label="Propostas / negociações" value={k.proposals} hint={k.proposalsNoFollowUp ? `${k.proposalsNoFollowUp} sem retorno` : undefined} icon={FileText} tone={k.proposalsNoFollowUp ? "amber" : "gray"} />
          <Kpi label="Vendas fechadas" value={k.sales} icon={Trophy} tone="green" />
          <Kpi label="Faturamento realizado" value={brl(k.revenue, { compact: true })} icon={Wallet} tone="green" />
          <Kpi label="Meta comercial" value={brl(k.goal, { compact: true })} hint={`${pct(k.goalPct, 0)} · faltam ${brl(k.remaining, { compact: true })}`} icon={Target} tone="gold" />
          <Kpi label="Taxa de conversão" value={pct(k.conversion)} icon={Percent} tone="brand" />
          <Kpi label="Produtividade da equipe" value={`${k.productivity}/100`} hint={`${k.contactsToday} contatos hoje`} icon={Gauge} tone={k.productivity >= 70 ? "green" : k.productivity >= 40 ? "amber" : "red"} />
        </div>
      </section>

      <div className="card p-4"><div className="flex items-center justify-between mb-2"><p className="font-medium flex items-center gap-2"><Target size={16} className="text-brand" /> Meta do mês</p><Link href="/sales-cop/plano" className="text-xs text-brand">Ver plano do dia →</Link></div><Progress value={k.goalPct} tone={k.goalPct >= 100 ? "green" : "brand"} /><p className="text-xs text-muted mt-1.5">{brl(k.revenue)} de {brl(k.goal)} · {pct(k.goalPct, 0)}</p></div>

      <section>
        <div className="flex items-center gap-2 mb-2"><ShieldAlert size={16} className="text-brand" /><p className="text-xs font-semibold uppercase tracking-wide text-muted">Relatório de Inteligência do SALES COP</p></div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          <Section title="O que está funcionando" icon={CheckCircle2} items={I.working} tone="text-emerald-600 dark:text-emerald-400" empty="Ainda sem sinais positivos consolidados — registre contatos e reuniões para o SALES COP avaliar." />
          <Section title="O que está errado" icon={XCircle} items={I.wrong} tone="text-brand" empty="Nenhuma irregularidade detectada. 👏" />
          <Section title="Vendedores que precisam de atenção" icon={UserCog} items={I.sellersAttention} tone="text-amber-600 dark:text-amber-400" empty="Nenhum vendedor com sinal de alerta." />
          <Section title="Oportunidades em risco" icon={AlertTriangle} items={I.riskOpportunities} tone="text-brand" empty="Nenhuma oportunidade em risco." />
          <Section title="Onde estão os gargalos" icon={Search} items={I.bottlenecks} tone="text-blue-600 dark:text-blue-400" empty={snap.bottlenecks[0]?.needsData ?? "Nenhum gargalo relevante no funil dos últimos 90 dias."} />
          <Section title="Ações imediatas" icon={Zap} items={I.immediateActions} tone="text-brand" empty="Nenhuma ação urgente. Mantenha o ritmo de contatos e follow-ups." />
        </div>
      </section>
    </div>
  );
}
