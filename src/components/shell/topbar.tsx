"use client";
import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Menu, Sun, Moon, Bell, LogOut, Plus, Search } from "lucide-react";
import { Avatar } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth";
import { setThemeAction } from "@/app/(app)/actions";
import { logoutAction } from "@/app/(auth)/actions";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Notif = { id: string; title: string; body: string | null; href: string | null; kind: string; readAt: Date | null; createdAt: Date };

export function Topbar({ user, onMenu, notifications, unread, markRead }: { user: SessionUser; onMenu: () => void; notifications: Notif[]; unread: number; markRead: () => Promise<void> }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [openN, setOpenN] = React.useState(false);
  const [openU, setOpenU] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  // Aplica a preferência salva do usuário uma única vez ao montar (login / novo dispositivo)
  const synced = React.useRef(false);
  React.useEffect(() => { if (!synced.current && user.theme && user.theme !== "system") { synced.current = true; setTheme(user.theme); } }, [user.theme, setTheme]);

  const toggle = () => { const next = resolvedTheme === "dark" ? "light" : "dark"; setTheme(next); setThemeAction(next); };

  return (
    <header className="sticky top-0 z-30 h-16 bg-bg/80 backdrop-blur border-b border-line flex items-center gap-3 px-4 sm:px-6">
      <button onClick={onMenu} className="btn-ghost btn-icon lg:hidden"><Menu size={20} /></button>
      <form action="/clientes" className="hidden md:flex items-center gap-2 h-9 px-3 rounded-xl bg-surface border border-line w-72 text-sm text-muted">
        <Search size={15} /><input name="q" placeholder="Buscar cliente..." className="bg-transparent outline-none flex-1 text-fg placeholder:text-muted/70" />
      </form>
      <div className="flex-1" />
      <Link href="/pipeline?novo=1" className="btn-primary btn-sm hidden sm:inline-flex"><Plus size={14} /> Novo lead</Link>
      <button onClick={toggle} className="btn-ghost btn-icon" aria-label="Alternar tema">{mounted && resolvedTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
      <div className="relative">
        <button onClick={() => { setOpenN((v) => !v); setOpenU(false); if (!openN && unread) markRead(); }} className="btn-ghost btn-icon relative" aria-label="Notificações">
          <Bell size={18} />{unread > 0 && <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-brand text-white text-[10px] grid place-items-center">{unread}</span>}
        </button>
        {openN && (
          <div className="absolute right-0 mt-2 w-80 card p-2 max-h-96 overflow-y-auto animate-fadeUp">
            <p className="px-3 py-2 text-xs font-medium text-muted">Notificações</p>
            {notifications.length === 0 && <p className="px-3 py-6 text-sm text-muted text-center">Nenhuma notificação.</p>}
            {notifications.map((n) => (
              <Link key={n.id} href={n.href || "#"} onClick={() => setOpenN(false)} className={cn("block px-3 py-2 rounded-xl hover:bg-surface-2", !n.readAt && "bg-brand/5")}>
                <p className="text-sm font-medium flex items-center gap-2"><span className={cn("w-1.5 h-1.5 rounded-full", { info: "bg-blue-500", warning: "bg-amber-500", success: "bg-emerald-500", danger: "bg-red-500" }[n.kind] ?? "bg-gray-400")} />{n.title}</p>
                {n.body && <p className="text-xs text-muted line-clamp-2 mt-0.5">{n.body}</p>}
                <p className="text-[11px] text-muted mt-1">{fmtRelative(n.createdAt)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="relative">
        <button onClick={() => { setOpenU((v) => !v); setOpenN(false); }} className="flex items-center gap-2 pl-1 pr-2 h-10 rounded-xl hover:bg-surface-2">
          <Avatar name={user.name} src={user.avatarUrl} size={30} />
          <div className="hidden sm:block text-left leading-tight"><p className="text-sm font-medium">{user.name.split(" ")[0]}</p><p className="text-[11px] text-muted">{ROLE_LABEL[user.role]}</p></div>
        </button>
        {openU && (
          <div className="absolute right-0 mt-2 w-56 card p-2 animate-fadeUp">
            <div className="px-3 py-2 border-b border-line mb-1"><p className="text-sm font-medium truncate">{user.name}</p><p className="text-xs text-muted truncate">{user.email}</p></div>
            <Link href="/perfil" onClick={() => setOpenU(false)} className="block px-3 py-2 text-sm rounded-xl hover:bg-surface-2">Meu perfil</Link>
            <form action={logoutAction}><button className="w-full text-left px-3 py-2 text-sm rounded-xl hover:bg-surface-2 flex items-center gap-2 text-red-600"><LogOut size={14} /> Sair</button></form>
          </div>
        )}
      </div>
    </header>
  );
}
