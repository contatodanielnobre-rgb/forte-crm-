import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStudioUrl } from './data'

/** Imagem do bucket privado "studio" com esqueleto enquanto carrega */
export function StudioImg({ path, alt = '', className, cross, onLoad, fit = 'cover' }: {
  path?: string | null; alt?: string; className?: string; cross?: boolean; onLoad?: (img: HTMLImageElement) => void; fit?: 'cover' | 'contain'
}) {
  const url = useStudioUrl(path)
  const [ok, setOk] = useState(false)
  useEffect(() => setOk(false), [url])
  return (
    <div className={cn('relative overflow-hidden bg-zinc-100', className)}>
      {!ok && <div className="skeleton absolute inset-0 animate-shimmer" />}
      {url && (
        <img src={url} alt={alt} loading="lazy" crossOrigin={cross ? 'anonymous' : undefined}
          onLoad={(e) => { setOk(true); onLoad?.(e.currentTarget) }}
          className={cn('h-full w-full transition-opacity duration-300', fit === 'cover' ? 'object-cover' : 'object-contain', ok ? 'opacity-100' : 'opacity-0')} />
      )}
    </div>
  )
}

/** Painel flutuante que fecha ao clicar fora; abre para cima (composer) ou para baixo */
export function Popover({ trigger, children, up, align = 'left', width = 320, className }: {
  trigger: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; up?: boolean; align?: 'left' | 'right'; width?: number; className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const key = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div className={cn('relative', className)} ref={ref}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div style={{ width }} className={cn('absolute z-40 animate-scale-in rounded-2xl border border-zinc-200/80 bg-white p-2 shadow-pop', up ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top', align === 'right' ? 'right-0' : 'left-0')}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** Campo de etiquetas (Enter ou vírgula adiciona; Backspace remove a última) */
export function TagInput({ value, onChange, placeholder, prefix, suggestions }: {
  value: string[]; onChange: (v: string[]) => void; placeholder?: string; prefix?: string; suggestions?: string[]
}) {
  const [text, setText] = useState('')
  const add = (raw: string) => {
    let t = raw.trim().replace(/,$/, '')
    if (!t) return
    if (prefix && !t.startsWith(prefix)) t = prefix + t.replace(/^[#@]+/, '')
    if (!value.includes(t)) onChange([...value, t])
    setText('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text) }
    else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
  }
  const free = (suggestions ?? []).filter((s) => !value.includes(s))
  return (
    <div>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-2 py-1.5 transition focus-within:border-ink focus-within:ring-4 focus-within:ring-ink/[.06]">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-white">
            {t}<button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remover ${t}`} className="opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onBlur={() => add(text)} placeholder={value.length ? '' : placeholder}
          className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-zinc-400" />
      </div>
      {free.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {free.map((s) => <button key={s} type="button" onClick={() => onChange([...value, s])} className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600 transition hover:border-ink hover:text-ink">+ {s}</button>)}
        </div>
      )}
    </div>
  )
}

/** Chips selecionáveis (estilo, tom…) */
export function ChipSelect({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o)
        return (
          <button key={o} type="button" onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition', on ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 hover:text-ink')}>
            {on && <Check className="h-3 w-3" />}{o}
          </button>
        )
      })}
    </div>
  )
}

export function SectionCard({ icon, title, hint, children, className, id }: { icon?: ReactNode; title: string; hint?: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('card p-5 sm:p-6', className)}>
      <div className="mb-4 flex items-start gap-3">
        {icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-ink">{icon}</span>}
        <div><h3 className="font-display text-[15px] font-semibold tracking-tight">{title}</h3>{hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}</div>
      </div>
      {children}
    </section>
  )
}

/** Lista editável de frases (regras "sempre" / "nunca") */
export function RuleList({ value, onChange, placeholder, tone }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; tone: 'ok' | 'no' }) {
  const [text, setText] = useState('')
  const add = () => { const t = text.trim(); if (t) { onChange([...value, t]); setText('') } }
  return (
    <div>
      <ul className="space-y-1.5">
        {value.map((r, i) => (
          <li key={i} className={cn('group flex items-start gap-2 rounded-xl px-3 py-2 text-sm', tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-brand-soft text-red-900')}>
            <span className="mt-0.5 shrink-0">{tone === 'ok' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}</span>
            <span className="flex-1">{r}</span>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="opacity-0 transition group-hover:opacity-70" aria-label="Remover"><X className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <input className="input h-9" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button type="button" className="btn-outline" onClick={add}>Adicionar</button>
      </div>
    </div>
  )
}

export function Select2({ value, onChange, options, className }: { value: string; onChange: (v: string) => void; options: { id: string; label: string }[]; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input h-9 appearance-none pr-8">
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
    </div>
  )
}
