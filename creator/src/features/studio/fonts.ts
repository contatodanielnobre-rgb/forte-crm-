import { useEffect, useState } from 'react'

/**
 * Catálogo de fontes do estúdio: ~2.200 famílias reais (Google Fonts, Fontsource e uma lista curada de fontes usadas por agências).
 * Qualquer outro nome pode ser digitado livremente: o designer (IA) conhece milhares de famílias pelo nome.
 * O arquivo fonts.json é carregado sob demanda (não pesa no resto do app).
 */
export type FontCat = 's' | 'f' | 'd' | 'h' | 'm'
export interface FontEntry { name: string; cat: FontCat; src: 'g' | 'o' }
export const CAT_LABEL: Record<FontCat, string> = { s: 'Sans-serif', f: 'Serifada', d: 'Display', h: 'Manuscrita', m: 'Mono' }

let cache: Promise<FontEntry[]> | null = null
export const loadFonts = () => (cache ??= import('./fonts.json').then((m) => (m.default as [string, string, string][]).map(([name, cat, src]) => ({ name, cat: cat as FontCat, src: src as 'g' | 'o' }))))

export function useFonts() {
  const [list, setList] = useState<FontEntry[]>([])
  useEffect(() => { let alive = true; loadFonts().then((l) => alive && setList(l)).catch(() => null); return () => { alive = false } }, [])
  return list
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Busca por prefixo primeiro e depois por trecho; sem texto, devolve as mais populares */
export function searchFonts(all: FontEntry[], q: string, cat: FontCat | null, limit: number, exclude: Set<string>): FontEntry[] {
  const n = norm(q.trim())
  const pool = all.filter((f) => (!cat || f.cat === cat) && !exclude.has(f.name.toLowerCase()))
  if (!n) return pool.slice(0, limit)
  const starts: FontEntry[] = [], inc: FontEntry[] = []
  for (const f of pool) {
    const nn = norm(f.name)
    if (nn.startsWith(n)) starts.push(f)
    else if (nn.includes(n)) inc.push(f)
    if (starts.length >= limit) break
  }
  return [...starts, ...inc].slice(0, limit)
}

/** Carrega do Google Fonts só as letras do nome, para o nome aparecer na própria fonte (pré-visualização). Falha em silêncio se estiver offline. */
const loaded = new Set<string>()
export function previewFont(name: string) {
  if (typeof document === 'undefined' || loaded.has(name)) return
  loaded.add(name)
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}&text=${encodeURIComponent(name)}&display=swap`
  document.head.appendChild(l)
}

export const isGoogle = (all: FontEntry[], name: string) => all.some((f) => f.src === 'g' && f.name.toLowerCase() === name.toLowerCase())

/** Atalhos populares entre agências (aparecem quando o campo está vazio) */
export const POPULAR_FONTS = ['Inter', 'Playfair Display', 'Montserrat', 'Poppins', 'Bebas Neue', 'DM Serif Display', 'Space Grotesk', 'Archivo Black', 'Anton', 'Syne', 'Instrument Serif', 'Fraunces']
