import { must, supabase, translateError } from '@/lib/supabase'
import { removeObjects, signedUrl, uploadWithProgress } from '@/lib/storage'
import { slugFileName } from '@/lib/utils'
import { BUCKET_STUDIO } from './catalog'
import { transcribeSegment } from './data'
import type { BrandDoc } from './types'

/** Documentos de treinamento da empresa: upload, leitura local (texto de docx/pptx/txt) e transcrição de áudio/vídeo (reuniões) */

export const DOC_ACCEPT = '.pdf,.docx,.pptx,.xlsx,.txt,.md,.csv,.json,.html,image/*,audio/*,video/*'
const KEEP_MAX = 45 * 1024 * 1024 // acima disso guardamos só a transcrição (limite de arquivo do Storage)

export function detectKind(f: File): BrandDoc['kind'] | 'unsupported' {
  const n = f.name.toLowerCase()
  if (f.type.startsWith('image/')) return 'image'
  if (f.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|opus|aac|flac)$/.test(n)) return 'audio'
  if (f.type.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi)$/.test(n)) return 'video'
  if (/\.(pdf|docx|pptx|xlsx)$/.test(n) || f.type === 'application/pdf') return 'document'
  if (/\.(txt|md|csv|json|html?|srt|vtt)$/.test(n) || f.type.startsWith('text/')) return 'text'
  return 'unsupported'
}

// ---------------------------------------------------------------------------------
// ZIP mínimo (docx/pptx/xlsx são ZIPs de XML)
// ---------------------------------------------------------------------------------
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
async function unzipText(buf: ArrayBuffer, want: (name: string) => boolean): Promise<[string, string][]> {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), dec = new TextDecoder()
  let e = u8.length - 22
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--
  if (e < 0) throw new Error('Arquivo corrompido.')
  const count = dv.getUint16(e + 10, true)
  let off = dv.getUint32(e + 16, true)
  const out: [string, string][] = []
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break
    const method = dv.getUint16(off + 10, true), comp = dv.getUint32(off + 20, true)
    const nl = dv.getUint16(off + 28, true), xl = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lo = dv.getUint32(off + 42, true)
    const name = dec.decode(u8.subarray(off + 46, off + 46 + nl))
    off += 46 + nl + xl + cl
    if (!want(name)) continue
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true)
    const raw = u8.subarray(start, start + comp)
    out.push([name, dec.decode(method === 0 ? raw : await inflateRaw(raw))])
  }
  return out
}
const unxml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const xmlText = (xml: string, para: string, run: string) => unxml(xml.replace(new RegExp(`</${para}>`, 'g'), '\n').replace(new RegExp(`<${run}[^>]*>([^<]*)</${run}>|<[^>]+>`, 'g'), (_m, t) => (t ?? ''))).replace(/\n{3,}/g, '\n\n').trim()

/** Texto de .docx, .pptx, .xlsx, .txt/.md/.csv/.json/.html/.srt (PDF é lido pela IA no servidor) */
export async function extractLocalText(f: File): Promise<string | null> {
  const n = f.name.toLowerCase()
  if (/\.docx$/.test(n)) { const r = await unzipText(await f.arrayBuffer(), (x) => x === 'word/document.xml'); return r[0] ? xmlText(r[0][1], 'w:p', 'w:t') : '' }
  if (/\.pptx$/.test(n)) {
    const r = (await unzipText(await f.arrayBuffer(), (x) => /^ppt\/(slides|notesSlides)\/[^/]+\.xml$/.test(x))).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    return r.map(([name, x], i) => `[${/notes/i.test(name) ? 'Notas' : 'Slide'} ${i + 1}]\n${xmlText(x, 'a:p', 'a:t')}`).join('\n\n')
  }
  if (/\.xlsx$/.test(n)) { const r = await unzipText(await f.arrayBuffer(), (x) => x === 'xl/sharedStrings.xml'); return r[0] ? xmlText(r[0][1], 'si', 't') : '' }
  if (detectKind(f) === 'text') { const t = await f.text(); return /\.html?$/.test(n) ? unxml(t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : t }
  return null
}

// ---------------------------------------------------------------------------------
// Reuniões (áudio/vídeo) → texto
// ---------------------------------------------------------------------------------
function wav16(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2), dv = new DataView(buf)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); dv.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true)
  return new Blob([buf], { type: 'audio/wav' })
}

