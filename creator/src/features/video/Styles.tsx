import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { BookOpen, Link2, Lock, Plus, Save, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { cn, errMsg } from '@/lib/utils'
import { Spinner } from '@/components/ui'
import { MicButton, appendDictated } from '@/features/studio/Dictation'
import type { Brand } from '@/features/studio/types'
import { createVideoJob, deleteVideoStyle, invalidateVideo, saveVideoStyle, useVideoJob, useVideoStyles, useWorker } from './data'
import type { CaptionVariant, VideoEngine, VideoStyle } from './types'

const ENGINES: { id: VideoEngine; label: string }[] = [{ id: 'edit', label: 'Remotion — editar vídeo enviado' }, { id: 'saas', label: 'saas-video — produto/SaaS' }, { id: 'hyperframes', label: 'HyperFrames — motion em HTML' }]
const VARIANTS: { id: CaptionVariant; label: string }[] = [{ id: 'karaoke', label: 'Karaokê (palavra acende)' }, { id: 'stacked', label: 'Empilhada (linha + destaque)' }, { id: 'boxed', label: 'Em tarja colorida' }, { id: 'single', label: 'Uma palavra por vez' }, { id: 'none', label: 'Sem legenda' }]

type Draft = { id?: string; name: string; description: string; engine: VideoEngine; caption_variant: CaptionVariant; sfx: boolean; rules: string }
const blank: Draft = { name: '', description: '', engine: 'edit', caption_variant: 'karaoke', sfx: true, rules: '' }

function StyleEditor({ draft, onChange, onSave, onCancel, saving }: { draft: Draft; onChange: (d: Draft) => void; onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <div className="space-y-3 rounded-2xl border border-ink/20 bg-white p-4" data-testid="style-editor">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><p className="label">Nome do estilo</p><input className="input" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="Ex.: Reels de imobiliária" data-testid="style-name" /></div>
        <div><p className="label">Descrição curta</p><input className="input" value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value })} placeholder="Ex.: cortes rápidos, legenda grande e CTA no final" /></div>
        <div><p className="label">Motor</p><select className="input" value={draft.engine} onChange={(e) => onChange({ ...draft, engine: e.target.value as VideoEngine })}>{ENGINES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
        <div><p className="label">Legenda padrão</p><select className="input" value={draft.caption_variant} onChange={(e) => onChange({ ...draft, caption_variant: e.target.value as CaptionVariant })}>{VARIANTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.sfx} onChange={(e) => onChange({ ...draft, sfx: e.target.checked })} />Usar efeitos sonoros neste estilo</label>
      <div>
        <div className="mb-1.5 flex items-center justify-between"><p className="label !mb-0">Regras (a “skill” que a IA segue)</p><MicButton onText={(x) => onChange({ ...draft, rules: appendDictated(draft.rules, x) })} title="Ditar as regras" /></div>
        <textarea className="input" rows={9} value={draft.rules} onChange={(e) => onChange({ ...draft, rules: e.target.value })} placeholder={'Uma regra por linha. Ex.:\nCorte todo silêncio maior que 0,4 s.\nLegenda de 3 palavras no terço inferior, palavra falada em amarelo.\nZoom de 12% nas palavras de impacto.\nTermine com a logo e a chamada para ação.'} data-testid="style-rules" />
      </div>
      <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" disabled={saving || draft.name.trim().length < 2 || draft.rules.trim().length < 10} onClick={onSave} data-testid="style-save">{saving ? <Spinner /> : <Save className="h-3.5 w-3.5" />}Salvar estilo</button><button type="button" className="btn-ghost btn-sm" onClick={onCancel}>Cancelar</button></div>
    </div>
  )
}

