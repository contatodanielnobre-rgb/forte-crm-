/**
 * Motor do "Remover IA": edição de foto no navegador (canvas), sem enviar nada a servidor.
 * - Ajustes: luz, cor, textura, granulação, vinheta…
 * - Diagnóstico: mede sinais típicos de "cara de IA" (saturação alta, contraste extremo, imagem limpa demais…) e sugere a correção
 * - Camadas de cor: seleção por faixa de cor (global) ou varinha mágica (região), com troca de cor preservando sombras e luzes
 * Tudo é determinístico: a mesma configuração dá o mesmo resultado na prévia e na exportação.
 */

export interface Adjust {
  exposure: number; contrast: number; highlights: number; shadows: number
  saturation: number; vibrance: number; hue: number; temperature: number; tint: number
  clarity: number; sharpen: number; denoise: number
  grain: number; grainSize: number; fade: number; vignette: number
}
export type AdjustKey = keyof Adjust

export const ZERO: Adjust = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, saturation: 0, vibrance: 0, hue: 0, temperature: 0, tint: 0, clarity: 0, sharpen: 0, denoise: 0, grain: 0, grainSize: 1.6, fade: 0, vignette: 0 }

export const RANGES: Record<AdjustKey, [number, number]> = {
  exposure: [-2, 2], contrast: [-100, 100], highlights: [-100, 100], shadows: [-100, 100],
  saturation: [-100, 100], vibrance: [-100, 100], hue: [-180, 180], temperature: [-100, 100], tint: [-100, 100],
  clarity: [-100, 100], sharpen: [0, 100], denoise: [0, 100], grain: [0, 100], grainSize: [1, 4], fade: [0, 100], vignette: [-100, 100],
}
const KEYS = Object.keys(ZERO) as AdjustKey[]
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const clampAdjust = (a: Adjust): Adjust => { const o = { ...a }; for (const k of KEYS) o[k] = clamp(o[k], RANGES[k][0], RANGES[k][1]); return o }
/** multiplica a intensidade das edições (a granulação mantém o tamanho) */
export const scaleAdjust = (a: Adjust, k: number): Adjust => { const o = { ...a }; for (const key of KEYS) if (key !== 'grainSize') o[key] = a[key] * k; return clampAdjust(o) }
export const addAdjust = (a: Adjust, b: Adjust): Adjust => { const o = { ...a }; for (const key of KEYS) if (key !== 'grainSize') o[key] = a[key] + b[key]; return clampAdjust(o) }
export const isNeutral = (a: Adjust) => KEYS.every((k) => k === 'grainSize' || Math.abs(a[k]) < 0.01)

// ---------------------------------------------------------------------------------
// Utilidades de pixel
// ---------------------------------------------------------------------------------
type Img = { data: Uint8ClampedArray; width: number; height: number }

/** Desfoque de caixa separável (com 1 ou 4 canais); r em pixels */
export function boxBlur(src: Uint8ClampedArray, w: number, h: number, r: number, ch = 4): Uint8ClampedArray {
  if (r < 1) return new Uint8ClampedArray(src)
  const tmp = new Uint8ClampedArray(src.length), out = new Uint8ClampedArray(src.length)
  const win = r * 2 + 1
  for (let c = 0; c < ch; c++) {
    // horizontal
    for (let y = 0; y < h; y++) {
      const row = y * w
      let sum = 0
      for (let x = -r; x <= r; x++) sum += src[(row + clamp(x, 0, w - 1)) * ch + c]
      for (let x = 0; x < w; x++) {
        tmp[(row + x) * ch + c] = sum / win
        sum += src[(row + Math.min(w - 1, x + r + 1)) * ch + c] - src[(row + Math.max(0, x - r)) * ch + c]
      }
    }
    // vertical
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let y = -r; y <= r; y++) sum += tmp[(clamp(y, 0, h - 1) * w + x) * ch + c]
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * ch + c] = sum / win
        sum += tmp[(Math.min(h - 1, y + r + 1) * w + x) * ch + c] - tmp[(Math.max(0, y - r) * w + x) * ch + c]
      }
    }
  }
  if (ch === 4) for (let i = 3; i < out.length; i += 4) out[i] = src[i]
  return out
}

function hash2(x: number, y: number, s: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

// HSL ---------------------------------------------------------------------------------
function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}
function hue2rgb(p: number, q: number, t: number) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)]
}
export const hexToRgb = (hex: string): [number, number, number] => { const h = hex.replace('#', ''); const f = h.length === 3 ? [...h].map((c) => c + c).join('') : h; return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)] }
export const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase()

