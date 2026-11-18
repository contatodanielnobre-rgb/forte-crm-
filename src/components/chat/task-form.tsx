"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Search, X, FileText, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { Field } from "@/components/ui";
import { useToast } from "@/components/toast";
import { createScheduledTask, searchContacts, updateScheduledTask } from "@/app/(app)/forte-chat/actions";
import { fmtSize, uploadMedia, type MediaInfo, type UserOpt } from "./client-api";
import { InlineRecorder } from "./composer";
import { AudioPlayer } from "./message-bubble";
import { mediaUrl } from "./client-api";

export const TASK_TYPE_OPTS = [
  { key: "ENVIAR_MENSAGEM", label: "Enviar mensagem", send: true }, { key: "ENVIAR_AUDIO", label: "Enviar áudio", send: true },
  { key: "ENVIAR_DOCUMENTO", label: "Enviar documento", send: true }, { key: "ENVIAR_IMAGEM", label: "Enviar imagem", send: true },
  { key: "LIGACAO", label: "Fazer ligação", send: false }, { key: "FOLLOW_UP", label: "Realizar follow-up", send: false },
  { key: "REUNIAO", label: "Agendar reunião", send: false }, { key: "RETORNAR_CONTATO", label: "Retornar contato", send: false }, { key: "OUTRA", label: "Outra atividade", send: false },
] as const;
export type TaskEdit = { id: string; title: string; type: string; runAt: string; description: string | null; recurrence: string; assigneeId: string | null; conversationId: string | null; leadId: string | null; clientId: string | null; media: MediaInfo | null; contactName?: string };

export function TaskForm({ conversationId, contactName, users, me, canAssign, blobEnabled, edit, onDone, defaultType }: {
  conversationId?: string | null; contactName?: string; users: UserOpt[]; me: string; canAssign: boolean; blobEnabled: boolean; edit?: TaskEdit | null; onDone: () => void; defaultType?: string;
}) {
  const toast = useToast(); const router = useRouter();
  const [type, setType] = React.useState(edit?.type ?? defaultType ?? "ENVIAR_MENSAGEM");
  const [media, setMedia] = React.useState<MediaInfo | null>(edit?.media ?? null);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [contact, setContact] = React.useState<{ key: string; label: string } | null>(edit && !edit.conversationId && (edit.leadId || edit.clientId) ? { key: edit.clientId ? `cliente:${edit.clientId}` : `lead:${edit.leadId}`, label: edit.contactName ?? "Contato" } : null);
  const fixedConv = edit?.conversationId ?? conversationId ?? null;
  const initial = edit ? new Date(edit.runAt) : new Date(Date.now() + 60 * 60 * 1000);
  const [date, setDate] = React.useState(format(initial, "yyyy-MM-dd"));
  const [time, setTime] = React.useState(format(initial, "HH:mm"));
  const def = TASK_TYPE_OPTS.find((x) => x.key === type)!;
  const needsMedia = def.send && type !== "ENVIAR_MENSAGEM";

  const onFile = async (f: Blob, name: string, durationSec?: number) => {
    setUploading(true);
    try { setMedia(await uploadMedia(f, name, { blobEnabled, durationSec })); } catch (e) { toast.push((e as Error).message, "error"); } finally { setUploading(false); }
  };
  const onRecorded = React.useCallback((b: Blob, d: number) => { void onFile(b, `audio-agendado-${Date.now()}.ogg`, d); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (fd: FormData) => {
    const runAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(+runAt)) return toast.push("Data/horário inválidos.", "error");
    fd.set("runAt", runAt.toISOString());
    fd.set("type", type);
    if (fixedConv) fd.set("conversationId", fixedConv); else if (contact) fd.set("contact", contact.key);
    if (needsMedia && media) fd.set("mediaId", media.id);
    setSaving(true);
    try {
      if (edit) await updateScheduledTask(edit.id, fd); else await createScheduledTask(fd);
      toast.push(edit ? "Tarefa atualizada." : def.send ? `Envio agendado para ${format(runAt, "dd/MM 'às' HH:mm")}.` : "Tarefa agendada.");
      router.refresh(); onDone();
    } catch (e) { toast.push((e as Error).message, "error"); } finally { setSaving(false); }
  };

  return (
    <form action={submit} className="grid sm:grid-cols-2 gap-3">
      <Field label="Nome da tarefa" className="sm:col-span-2"><input name="title" className="input" defaultValue={edit?.title ?? ""} placeholder="Ex.: Enviar proposta revisada" required autoFocus /></Field>
      <Field label="Contato relacionado" className="sm:col-span-2">
        {fixedConv ? <div className="input flex items-center bg-surface-2">{contactName ?? edit?.contactName ?? "Contato da conversa"}</div> : <ContactPicker value={contact} onChange={setContact} />}
      </Field>
      <Field label="Tipo de atividade"><select className="input" value={type} onChange={(e) => setType(e.target.value)}>{TASK_TYPE_OPTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></Field>
      <Field label="Responsável"><select name="assigneeId" className="input" defaultValue={edit?.assigneeId ?? me} disabled={!canAssign}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      <Field label="Data"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
      <Field label="Horário"><input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} required /></Field>
      <Field label={type === "ENVIAR_MENSAGEM" ? "Mensagem que será enviada" : needsMedia ? "Legenda / descrição (opcional)" : "Descrição"} className="sm:col-span-2"><textarea name="description" className="input" rows={3} defaultValue={edit?.description ?? ""} required={type === "ENVIAR_MENSAGEM"} /></Field>
      {needsMedia && (
        <div className="sm:col-span-2 space-y-2">
          <label className="label">{type === "ENVIAR_AUDIO" ? "Áudio (grave agora ou anexe)" : "Arquivo"}</label>
          {media ? (
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-2">
              {media.kind === "audio" ? <div className="flex-1"><AudioPlayer src={mediaUrl(media.id)} duration={media.durationSec} /></div> : <><FileText size={18} className="text-brand" /><span className="flex-1 truncate text-sm">{media.fileName}</span><span className="text-xs text-muted">{fmtSize(media.size)}</span></>}
              <button type="button" onClick={() => setMedia(null)} className="btn-ghost btn-sm"><X size={14} /> Trocar</button>
            </div>
          ) : uploading ? <div className="flex items-center gap-2 text-sm text-muted h-12"><Loader2 size={16} className="animate-spin" /> Salvando arquivo...</div> : (
            <div className="space-y-2">
              {type === "ENVIAR_AUDIO" && <InlineRecorder onReady={onRecorded} />}
              <label className="btn-secondary btn-sm cursor-pointer"><Paperclip size={14} /> Anexar {type === "ENVIAR_AUDIO" ? "arquivo de áudio" : type === "ENVIAR_IMAGEM" ? "imagem (JPG/PNG)" : "PDF, apresentação ou arquivo"}
                <input type="file" className="hidden" accept={type === "ENVIAR_AUDIO" ? "audio/*" : type === "ENVIAR_IMAGEM" ? "image/jpeg,image/png" : undefined} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f, f.name); e.target.value = ""; }} />
              </label>
            </div>
          )}
        </div>
      )}
      <Field label="Recorrência"><select name="recurrence" className="input" defaultValue={edit?.recurrence ?? "NONE"}><option value="NONE">Não repetir</option><option value="DAILY">Diariamente</option><option value="WEEKLY">Semanalmente</option><option value="MONTHLY">Mensalmente</option></select></Field>
      <div className="sm:col-span-2 text-[11px] text-muted leading-relaxed">
        {def.send ? "O envio é feito pelo servidor no horário marcado, mesmo com o CRM fechado. Se o WhatsApp não permitir o envio automático (ex.: contato sem conversa nas últimas 24h), a tarefa fica como \"Aguardando envio manual\" e você é avisado — ela nunca aparece como enviada sem ter sido." : "A tarefa aparece na agenda e em Minhas Tarefas, e você recebe um lembrete no horário."}
      </div>
      <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" onClick={onDone} className="btn-secondary">Cancelar</button><button type="submit" disabled={saving || uploading || (needsMedia && !media)} className="btn-primary">{saving ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />} {edit ? "Salvar alterações" : "Agendar"}</button></div>
    </form>
  );
}

