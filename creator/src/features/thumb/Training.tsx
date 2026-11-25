import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BookOpen, BrainCircuit, Check, CheckSquare, ChevronDown, Copy, Image as ImageIcon, Save, Star, Tags, Trash2, Type, UploadCloud, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, errMsg, fmtBytes } from '@/lib/utils'
import { ConfirmDialog, Modal, Skeleton, Spinner } from '@/components/ui'
import { deleteAssets, saveSettings, uploadAssets, useAssets, useStudioSettings, type UploadState } from '@/features/studio/data'
import { StudioImg } from '@/features/studio/ui'
import type { Brand, StudioAsset } from '@/features/studio/types'
import { THUMB_CATEGORIES, THUMB_REF_FONTS, THUMB_SKILL, THUMB_TYPE_GUIDE } from '../../../supabase/functions/_shared/thumb-skill'
import { readFontOf } from '@/features/fonts/reader'
import { FontSample } from '@/features/fonts/FontSample'
import { FONT_CLASSES, fontLabel, type FontMatch, type FontProfile } from '../../../supabase/functions/_shared/fonts'
import { rereadThumbFonts, runThumbTraining, saveThumbNotes, tagThumbRefs } from './data'
import type { ThumbObs } from './types'

const MAX = 300
const catLabel = (id: string) => THUMB_CATEGORIES.find((c) => c.id === id)?.label.split(' / ')[0] ?? id
const isCat = (t: string) => THUMB_CATEGORIES.some((c) => c.id === t)

function Obs({ o }: { o: ThumbObs }) {
  const rows: [string, string][] = [
    ['O que conta', o.summary], ['Texto', o.has_text ? `${o.text.join(' · ')} (${o.text_position}) — ${o.text_style}` : 'sem texto'], ['Por que (não) tem texto', o.text_needed],
    ['Pessoas', `${o.persons} · ${o.person_role} · posição ${o.person_position} · rosto ${o.face_size}`], ['Lettering', o.lettering ? `${o.lettering.style_id} (${o.lettering.font_hint}) — ${o.lettering.look}; ${o.lettering.container}; ${o.lettering.integration}; ${o.lettering.hierarchy}` : ''], ['Lógica dos objetos', o.object_logic ?? ''], ['Realismo', o.realism ?? ''], ['Esqueleto', o.skeleton ?? ''], ['Expressão e olhar', `${o.expression} · olhar: ${o.gaze}`], ['Pose e mãos', o.pose_hands],
    ['Fundo', o.background], ['Luz', o.lighting], ['Câmera', o.camera], ['Saturação', o.saturation], ['Efeitos', o.effects.join(', ')], ['Objetos', o.props.join(', ')], ['Destaque', o.key_trait],
  ]
  return (
    <div className="space-y-1.5 text-xs" data-testid="thumb-obs">
      {o.palette.length > 0 && <div className="flex items-center gap-1.5"><span className="w-28 shrink-0 font-semibold text-zinc-500">Paleta</span>{o.palette.map((c) => <span key={c} className="h-5 w-5 rounded ring-1 ring-black/10" style={{ background: c }} title={c} />)}</div>}
      {rows.filter(([, v]) => v && v.trim()).map(([k, v]) => <div key={k} className="flex gap-2"><span className="w-28 shrink-0 font-semibold text-zinc-500">{k}</span><span className="text-zinc-800">{v}</span></div>)}
    </div>
  )
}

const CASE_PT: Record<string, string> = { upper: 'caixa alta', lower: 'minúsculas', mixed: 'caixa mista' }

