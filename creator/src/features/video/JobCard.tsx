import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Download, Film, Loader2, RefreshCw, Scissors, Trash2, WandSparkles, X } from 'lucide-react'
import { cn, errMsg } from '@/lib/utils'
import { Spinner } from '@/components/ui'
import { MicButton, appendDictated } from '@/features/studio/Dictation'
import { signedUrl } from '@/lib/storage'
import { BUCKET_VIDEOS, cancelVideoJob, createVideoJob, deleteVideoJob, fmtDur, fmtMb, invalidateVideo, retryVideoJob, useVideoUrl } from './data'
import type { VideoJob } from './types'
import type { Brand } from '@/features/studio/types'

const ENGINE_LABEL = { edit: 'Remotion (edição)', saas: 'saas-video (produto)', hyperframes: 'HyperFrames (HTML)' } as const
const VARIANT_LABEL = { stacked: 'empilhada', karaoke: 'karaokê', single: 'uma palavra', boxed: 'em tarja', none: 'sem legenda' } as const
const ASPECT: Record<string, string> = { '9:16': 'aspect-[9/16]', '16:9': 'aspect-video', '1:1': 'aspect-square', '4:5': 'aspect-[4/5]' }

const ago = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'agora há pouco'
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

const Status = ({ j }: { j: VideoJob }) => {
  const map = {
    queued: ['bg-zinc-100 text-zinc-600', <Clock key="i" className="h-3 w-3" />, 'Na fila'],
    running: ['bg-blue-50 text-blue-700', <Loader2 key="i" className="h-3 w-3 animate-spin" />, 'Editando'],
    done: ['bg-emerald-50 text-emerald-700', <CheckCircle2 key="i" className="h-3 w-3" />, 'Pronto'],
    error: ['bg-red-50 text-red-700', <AlertTriangle key="i" className="h-3 w-3" />, 'Erro'],
    canceled: ['bg-zinc-100 text-zinc-500', <X key="i" className="h-3 w-3" />, 'Cancelado'],
  } as const
  const [cls, icon, label] = map[j.status]
  return <span className={cn('chip gap-1', cls)}>{icon}{label}</span>
}

