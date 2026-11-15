"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import type { Stage, UserOption } from "./types";

export function Filters({ users, stages, canFilterSeller }: { users: UserOption[]; stages: Stage[]; canFilterSeller: boolean }) {
  const router = useRouter(); const sp = useSearchParams(); const path = usePathname();
  const set = (k: string, v: string) => { const p = new URLSearchParams(sp.toString()); if (v) p.set(k, v); else p.delete(k); p.delete("novo"); router.replace(`${path}?${p.toString()}`); };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input defaultValue={sp.get("q") ?? ""} onKeyDown={(e) => e.key === "Enter" && set("q", (e.target as HTMLInputElement).value)} placeholder="Buscar lead..." className="input h-9 pl-8 w-44" /></div>
      {canFilterSeller && <select className="input h-9 w-44" value={sp.get("vendedor") ?? ""} onChange={(e) => set("vendedor", e.target.value)}><option value="">Todos os vendedores</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
      <select className="input h-9 w-40" value={sp.get("periodo") ?? "todos"} onChange={(e) => set("periodo", e.target.value === "todos" ? "" : e.target.value)}>
        <option value="todos">Todo o período</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option>
      </select>
      <select className="input h-9 w-44" value={sp.get("etapa") ?? ""} onChange={(e) => set("etapa", e.target.value)}><option value="">Todas as etapas</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
    </div>
  );
}
