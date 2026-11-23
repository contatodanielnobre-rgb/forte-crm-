import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, Maximize, Minimize, X, ZoomIn } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStudioUrl } from './data'
import type { StudioImage } from './types'

export interface ViewerSlide { index: number; current: StudioImage }

function Thumb({ path, active, onClick, label }: { path: string | null; active: boolean; onClick: () => void; label: string }) {
  const url = useStudioUrl(path)
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-current={active}
      className={cn('relative h-12 shrink-0 sm:h-16 overflow-hidden rounded-lg bg-zinc-800 ring-2 transition', active ? 'ring-white' : 'opacity-60 ring-transparent hover:opacity-100')}>
      {url ? <img src={url} alt="" className="h-full w-auto object-contain" /> : <span className="block h-full w-12" />}
    </button>
  )
}

/**
 * Visualizador de slides/posts em tela cheia. A imagem é sempre mostrada INTEIRA, qualquer que seja a proporção (1:1, 4:5, 9:16, 16:9…):
 * o palco ocupa o espaço que sobra entre o topo e as miniaturas e a imagem se ajusta a ele (object-contain).
 * "100%" mostra os pixels reais com rolagem. Setas do teclado navegam, Esc fecha, F alterna ajustar/100%.
 */
export default function SlideViewer({ slides, start, aspectLabel, onClose }: { slides: ViewerSlide[]; start: number; aspectLabel: string; onClose: () => void }) {
  const [i, setI] = useState(Math.max(0, slides.findIndex((s) => s.index === start)))
  const [fit, setFit] = useState(true)
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null)
  const closeRef = useRef(onClose); closeRef.current = onClose
  const s = slides[Math.min(i, slides.length - 1)]
  const url = useStudioUrl(s?.current.storage_path)

  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      else if (e.key === 'ArrowRight') setI((x) => Math.min(slides.length - 1, x + 1))
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
      else if (e.key.toLowerCase() === 'f') setFit((v) => !v)
    }
    window.addEventListener('keydown', k)
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [slides.length])
  useEffect(() => { setDim(null) }, [i])

  if (!s) return null
  const real = dim ?? (s.current.width && s.current.height ? { w: s.current.width, h: s.current.height } : null)
  const label = `${s.current.version > 1 ? `versão ${s.current.version} · ` : ''}${aspectLabel}${real ? ` · ${real.w}×${real.h}px` : ''}`

  return createPortal(
    <div className="fixed inset-0 z-[90] flex animate-fade-up flex-col bg-zinc-950/95 text-white backdrop-blur-md" role="dialog" aria-modal="true" aria-label={`Slide ${s.index} de ${slides.length}`}>
      <header className="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="font-display text-base font-semibold tracking-tight">Slide {s.index} de {slides.length}</p>
          <p className="truncate text-xs text-zinc-400">{label}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => setFit((v) => !v)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-medium hover:bg-white/20" title="Alternar entre ajustar à tela e tamanho real (F)">
            {fit ? <ZoomIn className="h-4 w-4" /> : <Minimize className="h-4 w-4" />}{fit ? 'Tamanho real' : 'Ajustar à tela'}
          </button>
          {url && <a href={url} download={`slide-${s.index}.png`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-medium hover:bg-white/20"><Download className="h-4 w-4" /><span className="hidden sm:inline">Baixar</span></a>}
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"><X className="h-5 w-5" /></button>
        </div>
      </header>

      {/* palco: ocupa todo o espaço livre; a imagem se ajusta a ele sem cortar */}
      <div className={cn('relative min-h-0 flex-1 px-4 sm:px-16', fit ? 'overflow-hidden' : 'overflow-auto')} onClick={(e) => { if (e.target === e.currentTarget && fit) onClose() }}>
        {url ? (
          <img key={s.current.id} src={url} alt={s.current.slide_text ?? `Slide ${s.index}`}
            onLoad={(e) => setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className={cn('mx-auto block animate-scale-in rounded-lg shadow-2xl', fit ? 'h-full w-full object-contain' : 'max-w-none')} />
        ) : <div className="flex h-full items-center justify-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" /></div>}
        {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="fixed left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-pop hover:bg-white sm:left-4" aria-label="Anterior"><ChevronLeft className="h-5 w-5" /></button>}
        {i < slides.length - 1 && <button type="button" onClick={() => setI(i + 1)} className="fixed right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-pop hover:bg-white sm:right-4" aria-label="Próximo"><ChevronRight className="h-5 w-5" /></button>}
      </div>

      <footer className="shrink-0 space-y-2 px-4 pb-4 pt-3 sm:px-6">
        {s.current.slide_text && <p className="mx-auto max-w-3xl truncate text-center text-xs text-zinc-400 [@media(max-height:700px)]:hidden" title={s.current.slide_text}>{s.current.slide_text.replace(/\n+/g, ' · ')}</p>}
        {slides.length > 1 && (
          <div className="mx-auto flex max-w-full justify-start gap-2 overflow-x-auto pb-1 sm:justify-center">
            {slides.map((x, k) => <Thumb key={x.current.id} path={x.current.storage_path} active={k === i} onClick={() => setI(k)} label={`Ir para o slide ${x.index}`} />)}
          </div>
        )}
        <p className="hidden text-center text-[11px] text-zinc-500 sm:block [@media(max-height:700px)]:hidden"><Maximize className="mr-1 inline h-3 w-3" />← → navegam · F ajusta/tamanho real · Esc fecha</p>
      </footer>
    </div>,
    document.body,
  )
}
