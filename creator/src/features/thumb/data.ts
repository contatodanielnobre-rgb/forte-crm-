import { useQuery, type QueryClient } from '@tanstack/react-query'
import { must, supabase, translateError } from '@/lib/supabase'
import { removeObjects, signedUrl, uploadWithProgress } from '@/lib/storage'
import { slugFileName } from '@/lib/utils'
import { BUCKET_STUDIO } from '@/features/studio/catalog'
import { studioGenerate } from '@/features/studio/data'
import type { Brand, StudioAsset } from '@/features/studio/types'
import { renderSpecimen } from './specimen'
import { readFontOf } from '@/features/fonts/reader'
import type { InputRole, ThumbAnalysis, ThumbConcept, ThumbForm, ThumbInput, ThumbObs, ThumbProject, ThumbVersion } from './types'

const busy = (s?: string) => s === 'queued' || s === 'running'

export const useThumbProjects = (brandId?: string | null) => useQuery({
  queryKey: ['thumb', 'projects', brandId],
  enabled: !!brandId,
  queryFn: async () => must(await supabase.from('thumb_projects').select('*').eq('brand_id', brandId!).order('created_at', { ascending: false })) as ThumbProject[],
  refetchInterval: (q) => ((q.state.data as ThumbProject[] | undefined)?.some((p) => p.status === 'generating') ? 2500 : false),
})

export const useThumbVersions = (projectId?: string | null) => useQuery({
  queryKey: ['thumb', 'versions', projectId],
  enabled: !!projectId,
  queryFn: async () => must(await supabase.from('thumb_versions').select('*').eq('project_id', projectId!).order('created_at', { ascending: true })) as ThumbVersion[],
  refetchInterval: (q) => ((q.state.data as ThumbVersion[] | undefined)?.some((v) => busy(v.status)) ? 2000 : false),
})

/** Miniaturas das thumbnails de treino que a IA escolheu como referência de um conceito */
export const useRefThumbs = (ids: string[]) => useQuery({
  queryKey: ['thumb', 'refthumbs', ids.join(',')],
  enabled: ids.length > 0,
  queryFn: async () => must(await supabase.from('studio_assets').select('id, storage_path, thumb_path').in('id', ids)) as { id: string; storage_path: string; thumb_path: string | null }[],
})

export const invalidateThumb = (qc: QueryClient, ...parts: string[]) => qc.invalidateQueries({ queryKey: ['thumb', ...parts] })

// ---------------------------------------------------------------------------------------------
// Treinamento
// ---------------------------------------------------------------------------------------------
export const observeThumbs = (brandId: string, assetIds: string[]) => studioGenerate<{ observed: number; demo?: boolean }>({ action: 'thumb_observe', brand_id: brandId, asset_ids: assetIds })
export const trainThumbs = (brandId: string, analyze = true) =>
  studioGenerate<{ analysis: ThumbAnalysis | null; version: number; refs: number; observed: number; doc: string; demo?: boolean }>({ action: 'thumb_train', brand_id: brandId, analyze })

