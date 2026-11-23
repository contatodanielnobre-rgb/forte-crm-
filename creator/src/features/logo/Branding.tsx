import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Download, FileText, Grid2x2, ImagePlus, Layers, Plus, RefreshCcw, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { cn, errMsg } from '@/lib/utils'
import { Modal, Spinner } from '@/components/ui'
import { signedUrl } from '@/lib/storage'
import { COST_ASSUMPTIONS, fmtBrl, getRate, imageCost, BUCKET_STUDIO } from '@/features/studio/catalog'
import { useModels } from '@/features/studio/data'
import { StudioImg } from '@/features/studio/ui'
import { makeZip } from '@/features/studio/zip'
import type { Brand } from '@/features/studio/types'
import { VARIANT_LABEL } from './catalog'
import { canvasBlob, composeLogo, defaultLayout, detectCuts, fetchImage, isHex, luminance, originalColorway, splitParts } from './engine'
import { useLogoModel } from './Canvas'
import { buildBrandingPdf } from './pdf'
import { createBrandings, deleteBranding, invalidateLogo, planBranding, regenBranding, saveProjectBranding, setBrandingApproved, uploadVariant } from './data'
import type { LogoBranding, LogoProject, LogoVersion, Scene } from './types'
import { downloadBlob, slug, uniq } from './util'

interface Plan extends Scene { id: string; on: boolean }
const ASPECTS: Scene['aspect'][] = ['1:1', '4:5', '16:9', '9:16']

const loadStudioImage = async (path: string) => fetchImage(await signedUrl(path, undefined, BUCKET_STUDIO))

/** Mosaico: várias cenas numa só imagem (grade 2×2, 3×2 ou 3×3), cada uma recortada ao centro */
export async function buildMosaic(imgs: (HTMLImageElement | HTMLCanvasElement)[], cols: number, rows: number, opts: { cell?: number; gap?: number; bg?: string } = {}) {
  const cell = opts.cell ?? 1080, gap = opts.gap ?? 16, bg = opts.bg ?? '#FFFFFF'
  const cv = document.createElement('canvas'); cv.width = cols * cell + gap * (cols + 1); cv.height = rows * cell + gap * (rows + 1)
  const ctx = cv.getContext('2d')!; ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height); ctx.imageSmoothingQuality = 'high'
  imgs.slice(0, cols * rows).forEach((im, i) => {
    const w = (im as HTMLImageElement).naturalWidth || im.width, h = (im as HTMLImageElement).naturalHeight || im.height
    const s = Math.max(cell / w, cell / h), sw = cell / s, sh = cell / s
    const x = gap + (i % cols) * (cell + gap), y = gap + Math.floor(i / cols) * (cell + gap)
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, cell, cell, 14); ctx.clip()
    ctx.drawImage(im, (w - sw) / 2, (h - sh) / 2, sw, sh, x, y, cell, cell); ctx.restore()
  })
  return cv
}

