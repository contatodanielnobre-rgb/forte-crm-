"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { PeriodKey } from "@/lib/period";

export function PeriodFilter({ periods, value }: { periods: { key: PeriodKey; label: string }[]; value: PeriodKey }) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const set = (patch: Record<string, string>) => { const p = new URLSearchParams(sp.toString()); Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k))); router.replace(`${path}?${p}`); };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex bg-surface border border-line rounded-xl p-1 overflow-x-auto">{periods.map((p) => <button key={p.key} onClick={() => set({ p: p.key })} className={cn("px-3 h-8 rounded-lg text-sm whitespace-nowrap", value === p.key ? "bg-brand text-white" : "text-muted hover:text-fg")}>{p.label}</button>)}</div>
      {value === "custom" && <><input type="date" className="input h-9 w-40" defaultValue={sp.get("de") ?? ""} onChange={(e) => set({ de: e.target.value })} /><span className="text-muted text-sm">até</span><input type="date" className="input h-9 w-40" defaultValue={sp.get("ate") ?? ""} onChange={(e) => set({ ate: e.target.value })} /></>}
    </div>
  );
}
