import { Check, Repeat, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { JOURNEY_STEPS, isStepLate, journeyProgress } from "@/lib/services/journey";
import type { JourneyKey } from "@/db/schema";
import { fmtDate } from "@/lib/format";

export type StepLite = { key: JourneyKey; status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO"; recurring: boolean; dueAt: Date | null; completedAt: Date | null; owner?: { name: string } | null };

export function JourneyBar({ steps, compact, activeKey, hrefBase }: { steps: StepLite[]; compact?: boolean; activeKey?: string; hrefBase?: string }) {
  const map = new Map(steps.map((s) => [s.key, s]));
  const pct = journeyProgress(steps);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2"><div className="h-2 flex-1 rounded-full bg-surface-2 overflow-hidden"><div className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : "bg-brand")} style={{ width: `${pct}%` }} /></div><span className="text-xs font-medium tabular-nums w-10 text-right">{pct}%</span></div>
      <ol className={cn("grid gap-1", compact ? "grid-cols-6" : "grid-cols-3 sm:grid-cols-6")}>
        {JOURNEY_STEPS.map((def, i) => {
          const s = map.get(def.key); const st = s?.status ?? "PENDENTE"; const late = s ? isStepLate(s) : false;
          const inner = (
            <div className={cn("rounded-xl border p-2 text-center transition h-full", st === "CONCLUIDO" ? "border-emerald-500/30 bg-emerald-500/5" : st === "EM_ANDAMENTO" ? "border-brand/40 bg-brand/5" : late ? "border-red-500/40 bg-red-500/5" : "border-line bg-surface", activeKey === def.key && "ring-2 ring-brand/40")}>
              <div className={cn("mx-auto w-6 h-6 rounded-full grid place-items-center text-[11px] font-semibold mb-1", st === "CONCLUIDO" ? "bg-emerald-500 text-white" : st === "EM_ANDAMENTO" ? "bg-brand text-white" : late ? "bg-red-500 text-white" : "bg-surface-2 text-muted")}>
                {st === "CONCLUIDO" ? <Check size={13} /> : late ? <AlertTriangle size={12} /> : def.recurring && st === "EM_ANDAMENTO" ? <Repeat size={12} /> : i + 1}
              </div>
              <p className={cn("font-medium leading-tight", compact ? "text-[10px]" : "text-xs")}>{compact ? def.short : def.label}</p>
              {!compact && <p className="text-[10px] text-muted mt-0.5">{st === "CONCLUIDO" ? `Concluído ${fmtDate(s?.completedAt, "dd/MM")}` : def.recurring ? (st === "EM_ANDAMENTO" ? "Recorrente · ativo" : "Recorrente") : s?.dueAt ? `${late ? "Atrasado desde" : "Prazo"} ${fmtDate(s.dueAt, "dd/MM")}` : "Pendente"}</p>}
            </div>
          );
          return <li key={def.key}>{hrefBase ? <a href={`${hrefBase}${def.key}`} className="block h-full">{inner}</a> : inner}</li>;
        })}
      </ol>
    </div>
  );
}
