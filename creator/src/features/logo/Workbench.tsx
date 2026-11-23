import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Archive, Check, Download, Layers, LayoutTemplate, Palette, Plus, RotateCcw, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { cn, errMsg } from '@/lib/utils'
import { Spinner } from '@/components/ui'
import FontPicker from '@/features/studio/FontPicker'
import { makeZip } from '@/features/studio/zip'
import type { Brand } from '@/features/studio/types'
import {
  buildColorways, canvasBlob, composeLogo, cutsKey, defaultLayout, defaultSlogan, detectCuts, isHex, layoutKey, layoutPresets, originalColorway, originalGap, paintRegion, splitParts,
  type Colorway, type Cuts, type Layout, type LogoModel,
} from './engine'
import { CanvasView, Carousel, Swatch, useLogoModel } from './Canvas'
import { saveVersionEdit } from './data'
import type { KitItem, LogoEdit, LogoProject, LogoVersion } from './types'
import { downloadBlob, sameJson, slug, uniq } from './util'

type Tab = 'cores' | 'layout' | 'kit'
const norm = (h: string) => (isHex(h) ? h.toUpperCase() : h)

function Range({ label, value, min, max, step, onChange, fmt, testid }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string; testid?: string }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs"><span className="font-semibold text-zinc-600">{label}</span><span className="tabular text-zinc-500">{fmt ? fmt(value) : value}</span></span>
      <input type="range" className="w-full accent-[#111]" min={min} max={max} step={step} value={value} data-testid={testid} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

function ColorPick({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="relative inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg ring-1 ring-black/10" title={label}>
      <span className="absolute inset-0" style={{ background: value === 'transparent' ? 'repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 50% / 10px 10px' : value }} />
      <input type="color" aria-label={label} value={isHex(value) ? value.toLowerCase() : '#ffffff'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  )
}

function Chip({ active, onClick, children, testid }: { active?: boolean; onClick: () => void; children: React.ReactNode; testid?: string }) {
  return <button type="button" data-testid={testid} onClick={onClick} aria-pressed={active} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition', active ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 hover:text-ink')}>{children}</button>
}

const useRender = (model: LogoModel | null) => (cuts: Cuts, layout: Layout, cw: Colorway, long: number) => composeLogo(model!, cuts, layout, cw, { long })

