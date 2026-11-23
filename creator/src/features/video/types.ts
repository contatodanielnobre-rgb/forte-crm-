export type VideoEngine = 'edit' | 'saas' | 'hyperframes'
export type CaptionVariant = 'stacked' | 'karaoke' | 'single' | 'boxed' | 'none'
export type VideoFormat = '9:16' | '16:9' | '1:1' | '4:5'
export type VideoStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled'
export type InputRole = 'main' | 'narration' | 'reference' | 'logo'

export interface VideoInput { bucket: 'videos' | 'studio'; path: string; name: string; mime: string; size: number; role: InputRole }

export interface VideoOptions { cut_silence?: boolean; captions?: boolean; sfx?: boolean; outro?: boolean; max_seconds?: number; fit?: 'auto' | 'cover' | 'contain'; language?: string }

export interface VideoPlan {
  summary: string
  engine: VideoEngine
  cut: { silences: boolean; min_gap: number; pad: number; speed: number; remove: { start: number; end: number; why?: string }[] }
  captions: { variant: CaptionVariant; emphasis: string[] }
  look: { accent: string; text: string; box: string; font: string; accent_font: string; punch_in: boolean }
  zooms: { at: number; dur: number; scale: number }[]
  overlays: { type: string; at: number; dur: number; text: string; sub: string }[]
  sfx: { id: string; at: number; vol: number }[]
  outro: { enabled: boolean; text: string; dur: number }
}

export interface VideoStyle {
  id: string
  slug: string | null
  brand_id: string | null
  name: string
  description: string | null
  engine: VideoEngine
  caption_variant: CaptionVariant
  sfx: boolean
  rules: string
  builtin: boolean
  created_at: string
}

export interface VideoJob {
  id: string
  brand_id: string
  created_by: string | null
  parent_id: string | null
  kind: 'edit' | 'analyze'
  title: string
  status: VideoStatus
  stage: string | null
  progress: number
  instruction: string
  format: VideoFormat
  engine: 'auto' | VideoEngine
  style_id: string | null
  style_name: string | null
  options: VideoOptions
  brand: Record<string, unknown>
  inputs: VideoInput[]
  ref_urls: string[]
  feedback: string | null
  plan: VideoPlan | null
  analysis: { style: { name: string; description: string; engine: VideoEngine; caption_variant: CaptionVariant; sfx: boolean; rules: string }; stats: Record<string, unknown> } | null
  output_path: string | null
  thumb_path: string | null
  output_size: number | null
  duration_sec: number | null
  error: string | null
  worker: string | null
  log: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export interface VideoWorker { id: string; last_seen: string; info: { version?: string; cpus?: number; mem_gb?: number; load?: number; sfx?: number; engines?: string[]; whisper?: string; busy?: boolean; job?: string | null; queued?: number } }
