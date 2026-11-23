// Motor de edição de logos (100% no navegador, sem IA e sem custo).
// 1) buildModel: separa a logo aprovada em "camadas de cor" + cobertura (alfa) — dá para trocar qualquer cor sem redesenhar nada.
// 2) detectCuts/splitParts: acha símbolo, nome e slogan (e deixa o usuário ajustar os cortes à mão).
// 3) composeLogo: remonta a MESMA arte com outro arranjo (símbolo ao lado, maior, menor…) e outras cores.

export interface Rgb { r: number; g: number; b: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const hexToRgb = (hex: string): Rgb => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
export const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()
const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
export const luminance = (hex: string) => { const { r, g, b } = hexToRgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) }
export const contrast = (a: string, b: string) => { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) }
export const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s)

// ---------------------------------------------------------------------------------------------
// Modelo da logo
// ---------------------------------------------------------------------------------------------
export interface LogoModel {
  w: number; h: number
  alpha: Uint8Array      // cobertura 0–255 de cada pixel (0 = fundo)
  label: Uint8Array      // camada de cor de cada pixel
  palette: string[]      // cor original de cada camada (a maior primeiro)
  bg: string             // fundo detectado
  ink: Rect              // caixa justa da tinta
}

export async function fetchImage(url: string): Promise<HTMLImageElement> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Não consegui baixar a imagem da logo.')
  const blob = await res.blob()
  const obj = URL.createObjectURL(blob)
  try {
    return await new Promise<HTMLImageElement>((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error('Não consegui abrir a imagem da logo.')); im.src = obj })
  } finally { setTimeout(() => URL.revokeObjectURL(obj), 4000) }
}

const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

function kmeans(s: Float32Array, k: number): { centers: number[][]; counts: number[] } {
  const n = s.length / 3, rand = rng(7)
  const centers: number[][] = []
  const first = Math.floor(rand() * n); centers.push([s[first * 3], s[first * 3 + 1], s[first * 3 + 2]])
  const d2 = new Float64Array(n).fill(Infinity)
  while (centers.length < k) {
    const c = centers[centers.length - 1]; let sum = 0
    for (let i = 0; i < n; i++) { const d = (s[i * 3] - c[0]) ** 2 + (s[i * 3 + 1] - c[1]) ** 2 + (s[i * 3 + 2] - c[2]) ** 2; if (d < d2[i]) d2[i] = d; sum += d2[i] }
    if (sum <= 0) break
    let r = rand() * sum, pick = n - 1
    for (let i = 0; i < n; i++) { r -= d2[i]; if (r <= 0) { pick = i; break } }
    centers.push([s[pick * 3], s[pick * 3 + 1], s[pick * 3 + 2]])
  }
  const kk = centers.length, counts = new Array(kk).fill(0), asg = new Int32Array(n)
  for (let it = 0; it < 12; it++) {
    const sums = centers.map(() => [0, 0, 0]); counts.fill(0)
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity
      for (let j = 0; j < kk; j++) { const c = centers[j]; const d = (s[i * 3] - c[0]) ** 2 + (s[i * 3 + 1] - c[1]) ** 2 + (s[i * 3 + 2] - c[2]) ** 2; if (d < bd) { bd = d; best = j } }
      asg[i] = best; counts[best]++; sums[best][0] += s[i * 3]; sums[best][1] += s[i * 3 + 1]; sums[best][2] += s[i * 3 + 2]
    }
    for (let j = 0; j < kk; j++) if (counts[j]) centers[j] = [sums[j][0] / counts[j], sums[j][1] / counts[j], sums[j][2] / counts[j]]
  }
  return { centers, counts }
}

