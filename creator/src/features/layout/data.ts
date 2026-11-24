import { useQuery, type QueryClient } from '@tanstack/react-query'
import { must, supabase, translateError } from '@/lib/supabase'
import { removeObjects, signedUrl, uploadWithProgress } from '@/lib/storage'
import { slugFileName } from '@/lib/utils'
import { BUCKET_STUDIO } from '@/features/studio/catalog'
import { studioGenerate } from '@/features/studio/data'
import { makeZip } from '@/features/studio/zip'
import type { StudioAsset } from '@/features/studio/types'
import { fileToSlices, type Slice } from './slice'
import type { InputRole, LayoutForm, LayoutInput, LayoutPlan, LayoutProject, LayoutSection, LayoutSectionPlan, LayoutSite, LayoutSiteAnalysis } from './types'

const busy = (s?: string) => s === 'queued' || s === 'running'
const MAX_SLICES_PER_SITE = 60

export const useLayoutSites = (brandId?: string | null) => useQuery({
  queryKey: ['layout', 'sites', brandId],
  enabled: !!brandId,
  queryFn: async () => must(await supabase.from('layout_sites').select('*').eq('brand_id', brandId!).order('created_at', { ascending: false })) as LayoutSite[],
})

/** Primeiro recorte de cada site (a "capa") */
export const useSiteCovers = (brandId?: string | null) => useQuery({
  queryKey: ['layout', 'covers', brandId],
  enabled: !!brandId,
  queryFn: async () => {
    const rows = must(await supabase.from('studio_assets').select('id, site_id, storage_path, thumb_path, width, height').eq('brand_id', brandId!).eq('kind', 'site_ref').eq('site_order', 0)) as Pick<StudioAsset, 'id' | 'site_id' | 'storage_path' | 'thumb_path' | 'width' | 'height'>[]
    return new Map(rows.map((r) => [r.site_id as string, r]))
  },
})

export const useSiteAssets = (siteId?: string | null) => useQuery({
  queryKey: ['layout', 'site-assets', siteId],
  enabled: !!siteId,
  queryFn: async () => must(await supabase.from('studio_assets').select('*').eq('site_id', siteId!).eq('kind', 'site_ref').order('site_order', { ascending: true })) as StudioAsset[],
})

export const useLayoutProjects = (brandId?: string | null) => useQuery({
  queryKey: ['layout', 'projects', brandId],
  enabled: !!brandId,
  queryFn: async () => must(await supabase.from('layout_projects').select('*').eq('brand_id', brandId!).order('created_at', { ascending: false })) as LayoutProject[],
  refetchInterval: (q) => ((q.state.data as LayoutProject[] | undefined)?.some((p) => p.status === 'generating') ? 3000 : false),
})

export const useLayoutSections = (projectId?: string | null) => useQuery({
  queryKey: ['layout', 'sections', projectId],
  enabled: !!projectId,
  queryFn: async () => must(await supabase.from('layout_sections').select('*').eq('project_id', projectId!).order('position', { ascending: true }).order('version', { ascending: true })) as LayoutSection[],
  refetchInterval: (q) => ((q.state.data as LayoutSection[] | undefined)?.some((v) => busy(v.status)) ? 2000 : false),
})

/** Projetos que estão gerando NESTA aba. Seções "na fila" sem execução ativa (aba fechada no meio) são tratadas como pendentes. */
const runs = new Map<string, number>()
export const activeRuns = { has: (id: string) => (runs.get(id) ?? 0) > 0, add: (id: string) => runs.set(id, (runs.get(id) ?? 0) + 1), delete: (id: string) => runs.set(id, Math.max(0, (runs.get(id) ?? 1) - 1)) }

export const invalidateLayout = (qc: QueryClient, ...parts: string[]) => qc.invalidateQueries({ queryKey: ['layout', ...parts] })

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items]
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { for (;;) { const x = q.shift(); if (x === undefined) return; await fn(x) } }))
}
const spread = <T,>(list: T[], n: number): T[] => (list.length <= n ? list : Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]))

// ---------------------------------------------------------------------------------------------
// Treinamento: sites de referência
// ---------------------------------------------------------------------------------------------
export interface NewSiteGroup { name: string; url?: string; categories: string[]; files: File[] }

