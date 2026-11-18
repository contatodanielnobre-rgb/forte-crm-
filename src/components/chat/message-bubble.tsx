"use client";
import * as React from "react";
import { Check, CheckCheck, Clock, AlertCircle, Download, FileText, Play, Pause, Reply, Forward, Copy, Trash2, MoreVertical, CalendarClock, MapPin, User, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/format";
import { fmtSize, mediaUrl, type Msg } from "./client-api";
import { fmtDur } from "./use-recorder";

export function AudioPlayer({ src, duration, mine }: { src: string; duration?: number | null; mine?: boolean }) {
  const ref = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [cur, setCur] = React.useState(0);
  const [dur, setDur] = React.useState(duration ?? 0);
  const [rate, setRate] = React.useState(1);
  const toggle = () => { const a = ref.current; if (!a) return; if (a.paused) { document.querySelectorAll("audio").forEach((x) => x !== a && x.pause()); a.play().catch(() => {}); } else a.pause(); };
  const pct = dur ? Math.min(100, (cur / dur) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5 min-w-[220px] max-w-[300px] py-1">
      <button type="button" onClick={toggle} className={cn("w-9 h-9 rounded-full grid place-items-center shrink-0 transition", mine ? "bg-white/90 text-black" : "bg-brand text-white")} aria-label={playing ? "Pausar" : "Reproduzir"}>{playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}</button>
      <div className="flex-1 min-w-0">
        <input type="range" min={0} max={dur || 0} step={0.1} value={cur} onChange={(e) => { const a = ref.current; if (a) { a.currentTime = Number(e.target.value); setCur(a.currentTime); } }} className="w-full h-1 accent-brand cursor-pointer" style={{ background: `linear-gradient(to right, currentColor ${pct}%, rgb(var(--line)) ${pct}%)` }} aria-label="Progresso" />
        <div className="flex justify-between text-[10px] opacity-70 mt-0.5"><span>{fmtDur(playing || cur ? cur : dur)}</span><button type="button" onClick={() => { const n = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; setRate(n); if (ref.current) ref.current.playbackRate = n; }} className="font-semibold hover:opacity-100">{rate}x</button></div>
      </div>
      <audio ref={ref} src={src} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setCur(0); }} onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)} onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDur(d); }} />
    </div>
  );
}

function Status({ m }: { m: Msg }) {
  if (m.direction !== "OUT") return null;
  if (m.pending) return <Clock size={13} className="opacity-70" />;
  if (m.status === "FALHA" || m.localError) return <AlertCircle size={13} className="text-red-400" />;
  if (m.status === "LIDA") return <CheckCheck size={14} className="text-sky-400" />;
  if (m.status === "ENTREGUE") return <CheckCheck size={14} className="opacity-70" />;
  if (m.status === "ENVIADA") return <Check size={14} className="opacity-70" />;
  return <Clock size={13} className="opacity-70" />;
}
const STATUS_TITLE: Record<string, string> = { PENDENTE: "Enviando", ENVIADA: "Enviada", ENTREGUE: "Entregue", LIDA: "Lida", FALHA: "Falhou", RECEBIDA: "Recebida" };