// ---------------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------------
/** Aplica os ajustes e devolve uma NOVA imagem (a original não é alterada). seed deixa a granulação idêntica na prévia e na exportação. */
export function applyAdjust(src: ImageData, a: Adjust, seed = 1): ImageData {
  const w = src.width, h = src.height, n = w * h
  const out = new ImageData(new Uint8ClampedArray(src.data), w, h)
  const d = out.data
  if (isNeutral(a)) return out
  const minDim = Math.min(w, h), scale = minDim / 1024

  const blurDenoise = a.denoise > 0 ? boxBlur(boxBlur(src.data, w, h, Math.max(1, Math.round((1 + a.denoise / 40) * scale))), w, h, Math.max(1, Math.round((1 + a.denoise / 40) * scale))) : null
  const dn = a.denoise / 100
  const ex = Math.pow(2, a.exposure), ct = 1 + a.contrast / 100
  const hi = a.highlights / 100, sh = a.shadows / 100
  const sat = 1 + a.saturation / 100, vib = a.vibrance / 100
  const t = a.temperature / 100, ti = a.tint / 100
  const rr = 1 + t * 0.12 + ti * 0.04, gg = 1 - ti * 0.09, bb = 1 - t * 0.12 + ti * 0.04
  const fade = a.fade / 100
  const ang = (a.hue * Math.PI) / 180, cs = Math.cos(ang), sn = Math.sin(ang)
  const m00 = 0.213 + cs * 0.787 - sn * 0.213, m01 = 0.715 - cs * 0.715 - sn * 0.715, m02 = 0.072 - cs * 0.072 + sn * 0.928
  const m10 = 0.213 - cs * 0.213 + sn * 0.143, m11 = 0.715 + cs * 0.285 + sn * 0.140, m12 = 0.072 - cs * 0.072 - sn * 0.283
  const m20 = 0.213 - cs * 0.213 - sn * 0.787, m21 = 0.715 - cs * 0.715 + sn * 0.715, m22 = 0.072 + cs * 0.928 + sn * 0.072
  const useHue = Math.abs(a.hue) > 0.01

  // passada 1: tom e cor, pixel a pixel
  for (let i = 0; i < n; i++) {
    const p = i * 4
    let r = d[p] / 255, g = d[p + 1] / 255, b = d[p + 2] / 255
    if (blurDenoise) { r += (blurDenoise[p] / 255 - r) * dn; g += (blurDenoise[p + 1] / 255 - g) * dn; b += (blurDenoise[p + 2] / 255 - b) * dn }
    r *= ex; g *= ex; b *= ex
    r = (r - 0.5) * ct + 0.5; g = (g - 0.5) * ct + 0.5; b = (b - 0.5) * ct + 0.5
    r *= rr; g *= gg; b *= bb
    let l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (sh !== 0 || hi !== 0) {
      const lc = clamp(l, 0, 1)
      const sm = (1 - lc) * (1 - lc), hm = lc * lc
      const ds = sh > 0 ? sh * 0.35 * sm : sh * 0.35 * sm, dh = hi > 0 ? hi * 0.35 * hm : hi * 0.35 * hm
      const add = ds + dh
      if (add > 0) { r += (1 - r) * add; g += (1 - g) * add; b += (1 - b) * add } else { r += r * add; g += g * add; b += b * add }
      l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    if (sat !== 1 || vib !== 0) {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const sp = mx > 0.001 ? (mx - mn) / mx : 0
      const k = sat * (1 + vib * (1 - sp))
      r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k
    }
    if (useHue) { const nr = r * m00 + g * m01 + b * m02, ng = r * m10 + g * m11 + b * m12, nb = r * m20 + g * m21 + b * m22; r = nr; g = ng; b = nb }
    if (fade > 0) { r = r * (1 - fade * 0.18) + fade * 0.12; g = g * (1 - fade * 0.18) + fade * 0.12; b = b * (1 - fade * 0.18) + fade * 0.12 }
    d[p] = r * 255; d[p + 1] = g * 255; d[p + 2] = b * 255
  }

  // passada 2: contraste local (clareza) e nitidez
  if (Math.abs(a.clarity) > 0.5) {
    const bl = boxBlur(d, w, h, Math.max(4, Math.round(minDim / 55)))
    const k = a.clarity / 100 * 1.1
    for (let i = 0; i < n; i++) {
      const p = i * 4
      const l = (0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2]) / 255
      const wgt = 1 - Math.abs(l - 0.5) * 1.3
      const kk = k * Math.max(0.15, wgt)
      d[p] += (d[p] - bl[p]) * kk; d[p + 1] += (d[p + 1] - bl[p + 1]) * kk; d[p + 2] += (d[p + 2] - bl[p + 2]) * kk
    }
  }
  if (a.sharpen > 0.5) {
    const bl = boxBlur(d, w, h, Math.max(1, Math.round(1.2 * scale)))
    const k = a.sharpen / 100 * 1.4
    for (let i = 0; i < n; i++) { const p = i * 4; d[p] += (d[p] - bl[p]) * k; d[p + 1] += (d[p + 1] - bl[p + 1]) * k; d[p + 2] += (d[p + 2] - bl[p + 2]) * k }
  }

  // passada 3: granulação e vinheta
  const gAmt = a.grain / 100, gs = Math.max(0.75, a.grainSize * scale), vg = a.vignette / 100
  if (gAmt > 0 || vg !== 0) {
    const cx = w / 2, cy = h / 2, md = Math.hypot(cx, cy)
    for (let y = 0; y < h; y++) {
      const gy = Math.floor(y / gs)
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4
        let r = d[p], g = d[p + 1], b = d[p + 2]
        if (gAmt > 0) {
          const gx = Math.floor(x / gs)
          const nz = hash2(gx, gy, seed) + hash2(gx + 7919, gy + 104729, seed) - 1
          const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
          const wgt = 1 - Math.pow(Math.abs(2 * l - 1), 1.6) * 0.65 // mais forte nos meios-tons
          const amt = nz * gAmt * 46 * wgt
          const cn = (hash2(gx + 31, gy + 17, seed + 3) - 0.5) * gAmt * 14 * wgt
          r += amt + cn; g += amt; b += amt - cn
        }
        if (vg !== 0) {
          const dd = Math.hypot(x - cx, y - cy) / md
          const f = 1 - vg * dd * dd * 0.75
          r *= f; g *= f; b *= f
        }
        d[p] = r; d[p + 1] = g; d[p + 2] = b
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------------
// Diagnóstico "cara de IA"
// ---------------------------------------------------------------------------------
export interface Factor { key: string; label: string; value: string; severity: number; note: string }
export interface Diagnosis { score: number; factors: Factor[]; recommended: Adjust; stats: { meanSat: number; p90Sat: number; contrast: number; clipped: number; noise: number; edge: number } }

/** Estima sinais típicos de imagem gerada por IA. É uma heurística (não um detector perfeito): serve de guia para a correção. */
export function diagnose(img: Img): Diagnosis {
  const { data, width: w, height: h } = img
  const hist = new Uint32Array(64)
  let cnt = 0, satSum = 0, lSum = 0, lSq = 0, hiClip = 0, loClip = 0
  const lum = new Float32Array(w * h)
  const step = Math.max(1, Math.floor(Math.min(w, h) / 600))
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const p = (y * w + x) * 4
    const r = data[p] / 255, g = data[p + 1] / 255, b = data[p + 2] / 255
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    lum[y * w + x] = l
    if (x % step === 0 && y % step === 0) {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      if (mx > 0.05) { const s = (mx - mn) / mx; satSum += s; hist[Math.min(63, Math.floor(s * 64))]++; cnt++ }
      lSum += l; lSq += l * l
      if (l > 0.97) hiClip++; if (l < 0.03) loClip++
    }
  }
  const sCount = Math.max(1, Math.round(w / step) * Math.round(h / step))
  const meanSat = satSum / Math.max(1, cnt)
  let acc = 0, p90 = 1; for (let i = 0; i < 64; i++) { acc += hist[i]; if (acc >= cnt * 0.9) { p90 = (i + 1) / 64; break } }
  const mean = lSum / sCount, contrast = Math.sqrt(Math.max(0, lSq / sCount - mean * mean))
  const clipped = (hiClip + loClip) / sCount

  // ruído (granulação) medido em áreas planas, na resolução original
  let nSum = 0, nCnt = 0, eSum = 0, eCnt = 0
  for (let y = 2; y < h - 2; y += 3) for (let x = 2; x < w - 2; x += 3) {
    const i = y * w + x
    const c = lum[i], avg = (lum[i - 1] + lum[i + 1] + lum[i - w] + lum[i + w]) / 4
    const gx = Math.abs(lum[i + 2] - lum[i - 2]), gy = Math.abs(lum[i + 2 * w] - lum[i - 2 * w])
    eSum += gx + gy; eCnt++
    if (gx + gy < 0.05) { nSum += Math.abs(c - avg); nCnt++ }
  }
  const noise = nCnt > 50 ? nSum / nCnt : 0.004
  const edge = eSum / Math.max(1, eCnt)

  const sat = clamp((p90 - 0.72) / 0.28, 0, 1) * 26 + clamp((meanSat - 0.42) / 0.3, 0, 1) * 12
  const conHi = clamp((contrast - 0.27) / 0.15, 0, 1) * 20, conLo = clamp((0.14 - contrast) / 0.1, 0, 1) * 14
  const clip = clamp((clipped - 0.04) / 0.12, 0, 1) * 10
  const clean = clamp((0.0065 - noise) / 0.005, 0, 1) * 24
  const sharp = clamp((edge - 0.1) / 0.09, 0, 1) * 8
  const score = Math.round(clamp(sat + conHi + conLo + clip + clean + sharp, 0, 100))

  const pct = (v: number) => `${Math.round(v * 100)}%`
  const factors: Factor[] = [
    { key: 'sat', label: 'Saturação', value: `p90 ${pct(p90)}`, severity: (sat / 38), note: sat > 12 ? 'Cores intensas demais; fotos reais raramente passam de ~75%.' : 'Dentro do natural.' },
    { key: 'contrast', label: 'Contraste', value: contrast.toFixed(2), severity: Math.max(conHi / 20, conLo / 14), note: conHi > 6 ? 'Contraste alto demais (aspecto "HDR de IA").' : conLo > 5 ? 'Imagem lavada/sem contraste.' : 'Equilibrado.' },
    { key: 'clip', label: 'Cortes de luz/sombra', value: pct(clipped), severity: clip / 10, note: clip > 3 ? 'Muito branco estourado ou preto chapado.' : 'Sem cortes relevantes.' },
    { key: 'grain', label: 'Granulação / textura', value: noise.toFixed(4), severity: clean / 24, note: clean > 8 ? 'Limpa demais: falta grão natural de câmera.' : 'Textura natural.' },
    { key: 'sharp', label: 'Nitidez excessiva', value: edge.toFixed(3), severity: sharp / 8, note: sharp > 3 ? 'Bordas duras demais, aspecto "plástico".' : 'Normal.' },
  ]

  const rec: Adjust = { ...ZERO }
  if (p90 > 0.72) rec.saturation = -Math.min(38, (p90 - 0.72) * 120 + (meanSat > 0.5 ? (meanSat - 0.5) * 40 : 0))
  if (contrast > 0.26) rec.contrast = -Math.min(30, (contrast - 0.24) * 170)
  else if (contrast < 0.14) rec.contrast = Math.min(26, (0.16 - contrast) * 220)
  if (hiClip / sCount > 0.04) rec.highlights = -Math.min(40, (hiClip / sCount) * 420)
  if (loClip / sCount > 0.04) rec.shadows = Math.min(40, (loClip / sCount) * 420)
  if (noise < 0.0065) { rec.grain = 14 + clamp((0.0065 - noise) / 0.0065, 0, 1) * 18; rec.grainSize = 1.6 }
  if (edge > 0.12) rec.clarity = -Math.min(26, (edge - 0.12) * 230)
  rec.vignette = 8
  rec.fade = clean > 10 ? 3 : 0
  return { score, factors, recommended: clampAdjust(rec), stats: { meanSat, p90Sat: p90, contrast, clipped, noise, edge } }
}

// ---------------------------------------------------------------------------------
// Camadas de cor (seleção por faixa de cor e varinha mágica)
// ---------------------------------------------------------------------------------
export interface ColorLayer {
  id: string; type: 'range' | 'wand'; name: string
  src: [number, number, number]            // cor de origem (RGB 0–255)
  tol: number; feather: number             // 0–100
  hue: number; sat: number; light: number  // deslocamentos
  target: string | null                    // trocar por esta cor (HEX), mantendo luzes e sombras
  enabled: boolean
  seed?: { x: number; y: number } | null; imageId?: number | null // varinha: ponto (0–1) e nº do slide
}

export function kmeans(img: Img, k = 7): { rgb: [number, number, number]; share: number }[] {
  const { data, width: w, height: h } = img
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 6000)))
  const pts: number[] = []
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) { const p = (y * w + x) * 4; pts.push(data[p], data[p + 1], data[p + 2]) }
  const n = pts.length / 3
  if (!n) return []
  const cent: number[][] = []
  let s = 12345; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff)
  cent.push([pts[0], pts[1], pts[2]])
  while (cent.length < k) { // k-means++
    const dist = new Float64Array(n); let tot = 0
    for (let i = 0; i < n; i++) { let m = 1e18; for (const c of cent) { const dd = (pts[i * 3] - c[0]) ** 2 + (pts[i * 3 + 1] - c[1]) ** 2 + (pts[i * 3 + 2] - c[2]) ** 2; if (dd < m) m = dd } dist[i] = m; tot += m }
    if (tot === 0) break
    let r = rnd() * tot, idx = 0; for (let i = 0; i < n; i++) { r -= dist[i]; if (r <= 0) { idx = i; break } }
    cent.push([pts[idx * 3], pts[idx * 3 + 1], pts[idx * 3 + 2]])
  }
  const asg = new Int32Array(n)
  for (let it = 0; it < 9; it++) {
    const sum = cent.map(() => [0, 0, 0, 0])
    for (let i = 0; i < n; i++) {
      let best = 0, bd = 1e18
      for (let c = 0; c < cent.length; c++) { const dd = (pts[i * 3] - cent[c][0]) ** 2 + (pts[i * 3 + 1] - cent[c][1]) ** 2 + (pts[i * 3 + 2] - cent[c][2]) ** 2; if (dd < bd) { bd = dd; best = c } }
      asg[i] = best; const sm = sum[best]; sm[0] += pts[i * 3]; sm[1] += pts[i * 3 + 1]; sm[2] += pts[i * 3 + 2]; sm[3]++
    }
    cent.forEach((c, i) => { if (sum[i][3]) { c[0] = sum[i][0] / sum[i][3]; c[1] = sum[i][1] / sum[i][3]; c[2] = sum[i][2] / sum[i][3] } })
  }
  const share = new Array(cent.length).fill(0); for (let i = 0; i < n; i++) share[asg[i]]++
  return cent.map((c, i) => ({ rgb: [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])] as [number, number, number], share: share[i] / n })).filter((c) => c.share > 0.012).sort((a, b) => b.share - a.share)
}

