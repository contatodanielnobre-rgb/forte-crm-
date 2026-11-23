import { useMemo, useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Captions, ChevronDown, Clapperboard, Film, Link2, Music, Scissors, Server, Sparkles, Upload, Volume2, X } from 'lucide-react'
import { cn, errMsg } from '@/lib/utils'
import { Skeleton, Spinner } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { MicButton, appendDictated } from '@/features/studio/Dictation'
import { useAssets, useBrands } from '@/features/studio/data'
import JobCard from '@/features/video/JobCard'
import StylesTab from '@/features/video/Styles'
import { createVideoJob, fmtMb, invalidateVideo, useVideoJobs, useVideoStyles, useWorker } from '@/features/video/data'
import type { InputRole, VideoFormat, VideoOptions } from '@/features/video/types'
import { BrandAvatar } from './StudioCreate'

const KEY = 'fcc-studio-brand'
const FORMATS: { id: VideoFormat; label: string; hint: string }[] = [{ id: '9:16', label: '9:16', hint: 'Reels / Stories' }, { id: '4:5', label: '4:5', hint: 'Feed' }, { id: '1:1', label: '1:1', hint: 'Quadrado' }, { id: '16:9', label: '16:9', hint: 'YouTube' }]
const ROLE_LABEL: Record<InputRole, string> = { main: 'Vídeo principal', narration: 'Narração (áudio)', reference: 'Referência', logo: 'Logo' }
const isMedia = (f: File) => /^(video|audio)\//.test(f.type) || /\.(mp4|mov|webm|mkv|avi|m4v|mp3|wav|m4a|aac|ogg|opus)$/i.test(f.name)

interface Item { id: string; file: File; role: InputRole }

function Toggle({ on, onChange, icon: Icon, label, hint, testid }: { on: boolean; onChange: (v: boolean) => void; icon: typeof Scissors; label: string; hint: string; testid: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} data-testid={testid} className={cn('flex items-start gap-2.5 rounded-xl border p-3 text-left transition', on ? 'border-ink bg-ink/[.03]' : 'border-zinc-200 hover:border-zinc-300')}>
      <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', on ? 'bg-ink text-white' : 'bg-zinc-100 text-zinc-500')}><Icon className="h-3.5 w-3.5" /></span>
      <span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-zinc-500">{hint}</span></span>
    </button>
  )
}