/** Fatia cada arquivo (print, PDF, vídeo) em recortes e sobe tudo; cada grupo vira UM site */
export async function createSites(brandId: string, userId: string, groups: NewSiteGroup[], onStep: (text: string, pct: number) => void) {
  const created: LayoutSite[] = []
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g]
    const label = `${grp.name} (${g + 1}/${groups.length})`
    onStep(`Preparando ${label}…`, Math.round((g / groups.length) * 100))
    let slices: Slice[] = []
    for (const f of grp.files) {
      try { slices.push(...await fileToSlices(f, (p) => onStep(`Lendo ${f.name} — ${Math.round(p * 100)}%`, Math.round(((g + p * 0.5) / groups.length) * 100)))) }
      catch (e) { throw new Error(`${f.name}: ${e instanceof Error ? e.message : String(e)}`) }
    }
    if (!slices.length) throw new Error(`${grp.name}: não consegui ler nenhuma imagem.`)
    slices = spread(slices, MAX_SLICES_PER_SITE)
    const site = must(await supabase.from('layout_sites').insert({ brand_id: brandId, created_by: userId, name: grp.name.slice(0, 200) || 'Site', url: grp.url?.trim() || null, categories: grp.categories }).select('*').single()) as LayoutSite
    const paths: string[] = []
    try {
      const rows: Record<string, unknown>[] = []
      await pool(slices.map((s, i) => ({ s, i })), 3, async ({ s, i }) => {
        const path = `${brandId}/sites/${site.id}/${String(i + 1).padStart(3, '0')}-${slugFileName(s.name)}`
        await uploadWithProgress(path, s.blob, undefined, BUCKET_STUDIO)
        paths.push(path)
        rows.push({ brand_id: brandId, kind: 'site_ref', name: s.name, storage_path: path, thumb_path: null, mime_type: 'image/jpeg', size_bytes: s.blob.size, width: s.width, height: s.height, site_id: site.id, site_order: i, created_by: userId })
        onStep(`Enviando ${label}: ${rows.length}/${slices.length} recortes`, Math.round(((g + 0.5 + 0.5 * (rows.length / slices.length)) / groups.length) * 100))
      })
      rows.sort((a, b) => (a.site_order as number) - (b.site_order as number))
      const { error } = await supabase.from('studio_assets').insert(rows)
      if (error) throw new Error(translateError(error.message))
      created.push(site)
    } catch (e) {
      await supabase.from('layout_sites').delete().eq('id', site.id)
      if (paths.length) await removeObjects(paths, BUCKET_STUDIO).catch(() => null)
      throw e
    }
  }
  onStep('Pronto', 100)
  return created
}

export const observeSite = (siteId: string) => studioGenerate<{ observation: LayoutSite['observation']; categories: string[] }>({ action: 'layout_observe', site_id: siteId })
export const trainLayouts = (brandId: string, analyze = true) =>
  studioGenerate<{ analysis: unknown; version: number; refs: number; observed: number; doc: string }>({ action: 'layout_train', brand_id: brandId, analyze })

/** Treino completo: a IA de visão lê cada site ainda não lido (2 por vez) e depois escreve o manual de estilo */
export async function runLayoutTraining(brandId: string, sites: LayoutSite[], onStep: (s: string, pct: number) => void, reread = false) {
  const todo = sites.filter((s) => reread || !s.observation)
  let done = 0; const failed: string[] = []
  await pool(todo, 2, async (s) => {
    try { await observeSite(s.id) } catch (e) { failed.push(`${s.name}: ${e instanceof Error ? e.message : String(e)}`) }
    done++; onStep(`Lendo os sites com IA de visão (${done}/${todo.length})…`, Math.round((done / Math.max(1, todo.length)) * 80))
  })
  onStep('Escrevendo o manual de estilo (geral e por categoria)…', 90)
  const t = await trainLayouts(brandId, true)
  onStep('Pronto', 100)
  return { ...t, failed }
}

export async function saveLayoutNotes(brandId: string, notes: string) {
  must(await supabase.from('studio_brands').update({ layout_notes: notes.trim() || null }).eq('id', brandId).select('id'))
}

