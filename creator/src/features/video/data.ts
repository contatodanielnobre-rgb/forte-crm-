import { useEffect, useState } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { must, supabase } from '@/lib/supabase'
import { removeObjects, signedUrl, uploadWithProgress } from '@/lib/storage'
import { slugFileName } from '@/lib/utils'
import type { Brand } from '@/features/studio/types'
import type { InputRole, VideoFormat, VideoInput, VideoJob, VideoOptions, VideoStyle, VideoWorker } from './types'

export const BUCKET_VIDEOS = 'videos'
const ONLINE_MS = 45_000

const active = (rows?: VideoJob[]) => !!rows?.some((j) => j.status === 'queued' || j.status === 'running')

export const useVideoJobs = (brandId?: string | null) => useQuery({
  queryKey: ['video', 'jobs', brandId],
  enabled: !!brandId,
  queryFn: async () => must(await supabase.from('video_jobs').select('*').eq('brand_id', brandId!).order('created_at', { ascending: false }).limit(40)) as VideoJob[],
  refetchInterval: (q) => (active(q.state.data as VideoJob[] | undefined) ? 2500 : 20_000),
})

export const useVideoJob = (id?: string | null) => useQuery({
  queryKey: ['video', 'job', id],
  enabled: !!id,
  queryFn: async () => must(await supabase.from('video_jobs').select('*').eq('id', id!).single()) as VideoJob,
  refetchInterval: (q) => { const j = q.state.data as VideoJob | undefined; return j && (j.status === 'queued' || j.status === 'running') ? 2500 : false },
})

export const useVideoStyles = (brandId?: string | null) => useQuery({
  queryKey: ['video', 'styles', brandId],
  queryFn: async () => {
    const rows = must(await supabase.from('video_styles').select('*').order('builtin', { ascending: false }).order('created_at')) as VideoStyle[]
    return rows.filter((s) => !s.brand_id || s.brand_id === brandId)
  },
})

/** O worker avisa que está vivo a cada 15 s; passou de 45 s sem sinal = offline */
export function useWorker() {
  const q = useQuery({
    queryKey: ['video', 'worker'],
    queryFn: async () => must(await supabase.from('video_workers').select('*').order('last_seen', { ascending: false }).limit(1)) as VideoWorker[],
    refetchInterval: 8000,
  })
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t) }, [])
  const w = q.data?.[0] ?? null
  return { worker: w, online: !!w && now - new Date(w.last_seen).getTime() < ONLINE_MS, loading: q.isLoading }
}

/** URL assinada de um arquivo do bucket de vídeos (preview e download) */
export function useVideoUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    if (path) signedUrl(path, undefined, BUCKET_VIDEOS).then((u) => alive && setUrl(u)).catch(() => null)
    return () => { alive = false }
  }, [path])
  return url
}

export interface NewFile { file: File; role: InputRole }
export interface CreateJobArgs {
  brand: Brand
  userId: string
  title: string
  kind?: 'edit' | 'analyze'
  instruction: string
  format: VideoFormat
  engine: 'auto' | 'edit' | 'saas' | 'hyperframes'
  style?: VideoStyle | null
  options: VideoOptions
  files: NewFile[]
  refUrls: string[]
  parent?: VideoJob | null
  feedback?: string | null
  logoPath?: string | null
  onProgress?: (pct: number) => void
}

const brandSnapshot = (b: Brand, logoPath?: string | null) => ({
  name: b.name, handle: b.handle, website: b.website, cta: b.cta, voice: b.voice,
  colors: (b.colors ?? []).map((c) => c.hex),
  fonts: [b.fonts?.title, b.fonts?.accent, b.fonts?.body].filter(Boolean),
  logo: logoPath ? { bucket: 'studio', path: logoPath } : null,
})

