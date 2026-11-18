"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, ListChecks, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChatTabs({ canManage }: { canManage: boolean }) {
  const path = usePathname();
  const tabs = [
    { href: "/forte-chat", label: "Conversas", icon: MessageCircle, exact: true },
    { href: "/forte-chat/tarefas", label: "Minhas Tarefas", icon: ListChecks },
    { href: "/forte-chat/configuracoes", label: canManage ? "Integração e etiquetas" : "Integração", icon: Settings2 },
  ];
  return (
    <nav className="flex gap-1 overflow-x-auto shrink-0">
      {tabs.map((t) => { const on = t.exact ? path === t.href : path.startsWith(t.href); return (
        <Link key={t.href} href={t.href} className={cn("h-9 px-3.5 rounded-xl text-sm flex items-center gap-2 whitespace-nowrap border transition", on ? "bg-[#0a0a0c] text-white border-gold/40" : "border-line text-muted hover:text-fg bg-surface")}>
          <t.icon size={15} className={on ? "text-gold" : undefined} /> {t.label}
        </Link>
      ); })}
    </nav>
  );
}