/** "Aprender com uma referência": a VPS mede o vídeo (cortes, ritmo, quadros) e a IA escreve as regras do estilo */
function Learn({ brand, userId, onUse }: { brand: Brand; userId: string; onUse: (d: Draft) => void }) {
  const qc = useQueryClient()
  const { online } = useWorker()
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const { data: job } = useVideoJob(jobId)

  const start = async () => {
    setBusy(true)
    try {
      const j = await createVideoJob({ brand, userId, title: 'Aprender estilo', kind: 'analyze', instruction: note, format: '9:16', engine: 'auto', options: {}, files: file ? [{ file, role: 'reference' }] : [], refUrls: url.trim() ? [url.trim()] : [] })
      setJobId(j.id); invalidateVideo(qc)
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }
  const a = job?.status === 'done' ? job.analysis : null
  const working = job && (job.status === 'queued' || job.status === 'running')

  return (
    <div className="card space-y-3 p-5" data-testid="learn-card">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-white"><Sparkles className="h-5 w-5" /></span><div><h3 className="font-display text-base font-bold">Aprender estilo de uma referência</h3><p className="text-xs text-zinc-500">Envie um vídeo que você gosta (ou um link). A VPS mede o ritmo e a IA escreve as regras para imitar a linguagem, sem copiar marca nem pessoas.</p></div></div>
      {!jobId && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="label">Vídeo de referência</p>
            <input ref={ref} type="file" accept="video/*" className="hidden" data-testid="learn-file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button type="button" className="btn-outline w-full justify-start" onClick={() => ref.current?.click()}><Upload className="h-4 w-4" />{file ? file.name : 'Escolher arquivo…'}</button>
          </div>
          <div><p className="label">…ou um link</p><div className="relative"><Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><input className="input pl-9" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/…" data-testid="learn-url" /></div></div>
        </div>
        <div><p className="label">O que chamou sua atenção? (opcional)</p><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: o ritmo dos cortes e a legenda amarela" /></div>
        <button type="button" className="btn-brand" disabled={busy || (!file && !url.trim())} onClick={start} data-testid="learn-start">{busy ? <Spinner /> : <Sparkles className="h-4 w-4" />}Analisar referência</button>
        {!online && <p className="text-xs text-amber-700">A VPS está offline agora; o pedido espera na fila até ela voltar.</p>}
      </>}
      {working && <div className="space-y-2"><div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.max(4, job!.progress)}%` }} /></div><p className="text-xs text-zinc-500">{job!.stage ?? 'Na fila'} · {job!.progress}%</p></div>}
      {job?.status === 'error' && <div className="space-y-2"><p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">{job.error}</p><button type="button" className="btn-outline btn-sm" onClick={() => setJobId(null)}>Tentar com outra referência</button></div>}
      {a && (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3" data-testid="learn-result">
          <p className="text-sm font-semibold">{a.style.name}</p>
          <p className="text-xs text-zinc-600">{a.style.description}</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-relaxed text-zinc-700">{a.style.rules}</pre>
          <p className="text-[11px] text-zinc-500">Medido: {String(a.stats.duration_sec ?? '?')} s · {String(a.stats.cuts_per_minute ?? '?')} cortes/min · {String(a.stats.words_per_minute ?? 0)} palavras/min</p>
          <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" onClick={() => { onUse({ name: a.style.name, description: a.style.description, engine: a.style.engine, caption_variant: a.style.caption_variant, sfx: a.style.sfx, rules: a.style.rules }); setJobId(null) }} data-testid="learn-use"><Save className="h-3.5 w-3.5" />Revisar e salvar como estilo</button><button type="button" className="btn-ghost btn-sm" onClick={() => setJobId(null)}>Descartar</button></div>
        </div>
      )}
    </div>
  )
}

export default function StylesTab({ brand, userId, isAdmin }: { brand: Brand; userId: string; isAdmin: boolean }) {
  const qc = useQueryClient()
  const { data: styles, isLoading } = useVideoStyles(brand.id)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [scope, setScope] = useState<'brand' | 'all'>('brand')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try { await saveVideoStyle(draft, scope === 'all' && isAdmin ? null : brand.id, userId); toast.success('Estilo salvo'); setDraft(null); invalidateVideo(qc) } catch (e) { toast.error(errMsg(e)) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <Learn brand={brand} userId={userId} onUse={(d) => { setDraft(d); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />

      <div className="flex items-center justify-between gap-3"><div><h3 className="font-display text-lg font-bold">Estilos de edição</h3><p className="text-xs text-zinc-500">Cada estilo é uma “skill”: a IA segue estas regras ao editar. Os da agência vêm prontos; crie os seus para cada cliente.</p></div><button type="button" className="btn-primary btn-sm" onClick={() => setDraft({ ...blank })} data-testid="style-new"><Plus className="h-3.5 w-3.5" />Novo estilo</button></div>

      {draft && (
        <div className="space-y-2">
          {isAdmin && <div className="flex gap-2 text-xs"><button type="button" onClick={() => setScope('brand')} className={cn('rounded-lg border px-2.5 py-1 font-semibold', scope === 'brand' ? 'border-ink bg-ink text-white' : 'border-zinc-200')}>Só para {brand.name}</button><button type="button" onClick={() => setScope('all')} className={cn('rounded-lg border px-2.5 py-1 font-semibold', scope === 'all' ? 'border-ink bg-ink text-white' : 'border-zinc-200')}>Para todas as empresas</button></div>}
          <StyleEditor draft={draft} onChange={setDraft} onSave={save} onCancel={() => setDraft(null)} saving={saving} />
        </div>
      )}

      {isLoading ? <div className="card p-6"><Spinner /></div> : (
        <div className="grid gap-3 md:grid-cols-2" data-testid="style-list">
          {styles?.map((s: VideoStyle) => (
            <div key={s.id} className="card p-4" data-testid="style-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="flex items-center gap-1.5 font-semibold">{s.builtin && <Lock className="h-3.5 w-3.5 text-zinc-400" />}{s.name}</p><p className="mt-0.5 text-xs text-zinc-500">{s.description}</p></div>
                <div className="flex shrink-0 gap-1">
                  {!s.builtin && <><button type="button" className="btn-ghost btn-sm" onClick={() => setDraft({ id: s.id, name: s.name, description: s.description ?? '', engine: s.engine, caption_variant: s.caption_variant, sfx: s.sfx, rules: s.rules })}>Editar</button><button type="button" className="btn-ghost btn-sm text-red-600" aria-label="Excluir estilo" onClick={async () => { if (confirm(`Excluir o estilo "${s.name}"?`)) { try { await deleteVideoStyle(s.id); invalidateVideo(qc) } catch (e) { toast.error(errMsg(e)) } } }}><Trash2 className="h-3.5 w-3.5" /></button></>}
                  {s.builtin && <button type="button" className="btn-ghost btn-sm" onClick={() => setDraft({ name: `${s.name} (cópia)`, description: s.description ?? '', engine: s.engine, caption_variant: s.caption_variant, sfx: s.sfx, rules: s.rules })}>Copiar e editar</button>}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5"><span className="chip bg-zinc-100 text-zinc-600">{ENGINES.find((e) => e.id === s.engine)?.label.split(' — ')[0]}</span><span className="chip bg-zinc-100 text-zinc-600">legenda {VARIANTS.find((v) => v.id === s.caption_variant)?.label.split(' (')[0].toLowerCase()}</span>{s.sfx && <span className="chip bg-zinc-100 text-zinc-600">efeitos sonoros</span>}{!s.builtin && <span className="chip bg-blue-50 text-blue-700">{s.brand_id ? brand.name : 'todas as empresas'}</span>}</div>
              <button type="button" className="mt-2 flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-ink" onClick={() => setOpen(open === s.id ? null : s.id)}><BookOpen className="h-3.5 w-3.5" />{open === s.id ? 'Ocultar regras' : 'Ver regras'}</button>
              {open === s.id && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-700">{s.rules}</pre>}
            </div>
          ))}
        </div>
      )}
      {draft && <button type="button" className="hidden" onClick={() => setDraft(null)}><X /></button>}
    </div>
  )
}