export default function JobCard({ job, brand, userId, logoPath, onAdjusted }: { job: VideoJob; brand: Brand; userId: string; logoPath?: string | null; onAdjusted?: () => void }) {
  const qc = useQueryClient()
  const url = useVideoUrl(job.status === 'done' ? job.output_path : null)
  const poster = useVideoUrl(job.status === 'done' ? job.thumb_path : null)
  const [adjust, setAdjust] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const plan = job.plan
  const running = job.status === 'queued' || job.status === 'running'

  const run = async (fn: () => Promise<unknown>, ok?: string) => { setBusy(true); try { await fn(); if (ok) toast.success(ok); invalidateVideo(qc) } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) } }

  const download = async () => {
    if (!job.output_path) return
    // baixa como arquivo (blob) para o navegador não abrir o vídeo em outra aba
    try {
      const res = await fetch(await signedUrl(job.output_path, undefined, BUCKET_VIDEOS))
      if (!res.ok) throw new Error(`Falha ao baixar (${res.status})`)
      const obj = URL.createObjectURL(await res.blob())
      const a = document.createElement('a'); a.href = obj; a.download = `${job.title.replace(/[^\w\- ]+/g, '').trim() || 'video'}.mp4`
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(obj), 10_000)
    } catch (e) { toast.error(errMsg(e)) }
  }

  const sendAdjust = () => run(async () => {
    await createVideoJob({ brand, userId, title: `${job.title} · ajuste`, instruction: job.instruction, format: job.format, engine: job.engine, style: job.style_id ? { id: job.style_id, name: job.style_name ?? '' } as never : null, options: job.options, files: [], refUrls: job.ref_urls, parent: job, feedback: text.trim(), logoPath })
    setText(''); setAdjust(false); onAdjusted?.()
  }, 'Ajuste enviado para a fila')

  return (
    <article data-testid="video-job" data-status={job.status} className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-bold tracking-tight">{job.title}</h3>
          <p className="mt-0.5 truncate text-xs text-zinc-500">{job.style_name ?? 'Sem estilo (a IA decide)'} · {job.format} · {ago(job.created_at)}</p>
        </div>
        <Status j={job} />
      </div>

      {job.status === 'done' && (
        <div className="px-4">
          <div className={cn('mx-auto w-full overflow-hidden rounded-xl bg-black', job.format === '9:16' ? 'max-w-[260px]' : job.format === '4:5' ? 'max-w-[320px]' : 'max-w-full', ASPECT[job.format])}>
            {url ? <video src={url} poster={poster ?? undefined} controls playsInline preload="metadata" className="h-full w-full object-contain" data-testid="video-player" /> : <div className="flex h-full items-center justify-center text-zinc-500"><Spinner /></div>}
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500">{fmtDur(job.duration_sec)} · {fmtMb(job.output_size)}{plan ? ` · ${ENGINE_LABEL[plan.engine]}` : ''}</p>
        </div>
      )}

      {running && (
        <div className="space-y-2 px-4 pb-1">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-light to-brand transition-all duration-500" style={{ width: `${Math.max(3, job.progress)}%` }} /></div>
          <p className="flex items-center justify-between text-xs text-zinc-500"><span className="truncate" data-testid="video-stage">{job.status === 'queued' ? 'Aguardando a VPS…' : job.stage ?? 'Iniciando'}</span><b className="tabular-nums text-ink">{job.progress}%</b></p>
        </div>
      )}

      {job.status === 'error' && <p className="mx-4 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800" data-testid="video-error">{job.error}</p>}
      {job.feedback && <p className="mx-4 mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900"><b>Ajuste pedido:</b> {job.feedback}</p>}

      {plan && (
        <details className="mx-4 mt-3 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-xs">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-zinc-700"><span className="flex items-center gap-1.5"><WandSparkles className="h-3.5 w-3.5 text-brand" />O que a IA decidiu</span><ChevronDown className="h-3.5 w-3.5" /></summary>
          <p className="mt-2 text-zinc-700">{plan.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="chip bg-white text-zinc-700 ring-1 ring-zinc-200">{ENGINE_LABEL[plan.engine]}</span>
            <span className="chip bg-white text-zinc-700 ring-1 ring-zinc-200"><Scissors className="h-3 w-3" />{plan.cut.silences ? 'sem silêncios' : 'mantém pausas'}{plan.cut.remove.length ? ` · ${plan.cut.remove.length} trecho(s) removido(s)` : ''}{plan.cut.speed !== 1 ? ` · ${plan.cut.speed}x` : ''}</span>
            <span className="chip bg-white text-zinc-700 ring-1 ring-zinc-200">legenda {VARIANT_LABEL[plan.captions.variant]}</span>
            {plan.overlays.length > 0 && <span className="chip bg-white text-zinc-700 ring-1 ring-zinc-200">{plan.overlays.length} destaques na tela</span>}
            {plan.zooms.length > 0 && <span className="chip bg-white text-zinc-700 ring-1 ring-zinc-200">{plan.zooms.length} zooms</span>}
            {plan.sfx.length > 0 && <span className="chip bg-white text-zinc-700 ring-1 ring-zinc-200">{plan.sfx.length} efeitos sonoros</span>}
            {plan.outro.enabled && <span className="chip bg-white text-zinc-700 ring-1 ring-zinc-200">cartão final</span>}
            <span className="chip bg-white ring-1 ring-zinc-200" style={{ color: plan.look.accent }}>● {plan.look.accent} · {plan.look.font}</span>
          </div>
        </details>
      )}

      {job.log && (
        <div className="mx-4 mt-2">
          <button type="button" onClick={() => setShowLog((v) => !v)} className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-700">{showLog ? 'Ocultar' : 'Ver'} registro da VPS</button>
          {showLog && <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-zinc-900 p-2 text-[10px] leading-relaxed text-zinc-200">{job.log}</pre>}
        </div>
      )}

      {adjust && (
        <div className="mx-4 mt-3 space-y-2 rounded-xl border border-zinc-200 p-3">
          <div className="flex items-center justify-between"><p className="label !mb-0">O que mudar nesta versão?</p><MicButton onText={(x) => setText((v) => appendDictated(v, x))} title="Ditar o ajuste" /></div>
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: legenda maior, tire o zoom do segundo 8, deixe mais rápido e acrescente o preço no final." data-testid="adjust-text" />
          <div className="flex gap-2"><button type="button" className="btn-brand btn-sm" disabled={busy || text.trim().length < 3} onClick={sendAdjust} data-testid="adjust-send">{busy ? <Spinner /> : <WandSparkles className="h-3.5 w-3.5" />}Refazer com este ajuste</button><button type="button" className="btn-ghost btn-sm" onClick={() => setAdjust(false)}>Cancelar</button></div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 p-3">
        {job.status === 'done' && <>
          <button type="button" className="btn-primary btn-sm" onClick={download} data-testid="video-download"><Download className="h-3.5 w-3.5" />Baixar MP4</button>
          <button type="button" className="btn-outline btn-sm" onClick={() => setAdjust((v) => !v)} data-testid="video-adjust"><WandSparkles className="h-3.5 w-3.5" />Ajustar</button>
        </>}
        {running && <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={() => run(() => cancelVideoJob(job.id), 'Pedido cancelado')}><X className="h-3.5 w-3.5" />Cancelar</button>}
        {(job.status === 'error' || job.status === 'canceled') && <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={() => run(() => retryVideoJob(job.id), 'De volta para a fila')}><RefreshCw className="h-3.5 w-3.5" />Tentar de novo</button>}
        {!running && <button type="button" className="btn-ghost btn-sm ml-auto text-red-600 hover:bg-red-50" disabled={busy} onClick={() => { if (confirm(`Excluir "${job.title}" e os arquivos dele?`)) run(() => deleteVideoJob(job), 'Excluído') }} aria-label="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>}
        {job.inputs.length > 0 && <span className="ml-auto hidden items-center gap-1 text-[11px] text-zinc-400 sm:flex"><Film className="h-3 w-3" />{job.inputs.filter((i) => i.role !== 'logo').length} arquivo(s)</span>}
      </div>
    </article>
  )
}
