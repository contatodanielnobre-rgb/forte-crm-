import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { buildModel, fetchImage, type LogoModel } from './engine'
import { useStudioUrl } from '@/features/studio/data'

/** Desenha o resultado de uma função assíncrona num <canvas> (refaz quando as dependências mudam; descarta resultados atrasados) */
export function CanvasView({ make, deps, className, checker, onError }: { make: () => Promise<HTMLCanvasElement>; deps: unknown[]; className?: string; checker?: boolean; onError?: (e: unknown) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    make().then((src) => {
      if (!alive || !ref.current) return
      const cv = ref.current
      cv.width = src.width; cv.height = src.height
      const ctx = cv.getContext('2d')!; ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(src, 0, 0)
      setReady(true)
    }).catch((e) => { if (alive) onError?.(e) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden', checker && 'bg-checker', className)}>
      {!ready && <div className="skeleton absolute inset-0 animate-shimmer" />}
      <canvas ref={ref} className={cn('max-h-full max-w-full object-contain transition-opacity', ready ? 'opacity-100' : 'opacity-0')} style={{ width: 'auto', height: 'auto' }} />
    </div>
  )
}

/** Carrega a logo aprovada e a decompõe em camadas (feito uma vez por versão) */
export function useLogoModel(path?: string | null) {
  const url = useStudioUrl(path)
  const [state, setState] = useState<{ model: LogoModel | null; error: string | null }>({ model: null, error: null })
  useEffect(() => {
    let alive = true
    setState({ model: null, error: null })
    if (!url) return
    fetchImage(url).then((img) => { if (alive) setState({ model: buildModel(img), error: null }) }).catch((e) => alive && setState({ model: null, error: e instanceof Error ? e.message : String(e) }))
    return () => { alive = false }
  }, [url])
  return { ...state, loading: !state.model && !state.error }
}

export function Swatch({ color, size = 20, className }: { color: string; size?: number; className?: string }) {
  return <span className={cn('inline-block shrink-0 rounded-md ring-1 ring-black/10', className)} style={{ width: size, height: size, background: color === 'transparent' ? 'repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 50% / 10px 10px' : color }} />
}

/** Carrossel horizontal com setas */
export function Carousel({ children, label }: { children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const go = (d: number) => ref.current?.scrollBy({ left: d * (ref.current.clientWidth * 0.8), behavior: 'smooth' })
  return (
    <div className="relative" role="region" aria-label={label}>
      <button type="button" aria-label="Anterior" onClick={() => go(-1)} className="absolute -left-3 top-[38%] z-10 hidden h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-lg shadow-card transition hover:bg-zinc-50 sm:flex">‹</button>
      <div ref={ref} className="flex snap-x gap-3 overflow-x-auto scroll-smooth pb-3 [scrollbar-width:thin]">{children}</div>
      <button type="button" aria-label="Próximo" onClick={() => go(1)} className="absolute -right-3 top-[38%] z-10 hidden h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-lg shadow-card transition hover:bg-zinc-50 sm:flex">›</button>
    </div>
  )
}