export function MessageBubble({ m, reactions, onReply, onForward, onDelete, onRetry, canDelete, onJump }: { m: Msg; reactions?: string[]; onReply: () => void; onForward: () => void; onDelete: () => void; onRetry?: () => void; canDelete: boolean; onJump?: (id: string) => void }) {
  const mine = m.direction === "OUT";
  const [menu, setMenu] = React.useState(false);
  const copy = () => { navigator.clipboard?.writeText(m.body ?? m.media?.fileName ?? ""); setMenu(false); };
  const isImage = m.media && (m.media.kind === "image" || m.media.kind === "sticker" || m.media.mimeType.startsWith("image/"));
  const isAudio = m.media && (m.media.kind === "audio" || m.media.mimeType.startsWith("audio/"));
  const isVideo = m.media && m.media.mimeType.startsWith("video/");
  return (
    <div id={`m-${m.id}`} className={cn("group flex px-3 sm:px-6", mine ? "justify-end" : "justify-start")}>
      <div className={cn("relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-1.5 shadow-sm text-[14px] leading-snug", mine ? "bg-[#1d1d22] text-white rounded-br-md dark:bg-[#2a2216] dark:text-[#f5ead0]" : "bg-surface border border-line rounded-bl-md", (m.status === "FALHA" || m.localError) && "ring-1 ring-red-500/50")}>
        {m.deleted ? <p className="italic opacity-60 flex items-center gap-1.5 py-1"><Ban size={13} /> Mensagem apagada no CRM</p> : <>
          {(m.forwarded || m.scheduled) && <p className="text-[11px] opacity-60 flex items-center gap-1 mb-0.5">{m.forwarded && <><Forward size={11} /> Encaminhada</>}{m.scheduled && <><CalendarClock size={11} /> Agendada</>}</p>}
          {mine && m.sender && <p className="text-[11px] font-semibold text-gold mb-0.5">{m.sender.name}</p>}
          {m.reply && <button type="button" onClick={() => onJump?.(m.reply!.id)} className={cn("block w-full text-left text-xs rounded-lg px-2 py-1 mb-1 border-l-4 border-gold", mine ? "bg-white/10" : "bg-surface-2")}><span className="font-medium opacity-80">{m.reply.direction === "OUT" ? "Você" : "Contato"}</span><span className="block truncate opacity-70">{m.reply.body || `[${m.reply.type}]`}</span></button>}
          {isImage && m.media && <a href={mediaUrl(m.media.id)} target="_blank" rel="noreferrer" className="block my-1"><img src={mediaUrl(m.media.id)} alt={m.media.fileName} className="rounded-xl max-h-72 max-w-full object-contain bg-black/10" loading="lazy" /></a>}
          {isAudio && m.media && <AudioPlayer src={mediaUrl(m.media.id)} duration={m.media.durationSec} mine={mine} />}
          {isVideo && m.media && <video src={mediaUrl(m.media.id)} controls className="rounded-xl max-h-72 max-w-full my-1" preload="metadata" />}
          {m.media && !isImage && !isAudio && !isVideo && (
            <a href={mediaUrl(m.media.id)} target="_blank" rel="noreferrer" className={cn("flex items-center gap-3 rounded-xl p-2.5 my-1 min-w-[220px]", mine ? "bg-white/10 hover:bg-white/15" : "bg-surface-2 hover:bg-line/50")}>
              <div className="w-10 h-10 rounded-lg bg-brand/15 text-brand grid place-items-center shrink-0"><FileText size={20} /></div>
              <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{m.media.fileName}</p><p className="text-[11px] opacity-60">{m.media.mimeType.split("/")[1]?.toUpperCase().slice(0, 8)} · {fmtSize(m.media.size)}</p></div>
              <Download size={16} className="opacity-60 shrink-0" />
            </a>
          )}
          {m.type === "location" && <p className="flex items-start gap-1.5"><MapPin size={14} className="mt-0.5 shrink-0" /> <a className="underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent((m.body ?? "").split(" — ").pop() ?? "")}`}>{m.body}</a></p>}
          {m.type === "contacts" && <p className="flex items-start gap-1.5"><User size={14} className="mt-0.5 shrink-0" />{m.body}</p>}
          {m.body && !["location", "contacts"].includes(m.type) && !(m.type === "document" && m.media && m.body === m.media.fileName) && <p className={cn("whitespace-pre-wrap break-words", m.type === "unsupported" && "italic opacity-70", m.template && "opacity-90")}>{m.body}</p>}
          {m.error && <p className="text-[11px] text-red-400 mt-1">{m.error}</p>}
          {m.localError && <p className="text-[11px] text-red-400 mt-1">{m.localError} {onRetry && <button type="button" onClick={onRetry} className="underline font-medium">Tentar novamente</button>}</p>}
        </>}
        <div className="flex items-center justify-end gap-1 text-[10px] opacity-60 mt-0.5 select-none" title={STATUS_TITLE[m.status]}><span>{fmtTime(m.createdAt)}</span><Status m={m} /></div>
        {!!reactions?.length && <div className={cn("absolute -bottom-3 text-xs bg-surface border border-line rounded-full px-1.5 shadow-sm", mine ? "right-2" : "left-2")}>{reactions.join("")}</div>}
        {!m.deleted && !m.pending && (
          <div className={cn("absolute top-1 opacity-0 group-hover:opacity-100 transition", mine ? "-left-8" : "-right-8", menu && "opacity-100")}>
            <button type="button" onClick={() => setMenu((v) => !v)} className="w-7 h-7 rounded-full grid place-items-center text-muted hover:bg-surface-2" aria-label="Ações da mensagem"><MoreVertical size={15} /></button>
            {menu && (
              <div className={cn("absolute z-20 top-8 w-44 card py-1 text-sm text-fg", mine ? "right-0" : "left-0")} onMouseLeave={() => setMenu(false)}>
                <MenuItem icon={Reply} onClick={() => { onReply(); setMenu(false); }}>Responder</MenuItem>
                <MenuItem icon={Forward} onClick={() => { onForward(); setMenu(false); }}>Encaminhar</MenuItem>
                <MenuItem icon={Copy} onClick={copy}>Copiar</MenuItem>
                {m.media && <a href={mediaUrl(m.media.id, true)} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2"><Download size={14} /> Baixar</a>}
                {canDelete && <MenuItem icon={Trash2} danger onClick={() => { setMenu(false); onDelete(); }}>Excluir</MenuItem>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({ icon: Icon, children, onClick, danger }: { icon: typeof Reply; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={cn("w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-2 text-left", danger && "text-red-500")}><Icon size={14} /> {children}</button>;
}
