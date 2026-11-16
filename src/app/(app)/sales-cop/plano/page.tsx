import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { CheckCircle2, ClipboardList, PlayCircle, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Badge, Empty, PageHeader, Progress } from "@/components/ui";
import { ActionButton } from "@/components/action-form";
import { STATUS_LABEL } from "@/components/salescop/brand";
import { getPlan, planDate } from "@/lib/salescop/plan";
import { getSalesCopSettings, MODE_LABEL } from "@/lib/salescop/settings";
import { fmtDateTime } from "@/lib/format";
import { approvePlan, generatePlan, rejectPlan } from "../actions";
import { AddItemButton, PlanItemRow, type Item } from "./plan-ui";

export const dynamic = "force-dynamic";

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const user = await requirePage("salescop.view");
  const manage = can(user.role, "salescop.manage");
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.data ?? "") ? sp.data! : planDate();
  const isToday = date === planDate();
  const [plan, settings, users, history, openStages] = await Promise.all([
    getPlan(date), getSalesCopSettings(),
    db.select({ id: t.users.id, name: t.users.name, avatarUrl: t.users.avatarUrl }).from(t.users).where(and(eq(t.users.active, true), inArray(t.users.role, ["COMERCIAL", "GESTOR", "ADMIN"]))).orderBy(asc(t.users.name)),
    db.query.aiActionPlans.findMany({ orderBy: [desc(t.aiActionPlans.date)], limit: 10, with: { items: { columns: { status: true, assigneeId: true } } } }),
    db.select({ id: t.pipelineStages.id }).from(t.pipelineStages).where(and(eq(t.pipelineStages.isWon, false), eq(t.pipelineStages.isLost, false))),
  ]);
  const leads = manage ? await db.select({ id: t.leads.id, name: t.leads.name }).from(t.leads).where(and(eq(t.leads.archived, false), inArray(t.leads.stageId, openStages.map((s) => s.id)))).orderBy(asc(t.leads.name)).limit(300) : [];
  const items = (plan?.items ?? []).filter((i) => manage || i.assigneeId === user.id) as unknown as Item[];
  const counts = { total: items.filter((i) => i.status !== "REJEITADO").length, done: items.filter((i) => i.status === "CONCLUIDO").length };
  const groups = ["URGENTE", "ALTA", "MEDIA", "BAIXA"].map((p) => ({ p, list: items.filter((i) => i.priority === p) })).filter((g) => g.list.length);
  const label = date.split("-").reverse().join("/");

  return (
    <div className="space-y-5">
      <PageHeader title={`Plano de Operação · ${label}`} subtitle={plan ? `Gerado ${plan.generatedBy === "ia" ? "com IA" : "pelas regras de fiscalização"} em ${fmtDateTime(plan.createdAt)}${plan.approvedBy ? ` · aprovado por ${plan.approvedBy.name}` : ""}` : "O SALES COP constrói o plano a partir da situação real da operação."}
        actions={manage && isToday ? <>
          <ActionButton action={generatePlan.bind(null, !!plan && plan.status !== "RASCUNHO")} className="btn-secondary btn-sm" success={plan ? "Plano atualizado." : "Plano gerado."} confirm={plan && plan.status !== "RASCUNHO" ? "Regenerar o plano aprovado? As atividades ainda não concluídas serão substituídas pela análise atual." : undefined}>{plan ? <><RefreshCw size={14} /> Regenerar</> : <><PlayCircle size={14} /> Gerar plano do dia</>}</ActionButton>
          {plan && <AddItemButton planId={plan.id} users={users} leads={leads} />}
          {plan?.status === "RASCUNHO" && <>
            <ActionButton action={rejectPlan.bind(null, plan.id)} className="btn-danger btn-sm" confirm="Rejeitar o plano de hoje?" success="Plano rejeitado."><ThumbsDown size={14} /> Rejeitar</ActionButton>
            <ActionButton action={approvePlan.bind(null, plan.id)} className="btn-primary btn-sm" success="Plano aprovado — tarefas criadas no CRM." confirm={settings.mode === "OBSERVADOR" ? "O agente está no modo Observador e não cria tarefas. Deseja continuar mesmo assim?" : undefined}><ThumbsUp size={14} /> Aprovar e criar tarefas</ActionButton>
          </>}
        </> : undefined} />

      {!plan ? <div className="card"><Empty icon={ClipboardList} title={isToday ? "O plano de hoje ainda não foi gerado" : `Não há plano registrado para ${label}`} hint={isToday ? (manage ? "Clique em “Gerar plano do dia” ou aguarde a rotina automática das " + settings.routine.steps.plano.time + "." : "Aguarde o gestor ou a rotina automática do SALES COP.") : undefined} /></div> : (
        <>
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="card p-4 lg:col-span-2">
              <div className="flex flex-wrap items-center gap-2 mb-2"><p className="font-medium">Resumo do SALES COP</p><Badge tone={plan.status === "APROVADO" ? "blue" : plan.status === "RASCUNHO" ? "amber" : plan.status === "REJEITADO" ? "red" : "gray"}>{STATUS_LABEL[plan.status]}</Badge><span className="text-xs text-muted">{MODE_LABEL[settings.mode]}</span></div>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{plan.summary}</pre>
              {plan.status === "RASCUNHO" && manage && <p className="text-xs text-muted mt-3">Revise as atividades abaixo (prioridade, responsável, horário), rejeite o que não fizer sentido e aprove para transformar o plano em tarefas reais no CRM.</p>}
            </div>
            <div className="card p-4">
              <p className="font-medium flex items-center gap-2 mb-2"><CheckCircle2 size={16} className="text-emerald-500" /> Execução</p>
              <p className="kpi-value">{counts.done} <span className="text-sm text-muted font-normal">de {counts.total} atividades</span></p>
              <Progress value={counts.total ? (counts.done / counts.total) * 100 : 0} tone={counts.done === counts.total && counts.total ? "green" : "brand"} className="my-3" />
              <ul className="text-xs text-muted space-y-1">{["URGENTE", "ALTA", "MEDIA", "BAIXA"].map((p) => { const l = items.filter((i) => i.priority === p && i.status !== "REJEITADO"); return l.length ? <li key={p} className="flex justify-between"><span>{p === "MEDIA" ? "Média" : p[0] + p.slice(1).toLowerCase()}</span><span className="tabular-nums">{l.filter((i) => i.status === "CONCLUIDO").length}/{l.length}</span></li> : null; })}</ul>
              {plan.snapshot && (plan.snapshot as { result?: { pct: number } }).result && <p className="text-xs mt-3">Encerramento: <strong>{(plan.snapshot as { result: { pct: number } }).result.pct}%</strong> do planejado realizado.</p>}
            </div>
          </div>

          {groups.length === 0 ? <div className="card"><Empty icon={ClipboardList} title="Nenhuma atividade atribuída a você neste plano" /></div> : groups.map((g) => (
            <section key={g.p}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{g.p === "MEDIA" ? "Média" : g.p} · {g.list.length}</p>
              <ul className="space-y-2">{g.list.map((i) => <PlanItemRow key={i.id} item={i} users={users} canManage={manage} me={user.id} />)}</ul>
            </section>
          ))}
        </>
      )}

      {history.length > 0 && <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Histórico de planos</p>
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Data</th><th>Status</th><th>Atividades</th><th>Concluídas</th><th>Execução</th></tr></thead><tbody>
          {history.map((h) => { const its = h.items.filter((i) => manage || i.assigneeId === user.id); const tot = its.filter((i) => i.status !== "REJEITADO").length, done = its.filter((i) => i.status === "CONCLUIDO").length; return <tr key={h.id}><td><a href={`/sales-cop/plano?data=${h.date}`} className="hover:text-brand font-medium">{h.date.split("-").reverse().join("/")}</a></td><td><Badge tone={h.status === "APROVADO" ? "blue" : h.status === "RASCUNHO" ? "amber" : h.status === "REJEITADO" ? "red" : "gray"}>{STATUS_LABEL[h.status]}</Badge></td><td className="tabular-nums">{tot}</td><td className="tabular-nums">{done}</td><td className="w-40"><Progress value={tot ? (done / tot) * 100 : 0} tone={tot && done === tot ? "green" : "brand"} /></td></tr>; })}
        </tbody></table></div>
      </section>}
    </div>
  );
}
