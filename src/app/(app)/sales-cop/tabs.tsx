"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function CopTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="relative flex gap-1 overflow-x-auto px-3 border-t border-white/5">
      {tabs.map((t) => { const active = t.href === "/sales-cop" ? path === t.href : path.startsWith(t.href); return <Link key={t.href} href={t.href} className={cn("px-3 py-3 text-xs sm:text-sm whitespace-nowrap border-b-2 -mb-px transition", active ? "border-brand text-white font-medium" : "border-transparent text-white/50 hover:text-white")}>{t.label}</Link>; })}
    </nav>
  );
}
