import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Palette, Pipette, Plus, Trash2, WandSparkles } from 'lucide-react'
import { Modal } from '@/components/ui'
import { cn } from '@/lib/utils'
import { COLOR_ROLES } from './catalog'
import { useStudioUrl } from './data'
import { extractPalette, isHex, loadImage, normHex, readableOn, sampleColor } from './image-utils'
import { StudioImg } from './ui'
import type { BrandColor, StudioAsset } from './types'

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> }
const EyeDropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper

const ROLE_ORDER: BrandColor['role'][] = ['primary', 'secondary', 'accent', 'background', 'text', 'other']

/** Paleta da marca: seletor, conta-gotas na tela, conta-gotas numa imagem da biblioteca e extração automática da logo */
export default function ColorPalette({ value, onChange, logo, refs }: {
  value: BrandColor[]; onChange: (v: BrandColor[]) => void; logo?: StudioAsset | null; refs: StudioAsset[]
}) {
  const [picker, setPicker] = useState<{ index: number | null } | null>(null)
  const upd = (i: number, patch: Partial<BrandColor>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const add = (hex = '#E10600') => onChange([...value, { hex, name: '', role: ROLE_ORDER[Math.min(value.length, ROLE_ORDER.length - 1)] }])

  const eyedrop = async (i: number | null) => {
    if (!EyeDropper) return toast.info('O conta-gotas da tela funciona no Chrome/Edge. Use "Pegar de uma imagem" abaixo.')
    try {
      const { sRGBHex } = await new EyeDropper().open()
      if (i === null) add(sRGBHex.toUpperCase()); else upd(i, { hex: sRGBHex.toUpperCase() })
    } catch { /* cancelado */ }
  }

  const fromLogo = async () => {
    if (!logo) return toast.info('Envie a logo primeiro (aba Treinamento › Logo).')
    try {
      const { signedUrl } = await import('@/lib/storage')
      const img = await loadImage(await signedUrl(logo.storage_path, undefined, 'studio'), true)
      const found = extractPalette(img, 5).filter((h) => !value.some((c) => c.hex.toUpperCase() === h))
      if (!found.length) return toast.info('Não encontrei cores novas na logo.')
      onChange([...value, ...found.map((hex, k) => ({ hex, name: '', role: ROLE_ORDER[Math.min(value.length + k, ROLE_ORDER.length - 1)] }))])
      toast.success(`${found.length} cores extraídas da logo`)
    } catch { toast.error('Não foi possível ler a logo para extrair as cores.') }
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-4 flex h-14 overflow-hidden rounded-2xl ring-1 ring-black/5">
          {value.map((c, i) => (
            <div key={i} className="flex flex-1 items-end p-2 transition-all duration-300 hover:flex-[1.6]" style={{ background: c.hex, color: readableOn(c.hex) }}>
              <span className="truncate text-[10px] font-bold uppercase tracking-wider opacity-80">{COLOR_ROLES.find((r) => r.id === c.role)?.label}</span>
            </div>
          ))}
        </div>
      )}
      <ul className="space-y-2">
        {value.map((c, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-2 sm:flex-nowrap">
            <label className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-xl ring-1 ring-black/10" style={{ background: c.hex }} title="Escolher cor">
              <input type="color" value={isHex(c.hex) ? normHex(c.hex).slice(0, 7) : '#000000'} onChange={(e) => upd(i, { hex: e.target.value.toUpperCase() })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </label>
            <input className="input h-10 w-28 font-mono text-xs uppercase" value={c.hex} maxLength={7} onChange={(e) => upd(i, { hex: e.target.value })} onBlur={(e) => isHex(e.target.value) && upd(i, { hex: normHex(e.target.value) })} aria-label="Código HEX" />
            <input className="input h-10 min-w-[120px] flex-1" value={c.name} placeholder="Nome (ex.: Vermelho Forte)" onChange={(e) => upd(i, { name: e.target.value })} />
            <select className="input h-10 w-36 shrink-0" value={c.role} onChange={(e) => upd(i, { role: e.target.value as BrandColor['role'] })} aria-label="Função da cor">
              {COLOR_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <button type="button" className="btn-ghost h-10 w-10 shrink-0 p-0" title="Conta-gotas (qualquer lugar da tela)" onClick={() => eyedrop(i)}><Pipette className="h-4 w-4" /></button>
            <button type="button" className="btn-ghost h-10 w-10 shrink-0 p-0 hover:text-brand" title="Remover" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-outline" onClick={() => add()}><Plus className="h-4 w-4" />Adicionar cor</button>
        <button type="button" className="btn-outline" onClick={() => eyedrop(null)}><Pipette className="h-4 w-4" />Conta-gotas na tela</button>
        <button type="button" className="btn-outline" onClick={() => setPicker({ index: null })} disabled={!refs.length && !logo}><Palette className="h-4 w-4" />Pegar de uma imagem</button>
        <button type="button" className="btn-outline" onClick={fromLogo}><WandSparkles className="h-4 w-4" />Extrair da logo</button>
      </div>
      {picker && <ImagePickModal assets={[...(logo ? [logo] : []), ...refs]} onClose={() => setPicker(null)} onPick={(hex) => { add(hex); setPicker(null) }} />}
    </div>
  )
}

function ImagePickModal({ assets, onClose, onPick }: { assets: StudioAsset[]; onClose: () => void; onPick: (hex: string) => void }) {
  const [sel, setSel] = useState(assets[0])
  const url = useStudioUrl(sel?.storage_path)
  const imgRef = useRef<HTMLImageElement>(null)
  const [hover, setHover] = useState<{ hex: string; x: number; y: number } | null>(null)

  const at = (e: React.MouseEvent) => {
    const img = imgRef.current; if (!img) return null
    const r = img.getBoundingClientRect()
    try { return { hex: sampleColor(img, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height), x: e.clientX - r.left, y: e.clientY - r.top } } catch { return null }
  }
  return (
    <Modal open onClose={onClose} size="xl" title="Conta-gotas em uma imagem" subtitle="Passe o mouse e clique no ponto exato da cor que deseja usar.">
      <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
        <div className="relative flex min-h-[320px] items-center justify-center rounded-2xl bg-zinc-100 p-3">
          {url && (
            <div className="relative inline-block">
              <img ref={imgRef} src={url} crossOrigin="anonymous" alt="" className="max-h-[56vh] max-w-full cursor-crosshair rounded-lg"
                onMouseMove={(e) => setHover(at(e))} onMouseLeave={() => setHover(null)} onClick={(e) => { const c = at(e); if (c) onPick(c.hex) }} />
              {hover && (
                <div className="pointer-events-none absolute z-10 flex items-center gap-2 rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-white shadow-pop" style={{ left: hover.x + 14, top: hover.y + 14 }}>
                  <span className="h-4 w-4 rounded-full ring-2 ring-white" style={{ background: hover.hex }} />{hover.hex}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="max-h-[56vh] space-y-2 overflow-y-auto pr-1">
          {assets.map((a) => (
            <button key={a.id} type="button" onClick={() => setSel(a)} className={cn('block w-full overflow-hidden rounded-xl border-2 transition', sel?.id === a.id ? 'border-brand' : 'border-transparent hover:border-zinc-300')}>
              <StudioImg path={a.thumb_path ?? a.storage_path} className="aspect-[4/3]" />
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