function maskFor(layer: ColorLayer, img: Img): Float32Array {
  const { data, width: w, height: h } = img
  const m = new Float32Array(w * h)
  const [sr, sg, sb] = layer.src
  const tolPx = layer.tol / 100 * 150 + 8
  const f = clamp(layer.feather / 100, 0.04, 1)
  if (layer.type === 'range') {
    const lo = tolPx * (1 - f)
    for (let i = 0; i < w * h; i++) {
      const p = i * 4
      const dist = Math.sqrt((data[p] - sr) ** 2 + (data[p + 1] - sg) ** 2 + (data[p + 2] - sb) ** 2)
      m[i] = dist <= lo ? 1 : dist >= tolPx ? 0 : 1 - (dist - lo) / (tolPx - lo)
    }
    return m
  }
  // varinha mágica: preenchimento contíguo a partir do ponto, comparando com a cor da semente
  const sx = clamp(Math.round((layer.seed?.x ?? 0.5) * (w - 1)), 0, w - 1), sy = clamp(Math.round((layer.seed?.y ?? 0.5) * (h - 1)), 0, h - 1)
  const sp = (sy * w + sx) * 4
  const cr = data[sp], cg = data[sp + 1], cb = data[sp + 2]
  const limit = (layer.tol / 100 * 110 + 10) ** 2
  const seen = new Uint8Array(w * h), stack = new Int32Array(w * h); let top = 0
  stack[top++] = sy * w + sx; seen[sy * w + sx] = 1
  while (top > 0) {
    const i = stack[--top]; m[i] = 1
    const x = i % w, y = (i / w) | 0
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]
    for (const j of nb) {
      if (j < 0 || seen[j]) continue
      seen[j] = 1
      const p = j * 4
      if ((data[p] - cr) ** 2 + (data[p + 1] - cg) ** 2 + (data[p + 2] - cb) ** 2 <= limit) stack[top++] = j
    }
  }
  const r = Math.round(f * Math.min(w, h) * 0.012)
  if (r >= 1) { const b = boxBlur(new Uint8ClampedArray(m.map((v) => v * 255)), w, h, r, 1); for (let i = 0; i < m.length; i++) m[i] = b[i] / 255 }
  return m
}

