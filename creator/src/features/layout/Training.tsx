import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BookOpen, BrainCircuit, Check, CheckSquare, ChevronDown, Copy, FileText, Film, Globe, Image as ImageIcon, Save, Star, Tags, Trash2, UploadCloud } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn, errMsg } from '@/lib/utils'
import { ConfirmDialog, Modal, Skeleton, Spinner } from '@/components/ui'
import { saveSettings, useStudioSettings } from '@/features/studio/data'
import { StudioImg } from '@/features/studio/ui'
import type { Brand } from '@/features/studio/types'
import { LAYOUT_CATEGORIES, LAYOUT_SECTIONS, LAYOUT_SKILL, LAYOUT_STYLES } from '../../../supabase/functions/_shared/layout-skill'
import { createSites, deleteSites, runLayoutTraining, saveLayoutNotes, tagSites, updateSite, useLayoutSites, useSiteAssets, useSiteCovers, type NewSiteGroup } from './data'
import { ACCEPT_SITE, isSiteFile } from './slice'
import type { LayoutObs, LayoutSite } from './types'

const catLabel = (id: string) => LAYOUT_CATEGORIES.find((c) => c.id === id)?.label.split(' (')[0].split(' / ')[0] ?? id
const isCat = (t: string) => LAYOUT_CATEGORIES.some((c) => c.id === t)
const fileIcon = (f: File) => (f.type === 'application/pdf' ? <FileText className="h-4 w-4" /> : /^video\//.test(f.type) ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />)

function ObsView({ o }: { o: LayoutObs }) {
  const rows: [string, string][] = [
    ['Resumo', o.summary], ['Negócio / público', [o.business, o.audience].filter(Boolean).join(' · ')], ['Objetivo e tom', [o.goal, o.tone].filter(Boolean).join(' · ')], ['Estilo', `${o.style_id}${o.style_note ? ` — ${o.style_note}` : ''} · modo ${o.mode}`],
    ['Tipografia', `${o.typography.heading} ${o.typography.heading_weight} + ${o.typography.body}. ${o.typography.scale_note}`], ['Grade', o.grid], ['Cantos e sombras', `${o.radius} · ${o.shadows}`], ['Botões', o.buttons], ['Cartões', o.cards], ['Ícones e imagens', `${o.icons} · ${o.imagery}`],
    ['Hero', `${o.hero.pattern}: "${o.hero.headline}" — botão "${o.hero.cta}". ${o.hero.visual}`], ['Conversão', o.cta_strategy], ['Prova social', o.social_proof], ['Densidade e tamanho', `${o.density} · ${o.length}`],
    ['Pontos fortes', o.ux_strengths.join(' · ')], ['Pontos fracos', o.ux_weaknesses.join(' · ')], ['Celular', o.mobile_notes], ['O que marca', o.key_trait],
  ]
  return (
    <div className="space-y-1.5 text-xs" data-testid="layout-obs">
      {o.palette.length > 0 && <div className="flex items-center gap-1.5"><span className="w-28 shrink-0 font-semibold text-zinc-500">Paleta</span>{o.palette.map((c) => <span key={c.hex + c.role} className="h-5 w-5 rounded ring-1 ring-black/10" style={{ background: c.hex }} title={`${c.role} ${c.hex}`} />)}</div>}
      {rows.filter(([, v]) => v && v.trim()).map(([k, v]) => <div key={k} className="flex gap-2"><span className="w-28 shrink-0 font-semibold text-zinc-500">{k}</span><span className="text-zinc-800">{v}</span></div>)}
      {o.sections.length > 0 && <div className="flex gap-2"><span className="w-28 shrink-0 font-semibold text-zinc-500">Seções ({o.sections.length})</span><ol className="list-decimal space-y-0.5 pl-4 text-zinc-800">{o.sections.map((s) => <li key={s.order + s.key}><b>{s.label || s.key}</b> — {s.pattern}</li>)}</ol></div>}
    </div>
  )
}

/** Janela para enviar os sites: cada arquivo vira um site, ou todos juntos viram um site só */
function NewSitesModal({ files, brand, onClose, onDone }: { files: File[]; brand: Brand; onClose: () => void; onDone: () => void }) {
  const { profile } = useAuth()
  const [mode, setMode] = useState<'each' | 'one'>(files.length > 1 ? 'each' : 'one')
  const [name, setName] = useState(files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : '')
  const [url, setUrl] = useState('')
  const [cats, setCats] = useState<string[]>([])
  const [busy, setBusy] = useState<{ text: string; pct: number } | null>(null)
  const toggle = (id: string) => setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-2)))
  const go = async () => {
    if (!profile) return
    const groups: NewSiteGroup[] = mode === 'each'
      ? files.map((f) => ({ name: f.name.replace(/\.[^.]+$/, ''), categories: cats, files: [f] }))
      : [{ name: name.trim() || 'Site', url, categories: cats, files }]
    setBusy({ text: 'Começando…', pct: 1 })
    try { const r = await createSites(brand.id, profile.id, groups, (text, pct) => setBusy({ text, pct })); toast.success(`${r.length} site(s) enviado(s). Treine para a IA aprender com eles.`); onDone() }
    catch (e) { toast.error(errMsg(e)); setBusy(null) }
  }
  return (
    <Modal open onClose={busy ? () => undefined : onClose} size="lg" title="Enviar sites de referência" subtitle={`${files.length} arquivo(s). A IA lê cada site e descobre a categoria sozinha; você pode corrigir depois.`}
      footer={<><button className="btn-outline" onClick={onClose} disabled={!!busy}>Cancelar</button><button className="btn-brand" onClick={go} disabled={!!busy} data-testid="sites-send">{busy ? <><Spinner className="h-4 w-4 text-white" />Enviando…</> : 'Enviar'}</button></>}>
      <div className="space-y-4">
        <ul className="max-h-32 space-y-1 overflow-auto rounded-xl border border-zinc-200 p-2 text-xs">{files.map((f) => <li key={f.name + f.size} className="flex items-center gap-2 text-zinc-700">{fileIcon(f)}<span className="truncate">{f.name}</span><span className="ml-auto shrink-0 text-zinc-400">{(f.size / 1048576).toFixed(1)} MB</span></li>)}</ul>
        {files.length > 1 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {([['each', 'Cada arquivo é um site diferente'], ['one', 'Todos são do MESMO site (páginas e seções do mesmo)']] as const).map(([id, l]) => (
              <button key={id} type="button" onClick={() => setMode(id)} aria-pressed={mode === id} className={cn('rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition', mode === id ? 'border-ink bg-ink text-white' : 'border-zinc-200 hover:border-zinc-400')}>{l}</button>
            ))}
          </div>
        )}
        {mode === 'one' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Nome do site</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Landing page do curso X" /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Endereço (opcional)</span><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></label>
          </div>
        )}
        <div>
          <p className="label">Categoria <span className="font-normal normal-case text-zinc-400">(opcional, até 2; vazio = a IA descobre)</span></p>
          <div className="flex flex-wrap gap-1.5">{LAYOUT_CATEGORIES.map((c) => <button key={c.id} type="button" onClick={() => toggle(c.id)} aria-pressed={cats.includes(c.id)} className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium transition', cats.includes(c.id) ? 'border-ink bg-ink text-white' : 'border-zinc-200 hover:border-zinc-400')}>{catLabel(c.id)}</button>)}</div>
        </div>
        <p className="rounded-xl bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">Prints compridos (página inteira), PDF e vídeos de rolagem são cortados automaticamente em recortes na ordem da página, para a IA ler cada seção com nitidez.</p>
        {busy && <div><div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-all" style={{ width: `${busy.pct}%` }} /></div><p className="mt-2 text-xs text-zinc-500" data-testid="sites-step">{busy.text}</p></div>}
      </div>
    </Modal>
  )
}

function SiteModal({ site, onClose, onChanged }: { site: LayoutSite; onClose: () => void; onChanged: () => void }) {
  const { data: assets } = useSiteAssets(site.id)
  const [cats, setCats] = useState(site.categories)
  const [name, setName] = useState(site.name)
  const [url, setUrl] = useState(site.url ?? '')
  const flip = async (id: string) => { const on = cats.includes(id); try { await tagSites([{ ...site, categories: cats }], id, on ? 'remove' : 'add'); setCats(on ? cats.filter((x) => x !== id) : [...cats, id]); onChanged() } catch (e) { toast.error(errMsg(e)) } }
  const saveMeta = async () => { try { await updateSite(site.id, { name: name.trim() || site.name, url: url.trim() || null }); onChanged(); toast.success('Salvo') } catch (e) { toast.error(errMsg(e)) } }
  return (
    <Modal open onClose={onClose} size="xl" title={site.name} subtitle={`${assets?.length ?? '…'} recorte(s) em ordem de rolagem`}>
      <div className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
        <div className="max-h-[70vh] space-y-2 overflow-auto rounded-2xl bg-zinc-100 p-2" data-testid="site-slices">
          {(assets ?? []).map((a) => <StudioImg key={a.id} path={a.storage_path} fit="contain" className="min-h-[140px] rounded-lg bg-white" />)}
          {!assets && <Skeleton className="h-60 w-full" />}
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-auto pr-1">
          <div className="grid gap-2">
            <label className="block"><span className="mb-1 block text-[11px] font-semibold text-zinc-600">Nome</span><input className="input h-9 text-sm" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="block"><span className="mb-1 block text-[11px] font-semibold text-zinc-600">Endereço</span><input className="input h-9 text-sm" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></label>
            <button className="btn-outline btn-sm w-fit" onClick={saveMeta}><Save className="h-3.5 w-3.5" />Salvar</button>
          </div>
          <div>
            <p className="label">Categorias</p>
            <div className="flex flex-wrap gap-1">{LAYOUT_CATEGORIES.map((c) => <button key={c.id} type="button" onClick={() => flip(c.id)} className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium transition', cats.includes(c.id) ? 'border-ink bg-ink text-white' : 'border-zinc-200 hover:border-zinc-400')}>{catLabel(c.id)}</button>)}</div>
          </div>
          <div><p className="label">Análise da IA</p>{site.observation ? <ObsView o={site.observation} /> : <p className="text-xs text-zinc-500">Ainda não lido. Clique em Treinar para a IA analisar.</p>}</div>
        </div>
      </div>
    </Modal>
  )
}

/** Sites de referência de uma pasta: envio em lote (print, PDF, vídeo), categorias, estrela e a leitura da IA */
function SiteRefs({ brand }: { brand: Brand }) {
  const qc = useQueryClient()
  const { data: sites, isLoading } = useLayoutSites(brand.id)
  const { data: covers } = useSiteCovers(brand.id)
  const [drag, setDrag] = useState(false)
  const [pending, setPending] = useState<File[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [view, setView] = useState<LayoutSite | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [filter, setFilter] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const refresh = () => { qc.invalidateQueries({ queryKey: ['layout'] }); qc.invalidateQueries({ queryKey: ['studio', 'usage'] }) }

  const pick = (list: File[]) => { const ok = list.filter(isSiteFile); if (!ok.length) return toast.error('Envie prints (PNG, JPG, WEBP), PDF ou vídeo (WEBM, MP4).'); setPending(ok) }
  const counts = useMemo(() => { const m = new Map<string, number>(); (sites ?? []).forEach((s) => s.categories.filter(isCat).forEach((t) => m.set(t, (m.get(t) ?? 0) + 1))); return m }, [sites])
  const untagged = (sites ?? []).filter((s) => !s.categories.some(isCat)).length
  const shown = (sites ?? []).filter((s) => (filter === null ? true : filter === '_none' ? !s.categories.some(isCat) : s.categories.includes(filter)))
  const toggle = (id: string) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const total = sites?.length ?? 0
  const remove = async (list: LayoutSite[]) => { try { await deleteSites(list); setSel(new Set()); setView(null); refresh(); toast.success('Removido') } catch (e) { toast.error(errMsg(e)) } setConfirm(false) }
  const tag = async (cat: string) => {
    const list = (sites ?? []).filter((s) => sel.has(s.id)); if (!list.length) return
    const allHave = list.every((s) => s.categories.includes(cat))
    try { await tagSites(list, cat, allHave ? 'remove' : 'add'); refresh(); toast.success(allHave ? 'Categoria removida' : `Marcados como ${catLabel(cat)}`) } catch (e) { toast.error(errMsg(e)) }
  }
  const fav = async (s: LayoutSite) => { await updateSite(s.id, { favorite: !s.favorite }); refresh() }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); pick(Array.from(e.dataTransfer.files)) }

  return (
    <div onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true) } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false) }} onDrop={onDrop}>
      <button type="button" onClick={() => input.current?.click()} data-testid="layout-ref-drop"
        className={cn('group flex w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-9 text-center transition', drag ? 'border-brand bg-brand-soft/60' : 'border-zinc-300 bg-white/60 hover:border-ink hover:bg-white')}>
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-white shadow-card transition group-hover:scale-105"><UploadCloud className="h-6 w-6" /></span>
        <p className="font-display text-base font-semibold tracking-tight">Arraste os sites de referência ou clique para escolher</p>
        <p className="mt-1 max-w-xl text-sm text-zinc-500">Prints da página inteira, vários prints, PDF ou vídeo de rolagem. Quantos quiser (50, 100, 300…), e pode subir mais depois e treinar de novo. PNG, JPG, WEBP, PDF, WEBM ou MP4.</p>
      </button>
      <input ref={input} type="file" accept={ACCEPT_SITE} multiple hidden data-testid="layout-ref-input" onChange={(e) => { if (e.target.files) pick(Array.from(e.target.files)); e.target.value = '' }} />

      {total > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-sm text-zinc-500"><b className="text-ink">{total} site{total > 1 ? 's' : ''}</b>. Filtre por categoria; marque vários e use <b>Categorizar</b> para corrigir. Toque num site para ver os recortes e a análise dele.</p>
          <div className="flex flex-wrap gap-1.5" data-testid="layout-filters">
            <button type="button" onClick={() => setFilter(null)} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition', filter === null ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white hover:border-zinc-400')}>Todos ({total})</button>
            {LAYOUT_CATEGORIES.map((c) => <button key={c.id} type="button" onClick={() => setFilter(filter === c.id ? null : c.id)} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition', filter === c.id ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white hover:border-zinc-400', !counts.get(c.id) && 'opacity-50')}>{catLabel(c.id)} ({counts.get(c.id) ?? 0})</button>)}
            {untagged > 0 && <button type="button" onClick={() => setFilter(filter === '_none' ? null : '_none')} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition', filter === '_none' ? 'border-amber-600 bg-amber-500 text-white' : 'border-amber-300 bg-amber-50 text-amber-900')}>Sem categoria ({untagged})</button>}
          </div>
        </div>
      )}

      {sel.size > 0 && (
        <div className="sticky top-2 z-20 mt-4 animate-scale-in rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-pop" data-testid="layout-selbar">
          <div className="flex flex-wrap items-center gap-3">
            <CheckSquare className="h-4 w-4 text-brand" /><b>{sel.size}</b> selecionado(s)
            <button className="btn-ghost ml-auto h-8 text-white hover:bg-white/10 hover:text-white" onClick={() => setSel(new Set(shown.map((s) => s.id)))}>Selecionar os {shown.length} visíveis</button>
            <button className="btn-ghost h-8 text-white hover:bg-white/10 hover:text-white" onClick={() => setSel(new Set())}>Limpar</button>
            <button className="btn h-8 bg-brand text-white hover:bg-brand-dark" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Excluir</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5"><Tags className="h-4 w-4 text-zinc-400" /><span className="text-xs text-zinc-400">Categorizar:</span>
            {LAYOUT_CATEGORIES.map((c) => <button key={c.id} type="button" onClick={() => tag(c.id)} className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/25">{catLabel(c.id)}</button>)}</div>
        </div>
      )}

      <div className="mt-4">
        {isLoading ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[4/3]" />)}</div>
          : !total ? <p className="py-4 text-center text-sm text-zinc-500">Nenhum site ainda. Quanto mais exemplos de cada tipo (venda, restaurante, clínica…), mais fiel o estilo.</p> : (
            <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="layout-refs">
              {shown.map((s) => {
                const cv = covers?.get(s.id)
                return (
                  <div key={s.id} className={cn('group relative overflow-hidden rounded-2xl bg-white shadow-card ring-2 transition', sel.has(s.id) ? 'ring-brand' : 'ring-transparent hover:ring-zinc-300')} data-testid="layout-ref">
                    <button type="button" className="block w-full" onClick={() => setView(s)}><StudioImg path={cv ? (cv.thumb_path ?? cv.storage_path) : null} className="aspect-[4/3]" /></button>
                    <button type="button" aria-label="Selecionar" onClick={() => toggle(s.id)} className={cn('absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border-2 transition', sel.has(s.id) ? 'border-brand bg-brand text-white' : 'border-white/80 bg-black/30 text-transparent opacity-0 group-hover:opacity-100')}><Check className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Favoritar" onClick={() => fav(s)} className={cn('absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full transition', s.favorite ? 'bg-amber-400 text-white opacity-100' : 'bg-black/30 text-white opacity-0 group-hover:opacity-100')}><Star className={cn('h-3.5 w-3.5', s.favorite && 'fill-current')} /></button>
                    <div className="p-2">
                      <p className="flex items-center gap-1 truncate text-xs font-semibold" title={s.name}>{s.url && <Globe className="h-3 w-3 shrink-0 text-zinc-400" />}<span className="truncate">{s.name}</span></p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {s.categories.filter(isCat).map((t) => <span key={t} className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">{catLabel(t)}</span>)}
                        {!s.categories.some(isCat) && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">sem categoria</span>}
                        {s.observation && <span className="ml-auto rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700" title="A IA já leu este site">lido</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
      </div>

      {pending && <NewSitesModal files={pending} brand={brand} onClose={() => setPending(null)} onDone={() => { setPending(null); refresh() }} />}
      {view && <SiteModal site={view} onClose={() => setView(null)} onChanged={refresh} />}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => remove(sel.size === 0 && view ? [view] : (sites ?? []).filter((s) => sel.has(s.id)))} danger title="Excluir sites" message="Os sites e os recortes serão apagados. Para a IA esquecer o estilo deles, treine novamente depois." confirmLabel="Excluir" />
    </div>
  )
}

function SkillView({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold" aria-expanded={open}>
        <BookOpen className="h-4 w-4 text-zinc-500" />{title}<span className="ml-1 text-xs font-normal text-zinc-500">· {Math.round(text.length / 1000)} mil caracteres</span>
        <ChevronDown className={cn('ml-auto h-4 w-4 text-zinc-400 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-zinc-100 p-4">
          <div className="mb-2 flex justify-end"><button type="button" className="btn-outline btn-sm" onClick={() => { navigator.clipboard?.writeText(text); toast.success('Copiado') }}><Copy className="h-3.5 w-3.5" />Copiar</button></div>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-700" data-testid="layout-skill-text">{text}</pre>
        </div>
      )}
    </div>
  )
}

/** Treinamento de layouts: sobe sites de referência, a IA lê cada um e escreve o manual de estilo por categoria */
export default function Training({ brand, base, onTrained }: { brand: Brand; base: Brand | undefined; onTrained: () => void }) {
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const { data: sites } = useLayoutSites(brand.id)
  const { data: settings } = useStudioSettings()
  const [step, setStep] = useState<{ text: string; pct: number } | null>(null)
  const [result, setResult] = useState<{ version: number; refs: number; observed: number; failed: string[] } | null>(null)
  const [notes, setNotes] = useState(brand.layout_notes ?? '')
  const agent = (settings?.agent_notes ?? {}) as { layout_rules?: string }
  const [rules, setRules] = useState(agent.layout_rules ?? '')
  const total = sites?.length ?? 0
  const unread = (sites ?? []).filter((s) => !s.observation).length
  const newer = Math.max(0, total - (brand.layout_trained_refs ?? 0))
  const trained = (brand.layout_skill_version ?? 0) > 0
  const a = brand.layout_analysis
  const counts = useMemo(() => { const m = new Map<string, number>(); (sites ?? []).forEach((r) => r.categories.filter(isCat).forEach((t) => m.set(t, (m.get(t) ?? 0) + 1))); return m }, [sites])

  const train = async (reread = false) => {
    setStep({ text: 'Começando…', pct: 2 })
    try {
      const r = await runLayoutTraining(brand.id, sites ?? [], (text, pct) => setStep({ text, pct }), reread)
      setResult({ version: r.version, refs: r.refs, observed: r.observed, failed: r.failed })
      qc.invalidateQueries({ queryKey: ['studio'] }); qc.invalidateQueries({ queryKey: ['layout'] })
      toast.success(`Treino v${r.version} concluído`)
    } catch (e) { toast.error(errMsg(e)) } finally { setStep(null) }
  }
  const saveNotes = async () => { try { await saveLayoutNotes(brand.id, notes); qc.invalidateQueries({ queryKey: ['studio', 'brands'] }); toast.success('Regras salvas. Treine de novo para aplicar.') } catch (e) { toast.error(errMsg(e)) } }
  const saveRules = async () => { try { await saveSettings({ agent_notes: { ...(settings?.agent_notes ?? {}), layout_rules: rules.trim() } }, qc); toast.success('Regras da agência salvas (valem já na próxima criação).') } catch (e) { toast.error(errMsg(e)) } }

  return (
    <div className="space-y-5" data-testid="layout-training">
      <section className="card p-5 sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100"><ImageIcon className="h-4 w-4" /></span>
          <div>
            <h3 className="font-display text-[15px] font-semibold tracking-tight">{brand.is_base ? 'Sites de referência da agência' : `Sites de referência · ${brand.name}`}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">{brand.is_base ? 'Valem para TODOS os projetos: é o estilo e o nível da Forte Company.' : `Valem só para ${brand.name} (somam ao padrão da agência${base?.layout_skill_version ? `, treinado na v${base.layout_skill_version}` : ''}).`}</p>
          </div>
        </div>
        <SiteRefs brand={brand} />
      </section>

      <section className="card p-6 text-center">
        <span className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink text-white shadow-card"><BrainCircuit className="h-8 w-8" />{step && <span className="absolute inset-0 animate-pulse-ring rounded-2xl" />}</span>
        <h2 className="font-display text-xl font-bold tracking-tight">{trained ? `Treinado · v${brand.layout_skill_version}` : 'Treinar o criador de layouts'}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-500">A IA de visão lê cada site (estrutura e ordem das seções, hero, grade, cores, tipografia, cartões, botões, imagens, como pede a ação) e escreve um manual de estilo geral e por categoria. Ela também descobre sozinha se o site é de venda, restaurante, clínica, academia… As próximas criações seguem esse padrão, sem copiar nenhum site.</p>
        {trained && newer > 0 && <p className="mx-auto mt-3 max-w-md rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{newer} site(s) novo(s) desde o último treino. Treine de novo para incluir.</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button className="btn-brand h-11 px-6" onClick={() => train(false)} disabled={!!step || !total} data-testid="layout-train">{step ? <><Spinner className="h-4 w-4 text-white" />Treinando…</> : <><BrainCircuit className="h-4 w-4" />{trained ? 'Treinar de novo' : 'Treinar agora'}{unread > 0 ? ` (${unread} para ler)` : ''}</>}</button>
          {trained && <button className="btn-outline h-11" onClick={onTrained} data-testid="layout-open-studio">Abrir o estúdio de layouts</button>}
        </div>
        {step && <div className="mx-auto mt-4 max-w-md"><div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-all" style={{ width: `${step.pct}%` }} /></div><p className="mt-2 text-xs text-zinc-500" data-testid="layout-train-step">{step.text}</p></div>}
        {!total && <p className="mt-3 text-xs text-zinc-500">Envie ao menos um site para treinar. Sem treino o estúdio também funciona, usando só a skill embutida.</p>}
        {result && (
          <div className="mx-auto mt-5 max-w-lg rounded-2xl bg-emerald-50 p-4 text-left text-sm text-emerald-900" data-testid="layout-train-done">
            <p className="font-semibold"><Check className="mr-1 inline h-4 w-4" />Treino v{result.version} concluído: {result.observed} site(s) analisado(s) de {result.refs}.</p>
            {result.failed.length > 0 && <p className="mt-1 text-xs text-amber-900">{result.failed.length} não puderam ser lidos: {result.failed.slice(0, 2).join(' · ')}</p>}
            <button className="btn-brand mt-3 h-10" onClick={onTrained}>Abrir o estúdio de layouts →</button>
          </div>
        )}
        {trained && <button type="button" className="mt-3 text-xs text-zinc-500 underline" onClick={() => train(true)} disabled={!!step}>Reler todos os sites (refaz a análise de cada um)</button>}
      </section>

      <section className="card p-5 sm:p-6" data-testid="layout-coverage">
        <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Categorias de site e exemplos</h3>
        <p className="mb-3 text-xs text-zinc-500">Cada categoria tem um manual embutido (ordem das seções, hero, estilo, erros). Seus sites refinam o manual com o seu gosto. Categoria sem exemplos usa só o manual embutido.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LAYOUT_CATEGORIES.map((c) => (
            <div key={c.id} className="rounded-xl border border-zinc-200 p-3">
              <div className="flex items-center justify-between gap-2"><b className="text-sm">{c.label.split(' (')[0]}</b><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', counts.get(c.id) ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500')}>{counts.get(c.id) ?? 0} site(s)</span></div>
              <p className="mt-0.5 text-[11px] text-zinc-500">{c.hint}</p>
            </div>
          ))}
        </div>
      </section>

      {a && (
        <section className="card p-5 sm:p-6" data-testid="layout-analysis">
          <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">O que a IA aprendeu com os seus sites</h3>
          {a.general?.summary && <p className="mb-4 text-sm text-zinc-700">{a.general.summary}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            {([['Estrutura', a.general?.structure], ['Cor', a.general?.color], ['Tipografia', a.general?.typography], ['Componentes', a.general?.components], ['Imagens', a.general?.imagery], ['Conversão', a.general?.conversion]] as const).filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><p className="label">{k}</p><p className="text-sm text-zinc-700">{v}</p></div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {a.general?.do?.length ? <div><p className="label">Sempre</p><ul className="space-y-1">{a.general.do.map((x) => <li key={x} className="rounded-xl bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900">{x}</li>)}</ul></div> : null}
            {a.general?.dont?.length ? <div><p className="label">Nunca</p><ul className="space-y-1">{a.general.dont.map((x) => <li key={x} className="rounded-xl bg-brand-soft px-3 py-1.5 text-sm text-red-900">{x}</li>)}</ul></div> : null}
          </div>
          <div className="mt-5 space-y-2">
            {Object.entries(a.categories ?? {}).map(([id, c]) => (
              <details key={id} className="rounded-xl border border-zinc-200 px-4 py-2.5"><summary className="cursor-pointer text-sm font-semibold">{LAYOUT_CATEGORIES.find((x) => x.id === id)?.label ?? id}{c.count ? <span className="ml-2 text-xs font-normal text-zinc-500">{c.count} site(s)</span> : null}</summary>
                <div className="mt-3 grid gap-3 text-sm text-zinc-700 md:grid-cols-2">
                  {([['Resumo', c.summary], ['Estrutura', c.structure], ['Hero', c.hero], ['Seções', c.sections], ['Paleta', c.palette], ['Tipografia', c.typography], ['Componentes', c.components], ['Imagens', c.imagery], ['Conversão', c.conversion], ['Tom', c.tone]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k}><p className="label">{k}</p><p>{v}</p></div>)}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      <section className="card space-y-4 p-5 sm:p-6">
        <div>
          <h3 className="font-display text-[15px] font-semibold tracking-tight">Skill do criador de layouts</h3>
          <p className="mt-0.5 text-xs text-zinc-500">A skill já vem pronta: princípios de UX/UI, tipografia, espaçamento, conversão, como escrever para o GPT Image, {LAYOUT_CATEGORIES.length} manuais de categoria, {LAYOUT_STYLES.length} estilos visuais e um catálogo de {LAYOUT_SECTIONS.length} seções. Você pode somar regras suas.</p>
        </div>
        <SkillView title="Skill · Diretor de UX/UI de sites" text={LAYOUT_SKILL} />
        <SkillView title="Manuais das categorias de site" text={LAYOUT_CATEGORIES.map((c) => `## ${c.label}\n${c.playbook}`).join('\n\n')} />
        <SkillView title="Estilos visuais" text={LAYOUT_STYLES.map((s) => `## ${s.label}\n${s.look}\nFontes: ${s.fonts.join(', ')}`).join('\n\n')} />
        <SkillView title="Catálogo de seções" text={LAYOUT_SECTIONS.map((s) => `## ${s.label} (${s.key})\nObjetivo: ${s.purpose}\nPadrões: ${s.patterns}`).join('\n\n')} />
        {brand.layout_skill_doc && <SkillView title={`Documento treinado · ${brand.is_base ? 'agência' : brand.name} v${brand.layout_skill_version}`} text={brand.layout_skill_doc} />}
        {!brand.is_base && (
          <div>
            <p className="label">Regras extras só desta pasta</p>
            <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: sempre fundo escuro; botões em pílula; nunca usar fotos de banco de imagens." data-testid="layout-notes" />
            <button className="btn-outline btn-sm mt-2" onClick={saveNotes}><Save className="h-3.5 w-3.5" />Salvar regras da pasta</button>
          </div>
        )}
        {isAdmin && (
          <div>
            <p className="label">Regras extras da agência para criar layouts</p>
            <textarea className="input" rows={3} value={rules} onChange={(e) => setRules(e.target.value)} placeholder="Ex.: sempre incluir uma seção de garantia; evitar degradês arco-íris." data-testid="layout-rules" />
            <button className="btn-outline btn-sm mt-2" onClick={saveRules}><Save className="h-3.5 w-3.5" />Salvar regras da agência</button>
          </div>
        )}
      </section>
    </div>
  )
}
