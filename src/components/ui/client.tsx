"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { X, Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

export function Modal({ open, onClose, title, children, size = "md" }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full card rounded-b-none sm:rounded-2xl max-h-[92vh] flex flex-col animate-fadeUp", w)}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="btn-ghost btn-icon" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, width = "max-w-2xl" }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; width?: string }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative h-full w-full bg-surface border-l border-line shadow-2xl flex flex-col animate-fadeUp", width)}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="btn-ghost btn-icon" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function SubmitButton({ children, className = "btn-primary", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending}>{pending ? <><Loader2 size={16} className="animate-spin" /> {pendingText ?? "Salvando..."}</> : children}</button>;
}

export function ConfirmButton({ action, children, message, className = "btn-danger btn-sm" }: { action: () => Promise<unknown>; children: React.ReactNode; message: string; className?: string }) {
  const [pending, start] = React.useTransition();
  return <button type="button" className={className} disabled={pending} onClick={() => { if (confirm(message)) start(async () => { try { await action(); } catch (e) { alert((e as Error).message); } }); }}>{pending ? <Loader2 size={14} className="animate-spin" /> : children}</button>;
}

export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: string; count?: number }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line -mx-1 px-1">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} className={cn("px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition", value === t.key ? "border-brand text-fg font-medium" : "border-transparent text-muted hover:text-fg")}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-md bg-surface-2 text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
