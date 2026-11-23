import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Lightbulb, AlertTriangle, CalendarPlus, Check, ChevronLeft, ChevronRight, Copy, Download, Eraser, FolderUp, Maximize2, RefreshCw, Send, Star, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, errMsg, fromNow } from '@/lib/utils'
import { ConfirmDialog, Field, Input, Modal, Skeleton, Spinner } from '@/components/ui'
import { ASPECTS, FORMAT_PRESETS, ROLE_LABEL, parseAspect } from './catalog'
import { deleteGeneration, downloadImages, regenerateSlide, schedulePublication, sendToClient, setCurrentVersion, useGenerations, useModels } from './data'
import MarkerEditor from './MarkerEditor'
import SlideViewer from './Viewer'
import { Popover, StudioImg } from './ui'
import type { Brand, Generation, StudioImage } from './types'

interface Slide { index: number; current: StudioImage; versions: StudioImage[] }
function slidesOf(g: Generation): Slide[] {
  const by = new Map<number, StudioImage[]>()
  ;(g.studio_images ?? []).forEach((i) => by.set(i.slide_index, [...(by.get(i.slide_index) ?? []), i]))
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([index, list]) => {
    const versions = list.sort((a, b) => a.version - b.version)
    return { index, versions, current: versions.find((v) => v.is_current) ?? versions[versions.length - 1] }
  })
}

export default function GenerationFeed({ brand, onEmpty, onReuse }: { brand: Brand; onEmpty?: React.ReactNode; onReuse?: (g: Generation) => void }) {
  const { data, isLoading } = useGenerations(brand.id)
  if (isLoading) return <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-72" />)}</div>
  if (!data?.length) return <>{onEmpty}</>
  return <div className="space-y-5">{data.map((g) => <GenerationCard key={g.id} gen={g} brand={brand} onReuse={onReuse} />)}</div>
}