export function buildModel(img: HTMLImageElement, maxSide = 1400): LogoModel {
  const nw = img.naturalWidth || img.width || 1024, nh = img.naturalHeight || img.height || 1024
  let scale = Math.min(1, maxSide / Math.max(nw, nh))
  if (Math.max(nw, nh) < 900) scale = Math.min(2, 900 / Math.max(nw, nh)) // imagens pequenas: suaviza ao ampliar
  const w = Math.max(8, Math.round(nw * scale)), h = Math.max(8, Math.round(nh * scale))
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  const src = ctx.getImageData(0, 0, w, h).data
  const N = w * h

  // fundo: transparente (achata sobre branco ou preto) ou a cor dominante da borda
  let transparent = 0, lumSum = 0, opaque = 0
  for (let i = 0; i < N; i++) { const a = src[i * 4 + 3]; if (a < 250) transparent++; if (a > 200) { lumSum += (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114); opaque++ } }
  const hasAlpha = transparent > N * 0.02
  let bg: Rgb
  const px = new Uint8ClampedArray(N * 3)
  if (hasAlpha) {
    const light = opaque > 0 && lumSum / opaque > 200 // logo clara: achata sobre preto para não sumir
    const base = light ? 0 : 255; bg = { r: base, g: base, b: base }
    for (let i = 0; i < N; i++) { const a = src[i * 4 + 3] / 255; px[i * 3] = src[i * 4] * a + base * (1 - a); px[i * 3 + 1] = src[i * 4 + 1] * a + base * (1 - a); px[i * 3 + 2] = src[i * 4 + 2] * a + base * (1 - a) }
  } else {
    const rs: number[] = [], gs: number[] = [], bs: number[] = []
    const ring = Math.max(2, Math.round(Math.min(w, h) * 0.006))
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < ring || y < ring || x >= w - ring || y >= h - ring) { const i = (y * w + x) * 4; rs.push(src[i]); gs.push(src[i + 1]); bs.push(src[i + 2]) }
    const med = (a: number[]) => { a.sort((p, q) => p - q); return a[a.length >> 1] }
    bg = { r: med(rs), g: med(gs), b: med(bs) }
    for (let i = 0; i < N; i++) { px[i * 3] = src[i * 4]; px[i * 3 + 1] = src[i * 4 + 1]; px[i * 3 + 2] = src[i * 4 + 2] }
  }

  // paleta: só pixels "puros" (o interior das formas), para as bordas suavizadas não virarem cores falsas
  const dist = (i: number) => Math.hypot(px[i * 3] - bg.r, px[i * 3 + 1] - bg.g, px[i * 3 + 2] - bg.b)
  const near = (i: number, j: number, t: number) => Math.abs(px[i * 3] - px[j * 3]) < t && Math.abs(px[i * 3 + 1] - px[j * 3 + 1]) < t && Math.abs(px[i * 3 + 2] - px[j * 3 + 2]) < t
  const sample = (thr: number, strict: boolean) => {
    const step = Math.max(1, Math.floor(Math.sqrt(N / 70000))), out: number[] = []
    for (let y = 2; y < h - 2; y += step) for (let x = 2; x < w - 2; x += step) {
      const i = y * w + x
      if (dist(i) < thr) continue
      if (strict && !(near(i, i - 2, 14) && near(i, i + 2, 14) && near(i, i - 2 * w, 14) && near(i, i + 2 * w, 14))) continue
      out.push(px[i * 3], px[i * 3 + 1], px[i * 3 + 2])
    }
    return new Float32Array(out)
  }
  let samples = sample(60, true)
  if (samples.length < 300) samples = sample(36, false)
  let centers: number[][] = [[17, 17, 17]], counts = [1]
  if (samples.length >= 9) {
    const km = kmeans(samples, Math.min(5, Math.max(1, Math.floor(samples.length / 3))))
    centers = km.centers; counts = km.counts
    const total = counts.reduce((a, b) => a + b, 0)
    // junta cores parecidas (degradê suave vira uma cor só) e descarta cores raras (ruído)
    for (let guard = 0; guard < 8; guard++) {
      let pi = -1, pj = -1, best = 52
      for (let i = 0; i < centers.length; i++) for (let j = i + 1; j < centers.length; j++) { const d = Math.hypot(centers[i][0] - centers[j][0], centers[i][1] - centers[j][1], centers[i][2] - centers[j][2]); if (d < best) { best = d; pi = i; pj = j } }
      if (pi < 0) break
      const ci = counts[pi], cj = counts[pj], t = ci + cj
      centers[pi] = centers[pi].map((v, k) => (v * ci + centers[pj][k] * cj) / (t || 1)); counts[pi] = t
      centers.splice(pj, 1); counts.splice(pj, 1)
    }
    const keep = centers.map((_, i) => i).filter((i) => counts[i] >= total * 0.012)
    if (keep.length) { centers = keep.map((i) => centers[i]); counts = keep.map((i) => counts[i]) }
    const order = centers.map((_, i) => i).sort((a, b) => counts[b] - counts[a])
    centers = order.map((i) => centers[i])
  }
  // 2ª passada: cores de traços finos (ex.: um slogan colorido) quase não têm "interior" e escapam da 1ª passada.
  // Procura pixels em área plana que as cores já achadas não explicam e agrupa.
  {
    const dirs = centers.map((c) => { const r = c[0] - bg.r, g = c[1] - bg.g, b = c[2] - bg.b; return { r, g, b, vv: r * r + g * g + b * b || 1 } })
    const extra: number[] = []; let fg = 0
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const dr = px[i * 3] - bg.r, dg = px[i * 3 + 1] - bg.g, db = px[i * 3 + 2] - bg.b
      if (dr * dr + dg * dg + db * db < 4900) continue // < 70 de distância
      fg++
      let best = Infinity
      for (const d of dirs) { let t = (dr * d.r + dg * d.g + db * d.b) / d.vv; t = t < 0 ? 0 : t > 1 ? 1 : t; const er = dr - t * d.r, eg = dg - t * d.g, eb = db - t * d.b; const e = er * er + eg * eg + eb * eb; if (e < best) best = e }
      if (best > 1600 && near(i, i - 1, 18) && near(i, i + 1, 18) && near(i, i - w, 18) && near(i, i + w, 18)) extra.push(px[i * 3], px[i * 3 + 1], px[i * 3 + 2])
    }
    const n = extra.length / 3
    if (n >= 60 && n >= fg * 0.003 && centers.length < 6) {
      const km = kmeans(new Float32Array(extra), Math.min(3, Math.max(1, Math.floor(n / 30))))
      const order = km.centers.map((_, i) => i).sort((a, b) => km.counts[b] - km.counts[a])
      for (const i of order) {
        const c = km.centers[i]
        if (km.counts[i] < n * 0.25 || centers.length >= 6) continue
        if (centers.some((o) => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) < 52)) continue
        centers.push(c); counts.push(km.counts[i])
      }
    }
  }
  const K = centers.length
  const palette = centers.map((c) => rgbToHex(c[0], c[1], c[2]))

  // cobertura + camada de cada pixel: p = fundo + t·(cor − fundo)
  const vr = centers.map((c) => c[0] - bg.r), vg = centers.map((c) => c[1] - bg.g), vb = centers.map((c) => c[2] - bg.b)
  const vv = vr.map((_, j) => vr[j] ** 2 + vg[j] ** 2 + vb[j] ** 2 || 1)
  const alpha = new Uint8Array(N), label = new Uint8Array(N)
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let i = 0; i < N; i++) {
    const dr = px[i * 3] - bg.r, dg = px[i * 3 + 1] - bg.g, db = px[i * 3 + 2] - bg.b
    if (dr * dr + dg * dg + db * db < 196) continue // < 14 de distância = fundo
    let bj = 0, bres = Infinity, bt = 0
    for (let j = 0; j < K; j++) {
      let t = (dr * vr[j] + dg * vg[j] + db * vb[j]) / vv[j]; t = t < 0 ? 0 : t > 1 ? 1 : t
      const er = dr - t * vr[j], eg = dg - t * vg[j], eb = db - t * vb[j]; const res = er * er + eg * eg + eb * eb
      if (res < bres - 1e-6 || (Math.abs(res - bres) <= 1e-6 && t > bt)) { bres = res; bj = j; bt = t }
    }
    const a = Math.round(bt * 255)
    if (a < 6) continue
    alpha[i] = a; label[i] = bj
    if (a > 40) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  const ink: Rect = x1 < 0 ? { x: 0, y: 0, w, h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
  return { w, h, alpha, label, palette, bg: rgbToHex(bg.r, bg.g, bg.b), ink }
}

// ---------------------------------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------------------------------
export interface Colorway { name: string; bg: string; map: string[] }   // bg = "#RRGGBB" ou "transparent"

export function paintRegion(model: LogoModel, cw: Colorway, r: Rect, owner?: Uint8Array, role?: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = Math.max(1, r.w); cv.height = Math.max(1, r.h)
  const ctx = cv.getContext('2d')!, id = ctx.createImageData(cv.width, cv.height), d = id.data
  const cols = model.palette.map((p, j) => hexToRgb(cw.map[j] && isHex(cw.map[j]) ? cw.map[j] : p))
  for (let y = 0; y < r.h; y++) {
    const row = (r.y + y) * model.w + r.x
    for (let x = 0; x < r.w; x++) {
      const a = model.alpha[row + x]; if (!a) continue
      if (owner && owner[row + x] !== role) continue
      const c = cols[model.label[row + x]] ?? cols[0], o = (y * r.w + x) * 4
      d[o] = c.r; d[o + 1] = c.g; d[o + 2] = c.b; d[o + 3] = a
    }
  }
  ctx.putImageData(id, 0, 0)
  return cv
}

export const originalColorway = (model: LogoModel, bg?: string): Colorway => ({ name: 'Original', bg: bg ?? '#FFFFFF', map: [...model.palette] })
const mono = (model: LogoModel, color: string, bg: string, name: string): Colorway => ({ name, bg, map: model.palette.map(() => color) })

/** Versões prontas a partir das cores escolhidas (só entram combinações com contraste suficiente) */
export function buildColorways(model: LogoModel, selected: string[]): Colorway[] {
  const sel = Array.from(new Set(selected.filter(isHex).map((c) => c.toUpperCase())))
  const out: Colorway[] = []
  const add = (cw: Colorway) => { const key = cw.bg + cw.map.join(); if (!out.some((o) => o.bg + o.map.join() === key)) out.push(cw) }
  const INK = '#111111', WHITE = '#FFFFFF'
  const main = (cw: Colorway) => cw.map[0] ?? INK
  const okOn = (fg: string, bg: string, min = 3) => bg === 'transparent' || contrast(fg, bg) >= min
  add({ name: 'Colorida · fundo branco', bg: WHITE, map: [...model.palette] })
  add({ name: 'Colorida · fundo transparente', bg: 'transparent', map: [...model.palette] })
  add(mono(model, INK, WHITE, 'Preta · fundo branco'))
  add(mono(model, WHITE, INK, 'Branca · fundo preto'))
  add(mono(model, INK, 'transparent', 'Preta · fundo transparente'))
  add(mono(model, WHITE, 'transparent', 'Branca · fundo transparente'))
  const dark = [...sel].sort((a, b) => luminance(a) - luminance(b))[0]
  for (const c of sel) {
    if (okOn(c, WHITE)) add(mono(model, c, WHITE, `${c} · fundo branco`))
    if (okOn(WHITE, c)) add(mono(model, WHITE, c, `Branca · fundo ${c}`))
    if (okOn(INK, c, 4.5)) add(mono(model, INK, c, `Preta · fundo ${c}`))
    if (okOn(main({ name: '', bg: c, map: model.palette }), c, 2.2) && c !== model.palette[0]) add({ name: `Colorida · fundo ${c}`, bg: c, map: [...model.palette] })
  }
  if (sel.length >= 2) {
    // remapeia as camadas da logo para as cores escolhidas, na ordem
    const map = model.palette.map((_, i) => sel[i % sel.length])
    const bgs = [WHITE, ...(dark && luminance(dark) < 0.2 ? [dark] : [INK])]
    for (const bg of bgs) if (okOn(map[0], bg)) add({ name: `Paleta escolhida · fundo ${bg === WHITE ? 'branco' : bg}`, bg, map })
    const swapped = [...map].reverse()
    if (new Set(map).size > 1) for (const bg of bgs) if (okOn(swapped[0], bg)) add({ name: `Paleta invertida · fundo ${bg === WHITE ? 'branco' : bg}`, bg, map: swapped })
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Partes: símbolo, nome e slogan
// ---------------------------------------------------------------------------------------------
export interface Cuts {
  axis: 'x' | 'y' | null      // corte entre símbolo e texto: 'x' = lado a lado, 'y' = um sobre o outro; null = sem símbolo
  pos: number                 // posição do corte (px do modelo)
  symbolFirst: boolean        // o símbolo está antes do corte (esquerda/em cima)
  sloganY: number | null      // linha que separa o nome do slogan (px do modelo); null = sem slogan na logo
}
export type PartRole = 'symbol' | 'name' | 'slogan'
export interface Parts { symbol?: Rect; name?: Rect; slogan?: Rect }

export const inkRows = (m: LogoModel, r: Rect) => { const rows = new Int32Array(r.h), cols = new Int32Array(r.w); for (let y = 0; y < r.h; y++) { const o = (r.y + y) * m.w + r.x; for (let x = 0; x < r.w; x++) if (m.alpha[o + x] > 64) { rows[y]++; cols[x]++ } } return { rows, cols } }
export const tight = (m: LogoModel, r: Rect): Rect | null => {
  let x0 = r.w, y0 = r.h, x1 = -1, y1 = -1
  for (let y = 0; y < r.h; y++) { const o = (r.y + y) * m.w + r.x; for (let x = 0; x < r.w; x++) if (m.alpha[o + x] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y } }
  return x1 < 0 ? null : { x: r.x + x0, y: r.y + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}
export const emptyRuns = (p: Int32Array, minLen: number) => {
  let first = 0, last = p.length - 1
  while (first < p.length && !p[first]) first++
  while (last >= 0 && !p[last]) last--
  const runs: { s: number; e: number }[] = []
  let s = -1
  for (let i = first; i <= last; i++) { if (!p[i]) { if (s < 0) s = i } else if (s >= 0) { if (i - s >= minLen) runs.push({ s, e: i }); s = -1 } }
  return runs
}

/** Procura sozinho onde termina o símbolo e onde começa o slogan (o usuário pode corrigir no painel) */
export function detectCuts(m: LogoModel): Cuts {
  const ink = m.ink, { rows, cols } = inkRows(m, ink)
  const total = rows.reduce((a, b) => a + b, 0) || 1
  const sideBox = (r: Rect) => { const t = tight(m, r); return t ? { box: t, aspect: t.w / t.h, ink: inkRows(m, t).rows.reduce((a, b) => a + b, 0) } : null }
  type Cand = { axis: 'x' | 'y'; pos: number; symbolFirst: boolean; gap: number }
  const cands: Cand[] = []
  const test = (axis: 'x' | 'y', run: { s: number; e: number }) => {
    const cut = (run.s + run.e) >> 1
    const a = axis === 'y' ? sideBox({ x: ink.x, y: ink.y, w: ink.w, h: cut }) : sideBox({ x: ink.x, y: ink.y, w: cut, h: ink.h })
    const b = axis === 'y' ? sideBox({ x: ink.x, y: ink.y + cut, w: ink.w, h: ink.h - cut }) : sideBox({ x: ink.x + cut, y: ink.y, w: ink.w - cut, h: ink.h })
    if (!a || !b || a.ink < total * 0.05 || b.ink < total * 0.05) return
    type Side = { box: Rect; aspect: number }
    // símbolo = lado compacto e bem mais "alto" que o texto; texto = lado largo e baixo
    const symOk = (sy: Side, o: Side) => sy.aspect >= 0.4 && sy.aspect <= 2.1 && (axis === 'x' ? sy.box.h >= o.box.h * 0.55 : sy.box.h >= o.box.h * 0.8 && sy.box.w >= o.box.w * 0.12)
    const texty = (s: Side) => s.aspect >= 2.6
    const gap = (run.e - run.s) / (axis === 'y' ? ink.h : ink.w)
    if (symOk(a, b) && texty(b)) cands.push({ axis, pos: (axis === 'y' ? ink.y : ink.x) + cut, symbolFirst: true, gap })
    else if (symOk(b, a) && texty(a)) cands.push({ axis, pos: (axis === 'y' ? ink.y : ink.x) + cut, symbolFirst: false, gap })
  }
  emptyRuns(rows, Math.max(4, Math.round(ink.h * 0.018))).forEach((r) => test('y', r))
  emptyRuns(cols, Math.max(4, Math.round(ink.w * 0.018))).forEach((r) => test('x', r))
  cands.sort((p, q) => q.gap - p.gap)
  const best = cands[0]
  const sym = best ? { axis: best.axis, pos: best.pos, symbolFirst: best.symbolFirst } : { axis: null as null, pos: 0, symbolFirst: true }

  // zona de texto → linhas → o slogan é uma linha bem menor abaixo do nome
  const textZone: Rect = !best ? ink : best.axis === 'y' ? (best.symbolFirst ? { x: ink.x, y: best.pos, w: ink.w, h: ink.y + ink.h - best.pos } : { x: ink.x, y: ink.y, w: ink.w, h: best.pos - ink.y })
    : (best.symbolFirst ? { x: best.pos, y: ink.y, w: ink.x + ink.w - best.pos, h: ink.h } : { x: ink.x, y: ink.y, w: best.pos - ink.x, h: ink.h })
  const tz = tight(m, textZone)
  let sloganY: number | null = null
  if (tz) {
    // densidade por linha: descendentes e acentos (poucos pixels) não contam como "tinta" ao procurar o vão entre nome e slogan
    const pr0 = inkRows(m, tz).rows
    const mx = pr0.reduce((a, b) => (b > a ? b : a), 0)
    const pr = pr0.map((v) => (v > mx * 0.08 ? v : 0)) as Int32Array
    const minGap = Math.max(3, Math.round(tz.h * 0.04))
    const runs = emptyRuns(pr, minGap)
    if (runs.length) {
      const lines: { y0: number; y1: number }[] = []; let prev = 0
      runs.forEach((r) => { lines.push({ y0: prev, y1: r.s }); prev = r.e }); lines.push({ y0: prev, y1: pr.length })
      const hs = lines.map((l) => l.y1 - l.y0), hmax = Math.max(...hs), ni = hs.indexOf(hmax)
      const after = lines.slice(ni + 1).filter((l) => l.y1 - l.y0 <= hmax * 0.78)
      if (after.length) sloganY = tz.y + ((runs.find((r) => r.s >= lines[ni].y1)!.s + runs.find((r) => r.s >= lines[ni].y1)!.e) >> 1)
    }
  }
  return { ...sym, sloganY }
}

const ROLE_ID = { symbol: 1, name: 2, slogan: 3 } as const
interface Split { parts: Parts; owner: Uint8Array }

interface Comps { lab: Int32Array; n: number; cx: number[]; cy: number[] }
const compsCache = new WeakMap<LogoModel, Comps>()
/** Peças soltas da arte (letras, formas) por conectividade: cada peça pertence a UMA parte, mesmo quando as linhas se sobrepõem */
function labelComps(m: LogoModel): Comps {
  const hit = compsCache.get(m); if (hit) return hit
  const { w, h, alpha } = m, N = w * h
  const lab = new Int32Array(N), stack = new Int32Array(N)
  const cx: number[] = [0], cy: number[] = [0]
  let n = 0
  for (let i = 0; i < N; i++) {
    if (alpha[i] <= 40 || lab[i]) continue
    n++; let sp = 0, sx = 0, sy = 0, c = 0
    stack[sp++] = i; lab[i] = n
    while (sp) {
      const k = stack[--sp], x = k % w, y = (k / w) | 0
      sx += x; sy += y; c++
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        const j = yy * w + xx
        if (alpha[j] > 40 && !lab[j]) { lab[j] = n; stack[sp++] = j }
      }
    }
    cx.push(sx / c); cy.push(sy / c)
  }
  const out = { lab, n, cx, cy }
  compsCache.set(m, out); return out
}

const splitCache = new WeakMap<LogoModel, Map<string, Split>>()
export function getSplit(m: LogoModel, c: Cuts): Split {
  const key = cutsKey(c)
  let mp = splitCache.get(m); if (!mp) { mp = new Map(); splitCache.set(m, mp) }
  const hit = mp.get(key); if (hit) return hit
  if (mp.size > 24) mp.delete(mp.keys().next().value as string)
  const out = computeSplit(m, c)
  mp.set(key, out); return out
}
export const splitParts = (m: LogoModel, c: Cuts): Parts => getSplit(m, c).parts

function computeSplit(m: LogoModel, c: Cuts): Split {
  const { w, h, alpha } = m, N = w * h
  const { lab, n, cx, cy } = labelComps(m)
  const role = new Uint8Array(n + 1)
  for (let k = 1; k <= n; k++) {
    let sym = false
    if (c.axis === 'y') sym = c.symbolFirst ? cy[k] < c.pos : cy[k] >= c.pos
    else if (c.axis === 'x') sym = c.symbolFirst ? cx[k] < c.pos : cx[k] >= c.pos
    role[k] = sym ? ROLE_ID.symbol : c.sloganY != null && cy[k] >= c.sloganY ? ROLE_ID.slogan : ROLE_ID.name
  }
  const owner = new Uint8Array(N)
  for (let i = 0; i < N; i++) if (lab[i]) owner[i] = role[lab[i]]
  // contorno suave (cobertura baixa) fica com a parte do vizinho mais próximo
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (owner[i] || !alpha[i]) continue
      let r = 0
      for (let dy = -1; dy <= 1 && !r; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const o = owner[yy * w + xx]; if (o && (pass === 1 || lab[yy * w + xx])) { r = o; break } }
      if (r) owner[i] = r
    }
  }
  const box = [null, null, null, null] as ({ x0: number; y0: number; x1: number; y1: number } | null)[]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = owner[i]
    if (!o || alpha[i] <= 40) continue
    const b = box[o]
    if (!b) box[o] = { x0: x, y0: y, x1: x, y1: y }
    else { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y }
  }
  const rect = (o: number): Rect | undefined => { const b = box[o]; return b ? { x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 } : undefined }
  return { owner, parts: { symbol: rect(1), name: rect(2), slogan: rect(3) } }
}

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------
export type Arrange = 'original' | 'stack' | 'row' | 'row_rev' | 'symbol' | 'name'
export interface SloganCfg { mode: 'keep' | 'none' | 'custom'; text: string; font: string; weight: number; scale: number; fit: boolean; tracking: number; upper: boolean; color: string }
export interface Layout {
  arrange: Arrange
  symbolScale: number      // 1 = tamanho original do símbolo
  nameScale: number        // 1 = tamanho original do nome
  gap: number              // distância entre símbolo e texto, em alturas do nome
  align: 'center' | 'start' | 'end'
  pad: number              // respiro em volta (fração do maior lado)
  slogan: SloganCfg
}
export const defaultSlogan = (): SloganCfg => ({ mode: 'keep', text: '', font: 'Montserrat', weight: 500, scale: 1, fit: true, tracking: 0.2, upper: true, color: 'auto' })
export const defaultLayout = (): Layout => ({ arrange: 'original', symbolScale: 1, nameScale: 1, gap: 0.6, align: 'center', pad: 0.08, slogan: defaultSlogan() })

