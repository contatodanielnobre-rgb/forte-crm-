import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Check, Crop as CropIcon, Download, Droplet, Eraser, Eye, EyeOff, Layers, Link2, Loader2, Pipette, RotateCcw, Save, ScanText, SlidersHorizontal, Sparkles, Trash2, Type, Wand2, WandSparkles } from 'lucide-react'
import { cn, errMsg } from '@/lib/utils'
import { Spinner } from '@/components/ui'
import { signedUrl } from '@/lib/storage'
import { BUCKET_STUDIO } from '../catalog'
import { editSlide, readTexts, saveEditedVersions, setCurrentVersion, hasProvider, useProviderStatus, type TextBlock } from '../data'
import { buildRectMaskB64, canvasToBlob, loadImage } from '../image-utils'
import { makeZip } from '../zip'
import type { Generation, StudioImage } from '../types'
import {
  PRESETS, RANGES, ZERO, addAdjust, diagnose, isNeutral, kmeans, mergeAdjust, renderEdited, rgbToHex, scaleAdjust,
  type Adjust, type AdjustKey, type ColorLayer, type Crop, type Diagnosis, type SlideEdit,
} from './engine'

export interface ESlide { index: number; image: StudioImage | null; url: string | null; name: string }

// ---------------------------------------------------------------------------------
// Pequenos componentes
// ---------------------------------------------------------------------------------
function Slider({ label, value, min, max, step = 1, onChange, unit = '', fmt }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string; fmt?: (v: number) => string }) {
  const zero = min < 0 ? 0 : min
  return (
    <div className="group">
      <div className="mb-1 flex items-center justify-between text-xs">
        <button type="button" className="font-medium text-zinc-600 hover:text-ink" title="Clique duas vezes para zerar" onDoubleClick={() => onChange(zero)}>{label}</button>
        <span className={cn('tabular-nums', Math.abs(value - zero) > 0.001 ? 'font-semibold text-ink' : 'text-zinc-400')}>{fmt ? fmt(value) : `${step >= 1 ? Math.round(value) : Math.round(value * 100) / 100}${unit}`}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-[#E10600]" />
    </div>
  )
}

function Group({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="rounded-2xl border border-zinc-200 bg-white p-3.5">
      <summary className="cursor-pointer select-none text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">{title}</summary>
      <div className="mt-3 space-y-3.5">{children}</div>
    </details>
  )
}

function Thumb({ src, edit, seed, active, selected, onClick, onToggle, index }: { src: HTMLImageElement | null; edit: SlideEdit; seed: number; active: boolean; selected: boolean; onClick: () => void; onToggle: () => void; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!src || !ref.current) return
    const t = setTimeout(() => {
      const c = renderEdited(src, edit, 150, seed); const cv = ref.current; if (!cv) return
      cv.width = c.width; cv.height = c.height; cv.getContext('2d')!.drawImage(c, 0, 0)
    }, 120)
    return () => clearTimeout(t)
  }, [src, edit, seed])
  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-xl ring-2 transition', active ? 'ring-brand' : 'ring-transparent hover:ring-zinc-300', !selected && 'opacity-45')}>
      <button type="button" onClick={onClick} aria-label={`Abrir slide ${index}`} className="block h-24 min-w-[60px] bg-zinc-200"><canvas ref={ref} className="h-24 w-auto" /></button>
      <label className="absolute left-1.5 top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md bg-white/90 shadow"><input type="checkbox" checked={selected} onChange={onToggle} className="h-3.5 w-3.5 accent-[#E10600]" aria-label={`Aplicar edições no slide ${index}`} /></label>
      <span className="pointer-events-none absolute bottom-1 right-1.5 rounded bg-black/60 px-1 text-[10px] font-bold text-white">{index}</span>
    </div>
  )
}

const ASPECTS: [string, number | null][] = [['Original', null], ['1:1', 1], ['4:5', 4 / 5], ['3:4', 3 / 4], ['9:16', 9 / 16], ['16:9', 16 / 9]]
function deriveCrop(cfg: { aspect: number | null; zoom: number; px: number; py: number }, iw: number, ih: number): Crop | null {
  if (cfg.aspect === null && cfg.zoom <= 1.001) return null
  const ar = cfg.aspect ?? iw / ih
  let w = iw, h = iw / ar
  if (h > ih) { h = ih; w = ih * ar }
  w /= cfg.zoom; h /= cfg.zoom
  const x = (iw - w) * (cfg.px / 100), y = (ih - h) * (cfg.py / 100)
  return { x: x / iw, y: y / ih, w: w / iw, h: h / ih }
}

type Tool = 'ajustes' | 'camadas' | 'cortar'
const seedOf = (i: number) => 11 + i * 7

