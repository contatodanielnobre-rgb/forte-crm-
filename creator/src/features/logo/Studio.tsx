import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Check, ChevronDown, Download, Lightbulb, Plus, RefreshCcw, Sparkles, Star, Trash2, Upload, Wand2, X } from 'lucide-react'
import { cn, errMsg } from '@/lib/utils'
import { ConfirmDialog, Skeleton, Spinner } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { COST_ASSUMPTIONS, fmtBrl, getRate, imageCost } from '@/features/studio/catalog'
import { MicButton, appendDictated } from '@/features/studio/Dictation'
import { useModels, useStudioSettings } from '@/features/studio/data'
import { StudioImg } from '@/features/studio/ui'
import type { Brand } from '@/features/studio/types'
import { APPROACHES, INPUT_ROLES, LOGO_KINDS, MOOD_CHIPS, QUALITIES } from './catalog'
import { approveVersion, createLogoProject, deleteLogoProject, deleteVersion, generateLogos, refineLogo, retryVersion, toggleFavoriteVersion, unapprove, useLogoBrandings, useLogoProjects, useLogoVersions, invalidateLogo, type NewInput } from './data'
import { Swatch } from './Canvas'
import Workbench from './Workbench'
import Branding from './Branding'
import type { InputRole, LogoForm, LogoProject, LogoVersion } from './types'
import { downloadBlob, slug } from './util'
import { useStudioUrl } from '@/features/studio/data'

const emptyForm = (brand: Brand): LogoForm => ({ company: '', segment: brand.segment ?? '', offer: '', audience: '', city: '', approach: ['ideia'], kind: 'auto', colors: [], mood: [], slogan: '', avoid: '', notes: '', count: 4 })
const hexOk = (s: string) => /^#[0-9a-f]{6}$/i.test(s)