const fontLoaded = new Map<string, Promise<void>>()
export function loadFont(family: string, weight = 400): Promise<void> {
  const key = `${family}|${weight}`
  if (!fontLoaded.has(key)) {
    fontLoaded.set(key, (async () => {
      try {
        const id = `gf-${family.replace(/\W+/g, '-')}-${weight}`
        if (!document.getElementById(id)) {
          const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'
          l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weight}&display=swap`
          document.head.appendChild(l)
          await new Promise<void>((ok) => { l.onload = () => ok(); l.onerror = () => ok(); setTimeout(ok, 4000) })
        }
        await document.fonts.load(`${weight} 48px "${family}"`, 'Aa')
      } catch { /* sem internet: usa a fonte do sistema */ }
    })())
  }
  return fontLoaded.get(key)!
}

async function textCanvas(text: string, font: string, weight: number, size: number, color: string, trackingPx: number, fitW: number | null): Promise<HTMLCanvasElement | null> {
  if (!text.trim()) return null
  await loadFont(font, weight)
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true })!
  let f = `${weight} ${size}px "${font}", system-ui, sans-serif`
  ctx.font = f
  let chars = Array.from(text), ws = chars.map((ch) => ctx.measureText(ch).width)
  let natural = ws.reduce((a, b) => a + b, 0)
  // texto mais largo que o nome: reduz o tamanho até caber (só quando "ajustar à largura" está ligado)
  if (fitW && natural > fitW) { size = size * (fitW / natural); ctx.font = `${weight} ${size}px "${font}", system-ui, sans-serif`; chars = Array.from(text); ws = chars.map((ch) => ctx.measureText(ch).width); natural = ws.reduce((a, b) => a + b, 0) }
  let tr = trackingPx
  if (fitW && chars.length > 1) tr = Math.max(0, Math.min(size * 0.9, (fitW - natural) / (chars.length - 1)))
  f = `${weight} ${size}px "${font}", system-ui, sans-serif`
  const W = Math.ceil(natural + tr * (chars.length - 1) + size), H = Math.ceil(size * 1.6)
  cv.width = W; cv.height = H
  const c2 = cv.getContext('2d', { willReadFrequently: true })!
  c2.font = f; c2.fillStyle = color; c2.textBaseline = 'alphabetic'
  let x = size / 2
  chars.forEach((ch, i) => { c2.fillText(ch, x, size * 1.15); x += ws[i] + tr })
  const d = c2.getImageData(0, 0, W, H).data
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (d[(y * W + xx) * 4 + 3] > 30) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 < 0) return null
  const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1
  out.getContext('2d')!.drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return out
}

/** Camada de cor que mais aparece numa região (para pintar o slogan novo com a cor certa) */
export function dominantLayer(m: LogoModel, r: Rect): number {
  const hist = new Float64Array(m.palette.length)
  for (let y = 0; y < r.h; y++) { const o = (r.y + y) * m.w + r.x; for (let x = 0; x < r.w; x++) hist[m.label[o + x]] += m.alpha[o + x] }
  let b = 0; hist.forEach((v, i) => { if (v > hist[b]) b = i }); return b
}

interface El { c: HTMLCanvasElement; w: number; h: number }
const paintCache = new WeakMap<LogoModel, Map<string, HTMLCanvasElement>>()
function paintCached(m: LogoModel, cw: Colorway, r: Rect, owner?: Uint8Array, role?: number, ck = ''): HTMLCanvasElement {
  let mp = paintCache.get(m); if (!mp) { mp = new Map(); paintCache.set(m, mp) }
  const key = `${cw.map.join('')}|${r.x},${r.y},${r.w},${r.h}|${role ?? 0}|${ck}`
  const hit = mp.get(key); if (hit) return hit
  if (mp.size > 48) mp.delete(mp.keys().next().value as string)
  const c = paintRegion(m, cw, r, owner, role); mp.set(key, c); return c
}

/** Distância entre o símbolo e o texto na logo original, em alturas do nome (para reproduzir o espaçamento aprovado) */
export function originalGap(m: LogoModel, c: Cuts): number {
  const p = splitParts(m, c)
  if (!p.symbol || !p.name) return 0.6
  const s = p.symbol, n = p.name
  const g = c.axis === 'y' ? (c.symbolFirst ? n.y - (s.y + s.h) : s.y - (n.y + n.h)) : (c.symbolFirst ? n.x - (s.x + s.w) : s.x - (n.x + n.w))
  return Math.max(0.05, Math.min(2, g / n.h))
}
export interface ComposeOpts { long?: number }

export async function composeLogo(m: LogoModel, cuts: Cuts, layout: Layout, cw: Colorway, opts: ComposeOpts = {}): Promise<HTMLCanvasElement> {
  const long = opts.long ?? 1600
  const { parts, owner } = getSplit(m, cuts)
  const keepAll = layout.arrange === 'original' && layout.slogan.mode === 'keep'
  const mk = (r: Rect, s: number, role?: keyof typeof ROLE_ID): El => ({ c: paintCached(m, cw, r, role ? owner : undefined, role ? ROLE_ID[role] : undefined, cutsKey(cuts)), w: r.w * s, h: r.h * s })
  let els: { x: number; y: number; el: El }[] = []
  let W = 0, H = 0

  if (keepAll) {
    const r = m.ink; const el = mk(r, 1); els = [{ x: 0, y: 0, el }]; W = el.w; H = el.h
  } else {
    const sym = parts.symbol && layout.arrange !== 'name' ? mk(parts.symbol, layout.symbolScale, 'symbol') : null
    const name = parts.name && layout.arrange !== 'symbol' ? mk(parts.name, layout.nameScale, 'name') : null
    let slogan: El | null = null
    if (layout.arrange !== 'symbol' && layout.slogan.mode !== 'none') {
      if (layout.slogan.mode === 'keep' && parts.slogan) slogan = mk(parts.slogan, layout.nameScale * layout.slogan.scale, 'slogan')
      else if (layout.slogan.mode === 'custom' && layout.slogan.text.trim()) {
        const refRect = parts.slogan ?? parts.name ?? m.ink
        const color = isHex(layout.slogan.color) ? layout.slogan.color : (cw.map[dominantLayer(m, refRect)] ?? cw.map[0] ?? '#111111')
        // tamanho: o mesmo do slogan original (se houver) ou ~42% da altura do nome; acompanha a escala do nome
        const refH = parts.slogan ? parts.slogan.h : (parts.name ? parts.name.h * 0.42 : 40)
        const size = Math.max(10, (refH / 0.9) * layout.nameScale * layout.slogan.scale)
        const txt = layout.slogan.upper ? layout.slogan.text.toUpperCase() : layout.slogan.text
        const c = await textCanvas(txt, layout.slogan.font, layout.slogan.weight, size, color, size * layout.slogan.tracking, layout.slogan.fit && name ? name.w * 0.94 : null)
        if (c) slogan = { c, w: c.width, h: c.height }
      }
    }
    // grupo de texto: nome + slogan
    let text: { w: number; h: number; items: { x: number; y: number; el: El }[] } | null = null
    if (name || slogan) {
      const g2 = name && slogan ? name.h * 0.32 : 0
      const tw = Math.max(name?.w ?? 0, slogan?.w ?? 0), th = (name?.h ?? 0) + g2 + (slogan?.h ?? 0)
      const ax = (w: number) => (layout.align === 'start' ? 0 : layout.align === 'end' ? tw - w : (tw - w) / 2)
      const items: { x: number; y: number; el: El }[] = []
      if (name) items.push({ x: ax(name.w), y: 0, el: name })
      if (slogan) items.push({ x: ax(slogan.w), y: (name?.h ?? 0) + g2, el: slogan })
      text = { w: tw, h: th, items }
    }
    const base = name?.h ?? sym?.h ?? 100, gap = layout.gap * base
    const ar: Arrange = layout.arrange === 'original' ? (cuts.axis === 'x' ? (cuts.symbolFirst ? 'row' : 'row_rev') : 'stack') : layout.arrange
    if (sym && text && ar === 'stack') {
      W = Math.max(sym.w, text.w); H = sym.h + gap + text.h
      const sx = (w: number) => (layout.align === 'start' ? 0 : layout.align === 'end' ? W - w : (W - w) / 2)
      els.push({ x: sx(sym.w), y: 0, el: sym }); text.items.forEach((t) => els.push({ x: sx(text!.w) + t.x, y: sym.h + gap + t.y, el: t.el }))
    } else if (sym && text && (ar === 'row' || ar === 'row_rev')) {
      W = sym.w + gap + text.w; H = Math.max(sym.h, text.h)
      const vy = (h: number) => (layout.align === 'start' ? 0 : layout.align === 'end' ? H - h : (H - h) / 2)
      const sxp = ar === 'row' ? 0 : text.w + gap, txp = ar === 'row' ? sym.w + gap : 0
      els.push({ x: sxp, y: vy(sym.h), el: sym }); text.items.forEach((t) => els.push({ x: txp + t.x, y: vy(text!.h) + t.y, el: t.el }))
    } else if (sym && (!text || ar === 'symbol')) { W = sym.w; H = sym.h; els.push({ x: 0, y: 0, el: sym }) }
    else if (text) { W = text.w; H = text.h; text.items.forEach((t) => els.push(t)) }
    else { const r = m.ink; const el = mk(r, 1); els = [{ x: 0, y: 0, el }]; W = el.w; H = el.h }
  }

  const pad = layout.pad * Math.max(W, H)
  const TW = W + pad * 2, TH = H + pad * 2
  const f = long / Math.max(TW, TH)
  const cv = document.createElement('canvas'); cv.width = Math.max(2, Math.round(TW * f)); cv.height = Math.max(2, Math.round(TH * f))
  const ctx = cv.getContext('2d')!
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  if (cw.bg !== 'transparent') { ctx.fillStyle = cw.bg; ctx.fillRect(0, 0, cv.width, cv.height) }
  for (const { x, y, el } of els) ctx.drawImage(el.c, (pad + x) * f, (pad + y) * f, el.w * f, el.h * f)
  return cv
}

export const canvasBlob = (cv: HTMLCanvasElement, type = 'image/png', q = 0.92) => new Promise<Blob>((ok, bad) => cv.toBlob((b) => (b ? ok(b) : bad(new Error('Não consegui gerar a imagem.'))), type, q))

// ---------------------------------------------------------------------------------------------
// Variações de layout prontas
// ---------------------------------------------------------------------------------------------
export interface LayoutPreset { id: string; name: string; layout: Layout }
export function layoutPresets(m: LogoModel, cuts: Cuts, current: Layout): LayoutPreset[] {
  const parts = splitParts(m, cuts)
  const sym = parts.symbol, nm = parts.name
  const base = (over: Partial<Layout>): Layout => ({ ...defaultLayout(), slogan: { ...current.slogan }, pad: current.pad, ...over })
  const out: LayoutPreset[] = [{ id: 'original', name: 'Original aprovada', layout: base({ arrange: 'original', gap: originalGap(m, cuts) }) }]
  if (sym && nm) {
    const orig = cuts.axis === 'x' ? 'row' : 'stack'
    const rowScale = Math.max(0.25, Math.min(1.6, (nm.h * 2.6) / sym.h))
    const stackScale = Math.max(0.3, Math.min(1.6, (nm.w * 0.5) / sym.w))
    out.push(
      { id: 'stack', name: orig === 'stack' ? 'Mais compacta' : 'Símbolo em cima', layout: base({ arrange: 'stack', symbolScale: orig === 'stack' ? 1 : stackScale, gap: 0.6 }) },
      { id: 'row', name: orig === 'row' ? 'Mais compacta' : 'Símbolo ao lado', layout: base({ arrange: 'row', symbolScale: orig === 'row' ? 1 : rowScale, gap: 0.45 }) },
      { id: 'row_rev', name: 'Símbolo à direita', layout: base({ arrange: 'row_rev', symbolScale: orig === 'row' ? 1 : rowScale, gap: 0.45 }) },
      { id: 'sym_big', name: 'Símbolo maior', layout: base({ arrange: 'stack', symbolScale: (orig === 'stack' ? 1 : stackScale) * 1.4, gap: 0.7 }) },
      { id: 'sym_small', name: 'Símbolo menor', layout: base({ arrange: 'stack', symbolScale: (orig === 'stack' ? 1 : stackScale) * 0.6, gap: 0.5 }) },
      { id: 'name_big', name: 'Nome maior', layout: base({ arrange: 'stack', symbolScale: (orig === 'stack' ? 1 : stackScale) * 0.75, nameScale: 1.35, gap: 0.5 }) },
      { id: 'name_small', name: 'Nome menor', layout: base({ arrange: 'stack', symbolScale: (orig === 'stack' ? 1 : stackScale) * 1.15, nameScale: 0.7, gap: 0.55 }) },
      { id: 'row_big', name: 'Horizontal, símbolo grande', layout: base({ arrange: 'row', symbolScale: (orig === 'row' ? 1 : rowScale) * 1.35, gap: 0.4 }) },
      { id: 'symbol', name: 'Só o símbolo', layout: base({ arrange: 'symbol' }) },
      { id: 'name', name: 'Só o nome', layout: base({ arrange: 'name' }) },
    )
  } else if (nm) out.push({ id: 'name', name: 'Só o nome', layout: base({ arrange: 'name' }) })
  return out
}

export const layoutKey = (l: Layout) => JSON.stringify(l)
export const cutsKey = (c: Cuts) => `${c.axis}|${c.pos}|${c.symbolFirst}|${c.sloganY}`
