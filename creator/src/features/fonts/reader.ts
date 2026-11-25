// LEITOR DE FONTES (navegador): desenha o texto da imagem em dezenas de fontes candidatas numa folha numerada, manda a folha + a imagem para a IA de
// visão (ação font_analyze) e recebe a fonte MAIS PARECIDA. Usado no treino de thumbnails, no de carrosséis e no de layouts.
import { studioGenerate } from '@/features/studio/data'
import { ensureFont, parseFont } from '@/features/thumb/specimen'
import { guessClass, pickCandidates, weightOf, type Cand, type FontMatch } from '../../../supabase/functions/_shared/fonts'

export interface FontSource { id: string; text: string[]; hint?: string; alts?: string[]; weight?: string; case?: string; has_text?: boolean }

/** O que desenhar na folha: a maior palavra (ou duas curtas) do texto principal, na caixa observada */
export function sampleText(text: string[], letterCase?: string): string {
  const t = (text.find((x) => x.trim().length > 1) ?? text[0] ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return 'Rag Qg 123'
  const words = t.split(' ')
  let s = t
  if (t.length > 14) { const longest = [...words].sort((a, b) => b.length - a.length)[0]; const i = words.indexOf(longest); const pair = [words[i], words[i + 1]].filter(Boolean).join(' '); s = pair.length <= 14 ? pair : longest }
  return letterCase === 'upper' ? s.toUpperCase() : letterCase === 'lower' ? s.toLowerCase() : s
}

/** Desenha a folha (4 colunas) e devolve a imagem em JPEG (data URL) + as candidatas que carregaram, renumeradas de 1 */
export async function renderFontSheet(sample: string, cands: { family: string; weight: number }[]): Promise<{ dataUrl: string; cands: Cand[] } | null> {
  const loaded: { family: string; weight: number }[] = []
  for (let i = 0; i < cands.length; i += 6) {
    const part = await Promise.all(cands.slice(i, i + 6).map(async (c) => { const f = await ensureFont(c.family, c.weight); return f.ok ? { family: c.family, weight: f.weight } : null }))
    for (const p of part) if (p) loaded.push(p)
  }
  if (loaded.length < 4) return null
  const COLS = 4, CW = 400, CH = 190, rows = Math.ceil(loaded.length / COLS)
  const c = document.createElement('canvas'); c.width = COLS * CW; c.height = rows * CH
  const g = c.getContext('2d')!
  g.fillStyle = '#16161a'; g.fillRect(0, 0, c.width, c.height)
  loaded.forEach((f, i) => {
    const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH
    g.strokeStyle = '#34343c'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, CW - 2, CH - 2)
    let size = 92; g.font = `${f.weight} ${size}px "${f.family}"`
    while (size > 22 && g.measureText(sample).width > CW - 70) { size -= 4; g.font = `${f.weight} ${size}px "${f.family}"` }
    g.fillStyle = '#f5f1e8'; g.textBaseline = 'middle'; g.textAlign = 'left'
    g.fillText(sample, x + 20, y + CH * 0.42)
    g.font = `${f.weight} 34px "${f.family}"`; g.fillStyle = '#b9b5ab'
    g.fillText('Rag QgS 1250', x + 20, y + CH * 0.78)
    g.fillStyle = '#ffd23f'; g.fillRect(x + CW - 52, y + 8, 44, 34); g.fillStyle = '#16161a'; g.font = '700 24px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(String(i + 1), x + CW - 30, y + 26)
  })
  return { dataUrl: c.toDataURL('image/jpeg', 0.86), cands: loaded.map((f, i) => ({ n: i + 1, family: f.family, weight: f.weight })) }
}

async function ask(assetId: string, sample: string, sheet: { dataUrl: string; cands: Cand[] }, hint: string, save: boolean, onlyBetter = false): Promise<FontMatch | null> {
  const r = await studioGenerate<{ match: FontMatch | null }>({ action: 'font_analyze', asset_id: assetId, sheet: sheet.dataUrl, cands: sheet.cands, text: sample, hint, save, only_better: onlyBetter })
  return r.match
}

/** Lê a fonte de UMA imagem em até 2 rodadas: 1ª com palpites e classes variadas; se a confiança for baixa, 2ª só com vizinhas da classe achada */
export async function readFontOf(src: FontSource, opts: { save?: boolean } = {}): Promise<FontMatch | null> {
  const save = opts.save !== false
  const sample = sampleText(src.text, src.case)
  const guesses = [src.hint, ...(src.alts ?? [])].filter(Boolean).slice(0, 3).map((h) => { const p = parseFont(h!); return { family: p.family, weight: p.weight ?? undefined } }).filter((g) => g.family)
  const w = weightOf(src.weight)
  const r1 = pickCandidates({ guesses, cls: guessClass(src.hint ?? ''), weight: w, n: 24, wide: true })
  const s1 = await renderFontSheet(sample, r1)
  if (!s1) return null
  const m1 = await ask(src.id, sample, s1, src.hint ?? '', save)
  if (!m1 || m1.confidence >= 0.7 || !m1.family) return m1
  // 2ª rodada: refina dentro da classe que a IA apontou (inclui a melhor da 1ª e as alternativas como palpites)
  const tried = new Set(s1.cands.map((c) => `${c.family.toLowerCase()}|${c.weight}`))
  const g2 = [{ family: m1.family, weight: m1.weight }, ...m1.alts.map((a) => ({ family: a.family, weight: a.weight }))]
  const r2 = pickCandidates({ guesses: g2, cls: m1.cls, weight: m1.weight, n: 24, exclude: tried })
  const s2 = await renderFontSheet(sample, r2)
  if (!s2) return m1
  const m2 = await ask(src.id, sample, s2, m1.family, save, true) // o servidor só grava se a 2ª rodada for mais confiante que a 1ª
  return m2 && m2.family && m2.confidence > m1.confidence ? m2 : m1
}

export const fontCss = (family: string, weight: number) => `${weight} 1em "${family}", system-ui, sans-serif`
export { ensureFont }