export default function StudioVideo() {
  const { profile, isAdmin } = useAuth()
  const qc = useQueryClient()
  const { data: brands } = useBrands()
  const [brandId, setBrandId] = useState<string | null>(null)
  const stored = (() => { try { return localStorage.getItem(KEY) } catch { return null } })()
  const brand = brands?.find((b) => b.id === (brandId ?? stored)) ?? brands?.find((b) => !b.is_base) ?? brands?.find((b) => b.is_base) ?? brands?.[0]
  const { data: styles } = useVideoStyles(brand?.id)
  const { data: jobs, isLoading: jobsLoading } = useVideoJobs(brand?.id)
  const { data: logos } = useAssets(brand?.id, 'logo')
  const { worker, online } = useWorker()

  const [tab, setTab] = useState<'create' | 'styles'>('create')
  const [items, setItems] = useState<Item[]>([])
  const [urls, setUrls] = useState('')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [styleId, setStyleId] = useState<string | null>(null)
  const [format, setFormat] = useState<VideoFormat>('9:16')
  const [engine, setEngine] = useState<'auto' | 'edit' | 'saas' | 'hyperframes'>('auto')
  const [opts, setOpts] = useState<VideoOptions>({ cut_silence: true, captions: true, sfx: true, outro: true, fit: 'auto', language: 'auto' })
  const [maxSec, setMaxSec] = useState('')
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(0)
  const [drag, setDrag] = useState(false)
  const [showStyleRules, setShowStyleRules] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const style = styles?.find((s) => s.id === styleId) ?? null
  const logo = useMemo(() => logos?.find((l) => l.id === brand?.logo_asset_id) ?? logos?.[0] ?? null, [logos, brand])
  const vocab = useMemo(() => (brand ? [brand.name, brand.handle ?? ''].filter(Boolean) : []), [brand])
  const mains = items.filter((i) => i.role === 'main')

  const add = (files: FileList | File[]) => {
    const ok: Item[] = []
    for (const f of Array.from(files)) {
      if (!isMedia(f)) { toast.error(`${f.name}: envie vídeo ou áudio.`); continue }
      ok.push({ id: crypto.randomUUID(), file: f, role: f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|opus)$/i.test(f.name) ? 'narration' : 'main' })
    }
    if (ok.length) setItems((v) => [...v, ...ok])
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files) }
  const move = (id: string, d: -1 | 1) => setItems((v) => { const i = v.findIndex((x) => x.id === id); const j = i + d; if (i < 0 || j < 0 || j >= v.length) return v; const n = [...v]; [n[i], n[j]] = [n[j], n[i]]; return n })

  const setStyle = (id: string | null) => {
    setStyleId(id)
    const s = styles?.find((x) => x.id === id)
    if (s) setOpts((o) => ({ ...o, sfx: s.sfx, captions: s.caption_variant !== 'none' }))
  }

  const submit = async () => {
    if (!brand || !profile) return
    const refUrls = urls.split(/\s+/).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 3)
    if (!text.trim() && !items.length && !style) { toast.error('Escreva o que você quer ou envie um vídeo.'); return }
    setBusy(true); setPct(0)
    try {
      await createVideoJob({
        brand, userId: profile.id, title: title.trim() || (mains[0]?.file.name.replace(/\.[^.]+$/, '') ?? text.trim().slice(0, 40)) || 'Vídeo',
        instruction: text, format, engine, style, options: { ...opts, max_seconds: Number(maxSec) > 0 ? Number(maxSec) : undefined }, files: items.map((i) => ({ file: i.file, role: i.role })), refUrls, logoPath: logo?.storage_path ?? null, onProgress: setPct,
      })
      toast.success('Pedido enviado para a VPS')
      setItems([]); setUrls(''); setText(''); setTitle(''); invalidateVideo(qc)
      requestAnimationFrame(() => document.getElementById('video-jobs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false); setPct(0) }
  }

  if (!brands || !brand) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-5" data-testid="studio-video">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-white"><Clapperboard className="h-5 w-5" /></span>
          <div><h2 className="font-display text-lg font-bold tracking-tight">Editor de vídeo</h2><p className="text-xs text-zinc-500">Suba os vídeos e diga o que quer. A VPS corta, legenda, anima e devolve o MP4 pronto.</p></div>
        </div>
        <div className={cn('flex items-center gap-2 rounded-2xl border bg-white px-3.5 py-2 text-xs shadow-card', online ? 'border-emerald-200' : 'border-amber-200')} data-testid="worker-status" data-online={online}>
          <Server className={cn('h-4 w-4', online ? 'text-emerald-600' : 'text-amber-600')} />
          <span className={cn('h-2 w-2 rounded-full', online ? 'bg-emerald-500' : 'bg-amber-400')} />
          <b>{online ? 'VPS online' : worker ? 'VPS sem sinal' : 'VPS não conectada'}</b>
          {online && worker && <span className="hidden text-zinc-500 sm:inline">· {worker.info.busy ? 'editando' : 'livre'}{worker.info.queued ? ` · ${worker.info.queued} na fila` : ''} · {worker.info.cpus} vCPU</span>}
        </div>
      </div>

      {!online && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">A VPS não está respondendo agora. Você pode enviar o pedido: ele fica na fila e começa sozinho quando a VPS voltar.</p>}

      <nav className="flex gap-1 rounded-2xl border border-zinc-200 bg-white p-1 shadow-card sm:inline-flex">
        {([['create', 'Criar vídeo'], ['styles', 'Estilos (skills)']] as const).map(([id, l]) => <button key={id} type="button" onClick={() => setTab(id)} data-testid={`vtab-${id}`} className={cn('rounded-xl px-4 py-2 text-sm font-medium transition', tab === id ? 'bg-ink text-white' : 'text-zinc-500 hover:bg-zinc-100')}>{l}</button>)}
      </nav>

      <div className="card flex items-center gap-2.5 p-1.5 pr-3">
        <BrandAvatar brand={brand} size={34} />
        <select value={brand.id} onChange={(e) => { setBrandId(e.target.value); try { localStorage.setItem(KEY, e.target.value) } catch { /* noop */ } }} className="h-9 min-w-0 flex-1 bg-transparent text-sm font-semibold focus:outline-none" aria-label="Empresa">
          {brands.map((b) => <option key={b.id} value={b.id}>{b.is_base ? 'Diretrizes gerais da agência' : b.name}</option>)}
        </select>
      </div>

      {tab === 'styles' ? <StylesTab brand={brand} userId={profile!.id} isAdmin={isAdmin} /> : <>
        <div className="card space-y-5 p-5">
          <div>
            <p className="label">1 · Arquivos</p>
            <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
              className={cn('flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition', drag ? 'border-brand bg-brand/5' : 'border-zinc-200 hover:border-zinc-400')} data-testid="video-drop">
              <Upload className="h-6 w-6 text-zinc-400" />
              <p className="text-sm font-semibold">Arraste vídeos ou áudios aqui, ou clique para escolher</p>
              <p className="text-xs text-zinc-500">Vários trechos entram na ordem da lista. Sem arquivo? Descreva abaixo e a IA cria do zero (motion).</p>
              <input ref={inputRef} type="file" multiple accept="video/*,audio/*,.mkv,.mov" className="hidden" data-testid="video-input" onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = '' }} />
            </div>
            {items.length > 0 && (
              <ul className="mt-3 space-y-1.5" data-testid="video-files">
                {items.map((it, i) => (
                  <li key={it.id} className="flex items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">{it.file.type.startsWith('audio/') ? <Music className="h-4 w-4" /> : <Film className="h-4 w-4" />}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{it.file.name}</p><p className="text-[11px] text-zinc-500">{fmtMb(it.file.size)}</p></div>
                    <select value={it.role} onChange={(e) => setItems((v) => v.map((x) => (x.id === it.id ? { ...x, role: e.target.value as InputRole } : x)))} className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs" aria-label="Função do arquivo">
                      {(['main', 'narration', 'reference'] as const).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                    <button type="button" className="btn-ghost btn-sm !px-1.5" onClick={() => move(it.id, -1)} disabled={i === 0} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" className="btn-ghost btn-sm !px-1.5" onClick={() => move(it.id, 1)} disabled={i === items.length - 1} aria-label="Descer"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" className="btn-ghost btn-sm !px-1.5 text-red-600" onClick={() => setItems((v) => v.filter((x) => x.id !== it.id))} aria-label="Remover"><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              <p className="label">Links de referência (opcional)</p>
              <div className="relative"><Link2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" /><textarea className="input pl-9" rows={2} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="Cole links do YouTube, Instagram ou TikTok (um por linha). A VPS baixa e a IA imita o ritmo e a linguagem." data-testid="video-urls" /></div>
            </div>
          </div>

          <div>
            <p className="label">2 · Estilo de edição</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="video-styles">
              <button type="button" onClick={() => setStyle(null)} aria-pressed={!styleId} className={cn('rounded-xl border p-3 text-left transition', !styleId ? 'border-ink bg-ink/[.03]' : 'border-zinc-200 hover:border-zinc-300')}><span className="block text-sm font-semibold">A IA decide</span><span className="block text-xs text-zinc-500">Escolhe pelo seu pedido e pela marca.</span></button>
              {styles?.map((s) => (
                <button key={s.id} type="button" onClick={() => setStyle(s.id)} aria-pressed={styleId === s.id} data-testid="style-option" className={cn('rounded-xl border p-3 text-left transition', styleId === s.id ? 'border-ink bg-ink/[.03]' : 'border-zinc-200 hover:border-zinc-300')}>
                  <span className="block text-sm font-semibold">{s.name}</span><span className="line-clamp-2 block text-xs text-zinc-500">{s.description}</span>
                </button>
              ))}
            </div>
            {style && <><button type="button" onClick={() => setShowStyleRules((v) => !v)} className="mt-2 flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-ink"><ChevronDown className={cn('h-3.5 w-3.5 transition', showStyleRules && 'rotate-180')} />Regras que a IA vai seguir</button>{showStyleRules && <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-700">{style.rules}</pre>}</>}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2"><p className="label !mb-0">3 · O que você quer</p><MicButton onText={(x) => setText((v) => appendDictated(v, x))} vocab={vocab} title="Ditar o pedido com a voz" /></div>
            <textarea className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Ex.: Edite para Reels. Corte as pausas e os erros, legenda dinâmica, destaque o nome da empresa e o preço, efeitos sutis nas viradas e termine com a chamada para o WhatsApp.\n\nSem vídeo? Ex.: Crie um vídeo de 30 s de lançamento do app, tema escuro, com demonstração da tela.'} data-testid="video-text" />
          </div>

          <div>
            <p className="label">4 · Ajustes</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Toggle testid="opt-cut" on={opts.cut_silence !== false} onChange={(v) => setOpts({ ...opts, cut_silence: v })} icon={Scissors} label="Cortar silêncios" hint="Remove pausas e respiros" />
              <Toggle testid="opt-captions" on={opts.captions !== false} onChange={(v) => setOpts({ ...opts, captions: v })} icon={Captions} label="Legendas" hint="Palavra por palavra" />
              <Toggle testid="opt-sfx" on={opts.sfx !== false} onChange={(v) => setOpts({ ...opts, sfx: v })} icon={Volume2} label="Efeitos sonoros" hint="Whoosh, pop, impacto" />
              <Toggle testid="opt-outro" on={opts.outro !== false} onChange={(v) => setOpts({ ...opts, outro: v })} icon={Sparkles} label="Cartão final" hint="Logo/CTA no fim" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {FORMATS.map((f) => <button key={f.id} type="button" onClick={() => setFormat(f.id)} aria-pressed={format === f.id} data-testid={`fmt-${f.id}`} className={cn('rounded-xl border px-3 py-1.5 text-sm font-semibold transition', format === f.id ? 'border-ink bg-ink text-white' : 'border-zinc-200 hover:border-zinc-400')}>{f.label}<span className={cn('ml-1.5 text-[11px] font-normal', format === f.id ? 'text-white/70' : 'text-zinc-400')}>{f.hint}</span></button>)}
            </div>
            <details className="mt-3 rounded-xl border border-zinc-200 px-3 py-2 text-sm">
              <summary className="cursor-pointer select-none text-xs font-semibold text-zinc-600">Avançado</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <div><p className="label">Motor</p><select className="input" value={engine} onChange={(e) => setEngine(e.target.value as typeof engine)} data-testid="opt-engine"><option value="auto">Automático</option><option value="edit">Remotion (edição)</option><option value="saas">saas-video (produto)</option><option value="hyperframes">HyperFrames (HTML)</option></select></div>
                <div><p className="label">Enquadramento</p><select className="input" value={opts.fit} onChange={(e) => setOpts({ ...opts, fit: e.target.value as VideoOptions['fit'] })}><option value="auto">Automático</option><option value="cover">Preencher (corta as laterais)</option><option value="contain">Inteiro com fundo desfocado</option></select></div>
                <div><p className="label">Idioma da fala</p><select className="input" value={opts.language} onChange={(e) => setOpts({ ...opts, language: e.target.value })}><option value="auto">Detectar</option><option value="pt">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option></select></div>
                <div><p className="label">Duração máxima (s)</p><input className="input" inputMode="numeric" value={maxSec} onChange={(e) => setMaxSec(e.target.value.replace(/\D/g, ''))} placeholder="sem limite" /></div>
              </div>
            </details>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
            <input className="input max-w-xs" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome do vídeo (opcional)" aria-label="Nome do vídeo" />
            <button type="button" className="btn-brand ml-auto" disabled={busy} onClick={submit} data-testid="video-submit">{busy ? <><Spinner />{pct > 0 && pct < 100 ? `Enviando ${pct}%` : 'Enviando…'}</> : <><Clapperboard className="h-4 w-4" />Editar com a IA</>}</button>
          </div>
          {busy && pct > 0 && <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} /></div>}
        </div>

        <section id="video-jobs" className="scroll-mt-24 space-y-3">
          <h3 className="font-display text-lg font-bold">Seus vídeos</h3>
          {jobsLoading ? <Skeleton className="h-40 w-full" /> : !jobs?.filter((j) => j.kind === 'edit').length ? <p className="card p-6 text-center text-sm text-zinc-500">Nenhum vídeo ainda. Envie o primeiro acima.</p> : (
            <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="video-jobs">
              {jobs.filter((j) => j.kind === 'edit').map((j) => <JobCard key={j.id} job={j} brand={brand} userId={profile!.id} logoPath={logo?.storage_path ?? null} />)}
            </div>
          )}
        </section>
      </>}
    </div>
  )
}