export function GenerationCard({ gen, brand, onReuse }: { gen: Generation; brand: Brand; onReuse?: (g: Generation) => void }) {
  const qc = useQueryClient()
  const { data: models } = useModels()
  const slides = useMemo(() => slidesOf(gen), [gen])
  const [edit, setEdit] = useState<StudioImage | null>(null)
  const [view, setView] = useState<number | null>(null)
  const [del, setDel] = useState(false)
  const [send, setSend] = useState<null | 'files' | 'approval' | 'schedule'>(null)
  const [copied, setCopied] = useState(false)
  const ratio = parseAspect(gen.aspect) ?? { w: 4, h: 5 }
  const tileH = 300, tileW = Math.round(tileH * (ratio.w / ratio.h))
  const done = slides.filter((s) => s.current.status === 'done').length
  const model = models?.find((m) => m.id === gen.model_id)
  const preset = FORMAT_PRESETS.find((p) => p.id === gen.format_preset)
  const label = gen.input_text?.slice(0, 80) || 'Criação'
  const refresh = () => qc.invalidateQueries({ queryKey: ['studio', 'generations', brand.id] })

  const copyCaption = async () => {
    const txt = [gen.caption, gen.hashtags?.join(' ')].filter(Boolean).join('\n\n')
    await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  const download = () => downloadImages(brand.name, slides.map((s) => s.current), gen.kind === 'carousel' ? 'carrossel' : 'criativo').catch((e) => toast.error(errMsg(e)))
  const remove = async () => {
    try { await deleteGeneration(gen.id, gen.studio_images ?? []); refresh(); toast.success('Criação excluída') } catch (e) { toast.error(errMsg(e)) }
    setDel(false)
  }
  const fav = async (i: StudioImage) => { await supabase.from('studio_images').update({ favorite: !i.favorite }).eq('id', i.id); refresh() }

  return (
    <article className="card animate-fade-up overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-100 px-4 py-3 sm:px-5">
        <span className={cn('chip', gen.kind === 'carousel' ? 'bg-ink text-white' : 'bg-brand-soft text-brand')}>{gen.kind === 'carousel' ? `Carrossel · ${slides.length}` : 'Estático'}</span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800" title={gen.input_text ?? ''}>{label}</p>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {preset && <span className="hidden md:inline">{preset.name} ·</span>}<span>{gen.aspect}</span>·<span>{model?.name ?? '—'}</span>·<span>{fromNow(gen.created_at)}</span>
          {gen.meta?.demo && <span className="chip bg-amber-50 text-amber-700">demo</span>}
        </div>
        <StatusPill gen={gen} done={done} total={slides.length} />
      </header>

      <div className="flex gap-3 overflow-x-auto px-4 py-4 scrollbar-thin sm:px-5">
        {slides.map((s) => <Tile key={s.index} s={s} w={tileW} h={tileH} onView={() => setView(s.index)} onEdit={() => setEdit(s.current)} onRegen={() => regenerateSlide(s.current, qc, brand.id)} onFav={() => fav(s.current)} onVersion={(v) => { setCurrentVersion(v).then(refresh) }} />)}
      </div>

      <footer className="flex flex-wrap items-start gap-3 border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          {gen.caption ? (
            <>
              <p className="line-clamp-3 whitespace-pre-wrap text-sm text-zinc-700">{gen.caption}</p>
              {gen.hashtags?.length > 0 && <p className="mt-1.5 line-clamp-2 text-xs font-medium text-brand">{gen.hashtags.join(' ')}</p>}
            </>
          ) : <p className="text-xs text-zinc-400">Sem legenda gerada{gen.hashtags?.length ? ` · ${gen.hashtags.join(' ')}` : ''}.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(gen.caption || gen.hashtags?.length > 0) && <button className="btn-outline btn-sm" onClick={copyCaption}>{copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}Legenda</button>}
          <Link to={`/studio/ideas?from=${gen.id}`} className="btn-outline btn-sm" title="Abre o Criador de prompts com tudo desta criação (estilo, personagens, logo, fontes, slides) para você mudar e criar de novo" data-testid="card-to-ideas"><Lightbulb className="h-3.5 w-3.5" />Criador de prompts</Link>
          {onReuse && <button className="btn-outline btn-sm" onClick={() => onReuse(gen)} title="Reaproveitar o briefing no composer"><RefreshCw className="h-3.5 w-3.5" />Reusar</button>}
          <Link to={`/studio/editor?gen=${gen.id}`} className={cn('btn-outline btn-sm', !done && 'pointer-events-none opacity-50')} title="Editor de fotos: tira a cara de IA (luz, cor, granulação) em todos os slides"><Eraser className="h-3.5 w-3.5" />Remover IA</Link>
          <button className="btn-outline btn-sm" onClick={download} disabled={!done}><Download className="h-3.5 w-3.5" />Baixar{slides.length > 1 ? ' ZIP' : ''}</button>
          {brand.client_id && (
            <Popover up align="right" width={250} trigger={(open, toggle) => <button data-open={open} className="btn-primary btn-sm" onClick={toggle} disabled={!done}><Send className="h-3.5 w-3.5" />Enviar ao cliente</button>}>
              {(close) => (
                <div className="p-1 text-sm">
                  {[['files', FolderUp, 'Salvar nos arquivos', 'Guarda na central do cliente (oculto)'], ['approval', Check, 'Enviar para aprovação', 'Cliente é avisado e aprova'], ['schedule', CalendarPlus, 'Agendar publicação', 'Cria item no cronograma']].map(([id, Icon, t, d]) => {
                    const I = Icon as typeof Check
                    return <button key={id as string} className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-zinc-50" onClick={() => { setSend(id as 'files'); close() }}><I className="mt-0.5 h-4 w-4 text-brand" /><span><b className="block">{t as string}</b><span className="text-xs text-zinc-500">{d as string}</span></span></button>
                  })}
                </div>
              )}
            </Popover>
          )}
          <button className="btn-ghost btn-sm hover:text-brand" onClick={() => setDel(true)} aria-label="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </footer>

      {edit && <MarkerEditor image={edit} modelId={gen.model_id} onClose={() => setEdit(null)} />}
      {view !== null && <SlideViewer slides={slides} start={view} aspectLabel={ASPECTS.find((a) => a.id === gen.aspect)?.hint ?? gen.aspect} onClose={() => setView(null)} />}
      {send && <SendModal mode={send} brand={brand} gen={gen} images={slides.map((s) => s.current)} defaultTitle={label.slice(0, 60)} onClose={() => setSend(null)} />}
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={remove} danger title="Excluir criação" message="As imagens e todas as versões desta criação serão apagadas." confirmLabel="Excluir" />
    </article>
  )
}

function StatusPill({ gen, done, total }: { gen: Generation; done: number; total: number }) {
  if (gen.status === 'running') return <span className="chip bg-amber-50 text-amber-700"><Spinner className="h-3 w-3 text-amber-600" />Gerando {done}/{total}</span>
  if (gen.status === 'done') return <span className="chip bg-emerald-50 text-emerald-700"><Check className="h-3 w-3" />Pronto</span>
  if (gen.status === 'partial') return <span className="chip bg-amber-50 text-amber-700"><AlertTriangle className="h-3 w-3" />Parcial</span>
  return <span className="chip bg-brand-soft text-brand"><AlertTriangle className="h-3 w-3" />Erro</span>
}

