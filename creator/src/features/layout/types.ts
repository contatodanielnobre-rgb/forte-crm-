import type { LayoutAnalysis, LayoutForm, LayoutObs, LayoutPlan, LayoutSiteAnalysis } from '../../../supabase/functions/_shared/layout'

export type { LayoutAnalysis, LayoutForm, LayoutObs, LayoutPlan, LayoutSiteAnalysis }
export type { LayoutDesignSystem, LayoutPagePlan, LayoutSectionPlan, LayoutUrl } from '../../../supabase/functions/_shared/layout'

export type InputRole = 'current' | 'competitor' | 'inspiration'
export interface LayoutInput { path: string; name: string; role: InputRole; page?: string; order?: number; note?: string }

export interface LayoutSite {
  id: string; brand_id: string; created_by: string | null; name: string; url: string | null; categories: string[]; notes: string | null
  observation: LayoutObs | null; observed_at: string | null; favorite: boolean; created_at: string; updated_at: string
}

export interface LayoutProject {
  id: string; brand_id: string; created_by: string | null; name: string; form: LayoutForm; inputs: LayoutInput[]; analysis: LayoutSiteAnalysis | null; plan: LayoutPlan | null
  model_id: string | null; quality: string; status: 'draft' | 'analyzing' | 'planned' | 'generating' | 'ready' | 'approved'; created_at: string; updated_at: string
}

export type SectionKind = 'system' | 'mascot' | 'section'
export interface LayoutSection {
  id: string; project_id: string; brand_id: string; kind: SectionKind; page_key: string; page_name: string; section_key: string; name: string; position: number
  version: number; is_current: boolean; parent_id: string | null; concept: import('../../../supabase/functions/_shared/layout').LayoutSectionPlan | Record<string, never>
  feedback: string | null; prompt: string | null; status: 'plan' | 'queued' | 'running' | 'done' | 'error'; error: string | null; storage_path: string | null
  width: number | null; height: number | null; favorite: boolean; approved: boolean; cost_usd: number | null; created_at: string
}