/** Marca ou desmarca uma categoria em vários sites */
export async function tagSites(sites: LayoutSite[], category: string, mode: 'add' | 'remove') {
  await Promise.all(sites.map(async (s) => {
    const next = mode === 'add' ? Array.from(new Set([...s.categories, category])) : s.categories.filter((t) => t !== category)
    const { error } = await supabase.from('layout_sites').update({ categories: next }).eq('id', s.id)
    if (error) throw new Error(translateError(error.message))
  }))
}
export async function updateSite(id: string, patch: Partial<Pick<LayoutSite, 'name' | 'url' | 'notes' | 'favorite'>>) {
  must(await supabase.from('layout_sites').update(patch).eq('id', id).select('id'))
}
export async function deleteSites(sites: LayoutSite[]) {
  const ids = sites.map((s) => s.id)
  const { data: assets } = await supabase.from('studio_assets').select('storage_path, thumb_path').in('site_id', ids)
  const { error } = await supabase.from('layout_sites').delete().in('id', ids)
  if (error) throw new Error(translateError(error.message))
  const paths = (assets ?? []).flatMap((a) => [a.storage_path, a.thumb_path]).filter(Boolean) as string[]
  if (paths.length) await removeObjects(paths, BUCKET_STUDIO).catch(() => null)
}

// ---------------------------------------------------------------------------------------------
// Estúdio: projeto → leitura do site atual → plano → seções
// ---------------------------------------------------------------------------------------------
export interface NewInput { file: File; role: InputRole; note?: string }
export interface CreateProjectArgs { brandId: string; userId: string; form: LayoutForm; inputs: NewInput[]; modelId: string; quality: string; onStep?: (t: string, pct: number) => void }

export async function createLayoutProject(a: CreateProjectArgs): Promise<LayoutProject> {
  const id = crypto.randomUUID()
  const inputs: LayoutInput[] = []
  for (let i = 0; i < a.inputs.length; i++) {
    const f = a.inputs[i]
    a.onStep?.(`Preparando ${f.file.name}…`, Math.round((i / Math.max(1, a.inputs.length)) * 100))
    const slices = spread(await fileToSlices(f.file), f.role === 'current' ? 40 : 6)
    let n = 0
    for (const s of slices) {
      const path = `${a.brandId}/layouts/${id}/in-${f.role}-${String(i + 1)}-${String(++n).padStart(2, '0')}-${slugFileName(s.name)}`
      await uploadWithProgress(path, s.blob, undefined, BUCKET_STUDIO)
      inputs.push({ path, name: s.name, role: f.role, order: inputs.filter((x) => x.role === f.role).length, ...(f.note ? { note: f.note } : {}) })
    }
  }
  return must(await supabase.from('layout_projects').insert({
    id, brand_id: a.brandId, created_by: a.userId, name: (a.form.business || 'Site').trim().slice(0, 150), form: a.form, inputs, model_id: a.modelId, quality: a.quality, status: 'draft',
  }).select('*').single()) as LayoutProject
}

export const analyzeLayout = async (project: LayoutProject, qc: QueryClient) => {
  const r = await studioGenerate<{ analysis: LayoutSiteAnalysis | null; skipped?: boolean }>({ action: 'layout_analyze', project_id: project.id })
  invalidateLayout(qc, 'projects')
  return r
}

/** Apaga as linhas (e arquivos) atuais do projeto e cria as novas a partir do plano */
export async function replaceSections(project: LayoutProject, plan: LayoutPlan, qc: QueryClient) {
  const { data: old } = await supabase.from('layout_sections').select('id, storage_path').eq('project_id', project.id)
  if (old?.length) {
    must(await supabase.from('layout_sections').delete().eq('project_id', project.id).select('id'))
    const paths = old.map((o) => o.storage_path).filter(Boolean) as string[]
    if (paths.length) await removeObjects(paths, BUCKET_STUDIO).catch(() => null)
  }
  const base = { project_id: project.id, brand_id: project.brand_id, status: 'plan', version: 1, is_current: true }
  const rows: Record<string, unknown>[] = [{ ...base, kind: 'system', page_key: 'sistema', page_name: 'Guia de estilo', section_key: 'guia', name: 'Guia de estilo', position: 0, concept: {} }]
  if (plan.design_system.mascot?.use) rows.push({ ...base, kind: 'mascot', page_key: 'sistema', page_name: 'Guia de estilo', section_key: 'mascote', name: `Mascote${plan.design_system.mascot.name ? ` · ${plan.design_system.mascot.name}` : ''}`, position: 1, concept: {} })
  plan.pages.forEach((p, pi) => p.sections.forEach((s, si) => rows.push({ ...base, kind: 'section', page_key: p.key, page_name: p.name, section_key: s.key, name: s.name, position: 10 + pi * 100 + si, concept: s })))
  must(await supabase.from('layout_sections').insert(rows).select('id'))
  invalidateLayout(qc, 'sections', project.id)
}

