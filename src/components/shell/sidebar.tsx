"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, KanbanSquare, Users, Wallet, CalendarDays, Route, Video, BarChart3, Trophy, Settings, X, ShieldCheck, MessageCircle, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/db/schema";
import { can, type Permission } from "@/lib/permissions";

export const NAV: { href: string; label: string; icon: typeof LayoutDashboard; perm: Permission }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
  { href: "/forte-chat", label: "FORTE CHAT", icon: MessageCircle, perm: "chat.view" },
  { href: "/forte-chat/tarefas", label: "Minhas Tarefas", icon: ListChecks, perm: "chat.view" },
  { href: "/pipeline", label: "Pipeline de Vendas", icon: KanbanSquare, perm: "pipeline.view" },
  { href: "/clientes", label: "Clientes", icon: Users, perm: "clients.view" },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, perm: "finance.view" },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, perm: "agenda.view" },
  { href: "/jornada", label: "Jornada do Cliente", icon: Route, perm: "clients.view" },
  { href: "/reunioes", label: "Reuniões", icon: Video, perm: "meetings.view" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, perm: "reports.view" },
  { href: "/ranking", label: "Ranking de Vendas", icon: Trophy, perm: "ranking.view" },
  { href: "/sales-cop", label: "SALES COP AI", icon: ShieldCheck, perm: "salescop.view" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, perm: "settings.manage" },
];

export function Sidebar({ role, open, onClose, companyName }: { role: Role; open: boolean; onClose: () => void; companyName: string }) {
  const path = usePathname();
  return (
    <>
      <div className={cn("fixed inset-0 z-40 bg-black/50 lg:hidden transition", open ? "opacity-100" : "opacity-0 pointer-events-none")} onClick={onClose} />
      <aside className={cn("fixed z-40 inset-y-0 left-0 w-[260px] bg-[#0a0a0c] text-white flex flex-col border-r border-white/5 transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="h-16 flex items-center justify-between px-5 border-b border-white/5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <Image src="/brand/logo-mark.png" alt="" width={34} height={34} />
            <div className="leading-tight"><p className="font-semibold tracking-tight">FORTE <span className="text-brand">CRM</span></p><p className="text-[10px] text-white/40 uppercase tracking-widest">{companyName}</p></div>
          </Link>
          <button onClick={onClose} className="lg:hidden text-white/60 hover:text-white"><X size={18} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {NAV.filter((n) => can(role, n.perm)).map((n) => {
            const active = n.href === "/forte-chat" ? path === n.href || path.startsWith("/forte-chat/configuracoes") : path === n.href || path.startsWith(n.href + "/");
            return (
              <Link key={n.href} href={n.href} onClick={onClose} className={cn("nav-item", active && "active", n.href === "/sales-cop" && "mt-2 border border-brand/30 bg-gradient-to-r from-brand/10 to-transparent")}>
                <n.icon size={18} className={n.href === "/sales-cop" ? "text-brand" : n.href === "/forte-chat" ? "text-gold" : undefined} /> <span className={n.href === "/sales-cop" ? "font-semibold tracking-wide text-white" : n.href === "/forte-chat" ? "font-semibold tracking-wide text-white" : undefined}>{n.label}</span>
                {n.href === "/sales-cop" && <span className="ml-auto text-[9px] font-bold tracking-widest text-brand">AI</span>}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 text-[11px] text-white/30 border-t border-white/5">Forte Company · Marketing e Vendas</div>
      </aside>
    </>
  );
}
