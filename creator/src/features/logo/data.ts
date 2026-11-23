import { useQuery, type QueryClient } from '@tanstack/react-query'
import { must, supabase } from '@/lib/supabase'
import { removeObjects, uploadWithProgress } from '@/lib/storage'
import { slugFileName } from '@/lib/utils'
import { BUCKET_STUDIO } from '@/features/studio/catalog'
import { studioGenerate } from '@/features/studio/data'
import type { Brand } from '@/features/studio/types'
import type { InputRole, LogoAnalysis, LogoBranding, LogoConcept, LogoEdit, LogoForm, LogoInput, LogoInspect, LogoProject, LogoVersion, Scene } from './types'

const busy = (s?: string) => s === 'queued' || s === 'running'

export const useLogoProjects = (brandId?: string | null) => useQuery({
  queryKey: ['logo', 'projects', brandId],
  enabled: !!brandId,
  queryFn: async () => must(await supabase.from('logo_projects').select('*').eq('brand_id', brandId!).order('created_at', { ascending: false })) as LogoProject[],
  refetchInterval: (q) => ((q.state.data as LogoProject[] | undefined)?.some((p) => p.status === 'generating') ? 2500 : false),
})

export const useLogoProject = (id?: string | null) => useQuery({
  queryKey: ['logo', 'project', id],
  enabled: !!id,
  queryFn: async () => must(await supabase.from('logo_projects').select('*').eq('id', id!).single()) as LogoProject,
})

export const useLogoVersions = (projectId?: string | null) => useQuery({
  queryKey: ['logo', 'versions', projectId],
  enabled: !!projectId,
  queryFn: async () => must(await supabase.from('logo_versions').select('*').eq('project_id', projectId!).order('created_at', { ascending: true })) as LogoVersion[],
  refetchInterval: (q) => ((q.state.data as LogoVersion[] | undefined)?.some((v) => busy(v.status)) ? 2000 : false),
})

export const useLogoBrandings = (projectId?: string | null) => useQuery({
  queryKey: ['logo', 'brandings', projectId],
  enabled: !!projectId,
  queryFn: async () => must(await supabase.from('logo_brandings').select('*').eq('project_id', projectId!).order('sort', { ascending: true }).order('created_at', { ascending: true })) as LogoBranding[],
  refetchInterval: (q) => ((q.state.data as LogoBranding[] | undefined)?.some((v) => busy(v.status)) ? 2000 : false),
})

export const invalidateLogo = (qc: QueryClient, ...parts: string[]) => qc.invalidateQueries({ queryKey: ['logo', ...parts] })

// ---------------------------------------------------------------------------------------------
// Treinamento
// ---------------------------------------------------------------------------------------------
export const trainLogos = (brandId: string, analyze = true) =>
  studioGenerate<{ analysis: LogoAnalysis | null; version: number; refs: number; doc: string; demo?: boolean }>({ action: 'logo_train', brand_id: brandId, analyze })

export async function saveLogoNotes(brandId: string, notes: string) {
  must(await supabase.from('studio_brands').update({ logo_notes: notes.trim() || null }).eq('id', brandId).select('id'))
}

// ---------------------------------------------------------------------------------------------
// Estúdio
// ---------------------------------------------------------------------------------------------
export interface NewInput { file: File; role: InputRole; note?: string }
export interface CreateProjectArgs { brand: Brand; userId: string; form: LogoForm; inputs: NewInput[]; modelId: string; quality: string; onProgress?: (p: number) => void }

export async function createLogoProject(a: CreateProjectArgs): Promise<LogoProject> {
  const id = crypto.randomUUID()
  const inputs: LogoInput[] = []
  let done = 0
  for (const f of a.inputs) {
    const path = `${a.brand.id}/logos/${id}/in-${Date.now().toString(36)}-${slugFileName(f.file.name)}`
    await uploadWithProgress(path, f.file, undefined, BUCKET_STUDIO)
    inputs.push({ path, name: f.file.name, role: f.role, ...(f.note ? { note: f.note } : {}) })
    a.onProgress?.(Math.round((++done / a.inputs.length) * 100))
  }
  return must(await supabase.from('logo_projects').insert({
    id, brand_id: a.brand.id, created_by: a.userId, name: a.form.company.trim() || 'Logo', form: a.form, inputs, model_id: a.modelId, quality: a.quality, status: 'generating',
  }).select('*').single()) as LogoProject
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items]
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { for (;;) { const x = q.shift(); if (x === undefined) return; await fn(x) } }))
}

