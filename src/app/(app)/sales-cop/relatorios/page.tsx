import Link from "next/link";
import { and, eq, inArray, asc } from "drizzle-orm";
import { FileBarChart, Sparkles } from "lucide-react";
import { db, t } from "@/db";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Badge, Empty, PageHeader, Progress } from "@/components/ui";
import { AI_REPORT_TYPES, getAiReport, listAiReports, type ReportContent } from "@/lib/salescop/reports";
import { aiAvailable } from "@/lib/salescop/ai";
import { getSalesCopSettings } from "@/lib/salescop/settings";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReportGenerator } from "./report-gen";

export const dynamic = "force-dynamic";

export default async function AiReportsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const user = await requirePage("salescop.view");
  const manage = can(user.role, "salescop.manage");
  const sp = await searchParams;
  const settings = await getSalesCopSettings();
  const all = await listAiReports(40);
  const list = all.filter((r) => manage || (r.kind === "vendedor" && r.userId === user.id));
  const selected = sp.id ? await getAiReport(sp.id) : list[0] ?? null;
  const visible = selected && (manage || (selected.kind === "vendedor" && selected.userId === user.id)) ? selected : null;
  const sellers = manage ? await db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(and(eq(t.users.active, true), inArray(t.users.role, ["COMERCIAL", "GESTOR", "ADMIN"]))).orderBy(asc(t.users.name)) : [{ id: user.id, name: user.name }];
  const c = visible?.content as ReportContent | undefined;
  const Block = ({ title, items, tone = "" }: { title: string; items: string[]; tone?: string }) => <div><p className={cn("text-[11px] font-semibold uppercase tracking-wide mb-1", tone || "text-muted")}>{title}</p>{items.length ? <ul className="text-sm space-y-1">{items.map((x, i) => <li key={i}>• {x}</li>)}</ul> : <p className="text-sm text-muted">Nada a registrar.</p>}</div>;

  return (
    <div className="space-y-5">
      <PageHeader title="Relatórios Inteligentes" subtitle="Indicadores, metas, resultados, planejado × realizado, problemas, oportunidades e recomendações do SALES COP" />
      <div className="grid lg:grid-cols-[300px_1fr] gap-5">
        <div className="space-y-4">
          <ReportGenerator sellers={sellers} canManage={manage} aiOn={aiAvailable() && settings.ai.enabled} />
          <div className="card p-2 max-h-[520px] overflow-y-auto">
            {list.length === 0 ? <p className="text-sm text-muted p-3">Nenhum relatório gerado ainda. A rotina de encerramento gera o diário automaticamente.</p> : list.map((r) => <Link key={r.id} href={`?id=${r.id}`} className={cn("block px-3 py-2 rounded-xl text-sm", visible?.id === r.id ? "bg-brand/10 text-brand" : "hover:bg-surface-2")}><p className="font-medium truncate">{AI_REPORT_TYPES.find((x) => x.key === r.kind)?.label}{r.user ? ` · ${r.user.name.split(" ")[0]}` : ""}</p><p className="text-[11px] text-muted">{fmtDateTime(r.createdAt)}{r.generatedBy === "ia" ? " · IA" : ""}</p></Link>)}
          </div>
        </div>
        {!visible || !c ? <div className="card"><Empty icon={FileBarChart} title="Selecione ou gere um relatório" /></div> : (
          <article className="card p-5 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">{visible.title}</h2><p className="text-xs text-muted">Gerado em {fmtDateTime(visible.createdAt)} · {visible.generatedBy === "ia" ? "regras + IA" : "regras do SALES COP"}</p></div><Badge tone="brand">{AI_REPORT_TYPES.find((x) => x.key === visible.kind)?.label}</Badge></div>
            {visible.narrative && <div className="rounded-xl bg-[#0a0a0c] text-white p-4"><p className="text-[11px] font-semibold tracking-widest text-brand mb-2 flex items-center gap-1.5"><Sparkles size={12} /> ANÁLISE DO SALES COP</p><pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-white/90">{visible.narrative}</pre></div>}
            <section><p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">1. Indicadores</p><div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">{c.indicadores.map((i) => <div key={i.label} className="rounded-xl bg-surface-2 p-2.5"><p className="text-[11px] text-muted">{i.label}</p><p className="font-semibold tabular-nums">{i.value}</p></div>)}</div></section>
            <section><p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">2. Metas</p><div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">{c.metas.map((i) => <div key={i.label} className="rounded-xl bg-surface-2 p-2.5"><p className="text-[11px] text-muted">{i.label}</p><p className="font-semibold tabular-nums">{i.value}</p></div>)}</div></section>
            <Block title="3. Resultados" items={c.resultados} tone="text-emerald-600" />
            <section><p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">4. Planejado × realizado</p>{c.comparacao.map((x, i) => <div key={i}><div className="flex justify-between text-sm"><span>{x.detalhe}</span><span className="tabular-nums font-medium">{x.pct}%</span></div><Progress value={x.pct} tone={x.pct >= 80 ? "green" : x.pct >= 50 ? "amber" : "brand"} className="mt-1" /></div>)}</section>
            <Block title="5. Problemas identificados" items={c.problemas} tone="text-brand" />
            <Block title="6. Oportunidades de melhoria" items={c.oportunidades} tone="text-amber-600" />
            <Block title="7. Recomendações do SALES COP" items={c.recomendacoes} />
            {c.tabela && <section className="overflow-x-auto"><table className="table"><thead><tr>{c.tabela.columns.map((col) => <th key={col}>{col}</th>)}</tr></thead><tbody>{c.tabela.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === "number" ? "tabular-nums" : ""}>{v}</td>)}</tr>)}</tbody></table></section>}
          </article>
        )}
      </div>
    </div>
  );
}