/** A IA monta o plano (sistema de design + páginas + seções) e já cria as linhas para gerar */
export async function planLayout(project: LayoutProject, qc: QueryClient, opts: { feedback?: string } = {}) {
  const r = await studioGenerate<{ plan: LayoutPlan }>({ action: 'layout_plan', project_id: project.id, feedback: opts.feedback, previous: opts.feedback ? project.plan : undefined })
  await replaceSections(project, r.plan, qc)
  invalidateLayout(qc, 'projects')
  return r.plan
}

export async function savePlan(project: LayoutProject, plan: LayoutPlan) {
  must(await supabase.from('layout_projects').update({ plan }).eq('id', project.id).select('id'))
}
export async function saveConcept(row: LayoutSection, concept: LayoutSectionPlan) {
  must(await supabase.from('layout_sections').update({ concept, name: concept.name || row.name }).eq('id', row.id).select('id'))
}
export async function saveProjectForm(project: LayoutProject, form: LayoutForm) {
  must(await supabase.from('layout_projects').update({ form }).eq('id', project.id).select('id'))
}

async function runRow(project: LayoutProject, row: LayoutSection, qc: QueryClient) {
  try { await studioGenerate({ action: 'layout_image', section_id: row.id, model_id: project.model_id, quality: project.quality }) }
  catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500)
    await supabase.from('layout_sections').update({ status: 'error', error: msg }).eq('id', row.id).neq('status', 'done')
  }
  invalidateLayout(qc, 'sections', project.id)
}

/** Gera na ordem certa: guia de estilo → mascote → hero (vira a âncora visual) → demais seções (2 por vez). O hero aparece assim que fica pronto. */
export async function generateRows(project: LayoutProject, rows: LayoutSection[], qc: QueryClient) {
  activeRuns.add(project.id)
  try { await runGeneration(project, rows, qc) } finally { activeRuns.delete(project.id); invalidateLayout(qc, 'sections', project.id); invalidateLayout(qc, 'projects') }
}

async function runGeneration(project: LayoutProject, rows: LayoutSection[], qc: QueryClient) {
  const list = [...rows].sort((a, b) => a.position - b.position)
  for (const r of list) await supabase.from('layout_sections').update({ status: 'queued', error: null }).eq('id', r.id)
  await supabase.from('layout_projects').update({ status: 'generating' }).eq('id', project.id)
  invalidateLayout(qc, 'sections', project.id)
  const first = (k: LayoutSection['kind']) => list.filter((r) => r.kind === k)
  for (const r of first('system')) await runRow(project, r, qc)
  for (const r of first('mascot')) await runRow(project, r, qc)
  const sections = first('section')
  const hero = sections[0]
  if (hero) await runRow(project, hero, qc)
  await pool(sections.slice(1), 2, (r) => runRow(project, r, qc))
}