async function runVersion(v: LogoVersion, modelId: string | null, quality: string) {
  try { await studioGenerate({ action: 'logo_image', version_id: v.id, model_id: modelId, quality }) }
  catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500)
    await supabase.from('logo_versions').update({ status: 'error', error: msg }).eq('id', v.id).neq('status', 'done')
  }
}

/** A IA (skill de designer) pensa os conceitos; depois cada conceito vira uma imagem */
export async function generateLogos(project: LogoProject, count: number, qc: QueryClient, opts: { feedback?: string; previous?: unknown; used?: string[] } = {}) {
  const r = await studioGenerate<{ concepts: LogoConcept[]; positioning: string }>({ action: 'logo_ideate', project_id: project.id, count, feedback: opts.feedback, previous: opts.previous, used: opts.used })
  const { data: last } = await supabase.from('logo_versions').select('number').eq('project_id', project.id).order('number', { ascending: false }).limit(1)
  let n = ((last?.[0]?.number as number | undefined) ?? 0)
  const rows = must(await supabase.from('logo_versions').insert(r.concepts.map((c, i) => ({
    project_id: project.id, brand_id: project.brand_id, number: ++n, concept: { ...c, index: (opts.used?.length ?? 0) + i + 1 }, status: 'queued',
  }))).select('*')) as LogoVersion[]
  invalidateLogo(qc, 'versions', project.id); invalidateLogo(qc, 'projects')
  await pool(rows, 2, async (v) => { await runVersion(v, project.model_id, project.quality); invalidateLogo(qc, 'versions', project.id) })
  invalidateLogo(qc, 'versions', project.id); invalidateLogo(qc, 'projects'); invalidateLogo(qc, 'project', project.id)
  return rows.length
}

/** Ajuste de uma versão: nova imagem a partir da anterior, mudando só o que foi pedido */
export async function refineLogo(project: LogoProject, from: LogoVersion, feedback: string, qc: QueryClient) {
  const { data: last } = await supabase.from('logo_versions').select('number').eq('project_id', project.id).order('number', { ascending: false }).limit(1)
  const row = must(await supabase.from('logo_versions').insert({
    project_id: project.id, brand_id: project.brand_id, parent_id: from.id, number: ((last?.[0]?.number as number | undefined) ?? 0) + 1,
    concept: { ...from.concept, name: `${from.concept.name} · ajuste` }, feedback, status: 'queued',
  }).select('*').single()) as LogoVersion
  invalidateLogo(qc, 'versions', project.id)
  await runVersion(row, project.model_id, project.quality)
  invalidateLogo(qc, 'versions', project.id)
}

export async function retryVersion(project: LogoProject, v: LogoVersion, qc: QueryClient) {
  await supabase.from('logo_versions').update({ status: 'queued', error: null }).eq('id', v.id)
  invalidateLogo(qc, 'versions', project.id)
  await runVersion(v, project.model_id, project.quality)
  invalidateLogo(qc, 'versions', project.id)
}

export async function toggleFavoriteVersion(v: LogoVersion) { must(await supabase.from('logo_versions').update({ favorite: !v.favorite }).eq('id', v.id).select('id')) }

export async function deleteVersion(v: LogoVersion) {
  must(await supabase.from('logo_versions').delete().eq('id', v.id).select('id'))
  if (v.storage_path) await removeObjects([v.storage_path], BUCKET_STUDIO).catch(() => null)
}

export async function deleteLogoProject(p: LogoProject, versions: LogoVersion[], brandings: LogoBranding[]) {
  must(await supabase.from('logo_projects').delete().eq('id', p.id).select('id'))
  const paths = [...versions.map((v) => v.storage_path), ...brandings.map((b) => b.storage_path), ...brandings.map((b) => b.logo_path), ...p.inputs.map((i) => i.path)].filter(Boolean) as string[]
  if (paths.length) await removeObjects(Array.from(new Set(paths)), BUCKET_STUDIO).catch(() => null)
}

