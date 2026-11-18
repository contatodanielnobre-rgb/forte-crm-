"use client";
import * as React from "react";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Plus, Phone, Mail, Building2, CalendarClock, Clock, Flame } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { brl, fmtDate, fmtRelative } from "@/lib/format";
import { Avatar, Badge, Modal, Field, SubmitButton } from "@/components/ui";
import { useToast } from "@/components/toast";
import { moveLead, createLead } from "./actions";
import { LeadDrawer } from "./lead-drawer";
import { LeadForm } from "./lead-form";
import type { Stage, LeadCard, Option, UserOption, ApptType } from "./types";

type Props = { stages: Stage[]; leads: LeadCard[]; users: UserOption[]; sources: Option[]; lossReasons: Option[]; apptTypes: ApptType[]; canAssign: boolean; openNew: boolean; openLead?: string | null; currentUserId: string };

export function Board({ stages, leads: initial, users, sources, lossReasons, apptTypes, canAssign, openNew, openLead, currentUserId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [leads, setLeads] = React.useState(initial);
  React.useEffect(() => setLeads(initial), [initial]);
  const [active, setActive] = React.useState<LeadCard | null>(null);
  const [selected, setSelected] = React.useState<string | null>(openLead ?? null);
  const [showNew, setShowNew] = React.useState(openNew);
  const [newStage, setNewStage] = React.useState<string | undefined>();
  const [lossFor, setLossFor] = React.useState<{ lead: LeadCard; stage: Stage } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }));

  const onDragStart = (e: DragStartEvent) => setActive(leads.find((l) => l.id === e.active.id) ?? null);
  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const lead = leads.find((l) => l.id === e.active.id);
    const stage = stages.find((s) => s.id === e.over?.id);
    if (!lead || !stage || lead.stageId === stage.id) return;
    if (stage.isLost) { setLossFor({ lead, stage }); return; }
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, stageId: stage.id } : l)));
    try {
      const res = await moveLead(lead.id, stage.id);
      if (res.converted) toast.push(`Venda fechada! ${lead.name} agora é cliente e a jornada de entrega foi criada.`);
      router.refresh();
    } catch (err) { setLeads(prev); toast.push((err as Error).message, "error"); }
  };

  const confirmLoss = async (fd: FormData) => {
    if (!lossFor) return;
    const reasonId = String(fd.get("lossReasonId") || "") || null; const note = String(fd.get("note") || "") || null;
    const { lead, stage } = lossFor; setLossFor(null);
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, stageId: stage.id } : l)));
    try { await moveLead(lead.id, stage.id, reasonId, note); router.refresh(); } catch (err) { toast.push((err as Error).message, "error"); router.refresh(); }
  };

  const byStage = React.useMemo(() => { const m = new Map<string, LeadCard[]>(); stages.forEach((s) => m.set(s.id, [])); leads.forEach((l) => m.get(l.stageId)?.push(l)); return m; }, [leads, stages]);

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto overflow-y-hidden -mx-4 px-4 sm:-mx-6 sm:px-6 pb-2">
          <div className="flex gap-3 h-full min-w-max">
            {stages.map((s) => <Column key={s.id} stage={s} leads={byStage.get(s.id) ?? []} onOpen={setSelected} onNew={() => { setNewStage(s.id); setShowNew(true); }} />)}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>{active && <div className="w-[272px] rotate-2"><Card lead={active} overlay /></div>}</DragOverlay>
      </DndContext>

      <Modal open={showNew} onClose={() => { setShowNew(false); if (openNew) router.replace("/pipeline"); }} title="Novo lead" size="lg">
        <LeadForm stages={stages} users={users} sources={sources} canAssign={canAssign} defaultStageId={newStage} currentUserId={currentUserId}
          action={async (fd) => { await createLead(fd); toast.push("Lead cadastrado."); setShowNew(false); if (openNew) router.replace("/pipeline"); else router.refresh(); }} />
      </Modal>

      <Modal open={!!lossFor} onClose={() => setLossFor(null)} title="Registrar motivo da perda" size="sm">
        <form action={confirmLoss} className="space-y-4">
          <p className="text-sm text-muted">Marcar <b className="text-fg">{lossFor?.lead.name}</b> como perdido.</p>
          <Field label="Motivo da perda"><select name="lossReasonId" className="input" required><option value="">Selecione...</option>{lossReasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
          <Field label="Observação (opcional)"><textarea name="note" className="input" rows={2} /></Field>
          <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setLossFor(null)}>Cancelar</button><SubmitButton className="btn-danger" pendingText="Registrando...">Confirmar perda</SubmitButton></div>
        </form>
      </Modal>

      <LeadDrawer leadId={selected} onClose={() => setSelected(null)} stages={stages} users={users} sources={sources} lossReasons={lossReasons} apptTypes={apptTypes} canAssign={canAssign} currentUserId={currentUserId} />
    </>
  );
}

