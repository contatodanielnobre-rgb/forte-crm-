"use client";
import * as React from "react";
import { Send, Smile, Paperclip, Mic, Pause, Play, Trash2, X, Square, Loader2, FileText, Image as ImageIcon, Lock, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import { EMOJIS, fmtSize, type Msg } from "./client-api";
import { useRecorder, fmtDur } from "./use-recorder";
import { AudioPlayer } from "./message-bubble";

export type Outgoing = { text?: string; file?: { blob: Blob; name: string; durationSec?: number } };

export function Composer({ disabled, disabledReason, replyTo, onCancelReply, onSend, onTemplates, windowOpen }: {
  disabled: boolean; disabledReason?: React.ReactNode; replyTo: Msg | null; onCancelReply: () => void; onSend: (o: Outgoing) => Promise<void>; onTemplates: () => void; windowOpen: boolean;
}) {
  const [text, setText] = React.useState("");
  const [emoji, setEmoji] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const ta = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const rec = useRecorder();

  React.useEffect(() => { if (replyTo) ta.current?.focus(); }, [replyTo]);
  React.useEffect(() => { const el = ta.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(160, el.scrollHeight)}px`; }, [text]);

  const send = async () => {
    if (busy || disabled) return;
    const body = text.trim();
    if (!body && !file) return;
    setBusy(true);
    try { await onSend(file ? { text: body || undefined, file: { blob: file, name: file.name } } : { text: body }); setText(""); setFile(null); setEmoji(false); }
    finally { setBusy(false); ta.current?.focus(); }
  };
  const sendAudio = async () => {
    if (!rec.blob) return;
    setBusy(true);
    try { await onSend({ file: { blob: rec.blob, name: `audio-${new Date().toISOString().replace(/[:.]/g, "-")}.ogg`, durationSec: rec.elapsed } }); rec.reset(); }
    finally { setBusy(false); }
  };

  if (disabled) return <div className="border-t border-line bg-surface px-4 py-3 text-sm text-muted flex items-center gap-2"><Lock size={15} className="shrink-0" /> <div className="flex-1">{disabledReason}</div></div>;

  const recording = rec.state === "recording" || rec.state === "paused" || rec.state === "requesting";
  return (
    <div className="border-t border-line bg-surface relative">
      {replyTo && <div className="flex items-center gap-2 px-4 pt-2"><div className="flex-1 min-w-0 border-l-4 border-gold bg-surface-2 rounded-lg px-3 py-1.5 text-xs"><p className="font-medium flex items-center gap-1"><Reply size={12} /> Respondendo {replyTo.direction === "OUT" ? "sua mensagem" : "ao contato"}</p><p className="truncate text-muted">{replyTo.body || replyTo.media?.fileName || `[${replyTo.type}]`}</p></div><button onClick={onCancelReply} className="btn-ghost btn-icon h-8 w-8"><X size={15} /></button></div>}
      {file && <div className="flex items-center gap-3 mx-4 mt-2 p-2 rounded-xl bg-surface-2 text-sm">{file.type.startsWith("image/") ? <ImageIcon size={18} className="text-brand" /> : <FileText size={18} className="text-brand" />}<span className="truncate flex-1">{file.name}</span><span className="text-xs text-muted">{fmtSize(file.size)}</span><button onClick={() => setFile(null)} className="text-muted hover:text-fg"><X size={15} /></button></div>}
      {!windowOpen && <div className="mx-4 mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex flex-wrap items-center gap-2">Mais de 24h desde a última mensagem do contato. Pela regra do WhatsApp, inicie com um modelo aprovado. <button onClick={onTemplates} className="font-semibold underline">Enviar modelo</button></div>}
      {rec.error && <div className="mx-4 mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400 flex items-center justify-between gap-2">{rec.error}<button onClick={rec.reset}><X size={14} /></button></div>}

      {emoji && <div className="absolute bottom-full left-2 mb-2 card p-2 w-[min(340px,calc(100vw-1rem))] grid grid-cols-9 gap-0.5 max-h-56 overflow-y-auto z-20">{EMOJIS.map((e) => <button key={e} type="button" onClick={() => { const el = ta.current; const pos = el?.selectionStart ?? text.length; setText(text.slice(0, pos) + e + text.slice(pos)); requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + e.length, pos + e.length); }); }} className="text-xl h-9 rounded-lg hover:bg-surface-2">{e}</button>)}</div>}

      <div className="flex items-end gap-1.5 p-2 sm:p-3">
        {recording ? (
          <div className="flex-1 flex items-center gap-3 h-11 px-3 rounded-2xl bg-surface-2">
            <button onClick={rec.cancel} className="text-muted hover:text-red-500" title="Cancelar gravação"><Trash2 size={18} /></button>
            <span className={cn("w-2.5 h-2.5 rounded-full bg-red-500", rec.state === "recording" && "animate-pulse")} />
            <span className="tabular-nums text-sm font-medium w-12">{fmtDur(rec.elapsed)}</span>
            <div className="flex-1 flex items-center gap-[3px] h-6 overflow-hidden" aria-hidden>{Array.from({ length: 28 }, (_, i) => <span key={i} className="w-[3px] rounded-full bg-gold transition-all" style={{ height: `${rec.state === "recording" ? Math.max(12, Math.min(100, rec.level * 100 * (0.5 + Math.abs(Math.sin(i * 1.7 + rec.elapsed))))) : 12}%` }} />)}</div>
            <span className="text-xs text-muted hidden sm:block">{rec.state === "requesting" ? "Aguardando permissão..." : rec.state === "paused" ? "Pausado" : "Gravando"}</span>
            {rec.state === "recording" && <button onClick={rec.pause} className="text-muted hover:text-fg" title="Pausar"><Pause size={18} /></button>}
            {rec.state === "paused" && <button onClick={rec.resume} className="text-muted hover:text-fg" title="Continuar"><Mic size={18} /></button>}
            <button onClick={rec.stop} disabled={rec.state === "requesting"} className="w-9 h-9 rounded-full bg-brand text-white grid place-items-center" title="Concluir e ouvir"><Square size={14} /></button>
          </div>
        ) : rec.state === "ready" && rec.url ? (
          <div className="flex-1 flex items-center gap-2 min-h-11 px-2 rounded-2xl bg-surface-2">
            <button onClick={rec.reset} className="btn-ghost btn-icon h-9 w-9 text-red-500" title="Excluir gravação"><Trash2 size={17} /></button>
            <div className="flex-1"><AudioPlayer src={rec.url} duration={rec.elapsed} /></div>
            <button onClick={sendAudio} disabled={busy} className="w-11 h-11 rounded-full bg-brand text-white grid place-items-center shrink-0" title="Enviar áudio">{busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button>
          </div>
        ) : (
          <>
            <button type="button" onClick={() => setEmoji((v) => !v)} className={cn("btn-ghost btn-icon h-11 w-11 shrink-0", emoji && "text-gold")} title="Emojis"><Smile size={21} /></button>
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost btn-icon h-11 w-11 shrink-0" title="Anexar imagem, PDF ou arquivo"><Paperclip size={20} /></button>
            <input ref={fileRef} type="file" className="hidden" accept="image/jpeg,image/png,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,audio/*,video/mp4" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ""; }} />
            <textarea ref={ta} rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} onPaste={(e) => { const f = Array.from(e.clipboardData.files)[0]; if (f) { e.preventDefault(); setFile(f); } }} placeholder={file ? "Legenda (opcional)" : "Digite uma mensagem"} className="flex-1 resize-none rounded-2xl bg-surface-2 border border-transparent focus:border-gold/50 outline-none px-4 py-2.5 text-[15px] max-h-40 leading-snug" />
            {text.trim() || file ? (
              <button onClick={send} disabled={busy} className="w-11 h-11 rounded-full bg-brand text-white grid place-items-center shrink-0 shadow-sm shadow-brand/30" title="Enviar (Enter)">{busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button>
            ) : (
              <button onClick={rec.start} className="w-11 h-11 rounded-full bg-[#111114] dark:bg-gold text-gold dark:text-black grid place-items-center shrink-0" title="Gravar áudio"><Mic size={20} /></button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Gravador compacto reutilizado no agendamento de áudio. */
export function InlineRecorder({ onReady }: { onReady: (blob: Blob, durationSec: number) => void }) {
  const rec = useRecorder();
  React.useEffect(() => { if (rec.state === "ready" && rec.blob) onReady(rec.blob, rec.elapsed); }, [rec.state, rec.blob, rec.elapsed, onReady]);
  if (rec.state === "ready" && rec.url) return <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-2"><div className="flex-1"><AudioPlayer src={rec.url} duration={rec.elapsed} /></div><button type="button" onClick={rec.reset} className="btn-ghost btn-sm text-red-500"><Trash2 size={14} /> Regravar</button></div>;
  const active = rec.state === "recording" || rec.state === "paused";
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 h-12">
      {!active ? <button type="button" onClick={rec.start} className="btn-secondary btn-sm"><Mic size={14} /> {rec.state === "requesting" ? "Aguardando permissão..." : "Gravar áudio"}</button> : <>
        <span className={cn("w-2.5 h-2.5 rounded-full bg-red-500", rec.state === "recording" && "animate-pulse")} /><span className="tabular-nums text-sm">{fmtDur(rec.elapsed)}</span><span className="flex-1" />
        {rec.state === "recording" ? <button type="button" onClick={rec.pause} className="btn-ghost btn-sm"><Pause size={14} /></button> : <button type="button" onClick={rec.resume} className="btn-ghost btn-sm"><Play size={14} /></button>}
        <button type="button" onClick={rec.cancel} className="btn-ghost btn-sm text-red-500"><X size={14} /></button>
        <button type="button" onClick={rec.stop} className="btn-primary btn-sm"><Square size={12} /> Concluir</button>
      </>}
      {rec.error && <span className="text-xs text-red-500">{rec.error}</span>}
    </div>
  );
}
