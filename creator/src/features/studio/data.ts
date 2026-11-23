import { useEffect, useState } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { must, supabase, translateError } from '@/lib/supabase'
import { buildPath, downloadFile, removeObjects, signedUrl, uploadWithProgress } from '@/lib/storage'
import { slugFileName } from '@/lib/utils'
import { BUCKET_STUDIO } from './catalog'
import { readMeta, resizeImage } from './image-utils'
import { compileSkill, splitHeuristic } from './skill'
import { makeZip } from './zip'
import type { PromptSnapshot, AssetKind, Brand, BrandBrief, BrandColor, BrandDoc, BrandSpec, CompetitorPlan, FontPrefs, Generation, LogoPlan, Marker, ProviderStatus, SlideDraft, StudioAsset, StudioImage, StudioKind, StudioModel, StudioSettings } from './types'

// ---------------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------------
export const useStudioSettings = () => useQuery({
  queryKey: ['studio', 'settings'],
  queryFn: async () => must(await supabase.from('studio_settings').select('*').eq('id', 1).single()) as StudioSettings,
})

export const useBrands = () => useQuery({
  queryKey: ['studio', 'brands'],
  queryFn: async () => must(await supabase.from('studio_brands').select('*').order('is_base', { ascending: false }).order('name')) as Brand[],
})

export const useBrand = (id?: string | null) => useQuery({
  queryKey: ['studio', 'brand', id],
  enabled: !!id,
  queryFn: async () => must(await supabase.from('studio_brands').select('*').eq('id', id!).single()) as Brand,
})

export const useAssets = (brandId?: string | null, kind?: AssetKind) => useQuery({
  queryKey: ['studio', 'assets', brandId, kind ?? 'all'],
  enabled: !!brandId,
  queryFn: async () => {
    let q = supabase.from('studio_assets').select('*').eq('brand_id', brandId!).order('created_at', { ascending: false })
    if (kind) q = q.eq('kind', kind)
    return must(await q) as StudioAsset[]
  },
})

/** Personagens e objetos da empresa (os "salvos" ficam sempre disponíveis no @) */
export const useCast = (brandId?: string | null) => useQuery({
  queryKey: ['studio', 'assets', brandId, 'cast'],
  enabled: !!brandId,
  queryFn: async () => must(await supabase.from('studio_assets').select('*').eq('brand_id', brandId!).in('kind', ['character', 'object']).order('created_at', { ascending: false })) as StudioAsset[],
})

export const useBrandDocs = (brandId?: string | null) => useQuery({
  queryKey: ['studio', 'docs', brandId],
  enabled: !!brandId,
  queryFn: async () => must(await supabase.from('studio_brand_docs').select('*').eq('brand_id', brandId!).order('created_at', { ascending: false })) as BrandDoc[],
})

export const useModels = () => useQuery({
  queryKey: ['studio', 'models'],
  queryFn: async () => must(await supabase.from('studio_models').select('*').order('sort')) as StudioModel[],
})

export const useProviderStatus = () => useQuery({
  queryKey: ['studio', 'providers'],
  queryFn: async () => (must(await supabase.rpc('studio_provider_status')) ?? []) as ProviderStatus[],
})

export const useUsage = () => useQuery({
  queryKey: ['studio', 'usage'],
  queryFn: async () => {
    const rows = (must(await supabase.rpc('studio_usage')) ?? []) as { brand_id: string; refs: number; bytes: number }[]
    return new Map(rows.map((r) => [r.brand_id, { refs: Number(r.refs), bytes: Number(r.bytes) }]))
  },
})

/** Uma criação com todos os slides/versões (Remover IA) */
export function useGeneration(id?: string | null) {
  return useQuery({
    queryKey: ['studio', 'generation', id],
    enabled: !!id,
    queryFn: async () => must(await supabase.from('studio_generations').select('*, studio_images(*)').eq('id', id!).single()) as Generation,
    refetchInterval: (q) => ((q.state.data as Generation | undefined)?.status === 'running' ? 2500 : false),
  })
}

/** Criações recentes de todas as marcas (porta de entrada do Remover IA) */
export function useRecentGenerations() {
  return useQuery({
    queryKey: ['studio', 'recent-generations'],
    queryFn: async () => must(await supabase.from('studio_generations').select('*, studio_images(*)').order('created_at', { ascending: false }).limit(30)) as Generation[],
  })
}