/** Leitor de fontes: para cada thumbnail com texto, compara as letras com dezenas de fontes e grava a mais parecida (meta.font_match). Retorna quantas foram lidas. */
export async function readThumbFonts(brandId: string, onStep: (s: string, pct: number) => void, force = false, from = 0, to = 100) {
  const { data } = await supabase.from('studio_assets').select('id, meta').eq('brand_id', brandId).eq('kind', 'thumb_ref')
  const todo = ((data ?? []) as { id: string; meta: ThumbObs | null }[]).filter((a) => a.meta?.has_text && (force || !a.meta.font_match))
  let done = 0, failed = 0, next = 0
  const worker = async () => {
    while (next < todo.length) {
      const a = todo[next++], o = a.meta!
      try { await readFontOf({ id: a.id, text: o.text ?? [], hint: o.lettering?.font_hint, alts: (o.lettering as { font_alts?: string[] } | undefined)?.font_alts, weight: (o.lettering as { weight?: string } | undefined)?.weight, case: (o.lettering as { case?: string } | undefined)?.case }) } catch { failed++ }
      done++; onStep(`Lendo a fonte de cada thumbnail com texto (${done}/${todo.length})…`, Math.round(from + (done / Math.max(1, todo.length)) * (to - from)))
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return { read: todo.length - failed, failed, total: todo.length }
}

/** Treino completo: a IA de visão lê cada thumbnail ainda não lida (8 por chamada), o leitor identifica a fonte de cada uma e depois a IA escreve o manual de estilo */
export async function runThumbTraining(brandId: string, refs: StudioAsset[], onStep: (s: string, pct: number) => void, reread = false) {
  const todo = refs.filter((a) => reread || !(a as StudioAsset & { meta?: unknown }).meta)
  let demo = false
  for (let i = 0; i < todo.length; i += 8) {
    onStep(`Lendo as thumbnails com IA de visão (${Math.min(todo.length, i + 8)}/${todo.length})…`, Math.round((i / Math.max(1, todo.length)) * 50))
    const r = await observeThumbs(brandId, todo.slice(i, i + 8).map((a) => a.id))
    demo = demo || !!r.demo
  }
  let fonts = { read: 0, failed: 0, total: 0 }
  if (!demo) { try { fonts = await readThumbFonts(brandId, onStep, false, 50, 90) } catch { /* sem a leitura de fontes o treino continua com o guia embutido */ } }
  onStep('Escrevendo o manual de estilo (geral e por categoria)…', 92)
  const t = await trainThumbs(brandId, true)
  onStep('Pronto', 100)
  return { ...t, demo: demo || !!t.demo, fonts }
}

/** Só relê as fontes (todas, de novo) e atualiza as estatísticas sem refazer o manual escrito */
export async function rereadThumbFonts(brandId: string, onStep: (s: string, pct: number) => void) {
  const fonts = await readThumbFonts(brandId, onStep, true, 2, 94)
  onStep('Atualizando o perfil de fontes por categoria…', 96)
  await trainThumbs(brandId, false)
  onStep('Pronto', 100)
  return fonts
}

export async function saveThumbNotes(brandId: string, notes: string) {
  must(await supabase.from('studio_brands').update({ thumb_notes: notes.trim() || null }).eq('id', brandId).select('id'))
}

/** Marca ou desmarca uma categoria em várias referências (as tags guardam os ids das categorias) */
export async function tagThumbRefs(assets: StudioAsset[], category: string, mode: 'add' | 'remove') {
  await Promise.all(assets.map(async (a) => {
    const cur = a.tags ?? []
    const next = mode === 'add' ? Array.from(new Set([...cur, category])) : cur.filter((t) => t !== category)
    const { error } = await supabase.from('studio_assets').update({ tags: next }).eq('id', a.id)
    if (error) throw new Error(translateError(error.message))
  }))
}

// ---------------------------------------------------------------------------------------------
// Estúdio
// ---------------------------------------------------------------------------------------------
export interface NewInput { file: File; role: InputRole; note?: string }
export interface CreateProjectArgs { brand: Brand; userId: string; form: ThumbForm; inputs: NewInput[]; modelId: string; quality: string }

export async function createThumbProject(a: CreateProjectArgs): Promise<ThumbProject> {
  const id = crypto.randomUUID()
  const inputs: ThumbInput[] = []
  for (const f of a.inputs) {
    const path = `${a.brand.id}/thumbs/${id}/in-${Date.now().toString(36)}-${slugFileName(f.file.name)}`
    await uploadWithProgress(path, f.file, undefined, BUCKET_STUDIO)
    inputs.push({ path, name: f.file.name, role: f.role, ...(f.note ? { note: f.note } : {}) })
  }
  return must(await supabase.from('thumb_projects').insert({
    id, brand_id: a.brand.id, created_by: a.userId, name: (a.form.title || a.form.brief.slice(0, 50) || 'Thumbnail').trim(), form: a.form, inputs, model_id: a.modelId, quality: a.quality, status: 'generating',
  }).select('*').single()) as ThumbProject
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items]
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { for (;;) { const x = q.shift(); if (x === undefined) return; await fn(x) } }))
}

/** A IA lê a explicação do vídeo e propõe ideias (conceitos). Ainda não gera imagem: o usuário escolhe quais viram thumbnail. */
export async function ideateThumbs(project: ThumbProject, count: number, qc: QueryClient, opts: { used?: string[]; feedback?: string; previous?: unknown } = {}) {
  const r = await studioGenerate<{ concepts: ThumbConcept[]; analysis: string }>({ action: 'thumb_ideate', project_id: project.id, count, used: opts.used, feedback: opts.feedback, previous: opts.previous })
  const { data: last } = await supabase.from('thumb_versions').select('number').eq('project_id', project.id).order('number', { ascending: false }).limit(1)
  let n = ((last?.[0]?.number as number | undefined) ?? 0)
  const base = opts.used?.length ?? 0
  const rows = must(await supabase.from('thumb_versions').insert(r.concepts.map((c, i) => ({
    project_id: project.id, brand_id: project.brand_id, number: ++n, concept: { ...c, index: base + i + 1 }, status: 'idea',
  }))).select('*')) as ThumbVersion[]
  invalidateThumb(qc, 'versions', project.id); invalidateThumb(qc, 'projects')
  return { rows, analysis: r.analysis }
}

/** Amostra das letras na fonte REAL do título (vai como imagem de referência para o gerador copiar o desenho das letras) */
async function specimenFor(project: ThumbProject, v: ThumbVersion): Promise<string | undefined> {
  const t = v.concept?.text
  if (!t || t.mode !== 'short' || !t.headline) return undefined
  const font = project.form.dir?.text_font || t.font_hint
  if (!font) return undefined
  try {
    const blob = await renderSpecimen(t.headline, font)
    if (!blob) return undefined
    const path = `${v.brand_id}/thumbs/${v.project_id}/spec-${v.id}.png`
    await uploadWithProgress(path, blob, undefined, BUCKET_STUDIO)
    return path
  } catch { return undefined }
}