export function applyColorLayer(img: ImageData, layer: ColorLayer): void {
  if (!layer.enabled) return
  const d = img.data, w = img.width, h = img.height
  const m = maskFor(layer, img)
  const tgt = layer.target ? hexToRgb(layer.target) : null
  const [th, ts, tl] = tgt ? rgb2hsl(tgt[0] / 255, tgt[1] / 255, tgt[2] / 255) : [0, 0, 0]
  const srcL = rgb2hsl(layer.src[0] / 255, layer.src[1] / 255, layer.src[2] / 255)[2]
  const hs = layer.hue / 360, sf = 1 + layer.sat / 100, lf = layer.light / 100 * 0.45
  for (let i = 0; i < w * h; i++) {
    const a = m[i]; if (a <= 0.003) continue
    const p = i * 4
    let [hh, ss, ll] = rgb2hsl(d[p] / 255, d[p + 1] / 255, d[p + 2] / 255)
    if (tgt) { hh = th; ss = ts; ll = clamp(ll + (tl - srcL), 0, 1) }
    hh = (hh + hs + 1) % 1; ss = clamp(ss * sf, 0, 1); ll = clamp(ll + lf, 0, 1)
    const [r, g, b] = hsl2rgb(hh, ss, ll)
    d[p] += (r * 255 - d[p]) * a; d[p + 1] += (g * 255 - d[p + 1]) * a; d[p + 2] += (b * 255 - d[p + 2]) * a
  }
}

