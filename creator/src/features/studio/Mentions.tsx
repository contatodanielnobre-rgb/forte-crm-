import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Car, ImageIcon, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StudioImg } from './ui'

export interface MentionItem { id: string; label: string; kind: 'character' | 'object' | 'logo'; thumb?: string | null; hint?: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const KIND_LABEL: Record<MentionItem['kind'], string> = { character: 'Personagem', object: 'Objeto', logo: 'Logo' }
export const KindIcon = ({ kind, className }: { kind: MentionItem['kind']; className?: string }) => kind === 'character' ? <User className={className} /> : kind === 'object' ? <Car className={className} /> : <ImageIcon className={className} />

/** Quais itens foram citados com @ no texto (ex.: "@Dennis aparece na capa") */
export function findMentions(text: string, items: MentionItem[]): MentionItem[] {
  const t = norm(text)
  return items.filter((i) => {
    const l = norm(i.label)
    if (!l) return false
    const at = t.indexOf('@' + l)
    if (at < 0) return false
    const after = t[at + 1 + l.length]
    return !after || !/[\p{L}\p{N}_]/u.test(after) // "@Dennis" não casa com "@Dennisson"
  })
}

/** Campo de texto com menu @ para citar personagens, objetos e a logo */
export const MentionTextarea = forwardRef<HTMLTextAreaElement, {
  value: string; onChange: (v: string) => void; items: MentionItem[]; rows?: number; className?: string; placeholder?: string; ariaLabel?: string; dataTour?: string
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void; input?: boolean
}>(function MentionTextarea({ value, onChange, items, rows = 4, className, placeholder, ariaLabel, dataTour, onKeyDown }, fwd) {
  const ta = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(fwd, () => ta.current as HTMLTextAreaElement)
  const [q, setQ] = useState<{ start: number; text: string } | null>(null)
  const [sel, setSel] = useState(0)

  const list = useMemo(() => {
    if (!q) return []
    const n = norm(q.text)
    return items.filter((i) => norm(i.label).includes(n) || (n === '' )).slice(0, 8)
  }, [q, items])

  const detect = (v: string, caret: number) => {
    const before = v.slice(0, caret)
    const m = /(^|[\s(])@([\p{L}\p{N}_]*)$/u.exec(before)
    if (m && items.length) { setQ({ start: caret - m[2].length - 1, text: m[2] }); setSel(0) } else setQ(null)
  }
  const pick = (it: MentionItem) => {
    if (!q || !ta.current) return
    const caret = ta.current.selectionStart ?? value.length
    const next = value.slice(0, q.start) + '@' + it.label + ' ' + value.slice(caret)
    onChange(next); setQ(null)
    const pos = q.start + it.label.length + 2
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(pos, pos) })
  }
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (q && list.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % list.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + list.length) % list.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(list[sel]); return }
      if (e.key === 'Escape') { e.preventDefault(); setQ(null); return }
    }
    onKeyDown?.(e)
  }
  return (
    <div className="relative">
      <textarea ref={ta} value={value} rows={rows} className={className} placeholder={placeholder} aria-label={ariaLabel} data-tour={dataTour}
        onChange={(e) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart ?? e.target.value.length) }}
        onKeyDown={key} onClick={(e) => detect(value, e.currentTarget.selectionStart ?? 0)} onBlur={() => setTimeout(() => setQ(null), 150)} />
      {q && list.length > 0 && (
        <div role="listbox" data-testid="mention-menu" className="absolute left-2 top-full z-40 mt-1 w-72 animate-scale-in overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-pop">
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">Citar com @</p>
          {list.map((it, i) => (
            <button key={it.id} type="button" role="option" aria-selected={i === sel} onMouseDown={(e) => { e.preventDefault(); pick(it) }} onMouseEnter={() => setSel(i)}
              className={cn('flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition', i === sel ? 'bg-zinc-100' : 'hover:bg-zinc-50')}>
              {it.thumb ? <StudioImg path={it.thumb} className="h-8 w-8 shrink-0 rounded-lg" /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500"><KindIcon kind={it.kind} className="h-4 w-4" /></span>}
              <span className="min-w-0 flex-1"><b className="block truncate text-sm">@{it.label}</b><span className="block truncate text-[11px] text-zinc-500">{KIND_LABEL[it.kind]}{it.hint ? ` · ${it.hint}` : ''}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