function Column({ stage, leads, onOpen, onNew }: { stage: Stage; leads: LeadCard[]; onOpen: (id: string) => void; onNew: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = leads.reduce((s, l) => s + Number(l.value), 0);
  return (
    <div ref={setNodeRef} className={cn("w-[284px] shrink-0 flex flex-col rounded-2xl bg-surface-2/60 border border-line/60 transition", isOver && "ring-2 ring-brand/50 bg-brand/5")}>
      <div className="px-3 pt-3 pb-2 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
        <p className="text-sm font-medium flex-1 truncate">{stage.name}</p>
        <span className="text-[11px] text-muted tabular-nums">{leads.length}</span>
        <button onClick={onNew} className="btn-ghost h-6 w-6 p-0 rounded-md"><Plus size={14} /></button>
      </div>
      <p className="px-3 pb-2 text-[11px] text-muted tabular-nums">{brl(total)}</p>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
        {leads.map((l) => <DraggableCard key={l.id} lead={l} onOpen={onOpen} />)}
        {leads.length === 0 && <div className="h-20 rounded-xl border border-dashed border-line grid place-items-center text-[11px] text-muted">Arraste leads para cá</div>}
      </div>
    </div>
  );
}

function DraggableCard({ lead, onOpen }: { lead: LeadCard; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return <div ref={setNodeRef} {...attributes} {...listeners} onClick={() => onOpen(lead.id)} className={cn("cursor-grab active:cursor-grabbing touch-none", isDragging && "opacity-30")}><Card lead={lead} /></div>;
}

export function Card({ lead, overlay }: { lead: LeadCard; overlay?: boolean }) {
  const late = lead.nextActivityAt && new Date(lead.nextActivityAt) < new Date() && !lead.wonAt && !lead.lostAt;
  const stale = !lead.lastContactAt || (Date.now() - +new Date(lead.lastContactAt)) / 864e5 > 5;
  return (
    <div className={cn("card p-3 hover:border-brand/40 transition space-y-2", overlay && "shadow-2xl")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-sm font-medium truncate">{lead.name}</p>{lead.company && <p className="text-xs text-muted truncate flex items-center gap-1"><Building2 size={11} />{lead.company}</p>}</div>
        {lead.isDemo && <Badge tone="amber" className="shrink-0">demo</Badge>}
      </div>
      <p className="text-base font-semibold tabular-nums">{brl(lead.value)}</p>
      <div className="flex flex-wrap gap-1">
        {lead.segment && <Badge>{lead.segment}</Badge>}
        {lead.source && <Badge tone="blue">{lead.source.name}</Badge>}
        {lead.lossReason && <Badge tone="red">{lead.lossReason.name}</Badge>}
      </div>
      <div className="text-[11px] text-muted space-y-0.5">
        {lead.phone && <p className="flex items-center gap-1 truncate"><Phone size={11} />{lead.phone}</p>}
        {lead.email && <p className="flex items-center gap-1 truncate"><Mail size={11} />{lead.email}</p>}
        <p className={cn("flex items-center gap-1", late && "text-red-500 font-medium")}><CalendarClock size={11} />{lead.nextActivityAt ? `Próx.: ${fmtDate(lead.nextActivityAt, "dd/MM HH:mm")}` : "Sem próxima atividade"}</p>
        <p suppressHydrationWarning className={cn("flex items-center gap-1", stale && !lead.wonAt && !lead.lostAt && "text-amber-500")}><Clock size={11} />{lead.lastContactAt ? `Último contato ${fmtRelative(lead.lastContactAt)}` : "Sem contato registrado"}</p>
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-line/60">
        <span className="text-[11px] text-muted">Entrada {fmtDate(lead.enteredAt, "dd/MM")}</span>
        {lead.owner ? <span className="flex items-center gap-1.5 text-[11px] text-muted"><Avatar name={lead.owner.name} src={lead.owner.avatarUrl} size={18} />{lead.owner.name.split(" ")[0]}</span> : <span className="text-[11px] text-amber-500 flex items-center gap-1"><Flame size={11} />Sem responsável</span>}
      </div>
    </div>
  );
}
