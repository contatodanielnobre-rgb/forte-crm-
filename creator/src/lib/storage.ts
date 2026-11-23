import { BUCKET, SUPABASE_KEY, SUPABASE_URL, supabase, translateError } from './supabase'
import { slugFileName } from './utils'

export const MAX_FILE_MB = Number(import.meta.env.VITE_MAX_FILE_MB ?? 500)

const ALLOWED_EXT = [
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'heic', 'heif', 'avif',
  'mp4', 'mov', 'webm', 'avi', 'mkv', 'mp3', 'wav', 'm4a',
  'pdf', 'ppt', 'pptx', 'key', 'xls', 'xlsx', 'csv', 'doc', 'docx', 'txt',
  'zip', 'ai', 'psd', 'eps',
]

const EXT_MIME: Record<string, string> = {
  mov: 'video/quicktime', mkv: 'video/x-matroska', heic: 'image/heic', psd: 'image/vnd.adobe.photoshop',
  ai: 'application/postscript', eps: 'application/postscript', key: 'application/octet-stream',
  csv: 'text/csv', m4a: 'audio/mp4',
}

export function mimeOf(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return file.type || EXT_MIME[ext] || 'application/octet-stream'
}

/** Valida tamanho e formato. Retorna mensagem de erro ou null. */
export function validateFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXT.includes(ext)) return `Formato .${ext || '?'} não permitido`
  if (file.size === 0) return 'Arquivo vazio'
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `Acima do limite de ${MAX_FILE_MB} MB`
  return null
}

export function buildPath(clientId: string, fileId: string, version: number, name: string) {
  return `${clientId}/${fileId}/v${version}-${Date.now().toString(36)}-${slugFileName(name)}`
}

/** Upload com progresso (XHR direto na API do Storage, respeitando as policies). */
export async function uploadWithProgress(path: string, file: File | Blob, onProgress?: (pct: number) => void, bucket: string = BUCKET) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão expirada. Entre novamente.')
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', SUPABASE_KEY!)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('Content-Type', file instanceof File ? mimeOf(file) : file.type || 'application/octet-stream')
    xhr.setRequestHeader('cache-control', 'max-age=3600')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let msg = `Falha no upload (${xhr.status})`
      try { msg = JSON.parse(xhr.responseText).message ?? msg } catch { /* noop */ }
      reject(new Error(translateError(msg)))
    }
    xhr.onerror = () => reject(new Error('Falha de conexão durante o upload.'))
    xhr.send(file)
  })
}

const urlCache = new Map<string, { url: string; exp: number }>()

/** URL assinada temporária (o bucket é privado). */
export async function signedUrl(path: string, opts?: { download?: string | boolean }, bucket: string = BUCKET) {
  const key = bucket + ":" + path + (opts?.download ? `|dl:${opts.download}` : '')
  const hit = urlCache.get(key)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60, opts?.download ? { download: opts.download } : undefined)
  if (error || !data) throw new Error(translateError(error?.message ?? 'Não foi possível gerar o link'))
  urlCache.set(key, { url: data.signedUrl, exp: Date.now() + 55 * 60 * 1000 })
  return data.signedUrl
}

export async function downloadFile(path: string, name: string) {
  const url = await signedUrl(path, { download: name })
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function removeObjects(paths: string[], bucket: string = BUCKET) {
  if (!paths.length) return
  const { error } = await supabase.storage.from(bucket).remove(paths)
  if (error) throw new Error(translateError(error.message))
}