export function ContactPicker({ value, onChange }: { value: { key: string; label: string } | null; onChange: (v: { key: string; label: string } | null) => void }) {
  const [q, setQ] = React.useState("");
  const [res, setRes] = React.useState<Awaited<ReturnType<typeof searchContacts>>>([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const h = setTimeout(async () => { setLoading(true); try { setRes(await searchContacts(q)); } finally { setLoading(false); } }, 250);
    return () => clearTimeout(h);
  }, [q]);
  if (value) return <div className="input flex items-center justify-between bg-surface-2"><span className="truncate">{value.label}</span><button type="button" onClick={() => onChange(null)} className="text-muted"><X size={14} /></button></div>;
  return (
    <div className="relative">
      <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar lead ou cliente por nome, empresa ou telefone" />{loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted" />}</div>
      {res.length > 0 && <ul className="absolute z-30 mt-1 w-full card max-h-60 overflow-y-auto py-1">{res.map((r) => <li key={`${r.kind}:${r.id}`}><button type="button" onClick={() => { onChange({ key: `${r.kind}:${r.id}`, label: `${r.name}${r.company ? ` · ${r.company}` : ""}` }); setQ(""); }} className="w-full text-left px-3 py-2 hover:bg-surface-2 text-sm flex items-center gap-2"><span className={r.kind === "cliente" ? "badge bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "badge bg-blue-500/10 text-blue-600 border-blue-500/20"}>{r.kind === "cliente" ? "Cliente" : "Lead"}</span><span className="truncate flex-1">{r.name}{r.company ? ` · ${r.company}` : ""}</span><span className="text-xs text-muted">{r.phone ?? "sem telefone"}</span></button></li>)}</ul>}
    </div>
  );
}