// ---------------------------------------------------------------------------------
// Renderização completa (corte → camadas de cor → ajustes)
// ---------------------------------------------------------------------------------
export interface Crop { x: number; y: number; w: number; h: number } // 0–1 relativo à imagem
export interface SlideEdit { adjust: Adjust; layers: ColorLayer[]; crop: Crop | null }

export function renderEdited(src: HTMLImageElement | HTMLCanvasElement, edit: SlideEdit, maxDim: number | null, seed = 1): HTMLCanvasElement {
  const sw = (src as HTMLImageElement).naturalWidth || (src as HTMLCanvasElement).width, sh = (src as HTMLImageElement).naturalHeight || (src as HTMLCanvasElement).height
  const c = edit.crop ?? { x: 0, y: 0, w: 1, h: 1 }
  const sx = Math.round(c.x * sw), sy = Math.round(c.y * sh), cw = Math.max(1, Math.round(c.w * sw)), ch = Math.max(1, Math.round(c.h * sh))
  const k = maxDim ? Math.min(1, maxDim / Math.max(cw, ch)) : 1
  const ow = Math.max(1, Math.round(cw * k)), oh = Math.max(1, Math.round(ch * k))
  const cv = document.createElement('canvas'); cv.width = ow; cv.height = oh
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, sx, sy, cw, ch, 0, 0, ow, oh)
  let id = ctx.getImageData(0, 0, ow, oh)
  for (const l of edit.layers) applyColorLayer(id, l)
  id = applyAdjust(id, edit.adjust, seed)
  ctx.putImageData(id, 0, 0)
  return cv
}

// ---------------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------------
export const PRESETS: { id: string; name: string; desc: string; adjust: Partial<Adjust> }[] = [
  { id: 'natural', name: 'Natural', desc: 'Menos "plástico", mais foto', adjust: { saturation: -10, contrast: -6, grain: 10, vignette: 8 } },
  { id: 'filme', name: 'Filme quente', desc: 'Grão e tom âmbar', adjust: { temperature: 14, saturation: -8, contrast: 4, grain: 26, grainSize: 2, fade: 8, vignette: 14 } },
  { id: 'cinema', name: 'Cinema frio', desc: 'Azulado e contrastado', adjust: { temperature: -10, tint: -3, contrast: 8, saturation: -12, grain: 14, vignette: 18 } },
  { id: 'suave', name: 'Editorial suave', desc: 'Matte e delicado', adjust: { clarity: -10, fade: 6, saturation: -6, contrast: -4, grain: 8 } },
  { id: 'pb', name: 'P&B granulado', desc: 'Preto e branco com grão', adjust: { saturation: -100, contrast: 12, grain: 34, grainSize: 2 } },
]
export const mergeAdjust = (p: Partial<Adjust>): Adjust => clampAdjust({ ...ZERO, ...p })
