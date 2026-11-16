import { Search, Microscope } from "lucide-react";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { SEVERITY_TONE } from "@/components/salescop/brand";
import { analyzeOperation } from "@/lib/salescop/analysis";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BottlenecksPage() {
  const user = await requirePage("salescop.view");
  const manage = can(user.role, "salescop.manage");
  const snap = await analyzeOperation({ scopeUserId: manage ? null : user.id });
  const max = Math.max(1, ...snap.funnel.map((f) => f.reached));
  return (
    <div className="space-y-5">
      <PageHeader title="Investigação de Gargalos" subtitle="Onde o processo comercial perde oportunidades — fatos comprovados × hipóteses (últimos 90 dias)" />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="font-medium mb-3 flex items-center gap-2"><Search size={16} className="text-brand" /> Funil de conversão</p>
          <ul className="space-y-2.5">{snap.funnel.map((f, i) => <li key={f.stage} className="text-xs"><div className="flex justify-between mb-0.5"><span>{f.stage}</span><span className="tabular-nums text-muted">{f.reached}{i > 0 && f.conversionFromPrev !== null && <span className={cn("ml-1.5 font-medium", f.conversionFromPrev < 40 ? "text-brand" : f.conversionFromPrev < 70 ? "text-amber-500" : "text-emerald-600")}>{pct(f.conversionFromPrev, 0)}</span>}</span></div><div className="h-2 rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(f.reached / max) * 100}%`, background: f.color }} /></div></li>)}</ul>
          <p className="text-[11px] text-muted mt-3">“Alcançaram” = leads que passaram pela etapa (ou além). O % é a conversão em relação à etapa anterior.</p>
        </div>
        <div className="lg:col-span-2 space-y-3">
          {snap.bottlenecks.length === 0 ? <div className="card"><Empty icon={Microscope} title="Nenhum gargalo identificado" hint="O funil está dentro dos parâmetros nos últimos 90 dias." /></div> : snap.bottlenecks.map((b) => (
            <article key={b.key} className="card p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2"><span className={cn("badge", SEVERITY_TONE[b.severity])}>{b.severity === "CRITICO" ? "CRÍTICO" : b.severity === "MEDIO" ? "MÉDIO" : b.severity}</span><p className="font-medium">{b.title}</p></div>
              <div><p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Problema identificado</p><p className="text-sm">{b.problem}</p></div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Fatos comprovados</p><ul className="text-sm space-y-0.5 mt-0.5">{b.facts.map((f, i) => <li key={i}>• {f}</li>)}</ul></div>
                <div><p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Diagnóstico (hipóteses)</p>{b.hypotheses.length ? <ul className="text-sm space-y-0.5 mt-0.5">{b.hypotheses.map((h, i) => <li key={i}>• {h}</li>)}</ul> : <p className="text-sm text-muted mt-0.5">{b.needsData ?? "Sem hipóteses."}</p>}</div>
              </div>
              <div><p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Recomendação do SALES COP</p><ol className="text-sm space-y-0.5 mt-0.5 list-decimal pl-5">{b.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ol></div>
              {b.needsData && <p className="text-xs text-muted"><Badge tone="amber">Dados insuficientes</Badge> {b.needsData}</p>}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
