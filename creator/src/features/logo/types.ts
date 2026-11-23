import type { Layout, Cuts, Colorway } from './engine'

export type InputRole = 'competitor' | 'attempt' | 'inspiration'
export interface LogoInput { path: string; name: string; role: InputRole; note?: string }

export interface LogoForm {
  company: string; segment: string; offer: string; audience?: string; city?: string
  approach: string[]; kind: string; colors: string[]; mood: string[]; slogan?: string; avoid?: string; notes?: string; count?: number
}

export interface LogoConcept {
  index?: number; name: string; territory: string; big_idea: string; symbol: string; typography: string; layout: string
  colors: string[]; color_logic: string; image_brief: string
}

export interface LogoInspect {
  name_text: string; slogan_text: string; layout: string; has_symbol: boolean; description: string; symbol_description: string
  font: { family: string; alt: string[]; category: string; weight: number; uppercase: boolean }
  slogan_font: { family: string; weight: number }
  colors: { hex: string; role: string }[]
}

export interface Scene { key: string; title: string; scene: string; aspect: '1:1' | '4:5' | '16:9' | '9:16'; variant: 'color' | 'white' | 'black' | 'symbol'; category: string }

export interface LogoProject {
  id: string; brand_id: string; created_by: string | null; name: string; form: LogoForm; inputs: LogoInput[]
  positioning: string | null; cliches: string[]; model_id: string | null; quality: string
  status: 'draft' | 'generating' | 'ready' | 'approved'; approved_version_id: string | null
  inspect: LogoInspect | null; branding: { palette?: string[]; intro?: string }
  created_at: string; updated_at: string
}

export interface KitItem { id: string; name: string; layout: Layout; colorway: Colorway }
export interface LogoEdit { cuts?: Cuts; layout?: Layout; colorway?: Colorway; palette?: string[]; kit?: KitItem[] }

export interface LogoVersion {
  id: string; project_id: string; brand_id: string; parent_id: string | null; number: number
  concept: LogoConcept; feedback: string | null; prompt: string | null
  status: 'queued' | 'running' | 'done' | 'error'; error: string | null
  storage_path: string | null; width: number | null; height: number | null; favorite: boolean
  edit: LogoEdit; cost_usd: number | null; created_at: string
}

export interface LogoBranding {
  id: string; project_id: string; brand_id: string; version_id: string | null; scene_key: string; title: string; scene: string
  aspect: Scene['aspect']; variant: Scene['variant']; logo_path: string | null; feedback: string | null
  status: 'queued' | 'running' | 'done' | 'error'; error: string | null; storage_path: string | null
  width: number | null; height: number | null; approved: boolean; sort: number; cost_usd: number | null; created_at: string
}

export interface LogoAnalysis {
  summary?: string; types?: string[]; symbol_language?: string; typography?: string; composition?: string; color_usage?: string; craft?: string
  traits?: string[]; do?: string[]; dont?: string[]; quality_bar?: string
}
