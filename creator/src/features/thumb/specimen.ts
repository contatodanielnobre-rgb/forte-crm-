// Amostra de letras: desenha o título com a FONTE REAL (Google Fonts) numa imagem simples. Essa imagem vai junto como referência para o
// gerador copiar o desenho exato das letras (em vez de inventar uma fonte "de IA" a partir só do nome).
const WEIGHTS: [RegExp, number][] = [[/extra\s*bold|ultra\s*bold/i, 800], [/semi\s*bold|demi\s*bold/i, 600], [/extra\s*light|ultra\s*light/i, 200], [/black|heavy/i, 900], [/bold/i, 700], [/medium/i, 500], [/light/i, 300], [/thin|hairline/i, 100], [/regular|normal|book/i, 400]]

/** "Montserrat ExtraBold" → { family: "Montserrat", weight: 800 } */
export function parseFont(hint: string): { family: string; weight: number | null } {
  let family = hint.split(/[,;(—–]| - | com | and | e | \+ /i)[0].trim().split(/\s+/).slice(0, 4).join(' '), weight: number | null = null
  for (const [re, w] of WEIGHTS) { if (re.test(family)) { weight = w; family = family.replace(re, '').replace(/\s+/g, ' ').trim(); break } }
  return { family: family.replace(/\s+(italic|itálico)$/i, '').trim(), weight }
}

const added = new Set<string>()
async function loadCss(href: string) {
  if (added.has(href)) return
  added.add(href)
  await new Promise<void>((ok) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = () => ok(); l.onerror = () => ok(); document.head.appendChild(l) })
}

/** Garante que a fonte está carregada no navegador. Tenta o peso pedido e, se a família não tiver, o padrão dela. */
export async function ensureFont(family: string, weight: number): Promise<{ ok: boolean; weight: number }> {
  const fam = encodeURIComponent(family).replace(/%20/g, '+')
  for (const w of [weight, 700, 400]) {
    await loadCss(`https://fonts.googleapis.com/css2?family=${fam}:wght@${w}&display=swap`)
    try { await document.fonts.load(`${w} 200px "${family}"`, 'ABCDEFGHIJ0123'); if (document.fonts.check(`${w} 200px "${family}"`, 'ABCDEFGHIJ')) return { ok: true, weight: w } } catch { /* tenta o próximo peso */ }
  }
  await loadCss(`https://fonts.googleapis.com/css2?family=${fam}&display=swap`)
  try { await document.fonts.load(`400 200px "${family}"`, 'ABCDEF'); return { ok: document.fonts.check(`400 200px "${family}"`, 'ABCDEF'), weight: 400 } } catch { return { ok: false, weight: 400 } }
}

/** Desenha o texto com a fonte e devolve um PNG (1824×560). Null se a fonte não existir no Google Fonts. */
export async function renderSpecimen(text: string, fontHint: string, defaultWeight = 800): Promise<Blob | null> {
  const { family, weight } = parseFont(fontHint)
  if (!family || !text.trim()) return null
  const f = await ensureFont(family, weight ?? defaultWeight)
  if (!f.ok) return null
  const W = 1824, H = 560
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#1b1b1d'; ctx.fillRect(0, 0, W, H)
  // quebra em até 2 linhas quando o título é longo
  const words = text.trim().split(/\s+/)
  let lines = [text.trim()]
  if (text.length > 16 && words.length > 1) { let best = 1, diff = 1e9; for (let i = 1; i < words.length; i++) { const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length); if (d < diff) { diff = d; best = i } } lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')] }
  let size = 360
  const fits = (s: number) => { ctx.font = `${f.weight} ${s}px "${family}"`; return lines.every((l) => ctx.measureText(l).width <= W - 160) && s * 1.05 * lines.length <= H - 60 }
  while (size > 60 && !fits(size)) size -= 8
  ctx.font = `${f.weight} ${size}px "${family}"`; ctx.fillStyle = '#f5f1e8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const lh = size * 1.05, top = H / 2 - (lh * (lines.length - 1)) / 2
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh))
  return new Promise((ok) => c.toBlob((b) => ok(b), 'image/png'))
}
