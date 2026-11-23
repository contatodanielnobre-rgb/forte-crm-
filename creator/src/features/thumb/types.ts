export type CastRole = 'owner' | 'story' | 'support'
export type CastShow = 'auto' | 'face' | 'half' | 'full'
export interface ThumbCastItem { id: string; label: string; description?: string | null; role: CastRole; show: CastShow; expression?: string; gaze?: string; position?: string }
/** Ajustes finos opcionais: vazio/auto = a IA decide */
export interface ThumbDirection { text_depth: string; text_area: string; text_font: string; text_color: string; lettering: string; background: string; dominant_color: string; skeleton: string }
export const emptyDirection = (): ThumbDirection => ({ text_depth: 'auto', text_area: 'auto', text_font: '', text_color: '', lettering: '', background: 'auto', dominant_color: '', skeleton: '' })
export type InputRole = 'competitor' | 'inspiration' | 'own'
export interface ThumbInput { path: string; name: string; role: InputRole; note?: string }

export interface ThumbForm {
  title: string; brief: string; categories: string[]; cast: ThumbCastItem[]; text_mode: 'auto' | 'none' | 'custom'; text_custom?: string; lang?: string
  notes?: string; avoid?: string; count?: number; channel?: string; dir?: ThumbDirection
}

export interface ThumbConcept {
  index?: number; name: string; angle: string; category: string; hook: string; composition: string
  characters: { who: string; placement: string; expression: string; pose: string; outfit: string; gaze?: string }[]
  scene: string; elements: string[]; colors: string[]; objects?: string; skeleton?: string
  text: { mode: 'none' | 'short'; headline: string; sub: string; placement: string; style: string; style_id?: string; font_hint?: string; look?: string; container?: string; integration?: string }
  text_reason: string; image_brief: string
}

export interface ThumbProject {
  id: string; brand_id: string; created_by: string | null; name: string; form: ThumbForm; inputs: ThumbInput[]; analysis: string | null
  model_id: string | null; quality: string; status: 'draft' | 'generating' | 'ready' | 'approved'; approved_version_id: string | null; created_at: string; updated_at: string
}

export interface ThumbVersion {
  id: string; project_id: string; brand_id: string; parent_id: string | null; number: number; concept: ThumbConcept; feedback: string | null; prompt: string | null
  status: 'idea' | 'queued' | 'running' | 'done' | 'error'; error: string | null; storage_path: string | null; width: number | null; height: number | null
  favorite: boolean; cost_usd: number | null; created_at: string
}

export interface ThumbObs {
  index: number; categories: string[]; summary: string; has_text: boolean; text: string[]; text_position: string; text_style: string; text_needed: string
  persons: number; person_role: string; person_position: string; face_size: string; expression: string; gaze: string; pose_hands: string
  background: string; palette: string[]; saturation: string; lighting: string; camera: string; effects: string[]; props: string[]; key_trait: string
  lettering?: { style_id: string; font_hint: string; look: string; container: string; integration: string; hierarchy: string }
  object_logic?: string; realism?: string; skeleton?: string
  expression_class?: string; face_height_pct?: number; text_height_pct?: number; text_behind?: boolean
}
export interface ThumbCatAnalysis { count?: number; summary?: string; composition?: string; character?: string; expression?: string; scene?: string; palette?: string; text?: string; typography?: string; layout?: string; props?: string; object_logic?: string; realism?: string; do?: string[]; dont?: string[] }
export interface ThumbAnalysis {
  stats?: Record<string, { n: number; text_pct: number; no_person_pct: number; behind_pct: number }>
  general?: { summary?: string; composition?: string; faces?: string; color?: string; text_policy?: string; backgrounds?: string; effects?: string; do?: string[]; dont?: string[] }
  categories?: Record<string, ThumbCatAnalysis>
}
