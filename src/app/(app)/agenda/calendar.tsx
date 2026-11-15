"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Pencil, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtTime, toInputDateTime, toInputDate } from "@/lib/format";
import { Modal, Field, SubmitButton, Badge } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { MeetingRow, type ApptRow } from "@/components/meeting-row";
import { createAppointment, updateAppointment } from "./actions";

type A = ApptRow & { startAt: Date | string; ownerId?: string | null; clientId?: string | null; leadId?: string | null; typeId?: string | null; owner: { id: string; name: string } | null; client: { id: string; name: string } | null; lead: { id: string; name: string } | null };
type Opt = { id: string; name: string };
type Props = { view: "dia" | "semana" | "mes"; date: string; prev: string; next: string; appts: A[]; users: Opt[]; types: (Opt & { color: string })[]; clients: Opt[]; leads: Opt[]; canAssign: boolean; currentUserId: string; selectedUser: string };
const ST_COLOR: Record<string, string> = { REALIZADO: "opacity-60", CANCELADO: "opacity-40 line-through", NAO_COMPARECEU: "opacity-50" };

export function Calendar(p: Props) {
  const router = useRouter();
  const date = new Date(p.date);
  const appts = p.appts.map((a) => ({ ...a, startAt: new Date(a.startAt) }));
  const [editing, setEditing] = React.useState<A | null | "new">(null);
  const [newDefault, setNewDefault] = React.useState<Date>(new Date());
  const go = (d: string, v = p.view, u = p.selectedUser) => router.push(`/agenda?v=${v}&d=${toInputDate(d)}${u ? `&u=${u}` : ""}`);
  const openNew = (d: Date) => { setNewDefault(d); setEditing("new"); };
  const title = p.view === "mes" ? format(date, "MMMM 'de' yyyy", { locale: ptBR }) : p.view === "semana" ? `${format(startOfWeek(date), "dd MMM", { locale: ptBR })} – ${format(endOfWeek(date), "dd MMM yyyy", { locale: ptBR })}` : format(date, "EEEE, dd 'de' MMMM", { locale: ptBR });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1"><button onClick={() => go(p.prev)} className="btn-secondary btn-icon"><ChevronLeft size={16} /></button><button onClick={() => go(new Date().toISOString())} className="btn-secondary btn-sm">Hoje</button><button onClick={() => go(p.next)} className="btn-secondary btn-icon"><ChevronRight size={16} /></button></div>
        <p className="font-medium capitalize flex-1">{title}</p>
        {p.canAssign && <select className="input h-9 w-44" value={p.selectedUser} onChange={(e) => go(p.date, p.view, e.target.value)}><option value="">Toda a equipe</option>{p.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
        <div className="flex bg-surface border border-line rounded-xl p-1">{(["dia", "semana", "mes"] as const).map((v) => <button key={v} onClick={() => go(p.date, v)} className={cn("px-3 h-8 rounded-lg text-sm capitalize", p.view === v ? "bg-brand text-white" : "text-muted hover:text-fg")}>{v === "mes" ? "Mês" : v}</button>)}</div>
        <button onClick={() => openNew(new Date())} className="btn-primary btn-sm"><Plus size={14} /> Novo compromisso</button>
      </div>

      {p.view === "mes" && <MonthView date={date} appts={appts} onDay={(d) => go(d.toISOString(), "dia")} onNew={openNew} onEdit={setEditing} />}
      {p.view === "semana" && <WeekView date={date} appts={appts} onNew={openNew} onEdit={setEditing} />}
      {p.view === "dia" && <DayView appts={appts} users={p.users} />}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Novo compromisso" : "Editar compromisso"} size="lg">
        {editing && <ApptForm a={editing === "new" ? null : editing} defaultDate={newDefault} {...p} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function ApptChip({ a, onEdit }: { a: A & { startAt: Date }; onEdit: (a: A) => void }) {
  return (
    <button onClick={() => onEdit(a)} className={cn("block w-full min-w-0 text-left rounded-lg px-1.5 py-1 text-[11px] leading-tight border-l-2 bg-surface-2 hover:bg-brand/10 transition truncate", ST_COLOR[a.status])} style={{ borderColor: a.type?.color ?? "#999" }} title={a.title}>
      <span className="font-medium">{fmtTime(a.startAt)}</span> {a.title}
    </button>
  );
}

function MonthView({ date, appts, onDay, onNew, onEdit }: { date: Date; appts: (A & { startAt: Date })[]; onDay: (d: Date) => void; onNew: (d: Date) => void; onEdit: (a: A) => void }) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(date)), end: endOfWeek(endOfMonth(date)) });
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="px-2 py-2 text-[11px] font-medium text-muted uppercase">{d}</div>)}</div>
      <div className="grid grid-cols-7">
        {days.map((d) => { const list = appts.filter((a) => isSameDay(a.startAt, d)); return (
          <div key={+d} className={cn("min-h-[108px] border-b border-r border-line/70 p-1.5 group", !isSameMonth(d, date) && "bg-surface-2/40")}>
            <div className="flex items-center justify-between mb-1"><button onClick={() => onDay(d)} className={cn("w-6 h-6 rounded-full text-xs grid place-items-center hover:bg-surface-2", isToday(d) && "bg-brand text-white font-semibold")}>{format(d, "d")}</button><button onClick={() => { const n = new Date(d); n.setHours(9, 0, 0, 0); onNew(n); }} className="opacity-0 group-hover:opacity-100 text-muted hover:text-brand"><Plus size={14} /></button></div>
            <div className="space-y-1">{list.slice(0, 3).map((a) => <ApptChip key={a.id} a={a} onEdit={onEdit} />)}{list.length > 3 && <button onClick={() => onDay(d)} className="text-[11px] text-muted hover:text-brand px-1">+{list.length - 3} mais</button>}</div>
          </div>
        ); })}
      </div>
    </div>
  );
}

