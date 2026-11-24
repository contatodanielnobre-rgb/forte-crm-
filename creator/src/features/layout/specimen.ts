// Amostra de duas fontes (títulos e texto) para o guia de estilo do layout.
import { ensureFont, parseFont } from '../thumb/specimen'

const WEIGHT_WORDS: Record<string, number> = { thin: 100, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 }
const toWeight = (w: string, d: number) => WEIGHT_WORDS[w.toLowerCase().replace(/[\s_-]/g, '')] ?? d

export async function renderTypePair(headingFont: string, headingWeight: string, bodyFont: string, bodyWeight: string, title: string): Promise<Blob | null> {
  const h = parseFont(headingFont), b = parseFont(bodyFont)
  if (!h.family) return null
  const hw = await ensureFont(h.family, h.weight ?? toWeight(headingWeight, 700))
  const bw = b.family ? await ensureFont(b.family, b.weight ?? toWeight(bodyWeight, 400)) : { ok: false, weight: 400 }
  if (!hw.ok) return null
  const W = 1824, H = 620
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#16161a'; ctx.textBaseline = 'alphabetic'
  ctx.font = `${hw.weight} 250px "${h.family}"`; ctx.fillText('Aa', 90, 280)
  let size = 96; const maxW = W - 620
  const text = title.slice(0, 40)
  while (size > 40) { ctx.font = `${hw.weight} ${size}px "${h.family}"`; if (ctx.measureText(text).width <= maxW) break; size -= 4 }
  ctx.fillText(text, 560, 200)
  ctx.font = `${hw.weight} 54px "${h.family}"`; ctx.fillText('ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789', 560, 290)
  if (bw.ok) {
    ctx.font = `${bw.weight} 44px "${b.family}"`; ctx.fillStyle = '#44444c'
    ctx.fillText('Texto de apoio legível, com letras claras e espaçamento confortável.', 90, 420)
    ctx.fillText('abcdefghijklmnopqrstuvwxyz  0123456789', 90, 490)
    ctx.font = `${bw.weight} 30px "${b.family}"`; ctx.fillStyle = '#7a7a84'; ctx.fillText(`${h.family} (títulos) · ${b.family} (texto)`, 90, 560)
  }
  return new Promise((ok) => c.toBlob((bl) => ok(bl), 'image/png'))
}
