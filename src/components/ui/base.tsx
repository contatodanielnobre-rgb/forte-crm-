import * as React from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { Inbox } from "lucide-react";

const tones: Record<string, string> = {
  gray: "bg-gray-500/10 text-gray-600 dark:text-gray-300 border-gray-500/20",
  red: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  purple: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  brand: "bg-brand/10 text-brand border-brand/20",
  gold: "bg-gold/15 text-gold border-gold/30",
};

export function Avatar({ name, src, size = 32, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.38) };
  if (src) return <img src={src} alt={name} style={style} className={cn("rounded-full object-cover shrink-0", className)} />;
  return <div style={style} className={cn("rounded-full bg-brand/15 text-brand font-semibold grid place-items-center shrink-0", className)}>{initials(name)}</div>;
}

export function Badge({ tone = "gray", children, className }: { tone?: keyof typeof tones; children: React.ReactNode; className?: string }) {
  return <span className={cn("badge", tones[tone], className)}>{children}</span>;
}

export function Empty({ icon: Icon = Inbox, title, hint, action }: { icon?: React.ComponentType<{ size?: number; className?: string }>; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-14 px-6">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-surface-2 grid place-items-center text-muted mb-3"><Icon size={22} /></div>
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted mt-1 max-w-sm mx-auto">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Kpi({ label, value, hint, icon: Icon, tone = "brand", className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ComponentType<{ size?: number }>; tone?: "brand" | "green" | "amber" | "red" | "blue" | "gray" | "gold"; className?: string }) {
  const t: Record<string, string> = { brand: "text-brand bg-brand/10", green: "text-emerald-500 bg-emerald-500/10", amber: "text-amber-500 bg-amber-500/10", red: "text-red-500 bg-red-500/10", blue: "text-blue-500 bg-blue-500/10", gray: "text-muted bg-surface-2", gold: "text-gold bg-gold/15" };
  return (
    <div className={cn("card p-4 flex items-start justify-between gap-3 animate-fadeUp", className)}>
      <div className="min-w-0">
        <p className="text-xs text-muted font-medium leading-snug">{label}</p>
        <p className={cn("font-semibold tracking-tight tabular-nums mt-1 leading-tight break-words", String(value).length > 9 ? "text-base sm:text-xl whitespace-nowrap" : "text-2xl")}>{value}</p>
        {hint && <p className="text-xs text-muted mt-1 leading-snug">{hint}</p>}
      </div>
      {Icon && <div className={cn("w-9 h-9 rounded-xl grid place-items-center shrink-0", t[tone])}><Icon size={18} /></div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div><h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{title}</h1>{subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}</div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Progress({ value, className, tone = "brand" }: { value: number; className?: string; tone?: "brand" | "green" | "gold" | "amber" }) {
  const c = { brand: "bg-brand", green: "bg-emerald-500", gold: "bg-gold", amber: "bg-amber-500" }[tone];
  return <div className={cn("h-2 w-full rounded-full bg-surface-2 overflow-hidden", className)}><div className={cn("h-full rounded-full transition-all", c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return <div className={className}><label className="label">{label}</label>{children}{hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}</div>;
}