/** Aprova a versão e (se houver IA conectada) lê a logo para descrever, achar a fonte parecida e a paleta */
export async function approveVersion(project: LogoProject, v: LogoVersion, qc: QueryClient) {
  must(await supabase.from('logo_projects').update({ approved_version_id: v.id, status: 'approved' }).eq('id', project.id).select('id'))
  invalidateLogo(qc, 'projects'); invalidateLogo(qc, 'project', project.id)
  try { await studioGenerate<{ inspect: LogoInspect }>({ action: 'logo_inspect', version_id: v.id }); invalidateLogo(qc, 'project', project.id); invalidateLogo(qc, 'projects') } catch { /* sem IA: o painel funciona igual */ }
}
export async function unapprove(project: LogoProject, qc: QueryClient) {
  must(await supabase.from('logo_projects').update({ approved_version_id: null, status: 'ready' }).eq('id', project.id).select('id'))
  invalidateLogo(qc, 'projects'); invalidateLogo(qc, 'project', project.id)
}

export async function saveVersionEdit(id: string, edit: LogoEdit) {
  must(await supabase.from('logo_versions').update({ edit }).eq('id', id).select('id'))
}
export async function saveProjectBranding(id: string, branding: LogoProject['branding']) {
  must(await supabase.from('logo_projects').update({ branding }).eq('id', id).select('id'))
}

// ---------------------------------------------------------------------------------------------
// Branding (mockups)
// ---------------------------------------------------------------------------------------------
export const planBranding = (projectId: string, palette: string[], count = 12) =>
  studioGenerate<{ scenes: Scene[]; intro: string; demo?: boolean }>({ action: 'logo_branding_plan', project_id: projectId, palette, count })

export async function uploadVariant(project: LogoProject, name: string, blob: Blob): Promise<string> {
  const path = `${project.brand_id}/logos/${project.id}/variants/${name}-${Date.now().toString(36)}.png`
  await uploadWithProgress(path, blob, undefined, BUCKET_STUDIO)
  return path
}

async function runBranding(row: LogoBranding, project: LogoProject) {
  try { await studioGenerate({ action: 'logo_branding_image', branding_id: row.id, model_id: project.model_id, quality: project.quality }) }
  catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500)
    await supabase.from('logo_brandings').update({ status: 'error', error: msg }).eq('id', row.id).neq('status', 'done')
  }
}

export async function createBrandings(project: LogoProject, version: LogoVersion, scenes: (Scene & { logoPath: string | null })[], qc: QueryClient) {
  const { data: last } = await supabase.from('logo_brandings').select('sort').eq('project_id', project.id).order('sort', { ascending: false }).limit(1)
  let sort = ((last?.[0]?.sort as number | undefined) ?? 0)
  const rows = must(await supabase.from('logo_brandings').insert(scenes.map((s) => ({
    project_id: project.id, brand_id: project.brand_id, version_id: version.id, scene_key: s.key, title: s.title, scene: s.scene, aspect: s.aspect, variant: s.variant, logo_path: s.logoPath, sort: ++sort, status: 'queued',
  }))).select('*')) as LogoBranding[]
  invalidateLogo(qc, 'brandings', project.id)
  await pool(rows, 2, async (r) => { await runBranding(r, project); invalidateLogo(qc, 'brandings', project.id) })
  invalidateLogo(qc, 'brandings', project.id)
}

export async function regenBranding(row: LogoBranding, project: LogoProject, qc: QueryClient, feedback?: string) {
  await supabase.from('logo_brandings').update({ status: 'queued', error: null, feedback: feedback ?? null, approved: false }).eq('id', row.id)
  invalidateLogo(qc, 'brandings', project.id)
  await runBranding(row, project)
  invalidateLogo(qc, 'brandings', project.id)
}
export async function setBrandingApproved(row: LogoBranding, approved: boolean) { must(await supabase.from('logo_brandings').update({ approved }).eq('id', row.id).select('id')) }
export async function deleteBranding(row: LogoBranding) {
  must(await supabase.from('logo_brandings').delete().eq('id', row.id).select('id'))
  if (row.storage_path) await removeObjects([row.storage_path], BUCKET_STUDIO).catch(() => null)
}
