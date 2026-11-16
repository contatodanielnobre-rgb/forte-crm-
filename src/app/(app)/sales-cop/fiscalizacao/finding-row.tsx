"use client";
import Link from "next/link";
import { CalendarCheck, Check, EyeOff, RotateCcw } from "lucide-react";
import { ActionButton } from "@/components/action-form";
import { SEVERITY_TONE, RULE_LABEL } from "@/components/salescop/brand";
import { brl, fmtDateTime, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { confirmAppointment, setFindingStatus } from "../actions";

export type FindingRowData = { id: string; ruleKey: string; severity: string; title: string; detail: string | null; recommendation: string | null; status: string; createdAt: Date; lastSeenAt: Date; appointmentId: string | null; lead: { id: string; name: string; company: string | null; value: string } | null; user: { id: string; name: string } | null; appointment: { id: string; title: string; startAt: Date } | null };

export function FindingRow({ f, canAct }: { f: FindingRowData; canAct: boolean }) {
  const open = f.status === "ABERTO";
  return (
    <li className={cn("rounded-xl border border-line bg-surface p-3", !open && "opacity-60")}>
      <div className="flex items-start gap-3">
        <span className={cn("badge mt-0.5 shrink-0", SEVERITY_TONE[f.severity])}>{f.severity === "CRITICO" ? "CRÍTICO" : f.severity === "MEDIO" ? "MÉDIO" : f.severity}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">{f.title}</p>
          {f.detail && <p className="text-xs text-muted mt-0.5">{f.detail}</p>}
          {f.recommendation && open && <p className="text-xs mt-1"><span className="text-brand font-medium">Ação recomendada:</span> {f.recommendation}</p>}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted mt-1.5">
            <span className="uppercase tracking-wide">{RULE_LABEL[f.ruleKey] ?? f.ruleKey}</span>
            {f.user && <span>Resp.: {f.user.name.split(" ")[0]}</span>}
            {f.lead && <Link href="/pipeline" className="hover:text-brand">Lead: {f.lead.name} · {brl(f.lead.value)}</Link>}
            {f.appointment && <Link href="/agenda" className="hover:text-brand">Reunião {fmtDateTime(f.appointment.startAt)}</Link>}
            <span>Detectado {fmtRelative(f.createdAt)}</span>
          </div>
        </div>
        {canAct && <div className="flex items-center gap-1 shrink-0">
          {open && f.ruleKey === "REUNIAO" && f.appointmentId && <ActionButton action={() => confirmAppointment(f.appointmentId!)} className="btn-secondary btn-sm" success="Reunião confirmada."><CalendarCheck size={13} /> Confirmar</ActionButton>}
          {open ? <>
            <ActionButton action={() => setFindingStatus(f.id, "RESOLVIDO")} className="btn-ghost btn-icon h-8 w-8 text-emerald-600" success="Marcado como resolvido."><Check size={15} /></ActionButton>
            <ActionButton action={() => setFindingStatus(f.id, "IGNORADO")} className="btn-ghost btn-icon h-8 w-8 text-muted" confirm="Ignorar esta irregularidade? Ela não voltará a aparecer até ser reaberta." success="Ignorado."><EyeOff size={15} /></ActionButton>
          </> : <ActionButton action={() => setFindingStatus(f.id, "ABERTO")} className="btn-ghost btn-icon h-8 w-8 text-muted" success="Reaberto."><RotateCcw size={15} /></ActionButton>}
        </div>}
      </div>
    </li>
  );
}
