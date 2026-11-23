export type StudioKind = 'carousel' | 'static'
export type Provider = 'openai' | 'google' | 'fal' | 'ideogram' | 'stability' | 'recraft' | 'custom'

export interface BrandColor { hex: string; name: string; role: 'primary' | 'secondary' | 'background' | 'text' | 'accent' | 'other' }
export interface BrandBrief { about?: string; products?: string; goal?: string; audience?: string; differentiators?: string }
export interface FontPrefs { list: string[]; notes: string }
export interface BrandSpec { slides?: number; cover?: string; closing?: string; density?: string; layout?: string; notes?: string }

export interface Brand {
  id: string
  client_id: string | null
  name: string
  is_base: boolean
  handle: string | null
  segment: string | null
  website: string | null
  logo_asset_id: string | null
  colors: BrandColor[]
  fonts: { title?: string; body?: string; accent?: string }
  font_prefs: FontPrefs
  brand_brief: BrandBrief
  hashtags: string[]
  cta: string | null
  voice: string | null
  tone_tags: string[]
  style_tags: string[]
  style_notes: string | null
  rules_do: string[]
  rules_dont: string[]
  carousel_spec: BrandSpec
  static_spec: BrandSpec
  skill_doc: string | null
  style_analysis: StyleAnalysis | null
  skill_version: number
  training_status: 'draft' | 'training' | 'ready' | 'error'
  trained_at: string | null
  dirty: boolean
  /** treinamento de logos (Criador de logos) */
  logo_skill_doc?: string | null
  logo_analysis?: import('@/features/logo/types').LogoAnalysis | null
  logo_skill_version?: number
  logo_trained_at?: string | null
  logo_trained_refs?: number
  logo_notes?: string | null
  /** treinamento de thumbnails */
  thumb_skill_doc?: string | null
  thumb_analysis?: import('@/features/thumb/types').ThumbAnalysis | null
  thumb_skill_version?: number
  thumb_trained_at?: string | null
  thumb_trained_refs?: number
  thumb_notes?: string | null
  created_at: string
  updated_at: string
}

export interface StyleAnalysis {
  layout?: string; typography?: string; color_usage?: string; imagery?: string; copy_style?: string
  recurring_elements?: string[]; avoid?: string[]; summary?: string
}

export type AssetKind = 'reference' | 'logo' | 'character' | 'object' | 'competitor' | 'logo_ref' | 'thumb_ref'

export interface StudioAsset {
  id: string
  brand_id: string
  kind: AssetKind
  name: string
  storage_path: string
  thumb_path: string | null
  mime_type: string
  size_bytes: number
  width: number | null
  height: number | null
  tags: string[]
  favorite: boolean
  caption: string | null
  label?: string | null
  saved?: boolean
  /** thumb_ref: observação da IA de visão (posição, expressão, texto, paleta…) */
  meta?: import('@/features/thumb/types').ThumbObs | null
  created_at: string
}

export interface StudioModel {
  id: string
  provider: Provider
  name: string
  description: string | null
  api_model: string
  capabilities: { edit?: boolean; mask?: boolean; refs?: boolean; text?: boolean }
  sort: number
  enabled: boolean
}

export interface ProviderStatus { provider: Provider; last4: string | null; base_url: string | null; updated_at: string }

export interface StudioSettings {
  id: 1
  max_bytes: number
  max_refs: number
  text_model: string
  default_model: string
  onboarding_done: boolean
  agent_playbook: string | null
  agent_version: number
  agent_trained_at: string | null
  agent_notes: Record<string, unknown>
  style_visuals?: Record<string, unknown> | null
  default_quality: string
  refs_per_slide: number
}

export interface Marker { x: number; y: number; r: number; note: string }

export interface StudioImage {
  id: string
  generation_id: string
  brand_id: string
  slide_index: number
  slide_text: string | null
  slide_notes: string | null
  role: string | null
  prompt: string | null
  version: number
  parent_id: string | null
  is_current: boolean
  edit_markers: Marker[] | null
  edit_note: string | null
  ref_asset_ids: string[]
  status: 'queued' | 'running' | 'done' | 'error'
  error: string | null
  storage_path: string | null
  width: number | null
  height: number | null
  favorite: boolean
  cost_usd?: number | null
  created_at: string
}

export interface Generation {
  id: string
  brand_id: string
  created_by: string | null
  model_id: string | null
  kind: StudioKind
  aspect: string
  input_mode: 'text' | 'slides'
  input_text: string | null
  format_preset: string | null
  quality: string
  caption: string | null
  hashtags: string[]
  status: 'running' | 'done' | 'partial' | 'error'
  error: string | null
  meta: { total?: number; demo?: boolean; style?: string; logo?: LogoPlan | null; competitor?: CompetitorPlan | null; snapshot?: PromptSnapshot; idea?: string }
  created_at: string
  studio_images?: StudioImage[]
}

export interface SlideDraft { id: string; text: string; notes: string; role: string; refs: string[]; cast?: string[] }

/** Onde a logo da marca aparece (slides: 1 = capa) e em que posição. Vai em studio_generations.meta */
export type LogoPos = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br'
export interface LogoPlan { asset_id: string | null; position: LogoPos; size: 'sm' | 'md' | 'lg'; slides: number[] }
/** Posts de concorrentes como referência e o quanto a peça deve se parecer com eles (0–100) */
export interface CompetitorPlan { asset_ids: string[]; intensity: number }

/** Tudo que estava no Criador de prompts quando a criação foi enviada ao Estúdio (guardado em studio_generations.meta.snapshot) */
export interface PromptSnapshot {
  v: 1
  brandId: string; kind: StudioKind; idea: string; count: string; platform: 'instagram' | 'tiktok' | 'both'; think: boolean; follow: boolean
  vstyle: 'solido' | 'humanizado' | null
  fonts: { useBrand: boolean; custom: string[]; style: string }
  slides: { role: string; text: string; visual: string; typography: string; cast: string[] }[]
  res: { angle: string; hooks: string[]; caption: string; hashtags: string[]; checks: string[]; rationale: string; type_system?: { title?: string; accent?: string; body?: string; logic?: string } | null; visual_style?: string | null } | null
  postCast: string[]; compSel: string[]; intensity: number
  logoUi: { where: 'none' | 'cover' | 'last' | 'cover_last' | 'all' | 'custom'; custom: number[]; position: LogoPos; size: 'sm' | 'md' | 'lg'; assetId: string | null }
  chat: string[]
  /** true = reconstruído de uma criação antiga (anterior ao salvamento automático) */
  legacy?: boolean
  /** a ideia foi recuperada dos registros do sistema (criação antiga) */
  ideaRecovered?: boolean
}

export interface BrandDoc {
  id: string; brand_id: string; kind: 'document' | 'image' | 'audio' | 'video' | 'text'; name: string; mime_type: string | null; size_bytes: number
  storage_path: string | null; extracted_text: string | null; summary: string | null; status: 'new' | 'analyzed' | 'error'; error: string | null; created_at: string
}
