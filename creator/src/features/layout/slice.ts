// Transforma o que o usuário sobe (prints, PDF, vídeo de rolagem) em RECORTES de página em ordem de rolagem,
// do tamanho que a IA de visão lê bem (largura até 1400 px, cada recorte com a altura de ~0,64 da largura, com 6% de sobreposição).
export interface Slice { blob: Blob; width: number; height: number; name: string }

const MAX_W = 1400
const MAX_SLICES_PER_PAGE = 14
export const ACCEPT_SITE = 'image/*,application/pdf,video/webm,video/mp4,video/quicktime,.webp,.pdf,.webm,.mp4'
export const isSiteFile = (f: File) => /^image\//.test(f.type) || f.type === 'application/pdf' || /^video\//.test(f.type) || /\.(png|jpe?g|webp|pdf|webm|mp4|mov)$/i.test(f.name)

const toBlob = (c: HTMLCanvasElement, q = 0.86) => new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('Não consegui gerar a imagem.'))), 'image/jpeg', q))

function canvasOf(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }

/** Corta uma página (canvas alto) em recortes sequenciais com leve sobreposição */
async function sliceCanvas(src: HTMLCanvasElement, base: string): Promise<Slice[]> {
  const w = src.width, h = src.height
  let step = Math.round(w * 0.64)
  const over = Math.round(step * 0.06)
  if (h <= step * 1.3) return [{ blob: await toBlob(src), width: w, height: h, name: `${base}.jpg` }]
  // se a página for muito comprida, aumenta a altura de cada recorte para não passar do limite
  step = Math.max(step, Math.ceil(h / MAX_SLICES_PER_PAGE))
  const out: Slice[] = []
  for (let y = 0, n = 1; y < h; y += step - over, n++) {
    const sh = Math.min(step, h - y)
    if (sh < w * 0.12 && out.length) break // sobra minúscula: já coberta pela sobreposição
    const c = canvasOf(w, sh); c.getContext('2d')!.drawImage(src, 0, y, w, sh, 0, 0, w, sh)
    out.push({ blob: await toBlob(c), width: w, height: sh, name: `${base}-${String(n).padStart(2, '0')}.jpg` })
    if (y + sh >= h) break
  }
  return out
}

const baseName = (f: File) => f.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40) || 'site'

async function imageSlices(file: File): Promise<Slice[]> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, MAX_W / bmp.width)
  const c = canvasOf(Math.round(bmp.width * scale), Math.round(bmp.height * scale))
  const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return sliceCanvas(c, baseName(file))
}

async function pdfSlices(file: File, onProgress?: (p: number) => void): Promise<Slice[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const out: Slice[] = []
  const pages = Math.min(doc.numPages, 14)
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p)
    const v1 = page.getViewport({ scale: 1 })
    const view = page.getViewport({ scale: Math.min(2, MAX_W / v1.width) })
    const c = canvasOf(Math.round(view.width), Math.round(view.height))
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    await page.render({ canvasContext: ctx, viewport: view }).promise
    out.push(...await sliceCanvas(c, `${baseName(file)}-p${p}`))
    onProgress?.(p / pages)
  }
  await doc.destroy()
  return out
}

/** Vídeo de rolagem de um site: tira quadros espaçados e descarta os repetidos */
async function videoSlices(file: File, onProgress?: (p: number) => void): Promise<Slice[]> {
  const url = URL.createObjectURL(file)
  try {
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = url
    await new Promise<void>((ok, bad) => { v.onloadedmetadata = () => ok(); v.onerror = () => bad(new Error('Não consegui abrir o vídeo.')) })
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 20
    const n = Math.max(4, Math.min(24, Math.round(dur / 1.5)))
    const scale = Math.min(1, MAX_W / v.videoWidth)
    const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale)
    const out: Slice[] = []
    let prev: Uint8ClampedArray | null = null
    for (let i = 0; i < n; i++) {
      v.currentTime = Math.min(dur - 0.05, (dur * (i + 0.5)) / n)
      await new Promise<void>((ok) => { v.onseeked = () => ok() })
      const c = canvasOf(w, h); c.getContext('2d')!.drawImage(v, 0, 0, w, h)
      const tiny = canvasOf(48, 27); const tctx = tiny.getContext('2d')!; tctx.drawImage(c, 0, 0, 48, 27)
      const px = tctx.getImageData(0, 0, 48, 27).data
      if (prev) { let d = 0; for (let k = 0; k < px.length; k += 4) d += Math.abs(px[k] - prev[k]) + Math.abs(px[k + 1] - prev[k + 1]) + Math.abs(px[k + 2] - prev[k + 2]); if (d / (px.length / 4) < 6) { onProgress?.((i + 1) / n); continue } }
      prev = px
      out.push({ blob: await toBlob(c), width: w, height: h, name: `${baseName(file)}-f${String(out.length + 1).padStart(2, '0')}.jpg` })
      onProgress?.((i + 1) / n)
    }
    return out
  } finally { URL.revokeObjectURL(url) }
}

export async function fileToSlices(file: File, onProgress?: (p: number) => void): Promise<Slice[]> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return pdfSlices(file, onProgress)
  if (/^video\//.test(file.type) || /\.(webm|mp4|mov)$/i.test(file.name)) return videoSlices(file, onProgress)
  return imageSlices(file)
}