export function useGenerations(brandId?: string | null) {
  return useQuery({
    queryKey: ['studio', 'generations', brandId],
    enabled: !!brandId,
    queryFn: async () => must(await supabase.from('studio_generations').select('*, studio_images(*)').eq('brand_id', brandId!).order('created_at', { ascending: false }).limit(24)) as Generation[],
    // enquanto algo está sendo gerado, atualiza sozinho
    refetchInterval: (q) => ((q.state.data as Generation[] | undefined)?.some((g) => g.status === 'running') ? 2500 : false),
  })
}

/** URL assinada (1h) de um arquivo do bucket "studio" */
export function useStudioUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    if (path) signedUrl(path, undefined, BUCKET_STUDIO).then((u) => alive && setUrl(u)).catch(() => null)
    return () => { alive = false }
  }, [path])
  return url
}

/** Há chave OpenAI? (planejar texto, melhorar prompt e analisar referências dependem dela) */
export const hasProvider = (status: ProviderStatus[] | undefined, p: string) => !!status?.some((s) => s.provider === p)

// ---------------------------------------------------------------------------------
// Chamadas às Edge Functions
// ---------------------------------------------------------------------------------
async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) {
    let msg = error.message
    try {
      const ctx = (error as unknown as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') msg = (await ctx.json()).error ?? msg
    } catch { /* noop */ }
    if (/Failed to send a request|FunctionsFetchError/i.test(msg)) msg = `A função ${fn} não está publicada no Supabase. Veja o LEIA-ME (seção Criação de conteúdo).`
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}
export const studioGenerate = <T = Record<string, unknown>>(body: Record<string, unknown>) => invoke<T>('studio-generate', body)
export const studioKeys = <T = Record<string, unknown>>(body: Record<string, unknown>) => invoke<T>('studio-keys', body)

// ---------------------------------------------------------------------------------
// Marcas
// ---------------------------------------------------------------------------------
export async function ensureBase(userId: string): Promise<Brand> {
  const { data } = await supabase.from('studio_brands').select('*').eq('is_base', true).maybeSingle()
  if (data) return data as Brand
  return must(await supabase.from('studio_brands').insert({ name: 'Skill base Forte', is_base: true, created_by: userId }).select('*').single()) as Brand
}

export async function createBrand(input: { name: string; client_id?: string | null; segment?: string | null }, userId: string) {
  return must(await supabase.from('studio_brands').insert({ ...input, created_by: userId }).select('*').single()) as Brand
}

export async function saveBrand(id: string, patch: Partial<Brand>) {
  const { error } = await supabase.from('studio_brands').update(patch).eq('id', id)
  if (error) throw new Error(translateError(error.message))
}

/**
 * "Treinar": compila o documento de treinamento (skill) a partir do formulário e, se houver chave OpenAI
 * e referências, pede a análise visual das imagens. Funciona mesmo sem chave (só sem a análise visual).
 */
export async function trainBrand(brand: Brand, opts: { analyze: boolean; onStep?: (s: string) => void }) {
  opts.onStep?.('Compilando o documento de treinamento…')
  await saveBrand(brand.id, { training_status: 'training' } as Partial<Brand>)
  let analysis = brand.style_analysis
  let analysisError: string | null = null
  if (opts.analyze) {
    opts.onStep?.('Analisando as referências com IA de visão…')
    try { analysis = (await studioGenerate<{ analysis: Brand['style_analysis'] }>({ action: 'train', brand_id: brand.id })).analysis }
    catch (e) { analysisError = e instanceof Error ? e.message : String(e) }
  }
  opts.onStep?.('Gravando a nova versão da skill…')
  const version = brand.skill_version + 1
  const doc = compileSkill({ ...brand, style_analysis: analysis }, version)
  await saveBrand(brand.id, { skill_doc: doc, skill_version: version, style_analysis: analysis, training_status: 'ready', trained_at: new Date().toISOString(), dirty: false } as Partial<Brand>)
  return { version, analysisError, analyzed: !!analysis && opts.analyze && !analysisError }
}

// ---------------------------------------------------------------------------------
// Agente "designer": criador de prompts + treinamento
// ---------------------------------------------------------------------------------
export type VisualStyle = 'solido' | 'humanizado' | null
export interface IdeaResult {
  model?: string; topic?: string; angle: string; hooks: string[]; caption: string; hashtags: string[]; checks: string[]; rationale: string
  slides: { role?: string; text: string; visual?: string; emphasis?: string[]; typography?: string; cast?: string[] }[]
  type_system?: { title?: string; accent?: string; body?: string; logic?: string } | null
  demo?: boolean // resposta simulada (sem chave real da OpenAI)
  visual_style?: string | null
  debug?: { system: string; user: string; model: string; playbook: boolean; brand_skill: boolean; base_skill: boolean }
}
export interface IdeaArgs { brandId: string; kind: StudioKind; idea: string; count: number; think: boolean; follow: boolean; platform: 'instagram' | 'tiktok' | 'both'; previous?: unknown; feedback?: string; fonts?: { list: string[]; style: string; override: boolean }; visualStyle?: VisualStyle
  cast?: { id: string; kind: 'character' | 'object'; label: string; description?: string | null }[]; logoNote?: string | null; competitor?: CompetitorPlan | null }

/** Ideia/roteiro → slides (texto + direção visual), ganchos e legenda, prontos para o estúdio */
export async function ideate(a: IdeaArgs) {
  return studioGenerate<IdeaResult>({ action: 'ideate', brand_id: a.brandId, kind: a.kind, idea: a.idea, count: a.count, think: a.think, follow: a.follow, platform: a.platform, previous: a.previous, feedback: a.feedback, fonts: a.fonts, visual_style: a.visualStyle ?? null, cast: a.cast, logo_note: a.logoNote, competitor: a.competitor })
}

export interface BrandBaseResult {
  segment?: string; voice?: string; tone_tags?: string[]; style_tags?: string[]; style_notes?: string; rules_do?: string[]; rules_dont?: string[]; hashtags?: string[]; cta?: string
  carousel_spec?: BrandSpec; static_spec?: BrandSpec; font_prefs?: FontPrefs; colors?: BrandColor[]; summary?: string; missing?: string[]; demo?: boolean
  site?: { fetched: boolean; requested?: boolean; title?: string; colors?: string[]; fonts?: string[] }
}
/** Assistente de treino: lê o que o usuário contou (e o site) e devolve uma proposta de base de treino da empresa */
export async function buildBrandBase(a: { brandId: string; name: string; website: string; segment: string; handle: string; brief: BrandBrief; readSite: boolean }) {
  return studioGenerate<BrandBaseResult>({ action: 'brand_brief', brand_id: a.brandId, name: a.name, website: a.website, segment: a.segment, handle: a.handle, brief: a.brief, read_site: a.readSite })
}

/** Treina o visual dos estilos Sólido e Humanizado: IA de visão analisa as referências marcadas na biblioteca da skill base */
export async function trainStyles() {
  return studioGenerate<{ styles: Record<string, unknown>; counts: Record<string, number>; model: string }>({ action: 'train_styles' })
}

/** Treina o agente: gera o manual do designer da agência a partir da skill base (precisa de chave OpenAI) */
export async function trainAgent() {
  return studioGenerate<{ playbook: string; version: number; model: string; demo?: boolean }>({ action: 'train_agent' })
}

/** Ditado por voz: um trecho de áudio → texto (OpenAI gpt-4o-transcribe) */
export async function transcribeSegment(audio: Blob, vocab: string[], tail?: string) {
  const buf = new Uint8Array(await audio.arrayBuffer()); let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return studioGenerate<{ text: string; model: string }>({ action: 'transcribe', audio_b64: btoa(s), mime: audio.type || 'audio/webm', vocab, tail })
}

/** IA de visão descreve o personagem/objeto (salva em "caption") para o gerador reproduzir o mesmo */
export const describeAsset = (assetId: string) => studioGenerate<{ description: string; short: string }>({ action: 'describe_asset', asset_id: assetId })

export async function updateAsset(id: string, patch: Partial<StudioAsset>) {
  const { error } = await supabase.from('studio_assets').update(patch).eq('id', id)
  if (error) throw new Error(translateError(error.message))
}

export interface BrandImportResult extends BrandBaseResult {
  name?: string; handle?: string; website?: string; brief?: BrandBrief; sources?: string[]; docs_read?: number
  images?: { doc_id: string; kind: 'logo' | 'character' | 'object' | 'reference' | 'ignore'; variant?: string; label?: string; description?: string }[]
}
/** Lê os documentos enviados (PDF, imagens, textos, reuniões) e devolve os campos do treinamento já preenchidos */
export const importBrandDocs = (a: { brandId: string; docIds: string[]; name: string; website: string; segment: string; handle: string; readSite: boolean }) =>
  studioGenerate<BrandImportResult>({ action: 'brand_import', brand_id: a.brandId, doc_ids: a.docIds, name: a.name, website: a.website, segment: a.segment, handle: a.handle, read_site: a.readSite })

export async function saveSettings(patch: Partial<StudioSettings>, qc: QueryClient) {
  const { error } = await supabase.from('studio_settings').update(patch).eq('id', 1)
  if (error) throw new Error(translateError(error.message))
  qc.invalidateQueries({ queryKey: ['studio', 'settings'] })
}

/** Rascunho que o criador de prompts entrega ao Estúdio (lido uma vez em StudioCreate) */
export const DRAFT_KEY = 'fcc-studio-draft'
export interface StudioDraft { brandId: string; kind: StudioKind; slides: { role: string; text: string; notes: string; cast?: string[] }[]; caption: string; hashtags: string[]; autostart?: boolean; style?: VisualStyle; logo?: LogoPlan | null; competitor?: CompetitorPlan | null; snapshot?: PromptSnapshot }

// ---------------------------------------------------------------------------------
// Biblioteca: upload de referências/logos (miniatura + limites)
// ---------------------------------------------------------------------------------
const OK_MIME = /^image\/(jpeg|png|webp|gif|avif|svg\+xml)$/
export interface UploadState { id: string; name: string; progress: number; status: 'queued' | 'uploading' | 'done' | 'error'; error?: string }

export async function uploadAssets(
  brandId: string, filesIn: File[], kind: AssetKind, userId: string,
  limits: { bytesLeft: number; refsLeft: number }, onUpdate: (u: UploadState[]) => void, concurrency = 3,
  extra: { labels?: string[]; saved?: boolean; maxSide?: number } = {},
) {
  const files = filesIn
  const items: UploadState[] = files.map((f) => ({ id: crypto.randomUUID(), name: f.name, progress: 0, status: 'queued' }))
  const patch = (id: string, p: Partial<UploadState>) => { const i = items.findIndex((x) => x.id === id); items[i] = { ...items[i], ...p }; onUpdate([...items]) }
  onUpdate([...items])
  let bytesLeft = limits.bytesLeft, refsLeft = limits.refsLeft
  const created: StudioAsset[] = []
  const queue = files.map((file, i) => ({ file, item: items[i] }))

  async function worker() {
    for (;;) {
      const next = queue.shift()
      if (!next) return
      const { file: original, item } = next
      let file = original
      try {
        // personagens/objetos: cópia de trabalho em boa resolução (o gerador não precisa de 25 MB)
        if (extra.maxSide && /^image\/(jpeg|png|webp)$/.test(original.type)) file = await resizeImage(original, extra.maxSide).catch(() => original)
        if (!OK_MIME.test(file.type)) throw new Error('Formato não permitido (use JPG, PNG, WEBP, GIF ou AVIF)')
        if (file.size > 25 * 1024 * 1024) throw new Error('Acima de 25 MB por imagem')
        if (file.size > bytesLeft) throw new Error('Limite de armazenamento da pasta atingido')
        if (kind === 'reference' && refsLeft <= 0) throw new Error('Limite de imagens de referência atingido')
        bytesLeft -= file.size; if (kind === 'reference') refsLeft--
        patch(item.id, { status: 'uploading' })
        const meta = await readMeta(file)
        const path = `${brandId}/${item.id}/${slugFileName(file.name)}`
        await uploadWithProgress(path, file, (p) => patch(item.id, { progress: Math.round(p * 0.9) }), BUCKET_STUDIO)
        let thumbPath: string | null = null
        if (meta.thumb) {
          thumbPath = `${brandId}/${item.id}/thumb.jpg`
          await uploadWithProgress(thumbPath, meta.thumb, undefined, BUCKET_STUDIO).catch(() => { thumbPath = null })
        }
        const { data, error } = await supabase.from('studio_assets').insert({
          id: item.id, brand_id: brandId, kind, name: file.name, storage_path: path, thumb_path: thumbPath,
          mime_type: file.type, size_bytes: file.size, width: meta.width, height: meta.height, created_by: userId,
          ...(extra.labels ? { label: extra.labels[files.indexOf(original)] ?? null } : {}), ...(extra.saved !== undefined ? { saved: extra.saved } : {}),
        }).select('*').single()
        if (error) { await removeObjects([path, ...(thumbPath ? [thumbPath] : [])], BUCKET_STUDIO).catch(() => null); throw new Error(translateError(error.message)) }
        created.push(data as StudioAsset)
        patch(item.id, { status: 'done', progress: 100 })
      } catch (e) {
        patch(item.id, { status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker))
  return created
}

/** Marca referências com um estilo (sólido/humanizado): o gerador usa primeiro as do estilo do post */
export async function tagAssets(assets: StudioAsset[], tag: 'solido' | 'humanizado', mode: 'add' | 'remove') {
  await Promise.all(assets.map(async (a) => {
    const cur = a.tags ?? []
    const next = mode === 'add' ? Array.from(new Set([...cur.filter((t) => t !== 'solido' && t !== 'humanizado'), tag])) : cur.filter((t) => t !== tag)
    const { error } = await supabase.from('studio_assets').update({ tags: next }).eq('id', a.id)
    if (error) throw new Error(translateError(error.message))
  }))
}

export async function deleteAssets(assets: StudioAsset[]) {
  const ids = assets.map((a) => a.id)
  const { error } = await supabase.from('studio_assets').delete().in('id', ids)
  if (error) throw new Error(translateError(error.message))
  await removeObjects(assets.flatMap((a) => [a.storage_path, ...(a.thumb_path ? [a.thumb_path] : [])]), BUCKET_STUDIO).catch(() => null)
}

export const invalidateStudio = (qc: QueryClient, ...parts: string[]) => qc.invalidateQueries({ queryKey: ['studio', ...parts] })
export const useInvalidateStudio = () => { const qc = useQueryClient(); return (...p: string[]) => invalidateStudio(qc, ...p) }

// ---------------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------------
export interface CreateArgs {
  brand: Brand
  userId: string
  kind: StudioKind
  aspect: string
  modelId: string
  quality: string
  mode: 'text' | 'slides'
  text: string
  slides: SlideDraft[]
  preset: string | null
  refAssetIds: string[]
  slideCount: number | null
  caption?: string
  hashtags?: string[]
  openaiConnected: boolean
  style?: VisualStyle
  logo?: LogoPlan | null
  competitor?: CompetitorPlan | null
  snapshot?: PromptSnapshot | null
}

/** Divide o texto em slides (IA se houver chave OpenAI; senão heurística local) */
export async function planSlides(a: Pick<CreateArgs, 'brand' | 'kind' | 'text' | 'slideCount' | 'preset' | 'openaiConnected'>) {
  if (a.kind === 'static') return { slides: splitHeuristic(a.text, 1, a.preset).slice(0, 1), caption: '', hashtags: [] as string[], ai: false }
  if (a.openaiConnected) {
    try {
      const r = await studioGenerate<{ slides: { role?: string; text: string; visual?: string }[]; caption: string; hashtags: string[] }>({
        action: 'plan', brand_id: a.brand.id, text: a.text, kind: a.kind, count: a.slideCount ?? 0, preset: a.preset,
      })
      if (r.slides?.length) return { slides: r.slides.map((s) => ({ text: s.text, notes: s.visual ?? '', role: s.role ?? 'desenvolvimento', refs: [] as string[] })), caption: r.caption, hashtags: r.hashtags, ai: true }
    } catch { /* cai para a divisão local */ }
  }
  return { slides: splitHeuristic(a.text, a.slideCount, a.preset), caption: '', hashtags: [] as string[], ai: false }
}

export async function createGeneration(a: CreateArgs, qc: QueryClient): Promise<string> {
  let slides = a.slides.filter((s) => s.text.trim() || s.notes.trim())
  let caption = a.caption ?? '', hashtags = a.hashtags ?? []
  if (a.mode === 'text') {
    const plan = await planSlides(a)
    slides = plan.slides.map((s) => ({ ...s, id: crypto.randomUUID() }))
    caption = plan.caption || caption; hashtags = plan.hashtags.length ? plan.hashtags : (hashtags.length ? hashtags : a.brand.hashtags)
  }
  if (a.kind === 'static') slides = slides.slice(0, 1)
  if (!slides.length) throw new Error('Escreva o texto ou o conteúdo de pelo menos um slide.')

  const gen = must(await supabase.from('studio_generations').insert({
    brand_id: a.brand.id, created_by: a.userId, model_id: a.modelId, kind: a.kind, aspect: a.aspect, quality: a.quality, input_mode: a.mode,
    input_text: a.mode === 'text' ? a.text : slides.map((s, i) => `Slide ${i + 1}: ${s.text}`).join('\n'), format_preset: a.preset, caption, hashtags: hashtags.length ? hashtags : a.brand.hashtags,
    status: 'running', meta: { total: slides.length, ...(a.style ? { style: a.style } : {}), ...(a.logo ? { logo: a.logo } : {}), ...(a.competitor?.asset_ids.length ? { competitor: a.competitor } : {}), ...(a.snapshot ? { snapshot: a.snapshot } : {}) },
  }).select('*').single()) as Generation

  const rows = must(await supabase.from('studio_images').insert(slides.map((s, i) => ({
    generation_id: gen.id, brand_id: a.brand.id, slide_index: i + 1, slide_text: s.text.trim() || null, slide_notes: s.notes.trim() || null,
    role: a.kind === 'static' ? 'estático' : s.role || (i === 0 ? 'capa' : 'desenvolvimento'), prompt: s.text.trim() || null, ref_asset_ids: [...(s.cast ?? []), ...(s.refs.length ? s.refs : a.refAssetIds)], status: 'queued',
  }))).select('*')) as StudioImage[]
  rows.sort((x, y) => x.slide_index - y.slide_index)
  qc.invalidateQueries({ queryKey: ['studio', 'generations', a.brand.id] })
  void runImages(rows, gen.id, qc, a.brand.id)
  return gen.id
}

async function runOne(img: StudioImage, extra: Record<string, unknown> = {}) {
  try { await studioGenerate({ action: extra.action ?? 'image', image_id: img.id, ...extra }) }
  catch (e) {
    // erro de rede / função fora do ar: o servidor não conseguiu gravar o status
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500)
    await supabase.from('studio_images').update({ status: 'error', error: msg }).eq('id', img.id).neq('status', 'done')
  }
}

export async function runImages(rows: StudioImage[], generationId: string, qc: QueryClient, brandId: string) {
  const refresh = () => qc.invalidateQueries({ queryKey: ['studio', 'generations', brandId] })
  const [first, ...rest] = rows
  // Slide 1 primeiro: os demais usam a capa como referência de continuidade
  await runOne(first); refresh()
  let i = 0
  const worker = async () => { while (i < rest.length) { const img = rest[i++]; await runOne(img); refresh() } }
  await Promise.all(Array.from({ length: Math.min(3, rest.length) }, worker))
  // resumo do status caso o servidor não tenha conseguido atualizar
  const { data } = await supabase.from('studio_images').select('status').eq('generation_id', generationId).eq('is_current', true)
  const st = (data ?? []).map((r) => r.status as string)
  if (st.length && !st.some((s) => s === 'queued' || s === 'running')) {
    await supabase.from('studio_generations').update({ status: st.every((s) => s === 'done') ? 'done' : st.some((s) => s === 'done') ? 'partial' : 'error' }).eq('id', generationId)
  }
  refresh()
}

/** Nova versão do slide (regenerar do zero, com a mesma instrução) */
export async function regenerateSlide(img: StudioImage, qc: QueryClient, brandId: string) {
  const row = await newVersion(img, {})
  qc.invalidateQueries({ queryKey: ['studio', 'generations', brandId] })
  await runOne(row)
  qc.invalidateQueries({ queryKey: ['studio', 'generations', brandId] })
}

async function newVersion(img: StudioImage, extra: Partial<StudioImage>) {
  const { data: latest } = await supabase.from('studio_images').select('version').eq('generation_id', img.generation_id).eq('slide_index', img.slide_index).order('version', { ascending: false }).limit(1)
  const version = ((latest?.[0]?.version as number | undefined) ?? img.version) + 1
  await supabase.from('studio_images').update({ is_current: false }).eq('generation_id', img.generation_id).eq('slide_index', img.slide_index)
  const row = must(await supabase.from('studio_images').insert({
    generation_id: img.generation_id, brand_id: img.brand_id, slide_index: img.slide_index, slide_text: img.slide_text, slide_notes: img.slide_notes, role: img.role,
    prompt: img.slide_text, ref_asset_ids: img.ref_asset_ids, version, parent_id: img.id, is_current: true, status: 'queued', ...extra,
  }).select('*').single()) as StudioImage
  await supabase.from('studio_generations').update({ status: 'running' }).eq('id', img.generation_id)
  return row
}

/** Edição por marcadores (nova versão do slide; o original é preservado) */
export async function editSlide(img: StudioImage, markers: Marker[], note: string, files: { mask?: string; annotated?: string; model_id?: string }, qc: QueryClient, brandId: string) {
  const row = await newVersion(img, { edit_markers: markers, edit_note: note || null })
  qc.invalidateQueries({ queryKey: ['studio', 'generations', brandId] })
  await runOne(row, { action: 'edit', mask_b64: files.mask, annotated_b64: files.annotated, model_id: files.model_id })
  qc.invalidateQueries({ queryKey: ['studio', 'generations', brandId] })
}

export interface TextBlock { text: string; x: number; y: number; w: number; h: number; role?: string; size?: string; color?: string; font?: string }
/** IA de visão: localiza os blocos de texto da arte (Remover IA › camadas de texto) */
export async function readTexts(imageId: string) {
  return studioGenerate<{ blocks: TextBlock[]; demo?: boolean }>({ action: 'read_text', image_id: imageId })
}

/** Salva edições do Remover IA como NOVA versão de cada slide (a versão anterior fica guardada); sem custo de IA */
export async function saveEditedVersions(items: { img: StudioImage; blob: Blob; width: number; height: number }[], note: string, qc: QueryClient, brandId: string) {
  for (const { img, blob, width, height } of items) {
    const { data: latest } = await supabase.from('studio_images').select('version').eq('generation_id', img.generation_id).eq('slide_index', img.slide_index).order('version', { ascending: false }).limit(1)
    const version = ((latest?.[0]?.version as number | undefined) ?? img.version) + 1
    const id = crypto.randomUUID()
    const path = `${img.brand_id}/${img.generation_id}/${id}.png`
    await uploadWithProgress(path, blob, undefined, BUCKET_STUDIO)
    await supabase.from('studio_images').update({ is_current: false }).eq('generation_id', img.generation_id).eq('slide_index', img.slide_index)
    must(await supabase.from('studio_images').insert({
      id, generation_id: img.generation_id, brand_id: img.brand_id, slide_index: img.slide_index, slide_text: img.slide_text, slide_notes: img.slide_notes, role: img.role,
      prompt: img.prompt, ref_asset_ids: img.ref_asset_ids, version, parent_id: img.id, is_current: true, status: 'done', storage_path: path, width, height, edit_note: note,
    }).select('*').single())
  }
  qc.invalidateQueries({ queryKey: ['studio', 'generations', brandId] })
  qc.invalidateQueries({ queryKey: ['studio', 'generation'] })
  qc.invalidateQueries({ queryKey: ['studio', 'recent-generations'] })
}

export async function setCurrentVersion(img: StudioImage) {
  await supabase.from('studio_images').update({ is_current: false }).eq('generation_id', img.generation_id).eq('slide_index', img.slide_index)
  await supabase.from('studio_images').update({ is_current: true }).eq('id', img.id)
}

export async function deleteGeneration(id: string, images: StudioImage[]) {
  const { error } = await supabase.from('studio_generations').delete().eq('id', id)
  if (error) throw new Error(translateError(error.message))
  await removeObjects(images.map((i) => i.storage_path).filter(Boolean) as string[], BUCKET_STUDIO).catch(() => null)
}

// ---------------------------------------------------------------------------------
// Saídas: download, ZIP, enviar ao cliente, agendar
// ---------------------------------------------------------------------------------
async function imageBlob(path: string) {
  const res = await fetch(await signedUrl(path, undefined, BUCKET_STUDIO))
  return await res.blob()
}
const extFor = (b: Blob) => (b.type.includes('svg') ? 'svg' : b.type.includes('jpeg') ? 'jpg' : 'png')

export async function downloadImages(brandName: string, imgs: StudioImage[], label: string) {
  const done = imgs.filter((i) => i.storage_path && i.status === 'done')
  if (!done.length) throw new Error('Nenhuma imagem pronta para baixar.')
  const base = slugFileName(`${brandName}-${label}`).replace(/\.[^.]+$/, '')
  const blobs = await Promise.all(done.map(async (i) => ({ i, blob: await imageBlob(i.storage_path!) })))
  const save = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }
  if (blobs.length === 1) return save(blobs[0].blob, `${base}.${extFor(blobs[0].blob)}`)
  save(await makeZip(blobs.map(({ i, blob }) => ({ name: `${base}-slide-${String(i.slide_index).padStart(2, '0')}.${extFor(blob)}`, blob }))), `${base}.zip`)
}
export { downloadFile }

/** Envia os slides para a central de arquivos do cliente e, opcionalmente, já pede a aprovação */
export async function sendToClient(brand: Brand, gen: Generation, imgs: StudioImage[], opts: { approval: boolean; title: string }) {
  if (!brand.client_id) throw new Error('Esta pasta não está ligada a um cliente cadastrado.')
  const done = imgs.filter((i) => i.storage_path && i.status === 'done').sort((a, b) => a.slide_index - b.slide_index)
  let n = 0
  for (const img of done) {
    const blob = await imageBlob(img.storage_path!)
    const name = `${slugFileName(opts.title).replace(/\.[^.]+$/, '')}-slide-${String(img.slide_index).padStart(2, '0')}.${extFor(blob)}`
    const file = new File([blob], name, { type: blob.type || 'image/png' })
    const id = crypto.randomUUID()
    const path = buildPath(brand.client_id, id, 1, name)
    await uploadWithProgress(path, file)
    const { error } = await supabase.rpc('register_file', { p_id: id, p_client: brand.client_id, p_project: null, p_folder: null, p_task: null, p_name: name, p_mime: file.type, p_size: file.size, p_storage_path: path, p_shared: opts.approval })
    if (error) { await removeObjects([path]).catch(() => null); throw new Error(translateError(error.message)) }
    if (opts.approval) {
      const { error: e2 } = await supabase.rpc('request_approval', { p_file: id, p_title: done.length > 1 ? `${opts.title} — slide ${img.slide_index}` : opts.title, p_message: gen.caption ?? null, p_task: null, p_due: null })
      if (e2) throw new Error(translateError(e2.message))
    }
    n++
  }
  return n
}

export async function schedulePublication(brand: Brand, title: string, when: string, userId: string) {
  if (!brand.client_id) throw new Error('Esta pasta não está ligada a um cliente cadastrado.')
  const { error } = await supabase.from('events').insert({ client_id: brand.client_id, title, type: 'publication', starts_at: new Date(when).toISOString(), all_day: false, visible_to_client: true, created_by: userId })
  if (error) throw new Error(translateError(error.message))
}

/** Logo de cada marca (para as pastas da biblioteca) */
export const useLogos = () => useQuery({
  queryKey: ['studio', 'assets', 'all-logos'],
  queryFn: async () => {
    const rows = must(await supabase.from('studio_assets').select('*').eq('kind', 'logo')) as StudioAsset[]
    const mains = new Map((must(await supabase.from('studio_brands').select('id, logo_asset_id')) as { id: string; logo_asset_id: string | null }[]).map((b) => [b.id, b.logo_asset_id]))
    const out = new Map<string, StudioAsset>()
    for (const r of rows) if (!out.has(r.brand_id) || mains.get(r.brand_id) === r.id) out.set(r.brand_id, r)
    return out
  },
})
