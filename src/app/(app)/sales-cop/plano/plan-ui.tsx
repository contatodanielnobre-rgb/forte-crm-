"use client";
import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { Avatar, Badge } from "@/components/ui";
import { Modal } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/action-form";
import { PRIORITY_TONE, STATUS_LABEL, RULE_LABEL } from "@/components/salescop/brand";
import { cn } from "@/lib/utils";
import { addPlanItem, completePlanItem, rejectPlanItem, restorePlanItem, updatePlanItem } from "../actions";

type User = { id: string; name: string; avatarUrl: string | null };
export type Item = { id: string; title: string; description: string | null; justification: string | null; expectedResult: string | null; priority: string; recommendedTime: string | null; dueAt: Date | null; status: string; ruleKey: string | null; assigneeId: string | null; assignee: User | null; lead: { id: string; name: string; company: string | null; value: string } | null; appointment: { id: string; title: string; startAt: Date } | null; task: { id: string; status: string } | null };

export function PlanItemRow({ item, users, canManage, me }: { item: Item; users: User[]; canManage: boolean; me: string }) {
  const [open, setOpen] = React.useState(false);
  const [edit, setEdit] = React.useState(false);
  const done = item.status === "CONCLUIDO", rejected = item.status === "REJEITADO";
  const canComplete = canManage || item.assigneeId === me;
  return (
    <li className={cn("rounded-xl border border-line bg-surface p-3 transition", done && "opacity-60", rejected && "opacity-50 border-dashed")}>
      <div className="flex items-start gap-3">
        {canComplete && !rejected ? <ActionButton action={() => completePlanItem(item.id, !done)} className={cn("mt-0.5 w-6 h-6 rounded-md border grid place-items-center shrink-0 transition", done ? "bg-emerald-500 border-emerald-500 text-white" : "border-line hover:border-brand")} success={done ? "Atividade reaberta." : "Atividade concluída."}>{done ? <Check size={14} /> : <span />}</ActionButton> : <span className="mt-0.5 w-6 h-6 rounded-md border border-line grid place-items-center shrink-0">{done && <Check size={14} className="text-emerald-500" />}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("badge", PRIORITY_TONE[item.priority])}>{item.priority === "MEDIA" ? "MÉDIA" : item.priority}</span>
            {item.recommendedTime && <span className="text-[11px] text-muted tabular-nums">{item.recommendedTime}</span>}
            <p className={cn("font-medium text-sm", done && "line-through")}>{item.title}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted mt-1">
            {item.assignee ? <span className="inline-flex items-center gap-1.5"><Avatar name={item.assignee.name} src={item.assignee.avatarUrl} size={18} />{item.assignee.name.split(" ")[0]}</span> : <span className="text-brand">Sem responsável</span>}
            {item.lead && <Link href="/pipeline" className="hover:text-brand">Lead: {item.lead.name}{item.lead.company ? ` (${item.lead.company})` : ""}</Link>}
            {item.appointment && <Link href="/agenda" className="hover:text-brand">Reunião: {item.appointment.title}</Link>}
            {item.dueAt && <span>Prazo {new Date(item.dueAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
            <Badge tone={done ? "green" : rejected ? "gray" : item.status === "APROVADO" ? "blue" : "amber"}>{STATUS_LABEL[item.status]}</Badge>
            {item.ruleKey && <span className="text-[10px] uppercase tracking-wide">{RULE_LABEL[item.ruleKey] ?? item.ruleKey}</span>}
          </div>
          {open && <div className="mt-2 text-xs space-y-1 text-fg/80 bg-surface-2 rounded-lg p-2.5">
            {item.description && <p><span className="text-muted">O que fazer:</span> {item.description}</p>}
            {item.justification && <p><span className="text-muted">Justificativa:</span> {item.justification}</p>}
            {item.expectedResult && <p><span className="text-muted">Resultado esperado:</span> {item.expectedResult}</p>}
          </div>}
          {edit && canManage && <ActionForm action={(fd) => updatePlanItem(item.id, fd)} onDone={() => setEdit(false)} success="Atividade atualizada." className="mt-2 grid sm:grid-cols-4 gap-2">
            <select name="priority" defaultValue={item.priority} className="input h-9 text-xs"><option value="URGENTE">Urgente</option><option value="ALTA">Alta</option><option value="MEDIA">Média</option><option value="BAIXA">Baixa</option></select>
            <select name="assigneeId" defaultValue={item.assigneeId ?? ""} className="input h-9 text-xs"><option value="">Sem responsável</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            <input name="recommendedTime" type="time" defaultValue={item.recommendedTime ?? ""} className="input h-9 text-xs" />
            <button className="btn-primary btn-sm">Salvar</button>
          </ActionForm>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => setOpen((v) => !v)} className="btn-ghost btn-icon h-8 w-8" aria-label="Detalhes"><ChevronDown size={15} className={cn("transition", open && "rotate-180")} /></button>
          {canManage && !done && !rejected && <button type="button" onClick={() => setEdit((v) => !v)} className="btn-ghost btn-icon h-8 w-8" aria-label="Editar"><Pencil size={14} /></button>}
          {canManage && !done && (rejected ? <ActionButton action={() => restorePlanItem(item.id)} className="btn-ghost btn-icon h-8 w-8" success="Recomendação restaurada."><RotateCcw size={14} /></ActionButton> : <ActionButton action={() => rejectPlanItem(item.id)} className="btn-ghost btn-icon h-8 w-8 text-muted hover:text-brand" confirm="Rejeitar esta recomendação? A tarefa vinculada (se houver) será removida." success="Recomendação rejeitada."><X size={14} /></ActionButton>)}
        </div>
      </div>
    </li>
  );
}

export function AddItemButton({ planId, users, leads }: { planId: string; users: User[]; leads: { id: string; name: string }[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm"><Plus size={14} /> Adicionar atividade</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova atividade no plano">
        <ActionForm action={(fd) => addPlanItem(planId, fd)} onDone={() => setOpen(false)} success="Atividade adicionada." className="space-y-3">
          <div><label className="label">Atividade</label><input name="title" className="input" required placeholder="Ex.: Ligar para o lead X para confirmar proposta" /></div>
          <div><label className="label">Descrição</label><textarea name="description" className="input" rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Prioridade</label><select name="priority" className="input" defaultValue="MEDIA"><option value="URGENTE">Urgente</option><option value="ALTA">Alta</option><option value="MEDIA">Média</option><option value="BAIXA">Baixa</option></select></div>
            <div><label className="label">Responsável</label><select name="assigneeId" className="input"><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label className="label">Horário recomendado</label><input name="recommendedTime" type="time" className="input" /></div>
            <div><label className="label">Prazo</label><input name="dueAt" type="datetime-local" className="input" /></div>
          </div>
          <div><label className="label">Lead relacionado</label><select name="leadId" className="input"><option value="">—</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <button className="btn-primary w-full">Adicionar</button>
        </ActionForm>
      </Modal>
    </>
  );
}