/** Fonte lida de uma thumbnail: a mais parecida + alternativas */
function FontRead({ m, onReread, busy }: { m?: FontMatch; onReread: () => void; busy: boolean }) {
  return (
    <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3" data-testid="font-read">
      <div className="flex items-center justify-between gap-2"><p className="label !mb-0">Fonte lida pelo leitor de fontes</p><button type="button" className="btn-ghost btn-sm" onClick={onReread} disabled={busy} data-testid="font-read-btn">{busy ? <Spinner className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}{m ? 'Reler' : 'Ler agora'}</button></div>
      {m?.family ? (
        <>
          <div className="mt-1 flex items-baseline gap-3"><FontSample family={m.family} weight={m.weight} text={m.text || 'Aa Rag'} className="text-2xl text-ink" /></div>
          <p className="mt-1 text-xs text-zinc-700"><b>{fontLabel(m)}</b> · {FONT_CLASSES[m.cls] ?? m.cls} · {CASE_PT[m.case] ?? m.case} · {Math.round(m.confidence * 100)}% de semelhança{m.uncertain ? ' (incerta)' : ''}</p>
          {m.alts.length > 0 && <p className="mt-0.5 text-[11px] text-zinc-500">Também parece com: {m.alts.map((a) => fontLabel(a)).join(', ')}</p>}
          {m.note && <p className="mt-0.5 text-[11px] text-zinc-500">{m.note}</p>}
        </>
      ) : <p className="mt-1 text-xs text-zinc-500">{m ? `Nenhuma fonte candidata parecida.${m.note ? ' ' + m.note : ''}` : 'Ainda não lida. O treino lê a fonte de cada thumbnail com texto.'}</p>}
    </div>
  )
}

