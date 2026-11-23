// PDF mínimo, sem dependências: páginas com retângulos, texto (Helvetica) e imagens JPEG.
// Usado para montar a apresentação de branding (capa, logo, paleta, versões e mockups).
import { canvasBlob, contrast, hexToRgb, isHex, luminance } from './engine'

const WIN: Record<string, number> = { '—': 0x97, '–': 0x96, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '•': 0x95, '…': 0x85, '€': 0x80, '™': 0x99 }
const enc = (s: string) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) { const ch = s[i], c = s.charCodeAt(i); u[i] = WIN[ch] ?? (c < 256 ? c : 63) } return u }
const bytesToStr = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return s }
const escText = (s: string) => bytesToStr(enc(s)).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

// larguras da Helvetica (ASCII 32–126), em milésimos de em
const HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]
export function textWidth(s: string, size: number, bold = false) {
  let w = 0
  for (const ch of s.normalize('NFD').replace(/[̀-ͯ]/g, '')) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? HW[c - 32] : 556 }
  return (w / 1000) * size * (bold ? 1.06 : 1)
}
export function wrapText(s: string, size: number, maxW: number, bold = false): string[] {
  const out: string[] = []; let line = ''
  for (const word of s.split(/\s+/)) {
    const t = line ? `${line} ${word}` : word
    if (textWidth(t, size, bold) > maxW && line) { out.push(line); line = word } else line = t
  }
  if (line) out.push(line)
  return out
}

const rgb = (hex: string) => { const { r, g, b } = hexToRgb(isHex(hex) ? hex : '#000000'); return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)}` }

export interface PdfImage { jpeg: Uint8Array; w: number; h: number }
export async function jpegFromCanvas(cv: HTMLCanvasElement, q = 0.9, bg = '#FFFFFF'): Promise<PdfImage> {
  const flat = document.createElement('canvas'); flat.width = cv.width; flat.height = cv.height
  const ctx = flat.getContext('2d')!; ctx.fillStyle = bg; ctx.fillRect(0, 0, flat.width, flat.height); ctx.drawImage(cv, 0, 0)
  return { jpeg: new Uint8Array(await (await canvasBlob(flat, 'image/jpeg', q)).arrayBuffer()), w: flat.width, h: flat.height }
}

export class PdfPage {
  ops: string[] = []
  images: PdfImage[] = []
  constructor(public w: number, public h: number) {}
  /** y cresce para baixo, como na tela */
  rect(x: number, y: number, w: number, h: number, color: string) { this.ops.push(`q ${rgb(color)} rg ${x.toFixed(2)} ${(this.h - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f Q`) }
  text(s: string, x: number, y: number, size: number, color: string, o: { bold?: boolean; align?: 'left' | 'center' | 'right' } = {}) {
    const w = textWidth(s, size, o.bold), px = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x
    this.ops.push(`BT /${o.bold ? 'F2' : 'F1'} ${size} Tf ${rgb(color)} rg ${px.toFixed(2)} ${(this.h - y).toFixed(2)} Td (${escText(s)}) Tj ET`)
  }
  paragraph(s: string, x: number, y: number, maxW: number, size: number, color: string, lead = 1.45, bold = false): number {
    const lines = wrapText(s, size, maxW, bold)
    lines.forEach((l, i) => this.text(l, x, y + i * size * lead, size, color, { bold }))
    return y + lines.length * size * lead
  }
  image(img: PdfImage, x: number, y: number, w: number, h: number) { this.images.push(img); this.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(this.h - y - h).toFixed(2)} cm /Im${this.images.length} Do Q`) }
  /** encaixa a imagem dentro da caixa mantendo a proporção */
  contain(img: PdfImage, x: number, y: number, w: number, h: number) {
    const r = Math.min(w / img.w, h / img.h), iw = img.w * r, ih = img.h * r
    this.image(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
  }
}