/** Decodifica o áudio do arquivo (mesmo de um vídeo), reduz para 16 kHz mono e transcreve em trechos de ~2,5 min, em ordem. */
export async function transcribeMedia(file: File, vocab: string[], onProgress: (msg: string) => void): Promise<string> {
  if (file.size > 400 * 1024 * 1024) throw new Error('Arquivo grande demais para o navegador (acima de 400 MB). Exporte só o áudio em MP3 e envie de novo.')
  onProgress('Abrindo o áudio…')
  let audio: AudioBuffer
  try {
    const ctx = new AudioContext({ sampleRate: 16000 })
    audio = await ctx.decodeAudioData(await file.arrayBuffer())
    void ctx.close()
  } catch {
    throw new Error('O navegador não conseguiu abrir o áudio deste arquivo (ou ele é longo demais). Exporte só o áudio em MP3 e envie de novo.')
  }
  const mono = new Float32Array(audio.length)
  for (let c = 0; c < audio.numberOfChannels; c++) { const d = audio.getChannelData(c); for (let i = 0; i < d.length; i++) mono[i] += d[i] / audio.numberOfChannels }
  const rate = audio.sampleRate, size = Math.round(rate * 150)
  const parts = Math.max(1, Math.ceil(mono.length / size))
  let text = ''
  for (let p = 0; p < parts; p++) {
    onProgress(`Transcrevendo a reunião: parte ${p + 1} de ${parts}…`)
    const slice = mono.subarray(p * size, Math.min(mono.length, (p + 1) * size))
    let peak = 0; for (let i = 0; i < slice.length; i += 64) peak = Math.max(peak, Math.abs(slice[i]))
    if (peak < 0.01) continue // trecho mudo
    const r = await transcribeSegment(wav16(slice, rate), vocab, text.slice(-250))
    if (r.text.trim()) text += (text ? '\n' : '') + r.text.trim()
  }
  if (!text.trim()) throw new Error('Não encontrei fala neste arquivo.')
  return text
}

// ---------------------------------------------------------------------------------
// Banco de documentos
// ---------------------------------------------------------------------------------
export async function addBrandDoc(brandId: string, userId: string, file: File, vocab: string[], onProgress: (msg: string) => void): Promise<BrandDoc> {
  const kind = detectKind(file)
  if (kind === 'unsupported') throw new Error('Formato não suportado. Use PDF, DOCX, PPTX, TXT, imagens, áudio ou vídeo (.doc antigo: salve como PDF).')
  const id = crypto.randomUUID()
  let path: string | null = null
  if (file.size <= KEEP_MAX) {
    onProgress('Enviando…')
    path = `${brandId}/docs/${id}/${slugFileName(file.name)}`
    await uploadWithProgress(path, file, undefined, BUCKET_STUDIO)
  } else if (kind === 'document' || kind === 'image' || kind === 'text') throw new Error('Arquivo acima de 45 MB. Reduza ou divida o arquivo.')

  let text: string | null = null, error: string | null = null
  try {
    if (kind === 'audio' || kind === 'video') text = await transcribeMedia(file, vocab, onProgress)
    else if (kind !== 'image' && !/\.pdf$/i.test(file.name)) { onProgress('Lendo o texto…'); text = await extractLocalText(file) }
  } catch (e) { error = e instanceof Error ? e.message : String(e) }
  const row = must(await supabase.from('studio_brand_docs').insert({
    id, brand_id: brandId, kind, name: file.name, mime_type: file.type || null, size_bytes: file.size, storage_path: path, extracted_text: text, status: error ? 'error' : 'new', error, created_by: userId,
  }).select('*').single()) as BrandDoc
  return row
}

export async function deleteBrandDoc(d: BrandDoc) {
  const { error } = await supabase.from('studio_brand_docs').delete().eq('id', d.id)
  if (error) throw new Error(translateError(error.message))
  if (d.storage_path) await removeObjects([d.storage_path], BUCKET_STUDIO).catch(() => null)
}

/** Baixa o arquivo guardado (para virar logo/personagem/referência quando a IA reconhece a imagem) */
export async function docFile(d: BrandDoc): Promise<File> {
  if (!d.storage_path) throw new Error('Arquivo original não guardado.')
  const blob = await (await fetch(await signedUrl(d.storage_path, undefined, BUCKET_STUDIO))).blob()
  return new File([blob], d.name, { type: d.mime_type || blob.type || 'image/png' })
}