/** Perfil de fontes aprendido, por categoria (o que o estúdio usa em vez de inventar fonte) */
function LearnedFonts({ fonts, onReread, busy, total }: { fonts?: Record<string, FontProfile>; onReread: () => void; busy: boolean; total: number }) {
  const rows = Object.entries(fonts ?? {}).filter(([, v]) => v.fonts.length)
  return (
    <section className="card p-5 sm:p-6" data-testid="thumb-learned-fonts">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[15px] font-semibold tracking-tight">Fontes aprendidas das suas thumbnails</h3>
        <button type="button" className="btn-outline btn-sm" onClick={onReread} disabled={busy || !total} data-testid="fonts-reread">{busy ? <Spinner className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}Reler todas as fontes</button>
      </div>
      <p className="mb-3 text-xs text-zinc-500">O leitor de fontes compara as letras de cada thumbnail com centenas de fontes do Google Fonts e anota a mais parecida (não precisa ser a exata). Por categoria, as fontes mais usadas viram a tipografia do estúdio: ao gerar, a IA usa só estas, em vez de inventar.</p>
      {!rows.length ? <p className="rounded-xl bg-zinc-50 px-3 py-4 text-center text-xs text-zinc-500">Ainda sem leitura. Clique em Treinar (ou em Reler todas as fontes) para o leitor identificar a fonte de cada thumbnail com texto.</p> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map(([id, v]) => (
            <div key={id} className="rounded-2xl border border-zinc-200 p-3.5" data-testid="learned-font-card">
              <div className="mb-2 flex items-center justify-between gap-2"><b className="text-sm">{id === '_todas' ? 'Todas as thumbnails' : THUMB_CATEGORIES.find((c) => c.id === id)?.label ?? id}</b><span className="text-[10px] font-semibold text-zinc-500">{v.text_n} com texto de {v.n} ({v.text_pct}%)</span></div>
              <ul className="space-y-1.5">
                {v.fonts.slice(0, 5).map((f) => (
                  <li key={f.family + f.weight} className="flex items-center gap-3">
                    <FontSample family={f.family} weight={f.weight} className="w-28 shrink-0 truncate text-xl leading-none text-ink" />
                    <div className="min-w-0 flex-1"><p className="truncate text-xs"><b>{fontLabel(f)}</b> <span className="text-zinc-500">· {FONT_CLASSES[f.cls] ?? f.cls} · {CASE_PT[f.case] ?? f.case}</span></p><div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(4, f.pct)}%` }} /></div></div>
                    <span className="w-9 shrink-0 text-right text-xs font-semibold text-zinc-600">{f.pct}%</span>
                  </li>
                ))}
              </ul>
              {v.classes.length > 0 && <p className="mt-2 text-[11px] text-zinc-500">Estilos: {v.classes.map(([k, p]) => `${FONT_CLASSES[k] ?? k} ${p}%`).join(' · ')}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Thumbnails de referência de uma pasta: envio em lote, categorias (várias por thumbnail), estrela e a observação da IA de cada uma */
function ThumbRefs({ brand }: { brand: Brand }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { data: refs, isLoading } = useAssets(brand.id, 'thumb_ref')
  const [uploads, setUploads] = useState<UploadState[]>([])
  const [drag, setDrag] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [view, setView] = useState<StudioAsset | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [filter, setFilter] = useState<string | null>(null)
  const [fontBusy, setFontBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const busy = uploads.some((u) => u.status === 'queued' || u.status === 'uploading')
  const refresh = () => { qc.invalidateQueries({ queryKey: ['studio', 'assets'] }); qc.invalidateQueries({ queryKey: ['studio', 'usage'] }) }

  const start = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return toast.error('Selecione arquivos de imagem.')
    const created = await uploadAssets(brand.id, imgs, 'thumb_ref', profile!.id, { bytesLeft: 1e9, refsLeft: MAX - (refs?.length ?? 0) }, setUploads, 3, { maxSide: 1600 })
    refresh()
    if (created.length) toast.success(`${created.length} thumbnail(s) enviada(s)`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.id, profile, refs?.length])

  const counts = useMemo(() => { const m = new Map<string, number>(); (refs ?? []).forEach((a) => (a.tags ?? []).filter(isCat).forEach((t) => m.set(t, (m.get(t) ?? 0) + 1))); return m }, [refs])
  const untagged = (refs ?? []).filter((a) => !(a.tags ?? []).some(isCat)).length
  const shown = (refs ?? []).filter((a) => (filter === null ? true : filter === '_none' ? !(a.tags ?? []).some(isCat) : (a.tags ?? []).includes(filter)))
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); start(Array.from(e.dataTransfer.files)) }
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const fav = async (a: StudioAsset) => { await supabase.from('studio_assets').update({ favorite: !a.favorite }).eq('id', a.id); refresh() }
  const remove = async (list: StudioAsset[]) => { try { await deleteAssets(list); setSel(new Set()); setView(null); refresh(); toast.success('Removido') } catch (e) { toast.error(errMsg(e)) } setConfirm(false) }
  const tag = async (cat: string) => {
    const list = (refs ?? []).filter((a) => sel.has(a.id)); if (!list.length) return
    const allHave = list.every((a) => (a.tags ?? []).includes(cat))
    try { await tagThumbRefs(list, cat, allHave ? 'remove' : 'add'); refresh(); toast.success(allHave ? 'Categoria removida' : `Marcadas como ${catLabel(cat)}`) } catch (e) { toast.error(errMsg(e)) }
  }
  const total = refs?.length ?? 0

  return (
    <div onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true) } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false) }} onDrop={onDrop}>
      <button type="button" onClick={() => input.current?.click()} disabled={busy} data-testid="thumb-ref-drop"
        className={cn('group flex w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-9 text-center transition', drag ? 'border-brand bg-brand-soft/60' : 'border-zinc-300 bg-white/60 hover:border-ink hover:bg-white')}>
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-white shadow-card transition group-hover:scale-105"><UploadCloud className="h-6 w-6" /></span>
        <p className="font-display text-base font-semibold tracking-tight">Arraste as thumbnails de referência ou clique para escolher</p>
        <p className="mt-1 max-w-lg text-sm text-zinc-500">As que você fez e as que você estuda. Até {MAX}. A IA lê cada uma e descobre a categoria; você pode corrigir. JPG, PNG ou WEBP.</p>
      </button>
      <input ref={input} type="file" accept="image/*" multiple hidden data-testid="thumb-ref-input" onChange={(e) => { if (e.target.files) start(Array.from(e.target.files)); e.target.value = '' }} />

      {uploads.length > 0 && (
        <div className="card mt-4 p-3 text-sm">
          <div className="flex items-center justify-between"><b>{busy ? `Enviando ${uploads.filter((u) => u.status === 'done').length}/${uploads.length}…` : `Envio finalizado · ${uploads.filter((u) => u.status === 'done').length} ok`}</b>{!busy && <button className="btn-ghost btn-sm" onClick={() => setUploads([])}><X className="h-3.5 w-3.5" />Fechar</button>}</div>
          {uploads.filter((u) => u.status === 'error').map((u) => <p key={u.id} className="mt-1 text-xs text-brand"><b>{u.name}</b>: {u.error}</p>)}
        </div>
      )}

      {total > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-sm text-zinc-500"><b className="text-ink">{total} thumbnail{total > 1 ? 's' : ''}</b>. Filtre por categoria; marque várias e use <b>Categorizar</b> para corrigir. Toque numa thumbnail para ver a análise dela.</p>
          <div className="flex flex-wrap gap-1.5" data-testid="thumb-filters">
            <button type="button" onClick={() => setFilter(null)} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition', filter === null ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white hover:border-zinc-400')}>Todas ({total})</button>
            {THUMB_CATEGORIES.map((c) => <button key={c.id} type="button" onClick={() => setFilter(filter === c.id ? null : c.id)} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition', filter === c.id ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white hover:border-zinc-400', !counts.get(c.id) && 'opacity-50')}>{catLabel(c.id)} ({counts.get(c.id) ?? 0})</button>)}
            {untagged > 0 && <button type="button" onClick={() => setFilter(filter === '_none' ? null : '_none')} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition', filter === '_none' ? 'border-amber-600 bg-amber-500 text-white' : 'border-amber-300 bg-amber-50 text-amber-900')}>Sem categoria ({untagged})</button>}
          </div>
        </div>
      )}

      {sel.size > 0 && (
        <div className="sticky top-2 z-20 mt-4 animate-scale-in rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-pop" data-testid="thumb-selbar">
          <div className="flex flex-wrap items-center gap-3">
            <CheckSquare className="h-4 w-4 text-brand" /><b>{sel.size}</b> selecionada(s)
            <button className="btn-ghost ml-auto h-8 text-white hover:bg-white/10 hover:text-white" onClick={() => setSel(new Set(shown.map((a) => a.id)))}>Selecionar as {shown.length} visíveis</button>
            <button className="btn-ghost h-8 text-white hover:bg-white/10 hover:text-white" onClick={() => setSel(new Set())}>Limpar</button>
            <button className="btn h-8 bg-brand text-white hover:bg-brand-dark" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Excluir</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5"><Tags className="h-4 w-4 text-zinc-400" /><span className="text-xs text-zinc-400">Categorizar:</span>
            {THUMB_CATEGORIES.map((c) => <button key={c.id} type="button" onClick={() => tag(c.id)} className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/25" data-testid={`tag-${c.id}`}>{catLabel(c.id)}</button>)}</div>
        </div>
      )}

      <div className="mt-4">
        {isLoading ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-video" />)}</div>
          : !total ? <p className="py-4 text-center text-sm text-zinc-500">Nenhuma thumbnail ainda. Quanto mais exemplos de cada tipo, mais fiel o estilo.</p> : (
            <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="thumb-refs">
              {shown.map((a) => (
                <div key={a.id} className={cn('group relative overflow-hidden rounded-2xl bg-white shadow-card ring-2 transition', sel.has(a.id) ? 'ring-brand' : 'ring-transparent hover:ring-zinc-300')} data-testid="thumb-ref">
                  <button type="button" className="block w-full" onClick={() => setView(a)}><StudioImg path={a.thumb_path ?? a.storage_path} className="aspect-video" /></button>
                  <button type="button" aria-label="Selecionar" onClick={() => toggle(a.id)} className={cn('absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border-2 transition', sel.has(a.id) ? 'border-brand bg-brand text-white' : 'border-white/80 bg-black/30 text-transparent opacity-0 group-hover:opacity-100')}><Check className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label="Favoritar" onClick={() => fav(a)} className={cn('absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full transition', a.favorite ? 'bg-amber-400 text-white opacity-100' : 'bg-black/30 text-white opacity-0 group-hover:opacity-100')}><Star className={cn('h-3.5 w-3.5', a.favorite && 'fill-current')} /></button>
                  <div className="flex flex-wrap gap-1 p-1.5">
                    {(a.tags ?? []).filter(isCat).map((t) => <span key={t} className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">{catLabel(t)}</span>)}
                    {!(a.tags ?? []).some(isCat) && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">sem categoria</span>}
                    {a.meta && <span className="ml-auto rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700" title="A IA já leu esta thumbnail">lida</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {view && (
        <Modal open onClose={() => setView(null)} size="xl" title={view.name} subtitle={`${view.width ?? '?'}×${view.height ?? '?'} · ${fmtBytes(view.size_bytes)}`}
          footer={<button className="btn-danger mr-auto" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Excluir</button>}>
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <StudioImg path={view.storage_path} fit="contain" className="min-h-[220px] rounded-2xl bg-zinc-100" />
            <div>
              <p className="label">Categorias</p>
              <div className="mb-3 flex flex-wrap gap-1">{THUMB_CATEGORIES.map((c) => { const on = (view.tags ?? []).includes(c.id); return <button key={c.id} type="button" onClick={async () => { await tagThumbRefs([view], c.id, on ? 'remove' : 'add'); setView({ ...view, tags: on ? (view.tags ?? []).filter((t) => t !== c.id) : [...(view.tags ?? []), c.id] }); refresh() }} className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium transition', on ? 'border-ink bg-ink text-white' : 'border-zinc-200 hover:border-zinc-400')}>{catLabel(c.id)}</button> })}</div>
              <p className="label">Análise da IA</p>
              {view.meta ? <Obs o={view.meta} /> : <p className="text-xs text-zinc-500">Ainda não lida. Clique em Treinar para a IA analisar.</p>}
              {view.meta?.has_text && <FontRead m={view.meta.font_match} busy={fontBusy} onReread={async () => {
                const o = view.meta!; setFontBusy(true)
                try { const lt = o.lettering as { font_hint?: string; font_alts?: string[]; weight?: string; case?: string } | undefined; const m = await readFontOf({ id: view.id, text: o.text ?? [], hint: lt?.font_hint, alts: lt?.font_alts, weight: lt?.weight, case: lt?.case }); if (m) setView({ ...view, meta: { ...o, font_match: m } }); refresh(); toast.success(m?.family ? `Fonte mais parecida: ${fontLabel(m)}` : 'Nenhuma fonte parecida encontrada') } catch (e) { toast.error(errMsg(e)) } finally { setFontBusy(false) }
              }} />}
            </div>
          </div>
        </Modal>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => remove(view && sel.size === 0 ? [view] : (refs ?? []).filter((a) => sel.has(a.id)))} danger title="Excluir thumbnails" message="As thumbnails serão apagadas. Para a IA esquecer o estilo delas, treine novamente depois." confirmLabel="Excluir" />
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
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-700" data-testid="thumb-skill-text">{text}</pre>
        </div>
      )}
    </div>
  )
}

/** Treinamento de thumbnails: sobe as referências, a IA lê cada uma e escreve o manual de estilo por categoria */
export default function Training({ brand, base, onTrained }: { brand: Brand; base: Brand | undefined; onTrained: () => void }) {
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const { data: refs } = useAssets(brand.id, 'thumb_ref')
  const { data: settings } = useStudioSettings()
  const [step, setStep] = useState<{ text: string; pct: number } | null>(null)
  const [result, setResult] = useState<{ version: number; refs: number; observed: number; demo: boolean; fonts: number } | null>(null)
  const [notes, setNotes] = useState(brand.thumb_notes ?? '')
  const agent = (settings?.agent_notes ?? {}) as { thumb_rules?: string }
  const [rules, setRules] = useState(agent.thumb_rules ?? '')
  const total = refs?.length ?? 0
  const unread = (refs ?? []).filter((a) => !a.meta).length
  const newer = Math.max(0, total - (brand.thumb_trained_refs ?? 0))
  const trained = (brand.thumb_skill_version ?? 0) > 0
  const a = brand.thumb_analysis
  const counts = useMemo(() => { const m = new Map<string, number>(); (refs ?? []).forEach((r) => (r.tags ?? []).filter(isCat).forEach((t) => m.set(t, (m.get(t) ?? 0) + 1))); return m }, [refs])

  const train = async (reread = false) => {
    setStep({ text: 'Começando…', pct: 2 })
    try {
      const r = await runThumbTraining(brand.id, refs ?? [], (text, pct) => setStep({ text, pct }), reread)
      setResult({ version: r.version, refs: r.refs, observed: r.observed, demo: r.demo, fonts: r.fonts.read })
      qc.invalidateQueries({ queryKey: ['studio'] })
      toast.success(`Treino v${r.version} concluído`)
    } catch (e) { toast.error(errMsg(e)) } finally { setStep(null) }
  }
  const rereadFonts = async () => {
    setStep({ text: 'Começando a leitura de fontes…', pct: 2 })
    try { const r = await rereadThumbFonts(brand.id, (text, pct) => setStep({ text, pct })); qc.invalidateQueries({ queryKey: ['studio'] }); toast.success(`${r.read} fonte(s) lida(s)${r.failed ? `, ${r.failed} falharam` : ''}`) } catch (e) { toast.error(errMsg(e)) } finally { setStep(null) }
  }
  const saveNotes = async () => { try { await saveThumbNotes(brand.id, notes); qc.invalidateQueries({ queryKey: ['studio', 'brands'] }); toast.success('Regras do canal salvas. Treine de novo para aplicar.') } catch (e) { toast.error(errMsg(e)) } }
  const saveRules = async () => { try { await saveSettings({ agent_notes: { ...(settings?.agent_notes ?? {}), thumb_rules: rules.trim() } }, qc); toast.success('Regras da agência salvas (valem já na próxima criação).') } catch (e) { toast.error(errMsg(e)) } }

  return (
    <div className="space-y-5" data-testid="thumb-training">
      <section className="card p-5 sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100"><ImageIcon className="h-4 w-4" /></span>
          <div>
            <h3 className="font-display text-[15px] font-semibold tracking-tight">{brand.is_base ? 'Thumbnails de referência da agência' : `Thumbnails de referência · ${brand.name}`}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">{brand.is_base ? 'Valem para TODOS os canais: é o estilo e o nível da Forte Company.' : `Valem só para ${brand.name} (somam ao padrão da agência${base?.thumb_skill_version ? `, treinado na v${base.thumb_skill_version}` : ''}).`}</p>
          </div>
        </div>
        <ThumbRefs brand={brand} />
      </section>

      <section className="card p-6 text-center">
        <span className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink text-white shadow-card"><BrainCircuit className="h-8 w-8" />{step && <span className="absolute inset-0 animate-pulse-ring rounded-2xl" />}</span>
        <h2 className="font-display text-xl font-bold tracking-tight">{trained ? `Treinado · v${brand.thumb_skill_version}` : 'Treinar o criador de thumbnails'}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-500">A IA de visão lê cada thumbnail (posição do personagem, expressão, saturação, fundo, efeitos, onde está o texto e por que precisa dele) e escreve um manual de estilo geral e por categoria. As próximas criações seguem esse padrão, sem copiar nenhuma imagem.</p>
        {trained && newer > 0 && <p className="mx-auto mt-3 max-w-md rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{newer} thumbnail(s) nova(s) desde o último treino. Treine de novo para incluir.</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button className="btn-brand h-11 px-6" onClick={() => train(false)} disabled={!!step || !total} data-testid="thumb-train">{step ? <><Spinner className="h-4 w-4 text-white" />Treinando…</> : <><BrainCircuit className="h-4 w-4" />{trained ? 'Treinar de novo' : 'Treinar agora'}{unread > 0 ? ` (${unread} para ler)` : ''}</>}</button>
          {trained && <button className="btn-outline h-11" onClick={onTrained} data-testid="thumb-open-studio">Abrir o estúdio de thumbnails</button>}
        </div>
        {step && <div className="mx-auto mt-4 max-w-md"><div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-all" style={{ width: `${step.pct}%` }} /></div><p className="mt-2 text-xs text-zinc-500" data-testid="thumb-train-step">{step.text}</p></div>}
        {!total && <p className="mt-3 text-xs text-zinc-500">Envie ao menos uma thumbnail para treinar. Sem treino o estúdio também funciona, usando só a skill embutida.</p>}
        {result?.demo && <p className="mx-auto mt-3 max-w-md rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900"><b>Análise simulada.</b> Sem chave real da OpenAI, a IA de visão não leu as suas thumbnails. Conecte a chave em Modelos e APIs e treine de novo.</p>}
        {result && !result.demo && (
          <div className="mx-auto mt-5 max-w-lg rounded-2xl bg-emerald-50 p-4 text-left text-sm text-emerald-900" data-testid="thumb-train-done">
            <p className="font-semibold"><Check className="mr-1 inline h-4 w-4" />Treino v{result.version} concluído: {result.observed} thumbnail(s) analisada(s) de {result.refs}{result.fonts ? `; ${result.fonts} fonte(s) lida(s) agora` : ''}.</p>
            <button className="btn-brand mt-3 h-10" onClick={onTrained}>Abrir o estúdio de thumbnails →</button>
          </div>
        )}
        {trained && <button type="button" className="mt-3 text-xs text-zinc-500 underline" onClick={() => train(true)} disabled={!!step}>Reler todas as thumbnails (refaz a análise de cada uma)</button>}
      </section>

      <section className="card p-5 sm:p-6" data-testid="thumb-coverage">
        <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Categorias e exemplos</h3>
        <p className="mb-3 text-xs text-zinc-500">Cada categoria tem um manual embutido (gatilho, composição, expressão, cenário, paleta, texto). Seus exemplos refinam o manual com o seu gosto. Categoria sem exemplos usa só o manual embutido.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {THUMB_CATEGORIES.map((c) => (
            <div key={c.id} className="rounded-xl border border-zinc-200 p-3">
              <div className="flex items-center justify-between gap-2"><b className="text-sm">{c.label}</b><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', counts.get(c.id) ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500')}>{counts.get(c.id) ?? 0} ref.</span></div>
              <p className="mt-0.5 text-[11px] text-zinc-500">{c.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <LearnedFonts fonts={a?.fonts} onReread={rereadFonts} busy={!!step} total={total} />

      <section className="card p-5 sm:p-6" data-testid="thumb-fonts">
        <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Guia embutido de fontes e uso do texto por nicho</h3>
        <p className="mb-3 text-xs text-zinc-500">Guia de partida (das primeiras thumbnails). Quando uma categoria já tem fontes lidas das suas imagens (bloco acima), valem as lidas; este guia segue valendo para profundidade, posição, caixa, cores, destaque e seta, e para categorias ainda sem leitura: cada nicho tem sua tipografia, sua profundidade (atrás/na frente), caixa, cores, destaque e seta. Nichos marcados "sem texto" não levam texto em Automático.</p>
        <div className="grid gap-3 lg:grid-cols-2">
          {THUMB_CATEGORIES.filter((c) => THUMB_TYPE_GUIDE[c.id]).map((c) => { const g = THUMB_TYPE_GUIDE[c.id]; return (
            <div key={c.id} className="rounded-2xl border border-zinc-200 p-3.5" data-testid="font-card">
              <div className="mb-1 flex items-center justify-between gap-2"><b className="text-sm">{c.label}</b><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', g.text === 'none' ? 'bg-zinc-100 text-zinc-600' : g.text === 'rare' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700')}>{g.text === 'none' ? 'quase sem texto' : g.text === 'rare' ? 'texto raro' : 'com texto'}</span></div>
              <p className="mb-2 text-xs text-zinc-600">{g.summary}</p>
              <ul className="mb-2 space-y-1">{g.fonts.map((f) => <li key={f.name + f.use} className="text-xs"><b>{f.name}</b> <span className="text-zinc-500">· {f.weights}</span> — {f.use}</li>)}</ul>
              <p className="text-[11px] leading-relaxed text-zinc-500"><b>Profundidade:</b> {g.depth}. <b>Posição:</b> {g.position}. <b>Caixa:</b> {g.case}. <b>Cores:</b> {g.colors}. <b>Destaque:</b> {g.emphasis}. <b>Setas:</b> {g.arrows}.</p>
            </div>) })}
        </div>
        <details className="mt-4 rounded-xl border border-zinc-200 px-4 py-2.5"><summary className="cursor-pointer text-sm font-semibold">Fonte identificada em cada thumbnail ({THUMB_REF_FONTS.length} com texto)</summary>
          <ul className="mt-3 space-y-1.5 text-xs" data-testid="ref-fonts">{THUMB_REF_FONTS.map((r) => <li key={r.ref}><b>{r.ref}</b> <span className="text-zinc-400">[{r.categories.join('/')}]</span> → <b>{r.font}</b> — {r.style}</li>)}</ul>
        </details>
      </section>

      {a && (
        <section className="card p-5 sm:p-6" data-testid="thumb-analysis">
          <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">O que a IA aprendeu com as suas thumbnails</h3>
          {a.general?.summary && <p className="mb-4 text-sm text-zinc-700">{a.general.summary}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            {([['Composição', a.general?.composition], ['Rostos', a.general?.faces], ['Cor e saturação', a.general?.color], ['Política de texto', a.general?.text_policy], ['Fundos', a.general?.backgrounds], ['Efeitos', a.general?.effects]] as const).filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><p className="label">{k}</p><p className="text-sm text-zinc-700">{v}</p></div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {a.general?.do?.length ? <div><p className="label">Sempre</p><ul className="space-y-1">{a.general.do.map((x) => <li key={x} className="rounded-xl bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900">{x}</li>)}</ul></div> : null}
            {a.general?.dont?.length ? <div><p className="label">Nunca</p><ul className="space-y-1">{a.general.dont.map((x) => <li key={x} className="rounded-xl bg-brand-soft px-3 py-1.5 text-sm text-red-900">{x}</li>)}</ul></div> : null}
          </div>
          <div className="mt-5 space-y-2">
            {Object.entries(a.categories ?? {}).map(([id, c]) => (
              <details key={id} className="rounded-xl border border-zinc-200 px-4 py-2.5"><summary className="cursor-pointer text-sm font-semibold">{THUMB_CATEGORIES.find((x) => x.id === id)?.label ?? id}{c.count ? <span className="ml-2 text-xs font-normal text-zinc-500">{c.count} referências</span> : null}</summary>
                <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm text-zinc-700">
                  {([['Resumo', c.summary], ['Composição', c.composition], ['Personagem', c.character], ['Expressão', c.expression], ['Cenário e luz', c.scene], ['Paleta', c.palette], ['Texto', c.text], ['Lettering (tipografia)', c.typography], ['Esqueleto de composição', c.layout], ['Objetos', c.props], ['Lógica dos objetos', c.object_logic], ['Realismo', c.realism]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k}><p className="label">{k}</p><p>{v}</p></div>)}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      <section className="card space-y-4 p-5 sm:p-6">
        <div>
          <h3 className="font-display text-[15px] font-semibold tracking-tight">Skill do criador de thumbnails</h3>
          <p className="mt-0.5 text-xs text-zinc-500">A skill já vem pronta, escrita a partir da análise de 44 thumbnails reais: princípios, quando usar ou não texto, posição do personagem, expressões, fundos, efeitos, processo de ideação, checklist e um manual por categoria. Você pode somar regras suas.</p>
        </div>
        <SkillView title="Skill · Diretor de thumbnails virais" text={THUMB_SKILL} />
        <SkillView title="Manuais das categorias (aventura, dinheiro, trader, vendas, tech, educação, documentário, games, viral, lista, lifestyle, esporte)" text={THUMB_CATEGORIES.map((c) => `## ${c.label}\n${c.playbook}`).join('\n\n')} />
        {brand.thumb_skill_doc && <SkillView title={`Documento treinado · ${brand.is_base ? 'agência' : brand.name} v${brand.thumb_skill_version}`} text={brand.thumb_skill_doc} />}
        {!brand.is_base && (
          <div>
            <p className="label">Regras extras só deste canal</p>
            <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: o rosto do dono sempre à direita; paleta verde e preta; nunca usar vermelho." data-testid="thumb-notes" />
            <button className="btn-outline btn-sm mt-2" onClick={saveNotes}><Save className="h-3.5 w-3.5" />Salvar regras do canal</button>
          </div>
        )}
        {isAdmin && (
          <div>
            <p className="label">Regras extras da agência para criar thumbnails</p>
            <textarea className="input" rows={3} value={rules} onChange={(e) => setRules(e.target.value)} placeholder="Ex.: sempre dar uma opção sem texto; evitar setas vermelhas." data-testid="thumb-rules" />
            <button className="btn-outline btn-sm mt-2" onClick={saveRules}><Save className="h-3.5 w-3.5" />Salvar regras da agência</button>
          </div>
        )}
      </section>
    </div>
  )
}
