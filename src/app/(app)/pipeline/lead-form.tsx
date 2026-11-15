"use client";
import * as React from "react";
import { Field, SubmitButton } from "@/components/ui";
import { toInputDateTime } from "@/lib/format";
import { useToast } from "@/components/toast";
import type { Stage, LeadCard, Option, UserOption } from "./types";

export function LeadForm({ lead, stages, users, sources, canAssign, defaultStageId, currentUserId, action, submitLabel = "Salvar lead" }: { lead?: LeadCard | null; stages: Stage[]; users: UserOption[]; sources: Option[]; canAssign: boolean; defaultStageId?: string; currentUserId: string; action: (fd: FormData) => Promise<void>; submitLabel?: string }) {
  const toast = useToast();
  const [err, setErr] = React.useState<string | null>(null);
  return (
    <form action={async (fd) => { setErr(null); try { await action(fd); } catch (e) { setErr((e as Error).message); toast.push((e as Error).message, "error"); } }} className="grid sm:grid-cols-2 gap-4">
      <Field label="Nome do lead *" className="sm:col-span-2"><input name="name" className="input" defaultValue={lead?.name} required autoFocus /></Field>
      <Field label="Empresa"><input name="company" className="input" defaultValue={lead?.company ?? ""} /></Field>
      <Field label="Segmento"><input name="segment" className="input" defaultValue={lead?.segment ?? ""} placeholder="Ex.: Academia, Clínica..." /></Field>
      <Field label="Telefone / WhatsApp"><input name="phone" className="input" defaultValue={lead?.phone ?? ""} placeholder="(84) 9 9999-9999" /></Field>
      <Field label="E-mail"><input name="email" type="email" className="input" defaultValue={lead?.email ?? ""} /></Field>
      <Field label="Valor potencial (R$)"><input name="value" type="number" step="0.01" min="0" className="input" defaultValue={lead ? Number(lead.value) : ""} placeholder="0,00" /></Field>
      <Field label="Origem do lead"><select name="sourceId" className="input" defaultValue={lead?.sourceId ?? ""}><option value="">Selecione...</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Etapa"><select name="stageId" className="input" defaultValue={lead?.stageId ?? defaultStageId ?? stages.find((s) => s.isDefault)?.id}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Responsável comercial"><select name="ownerId" className="input" defaultValue={lead?.ownerId ?? currentUserId} disabled={!canAssign}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      <Field label="Próxima atividade" className="sm:col-span-2"><input name="nextActivityAt" type="datetime-local" className="input" defaultValue={toInputDateTime(lead?.nextActivityAt)} /></Field>
      <Field label="Observações" className="sm:col-span-2"><textarea name="notes" className="input" rows={3} defaultValue={lead?.notes ?? ""} /></Field>
      {err && <p className="sm:col-span-2 text-sm text-red-600">{err}</p>}
      <div className="sm:col-span-2 flex justify-end"><SubmitButton>{submitLabel}</SubmitButton></div>
    </form>
  );
}