/** Sobe os arquivos e cria o pedido na fila; o worker da VPS pega daqui */
export async function createVideoJob(a: CreateJobArgs) {
  const id = crypto.randomUUID()
  const inputs: VideoInput[] = a.parent && !a.files.length ? a.parent.inputs : []
  const total = a.files.reduce((n, f) => n + f.file.size, 0) || 1
  let done = 0
  for (const f of a.files) {
    const path = `${a.brand.id}/${id}/in/${Date.now().toString(36)}-${slugFileName(f.file.name)}`
    let last = 0
    await uploadWithProgress(path, f.file, (p) => a.onProgress?.(Math.round(((done + (f.file.size * p) / 100) / total) * 100) || last), BUCKET_VIDEOS)
    done += f.file.size
    inputs.push({ bucket: 'videos', path, name: f.file.name, mime: f.file.type || 'application/octet-stream', size: f.file.size, role: f.role })
  }
  const withLogo = inputs.filter((i) => i.role !== 'logo')
  if (a.logoPath && a.kind !== 'analyze') withLogo.push({ bucket: 'studio', path: a.logoPath, name: 'logo' + (a.logoPath.match(/\.[a-z0-9]+$/i)?.[0] ?? '.png'), mime: 'image/png', size: 0, role: 'logo' })
  const row = {
    id, brand_id: a.brand.id, created_by: a.userId, parent_id: a.parent?.id ?? null, kind: a.kind ?? 'edit', title: a.title.trim() || 'Vídeo', status: 'queued', progress: 0, stage: 'Na fila',
    instruction: a.instruction.trim(), format: a.format, engine: a.engine, style_id: a.style?.id ?? null, style_name: a.style?.name ?? null, options: a.options,
    brand: brandSnapshot(a.brand, a.logoPath), inputs: withLogo, ref_urls: a.refUrls, feedback: a.feedback ?? null,
  }
  return must(await supabase.from('video_jobs').insert(row).select('*').single()) as VideoJob
}

export const cancelVideoJob = async (id: string) => must(await supabase.from('video_jobs').update({ status: 'canceled', stage: 'Cancelado' }).eq('id', id).in('status', ['queued', 'running']).select('id'))
export const retryVideoJob = async (id: string) => must(await supabase.from('video_jobs').update({ status: 'queued', stage: 'Na fila', progress: 0, error: null, worker: null, finished_at: null }).eq('id', id).select('id'))

export async function deleteVideoJob(job: VideoJob) {
  must(await supabase.from('video_jobs').delete().eq('id', job.id))
  const paths = [job.output_path, job.thumb_path, ...job.inputs.filter((i) => i.bucket === 'videos').map((i) => i.path)].filter(Boolean) as string[]
  if (paths.length) await removeObjects(paths, BUCKET_VIDEOS).catch(() => null)
}

export async function saveVideoStyle(s: Partial<VideoStyle> & { name: string; rules: string }, brandId: string | null, userId: string) {
  const row = { name: s.name.trim(), description: s.description ?? null, engine: s.engine ?? 'edit', caption_variant: s.caption_variant ?? 'karaoke', sfx: s.sfx ?? true, rules: s.rules.trim(), brand_id: brandId, created_by: userId, builtin: false }
  if (s.id) return must(await supabase.from('video_styles').update(row).eq('id', s.id).select('*').single()) as VideoStyle
  return must(await supabase.from('video_styles').insert(row).select('*').single()) as VideoStyle
}
export const deleteVideoStyle = async (id: string) => must(await supabase.from('video_styles').delete().eq('id', id))

export const invalidateVideo = (qc: QueryClient) => qc.invalidateQueries({ queryKey: ['video'] })

export const fmtDur = (s?: number | null) => (s == null ? '—' : s >= 60 ? `${Math.floor(s / 60)}min ${Math.round(s % 60)}s` : `${Math.round(s)}s`)
export const fmtMb = (b?: number | null) => (b == null ? '—' : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(0.1, b / 1e6).toFixed(1)} MB`)
