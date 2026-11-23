import type { Brand, SlideDraft } from './types'
import { COLOR_ROLES, FORMAT_PRESETS } from './catalog'

const list = (items: string[]) => items.filter(Boolean).map((i) => `- ${i}`).join('\n')

/**
 * Compila o "documento de treinamento" (skill) da marca a partir do formulário.
 * É esse texto (+ as imagens de referência) que a Edge Function injeta no prompt de cada geração,
 * por isso uma marca nunca "vaza" para outra: o documento é sempre da própria pasta.
 */
export function compileSkill(b: Brand, version: number): string {
  const roleLabel = (r: string) => COLOR_ROLES.find((x) => x.id === r)?.label ?? r
  const out: string[] = []
  out.push(`# Skill de criação — ${b.name}${b.is_base ? ' (BASE DA AGÊNCIA)' : ''}  ·  v${version}`)
  out.push(b.is_base
    ? 'Diretrizes gerais da Forte Company para qualquer marca. Quando a marca tiver seu próprio documento, ele tem prioridade.'
    : 'Este documento tem prioridade sobre as diretrizes gerais da agência. Use somente esta identidade.')

  const id = [b.handle && `Instagram: ${b.handle}`, b.segment && `Segmento: ${b.segment}`, b.website && `Site: ${b.website}`].filter(Boolean) as string[]
  if (id.length) out.push(`## Identidade\n${list(id)}`)

  if (b.colors.length) out.push(`## Paleta de cores\n${list(b.colors.map((c) => `${roleLabel(c.role)}: ${c.hex.toUpperCase()}${c.name ? ` (${c.name})` : ''}`))}\nUse exatamente estes HEX; respeite o contraste mínimo de leitura entre texto e fundo.`)

  const f = [b.fonts.title && `Títulos: ${b.fonts.title}`, b.fonts.body && `Texto corrido: ${b.fonts.body}`, b.fonts.accent && `Destaques: ${b.fonts.accent}`].filter(Boolean) as string[]
  if (f.length) out.push(`## Tipografia\n${list(f)}`)
  const fp = b.font_prefs
  if (fp?.list?.length) out.push(`## Fontes da marca (famílias autorizadas)\n${list(fp.list)}\nUse SOMENTE estas famílias (nomes reais). Distribua por função: título, destaque e corpo, no máximo 3 por peça e com harmonia entre elas.${fp.notes ? `\nComo usar: ${fp.notes}` : ''}`)
  const br = b.brand_brief
  const about = [br?.about && `O que faz: ${br.about}`, br?.products && `Produtos e serviços: ${br.products}`, br?.audience && `Público: ${br.audience}`, br?.goal && `Objetivo dos posts: ${br.goal}`, br?.differentiators && `Diferenciais: ${br.differentiators}`].filter(Boolean) as string[]
  if (about.length) out.push(`## Sobre a empresa\n${list(about)}`)

  const voice = [b.voice, b.tone_tags.length ? `Tom: ${b.tone_tags.join(', ')}.` : ''].filter(Boolean).join('\n')
  if (voice) out.push(`## Voz e tom\n${voice}`)

  const style = [b.style_tags.length ? `Estilo: ${b.style_tags.join(', ')}.` : '', b.style_notes ?? ''].filter(Boolean).join('\n')
  if (style) out.push(`## Estilo visual\n${style}`)

  const spec = (title: string, s: Brand['carousel_spec']) => {
    const rows = [s.slides && `Quantidade padrão de slides: ${s.slides}`, s.cover && `Capa: ${s.cover}`, s.closing && `Último slide / CTA: ${s.closing}`, s.layout && `Layout e grade: ${s.layout}`, s.density && `Densidade de texto: ${s.density}`, s.notes].filter(Boolean) as string[]
    return rows.length ? `## ${title}\n${list(rows)}` : ''
  }
  out.push(spec('Padrão dos carrosséis', b.carousel_spec))
  out.push(spec('Padrão dos criativos estáticos', b.static_spec))

  if (b.cta) out.push(`## Chamada para ação padrão\n${b.cta}`)
  if (b.hashtags.length) out.push(`## Hashtags da marca\n${b.hashtags.join(' ')}`)
  if (b.rules_do.length) out.push(`## SEMPRE\n${list(b.rules_do)}`)
  if (b.rules_dont.length) out.push(`## NUNCA\n${list(b.rules_dont)}`)

  const a = b.style_analysis
  if (a) {
    const rows = [a.summary, a.layout && `Layout: ${a.layout}`, a.typography && `Tipografia observada: ${a.typography}`, a.color_usage && `Uso de cor: ${a.color_usage}`, a.imagery && `Imagens: ${a.imagery}`, a.copy_style && `Texto: ${a.copy_style}`,
      a.recurring_elements?.length ? `Elementos recorrentes: ${a.recurring_elements.join('; ')}` : '', a.avoid?.length ? `Evitar: ${a.avoid.join('; ')}` : ''].filter(Boolean) as string[]
    out.push(`## Análise visual das referências (feita pela IA)\n${list(rows)}`)
  }
  return out.filter(Boolean).join('\n\n')
}