async function runVersion(project: ThumbProject, v: ThumbVersion) {
  const modelId = project.model_id, quality = project.quality
  try { await studioGenerate({ action: 'thumb_image', version_id: v.id, model_id: modelId, quality, specimen_path: v.parent_id ? undefined : await specimenFor(project, v) }) }
  catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500)
    await supabase.from('thumb_versions').update({ status: 'error', error: msg }).eq('id', v.id).neq('status', 'done')
  }
}

export async function saveConcept(v: ThumbVersion, concept: ThumbConcept) {
  must(await supabase.from('thumb_versions').update({ concept }).eq('id', v.id).select('id'))
}

/** Gera a imagem dos conceitos escolhidos (2 por vez) */
export async function generateThumbImages(project: ThumbProject, versions: ThumbVersion[], qc: QueryClient) {
  for (const v of versions) await supabase.from('thumb_versions').update({ status: 'queued', error: null }).eq('id', v.id)
  await supabase.from('thumb_projects').update({ status: 'generating' }).eq('id', project.id)
  invalidateThumb(qc, 'versions', project.id)
  await pool(versions, 2, async (v) => { await runVersion(project, v); invalidateThumb(qc, 'versions', project.id) })
  invalidateThumb(qc, 'versions', project.id); invalidateThumb(qc, 'projects')
}

export async function refineThumb(project: ThumbProject, from: ThumbVersion, feedback: string, qc: QueryClient) {
  const { data: last } = await supabase.from('thumb_versions').select('number').eq('project_id', project.id).order('number', { ascending: false }).limit(1)
  const row = must(await supabase.from('thumb_versions').insert({
    project_id: project.id, brand_id: project.brand_id, parent_id: from.id, number: ((last?.[0]?.number as number | undefined) ?? 0) + 1,
    concept: { ...from.concept, name: `${from.concept.name} · ajuste` }, feedback, status: 'queued',
  }).select('*').single()) as ThumbVersion
  invalidateThumb(qc, 'versions', project.id)
  await runVersion(project, row)
  invalidateThumb(qc, 'versions', project.id)
}

export async function retryThumb(project: ThumbProject, v: ThumbVersion, qc: QueryClient) {
  await supabase.from('thumb_versions').update({ status: 'queued', error: null }).eq('id', v.id)
  invalidateThumb(qc, 'versions', project.id)
  await runVersion(project, v)
  invalidateThumb(qc, 'versions', project.id)
}

export async function toggleFavoriteThumb(v: ThumbVersion) { must(await supabase.from('thumb_versions').update({ favorite: !v.favorite }).eq('id', v.id).select('id')) }
export async function approveThumb(project: ThumbProject, v: ThumbVersion | null) {
  must(await supabase.from('thumb_projects').update({ approved_version_id: v?.id ?? null, status: v ? 'approved' : 'ready' }).eq('id', project.id).select('id'))
}
export async function deleteThumbVersion(v: ThumbVersion) {
  must(await supabase.from('thumb_versions').delete().eq('id', v.id).select('id'))
  if (v.storage_path) await removeObjects([v.storage_path], BUCKET_STUDIO).catch(() => null)
}
export async function deleteThumbProject(p: ThumbProject, versions: ThumbVersion[]) {
  must(await supabase.from('thumb_projects').delete().eq('id', p.id).select('id'))
  const paths = [...versions.map((v) => v.storage_path), ...p.inputs.map((i) => i.path)].filter(Boolean) as string[]
  if (paths.length) await removeObjects(paths, BUCKET_STUDIO).catch(() => null)
}

/** Baixa a thumbnail: PNG original ou JPG 1280×720 (formato do YouTube, abaixo de 2 MB) */
export async function downloadThumb(path: string, name: string, kind: 'png' | 'youtube') {
  const blob = await (await fetch(await signedUrl(path, undefined, BUCKET_STUDIO))).blob()
  const save = (b: Blob, file: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }
  if (kind === 'png') return save(blob, `${name}.${blob.type.includes('svg') ? 'svg' : 'png'}`)
  const bmp = await new Promise<HTMLImageElement>((ok, bad) => { const im = new Image(); const u = URL.createObjectURL(blob); im.onload = () => { URL.revokeObjectURL(u); ok(im) }; im.onerror = () => bad(new Error('Não consegui abrir a imagem.')); im.src = u })
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720
  const ctx = cv.getContext('2d')!; ctx.imageSmoothingQuality = 'high'
  const s = Math.max(1280 / bmp.width, 720 / bmp.height); ctx.drawImage(bmp, (1280 - bmp.width * s) / 2, (720 - bmp.height * s) / 2, bmp.width * s, bmp.height * s)
  for (const q of [0.92, 0.85, 0.75]) { const b = await new Promise<Blob | null>((ok) => cv.toBlob(ok, 'image/jpeg', q)); if (b && (b.size < 2_000_000 || q === 0.75)) return save(b, `${name}-1280x720.jpg`) }
}
