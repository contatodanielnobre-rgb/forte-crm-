import { defaultLogoUi } from './Elements'
import type { Generation, PromptSnapshot, StudioAsset } from './types'

/**
 * O que o Criador de prompts precisa para reabrir uma criação.
 * Criações novas trazem o snapshot salvo; as antigas são reconstruídas com o que o sistema guardou
 * (slides, direção visual, tipografia, estilo, legenda, logo, personagens e concorrentes).
 */
export function snapshotFromGeneration(g: Generation, cast: StudioAsset[]): PromptSnapshot {
  if (g.meta?.snapshot) return g.meta.snapshot
  const imgs = (g.studio_images ?? []).filter((i) => i.is_current).sort((a, b) => a.slide_index - b.slide_index)
  const castIds = new Set(cast.map((a) => a.id))
  const slides = imgs.map((i) => {
    const [visual, typography = ''] = (i.slide_notes ?? '').split(/\n?Tipografia:\s*/)
    return { role: i.role ?? 'desenvolvimento', text: i.slide_text ?? '', visual: visual.trim(), typography: typography.trim(), cast: (i.ref_asset_ids ?? []).filter((id) => castIds.has(id)) }
  })
  const logo = g.meta?.logo
  const ui = defaultLogoUi()
  const style = g.meta?.style === 'solido' || g.meta?.style === 'humanizado' ? g.meta.style : null
  return {
    v: 1, brandId: g.brand_id, kind: g.kind, idea: g.meta?.idea ?? g.input_text ?? '', count: g.kind === 'carousel' && slides.length ? String(slides.length) : '', platform: 'instagram', think: true, follow: false,
    vstyle: style, fonts: { useBrand: true, custom: [], style: '' }, slides,
    res: { angle: '', hooks: [], caption: g.caption ?? '', hashtags: g.hashtags ?? [], checks: [], rationale: '', visual_style: style },
    postCast: Array.from(new Set(slides.flatMap((s) => s.cast))),
    compSel: g.meta?.competitor?.asset_ids ?? [], intensity: g.meta?.competitor?.intensity ?? 50,
    logoUi: logo ? { ...ui, where: logo.slides.length ? 'custom' : 'none', custom: logo.slides, position: logo.position, size: logo.size, assetId: logo.asset_id } : ui,
    chat: [], legacy: !g.meta?.idea, ideaRecovered: !!g.meta?.idea,
  }
}
