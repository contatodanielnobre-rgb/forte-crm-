import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Crosshair, Eraser, MousePointerClick, Trash2 } from 'lucide-react'
import { signedUrl } from '@/lib/storage'
import { cn, errMsg } from '@/lib/utils'
import { Modal, Spinner } from '@/components/ui'
import { BUCKET_STUDIO } from './catalog'
import { editSlide, hasProvider, useModels, useProviderStatus, useStudioUrl } from './data'
import { buildAnnotatedB64, buildMaskB64, loadImage } from './image-utils'
import type { Marker, StudioImage } from './types'

const QUICK = ['Remover este objeto', 'Trocar a cor por ', 'Corrigir o texto para: ', 'Deixar mais discreto', 'Aumentar e destacar', 'Substituir por ']

/** Edição localizada: clique na imagem para marcar o que mudar e descreva — o resto da arte é preservado (nova versão do slide) */
export default function MarkerEditor({ image, modelId, onClose }: { image: StudioImage; modelId: string | null; onClose: () => void }) {
  const qc = useQueryClient()
  const url = useStudioUrl(image.storage_path)
  const { data: models } = useModels()
  const { data: providers } = useProviderStatus()
  const [markers, setMarkers] = useState<Marker[]>([])
  const [active, setActive] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [useMask, setUseMask] = useState(true)
  const [busy, setBusy] = useState(false)
  const [override, setOverride] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)

  const alt = (models ?? []).filter((m) => m.enabled && m.capabilities.edit && hasProvider(providers, m.provider))
  const original = models?.find((m) => m.id === modelId)
  const effective = override ?? (original?.capabilities.edit && hasProvider(providers, original.provider) ? original.id : alt[0]?.id ?? modelId)
  const model = models?.find((m) => m.id === effective)
  const canEdit = !!model?.capabilities.edit && hasProvider(providers, model.provider)
  const maskOk = !!model?.capabilities.mask

  useEffect(() => { if (active !== null && !markers[active]) setActive(null) }, [markers, active])
  // tamanho real da imagem exibida: o raio do marcador é % do menor lado (igual ao da máscara enviada à API)
  const [minSide, setMinSide] = useState(300)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setMinSide(Math.min(r.width, r.height) || 300) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [url])

  const pos = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect()
    return { x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)), y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)) }
  }
  const addAt = (e: React.MouseEvent) => {
    if (drag.current !== null) return
    const p = pos(e)
    setMarkers((m) => [...m, { ...p, r: 9, note: '' }]); setActive(markers.length)
  }
  useEffect(() => {
    const move = (e: PointerEvent) => { if (drag.current === null || !box.current) return; const p = pos(e); setMarkers((m) => m.map((x, i) => (i === drag.current ? { ...x, ...p } : x))) }
    const up = () => { setTimeout(() => { drag.current = null }, 0) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])

  const upd = (i: number, p: Partial<Marker>) => setMarkers((m) => m.map((x, j) => (j === i ? { ...x, ...p } : x)))

  const apply = async () => {
    if (!canEdit) return toast.error('Conecte a API de um modelo com edição em Modelos e APIs.')
    const filled = markers.filter((m) => m.note.trim())
    if (!filled.length && !note.trim()) return toast.error('Marque a área e descreva a alteração (ou escreva uma instrução geral).')
    setBusy(true)
    try {
      const img = await loadImage(await signedUrl(image.storage_path!, undefined, BUCKET_STUDIO), true)
      const files: { mask?: string; annotated?: string; model_id?: string } = { model_id: model?.id }
      if (filled.length) {
        files.annotated = await buildAnnotatedB64(img, filled)
        if (useMask && maskOk) files.mask = await buildMaskB64(img, filled)
      }
      void editSlide(image, filled, note.trim(), files, qc, image.brand_id)
      toast.success('Edição enviada — uma nova versão do slide está sendo gerada')
      onClose()
    } catch (e) { toast.error(errMsg(e)); setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} size="full" title="Editar com marcadores" subtitle={`Slide ${image.slide_index} · v${image.version}. A edição cria uma nova versão e preserva a original.`}
      footer={<>
        {alt.length > 1 && (
          <label className="mr-auto flex items-center gap-2 text-xs text-zinc-500">Editar com
            <select value={effective ?? ''} onChange={(e) => setOverride(e.target.value)} className="input h-8 w-auto py-0 text-xs">{alt.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          </label>
        )}
        <span className={cn('mr-auto hidden items-center gap-2 text-xs text-zinc-500', alt.length <= 1 && 'sm:flex')}><span className={cn('h-2 w-2 rounded-full', canEdit ? 'bg-emerald-500' : 'bg-zinc-300')} />{model ? `${model.name}${canEdit ? '' : model.capabilities.edit ? ' — API não disponível' : ' — sem suporte a edição'}` : 'Modelo não encontrado'}</span>
        <button className="btn-outline" onClick={onClose}>Cancelar</button>
        <button className="btn-brand" onClick={apply} disabled={busy || !canEdit}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <Eraser className="h-4 w-4" />}Aplicar edição</button>
      </>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex min-h-[320px] items-center justify-center rounded-3xl bg-zinc-100 p-4">
          {url && (
            <div ref={box} className="relative inline-block cursor-crosshair select-none overflow-hidden rounded-xl shadow-pop" onClick={addAt}>
              <img src={url} alt="" draggable={false} className="block max-h-[64vh] max-w-full" />
              {markers.map((m, i) => (
                <div key={i} className="absolute" style={{ left: `${m.x}%`, top: `${m.y}%` }}>
                  <span className={cn('absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed transition-colors', active === i ? 'border-brand bg-brand/20' : 'border-white bg-white/10')}
                    style={{ width: (m.r / 50) * minSide, height: (m.r / 50) * minSide, maxWidth: 'none', boxShadow: '0 0 0 1px rgba(0,0,0,.35)' }} />
                  <button type="button" onPointerDown={(e) => { e.stopPropagation(); drag.current = i; setActive(i) }} onClick={(e) => e.stopPropagation()}
                    className={cn('absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-full text-xs font-bold text-white shadow-pop ring-2 ring-white active:cursor-grabbing', active === i ? 'bg-brand' : 'bg-ink')}>{i + 1}</button>
                </div>
              ))}
              {!markers.length && (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"><span className="flex animate-fade-up items-center gap-2 rounded-full bg-ink/90 px-3.5 py-2 text-xs font-medium text-white backdrop-blur"><MousePointerClick className="h-3.5 w-3.5" />Clique no que você quer alterar</span></div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <p className="label flex items-center gap-1.5"><Crosshair className="h-3.5 w-3.5" />Marcadores ({markers.length})</p>
            {!markers.length ? <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">Ex.: clique sobre a mesa e escreva <i>“retire esta mesa”</i>. Só aquela parte muda; o resto fica idêntico.</p> : (
              <ul className="space-y-2">
                {markers.map((m, i) => (
                  <li key={i} onClick={() => setActive(i)} className={cn('animate-fade-up rounded-2xl border p-3 transition', active === i ? 'border-ink bg-white shadow-card' : 'border-zinc-200 bg-zinc-50/60')}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                      <span className="text-xs text-zinc-500">área</span>
                      <input type="range" min={3} max={30} value={m.r} onChange={(e) => upd(i, { r: Number(e.target.value) })} className="h-1 flex-1 accent-[#E10600]" aria-label="Tamanho da área" />
                      <button type="button" onClick={(e) => { e.stopPropagation(); setMarkers((x) => x.filter((_, j) => j !== i)) }} className="text-zinc-400 hover:text-brand" aria-label="Remover marcador"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <textarea value={m.note} autoFocus={active === i} onChange={(e) => upd(i, { note: e.target.value })} rows={2} placeholder="O que fazer nesta área? Ex.: retire esta mesa" className="input min-h-0 py-2 text-sm" />
                    <div className="mt-2 flex flex-wrap gap-1">{QUICK.map((q) => <button key={q} type="button" onClick={(e) => { e.stopPropagation(); upd(i, { note: q }) }} className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-600 hover:border-ink hover:text-ink">{q.trim()}</button>)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="label">Instrução geral (opcional)</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="input" placeholder="Ex.: deixe o fundo um pouco mais escuro, sem mudar o resto" />
          </div>
          {maskOk && markers.length > 0 && (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-zinc-50 p-3 text-sm"><input type="checkbox" className="mt-1 accent-[#E10600]" checked={useMask} onChange={(e) => setUseMask(e.target.checked)} /><span><b>Editar somente as áreas marcadas</b><span className="block text-xs text-zinc-500">Envia uma máscara ao modelo: o resto da imagem não é tocado.</span></span></label>
          )}
          {model && !model.capabilities.edit && (
            <p className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">{model.name} não edita imagens. {alt.length ? <>Gere a edição com <b>{alt[0].name}</b>: altere o modelo da criação e tente de novo.</> : <>Conecte um modelo com edição (GPT Image 2.5, Nano Banana…) em <Link to="/studio/models" className="font-semibold underline">Modelos e APIs</Link>.</>}</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