/** Quanto do cadastro está preenchido (guia o usuário até um treino de qualidade) */
export function completeness(b: Brand, refs: number, hasLogo: boolean) {
  const items: { label: string; ok: boolean; weight: number }[] = [
    { label: 'Logo da marca', ok: hasLogo, weight: 15 },
    { label: 'Paleta de cores (3+)', ok: b.colors.length >= 3, weight: 15 },
    { label: 'Tipografia', ok: !!(b.fonts.title || b.fonts.body || b.font_prefs?.list?.length), weight: 10 },
    { label: 'Referências (10+)', ok: refs >= 10, weight: 25 },
    { label: 'Voz e tom', ok: !!(b.voice || b.tone_tags.length), weight: 10 },
    { label: 'Estilo visual', ok: !!(b.style_notes || b.style_tags.length), weight: 10 },
    { label: 'Regras (sempre/nunca)', ok: b.rules_do.length + b.rules_dont.length > 0, weight: 5 },
    { label: 'Hashtags e CTA', ok: b.hashtags.length > 0 || !!b.cta, weight: 5 },
    { label: 'Padrão de carrossel', ok: Object.values(b.carousel_spec).some(Boolean), weight: 5 },
  ]
  const pct = items.reduce((s, i) => s + (i.ok ? i.weight : 0), 0)
  return { pct, items }
}

// ---------- divisão local de texto em slides (usada quando a IA de texto não está conectada) ----------
export function splitHeuristic(text: string, count: number | null, presetId?: string | null): Omit<SlideDraft, 'id'>[] {
  const clean = text.replace(/\r/g, '').trim()
  if (!clean) return []
  const preset = FORMAT_PRESETS.find((p) => p.id === presetId)
  let parts = clean.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean)
  if (parts.length < 3) parts = clean.split(/\n(?=\s*(?:\d+[.)-]|[-•*]))/).map((s) => s.trim()).filter(Boolean)
  if (parts.length < 3) parts = (clean.match(/[^.!?\n]+[.!?]+(?:\s|$)|[^.!?\n]+$/g) ?? [clean]).map((s) => s.trim()).filter(Boolean)
  const target = Math.max(1, Math.min(12, count ?? preset?.slides ?? Math.min(Math.max(parts.length, 3), 8)))
  // agrupa ou mantém até chegar na quantidade desejada
  while (parts.length > target) {
    let best = 0, min = Infinity
    for (let i = 0; i < parts.length - 1; i++) { const l = parts[i].length + parts[i + 1].length; if (l < min) { min = l; best = i } }
    parts.splice(best, 2, `${parts[best]} ${parts[best + 1]}`)
  }
  return parts.map((t, i) => ({
    text: t.replace(/^\s*(?:\d+[.)-]|[-•*])\s*/, ''),
    notes: '',
    role: parts.length === 1 ? 'estático' : i === 0 ? 'capa' : i === parts.length - 1 ? 'cta' : (preset?.roles[i] ?? 'desenvolvimento'),
    refs: [],
  }))
}

/** Melhora local (sem IA): estrutura o briefing quando não há chave OpenAI */
export function localEnhance(text: string, kind: 'carousel' | 'static') {
  const t = text.trim()
  if (!t) return t
  return [
    kind === 'carousel' ? 'Carrossel para Instagram.' : 'Criativo estático para Instagram.',
    `Tema: ${t}`,
    'Estrutura: gancho forte na primeira linha, uma ideia por slide, linguagem direta e chamada para ação no final.',
    'Visual: respeitar a identidade da marca, hierarquia tipográfica clara, bom contraste e margens seguras.',
  ].join('\n')
}