export default function Branding({ project, version, brand, brandings, onClose }: { project: LogoProject; version: LogoVersion; brand: Brand; brandings: LogoBranding[]; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: models } = useModels()
  const { model } = useLogoModel(version.storage_path)
  const [plan, setPlan] = useState<Plan[]>([])
  const [intro, setIntro] = useState('')
  const [planning, setPlanning] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [pick, setPick] = useState<string[]>([])
  const [mosaic, setMosaic] = useState<{ url: string; blob: Blob; n: number } | null>(null)
  const [outBusy, setOutBusy] = useState<string | null>(null)
  const [cols, setCols] = useState<'2x2' | '3x2' | '3x3'>('2x2')

  const palette = useMemo(() => uniq([...(version.edit?.palette ?? []), ...(project.form.colors ?? []), ...(brand.colors ?? []).map((c) => c.hex)].filter(isHex).map((c) => c.toUpperCase())).slice(0, 6), [version, project, brand])
  const gm = models?.find((m) => m.id === project.model_id)
  const unit = gm ? imageCost(gm.api_model, project.quality, COST_ASSUMPTIONS, true) : null
  const done = brandings.filter((b) => b.status === 'done' && b.storage_path)
  const approved = done.filter((b) => b.approved)
  const chosen = plan.filter((p) => p.on)

  const doPlan = async () => {
    setPlanning(true)
    try {
      const r = await planBranding(project.id, palette, 12)
      setPlan(r.scenes.map((s) => ({ ...s, id: crypto.randomUUID(), on: true })).map((s, i) => ({ ...s, on: i < 8 })))
      setIntro(r.intro)
      await saveProjectBranding(project.id, { ...project.branding, palette, intro: r.intro }).catch(() => null)
      if (r.demo) toast.message('Plano simulado: conecte a OpenAI para a IA adaptar as cenas ao segmento.')
    } catch (e) { toast.error(errMsg(e)) } finally { setPlanning(false) }
  }

  /** Versão da logo certa para cada cena: branca em fundo escuro, preta em fundo claro, só o símbolo… (geradas aqui, sem IA) */
  const variantPath = async (variant: Scene['variant'], cache: Map<string, string>): Promise<string | null> => {
    if (variant === 'color') return null
    if (cache.has(variant)) return cache.get(variant)!
    if (!model) throw new Error('A logo ainda está sendo preparada. Tente de novo em instantes.')
    const cuts = version.edit?.cuts ?? detectCuts(model)
    const layout = { ...defaultLayout(), ...(version.edit?.layout ?? {}) }
    const mono = (c: string, bg: string) => ({ name: variant, bg, map: model.palette.map(() => c) })
    let cv: HTMLCanvasElement
    if (variant === 'white') cv = await composeLogo(model, cuts, layout, mono('#FFFFFF', '#1B1B1B'), { long: 1024 })
    else if (variant === 'black') cv = await composeLogo(model, cuts, layout, mono('#111111', '#FFFFFF'), { long: 1024 })
    else cv = await composeLogo(model, cuts, { ...layout, arrange: splitParts(model, cuts).symbol ? 'symbol' : layout.arrange }, originalColorway(model), { long: 1024 })
    const path = await uploadVariant(project, variant, await canvasBlob(cv))
    cache.set(variant, path); return path
  }

  const generate = async () => {
    if (!chosen.length) return toast.error('Marque ao menos uma cena.')
    setGenerating(true)
    try {
      const cache = new Map<string, string>(); const list: (Scene & { logoPath: string | null })[] = []
      for (const s of chosen) list.push({ key: s.key, title: s.title, scene: s.scene, aspect: s.aspect, variant: s.variant, category: s.category, logoPath: await variantPath(s.variant, cache) })
      setPlan([])
      await createBrandings(project, version, list, qc)
    } catch (e) { toast.error(errMsg(e)) } finally { setGenerating(false); invalidateLogo(qc, 'brandings', project.id) }
  }

  const toggleApprove = async (b: LogoBranding) => { try { await setBrandingApproved(b, !b.approved); invalidateLogo(qc, 'brandings', project.id) } catch (e) { toast.error(errMsg(e)) } }
  const togglePick = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const [cc, rr] = cols.split('x').map(Number)
  const need = cc * rr

  const makeMosaic = async () => {
    const ids = pick.length ? pick : (approved.length >= need ? approved : done).slice(0, need).map((b) => b.id)
    if (ids.length < need) return toast.error(`Escolha ${need} cenas prontas para este mosaico (marque nos cartões).`)
    setOutBusy('mosaic')
    try {
      const imgs = await Promise.all(ids.slice(0, need).map(async (id) => loadStudioImage(done.find((b) => b.id === id)!.storage_path!)))
      const cv = await buildMosaic(imgs, cc, rr)
      const blob = await canvasBlob(cv)
      setMosaic({ url: URL.createObjectURL(blob), blob, n: need })
    } catch (e) { toast.error(errMsg(e)) } finally { setOutBusy(null) }
  }

  const makePdf = async () => {
    const list = approved.length ? approved : done
    if (!list.length) return toast.error('Gere ao menos uma cena antes de montar o PDF.')
    if (!model) return toast.error('A logo ainda está sendo preparada.')
    setOutBusy('pdf')
    try {
      const cuts = version.edit?.cuts ?? detectCuts(model)
      const layout = { ...defaultLayout(), ...(version.edit?.layout ?? {}) }
      const mono = (c: string, bg: string) => ({ name: 'x', bg, map: model.palette.map(() => c) })
      const [logoLight, logoDark] = await Promise.all([composeLogo(model, cuts, layout, originalColorway(model), { long: 1100 }), composeLogo(model, cuts, layout, mono('#FFFFFF', 'transparent'), { long: 1100 })])
      // versões com fundo transparente ganham um fundo que apareça no PDF (claro para logo escura, escuro para logo clara)
      const flat = (c: { bg: string; map: string[] }) => (c.bg !== 'transparent' ? c.bg : luminance(c.map[0] ?? '#111111') > 0.6 ? '#1B1B1B' : '#FFFFFF')
      const variants = await Promise.all((version.edit?.kit ?? []).slice(0, 6).map(async (k) => ({ name: k.name, canvas: await composeLogo(model, cuts, k.layout, { ...k.colorway, bg: flat(k.colorway) }, { long: 600 }) })))
      const scenes = await Promise.all(list.map(async (b) => ({ title: b.title, img: await loadStudioImage(b.storage_path!) })))
      const blob = await buildBrandingPdf({ company: project.form.company, segment: project.form.segment, positioning: project.positioning ?? '', palette: palette.length ? palette : model.palette, date: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), logoLight, logoDark, variants, scenes, fonts: project.inspect ? [project.inspect.font.family] : undefined })
      downloadBlob(blob, `${slug(project.name)}-apresentacao-de-marca.pdf`)
      toast.success('PDF pronto')
    } catch (e) { toast.error(errMsg(e)) } finally { setOutBusy(null) }
  }

  const zipAll = async () => {
    if (!done.length) return
    setOutBusy('zip')
    try {
      const files = await Promise.all(done.map(async (b, i) => ({ name: `${String(i + 1).padStart(2, '0')}-${slug(b.title)}.${b.storage_path!.endsWith('.svg') ? 'svg' : 'png'}`, blob: await (await fetch(await signedUrl(b.storage_path!, undefined, BUCKET_STUDIO))).blob() })))
      downloadBlob(await makeZip(files), `${slug(project.name)}-branding.zip`)
    } catch (e) { toast.error(errMsg(e)) } finally { setOutBusy(null) }
  }

  return (
    <section className="card space-y-5 p-5 sm:p-6" data-testid="branding">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white"><Sparkles className="h-4 w-4" /></span>
          <div><h3 className="font-display text-[15px] font-semibold tracking-tight">Ver em branding</h3><p className="mt-0.5 max-w-2xl text-xs text-zinc-500">O diretor de branding aplica a logo aprovada em situações reais do segmento ({project.form.segment || 'da empresa'}): fachada, uniforme, papelaria, placas, embalagens… Escolha as cenas, aprove as que gostar e monte o PDF ou um mosaico.</p></div>
        </div>
        <button type="button" className="btn-ghost btn-sm" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></button>
      </div>

      {/* 1 · cenas */}
      {plan.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-5 text-center">
          <p className="text-sm text-zinc-600">{brandings.length ? 'Quer mais cenas para o material?' : 'Comece deixando a IA planejar as cenas certas para este segmento.'}</p>
          <button type="button" className="btn-brand mt-3" onClick={doPlan} disabled={planning} data-testid="branding-plan">{planning ? <><Spinner className="h-4 w-4 text-white" />Planejando as cenas…</> : <><Layers className="h-4 w-4" />{brandings.length ? 'Planejar mais cenas' : 'Planejar as cenas'}</>}</button>
        </div>
      )}
      {plan.length > 0 && (
        <div className="space-y-3" data-testid="branding-plan-list">
          {intro && <p className="rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600">{intro}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {plan.map((s) => (
              <div key={s.id} className={cn('rounded-2xl border p-3 transition', s.on ? 'border-ink bg-white' : 'border-zinc-200 bg-zinc-50 opacity-70')} data-testid="scene-card">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={s.on} aria-label="Gerar esta cena" onChange={(e) => setPlan((p) => p.map((x) => (x.id === s.id ? { ...x, on: e.target.checked } : x)))} />
                  <input className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-sm font-semibold hover:border-zinc-200 focus:border-ink focus:outline-none" value={s.title} onChange={(e) => setPlan((p) => p.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))} aria-label="Título da cena" />
                  <button type="button" aria-label="Remover cena" className="text-zinc-400 hover:text-red-600" onClick={() => setPlan((p) => p.filter((x) => x.id !== s.id))}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <textarea className="input mt-2 text-xs" rows={3} value={s.scene} onChange={(e) => setPlan((p) => p.map((x) => (x.id === s.id ? { ...x, scene: e.target.value } : x)))} aria-label="Descrição da cena" />
                <div className="mt-2 flex gap-2">
                  <select className="input h-8 flex-1 text-xs" value={s.aspect} onChange={(e) => setPlan((p) => p.map((x) => (x.id === s.id ? { ...x, aspect: e.target.value as Scene['aspect'] } : x)))} aria-label="Proporção">{ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}</select>
                  <select className="input h-8 flex-[2] text-xs" value={s.variant} onChange={(e) => setPlan((p) => p.map((x) => (x.id === s.id ? { ...x, variant: e.target.value as Scene['variant'] } : x)))} aria-label="Versão da logo">{Object.entries(VARIANT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-outline btn-sm" onClick={() => setPlan((p) => [...p, { id: crypto.randomUUID(), on: true, key: `extra-${p.length + 1}`, title: 'Cena personalizada', scene: 'Descreva o ambiente, o objeto e onde a logo aparece.', aspect: '4:5', variant: 'color', category: 'objeto' }])}><Plus className="h-3.5 w-3.5" />Adicionar cena</button>
            <button type="button" className="btn-brand" onClick={generate} disabled={generating || !chosen.length} data-testid="branding-generate">{generating ? <><Spinner className="h-4 w-4 text-white" />Preparando…</> : <><ImagePlus className="h-4 w-4" />Gerar {chosen.length} cena(s)</>}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setPlan([])}>Cancelar</button>
            <span className="text-xs text-zinc-500">{unit ? <>≈ <b className="text-ink">{fmtBrl(unit.total * chosen.length, getRate())}</b> ({chosen.length} imagens)</> : ''}</span>
          </div>
        </div>
      )}

      {/* 2 · cenas geradas */}
      {brandings.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-display text-sm font-semibold">Cenas ({done.length}/{brandings.length} prontas · {approved.length} aprovada(s))</h4>
            <p className="text-xs text-zinc-500">Aprove as boas (✓). Marque (▢) as que vão para o mosaico.</p>
          </div>
          <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="branding-grid">
            {brandings.map((b) => <SceneCard key={b.id} b={b} project={project} picked={pick.includes(b.id)} onPick={() => togglePick(b.id)} onApprove={() => toggleApprove(b)} qc={qc} />)}
          </div>
        </div>
      )}

      {/* 3 · saídas */}
      {done.length > 0 && (
        <div className="rounded-2xl bg-zinc-50 p-4" data-testid="branding-outputs">
          <h4 className="mb-1 font-display text-sm font-semibold">Montar o material</h4>
          <p className="mb-3 text-xs text-zinc-500">O PDF usa as cenas aprovadas (ou todas, se nenhuma foi aprovada). O mosaico junta {need} cenas numa só imagem.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary" onClick={makePdf} disabled={!!outBusy} data-testid="branding-pdf">{outBusy === 'pdf' ? <Spinner className="h-4 w-4 text-white" /> : <FileText className="h-4 w-4" />}PDF de apresentação</button>
            <span className="mx-1 hidden h-6 w-px bg-zinc-300 sm:block" />
            <select className="input h-9 w-auto text-sm" value={cols} onChange={(e) => setCols(e.target.value as typeof cols)} aria-label="Grade do mosaico"><option value="2x2">Mosaico 2×2 (4 cenas)</option><option value="3x2">Mosaico 3×2 (6 cenas)</option><option value="3x3">Mosaico 3×3 (9 cenas)</option></select>
            <button type="button" className="btn-primary" onClick={makeMosaic} disabled={!!outBusy} data-testid="branding-mosaic">{outBusy === 'mosaic' ? <Spinner className="h-4 w-4 text-white" /> : <Grid2x2 className="h-4 w-4" />}Montar mosaico{pick.length ? ` (${pick.length}/${need})` : ''}</button>
            <button type="button" className="btn-outline" onClick={zipAll} disabled={!!outBusy}><Download className="h-4 w-4" />Baixar todas (ZIP)</button>
          </div>
        </div>
      )}

      {mosaic && (
        <Modal open onClose={() => { URL.revokeObjectURL(mosaic.url); setMosaic(null) }} size="lg" title="Mosaico de branding" subtitle={`${mosaic.n} cenas em uma imagem`}
          footer={<button className="btn-primary" data-testid="mosaic-download" onClick={() => downloadBlob(mosaic.blob, `${slug(project.name)}-mosaico.png`)}><Download className="h-4 w-4" />Baixar PNG</button>}>
          <img src={mosaic.url} alt="Mosaico de branding" className="mx-auto max-h-[68vh] rounded-xl" data-testid="mosaic-img" />
        </Modal>
      )}
    </section>
  )
}

function SceneCard({ b, project, picked, onPick, onApprove, qc }: { b: LogoBranding; project: LogoProject; picked: boolean; onPick: () => void; onApprove: () => void; qc: ReturnType<typeof useQueryClient> }) {
  const [fb, setFb] = useState(''); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false)
  const working = b.status === 'queued' || b.status === 'running'
  const ratio = b.aspect === '16:9' ? 'aspect-video' : b.aspect === '9:16' ? 'aspect-[9/16]' : b.aspect === '1:1' ? 'aspect-square' : 'aspect-[4/5]'
  const regen = async (feedback?: string) => { setBusy(true); try { await regenBranding(b, project, qc, feedback); setOpen(false); setFb('') } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) } }
  const dl = async () => { try { downloadBlob(await (await fetch(await signedUrl(b.storage_path!, undefined, BUCKET_STUDIO))).blob(), `${slug(project.name)}-${slug(b.title)}.${b.storage_path!.endsWith('.svg') ? 'svg' : 'png'}`) } catch (e) { toast.error(errMsg(e)) } }
  return (
    <article className={cn('overflow-hidden rounded-2xl border bg-white shadow-card', b.approved ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-zinc-200')} data-testid="branding-card" data-status={b.status} data-approved={b.approved}>
      <div className="relative">
        {b.status === 'done' && b.storage_path ? <StudioImg path={b.storage_path} className={ratio} />
          : <div className={cn('flex flex-col items-center justify-center gap-2 bg-zinc-50 p-4 text-center text-xs text-zinc-500', ratio)}>{working ? <><Spinner className="h-5 w-5" />{b.status === 'queued' ? 'Na fila…' : 'Criando a cena…'}</> : <span className="text-brand">{b.error ?? 'Não foi possível gerar.'}</span>}</div>}
        {b.status === 'done' && <button type="button" onClick={onPick} aria-label="Marcar para o mosaico" aria-pressed={picked} data-testid="scene-pick" className={cn('absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border-2 transition', picked ? 'border-brand bg-brand text-white' : 'border-white/80 bg-black/25 text-transparent hover:text-white')}><Check className="h-3.5 w-3.5" /></button>}
      </div>
      <div className="space-y-2 p-2.5">
        <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{b.title}</p><span className="shrink-0 text-[10px] text-zinc-400">{VARIANT_LABEL[b.variant]}</span></div>
        <div className="flex flex-wrap gap-1.5">
          {b.status === 'done' && <button type="button" className={cn('btn-sm', b.approved ? 'btn-primary' : 'btn-outline')} onClick={onApprove} data-testid="scene-approve"><Check className="h-3.5 w-3.5" />{b.approved ? 'Aprovada' : 'Aprovar'}</button>}
          <button type="button" className="btn-outline btn-sm" disabled={working || busy} onClick={() => (b.status === 'error' ? regen() : setOpen((o) => !o))} data-testid="scene-redo">{b.status === 'error' ? <><RefreshCcw className="h-3.5 w-3.5" />Tentar de novo</> : <><Wand2 className="h-3.5 w-3.5" />Refazer</>}</button>
          {b.status === 'done' && <button type="button" className="btn-outline btn-sm !px-2" aria-label="Baixar" onClick={dl}><Download className="h-3.5 w-3.5" /></button>}
          <button type="button" className="btn-ghost btn-sm !px-2 text-red-600" aria-label="Excluir cena" onClick={async () => { await deleteBranding(b); invalidateLogo(qc, 'brandings', project.id) }}><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
        {open && (
          <div className="space-y-1.5">
            <textarea className="input text-xs" rows={2} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="O que mudar? (vazio = outra versão da mesma cena)" data-testid="scene-feedback" />
            <button type="button" className="btn-brand btn-sm" disabled={busy} onClick={() => regen(fb.trim() || undefined)} data-testid="scene-regen">{busy ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Sparkles className="h-3.5 w-3.5" />}Refazer a cena</button>
          </div>
        )}
      </div>
    </article>
  )
}