function Toggle({ on, onClick, children, hint, testid }: { on: boolean; onClick: () => void; children: React.ReactNode; hint?: string; testid?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-testid={testid} title={hint} className={cn('rounded-xl border px-3 py-2 text-left text-sm font-medium transition', on ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400')}>
      {children}{hint && <span className={cn('mt-0.5 block text-[11px] font-normal', on ? 'text-white/70' : 'text-zinc-500')}>{hint}</span>}
    </button>
  )
}

// ---------------------------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------------------------
interface FileItem { id: string; file: File; role: InputRole; note: string; url: string }

function NewLogoForm({ brand, initial, onCreated, trained }: { brand: Brand; initial?: LogoForm | null; onCreated: (p: LogoProject, count: number) => void; trained: boolean }) {
  const { profile } = useAuth()
  const { data: models } = useModels()
  const { data: settings } = useStudioSettings()
  const [form, setForm] = useState<LogoForm>(initial ?? emptyForm(brand))
  const [files, setFiles] = useState<FileItem[]>([])
  const [modelId, setModelId] = useState('')
  const [quality, setQuality] = useState('medium')
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [draftColor, setDraftColor] = useState('#0F3D5E')
  const input = useRef<HTMLInputElement>(null)
  const set = (p: Partial<LogoForm>) => setForm((f) => ({ ...f, ...p }))
  const toggle = (k: 'approach' | 'mood', v: string, max: number) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v].slice(-max) }))

  useEffect(() => { setForm(initial ?? emptyForm(brand)) }, [initial, brand.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const imgModels = (models ?? []).filter((m) => m.enabled && m.capabilities?.refs)
  useEffect(() => { if (!modelId) setModelId(imgModels.find((m) => m.id === settings?.default_model)?.id ?? imgModels[0]?.id ?? '') }, [imgModels, settings, modelId])
  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (settings?.default_quality && ['low', 'medium', 'high'].includes(settings.default_quality)) setQuality((q) => q) }, [settings])

  const addFiles = (list: File[]) => {
    const ok = list.filter((f) => f.type.startsWith('image/')); if (!ok.length) return toast.error('Envie imagens (JPG, PNG, WEBP).')
    setFiles((cur) => [...cur, ...ok.map((file) => ({ id: crypto.randomUUID(), file, role: 'competitor' as InputRole, note: '', url: URL.createObjectURL(file) }))].slice(0, 4))
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); addFiles(Array.from(e.dataTransfer.files)) }

  const model = imgModels.find((m) => m.id === modelId)
  const unit = model ? imageCost(model.api_model, quality, COST_ASSUMPTIONS, true) : null
  const count = form.count ?? 4
  const valid = form.company.trim().length >= 2 && (form.segment.trim().length > 1 || form.offer.trim().length > 3)

  const submit = async () => {
    if (!profile) return
    if (!valid) return toast.error('Preencha o nome da empresa e o segmento (ou o que ela vende).')
    if (!model) return toast.error('Ative um modelo de imagem em Modelos e APIs.')
    setBusy(true)
    try {
      const p = await createLogoProject({ brand, userId: profile.id, form: { ...form, company: form.company.trim(), slogan: form.slogan?.trim() }, inputs: files.map((f): NewInput => ({ file: f.file, role: f.role, note: f.note.trim() || undefined })), modelId, quality })
      onCreated(p, count)
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }
  const brandColors = (brand.colors ?? []).map((c) => c.hex).filter((c) => hexOk(c) && !form.colors.includes(c.toUpperCase()))

  return (
    <div className="card space-y-6 p-5 sm:p-6" data-testid="logo-form">
      {!trained && <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>O criador ainda não foi treinado com as suas logos de referência. Funciona assim mesmo (com a skill embutida), mas treinar deixa o resultado bem mais fiel ao nível que você quer. <b>Abra a aba Treinamento.</b></span></p>}

      <div>
        <p className="label">1 · Sobre a empresa</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Nome da empresa (como deve ser escrito na logo)</span><input className="input" value={form.company} onChange={(e) => set({ company: e.target.value })} placeholder="Ex.: Café da Vila" data-testid="logo-company" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Segmento</span><input className="input" value={form.segment} onChange={(e) => set({ segment: e.target.value })} placeholder="Ex.: cafeteria artesanal, loja de carros, clínica odontológica" data-testid="logo-segment" /></label>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold text-zinc-600">O que a empresa vende ou faz, e o que a torna diferente</span><MicButton onText={(x) => set({ offer: appendDictated(form.offer, x) })} vocab={[form.company]} title="Ditar com a voz" /></div>
          <textarea className="input" rows={3} value={form.offer} onChange={(e) => set({ offer: e.target.value })} placeholder="Ex.: Vende cafés especiais torrados na própria loja, pães de fermentação natural e grãos para levar. O diferencial é o torrador à vista dos clientes." data-testid="logo-offer" />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Público (opcional)</span><input className="input" value={form.audience} onChange={(e) => set({ audience: e.target.value })} placeholder="Ex.: jovens adultos da região central" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Cidade / mercado (opcional)</span><input className="input" value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder="Ex.: Curitiba" /></label>
        </div>
      </div>

      <div>
        <p className="label">2 · Que tipo de logo você quer?</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="logo-approaches">{APPROACHES.map((a) => <Toggle key={a.id} on={form.approach.includes(a.id)} onClick={() => toggle('approach', a.id, 3)} hint={a.hint} testid={`approach-${a.id}`}>{a.label}</Toggle>)}</div>
        <p className="mb-1.5 mt-4 text-xs font-semibold text-zinc-600">Formato</p>
        <div className="flex flex-wrap gap-2">{LOGO_KINDS.map((k) => <button key={k.id} type="button" onClick={() => set({ kind: k.id })} aria-pressed={form.kind === k.id} title={k.hint} data-testid={`kind-${k.id}`} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition', form.kind === k.id ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400')}>{k.label}</button>)}</div>
      </div>

      <div>
        <p className="label">3 · Cores e sensação</p>
        <div className="flex flex-wrap items-center gap-2">
          {form.colors.map((c) => <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white py-1 pl-1.5 pr-2 text-xs font-medium"><Swatch color={c} size={16} />{c}<button type="button" aria-label={`Remover ${c}`} onClick={() => set({ colors: form.colors.filter((x) => x !== c) })} className="text-zinc-400 hover:text-ink"><X className="h-3 w-3" /></button></span>)}
          {form.colors.length < 4 && (
            <span className="inline-flex items-center gap-1.5">
              <label className="relative inline-flex h-8 w-8 cursor-pointer overflow-hidden rounded-lg ring-1 ring-black/10" style={{ background: draftColor }} title="Escolher cor"><input type="color" value={draftColor.toLowerCase()} onChange={(e) => setDraftColor(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Escolher cor" /></label>
              <button type="button" className="btn-outline btn-sm" onClick={() => !form.colors.includes(draftColor) && set({ colors: [...form.colors, draftColor] })} data-testid="logo-add-color"><Plus className="h-3.5 w-3.5" />Adicionar cor</button>
            </span>
          )}
          {!form.colors.length && <span className="text-xs text-zinc-500">Sem cores: a IA escolhe pela personalidade e pelo segmento.</span>}
        </div>
        {brandColors.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">Cores cadastradas da empresa: {brandColors.map((c) => <button key={c} type="button" onClick={() => set({ colors: [...form.colors, c.toUpperCase()].slice(0, 4) })} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-1 hover:border-ink"><Swatch color={c} size={12} />{c}</button>)}</div>}
        <div className="mt-3 flex flex-wrap gap-1.5">{MOOD_CHIPS.map((m) => <button key={m} type="button" onClick={() => toggle('mood', m, 5)} aria-pressed={form.mood.includes(m)} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition', form.mood.includes(m) ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400')}>{form.mood.includes(m) && <Check className="mr-1 inline h-3 w-3" />}{m}</button>)}</div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Slogan (opcional, será escrito exatamente assim)</span><input className="input" value={form.slogan} onChange={(e) => set({ slogan: e.target.value })} placeholder="Ex.: Torrado à vista" data-testid="logo-slogan" /></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">O que evitar</span><input className="input" value={form.avoid} onChange={(e) => set({ avoid: e.target.value })} placeholder="Ex.: xícara de café, tons de roxo, letras cursivas" /></label>
        <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-zinc-600">Mais alguma observação</span><textarea className="input" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Ex.: o dono gosta de coisas retrô, mas sem parecer antiga." /></label>
      </div>

      <div>
        <p className="label">4 · Imagens de apoio <span className="font-normal normal-case text-zinc-400">(opcional, até 4)</span></p>
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()} data-testid="logo-input-drop"
          className={cn('flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition', drag ? 'border-brand bg-brand/5' : 'border-zinc-200 hover:border-zinc-400')}>
          <Upload className="h-5 w-5 text-zinc-400" /><p className="text-sm font-semibold">Suba uma logo de concorrente, uma tentativa que não ficou boa ou uma inspiração</p>
          <p className="text-xs text-zinc-500">A IA de imagem recebe essas fotos e entende o que fazer com cada uma.</p>
          <input ref={input} type="file" accept="image/*" multiple hidden data-testid="logo-input-files" onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = '' }} />
        </div>
        {files.length > 0 && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="logo-input-list">
            {files.map((f) => (
              <li key={f.id} className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-2.5">
                <img src={f.url} alt="" className="h-20 w-20 shrink-0 rounded-xl bg-zinc-50 object-contain" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <select className="input h-8 text-xs" value={f.role} aria-label="O que é esta imagem" onChange={(e) => setFiles((c) => c.map((x) => (x.id === f.id ? { ...x, role: e.target.value as InputRole } : x)))}>{INPUT_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label} — {r.hint}</option>)}</select>
                  <input className="input h-8 text-xs" value={f.note} onChange={(e) => setFiles((c) => c.map((x) => (x.id === f.id ? { ...x, note: e.target.value } : x)))} placeholder={f.role === 'attempt' ? 'O que não ficou bom? (opcional)' : 'Observação (opcional)'} />
                </div>
                <button type="button" aria-label="Remover imagem" className="self-start text-zinc-400 hover:text-red-600" onClick={() => { URL.revokeObjectURL(f.url); setFiles((c) => c.filter((x) => x.id !== f.id)) }}><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl bg-zinc-50 p-4">
        <p className="label">5 · Geração</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Quantos conceitos</span><select className="input h-9" value={count} onChange={(e) => set({ count: Number(e.target.value) })} data-testid="logo-count">{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Modelo de imagem</span><select className="input h-9" value={modelId} onChange={(e) => setModelId(e.target.value)} data-testid="logo-model">{imgModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}{!imgModels.length && <option value="">Nenhum modelo ativo</option>}</select></label>
          <div><span className="mb-1 block text-xs font-semibold text-zinc-600">Qualidade</span><div className="flex gap-1">{QUALITIES.map((q) => <button key={q.id} type="button" title={q.hint} onClick={() => setQuality(q.id)} aria-pressed={quality === q.id} data-testid={`q-${q.id}`} className={cn('flex-1 rounded-lg border px-2 py-2 text-xs font-semibold transition', quality === q.id ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white hover:border-zinc-400')}>{q.label}</button>)}</div></div>
        </div>
        <p className="mt-2 text-xs text-zinc-500">{unit ? <>Custo estimado: <b className="text-ink">≈ {fmtBrl(unit.total * count, getRate())}</b> para {count} logos (cada uma ≈ {fmtBrl(unit.total, getRate())}) + centavos de texto. Cores e layouts depois são grátis: não usam IA.</> : 'Modelo sem tabela de preço conhecida.'}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-brand h-11 px-6" onClick={submit} disabled={busy} data-testid="logo-submit">{busy ? <><Spinner className="h-4 w-4 text-white" />Enviando…</> : <><Sparkles className="h-4 w-4" />Criar {count} conceitos de logo</>}</button>
        {!valid && <span className="text-xs text-zinc-500">Falta o nome e o segmento (ou o que vende).</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------------------------
function VersionCard({ v, project, approved, onApprove, onRefine, onRetry, qc }: { v: LogoVersion; project: LogoProject; approved: boolean; onApprove: () => void; onRefine: (feedback: string) => Promise<void>; onRetry: () => void; qc: ReturnType<typeof useQueryClient> }) {
  const [refine, setRefine] = useState(false)
  const [fb, setFb] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState(false)
  const [del, setDel] = useState(false)
  const url = useStudioUrl(v.storage_path)
  const working = v.status === 'queued' || v.status === 'running'
  const download = async () => { if (!url) return; try { downloadBlob(await (await fetch(url)).blob(), `${slug(project.name)}-${v.number}.${url.includes('.svg') ? 'svg' : 'png'}`) } catch (e) { toast.error(errMsg(e)) } }
  const send = async () => { if (fb.trim().length < 3) return toast.error('Diga o que mudar.'); setBusy(true); try { await onRefine(fb.trim()); setFb(''); setRefine(false) } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) } }
  return (
    <article className={cn('overflow-hidden rounded-2xl border bg-white shadow-card transition', approved ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-zinc-200')} data-testid="logo-card" data-status={v.status} data-approved={approved}>
      <div className="relative">
        {v.storage_path && v.status === 'done' ? <StudioImg path={v.storage_path} fit="contain" className="aspect-square bg-white" />
          : <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-zinc-50 p-4 text-center text-sm text-zinc-500">{working ? <><Spinner className="h-5 w-5" />{v.status === 'queued' ? 'Na fila…' : 'Desenhando a logo…'}</> : <><AlertTriangle className="h-5 w-5 text-brand" /><span className="line-clamp-4 text-xs text-brand">{v.error ?? 'Não foi possível gerar.'}</span><button type="button" className="btn-outline btn-sm" onClick={onRetry}><RefreshCcw className="h-3.5 w-3.5" />Tentar de novo</button></>}</div>}
        {approved && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white shadow"><Check className="h-3 w-3" />Aprovada</span>}
        <button type="button" aria-label="Favoritar" onClick={() => toggleFavoriteVersion(v).then(() => invalidateLogo(qc, 'versions', project.id))} className={cn('absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur transition', v.favorite ? 'bg-amber-400 text-white' : 'bg-black/25 text-white opacity-0 hover:opacity-100 [article:hover_&]:opacity-100')}><Star className={cn('h-3.5 w-3.5', v.favorite && 'fill-current')} /></button>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{v.concept?.name ?? `Versão ${v.number}`}</p><p className="text-[11px] text-zinc-500">{v.parent_id ? 'Ajuste' : v.concept?.territory || `Conceito ${v.number}`}</p></div>
          {v.concept?.colors?.length ? <span className="flex shrink-0 gap-0.5">{v.concept.colors.slice(0, 3).map((c) => <Swatch key={c} color={c} size={12} />)}</span> : null}</div>
        {v.feedback && <p className="rounded-lg bg-zinc-50 px-2 py-1 text-[11px] text-zinc-600">Pedido: {v.feedback}</p>}
        {v.concept?.big_idea && <button type="button" onClick={() => setInfo((x) => !x)} className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-ink"><Lightbulb className="h-3 w-3" />A ideia<ChevronDown className={cn('h-3 w-3 transition', info && 'rotate-180')} /></button>}
        {info && <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900" data-testid="logo-idea">{v.concept.big_idea}</p>}
        {v.status === 'done' && (
          <div className="flex flex-wrap gap-1.5">
            {approved ? <span className="text-xs font-semibold text-emerald-700">Versão escolhida ✓</span> : <button type="button" className="btn-primary btn-sm" onClick={onApprove} data-testid="logo-approve"><Check className="h-3.5 w-3.5" />Aprovar</button>}
            <button type="button" className="btn-outline btn-sm" onClick={() => setRefine((x) => !x)} data-testid="logo-refine"><Wand2 className="h-3.5 w-3.5" />Ajustar</button>
            <button type="button" className="btn-outline btn-sm !px-2" aria-label="Baixar" onClick={download}><Download className="h-3.5 w-3.5" /></button>
            <button type="button" className="btn-ghost btn-sm !px-2 text-red-600" aria-label="Excluir" onClick={() => setDel(true)}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {refine && (
          <div className="space-y-1.5" data-testid="logo-refine-box">
            <textarea className="input text-xs" rows={2} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="O que mudar? Ex.: deixe o símbolo mais simples; use um azul mais escuro; tire o slogan." data-testid="logo-refine-text" />
            <button type="button" className="btn-brand btn-sm" disabled={busy} onClick={send} data-testid="logo-refine-send">{busy ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Sparkles className="h-3.5 w-3.5" />}Gerar ajuste</button>
          </div>
        )}
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} danger title="Excluir esta versão" message="A imagem será apagada." confirmLabel="Excluir" onConfirm={async () => { await deleteVersion(v); setDel(false); invalidateLogo(qc, 'versions', project.id) }} />
    </article>
  )
}

function ProjectView({ project, brand, onReuse, onDeleted }: { project: LogoProject; brand: Brand; onReuse: (f: LogoForm) => void; onDeleted: () => void }) {
  const qc = useQueryClient()
  const { data: versions, isLoading } = useLogoVersions(project.id)
  const { data: brandings } = useLogoBrandings(project.id)
  const [more, setMore] = useState(false)
  const [del, setDel] = useState(false)
  const [showBranding, setShowBranding] = useState(false)
  const approved = versions?.find((v) => v.id === project.approved_version_id) ?? null
  const working = versions?.some((v) => v.status === 'queued' || v.status === 'running') || project.status === 'generating' && !versions?.length
  const brandingRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setShowBranding(false) }, [project.id])
  const generateMore = async () => {
    setMore(true)
    try { await generateLogos(project, 2, qc, { used: (versions ?? []).filter((v) => !v.parent_id).map((v) => v.concept?.name).filter(Boolean) }) } catch (e) { toast.error(errMsg(e)) } finally { setMore(false) }
  }
  const approve = async (v: LogoVersion) => { try { await approveVersion(project, v, qc); toast.success('Logo aprovada! O painel de edição abriu logo abaixo.') } catch (e) { toast.error(errMsg(e)) } }

  return (
    <div className="space-y-5" data-testid="logo-project" data-project-status={project.status}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight">{project.name}</h3>
          <p className="text-xs text-zinc-500">{project.form.segment}{project.form.approach?.length ? ` · ${project.form.approach.map((a) => APPROACHES.find((x) => x.id === a)?.label ?? a).join(' + ')}` : ''}</p>
          {project.positioning && <p className="mt-1 max-w-2xl text-xs text-zinc-600"><b>Posicionamento:</b> {project.positioning}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline btn-sm" onClick={generateMore} disabled={more || !!working} data-testid="logo-more">{more ? <Spinner className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}Mais 2 conceitos</button>
          <button type="button" className="btn-outline btn-sm" onClick={() => onReuse(project.form)} data-testid="logo-reuse">Usar este briefing</button>
          <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setDel(true)} aria-label="Excluir projeto"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-square" />)}</div>
        : !versions?.length ? <div className="card flex items-center justify-center gap-2 p-10 text-sm text-zinc-500"><Spinner className="h-4 w-4" />A skill de designer está pensando os conceitos…</div>
          : (
            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="logo-grid">
              {versions.map((v) => <VersionCard key={v.id} v={v} project={project} qc={qc} approved={v.id === project.approved_version_id} onApprove={() => approve(v)} onRefine={(fb) => refineLogo(project, v, fb, qc)} onRetry={() => retryVersion(project, v, qc)} />)}
            </div>
          )}

      {approved && approved.status === 'done' && (
        <>
          <Workbench key={approved.id} project={project} version={approved} brand={brand} onBranding={() => { setShowBranding(true); setTimeout(() => brandingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80) }} />
          <div ref={brandingRef} className="scroll-mt-24">
            {showBranding ? <Branding project={project} version={approved} brand={brand} brandings={brandings ?? []} onClose={() => setShowBranding(false)} />
              : !!brandings?.length && <button type="button" className="btn-outline" onClick={() => setShowBranding(true)}><Sparkles className="h-4 w-4" />Abrir o material de branding ({brandings.length} cenas)</button>}
          </div>
          <button type="button" className="text-xs text-zinc-500 underline" onClick={() => unapprove(project, qc)}>Desfazer a aprovação</button>
        </>
      )}
      <ConfirmDialog open={del} onClose={() => setDel(false)} danger title="Excluir este projeto de logo" message="Todas as versões e cenas de branding deste projeto serão apagadas." confirmLabel="Excluir" onConfirm={async () => { await deleteLogoProject(project, versions ?? [], brandings ?? []); setDel(false); invalidateLogo(qc, 'projects'); onDeleted() }} />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
export default function Studio({ brand, trained }: { brand: Brand; trained: boolean }) {
  const qc = useQueryClient()
  const { data: projects, isLoading } = useLogoProjects(brand.id)
  const [sel, setSel] = useState<string | 'new'>('new')
  const [seed, setSeed] = useState<LogoForm | null>(null)
  const autoPicked = useRef<string | null>(null)

  // ao trocar de empresa abre o último projeto (se houver)
  useEffect(() => {
    if (!projects || autoPicked.current === brand.id) return
    autoPicked.current = brand.id
    setSel(projects[0]?.id ?? 'new')
  }, [projects, brand.id])
  const current = useMemo(() => projects?.find((p) => p.id === sel) ?? null, [projects, sel])

  const created = (p: LogoProject, count: number) => {
    invalidateLogo(qc, 'projects'); setSel(p.id); setSeed(null)
    generateLogos(p, count, qc).catch((e) => { toast.error(errMsg(e)); invalidateLogo(qc, 'projects') })
  }

  return (
    <div className="space-y-5" data-testid="logo-studio">
      <div className="flex flex-wrap items-center gap-2" data-testid="logo-projects">
        <button type="button" onClick={() => { setSel('new'); setSeed(null) }} aria-pressed={sel === 'new'} data-testid="logo-new" className={cn('inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition', sel === 'new' ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white hover:border-zinc-400')}><Plus className="h-4 w-4" />Nova logo</button>
        {isLoading && <Skeleton className="h-10 w-32" />}
        {projects?.map((p) => <ProjectChip key={p.id} p={p} active={p.id === sel} onClick={() => setSel(p.id)} />)}
        {!brand.is_base && !brand.client_id && <Link to="/studio/library" className="ml-auto text-xs text-zinc-500 underline">Esta pasta não está ligada a um cliente</Link>}
      </div>
      {sel === 'new' || !current ? <NewLogoForm brand={brand} initial={seed} onCreated={created} trained={trained} /> : <ProjectView key={current.id} project={current} brand={brand} onReuse={(f) => { setSeed({ ...f }); setSel('new'); window.scrollTo({ top: 0, behavior: 'smooth' }) }} onDeleted={() => setSel('new')} />}
    </div>
  )
}

function ProjectChip({ p, active, onClick }: { p: LogoProject; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} data-testid="logo-project-chip" className={cn('inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition', active ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white hover:border-zinc-400')}>
      <span className={cn('h-2 w-2 rounded-full', p.status === 'approved' ? 'bg-emerald-500' : p.status === 'generating' ? 'animate-pulse bg-amber-400' : 'bg-zinc-300')} />{p.name}
    </button>
  )
}