export async function refineSection(project: LayoutProject, from: LayoutSection, feedback: string, qc: QueryClient) {
  const { data: last } = await supabase.from('layout_sections').select('version').eq('project_id', project.id).eq('page_key', from.page_key).eq('section_key', from.section_key).eq('position', from.position).order('version', { ascending: false }).limit(1)
  const row = must(await supabase.from('layout_sections').insert({
    project_id: project.id, brand_id: project.brand_id, kind: from.kind, page_key: from.page_key, page_name: from.page_name, section_key: from.section_key, name: from.name, position: from.position,
    version: ((last?.[0]?.version as number | undefined) ?? from.version) + 1, is_current: true, parent_id: from.id, concept: from.concept, feedback, status: 'queued',
  }).select('*').single()) as LayoutSection
  await supabase.from('layout_sections').update({ is_current: false }).eq('id', from.id)
  invalidateLayout(qc, 'sections', project.id)
  activeRuns.add(project.id); try { await runRow(project, row, qc) } finally { activeRuns.delete(project.id) }
}
export async function retrySection(project: LayoutProject, row: LayoutSection, qc: QueryClient) {
  activeRuns.add(project.id)
  try {
    await supabase.from('layout_sections').update({ status: 'queued', error: null }).eq('id', row.id)
    invalidateLayout(qc, 'sections', project.id)
    await runRow(project, row, qc)
  } finally { activeRuns.delete(project.id) }
}
/** Volta a uma versão anterior (ela passa a ser a atual) */
export async function selectVersion(row: LayoutSection) {
  await supabase.from('layout_sections').update({ is_current: false }).eq('project_id', row.project_id).eq('position', row.position).eq('page_key', row.page_key).eq('section_key', row.section_key)
  must(await supabase.from('layout_sections').update({ is_current: true }).eq('id', row.id).select('id'))
}
export async function toggleApprove(row: LayoutSection) { must(await supabase.from('layout_sections').update({ approved: !row.approved }).eq('id', row.id).select('id')) }
export async function toggleFavoriteSection(row: LayoutSection) { must(await supabase.from('layout_sections').update({ favorite: !row.favorite }).eq('id', row.id).select('id')) }
export async function deleteLayoutProject(p: LayoutProject, rows: LayoutSection[]) {
  must(await supabase.from('layout_projects').delete().eq('id', p.id).select('id'))
  const paths = [...rows.map((r) => r.storage_path), ...p.inputs.map((i) => i.path)].filter(Boolean) as string[]
  if (paths.length) await removeObjects(paths, BUCKET_STUDIO).catch(() => null)
}

// ---------------------------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------------------------
const save = (b: Blob, file: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }
const fetchBlob = async (path: string) => (await fetch(await signedUrl(path, undefined, BUCKET_STUDIO))).blob()
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'secao'

export async function downloadSection(row: LayoutSection, prefix = '') { if (row.storage_path) save(await fetchBlob(row.storage_path), `${prefix}${slug(row.name)}.png`) }

/** Todas as seções atuais em um ZIP (nomeadas na ordem da página) */
export async function downloadAllZip(project: LayoutProject, rows: LayoutSection[]) {
  const cur = rows.filter((r) => r.is_current && r.storage_path).sort((a, b) => a.position - b.position)
  const files = await Promise.all(cur.map(async (r, i) => ({ name: `${String(i + 1).padStart(2, '0')}-${slug(r.page_name)}-${slug(r.name)}.png`, blob: await fetchBlob(r.storage_path!) })))
  save(await makeZip(files), `${slug(project.name)}-layout.zip`)
}

/** Empilha as seções de uma página em UMA imagem comprida (como o print da página inteira) */
export async function downloadPageImage(project: LayoutProject, pageName: string, rows: LayoutSection[]) {
  const cur = rows.filter((r) => r.is_current && r.kind === 'section' && r.storage_path).sort((a, b) => a.position - b.position)
  const imgs = await Promise.all(cur.map(async (r) => { const u = URL.createObjectURL(await fetchBlob(r.storage_path!)); const im = new Image(); await new Promise<void>((ok, bad) => { im.onload = () => ok(); im.onerror = () => bad(new Error('Imagem inválida')); im.src = u }); URL.revokeObjectURL(u); return im }))
  if (!imgs.length) throw new Error('Nenhuma seção pronta nesta página.')
  const w = imgs[0].naturalWidth, hs = imgs.map((im) => Math.round(im.naturalHeight * (w / im.naturalWidth)))
  const total = hs.reduce((s, h) => s + h, 0)
  const c = document.createElement('canvas'); c.width = w; c.height = Math.min(total, 16000)
  const ctx = c.getContext('2d')!; let y = 0
  imgs.forEach((im, i) => { ctx.drawImage(im, 0, y, w, hs[i]); y += hs[i] })
  save(await new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('Imagem grande demais para o navegador.'))), 'image/png')), `${slug(project.name)}-${slug(pageName)}-pagina-inteira.png`)
}
