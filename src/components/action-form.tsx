"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

/** Formulário que chama uma server action já "bindada", com toast de sucesso/erro e reset opcional. */
export function ActionForm({ action, children, className, success = "Salvo com sucesso.", reset, onDone }: { action: (fd: FormData) => Promise<unknown>; children: React.ReactNode; className?: string; success?: string | null; reset?: boolean; onDone?: () => void }) {
  const toast = useToast(); const router = useRouter();
  const ref = React.useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} className={className} action={async (fd) => { try { await action(fd); if (success) toast.push(success); if (reset) ref.current?.reset(); onDone?.(); router.refresh(); } catch (e) { toast.push((e as Error).message, "error"); } }}>
      {children}
    </form>
  );
}

export function ActionButton({ action, children, className = "btn-secondary btn-sm", confirm: msg, success }: { action: () => Promise<unknown>; children: React.ReactNode; className?: string; confirm?: string; success?: string }) {
  const toast = useToast(); const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <button type="button" className={cn(className)} disabled={pending} onClick={() => { if (msg && !confirm(msg)) return; start(async () => { try { await action(); if (success) toast.push(success); router.refresh(); } catch (e) { toast.push((e as Error).message, "error"); } }); }}>
      {pending ? <Loader2 size={14} className="animate-spin" /> : children}
    </button>
  );
}
