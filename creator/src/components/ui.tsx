import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X, AlertTriangle } from 'lucide-react'
import { cn, initials } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin', className ?? 'h-5 w-5 text-zinc-400')} />
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-6 w-6 text-zinc-400" />
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton animate-shimmer rounded-xl', className)} />
}

export function Field({ label, error, hint, children, className }: { label?: string; error?: string | null; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs text-brand">{error}</span> : hint ? <span className="mt-1 block text-xs text-zinc-400">{hint}</span> : null}
    </label>
  )
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn('input', p.className)} />
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cn('input', p.className)} />
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn('input pr-8', p.className)} />

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // onClose costuma ser uma função nova a cada render; guardamos em ref para não refazer o efeito (e o foco)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    // Acessibilidade: leva o foco para dentro do diálogo e devolve ao elemento anterior ao fechar
    const before = document.activeElement as HTMLElement | null
    const t = setTimeout(() => {
      if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus({ preventScroll: true })
    }, 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      before?.focus?.({ preventScroll: true })
    }
  }, [open])
  if (!open) return null

  // Mantém o Tab dentro do diálogo
  const trap = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !panel.current || !panel.current.contains(e.target as Node)) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
    if (!items.length) { e.preventDefault(); return }
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-7xl' }[size]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-ink/60 backdrop-blur-[3px]" onClick={onClose} />
      <div
        ref={panel} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabIndex={-1} onKeyDown={trap}
        className={cn('relative flex max-h-[94vh] w-full animate-modal-in flex-col rounded-t-3xl bg-white shadow-pop outline-none ring-1 ring-black/5 sm:rounded-3xl', w)}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4">
            <div className="min-w-0">
              {title && <h2 id={titleId} className="font-display text-lg font-bold leading-tight">{title}</h2>}
              {subtitle && <div className="mt-0.5 text-sm text-zinc-500">{subtitle}</div>}
            </div>
            <button className="btn-ghost -mr-2 h-8 w-8 p-0" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-6 py-3 sm:rounded-b-3xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', danger, loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm" title={
      <span className="flex items-center gap-2">{danger && <AlertTriangle className="h-5 w-5 text-brand" />}{title}</span>
    } footer={<>
      <button className="btn-outline" onClick={onClose}>Cancelar</button>
      <button className={danger ? 'btn-brand' : 'btn-primary'} onClick={onConfirm} disabled={loading}>
        {loading && <Spinner className="h-4 w-4 text-white" />}{confirmLabel}
      </button>
    </>}>
      <div className="text-sm text-zinc-600">{message}</div>
    </Modal>
  )
}

export function Avatar({ name, url, size = 32, className }: { name?: string | null; url?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.38) }
  if (url) return <img src={url} alt={name ?? ''} style={style} className={cn('rounded-full object-cover ring-1 ring-black/5', className)} />
  return (
    <span style={style} className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-white ring-1 ring-black/5', /\bbg-/.test(className ?? '') ? '' : 'bg-ink', className)} title={name ?? ''}>
      {initials(name)}
    </span>
  )
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('chip', className ?? 'bg-zinc-100 text-zinc-700')}>{children}</span>
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-zinc-100', className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <div className="h-full animate-grow-x rounded-full bg-gradient-to-r from-brand to-brand-light transition-all duration-700 ease-out" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex animate-fade-up flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300/80 bg-white/50 px-6 py-14 text-center">
      {icon && <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-zinc-500 shadow-card ring-1 ring-zinc-200/70">{icon}</div>}
      <p className="font-display text-base font-semibold tracking-tight">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-zinc-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, tourPrefix }: { tabs: { id: T; label: string; icon?: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; tourPrefix?: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)
  const sig = tabs.map((t) => `${t.id}:${t.label}:${t.count ?? ''}`).join('|')

  // Barra indicadora que desliza até a aba ativa
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => {
      const btn = el.querySelector<HTMLElement>(`[data-tab="${value}"]`)
      if (btn) setBar((b) => (b && b.left === btn.offsetLeft + 8 && b.width === btn.offsetWidth - 16 ? b : { left: btn.offsetLeft + 8, width: btn.offsetWidth - 16 }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [value, sig])

  return (
    <div className="-mx-4 overflow-x-auto px-4 scrollbar-thin sm:mx-0 sm:px-0">
      <div ref={wrap} className="relative flex min-w-max gap-1 border-b border-zinc-200">
        {tabs.map((t) => (
          <button key={t.id} data-tab={t.id} onClick={() => onChange(t.id)} data-tour={tourPrefix ? `${tourPrefix}-${t.id}` : undefined}
            className={cn('relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium tracking-[-0.01em] transition-colors duration-200',
              value === t.id ? 'text-ink' : 'text-zinc-500 hover:text-ink')}>
            {t.icon}{t.label}
            {!!t.count && <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{t.count}</span>}
          </button>
        ))}
        {bar && <span className="pointer-events-none absolute -bottom-px h-0.5 rounded-full bg-brand transition-all duration-300 ease-out" style={{ left: bar.left, width: bar.width }} />}
      </div>
    </div>
  )
}

/** Número que "sobe" até o valor final (respeita prefers-reduced-motion) */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || from.current === value) { from.current = value; setShown(value); return }
    const start = from.current
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(start + (value - start) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{shown}</>
}

export function StatCard({ label, value, icon, tone = 'default', onClick, loading }: {
  label: string; value: number | string; icon: ReactNode; tone?: 'default' | 'brand' | 'warn' | 'ok'; onClick?: () => void; loading?: boolean
}) {
  const tones = {
    default: 'bg-zinc-100 text-ink',
    brand: 'bg-brand-soft text-brand',
    warn: 'bg-amber-50 text-amber-600',
    ok: 'bg-emerald-50 text-emerald-600',
  }
  return (
    <button onClick={onClick} disabled={!onClick} className="card card-hover group relative overflow-hidden p-4 text-left disabled:hover:translate-y-0 disabled:hover:border-zinc-200/70 disabled:hover:shadow-card">
      <div className="flex items-center justify-between">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-300 group-enabled:group-hover:scale-110', tones[tone])}>{icon}</span>
      </div>
      <div className="tabular mt-3 font-display text-3xl font-bold tracking-tight">
        {loading ? <Skeleton className="h-8 w-12" /> : typeof value === 'number' ? <CountUp value={value} /> : value}
      </div>
      <div className="mt-0.5 text-xs font-medium text-zinc-500">{label}</div>
    </button>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-[2rem] sm:leading-tight">{title}</h1>
        {subtitle && <div className="mt-1.5 text-sm text-zinc-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', disabled && 'cursor-not-allowed opacity-50')}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-brand' : 'bg-zinc-300')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ease-out', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      {label}
    </label>
  )
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function Logo({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn('relative flex h-9 w-9 items-center justify-center rounded-[11px] shadow-[0_6px_16px_-6px_rgba(0,0,0,.5)]', dark ? 'bg-white' : 'bg-ink')}>
        <span className={cn('font-display text-lg font-extrabold leading-none', dark ? 'text-ink' : 'text-white')}>F</span>
        <span className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-[1px] bg-brand" />
      </span>
      {!compact && (
        <span className="leading-none">
          <span className={cn('block font-display text-[15px] font-extrabold tracking-[-0.03em]', dark ? 'text-white' : 'text-ink')}>FORTE COMPANY</span>
          <span className="mt-1 block text-[9.5px] font-bold tracking-[0.34em] text-brand">CLIENTES</span>
        </span>
      )}
    </div>
  )
}
