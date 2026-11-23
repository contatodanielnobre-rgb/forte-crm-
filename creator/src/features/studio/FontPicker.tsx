import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CAT_LABEL, POPULAR_FONTS, isGoogle, previewFont, searchFonts, useFonts, type FontCat } from './fonts'

const CATS = Object.entries(CAT_LABEL) as [FontCat, string][]

/**
 * Seletor de fontes com busca: digite parte do nome, escolha na lista e ela vira um chip (clique no X para tirar).
 * Enter adiciona o item destacado, ou o texto digitado como nome livre. Setas navegam. Backspace no campo vazio remove a última.
 */
export default function FontPicker({ value, onChange, placeholder = 'Digite o nome de uma fonte…', max = 14, disabled }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number; disabled?: boolean }) {
  const all = useFonts()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [cat, setCat] = useState<FontCat | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const have = useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value])
  const results = useMemo(() => searchFonts(all, q, cat, 8, have), [all, q, cat, have])
  const free = q.trim().length > 1 && !all.some((f) => f.name.toLowerCase() === q.trim().toLowerCase()) && !have.has(q.trim().toLowerCase())
  const rows = [...results.map((f) => ({ name: f.name, cat: f.cat, src: f.src, free: false })), ...(free ? [{ name: q.trim(), cat: null as FontCat | null, src: 'o' as const, free: true }] : [])]

  useEffect(() => { setHi(0) }, [q, cat])
  useEffect(() => { rows.forEach((r) => { if (r.src === 'g') previewFont(r.name) }) }, [rows.map((r) => r.name).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { value.forEach((v) => { if (isGoogle(all, v)) previewFont(v) }) }, [value, all])
  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away); return () => document.removeEventListener('mousedown', away)
  }, [])

  const add = (name: string) => {
    const n = name.trim()
    if (!n || have.has(n.toLowerCase()) || value.length >= max) return
    onChange([...value, n]); setQ(''); setHi(0)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(rows.length - 1, h + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
    else if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); const r = rows[hi]; if (r) add(r.name); else if (q.trim()) add(q) }
    else if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'Backspace' && !q && value.length) onChange(value.slice(0, -1))
  }

  return (
    <div ref={box} className="relative">
      <div className={cn('flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-xl border bg-white px-2.5 py-1.5 transition', open ? 'border-ink ring-2 ring-ink/10' : 'border-zinc-200', disabled && 'opacity-50')}>
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1.5 rounded-lg bg-ink py-1 pl-2.5 pr-1.5 text-sm text-white">
            <span style={{ fontFamily: `"${v}", system-ui, sans-serif` }}>{v}</span>
            {!disabled && <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remover ${v}`} className="rounded p-0.5 text-white/60 hover:bg-white/15 hover:text-white"><X className="h-3.5 w-3.5" /></button>}
          </span>
        ))}
        <span className="relative flex min-w-[160px] flex-1 items-center">
          <Search className="pointer-events-none absolute left-1 h-4 w-4 text-zinc-400" />
          <input value={q} disabled={disabled || value.length >= max} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={onKey}
            placeholder={value.length >= max ? `Máximo de ${max} fontes` : value.length ? 'Adicionar outra…' : placeholder}
            className="h-8 w-full bg-transparent pl-6 text-sm focus:outline-none" role="combobox" aria-expanded={open} aria-autocomplete="list" spellCheck={false} autoComplete="off" />
        </span>
      </div>

      {open && !disabled && value.length < max && (
        <div className="absolute left-0 right-0 z-40 mt-1.5 animate-scale-in overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-pop">
          <div className="flex flex-wrap gap-1 border-b border-zinc-100 px-2.5 py-2">
            <button type="button" onClick={() => setCat(null)} className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition', !cat ? 'bg-ink text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')}>Todas</button>
            {CATS.map(([id, label]) => <button key={id} type="button" onClick={() => setCat(cat === id ? null : id)} className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition', cat === id ? 'bg-ink text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')}>{label}</button>)}
            <span className="ml-auto self-center text-[10px] text-zinc-400">{all.length ? `${all.length.toLocaleString('pt-BR')} fontes no catálogo` : 'carregando…'}</span>
          </div>
          {!q && !cat && (
            <div className="flex flex-wrap gap-1 border-b border-zinc-100 px-2.5 py-2">
              <span className="mr-1 self-center text-[10px] font-bold uppercase tracking-wide text-zinc-400">Populares</span>
              {POPULAR_FONTS.filter((f) => !have.has(f.toLowerCase())).slice(0, 8).map((f) => <button key={f} type="button" onClick={() => add(f)} className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs text-zinc-600 hover:border-ink hover:text-ink">+ {f}</button>)}
            </div>
          )}
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {rows.map((r, i) => (
              <li key={r.name} role="option" aria-selected={i === hi}>
                <button type="button" onMouseEnter={() => setHi(i)} onClick={() => add(r.name)} className={cn('flex w-full items-center gap-3 px-3.5 py-2 text-left', i === hi && 'bg-zinc-50')}>
                  {r.free ? <Plus className="h-4 w-4 text-brand" /> : null}
                  <span className="min-w-0 flex-1 truncate text-lg leading-tight" style={{ fontFamily: r.src === 'g' || r.free ? `"${r.name}", system-ui, sans-serif` : `"${r.name}", system-ui, sans-serif` }}>{r.free ? <>Adicionar <b className="font-semibold">“{r.name}”</b> (nome livre)</> : r.name}</span>
                  {!r.free && r.cat && <span className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">{CAT_LABEL[r.cat]}</span>}
                </button>
              </li>
            ))}
            {!rows.length && <li className="px-4 py-5 text-center text-sm text-zinc-500">Nenhuma fonte encontrada. Digite o nome completo e pressione Enter para adicionar mesmo assim.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