function WeekView({ date, appts, onNew, onEdit }: { date: Date; appts: (A & { startAt: Date })[]; onNew: (d: Date) => void; onEdit: (a: A) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i));
  const hours = Array.from({ length: 14 }, (_, i) => 7 + i);
  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[840px]">
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-line sticky top-0 bg-surface z-10">
          <div />{days.map((d) => <div key={+d} className={cn("px-2 py-2 text-center border-l border-line/70", isToday(d) && "bg-brand/5")}><p className="text-[11px] uppercase text-muted">{format(d, "EEE", { locale: ptBR })}</p><p className={cn("text-lg font-semibold", isToday(d) && "text-brand")}>{format(d, "d")}</p></div>)}
        </div>
        {hours.map((h) => (
          <div key={h} className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-line/60">
            <div className="text-[11px] text-muted px-2 py-1 text-right">{String(h).padStart(2, "0")}:00</div>
            {days.map((d) => { const list = appts.filter((a) => isSameDay(a.startAt, d) && a.startAt.getHours() === h); return (
              <div key={+d} className={cn("min-h-[52px] min-w-0 overflow-hidden border-l border-line/70 p-1 space-y-1 group", isToday(d) && "bg-brand/[0.02]")} onDoubleClick={() => { const n = new Date(d); n.setHours(h, 0, 0, 0); onNew(n); }}>
                {list.map((a) => <ApptChip key={a.id} a={a} onEdit={onEdit} />)}
              </div>
            ); })}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted px-3 py-2">Dê dois cliques em um horário para criar um compromisso.</p>
    </div>
  );
}

function DayView({ appts, users }: { appts: (A & { startAt: Date })[]; users: Opt[] }) {
  if (!appts.length) return <div className="card p-10 text-center text-sm text-muted flex flex-col items-center gap-2"><CalendarDays size={22} /> Nenhum compromisso neste dia.</div>;
  return <ul className="card divide-y divide-line">{appts.map((a) => <MeetingRow key={a.id} a={a} users={users} showClient />)}</ul>;
}

function ApptForm({ a, defaultDate, users, types, clients, leads, canAssign, currentUserId, onDone }: { a: A | null; defaultDate: Date; onDone: () => void } & Pick<Props, "users" | "types" | "clients" | "leads" | "canAssign" | "currentUserId">) {
  const action = a ? updateAppointment.bind(null, a.id) : createAppointment;
  return (
    <ActionForm action={action} success={a ? "Compromisso atualizado." : "Compromisso criado."} onDone={onDone} className="grid sm:grid-cols-2 gap-3">
      <Field label="Título" className="sm:col-span-2"><input name="title" className="input" defaultValue={a?.title ?? ""} required autoFocus /></Field>
      <Field label="Data e hora"><input name="startAt" type="datetime-local" className="input" defaultValue={toInputDateTime(a ? a.startAt : defaultDate)} required /></Field>
      <Field label="Duração (min)"><input name="durationMin" type="number" className="input" defaultValue={a?.durationMin ?? 60} /></Field>
      <Field label="Tipo"><select name="typeId" className="input" defaultValue={a?.typeId ?? types[0]?.id}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
      <Field label="Responsável"><select name="ownerId" className="input" defaultValue={a?.ownerId ?? currentUserId} disabled={!canAssign}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      <Field label="Cliente relacionado"><select name="clientId" className="input" defaultValue={a?.clientId ?? ""}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Lead relacionado"><select name="leadId" className="input" defaultValue={a?.leadId ?? ""}><option value="">—</option>{leads.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Link da reunião" className="sm:col-span-2"><input name="link" className="input" defaultValue={a?.link ?? ""} placeholder="https://meet.google.com/..." /></Field>
      <Field label="Descrição" className="sm:col-span-2"><textarea name="description" className="input" rows={2} defaultValue={a?.description ?? ""} /></Field>
      <div className="sm:col-span-2 flex items-center justify-between">{a ? <span className="flex items-center gap-2 text-xs text-muted"><Badge>{a.status}</Badge>{a.client && <Link href={`/clientes/${a.client.id}`} className="hover:text-brand">Abrir cliente</Link>}</span> : <span />}<SubmitButton>{a ? <><Pencil size={14} /> Salvar</> : "Criar compromisso"}</SubmitButton></div>
    </ActionForm>
  );
}
