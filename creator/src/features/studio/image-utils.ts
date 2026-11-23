import type { Marker } from './types'

export function loadImage(src: string | Blob, cross = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (cross) img.crossOrigin = 'anonymous'
    const url = typeof src === 'string' ? src : URL.createObjectURL(src)
    img.onload = () => { if (typeof src !== 'string') setTimeout(() => URL.revokeObjectURL(url), 5000); resolve(img) }
    img.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    img.src = url
  })
}

export const canvasToBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao gerar imagem.'))), type, q))

/** Reduz a imagem para no máximo `max` px no lado maior (mantém PNG se for PNG; senão JPEG). Devolve o mesmo arquivo se já couber. */
export async function resizeImage(file: File, max = 1600): Promise<File> {
  const img = await loadImage(file)
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height
  if (Math.max(w, h) <= max) return file
  const k = max / Math.max(w, h)
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  const png = file.type === 'image/png'
  const blob = await canvasToBlob(c, png ? 'image/png' : 'image/jpeg', 0.92)
  return new File([blob], file.name.replace(/.[^.]+$/, '') + (png ? '.png' : '.jpg'), { type: blob.type })
}

/** Dimensões + miniatura (lado maior = max) para a biblioteca ficar rápida mesmo com 100 imagens */
export async function readMeta(file: File, max = 560): Promise<{ width: number; height: number; thumb: Blob | null }> {
  const img = await loadImage(file)
  const width = img.naturalWidth || img.width, height = img.naturalHeight || img.height
  try {
    const k = Math.min(1, max / Math.max(width, height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(width * k)); c.height = Math.max(1, Math.round(height * k))
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return { width, height, thumb: await canvasToBlob(c, 'image/jpeg', 0.82) }
  } catch {
    return { width, height, thumb: null }
  }
}

// ---------------------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------------------
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
export const isHex = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())
export function normHex(v: string) {
  let s = v.trim().toUpperCase()
  if (!s.startsWith('#')) s = '#' + s
  if (/^#[0-9A-F]{3}$/.test(s)) s = '#' + s.slice(1).split('').map((c) => c + c).join('')
  return s
}
export function readableOn(h: string) {
  const n = normHex(h); const r = parseInt(n.slice(1, 3), 16), g = parseInt(n.slice(3, 5), 16), b = parseInt(n.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0B0B0C' : '#FFFFFF'
}

/** Cor do pixel clicado numa imagem (a imagem precisa ter vindo com CORS liberado) */
export function sampleColor(img: HTMLImageElement, fx: number, fy: number) {
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const x = Math.min(c.width - 1, Math.max(0, Math.round(fx * c.width))), y = Math.min(c.height - 1, Math.max(0, Math.round(fy * c.height)))
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data
  return hex(r, g, b)
}

/** Paleta dominante (quantização simples por caixas de 5 bits, ignora transparente/quase branco-cinza repetitivo) */
export function extractPalette(img: HTMLImageElement, n = 5): string[] {
  const size = 96
  const c = document.createElement('canvas'); c.width = size; c.height = size
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data
  const bins = new Map<number, { r: number; g: number; b: number; n: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const e = bins.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
    e.r += r; e.g += g; e.b += b; e.n++; bins.set(key, e)
  }
  const sorted = [...bins.values()].map((e) => ({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n, n: e.n })).sort((a, b) => b.n - a.n)
  const out: { r: number; g: number; b: number }[] = []
  for (const s of sorted) {
    if (out.every((o) => Math.hypot(o.r - s.r, o.g - s.g, o.b - s.b) > 48)) out.push(s)
    if (out.length >= n) break
  }
  return out.map((o) => hex(Math.round(o.r), Math.round(o.g), Math.round(o.b)))
}

// ---------------------------------------------------------------------------------
// Edição por marcadores
// ---------------------------------------------------------------------------------
/** Máscara PNG para a API de edição: opaca em tudo, TRANSPARENTE nas áreas marcadas (onde a IA pode alterar) */
export async function buildMaskB64(img: HTMLImageElement, markers: Marker[]): Promise<string> {
  const w = img.naturalWidth, h = img.naturalHeight
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'destination-out'
  for (const m of markers) {
    ctx.beginPath(); ctx.arc((m.x / 100) * w, (m.y / 100) * h, (m.r / 100) * Math.min(w, h), 0, Math.PI * 2); ctx.fill()
  }
  return (await canvasToBlob(c, 'image/png')).arrayBuffer().then(toB64)
}

/** Máscara retangular (em % da imagem): transparente dentro das caixas, opaca no resto. Usada para trocar um texto com IA. */
export async function buildRectMaskB64(img: HTMLImageElement, rects: { x: number; y: number; w: number; h: number }[]): Promise<string> {
  const w = img.naturalWidth, h = img.naturalHeight
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'destination-out'
  for (const r of rects) ctx.fillRect((r.x / 100) * w, (r.y / 100) * h, (r.w / 100) * w, (r.h / 100) * h)
  return (await canvasToBlob(c, 'image/png')).arrayBuffer().then(toB64)
}

/** Cópia da imagem com os marcadores numerados desenhados (guia visual para modelos sem máscara) */
export async function buildAnnotatedB64(img: HTMLImageElement, markers: Marker[]): Promise<string> {
  const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  markers.forEach((m, i) => {
    const x = (m.x / 100) * w, y = (m.y / 100) * h, r = (m.r / 100) * Math.min(w, h)
    ctx.lineWidth = Math.max(3, w / 220); ctx.strokeStyle = '#E10600'; ctx.fillStyle = 'rgba(225,6,0,.18)'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    const d = Math.max(16, w / 40)
    ctx.fillStyle = '#E10600'; ctx.beginPath(); ctx.arc(x, y, d, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = `700 ${d * 1.2}px Inter, Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, y + 1)
  })
  return (await canvasToBlob(c, 'image/jpeg', 0.88)).arrayBuffer().then(toB64)
}

function toB64(buf: ArrayBuffer) {
  const u8 = new Uint8Array(buf); let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s)
}
