import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, FileAudio, FileImage, FileText, FileVideo, Globe, Plug, Sparkles, Trash2, TriangleAlert, UploadCloud } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn, errMsg } from '@/lib/utils'
import { Spinner } from '@/components/ui'
import { importBrandDocs, saveBrand, updateAsset, uploadAssets, useAssets, useBrandDocs, useStudioSettings, useUsage, type BrandImportResult } from './data'
import { DOC_ACCEPT, addBrandDoc, deleteBrandDoc, docFile } from './docs'
import { SectionCard } from './ui'
import type { Brand, BrandDoc } from './types'

const ICON: Record<BrandDoc['kind'], typeof FileText> = { document: FileText, text: FileText, image: FileImage, audio: FileAudio, video: FileVideo }
const KIND_NAME: Record<BrandDoc['kind'], string> = { document: 'Documento', text: 'Texto', image: 'Imagem', audio: 'Áudio', video: 'Vídeo' }
const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/**
 * Preenchimento automático: o usuário sobe PDF/formulário, imagens (logos, fotos), reuniões em áudio/vídeo e a IA (GPT-6 Luna)
 * lê tudo e coloca cada informação no campo certo do treinamento. O usuário revisa e salva.
 */
export default function DocImport({ brand, name, website, segment, handle, openaiOk, vocab, onApply }: {
  brand: Brand; name: string; website: string; segment: string; handle: string; openaiOk: boolean; vocab: string[]
  onApply: (r: BrandImportResult, replace: boolean) => string[]
}) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { data: docs } = useBrandDocs(brand.id)
  const { data: settings } = useStudioSettings()
  const { data: usage } = useUsage()
  const { data: logos } = useAssets(brand.id, 'logo')
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [work, setWork] = useState<{ name: string; msg: string }[]>([])
  const [off, setOff] = useState<string[]>([]) // documentos desmarcados
  const [busy, setBusy] = useState(false)
  const [replace, setReplace] = useState(false)
  const [readSite, setReadSite] = useState(true)
  const [saveImages, setSaveImages] = useState(true)
  const [res, setRes] = useState<{ r: BrandImportResult; filled: string[]; created: string[] } | null>(null)
  const list = docs ?? []
  const usable = list.filter((d) => !off.includes(d.id) && (d.storage_path || d.extracted_text))
  const hasSite = website.trim().length > 3

  const refresh = () => { qc.invalidateQueries({ queryKey: ['studio', 'docs', brand.id] }); qc.invalidateQueries({ queryKey: ['studio', 'assets'] }); qc.invalidateQueries({ queryKey: ['studio', 'brand', brand.id] }); qc.invalidateQueries({ queryKey: ['studio', 'brands'] }) }

  const add = async (files: File[]) => {
    if (!files.length || !profile) return
    for (const f of files) {
      const key = `${f.name}-${f.size}`
      const set = (msg: string) => setWork((w) => (w.some((x) => x.name === key) ? w.map((x) => (x.name === key ? { ...x, msg } : x)) : [...w, { name: key, msg }]))
      set('Enviando…')
      try { await addBrandDoc(brand.id, profile.id, f, vocab, set); refresh() }
      catch (e) { toast.error(`${f.name}: ${errMsg(e)}`) }
      finally { setWork((w) => w.filter((x) => x.name !== key)) }
    }
  }

  /** Imagens que a IA reconheceu viram logos (várias), personagens, objetos e referências da empresa */
  const materialize = async (r: BrandImportResult): Promise<string[]> => {
    const made: string[] = []
    if (!profile || !r.images?.length) return made
    const limits = { bytesLeft: (settings?.max_bytes ?? 1073741824) - (usage?.get(brand.id)?.bytes ?? 0), refsLeft: 999 }
    let firstLogo = !brand.logo_asset_id && !(logos?.length)
    let n = { character: 0, object: 0 }
    for (const im of r.images) {
      if (im.kind === 'ignore') continue
      const doc = list.find((d) => d.id === im.doc_id)
      if (!doc?.storage_path) continue
      try {
        const file = await docFile(doc)
        if (im.kind === 'logo') {
          const [a] = await uploadAssets(brand.id, [file], 'logo', profile.id, limits, () => null, 1, { labels: [im.variant || im.label || 'principal'], saved: true })
          if (a && firstLogo) { await saveBrand(brand.id, { logo_asset_id: a.id } as Partial<Brand>); firstLogo = false }
          if (a) made.push(`logo ${im.variant || ''}`.trim())
        } else if (im.kind === 'character' || im.kind === 'object') {
          n[im.kind]++
          const label = (im.label || `${im.kind === 'character' ? 'Personagem' : 'Objeto'} ${n[im.kind]}`).replace(/[@\n]/g, '')
          const [a] = await uploadAssets(brand.id, [file], im.kind, profile.id, limits, () => null, 1, { labels: [label], saved: true, maxSide: 1600 })
          if (a) { if (im.description) await updateAsset(a.id, { caption: im.description }); made.push(`${im.kind === 'character' ? 'personagem' : 'objeto'} @${label}`) }
        } else if (im.kind === 'reference') {
          const [a] = await uploadAssets(brand.id, [file], 'reference', profile.id, limits, () => null, 1)
          if (a) made.push('referência de estilo')
        }
      } catch (e) { toast.error(`${doc.name}: ${errMsg(e)}`) }
    }
    return made
  }

  const go = async () => {
    if (!usable.length) return toast.info('Envie ao menos um documento.')
    setBusy(true)
    try {
      const r = await importBrandDocs({ brandId: brand.id, docIds: usable.map((d) => d.id), name, website, segment, handle, readSite: readSite && hasSite })
      const filled = onApply(r, replace)
      const created = saveImages ? await materialize(r) : []
      setRes({ r, filled, created }); refresh()
      toast.success('Campos preenchidos: revise e clique em Salvar e treinar')
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }

  const remove = async (d: BrandDoc) => { try { await deleteBrandDoc(d); refresh() } catch (e) { toast.error(errMsg(e)) } }

  return (
    <SectionCard icon={<UploadCloud className="h-4 w-4" />} title="Preencher com documentos (IA)" hint="Suba o formulário/briefing da empresa (PDF), logos, fotos e até reuniões gravadas. O GPT-6 Luna lê tudo e coloca cada informação no campo certo abaixo.">
      <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); void add(Array.from(e.dataTransfer.files)) }}
        className={cn('flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition', drag ? 'border-ink bg-zinc-50' : 'border-zinc-200')}>
        <UploadCloud className="h-7 w-7 text-zinc-400" />
        <p className="text-sm font-semibold">Arraste arquivos aqui ou <button type="button" className="text-brand underline" onClick={() => input.current?.click()} data-testid="doc-pick">escolha no computador</button></p>
        <p className="max-w-md text-[11px] text-zinc-500">PDF, Word (.docx), PowerPoint, texto, imagens (várias logos, fotos do dono, produtos), áudio e vídeo de reuniões. Pode enviar vários de uma vez.</p>
        <input ref={input} type="file" multiple accept={DOC_ACCEPT} hidden data-testid="doc-input" onChange={(e) => { void add(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      </div>

      {(work.length > 0 || list.length > 0) && (
        <ul className="mt-4 space-y-1.5" data-testid="doc-list">
          {work.map((w) => <li key={w.name} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2 text-sm"><Spinner className="h-4 w-4" /><span className="min-w-0 flex-1 truncate font-medium">{w.name.replace(/-\d+$/, '')}</span><span className="text-xs text-zinc-500">{w.msg}</span></li>)}
          {list.map((d) => {
            const Icon = ICON[d.kind]
            const ok = d.storage_path || d.extracted_text
            return (
              <li key={d.id} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2 text-sm', d.status === 'error' ? 'border-red-200 bg-red-50/50' : 'border-zinc-200 bg-white')}>
                <input type="checkbox" className="accent-[#E10600]" checked={!off.includes(d.id) && !!ok} disabled={!ok} onChange={(e) => setOff((o) => (e.target.checked ? o.filter((x) => x !== d.id) : [...o, d.id]))} aria-label={`Usar ${d.name}`} />
                <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className="min-w-0 flex-1"><b className="block truncate font-semibold">{d.name}</b><span className="block truncate text-[11px] text-zinc-500">{KIND_NAME[d.kind]} · {fmtSize(d.size_bytes)}{!d.storage_path && d.extracted_text ? ' · só a transcrição foi guardada' : ''}{d.extracted_text && (d.kind === 'audio' || d.kind === 'video') ? ` · ${d.extracted_text.split(/\s+/).length} palavras transcritas` : ''}{d.summary ? ` · ${d.summary}` : ''}</span>{d.error && <span className="block text-[11px] text-red-700">{d.error}</span>}</span>
                <span className={cn('chip', d.status === 'analyzed' ? 'bg-emerald-50 text-emerald-700' : d.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-600')}>{d.status === 'analyzed' ? 'Lido pela IA' : d.status === 'error' ? 'Erro' : 'Pronto'}</span>
                <button type="button" onClick={() => void remove(d)} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-brand" aria-label={`Excluir ${d.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className={cn('flex items-center gap-2', !hasSite && 'opacity-50')}><input type="checkbox" className="accent-[#E10600]" checked={readSite && hasSite} disabled={!hasSite} onChange={(e) => setReadSite(e.target.checked)} /><Globe className="h-4 w-4 text-zinc-400" />Também ler o site</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#E10600]" checked={saveImages} onChange={(e) => setSaveImages(e.target.checked)} />Guardar as imagens reconhecidas (logos, pessoas, produtos)</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#E10600]" checked={replace} onChange={(e) => setReplace(e.target.checked)} />Substituir o que já está preenchido</label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-brand h-11 px-5" onClick={go} disabled={busy || !usable.length || !openaiOk || work.length > 0} data-testid="doc-import-go">
          {busy ? <><Spinner className="h-4 w-4 text-white" />A IA está lendo os documentos…</> : <><Sparkles className="h-4 w-4" />Preencher os campos com IA{usable.length ? ` (${usable.length})` : ''}</>}
        </button>
        {!openaiOk && <Link to="/studio/models" className="flex items-center gap-2 text-xs font-semibold text-amber-800 hover:underline"><Plug className="h-4 w-4" />Conecte a OpenAI para usar</Link>}
      </div>

      {res && (
        <div className="mt-5 animate-fade-up space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-sm" data-testid="doc-import-result">
          {res.r.summary && <p className="text-zinc-700">{res.r.summary}</p>}
          {res.r.name && res.r.name.trim().toLowerCase() !== name.trim().toLowerCase() && !res.filled.includes('nome') && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Os documentos chamam a empresa de <b>{res.r.name}</b>. Mantive o nome atual (“{name}”); para trocar, edite em Identidade ou rode de novo marcando “Substituir o que já está preenchido”.</p>
          )}
          {res.filled.length > 0 && <p className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-800"><Check className="h-4 w-4" /><b>Preenchido no formulário:</b>{res.filled.map((f) => <span key={f} className="rounded-md bg-white px-1.5 py-0.5 ring-1 ring-emerald-200">{f}</span>)}</p>}
          {res.created.length > 0 && <p className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-800"><Check className="h-4 w-4" /><b>Imagens guardadas:</b>{res.created.map((f, i) => <span key={i} className="rounded-md bg-white px-1.5 py-0.5 ring-1 ring-emerald-200">{f}</span>)}</p>}
          {!!res.r.sources?.length && <ul className="list-disc space-y-0.5 pl-5 text-xs text-zinc-600">{res.r.sources.map((s, i) => <li key={i}>{s}</li>)}</ul>}
          {!!res.r.missing?.length && (
            <div className="rounded-xl bg-white p-3 text-xs text-zinc-600 ring-1 ring-zinc-200">
              <b className="flex items-center gap-1.5 text-ink"><TriangleAlert className="h-3.5 w-3.5 text-amber-600" />Não encontrei nos documentos (complete à mão):</b>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{res.r.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}
          <p className="text-xs text-zinc-500">Revise os campos abaixo, ajuste o que quiser e clique em <b>Salvar e treinar</b>.</p>
        </div>
      )}
    </SectionCard>
  )
}
