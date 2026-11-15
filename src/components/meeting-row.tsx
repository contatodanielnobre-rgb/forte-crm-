"use client";
import * as React from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, UserX, FileText, ExternalLink, Trash2 } from "lucide-react";
import { Badge, Modal, Field, SubmitButton } from "@/components/ui";
import { ActionButton, ActionForm } from "@/components/action-form";
import { fmtDateTime, fmtDate } from "@/lib/format";
import { changeAppointmentStatus, saveMinutes, deleteAppointment } from "@/app/(app)/agenda/actions";

export type ApptRow = { id: string; title: string; startAt: Date; durationMin: number; link: string | null; status: string; description?: string | null; type: { name: string; color: string } | null; owner?: { name: string } | null; client?: { id: string; name: string } | null; lead?: { name: string } | null; meeting?: { id: string; participants: string | null; agenda: string | null; decisions: string | null; notes: string | null; tasks?: { id: string; title: string; status: string; dueAt: Date | null }[] } | null };
const ST: Record<string, { label: string; tone: "blue" | "green" | "red" | "amber" }> = { AGENDADO: { label: "Agendada", tone: "blue" }, REALIZADO: { label: "Realizada", tone: "green" }, CANCELADO: { label: "Cancelada", tone: "red" }, NAO_COMPARECEU: { label: "Não compareceu", tone: "amber" } };

export function MeetingRow({ a, users, showClient }: { a: ApptRow; users: { id: string; name: string }[]; showClient?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const late = a.status === "AGENDADO" && a.startAt < new Date();
  return (
    <li className="p-3 flex flex-wrap items-center gap-3">
      <span className="w-2 h-10 rounded-full shrink-0" style={{ background: a.type?.color ?? "#999" }} />
      <div className="flex-1 min-w-[200px]">
        <p className="text-sm font-medium flex items-center gap-2 flex-wrap">{a.title}{late && <Badge tone="amber">atrasada</Badge>}{a.meeting && (a.meeting.decisions || a.meeting.agenda) && <Badge tone="green"><FileText size={10} /> ata</Badge>}</p>
        <p className="text-xs text-muted">{fmtDateTime(a.startAt)} · {a.durationMin} min · {a.type?.name ?? "—"}{a.owner ? ` · ${a.owner.name}` : ""}{showClient && a.client ? <> · <Link href={`/clientes/${a.client.id}`} className="hover:text-brand underline-offset-2 hover:underline">{a.client.name}</Link></> : showClient && a.lead ? ` · Lead: ${a.lead.name}` : ""}</p>
      </div>
      <Badge tone={ST[a.status]?.tone ?? "blue"}>{ST[a.status]?.label ?? a.status}</Badge>
      <div className="flex items-center gap-1">
        {a.link && <a href={a.link} target="_blank" className="btn-ghost btn-icon h-8 w-8" title="Abrir link"><ExternalLink size={14} /></a>}
        {a.status === "AGENDADO" && <>
          <ActionButton className="btn-ghost btn-icon h-8 w-8 text-emerald-600" action={changeAppointmentStatus.bind(null, a.id, "REALIZADO")} success="Reunião marcada como realizada."><CheckCircle2 size={16} /></ActionButton>
          <ActionButton className="btn-ghost btn-icon h-8 w-8 text-amber-500" action={changeAppointmentStatus.bind(null, a.id, "NAO_COMPARECEU")}><UserX size={16} /></ActionButton>
          <ActionButton className="btn-ghost btn-icon h-8 w-8 text-red-500" action={changeAppointmentStatus.bind(null, a.id, "CANCELADO")}><XCircle size={16} /></ActionButton>
        </>}
        <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}><FileText size={13} /> {a.meeting ? "Ata" : "Registrar ata"}</button>
        <ActionButton className="btn-ghost btn-icon h-8 w-8 text-muted" confirm="Excluir este compromisso?" action={deleteAppointment.bind(null, a.id)}><Trash2 size={13} /></ActionButton>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={`Ata — ${a.title}`} size="lg">
        <ActionForm action={saveMinutes.bind(null, a.id)} success="Ata salva e reunião marcada como realizada." onDone={() => setOpen(false)} className="space-y-3">
          <p className="text-xs text-muted">{fmtDateTime(a.startAt)} · {a.type?.name}</p>
          <Field label="Participantes"><input name="participants" className="input" defaultValue={a.meeting?.participants ?? ""} /></Field>
          <Field label="Pauta"><textarea name="agenda" className="input" rows={2} defaultValue={a.meeting?.agenda ?? ""} /></Field>
          <Field label="Decisões"><textarea name="decisions" className="input" rows={3} defaultValue={a.meeting?.decisions ?? ""} /></Field>
          <Field label="Observações"><textarea name="notes" className="input" rows={2} defaultValue={a.meeting?.notes ?? ""} /></Field>
          {a.meeting?.tasks && a.meeting.tasks.length > 0 && <div><p className="label">Tarefas já registradas</p><ul className="text-sm space-y-1">{a.meeting.tasks.map((t) => <li key={t.id} className="flex items-center gap-2"><Badge tone={t.status === "CONCLUIDA" ? "green" : "gray"}>{t.status}</Badge>{t.title}{t.dueAt && <span className="text-xs text-muted">· {fmtDate(t.dueAt)}</span>}</li>)}</ul></div>}
          <div><p className="label">Novas tarefas e responsáveis</p>
            <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="grid grid-cols-[1fr_140px_130px] gap-2"><input name={`task${i}`} className="input h-9" placeholder={`Tarefa ${i + 1}`} /><select name={`assignee${i}`} className="input h-9"><option value="">Responsável</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select><input name={`due${i}`} type="date" className="input h-9" /></div>)}</div>
          </div>
          <div className="flex justify-end"><SubmitButton>Salvar ata</SubmitButton></div>
        </ActionForm>
      </Modal>
    </li>
  );
}
