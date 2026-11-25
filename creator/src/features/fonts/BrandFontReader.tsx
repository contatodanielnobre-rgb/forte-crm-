import { useState } from 'react'
import { toast } from 'sonner'
import { Type } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { errMsg } from '@/lib/utils'
import type { StudioAsset } from '@/features/studio/types'
import { FONT_CLASSES, computeFontProfile, fontLabel, type FontMatch } from '../../../supabase/functions/_shared/fonts'
import { FontSample } from './FontSample'
import { readFontOf } from './reader'

/** Carrosséis/posts: lê a fonte das imagens de referência da marca e sugere as fontes (títulos, texto, destaque) */
export default function BrandFontReader({ refs, onUse }: { refs: StudioAsset[]; onUse: (s: { title?: string; body?: string; accent?: string; list: string[] }) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [found, setFound] = useState<FontMatch[] | null>(null)
  const run = async () => {
    const list = refs.filter((r) => r.kind === 'reference').slice(0, 12)
    const out: FontMatch[] = []; let i = 0, done = 0
    setBusy(`Lendo as fontes (0/${list.length})…`)
    const worker = async () => { while (i < list.length) { const a = list[i++]; try { const m = await readFontOf({ id: a.id, text: [] }); if (m?.family) out.push(m) } catch { /* segue */ } done++; setBusy(`Lendo as fontes (${done}/${list.length})…`) } }
    try { await Promise.all([worker(), worker(), worker()]); setFound(out); if (!out.length) toast.message('Não achei texto legível nas referências.') } catch (e) { toast.error(errMsg(e)) } finally { setBusy(null) }
  }
  const prof = found ? computeFontProfile(found.map((fm) => ({ tags: [], hasText: true, fm })))._todas : null
  const fonts = prof?.fonts ?? []
  const use = () => {
    const heavy = fonts.find((f) => f.weight >= 700 || ['condensed', 'display_heavy', 'serif'].includes(f.cls)) ?? fonts[0]
    const body = fonts.find((f) => f.family !== heavy?.family && f.weight <= 500) ?? fonts.find((f) => f.family !== heavy?.family && f.cls === 'sans')
    const accent = fonts.find((f) => f.family !== heavy?.family && f.family !== body?.family && ['serif', 'script'].includes(f.cls))
    onUse({ title: heavy?.family, body: body?.family, accent: accent?.family, list: [...new Set(fonts.slice(0, 4).map((f) => f.family))] })
    toast.success('Fontes aplicadas. Salve a marca para guardar.')
  }
  return (
    <div className="mb-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3" data-testid="brand-font-reader">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-600"><b>Leitor de fontes:</b> a IA compara as letras das suas imagens de referência com centenas de fontes e sugere as mais parecidas.</p>
        <button type="button" className="btn-outline btn-sm" onClick={run} disabled={!!busy || !refs.length} data-testid="brand-font-read">{busy ? <><Spinner className="h-3.5 w-3.5" />{busy}</> : <><Type className="h-3.5 w-3.5" />Ler fontes das referências</>}</button>
      </div>
      {!refs.length && <p className="mt-2 text-[11px] text-zinc-500">Envie imagens de referência da marca (aba Referências) para o leitor trabalhar.</p>}
      {found && (fonts.length ? (
        <div className="mt-3">
          <ul className="space-y-1.5">{fonts.slice(0, 5).map((f) => <li key={f.family + f.weight} className="flex items-center gap-3"><FontSample family={f.family} weight={f.weight} className="w-28 shrink-0 truncate text-xl leading-none" /><span className="text-xs"><b>{fontLabel(f)}</b> <span className="text-zinc-500">· {FONT_CLASSES[f.cls] ?? f.cls} · {f.pct}% das referências</span></span></li>)}</ul>
          <button type="button" className="btn-brand btn-sm mt-3" onClick={use} data-testid="brand-font-use">Usar estas fontes na marca</button>
        </div>
      ) : <p className="mt-2 text-xs text-zinc-500">Nenhuma fonte identificada.</p>)}
    </div>
  )
}