// ---------------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------------
export default function Editor({ slides, title, brandId, gen, onBack }: { slides: ESlide[]; title: string; brandId: string | null; gen: Generation | null; onBack?: () => void }) {
  const qc = useQueryClient()
  const { data: providers } = useProviderStatus()
  const openaiOk = hasProvider(providers, 'openai')
  const [loaded, setLoaded] = useState<Record<number, HTMLImageElement>>({})
  const [diag, setDiag] = useState<Record<number, Diagnosis>>({})
  const [palette, setPalette] = useState<Record<number, { rgb: [number, number, number]; share: number }[]>>({})
  const [cur, setCur] = useState(slides[0]?.index ?? 1)
  const [tool, setTool] = useState<Tool>('ajustes')
  const [master, setMaster] = useState<Adjust>(ZERO)
  const [offsets, setOffsets] = useState<Record<number, Adjust>>({})
  const [intensity, setIntensity] = useState(1)
  const [linked, setLinked] = useState(slides.length > 1)
  const [selected, setSelected] = useState<Set<number>>(new Set(slides.map((s) => s.index)))
  const [layers, setLayers] = useState<ColorLayer[]>([])
  const [layerSel, setLayerSel] = useState<string | null>(null)
  const [pick, setPick] = useState<null | 'eyedropper' | 'wand' | 'area'>(null)
  const [cropCfg, setCropCfg] = useState({ aspect: null as number | null, zoom: 1, px: 50, py: 50 })
  const [compare, setCompare] = useState(false)
  const [texts, setTexts] = useState<Record<number, TextBlock[]>>({})
  const [textSel, setTextSel] = useState<number | null>(null)
  const [area, setArea] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [drawing, setDrawing] = useState(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const [newText, setNewText] = useState('')
  const [busy, setBusy] = useState<null | 'save' | 'zip' | 'texts' | 'ai'>(null)
  const [after, setAfter] = useState<number | null>(null)
  const [before, setBefore] = useState<Record<number, number>>({})
  const canvas = useRef<HTMLCanvasElement>(null)
  const urlsKey = slides.map((s) => `${s.index}:${s.image?.id ?? s.url}`).join('|')

  // carrega as imagens (com CORS para poder ler os pixels)
  useEffect(() => {
    let alive = true
    setLoaded({})
    slides.forEach(async (s) => {
      try {
        const url = s.image?.storage_path ? await signedUrl(s.image.storage_path, undefined, BUCKET_STUDIO) : s.url
        if (!url) return
        const img = await loadImage(url, true)
        if (!alive) return
        setLoaded((l) => ({ ...l, [s.index]: img }))
        setTimeout(() => {
          if (!alive) return
          const base = renderEdited(img, { adjust: ZERO, layers: [], crop: null }, 1024)
          const d = diagnose(base.getContext('2d')!.getImageData(0, 0, base.width, base.height))
          setDiag((x) => ({ ...x, [s.index]: d })); setBefore((x) => ({ ...x, [s.index]: d.score }))
          const small = renderEdited(img, { adjust: ZERO, layers: [], crop: null }, 400)
          setPalette((p) => ({ ...p, [s.index]: kmeans(small.getContext('2d')!.getImageData(0, 0, small.width, small.height), 7) }))
        }, 30)
      } catch (e) { if (alive) toast.error(`Slide ${s.index}: ${errMsg(e)}`) }
    })
    return () => { alive = false }
  }, [urlsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const curSlide = slides.find((s) => s.index === cur) ?? slides[0]
  const curImg = loaded[cur] ?? null
  const adjustFor = useCallback((i: number): Adjust => (selected.has(i) ? addAdjust(scaleAdjust(master, intensity), offsets[i] ?? ZERO) : ZERO), [selected, master, intensity, offsets])
  const editFor = useCallback((i: number): SlideEdit => {
    const img = loaded[i]
    const sel = selected.has(i)
    return {
      adjust: adjustFor(i),
      layers: sel ? layers.filter((l) => l.enabled && (l.type === 'range' || l.imageId === i)) : [],
      crop: sel && img ? deriveCrop(cropCfg, img.naturalWidth, img.naturalHeight) : null,
    }
  }, [adjustFor, selected, layers, loaded, cropCfg])
  const curEdit = useMemo(() => editFor(cur), [editFor, cur])

  // prévia (a imagem fica sempre inteira na tela)
  useEffect(() => {
    if (!curImg || !canvas.current) return
    const id = requestAnimationFrame(() => {
      const c = renderEdited(curImg, compare ? { adjust: ZERO, layers: [], crop: curEdit.crop } : curEdit, 960, seedOf(cur))
      const cv = canvas.current; if (!cv) return
      cv.width = c.width; cv.height = c.height; cv.getContext('2d')!.drawImage(c, 0, 0)
    })
    return () => cancelAnimationFrame(id)
  }, [curImg, curEdit, compare, cur])

  // nota "depois" (medida na versão editada)
  useEffect(() => {
    if (!curImg) return
    const t = setTimeout(() => {
      const c = renderEdited(curImg, curEdit, 1024, seedOf(cur))
      setAfter(diagnose(c.getContext('2d')!.getImageData(0, 0, c.width, c.height)).score)
    }, 450)
    return () => clearTimeout(t)
  }, [curImg, curEdit, cur])

  const setAdj = (k: AdjustKey, v: number) => (linked ? setMaster((m) => ({ ...m, [k]: v })) : setOffsets((o) => ({ ...o, [cur]: { ...(o[cur] ?? ZERO), [k]: v } })))
  const shown = linked ? master : offsets[cur] ?? ZERO
  const reset = () => { if (linked) { setMaster(ZERO); setIntensity(1) } else setOffsets((o) => ({ ...o, [cur]: ZERO })); setLayers([]); setCropCfg({ aspect: null, zoom: 1, px: 50, py: 50 }) }

  const autoRemove = () => {
    const targets = (linked ? [...selected] : [cur]).map((i) => diag[i]).filter(Boolean)
    if (!targets.length) return toast.info('Aguarde a análise das imagens…')
    const avg = { ...ZERO }
    for (const k of Object.keys(ZERO) as AdjustKey[]) avg[k] = targets.reduce((s, d) => s + d.recommended[k], 0) / targets.length
    if (linked) { setMaster(avg); setIntensity(1) } else setOffsets((o) => ({ ...o, [cur]: avg }))
    toast.success(`Remover IA aplicado${linked && targets.length > 1 ? ` em ${targets.length} slides (média das correções)` : ''}`)
  }
  const preset = (p: Partial<Adjust>) => { const a = mergeAdjust(p); if (linked) { setMaster(a); setIntensity(1) } else setOffsets((o) => ({ ...o, [cur]: a })) }

  // clique na imagem: conta-gotas / varinha mágica
  const pctAt = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)), y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)) } }
  const onAreaDown = (e: React.PointerEvent) => { if (pick !== 'area' || !canvas.current) return; e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId); dragStart.current = pctAt(e); setDrawing(true); setArea({ ...dragStart.current, w: 0, h: 0 }) }
  const onAreaMove = (e: React.PointerEvent) => { if (!drawing || !dragStart.current) return; const p = pctAt(e), s = dragStart.current; setArea({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }) }
  const onAreaUp = () => { if (!drawing) return; setDrawing(false); dragStart.current = null; setPick(null); setArea((a) => (a && a.w > 1.5 && a.h > 1.5 ? a : null)) }
  const onCanvasClick = (e: React.MouseEvent) => {
    if (!pick || pick === 'area' || !canvas.current || !curImg) return
    const r = canvas.current.getBoundingClientRect()
    let nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height
    const cr = curEdit.crop; if (cr) { nx = cr.x + nx * cr.w; ny = cr.y + ny * cr.h }
    const c = document.createElement('canvas'); c.width = 1; c.height = 1
    c.getContext('2d')!.drawImage(curImg, nx * curImg.naturalWidth - 2, ny * curImg.naturalHeight - 2, 4, 4, 0, 0, 1, 1)
    const px = c.getContext('2d')!.getImageData(0, 0, 1, 1).data
    const rgb: [number, number, number] = [px[0], px[1], px[2]]
    const id = crypto.randomUUID()
    setLayers((l) => [...l, { id, type: pick === 'wand' ? 'wand' : 'range', name: `${pick === 'wand' ? 'Região' : 'Cor'} ${rgbToHex(...rgb)}`, src: rgb, tol: pick === 'wand' ? 28 : 24, feather: 50, hue: 0, sat: 0, light: 0, target: null, enabled: true, seed: pick === 'wand' ? { x: nx, y: ny } : null, imageId: pick === 'wand' ? cur : null }])
    setLayerSel(id); setPick(null)
  }
  const addFromPalette = (rgb: [number, number, number]) => {
    const id = crypto.randomUUID()
    setLayers((l) => [...l, { id, type: 'range', name: `Cor ${rgbToHex(...rgb)}`, src: rgb, tol: 24, feather: 50, hue: 0, sat: 0, light: 0, target: null, enabled: true }]); setLayerSel(id)
  }
  const setLayer = (id: string, p: Partial<ColorLayer>) => setLayers((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)))
  const layer = layers.find((l) => l.id === layerSel) ?? null

  // textos com IA
  const detectTexts = async () => {
    if (!curSlide.image) return toast.info('Abra uma criação do estúdio para detectar textos com IA.')
    setBusy('texts')
    try { const r = await readTexts(curSlide.image.id); setTexts((t) => ({ ...t, [cur]: r.blocks })); setTextSel(null); toast.success(r.blocks.length ? `${r.blocks.length} blocos de texto encontrados` : 'Nenhum texto encontrado') } catch (e) { toast.error(errMsg(e)) } finally { setBusy(null) }
  }
  /** Edição com IA numa caixa (em % da imagem): máscara → modelo de imagem → o resultado só vale DENTRO da caixa (o resto fica idêntico) */
  const runAiEdit = async (rect: { x: number; y: number; w: number; h: number }, note: string, label: string) => {
    if (!curSlide.image || !curImg || !brandId) return
    const base = curSlide.image
    setBusy('ai')
    try {
      const mask = await buildRectMaskB64(curImg, [rect])
      await editSlide(base, [{ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, r: Math.max(rect.w, rect.h) / 2, note }], '', { mask }, qc, brandId)
      const { data: aiRow } = await supabase.from('studio_images').select('*').eq('generation_id', base.generation_id).eq('slide_index', base.slide_index).eq('is_current', true).single()
      if (!aiRow?.storage_path || aiRow.status !== 'done') throw new Error(aiRow?.error || 'A IA não conseguiu gerar a edição.')
      const aiImg = await loadImage(await signedUrl(aiRow.storage_path, undefined, BUCKET_STUDIO), true)
      const w = curImg.naturalWidth, h = curImg.naturalHeight
      const out = document.createElement('canvas'); out.width = w; out.height = h
      const ctx = out.getContext('2d')!; ctx.drawImage(curImg, 0, 0)
      const patch = document.createElement('canvas'); patch.width = w; patch.height = h
      const pc = patch.getContext('2d')!; pc.drawImage(aiImg, 0, 0, w, h)
      const m = document.createElement('canvas'); m.width = w; m.height = h
      const mc = m.getContext('2d')!; mc.filter = `blur(${Math.max(2, Math.round(w / 260))}px)`; mc.fillStyle = '#fff'
      const inset = Math.round(w / 300)
      mc.fillRect((rect.x / 100) * w + inset, (rect.y / 100) * h + inset, (rect.w / 100) * w - inset * 2, (rect.h / 100) * h - inset * 2)
      // trava de segurança: se a IA preencheu a caixa de preto/cor sólida, descarta e volta à versão anterior
      const frac = (src: CanvasImageSource, sw: number, sh: number) => {
        const k = document.createElement('canvas'); k.width = 160; k.height = 160
        const kc = k.getContext('2d', { willReadFrequently: true })!
        kc.drawImage(src, (rect.x / 100) * sw, (rect.y / 100) * sh, (rect.w / 100) * sw, (rect.h / 100) * sh, 0, 0, 160, 160)
        const px = kc.getImageData(0, 0, 160, 160).data; let dark = 0
        for (let i = 0; i < px.length; i += 4) if (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2] < 22) dark++
        return dark / (160 * 160)
      }
      if (frac(patch, w, h) - frac(curImg, w, h) > 0.35) {
        await setCurrentVersion(base)
        qc.invalidateQueries({ queryKey: ['studio', 'generation'] }); qc.invalidateQueries({ queryKey: ['studio', 'generations', brandId] })
        toast.error('A IA preencheu a caixa com preto e o resultado foi descartado.', { description: 'Selecione um trecho menor e tente de novo. Nada foi alterado.' })
        return
      }
      pc.globalCompositeOperation = 'destination-in'; pc.drawImage(m, 0, 0)
      ctx.drawImage(patch, 0, 0)
      await saveEditedVersions([{ img: aiRow as StudioImage, blob: await canvasToBlob(out, 'image/png'), width: w, height: h }], `Remover IA · ${label}`, qc, brandId)
      toast.success('Pronto: nova versão criada (só a área marcada mudou)')
      setTexts((x) => ({ ...x, [cur]: [] })); setTextSel(null); setNewText(''); setArea(null)
      qc.invalidateQueries({ queryKey: ['studio', 'generation'] })
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(null) }
  }
  const applyText = (erase = false) => {
    const b = textSel !== null ? texts[cur]?.[textSel] : null
    if (!b) return
    if (!erase && (!newText.trim() || newText.trim() === b.text.trim())) return toast.info('Escreva o novo texto.')
    const pad = erase ? 3.4 : 1.2
    const rect = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), w: Math.min(100, b.w + pad * 2), h: Math.min(100, b.h + pad * 2) }
    const look = [b.font && `fonte: ${b.font}`, b.color && `cor: ${b.color}`, b.size && `tamanho: ${b.size}`, b.role && `papel: ${b.role}`].filter(Boolean).join('; ')
    const note = erase
      ? `Esta é uma arte de Instagram. APAGUE COMPLETAMENTE o texto "${b.text}" (e qualquer seta, contorno ou caixa que exista só por causa dele) e reconstrua o fundo que estava atrás, igual ao fundo ou à foto ao redor. NUNCA preencha a área com cor sólida ou preta e não escreva nada no lugar. Não altere nada fora da área marcada.`
      : `Esta é uma arte de Instagram. Troque SOMENTE o texto "${b.text}" por "${newText.trim()}" (mesma ortografia). Apague o texto antigo por completo e reconstrua o fundo que estava atrás dele (o mesmo fundo ou foto ao redor; NUNCA preencha a área com cor sólida ou preta), e escreva o novo texto no mesmo lugar. Características do texto original: ${look || 'veja a imagem'}. Mantenha a mesma fonte, cor, peso, tamanho, alinhamento e a caixa ou realce atrás do texto, se houver. Não altere nada fora da área marcada.`
    return runAiEdit(rect, note, erase ? `texto apagado: ${b.text.slice(0, 40)}` : `texto trocado: ${b.text.slice(0, 40)} → ${newText.trim().slice(0, 40)}`)
  }
  const eraseArea = () => {
    if (!area) return
    return runAiEdit(area, 'Esta é uma arte de Instagram. APAGUE COMPLETAMENTE tudo que estiver dentro da área marcada (texto, setas, ícones, contornos, selos) e reconstrua o fundo igual ao fundo ou à foto ao redor, de forma contínua e natural. NUNCA preencha a área com cor sólida ou preta e não escreva nada no lugar. Não altere nada fora da área marcada.', 'área apagada com IA')
  }

  // salvar / baixar
  const targets = slides.filter((s) => selected.has(s.index) && loaded[s.index])
  const renderBlob = async (s: ESlide) => { const c = renderEdited(loaded[s.index], editFor(s.index), null, seedOf(s.index)); return { blob: await canvasToBlob(c, 'image/png'), w: c.width, h: c.height } }
  const edited = targets.some((s) => !isNeutral(editFor(s.index).adjust) || editFor(s.index).layers.length > 0 || editFor(s.index).crop)
  const save = async () => {
    if (!brandId || !targets.length) return
    setBusy('save')
    try {
      const items = []
      for (const s of targets) { if (!s.image) continue; const r = await renderBlob(s); items.push({ img: s.image, blob: r.blob, width: r.w, height: r.h }) }
      await saveEditedVersions(items, 'Remover IA', qc, brandId)
      toast.success(`${items.length} ${items.length === 1 ? 'slide salvo' : 'slides salvos'} como nova versão`, { description: 'As versões anteriores continuam guardadas (setas no cartão do slide).' })
      reset()
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(null) }
  }
  const saveAs = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }
  const downloadCur = async () => { setBusy('zip'); try { const r = await renderBlob(curSlide); saveAs(r.blob, `remover-ia-slide-${String(cur).padStart(2, '0')}.png`) } finally { setBusy(null) } }
  const downloadAll = async () => {
    setBusy('zip')
    try { const files = []; for (const s of targets) { const r = await renderBlob(s); files.push({ name: `remover-ia-slide-${String(s.index).padStart(2, '0')}.png`, blob: r.blob }) } saveAs(files.length === 1 ? files[0].blob : await makeZip(files), files.length === 1 ? files[0].name : 'remover-ia.zip') } catch (e) { toast.error(errMsg(e)) } finally { setBusy(null) }
  }

  const d = diag[cur]
  const sevColor = (v: number) => (v > 0.5 ? 'bg-brand' : v > 0.2 ? 'bg-amber-400' : 'bg-emerald-500')
  const scoreCls = (s: number) => (s >= 60 ? 'text-brand' : s >= 35 ? 'text-amber-600' : 'text-emerald-600')

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* palco */}
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {onBack && <button className="btn-ghost btn-sm" onClick={onBack}>← Criações</button>}
          <h2 className="mr-auto truncate font-display text-lg font-bold tracking-tight">{title}</h2>
          <button className="btn-outline btn-sm select-none" onPointerDown={() => setCompare(true)} onPointerUp={() => setCompare(false)} onPointerLeave={() => setCompare(false)} title="Segure para ver o original"><Eye className="h-3.5 w-3.5" />Segure para comparar</button>
          <button className="btn-outline btn-sm" onClick={reset}><RotateCcw className="h-3.5 w-3.5" />Zerar</button>
          <button className="btn-outline btn-sm" onClick={downloadCur} disabled={!curImg || busy !== null}><Download className="h-3.5 w-3.5" />Baixar este slide</button>
          {targets.length > 1 && <button className="btn-outline btn-sm" onClick={downloadAll} disabled={busy !== null}>{busy === 'zip' ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}Baixar {targets.length} (ZIP)</button>}
          {brandId && <button className="btn-brand btn-sm" onClick={save} disabled={!edited || busy !== null} title={edited ? '' : 'Faça uma edição primeiro'}>{busy === 'save' ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Save className="h-3.5 w-3.5" />}Salvar {targets.length > 1 ? `em ${targets.length} slides` : 'como nova versão'}</button>}
        </div>

        <div className="relative flex min-h-[360px] items-center justify-center overflow-hidden rounded-3xl bg-[#18181b] p-4" style={{ height: 'min(70vh, 760px)' }}>
          {!curImg && <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />}
          <div className={cn('relative inline-block max-h-full max-w-full', !curImg && 'hidden')} style={{ lineHeight: 0 }}>
            <canvas ref={canvas} onClick={onCanvasClick} onPointerDown={onAreaDown} onPointerMove={onAreaMove} onPointerUp={onAreaUp} data-testid="editor-canvas" className={cn('block max-h-[calc(70vh-40px)] max-w-full touch-none rounded-lg shadow-2xl', pick && 'cursor-crosshair')} />
            {area && !curEdit.crop && <div className="pointer-events-none absolute rounded border-2 border-dashed border-brand bg-brand/15" style={{ left: `${area.x}%`, top: `${area.y}%`, width: `${area.w}%`, height: `${area.h}%` }} />}
            {tool === 'camadas' && !curEdit.crop && (texts[cur] ?? []).map((b, i) => (
              <button key={i} type="button" onClick={() => { setTextSel(i); setNewText(b.text) }} title={b.text}
                className={cn('absolute rounded border-2 transition', textSel === i ? 'border-brand bg-brand/20' : 'border-sky-400/90 bg-sky-400/10 hover:bg-sky-400/25')}
                style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }} />
            ))}
            {compare && <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white" style={{ lineHeight: 1.4 }}>ORIGINAL</span>}
          </div>
          {pick && <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink/90 px-4 py-2 text-xs font-semibold text-white">{pick === 'wand' ? 'Clique na região que quer selecionar' : pick === 'area' ? 'Arraste sobre a imagem para marcar a área' : 'Clique numa cor da imagem'}</span>}
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-2">
          {slides.map((s) => <Thumb key={s.index} index={s.index} src={loaded[s.index] ?? null} edit={editFor(s.index)} seed={seedOf(s.index)} active={s.index === cur} selected={selected.has(s.index)} onClick={() => setCur(s.index)}
            onToggle={() => setSelected((x) => { const n = new Set(x); if (n.has(s.index)) n.delete(s.index); else n.add(s.index); return n })} />)}
          {slides.length > 1 && (
            <div className="ml-2 flex shrink-0 flex-col gap-1 text-xs">
              <button className="font-semibold text-brand hover:underline" onClick={() => setSelected(new Set(slides.map((s) => s.index)))}>Marcar todos</button>
              <button className="text-zinc-500 hover:underline" onClick={() => setSelected(new Set())}>Desmarcar</button>
            </div>
          )}
        </div>
      </div>

      {/* painel */}
      <aside className="space-y-3 xl:max-h-[calc(100vh-140px)] xl:overflow-y-auto xl:pr-1">
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-zinc-100 p-1">
          {([['ajustes', 'Ajustes', SlidersHorizontal], ['camadas', 'Camadas', Layers], ['cortar', 'Cortar', CropIcon]] as const).map(([id, t, Icon]) => (
            <button key={id} type="button" onClick={() => setTool(id)} className={cn('flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold transition', tool === id ? 'bg-ink text-white shadow-sm' : 'text-zinc-600 hover:bg-white')}><Icon className="h-4 w-4" />{t}</button>
          ))}
        </div>

        {slides.length > 1 && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-3.5">
            <button type="button" role="switch" aria-checked={linked} onClick={() => setLinked((v) => !v)} className="flex w-full items-center gap-3 text-left">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-white"><Link2 className="h-4 w-4" /></span>
              <span className="flex-1"><b className="block text-sm">Editar todos juntos</b><span className="text-[11px] text-zinc-500">{linked ? `Vale para os ${selected.size} slides marcados` : 'Ajuste fino só deste slide (somado ao geral)'}</span></span>
              <span className={cn('relative h-6 w-11 rounded-full transition', linked ? 'bg-emerald-500' : 'bg-zinc-300')}><span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', linked ? 'left-[22px]' : 'left-0.5')} /></span>
            </button>
            <div className="mt-3"><Slider label="Intensidade geral das edições" value={Math.round(intensity * 100)} min={0} max={200} step={1} unit="%" onChange={(v) => setIntensity(v / 100)} /></div>
          </div>
        )}

        {tool === 'ajustes' && (
          <>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center gap-4">
                <div className="text-center"><p className={cn('font-display text-4xl font-bold leading-none', d ? scoreCls(after ?? d.score) : 'text-zinc-300')}>{d ? (after ?? d.score) : '…'}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">cara de IA</p></div>
                <div className="min-w-0 flex-1 text-xs text-zinc-500">{d ? (<>Antes: <b className="text-ink">{before[cur] ?? d.score}</b>{after !== null && after !== (before[cur] ?? d.score) && <> · depois: <b className={scoreCls(after)}>{after}</b></>}<br />0 = parece foto real · 100 = muito “cara de IA” (estimativa por heurística).</>) : 'Analisando a imagem…'}</div>
              </div>
              {d && (
                <ul className="mt-3 space-y-2">
                  {d.factors.map((f) => (
                    <li key={f.key} className="text-xs"><div className="flex justify-between"><span className="font-medium text-zinc-700">{f.label}</span><span className="tabular-nums text-zinc-400">{f.value}</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className={cn('h-full rounded-full transition-all', sevColor(f.severity))} style={{ width: `${Math.max(4, Math.min(100, f.severity * 100))}%` }} /></div>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{f.note}</p></li>
                  ))}
                </ul>
              )}
              <button className="btn-brand mt-4 h-11 w-full" onClick={autoRemove} disabled={!d}><Sparkles className="h-4 w-4" />Remover IA automático</button>
              <p className="mt-1.5 text-center text-[11px] text-zinc-400">{linked && selected.size > 1 ? 'Usa a média das correções dos slides marcados.' : 'Corrige o que o diagnóstico encontrou.'} Depois ajuste fino abaixo.</p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => <button key={p.id} type="button" title={p.desc} onClick={() => preset(p.adjust)} className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-ink hover:text-ink">{p.name}</button>)}
            </div>

            <Group title="Luz">
              <Slider label="Exposição" value={shown.exposure} min={RANGES.exposure[0]} max={RANGES.exposure[1]} step={0.05} onChange={(v) => setAdj('exposure', v)} />
              <Slider label="Contraste" value={shown.contrast} min={-100} max={100} onChange={(v) => setAdj('contrast', v)} />
              <Slider label="Realces" value={shown.highlights} min={-100} max={100} onChange={(v) => setAdj('highlights', v)} />
              <Slider label="Sombras" value={shown.shadows} min={-100} max={100} onChange={(v) => setAdj('shadows', v)} />
              <Slider label="Fade (matte)" value={shown.fade} min={0} max={100} onChange={(v) => setAdj('fade', v)} />
            </Group>
            <Group title="Cor">
              <Slider label="Saturação" value={shown.saturation} min={-100} max={100} onChange={(v) => setAdj('saturation', v)} />
              <Slider label="Vibração" value={shown.vibrance} min={-100} max={100} onChange={(v) => setAdj('vibrance', v)} />
              <Slider label="Matiz" value={shown.hue} min={-180} max={180} unit="°" onChange={(v) => setAdj('hue', v)} />
              <Slider label="Temperatura" value={shown.temperature} min={-100} max={100} onChange={(v) => setAdj('temperature', v)} />
              <Slider label="Tom (verde ↔ magenta)" value={shown.tint} min={-100} max={100} onChange={(v) => setAdj('tint', v)} />
            </Group>
            <Group title="Textura">
              <Slider label="Granulação" value={shown.grain} min={0} max={100} onChange={(v) => setAdj('grain', v)} />
              <Slider label="Tamanho do grão" value={shown.grainSize} min={1} max={4} step={0.1} onChange={(v) => (linked ? setMaster((m) => ({ ...m, grainSize: v })) : setOffsets((o) => ({ ...o, [cur]: { ...(o[cur] ?? ZERO), grainSize: v } })))} />
              <Slider label="Remover granulação / ruído" value={shown.denoise} min={0} max={100} onChange={(v) => setAdj('denoise', v)} />
              <Slider label="Clareza (negativo suaviza)" value={shown.clarity} min={-100} max={100} onChange={(v) => setAdj('clarity', v)} />
              <Slider label="Nitidez" value={shown.sharpen} min={0} max={100} onChange={(v) => setAdj('sharpen', v)} />
              <Slider label="Vinheta (negativo clareia)" value={shown.vignette} min={-100} max={100} onChange={(v) => setAdj('vignette', v)} />
            </Group>
          </>
        )}

        {tool === 'camadas' && (
          <>
            <Group title="Camadas de cor">
              <p className="text-xs text-zinc-500">A IA separa as cores da imagem. Escolha uma e troque cor, matiz, saturação ou luz só nela. Vale para todos os slides marcados.</p>
              <div className="flex flex-wrap gap-2">
                {(palette[cur] ?? []).map((c, i) => <button key={i} type="button" onClick={() => addFromPalette(c.rgb)} title={`${rgbToHex(...c.rgb)} · ${Math.round(c.share * 100)}% da imagem`} className="group relative h-9 w-9 rounded-xl ring-1 ring-black/10 transition hover:scale-110" style={{ background: rgbToHex(...c.rgb) }}><span className="absolute -bottom-4 left-1/2 hidden -translate-x-1/2 text-[9px] text-zinc-500 group-hover:block">{Math.round(c.share * 100)}%</span></button>)}
                {!palette[cur] && <span className="text-xs text-zinc-400">Analisando cores…</span>}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button className={cn('btn-outline btn-sm', pick === 'eyedropper' && 'border-ink bg-zinc-100')} onClick={() => setPick(pick === 'eyedropper' ? null : 'eyedropper')}><Pipette className="h-3.5 w-3.5" />Conta-gotas</button>
                <button className={cn('btn-outline btn-sm', pick === 'wand' && 'border-ink bg-zinc-100')} onClick={() => setPick(pick === 'wand' ? null : 'wand')}><Wand2 className="h-3.5 w-3.5" />Varinha mágica</button>
              </div>
              {layers.length > 0 && (
                <ul className="space-y-1.5 pt-1">
                  {layers.map((l) => (
                    <li key={l.id} className={cn('flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm', layerSel === l.id ? 'border-ink bg-zinc-50' : 'border-zinc-200')}>
                      <button type="button" aria-label={l.enabled ? 'Ocultar' : 'Mostrar'} onClick={() => setLayer(l.id, { enabled: !l.enabled })} className="text-zinc-500 hover:text-ink">{l.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
                      <button type="button" onClick={() => setLayerSel(l.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: rgbToHex(...l.src) }} /><span className="truncate text-xs font-medium">{l.name}</span><span className="text-[10px] text-zinc-400">{l.type === 'wand' ? `slide ${l.imageId}` : 'todos'}</span></button>
                      <button type="button" aria-label="Excluir camada" onClick={() => { setLayers((x) => x.filter((y) => y.id !== l.id)); if (layerSel === l.id) setLayerSel(null) }} className="text-zinc-400 hover:text-brand"><Trash2 className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
              {layer && (
                <div className="space-y-3.5 rounded-2xl bg-zinc-50 p-3">
                  <Slider label="Alcance da cor (tolerância)" value={layer.tol} min={1} max={100} onChange={(v) => setLayer(layer.id, { tol: v })} />
                  <Slider label="Suavizar bordas" value={layer.feather} min={0} max={100} onChange={(v) => setLayer(layer.id, { feather: v })} />
                  <div className="flex items-center gap-2 text-xs"><span className="font-medium text-zinc-600">Trocar por</span>
                    <input type="color" value={layer.target ?? rgbToHex(...layer.src)} onChange={(e) => setLayer(layer.id, { target: e.target.value.toUpperCase() })} className="h-8 w-10 cursor-pointer rounded border border-zinc-200 bg-white" aria-label="Nova cor" />
                    {layer.target && <button className="text-zinc-500 underline" onClick={() => setLayer(layer.id, { target: null })}>manter a original</button>}
                  </div>
                  <Slider label="Matiz" value={layer.hue} min={-180} max={180} unit="°" onChange={(v) => setLayer(layer.id, { hue: v })} />
                  <Slider label="Saturação" value={layer.sat} min={-100} max={100} onChange={(v) => setLayer(layer.id, { sat: v })} />
                  <Slider label="Luz" value={layer.light} min={-100} max={100} onChange={(v) => setLayer(layer.id, { light: v })} />
                </div>
              )}
            </Group>

            <Group title="Textos (IA)">
              <p className="text-xs text-zinc-500">A IA lê os textos da arte, cada bloco vira uma camada. Escolha um, escreva o novo texto e a IA troca só ali (gera uma nova versão do slide).</p>
              <button className="btn-outline h-10 w-full" onClick={detectTexts} disabled={busy !== null || !curSlide.image || !openaiOk}>{busy === 'texts' ? <Spinner className="h-4 w-4" /> : <ScanText className="h-4 w-4" />}Detectar textos com IA</button>
              {!openaiOk && <p className="text-[11px] text-amber-700">Conecte a OpenAI em Modelos e APIs.</p>}
              {!curSlide.image && <p className="text-[11px] text-zinc-400">Disponível para criações do estúdio (não para imagens abertas do computador).</p>}
              <div className="space-y-2 rounded-2xl bg-zinc-50 p-3">
                <button className={cn('btn-outline h-9 w-full text-sm', pick === 'area' && 'border-ink bg-white')} onClick={() => setPick(pick === 'area' ? null : 'area')} disabled={!curSlide.image || !!curEdit.crop}><ScanText className="h-4 w-4" />Selecionar área para apagar</button>
                {area && <button className="btn-brand h-10 w-full" onClick={eraseArea} disabled={busy !== null}>{busy === 'ai' ? <><Spinner className="h-4 w-4 text-white" />A IA está apagando…</> : <><Eraser className="h-4 w-4" />Apagar a área com IA</>}</button>}
                <p className="text-[11px] text-zinc-500">Ex.: o “DESLIZE →” no último slide. Desenhe um retângulo que cubra o texto <b>e</b> o contorno dele.</p>
              </div>
              {(texts[cur] ?? []).length > 0 && (
                <ul className="space-y-1">
                  {texts[cur].map((b, i) => <li key={i}><button type="button" onClick={() => { setTextSel(i); setNewText(b.text) }} className={cn('flex w-full items-start gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs', textSel === i ? 'border-ink bg-zinc-50' : 'border-zinc-200 hover:border-zinc-400')}><Type className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" /><span className="line-clamp-2">{b.text}</span></button></li>)}
                </ul>
              )}
              {textSel !== null && texts[cur]?.[textSel] && (
                <div className="space-y-2 rounded-2xl bg-zinc-50 p-3">
                  <textarea className="input min-h-[72px] text-sm" value={newText} onChange={(e) => setNewText(e.target.value)} aria-label="Novo texto" />
                  <button className="btn-brand h-10 w-full" onClick={() => applyText()} disabled={busy !== null}>{busy === 'ai' ? <><Spinner className="h-4 w-4 text-white" />A IA está trocando…</> : <><WandSparkles className="h-4 w-4" />Trocar texto com IA</>}</button>
                  <button className="btn-outline h-9 w-full text-sm" onClick={() => applyText(true)} disabled={busy !== null}><Eraser className="h-4 w-4" />Apagar este texto com IA</button>
                  <p className="text-[11px] text-zinc-500">Usa o modelo de imagem (≈ R$ 0,30 a 0,60 por troca). O original fica guardado como versão anterior.</p>
                </div>
              )}
            </Group>
          </>
        )}

        {tool === 'cortar' && (
          <Group title="Cortar / reenquadrar">
            <p className="text-xs text-zinc-500">O mesmo corte vale para todos os slides marcados. Mudar a proporção muda o tamanho final da imagem.</p>
            <div className="flex flex-wrap gap-1.5">{ASPECTS.map(([t, v]) => <button key={t} type="button" onClick={() => setCropCfg((c) => ({ ...c, aspect: v }))} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold', cropCfg.aspect === v ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white hover:border-zinc-400')}>{t}</button>)}</div>
            <Slider label="Zoom" value={Math.round(cropCfg.zoom * 100)} min={100} max={300} unit="%" onChange={(v) => setCropCfg((c) => ({ ...c, zoom: v / 100 }))} />
            <Slider label="Posição horizontal" value={cropCfg.px} min={0} max={100} onChange={(v) => setCropCfg((c) => ({ ...c, px: v }))} />
            <Slider label="Posição vertical" value={cropCfg.py} min={0} max={100} onChange={(v) => setCropCfg((c) => ({ ...c, py: v }))} />
            <button className="btn-ghost btn-sm" onClick={() => setCropCfg({ aspect: null, zoom: 1, px: 50, py: 50 })}><Eraser className="h-3.5 w-3.5" />Remover corte</button>
          </Group>
        )}

        <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-zinc-400"><Droplet className="mt-0.5 h-3.5 w-3.5 shrink-0" />Tudo é editado no seu navegador, sem custo de IA, e salvo como nova versão (a anterior fica guardada). Só “Textos (IA)” usa o modelo de imagem.{gen ? '' : ''}</p>
        {edited && <p className="flex items-center gap-1.5 px-1 text-[11px] font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" />Há edições não salvas</p>}
      </aside>
    </div>
  )
}