export default function Workbench({ project, version, brand, onBranding }: { project: LogoProject; version: LogoVersion; brand: Brand; onBranding: () => void }) {
  const { model, error, loading } = useLogoModel(version.storage_path)
  const [tab, setTab] = useState<Tab>('cores')
  const [ready, setReady] = useState(false)
  const [cuts, setCuts] = useState<Cuts>({ axis: null, pos: 0, symbolFirst: true, sloganY: null })
  const [layout, setLayout] = useState<Layout>(defaultLayout())
  const [cw, setCw] = useState<Colorway>({ name: 'Original', bg: '#FFFFFF', map: [] })
  const [palette, setPalette] = useState<string[]>([])
  const [kit, setKit] = useState<KitItem[]>([])
  const [showColors, setShowColors] = useState(false)
  const [busy, setBusy] = useState(false)
  const render = useRender(model)

  // inicia o painel quando a logo é decomposta (usa o que já foi salvo nesta versão)
  useEffect(() => {
    if (!model) return
    const saved: LogoEdit = version.edit ?? {}
    const c = saved.cuts ?? detectCuts(model)
    const ins = project.inspect
    setCuts(c)
    setLayout(saved.layout ?? { ...defaultLayout(), gap: originalGap(model, c), slogan: { ...defaultSlogan(), text: project.form.slogan ?? '', font: ins?.slogan_font.family ?? 'Montserrat', weight: ins?.slogan_font.weight ?? 500 } })
    setCw(saved.colorway ?? originalColorway(model))
    setPalette(saved.palette ?? uniq([...(brand.colors ?? []).map((x) => x.hex), ...(project.form.colors ?? []), ...model.palette].filter(isHex).map(norm)).slice(0, 8))
    setKit(saved.kit ?? [])
    setShowColors(false); setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, version.id])

  // salva sozinho (o que você ajustou volta quando abrir de novo)
  const first = useRef(true)
  useEffect(() => {
    if (!ready) return
    if (first.current) { first.current = false; return }
    const t = setTimeout(() => { saveVersionEdit(version.id, { cuts, layout, colorway: cw, palette, kit }).catch(() => null) }, 900)
    return () => clearTimeout(t)
  }, [ready, cuts, layout, cw, palette, kit, version.id])
  useEffect(() => { first.current = true; setReady(false) }, [version.id])

  const parts = useMemo(() => (model ? splitParts(model, cuts) : {}), [model, cuts])
  const base = slug(project.name)
  const exportPng = async (l: Layout, c: Colorway, name: string, long = 2400) => downloadBlob(await canvasBlob(await composeLogo(model!, cuts, l, c, { long })), `${base}-${slug(name)}.png`)
  const kitHas = (l: Layout, c: Colorway) => kit.find((k) => sameJson(k.layout, l) && sameJson(k.colorway, c))
  const toggleKit = (l: Layout, c: Colorway, name: string) => {
    const hit = kitHas(l, c)
    setKit((k) => (hit ? k.filter((x) => x.id !== hit.id) : [...k, { id: crypto.randomUUID(), name, layout: l, colorway: c }]))
  }
  const layoutName = layoutPresetName(layout)

  if (error) return <div className="card p-6 text-sm text-brand" data-testid="wb-error">Não consegui abrir a logo para edição: {error}</div>
  if (loading || !model || !ready) return <div className="card flex items-center justify-center gap-2 p-10 text-sm text-zinc-500" data-testid="wb-loading"><Spinner className="h-4 w-4" />Preparando o painel de edição…</div>

  const tabs: { id: Tab; label: string; icon: typeof Palette; n?: number }[] = [{ id: 'cores', label: 'Cores', icon: Palette }, { id: 'layout', label: 'Layout', icon: LayoutTemplate }, { id: 'kit', label: 'Kit', icon: Archive, n: kit.length }]
  const hasSymbol = !!parts.symbol

  return (
    <section className="card p-5 sm:p-6" data-testid="workbench">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white"><Wand2 className="h-4 w-4" /></span>
          <div><h3 className="font-display text-[15px] font-semibold tracking-tight">Editor da logo aprovada</h3><p className="mt-0.5 max-w-xl text-xs text-zinc-500">Troca cores, posições e tamanhos direto na arte aprovada, como num editor de imagem: <b>a mesma logo exata</b>, sem gastar geração de IA.</p></div>
        </div>
        <button type="button" className="btn-brand" onClick={onBranding} data-testid="open-branding"><Sparkles className="h-4 w-4" />Ver em branding</button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="space-y-3">
          <CanvasView className={cn('aspect-[4/3] w-full rounded-2xl border border-zinc-200', cw.bg === 'transparent' ? 'bg-checker' : '')} make={() => render(cuts, layout, cw, 1000)} deps={[model, cutsKey(cuts), layoutKey(layout), JSON.stringify(cw)]} checker={cw.bg === 'transparent'} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary btn-sm" data-testid="wb-download" onClick={async () => { try { await exportPng(layout, cw, `${layoutName}-${cw.name}`) } catch (e) { toast.error(errMsg(e)) } }}><Download className="h-3.5 w-3.5" />Baixar PNG</button>
            <button type="button" className={cn('btn-outline btn-sm', kitHas(layout, cw) && 'border-emerald-300 bg-emerald-50 text-emerald-800')} data-testid="wb-add-kit" onClick={() => toggleKit(layout, cw, `${layoutName} · ${cw.name}`)}>{kitHas(layout, cw) ? <><Check className="h-3.5 w-3.5" />No kit</> : <><Plus className="h-3.5 w-3.5" />Adicionar ao kit</>}</button>
            <span className="ml-auto text-[11px] text-zinc-500">{cw.name}</span>
          </div>
        </div>

        <div>
          <div className="mb-3 flex gap-1 rounded-2xl border border-zinc-200 bg-zinc-50 p-1">
            {tabs.map((t) => <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`wb-tab-${t.id}`} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition', tab === t.id ? 'bg-ink text-white shadow-sm' : 'text-zinc-500 hover:text-ink')}><t.icon className="h-4 w-4" />{t.label}{!!t.n && <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{t.n}</span>}</button>)}
          </div>

          {tab === 'cores' && <ColorsTab model={model} palette={palette} setPalette={setPalette} cw={cw} setCw={setCw} brandColors={(brand.colors ?? []).map((c) => c.hex).filter(isHex)} />}
          {tab === 'layout' && <LayoutTab model={model} cuts={cuts} setCuts={setCuts} layout={layout} setLayout={setLayout} hasSymbol={hasSymbol} hasSloganPart={!!parts.slogan} project={project} cw={cw} />}
          {tab === 'kit' && <KitTab model={model} cuts={cuts} kit={kit} setKit={setKit} base={base} busy={busy} setBusy={setBusy} layout={layout} cw={cw} palette={palette} />}
        </div>
      </div>

      {tab === 'cores' && (
        <div className="mt-6 border-t border-zinc-100 pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><h4 className="font-display text-sm font-semibold">Versões de cor</h4><p className="text-xs text-zinc-500">Gera o carrossel com a logo em branco, preto, colorida e nas cores que você escolheu, em fundos com bom contraste.</p></div>
            <button type="button" className="btn-brand btn-sm" data-testid="gen-colorways" onClick={() => setShowColors(true)}><Layers className="h-3.5 w-3.5" />{showColors ? 'Atualizar versões' : 'Gerar versões de cor'}</button>
          </div>
          {showColors && (
            <Carousel label="Versões de cor">
              {buildColorways(model, palette).map((v) => (
                <div key={v.bg + v.map.join()} className="w-[200px] shrink-0 snap-start" data-testid="colorway-tile">
                  <button type="button" onClick={() => setCw(v)} className={cn('block w-full overflow-hidden rounded-2xl border bg-white transition hover:shadow-card', sameJson(v, cw) ? 'border-ink ring-2 ring-ink/10' : 'border-zinc-200')} title="Usar esta versão">
                    <CanvasView className={cn('aspect-square w-full', v.bg === 'transparent' && 'bg-checker')} make={() => composeLogo(model, cuts, layout, v, { long: 420 })} deps={[model, cutsKey(cuts), layoutKey(layout), JSON.stringify(v)]} />
                  </button>
                  <p className="mt-1.5 line-clamp-2 min-h-[2rem] text-[11px] font-medium leading-tight text-zinc-600">{v.name}</p>
                  <div className="mt-1 flex gap-1">
                    <button type="button" className="btn-outline btn-sm !px-2" aria-label="Baixar" onClick={() => exportPng(layout, v, v.name).catch((e) => toast.error(errMsg(e)))}><Download className="h-3.5 w-3.5" /></button>
                    <button type="button" className={cn('btn-outline btn-sm flex-1 !px-2', kitHas(layout, v) && 'border-emerald-300 bg-emerald-50 text-emerald-800')} onClick={() => toggleKit(layout, v, `${layoutName} · ${v.name}`)}>{kitHas(layout, v) ? <><Check className="h-3.5 w-3.5" />Kit</> : <><Plus className="h-3.5 w-3.5" />Kit</>}</button>
                  </div>
                </div>
              ))}
            </Carousel>
          )}
        </div>
      )}

      {tab === 'layout' && (
        <div className="mt-6 border-t border-zinc-100 pt-5">
          <div className="mb-3"><h4 className="font-display text-sm font-semibold">Variações de layout</h4><p className="text-xs text-zinc-500">Mesmos desenhos, só reposicionados e redimensionados. Clique para aplicar e depois ajuste fino à direita.</p></div>
          <Carousel label="Variações de layout">
            {layoutPresets(model, cuts, layout).map((p) => (
              <div key={p.id} className="w-[200px] shrink-0 snap-start" data-testid="layout-tile">
                <button type="button" onClick={() => setLayout(p.layout)} className={cn('block w-full overflow-hidden rounded-2xl border bg-white transition hover:shadow-card', sameJson(p.layout, layout) ? 'border-ink ring-2 ring-ink/10' : 'border-zinc-200')} title="Aplicar este layout">
                  <CanvasView className={cn('aspect-square w-full', cw.bg === 'transparent' && 'bg-checker')} make={() => composeLogo(model, cuts, p.layout, cw, { long: 420 })} deps={[model, cutsKey(cuts), layoutKey(p.layout), JSON.stringify(cw)]} />
                </button>
                <p className="mt-1.5 text-[11px] font-medium text-zinc-600">{p.name}</p>
                <div className="mt-1 flex gap-1">
                  <button type="button" className="btn-outline btn-sm !px-2" aria-label="Baixar" onClick={() => exportPng(p.layout, cw, p.name).catch((e) => toast.error(errMsg(e)))}><Download className="h-3.5 w-3.5" /></button>
                  <button type="button" className={cn('btn-outline btn-sm flex-1 !px-2', kitHas(p.layout, cw) && 'border-emerald-300 bg-emerald-50 text-emerald-800')} onClick={() => toggleKit(p.layout, cw, `${p.name} · ${cw.name}`)}>{kitHas(p.layout, cw) ? <><Check className="h-3.5 w-3.5" />Kit</> : <><Plus className="h-3.5 w-3.5" />Kit</>}</button>
                </div>
              </div>
            ))}
          </Carousel>
        </div>
      )}
    </section>
  )
}

function layoutPresetName(l: Layout) {
  return ({ original: 'Original', stack: 'Símbolo em cima', row: 'Símbolo ao lado', row_rev: 'Símbolo à direita', symbol: 'Só símbolo', name: 'Só nome' } as Record<string, string>)[l.arrange] ?? 'Layout'
}

// ---------------------------------------------------------------------------------------------
function ColorsTab({ model, palette, setPalette, cw, setCw, brandColors }: { model: LogoModel; palette: string[]; setPalette: (p: string[]) => void; cw: Colorway; setCw: (c: Colorway) => void; brandColors: string[] }) {
  const [draft, setDraft] = useState('#E10600')
  const add = (c: string) => { const h = norm(c.startsWith('#') ? c : '#' + c); if (isHex(h) && !palette.includes(h)) setPalette([...palette, h].slice(0, 10)) }
  const setLayer = (i: number, c: string) => setCw({ ...cw, name: 'Personalizada', map: model.palette.map((p, j) => (j === i ? c : cw.map[j] ?? p)) })
  const swatches = uniq([...palette, '#111111', '#FFFFFF'])
  const missingBrand = brandColors.map(norm).filter((c) => !palette.includes(c))
  return (
    <div className="space-y-5" data-testid="colors-tab">
      <div>
        <p className="label">Cores da paleta <span className="font-normal normal-case text-zinc-400">(as versões automáticas usam estas)</span></p>
        <div className="flex flex-wrap items-center gap-2" data-testid="palette-chips">
          {palette.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white py-1 pl-1.5 pr-2 text-xs font-medium"><Swatch color={c} size={16} />{c}<button type="button" aria-label={`Remover ${c}`} onClick={() => setPalette(palette.filter((x) => x !== c))} className="text-zinc-400 hover:text-ink"><X className="h-3 w-3" /></button></span>
          ))}
          {!palette.length && <span className="text-xs text-zinc-500">Sem cores. Adicione abaixo.</span>}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <ColorPick value={draft} onChange={setDraft} label="Escolher cor" />
          <input className="input h-8 w-28 text-xs" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Código da cor" data-testid="palette-hex" />
          <button type="button" className="btn-outline btn-sm" onClick={() => add(draft)} data-testid="palette-add"><Plus className="h-3.5 w-3.5" />Adicionar</button>
        </div>
        {missingBrand.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">Cores da empresa: {missingBrand.map((c) => <button key={c} type="button" onClick={() => add(c)} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-1 hover:border-ink"><Swatch color={c} size={12} />{c}</button>)}</div>}
      </div>

      <div>
        <p className="label">Cor de cada parte da logo</p>
        <ul className="space-y-2" data-testid="layers">
          {model.palette.map((orig, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
              <span className="w-16 text-xs font-semibold text-zinc-500">Camada {i + 1}</span>
              <Swatch color={orig} size={18} /><span className="text-xs text-zinc-400">→</span>
              <ColorPick value={cw.map[i] ?? orig} onChange={(c) => setLayer(i, c)} label={`Cor da camada ${i + 1}`} />
              <div className="flex flex-wrap gap-1">{swatches.map((c) => <button key={c} type="button" aria-label={`Usar ${c}`} onClick={() => setLayer(i, c)} className={cn('rounded-md transition hover:scale-110', (cw.map[i] ?? orig).toUpperCase() === c.toUpperCase() && 'ring-2 ring-ink ring-offset-1')}><Swatch color={c} size={18} /></button>)}</div>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
          Tudo em uma cor:
          {swatches.map((c) => <button key={c} type="button" aria-label={`Tudo em ${c}`} onClick={() => setCw({ ...cw, name: `Uma cor ${c}`, map: model.palette.map(() => c) })} className="rounded-md transition hover:scale-110"><Swatch color={c} size={18} /></button>)}
          <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => setCw(originalColorway(model, cw.bg))}><RotateCcw className="h-3.5 w-3.5" />Cores originais</button>
        </div>
      </div>

      <div>
        <p className="label">Fundo</p>
        <div className="flex flex-wrap items-center gap-2" data-testid="bg-options">
          <Chip active={cw.bg === 'transparent'} onClick={() => setCw({ ...cw, bg: 'transparent' })} testid="bg-transparent">Transparente</Chip>
          <Chip active={cw.bg.toUpperCase() === '#FFFFFF'} onClick={() => setCw({ ...cw, bg: '#FFFFFF' })}>Branco</Chip>
          <Chip active={cw.bg.toUpperCase() === '#111111'} onClick={() => setCw({ ...cw, bg: '#111111' })}>Preto</Chip>
          {palette.map((c) => <button key={c} type="button" aria-label={`Fundo ${c}`} onClick={() => setCw({ ...cw, bg: c })} className={cn('rounded-md transition hover:scale-110', cw.bg.toUpperCase() === c.toUpperCase() && 'ring-2 ring-ink ring-offset-1')}><Swatch color={c} size={22} /></button>)}
          <ColorPick value={cw.bg} onChange={(c) => setCw({ ...cw, bg: c })} label="Outra cor de fundo" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
const ARRANGES: { id: Layout['arrange']; label: string }[] = [{ id: 'original', label: 'Como aprovada' }, { id: 'stack', label: 'Símbolo em cima' }, { id: 'row', label: 'Símbolo ao lado' }, { id: 'row_rev', label: 'Símbolo à direita' }, { id: 'symbol', label: 'Só o símbolo' }, { id: 'name', label: 'Só o nome' }]

function LayoutTab({ model, cuts, setCuts, layout, setLayout, hasSymbol, hasSloganPart, project, cw }: { model: LogoModel; cuts: Cuts; setCuts: (c: Cuts) => void; layout: Layout; setLayout: (l: Layout) => void; hasSymbol: boolean; hasSloganPart: boolean; project: LogoProject; cw: Colorway }) {
  const ink = model.ink
  const set = (p: Partial<Layout>) => setLayout({ ...layout, ...p })
  const setS = (p: Partial<Layout['slogan']>) => setLayout({ ...layout, slogan: { ...layout.slogan, ...p } })
  const [cutOpen, setCutOpen] = useState(false)
  const range = cuts.axis === 'x' ? [ink.x + 2, ink.x + ink.w - 2] : [ink.y + 2, ink.y + ink.h - 2]
  const ins = project.inspect
  return (
    <div className="space-y-5" data-testid="layout-tab">
      <div>
        <p className="label">Arranjo</p>
        <div className="flex flex-wrap gap-1.5">{ARRANGES.filter((a) => hasSymbol || !['stack', 'row', 'row_rev', 'symbol'].includes(a.id)).map((a) => <Chip key={a.id} active={layout.arrange === a.id} onClick={() => set({ arrange: a.id })} testid={`arrange-${a.id}`}>{a.label}</Chip>)}</div>
        {!hasSymbol && <p className="mt-2 text-xs text-zinc-500">Esta logo é só nome (nenhum símbolo separado foi encontrado). Se tiver símbolo, ajuste a divisão abaixo.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {hasSymbol && <Range label="Tamanho do símbolo" value={layout.symbolScale} min={0.2} max={2.5} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ symbolScale: v })} testid="rng-symbol" />}
        <Range label="Tamanho do nome" value={layout.nameScale} min={0.2} max={2.5} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ nameScale: v })} testid="rng-name" />
        {hasSymbol && <Range label="Distância entre símbolo e nome" value={layout.gap} min={0} max={2} step={0.05} fmt={(v) => v.toFixed(2)} onChange={(v) => set({ gap: v })} testid="rng-gap" />}
        <Range label="Respiro em volta" value={layout.pad} min={0} max={0.3} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ pad: v })} />
      </div>
      <div>
        <p className="label">Alinhamento</p>
        <div className="flex gap-1.5">{([['start', 'Início'], ['center', 'Centro'], ['end', 'Fim']] as const).map(([id, l]) => <Chip key={id} active={layout.align === id} onClick={() => set({ align: id })}>{l}</Chip>)}</div>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-3.5">
        <p className="label">Slogan</p>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={layout.slogan.mode === 'keep'} onClick={() => setS({ mode: 'keep' })} testid="slogan-keep">Manter o da logo{hasSloganPart ? '' : ' (não tem)'}</Chip>
          <Chip active={layout.slogan.mode === 'custom'} onClick={() => setS({ mode: 'custom' })} testid="slogan-custom">Colocar / trocar texto</Chip>
          <Chip active={layout.slogan.mode === 'none'} onClick={() => setS({ mode: 'none' })} testid="slogan-none">Sem slogan</Chip>
        </div>
        {layout.slogan.mode === 'custom' && (
          <div className="mt-3 space-y-3">
            <input className="input" value={layout.slogan.text} onChange={(e) => setS({ text: e.target.value })} placeholder="Digite o slogan" data-testid="slogan-text" />
            <div>
              <p className="label">Fonte do slogan</p>
              <FontPicker value={[layout.slogan.font]} max={2} placeholder="Buscar fonte…" onChange={(v) => { const f = v[v.length - 1]; if (f) setS({ font: f }) }} />
              {ins && <button type="button" className="mt-1.5 text-xs font-semibold text-brand hover:underline" onClick={() => setS({ font: ins.slogan_font.family, weight: ins.slogan_font.weight })}>Usar a fonte mais parecida com a da logo: {ins.slogan_font.family}</button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Range label="Tamanho" value={layout.slogan.scale} min={0.5} max={2.5} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setS({ scale: v })} />
              <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Peso</span><select className="input h-9" value={layout.slogan.weight} onChange={(e) => setS({ weight: Number(e.target.value) })}>{[300, 400, 500, 600, 700, 800].map((w) => <option key={w} value={w}>{w}</option>)}</select></label>
              <Range label="Espaço entre letras" value={layout.slogan.tracking} min={0} max={0.8} step={0.02} fmt={(v) => v.toFixed(2)} onChange={(v) => setS({ tracking: v, fit: false })} />
              <div className="flex flex-col justify-end gap-1.5 text-xs">
                <label className="flex items-center gap-2"><input type="checkbox" checked={layout.slogan.fit} onChange={(e) => setS({ fit: e.target.checked })} />Ajustar à largura do nome</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={layout.slogan.upper} onChange={(e) => setS({ upper: e.target.checked })} />Caixa alta</label>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs"><span className="font-semibold text-zinc-600">Cor do slogan</span><Chip active={layout.slogan.color === 'auto'} onClick={() => setS({ color: 'auto' })}>Automática</Chip><ColorPick value={isHex(layout.slogan.color) ? layout.slogan.color : (cw.map[0] ?? '#111111')} onChange={(c) => setS({ color: c })} label="Cor do slogan" /></div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200">
        <button type="button" onClick={() => setCutOpen((v) => !v)} className="flex w-full items-center justify-between px-3.5 py-3 text-left text-sm font-semibold" aria-expanded={cutOpen} data-testid="cuts-toggle">
          <span>Ajustar a divisão da logo <span className="font-normal text-zinc-500">(símbolo · nome · slogan)</span></span><span className="text-zinc-400">{cutOpen ? '−' : '+'}</span>
        </button>
        {cutOpen && (
          <div className="space-y-3 border-t border-zinc-100 p-3.5" data-testid="cuts-panel">
            <p className="text-xs text-zinc-500">A IA acha sozinha onde termina o símbolo e começa o nome. Se errar, mova as linhas. Nada é redesenhado: só se decide qual pedaço da arte é o quê.</p>
            <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-xl border border-zinc-200 bg-white p-2">
              <CanvasView className="w-full" make={async () => { const c = document.createElement('canvas'); c.width = ink.w; c.height = ink.h; const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, ink.w, ink.h); x.drawImage(paintRegion(model, originalColorway(model), ink), 0, 0); return c }} deps={[model]} />
              <div className="pointer-events-none absolute inset-2">
                {cuts.axis === 'x' && <span className="absolute top-0 h-full w-0.5 bg-brand" style={{ left: `${((cuts.pos - ink.x) / ink.w) * 100}%` }} />}
                {cuts.axis === 'y' && <span className="absolute left-0 h-0.5 w-full bg-brand" style={{ top: `${((cuts.pos - ink.y) / ink.h) * 100}%` }} />}
                {cuts.sloganY != null && <span className="absolute left-0 h-0.5 w-full bg-sky-500" style={{ top: `${((cuts.sloganY - ink.y) / ink.h) * 100}%` }} />}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={cuts.axis === null} onClick={() => setCuts({ ...cuts, axis: null })}>Sem símbolo</Chip>
              <Chip active={cuts.axis === 'x'} onClick={() => setCuts({ ...cuts, axis: 'x', pos: cuts.axis === 'x' ? cuts.pos : Math.round(ink.x + ink.w * 0.3) })} testid="cut-x">Símbolo ao lado do nome</Chip>
              <Chip active={cuts.axis === 'y'} onClick={() => setCuts({ ...cuts, axis: 'y', pos: cuts.axis === 'y' ? cuts.pos : Math.round(ink.y + ink.h * 0.6) })} testid="cut-y">Símbolo acima do nome</Chip>
            </div>
            {cuts.axis && (
              <>
                <Range label="Linha vermelha: onde o símbolo termina" value={cuts.pos} min={range[0]} max={range[1]} step={1} fmt={() => ''} onChange={(v) => setCuts({ ...cuts, pos: v })} testid="cut-pos" />
                <div className="flex gap-1.5"><span className="mr-1 text-xs font-semibold text-zinc-600">O símbolo fica</span><Chip active={cuts.symbolFirst} onClick={() => setCuts({ ...cuts, symbolFirst: true })}>{cuts.axis === 'x' ? 'à esquerda' : 'em cima'}</Chip><Chip active={!cuts.symbolFirst} onClick={() => setCuts({ ...cuts, symbolFirst: false })}>{cuts.axis === 'x' ? 'à direita' : 'embaixo'}</Chip></div>
              </>
            )}
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={cuts.sloganY != null} data-testid="cut-slogan" onChange={(e) => setCuts({ ...cuts, sloganY: e.target.checked ? Math.round(ink.y + ink.h * 0.85) : null })} />A logo tem slogan embaixo do nome</label>
            {cuts.sloganY != null && <Range label="Linha azul: onde o slogan começa" value={cuts.sloganY} min={ink.y + 2} max={ink.y + ink.h - 2} step={1} fmt={() => ''} onChange={(v) => setCuts({ ...cuts, sloganY: v })} testid="cut-slogan-pos" />}
            <button type="button" className="btn-outline btn-sm" onClick={() => setCuts(detectCuts(model))}><RotateCcw className="h-3.5 w-3.5" />Detectar de novo</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
function KitTab({ model, cuts, kit, setKit, base, busy, setBusy, layout, cw, palette }: { model: LogoModel; cuts: Cuts; kit: KitItem[]; setKit: (k: KitItem[]) => void; base: string; busy: boolean; setBusy: (b: boolean) => void; layout: Layout; cw: Colorway; palette: string[] }) {
  const zip = async () => {
    if (!kit.length) return toast.error('O kit está vazio. Adicione versões primeiro.')
    setBusy(true)
    try {
      const files: { name: string; blob: Blob }[] = []
      for (const k of kit) files.push({ name: `${base}-${slug(k.name)}.png`, blob: await canvasBlob(await composeLogo(model, cuts, k.layout, k.colorway, { long: 2400 })) })
      downloadBlob(await makeZip(files), `${base}-kit-de-logos.zip`)
      toast.success(`${files.length} arquivo(s) no ZIP`)
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }
  const auto = () => {
    const cws = buildColorways(model, palette).slice(0, 8)
    const items: KitItem[] = []
    const lays = layoutPresets(model, cuts, layout).filter((p) => ['original', 'stack', 'row', 'symbol'].includes(p.id))
    for (const l of lays) for (const c of cws.slice(0, l.id === 'original' ? 8 : 3)) items.push({ id: crypto.randomUUID(), name: `${l.name} · ${c.name}`, layout: l.layout, colorway: c })
    setKit(items.filter((it, i) => items.findIndex((o) => sameJson(o.layout, it.layout) && sameJson(o.colorway, it.colorway)) === i))
    toast.success('Kit completo montado')
  }
  return (
    <div className="space-y-3" data-testid="kit-tab">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary btn-sm" onClick={zip} disabled={busy || !kit.length} data-testid="kit-zip">{busy ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Download className="h-3.5 w-3.5" />}Baixar kit (ZIP)</button>
        <button type="button" className="btn-outline btn-sm" onClick={() => setKit([...kit, { id: crypto.randomUUID(), name: `${layoutPresetName(layout)} · ${cw.name}`, layout, colorway: cw }])}><Plus className="h-3.5 w-3.5" />Adicionar a versão atual</button>
        <button type="button" className="btn-outline btn-sm" onClick={auto} data-testid="kit-auto"><Sparkles className="h-3.5 w-3.5" />Montar kit completo</button>
        {!!kit.length && <button type="button" className="btn-ghost btn-sm ml-auto text-red-600" onClick={() => setKit([])}>Esvaziar</button>}
      </div>
      {!kit.length ? <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">O kit guarda as versões que você quer entregar ao cliente. Adicione pelo botão “Kit” de cada versão, ou monte o kit completo com um clique.</p> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="kit-list">
          {kit.map((k) => (
            <li key={k.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              <CanvasView className={cn('aspect-square w-full', k.colorway.bg === 'transparent' && 'bg-checker')} make={() => composeLogo(model, cuts, k.layout, k.colorway, { long: 360 })} deps={[model, cutsKey(cuts), layoutKey(k.layout), JSON.stringify(k.colorway)]} />
              <div className="p-2"><input className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[11px] font-medium hover:border-zinc-200 focus:border-ink focus:outline-none" value={k.name} aria-label="Nome da versão" onChange={(e) => setKit(kit.map((x) => (x.id === k.id ? { ...x, name: e.target.value } : x)))} />
                <button type="button" className="mt-1 inline-flex items-center gap-1 text-[11px] text-red-600 hover:underline" onClick={() => setKit(kit.filter((x) => x.id !== k.id))}><Trash2 className="h-3 w-3" />Remover</button></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}