export class PdfDoc {
  pages: PdfPage[] = []
  constructor(public title = 'Branding') {}
  page(w = 842, h = 595) { const p = new PdfPage(w, h); this.pages.push(p); return p }
  build(): Blob {
    const chunks: Uint8Array[] = []; const offsets: number[] = []; let size = 0
    const push = (u: Uint8Array | string) => { const b = typeof u === 'string' ? enc(u) : u; chunks.push(b); size += b.length }
    const obj = (n: number, body: string | Uint8Array[]) => { offsets[n] = size; push(`${n} 0 obj\n`); if (typeof body === 'string') push(body); else body.forEach(push); push('\nendobj\n') }
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
    // 1 catálogo, 2 páginas, 3-4 fontes, 5 info, depois 3 objetos por página + 1 por imagem
    const kids: number[] = []; let next = 6
    const pageObjs = this.pages.map((p) => { const content = next++, page = next++, imgs = p.images.map(() => next++); kids.push(page); return { p, content, page, imgs } })
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
    obj(2, `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`)
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    obj(5, `<< /Title (${escText(this.title)}) /Producer (Forte Company) >>`)
    for (const { p, content, page, imgs } of pageObjs) {
      const stream = enc(p.ops.join('\n'))
      obj(content, [enc(`<< /Length ${stream.length} >>\nstream\n`), stream, enc('\nendstream')])
      const xo = imgs.map((n, i) => `/Im${i + 1} ${n} 0 R`).join(' ')
      obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w} ${p.h}] /Contents ${content} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xo} >> >> >>`)
      p.images.forEach((im, i) => obj(imgs[i], [enc(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`), im.jpeg, enc('\nendstream')]))
    }
    const xref = size, total = next
    push(`xref\n0 ${total}\n0000000000 65535 f \n`)
    for (let i = 1; i < total; i++) push(`${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`)
    push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF`)
    return new Blob(chunks as unknown as BlobPart[], { type: 'application/pdf' })
  }
}

// ---------------------------------------------------------------------------------------------
// Apresentação de branding
// ---------------------------------------------------------------------------------------------
export interface DeckInput {
  company: string; segment: string; positioning: string; palette: string[]; date: string
  logoLight: HTMLCanvasElement          // logo para fundo claro (fundo branco)
  logoDark: HTMLCanvasElement           // logo para fundo escuro/colorido (versão branca, fundo transparente)
  variants: { name: string; canvas: HTMLCanvasElement }[]
  scenes: { title: string; img: HTMLCanvasElement | HTMLImageElement }[]
  fonts?: string[]
}
const asCanvas = (im: HTMLCanvasElement | HTMLImageElement) => {
  if (im instanceof HTMLCanvasElement) return im
  const c = document.createElement('canvas'); c.width = im.naturalWidth || im.width; c.height = im.naturalHeight || im.height; c.getContext('2d')!.drawImage(im, 0, 0); return c
}

export async function buildBrandingPdf(d: DeckInput): Promise<Blob> {
  const doc = new PdfDoc(`${d.company} · Apresentação de marca`)
  const W = 842, H = 595
  const brand = d.palette.find((c) => isHex(c) && contrast(c, '#FFFFFF') >= 4.5) ?? '#111111'
  const ink = '#111111', soft = '#6b6b6b'
  const [lightImg, darkImg] = await Promise.all([jpegFromCanvas(d.logoLight, 0.92), jpegFromCanvas(d.logoDark, 0.98, brand)])

  // 1 · capa
  let p = doc.page(W, H); p.rect(0, 0, W, H, brand)
  p.contain(darkImg, W / 2 - 190, H / 2 - 190, 380, 300)
  p.text('APRESENTAÇÃO DE MARCA', W / 2, H - 120, 11, luminance(brand) > 0.5 ? ink : '#FFFFFF', { align: 'center', bold: true })
  p.text(d.company, W / 2, H - 94, 22, luminance(brand) > 0.5 ? ink : '#FFFFFF', { align: 'center', bold: true })
  p.text(`${d.segment ? d.segment + ' · ' : ''}${d.date}`, W / 2, H - 70, 11, luminance(brand) > 0.5 ? ink : '#FFFFFF', { align: 'center' })

  // 2 · a marca: logo + posicionamento + paleta
  p = doc.page(W, H); p.rect(0, 0, W, H, '#FFFFFF')
  p.text('A MARCA', 48, 60, 10, brand, { bold: true })
  p.text('Logo principal', 48, 92, 26, ink, { bold: true })
  p.contain(lightImg, 48, 120, 360, 400)
  let y = 150
  if (d.positioning) { p.text('Posicionamento', 450, y, 12, ink, { bold: true }); y = p.paragraph(d.positioning, 450, y + 22, 340, 11, soft) + 22 }
  p.text('Paleta', 450, y, 12, ink, { bold: true }); y += 16
  d.palette.filter(isHex).slice(0, 6).forEach((c, i) => {
    const col = i % 3, row = Math.floor(i / 3), x = 450 + col * 118, yy = y + row * 110
    p.rect(x, yy, 104, 70, c); p.text(c.toUpperCase(), x, yy + 88, 10, ink, { bold: true })
  })
  if (d.fonts?.length) p.text(`Tipografia: ${d.fonts.slice(0, 2).join(' · ')}`, 450, H - 60, 10, soft)

  // 3 · versões da logo
  if (d.variants.length) {
    const imgs = await Promise.all(d.variants.slice(0, 6).map(async (v) => ({ name: v.name, img: await jpegFromCanvas(v.canvas, 0.9) })))
    p = doc.page(W, H); p.rect(0, 0, W, H, '#F4F4F2')
    p.text('VERSÕES', 48, 60, 10, brand, { bold: true }); p.text('Cores e layouts da logo', 48, 92, 26, ink, { bold: true })
    const cw = 232, ch = 170
    imgs.forEach((v, i) => {
      const x = 48 + (i % 3) * (cw + 20), yy = 122 + Math.floor(i / 3) * (ch + 46)
      p.contain(v.img, x, yy, cw, ch); p.text(v.name.slice(0, 54), x, yy + ch + 18, 9, soft)
    })
  }

  // 4.. · mockups, um por página
  for (const s of d.scenes) {
    const im = await jpegFromCanvas(asCanvas(s.img), 0.88)
    p = doc.page(W, H); p.rect(0, 0, W, H, '#FFFFFF')
    p.contain(im, 24, 24, W - 48, H - 96)
    p.text(s.title, 28, H - 30, 13, ink, { bold: true }); p.text(d.company, W - 28, H - 30, 10, soft, { align: 'right' })
  }

  // encerramento
  p = doc.page(W, H); p.rect(0, 0, W, H, brand)
  p.contain(darkImg, W / 2 - 150, H / 2 - 150, 300, 240)
  p.text('Obrigado.', W / 2, H - 100, 20, luminance(brand) > 0.5 ? ink : '#FFFFFF', { align: 'center', bold: true })
  return doc.build()
}