function Tile({ s, w, h, onView, onEdit, onRegen, onFav, onVersion }: {
  s: Slide; w: number; h: number; onView: () => void; onEdit: () => void; onRegen: () => void; onFav: () => void; onVersion: (v: StudioImage) => void
}) {
  const c = s.current
  const vi = s.versions.findIndex((v) => v.id === c.id)
  const busy = c.status === 'queued' || c.status === 'running'
  return (
    <div className="group relative shrink-0 overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-black/5" style={{ width: w, height: h }}>
      {c.status === 'done' && c.storage_path ? (
        <button type="button" onClick={onView} className="block h-full w-full"><StudioImg path={c.storage_path} className="h-full w-full" /></button>
      ) : busy ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center">
          <div className="skeleton absolute inset-0 animate-shimmer" />
          <Spinner className="relative h-6 w-6 text-zinc-500" />
          <p className="relative text-xs font-medium text-zinc-600">{c.status === 'queued' ? 'Na fila…' : 'Criando a arte…'}</p>
          <p className="relative line-clamp-3 text-[11px] text-zinc-500">{c.slide_text}</p>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-brand-soft/60 p-4 text-center">
          <AlertTriangle className="h-6 w-6 text-brand" />
          <p className="text-xs font-semibold text-brand">Não foi possível gerar</p>
          <p className="line-clamp-5 text-[11px] text-red-900/80">{c.error ?? 'Erro desconhecido'}</p>
          <button className="btn-outline btn-sm mt-1" onClick={onRegen}><RefreshCw className="h-3.5 w-3.5" />Tentar de novo</button>
        </div>
      )}
      <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">{s.index}{c.role && <span className="font-medium opacity-70">· {ROLE_LABEL[c.role] ?? c.role}</span>}</span>
      {c.favorite && <span className="pointer-events-none absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-white"><Star className="h-3 w-3 fill-current" /></span>}
      {c.status === 'done' && (
        <>
          <div className="absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-center gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 pt-8 opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            {[[Eraser, 'Editar com marcadores', onEdit], [RefreshCw, 'Gerar nova versão', onRegen], [Star, c.favorite ? 'Desfavoritar' : 'Favoritar', onFav], [Maximize2, 'Ver grande', onView]].map(([Icon, t, fn]) => {
              const I = Icon as typeof Eraser
              return <button key={t as string} type="button" title={t as string} aria-label={t as string} onClick={fn as () => void} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink backdrop-blur transition hover:scale-110 hover:bg-white"><I className="h-4 w-4" /></button>
            })}
          </div>
          {s.versions.length > 1 && (
            <div className="absolute bottom-2 left-2 flex items-center gap-0.5 rounded-full bg-ink/80 px-1 py-0.5 text-[10px] font-bold text-white backdrop-blur group-hover:opacity-0">
              v{c.version}/{s.versions[s.versions.length - 1].version}
            </div>
          )}
        </>
      )}
      {s.versions.length > 1 && (
        <div className="absolute right-2 bottom-12 flex items-center gap-0.5 rounded-full bg-white/90 p-0.5 opacity-0 shadow-card backdrop-blur transition group-hover:opacity-100">
          <button type="button" aria-label="Versão anterior" disabled={vi <= 0} onClick={() => onVersion(s.versions[vi - 1])} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-zinc-100 disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span className="px-1 text-[10px] font-bold">v{c.version}</span>
          <button type="button" aria-label="Próxima versão" disabled={vi >= s.versions.length - 1} onClick={() => onVersion(s.versions[vi + 1])} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-zinc-100 disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  )
}

function SendModal({ mode, brand, gen, images, defaultTitle, onClose }: { mode: 'files' | 'approval' | 'schedule'; brand: Brand; gen: Generation; images: StudioImage[]; defaultTitle: string; onClose: () => void }) {
  const { profile } = useAuth()
  const [title, setTitle] = useState(defaultTitle)
  const [when, setWhen] = useState(() => { const d = new Date(Date.now() + 2 * 864e5); d.setHours(10, 0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16) })
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      if (mode === 'schedule') { await schedulePublication(brand, title, when, profile!.id); toast.success('Publicação agendada no cronograma do cliente') }
      else { const n = await sendToClient(brand, gen, images, { approval: mode === 'approval', title }); toast.success(mode === 'approval' ? `${n} material(is) enviados para aprovação — o cliente foi avisado` : `${n} arquivo(s) salvos na central do cliente`) }
      onClose()
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }
  const T = { files: 'Salvar nos arquivos do cliente', approval: 'Enviar para aprovação do cliente', schedule: 'Agendar publicação' }[mode]
  return (
    <Modal open onClose={onClose} size="sm" title={T} subtitle={brand.name} footer={<><button className="btn-outline" onClick={onClose}>Cancelar</button><button className="btn-brand" onClick={go} disabled={busy || title.trim().length < 2}>{busy && <Spinner className="h-4 w-4 text-white" />}Confirmar</button></>}>
      <div className="space-y-4">
        <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        {mode === 'schedule' && <Field label="Data e hora da publicação"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>}
        {mode !== 'schedule' && <p className="text-xs text-zinc-500">{images.filter((i) => i.status === 'done').length} imagem(ns) {mode === 'approval' ? 'serão enviadas à aprovação, uma por slide, com a legenda como mensagem.' : 'serão salvas na central de arquivos (sem compartilhar com o cliente).'}</p>}
      </div>
    </Modal>
  )
}
