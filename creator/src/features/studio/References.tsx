import { useCallback, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, CheckSquare, Star, Trash2, UploadCloud, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, errMsg, fmtBytes } from '@/lib/utils'
import { ConfirmDialog, Modal, Skeleton } from '@/components/ui'
import { deleteAssets, tagAssets, uploadAssets, useAssets, useStudioSettings, useUsage, type UploadState } from './data'
import { StudioImg } from './ui'
import type { StudioAsset } from './types'

/** Biblioteca de referências de uma marca: envio em lote (até 100 imagens / 1 GB), favoritas pesam mais no treino */
export default function References({ brandId, compact }: { brandId: string; compact?: boolean }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { data: refs, isLoading } = useAssets(brandId, 'reference')
  const { data: settings } = useStudioSettings()
  const { data: usage } = useUsage()
  const [uploads, setUploads] = useState<UploadState[]>([])
  const [drag, setDrag] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [view, setView] = useState<StudioAsset | null>(null)
  const [confirm, setConfirm] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const last = useRef<number | null>(null)

  const used = usage?.get(brandId) ?? { refs: 0, bytes: 0 }
  const maxRefs = settings?.max_refs ?? 100, maxBytes = settings?.max_bytes ?? 1073741824
  const busy = uploads.some((u) => u.status === 'queued' || u.status === 'uploading')

  const refresh = () => { qc.invalidateQueries({ queryKey: ['studio', 'assets'] }); qc.invalidateQueries({ queryKey: ['studio', 'usage'] }); qc.invalidateQueries({ queryKey: ['studio', 'brands'] }); qc.invalidateQueries({ queryKey: ['studio', 'brand', brandId] }) }

  const start = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return toast.error('Selecione arquivos de imagem.')
    const created = await uploadAssets(brandId, imgs, 'reference', profile!.id, { bytesLeft: maxBytes - used.bytes, refsLeft: maxRefs - used.refs }, setUploads)
    refresh()
    if (created.length) toast.success(`${created.length} imagem(ns) enviada(s)`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, profile, maxBytes, maxRefs, used.bytes, used.refs])

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); start(Array.from(e.dataTransfer.files)) }
  const toggleFav = async (a: StudioAsset) => { await supabase.from('studio_assets').update({ favorite: !a.favorite }).eq('id', a.id); refresh() }
  const remove = async (list: StudioAsset[]) => {
    try { await deleteAssets(list); setSel(new Set()); setView(null); refresh(); toast.success('Removido') } catch (e) { toast.error(errMsg(e)) }
    setConfirm(false)
  }
  // clique alterna; Shift+clique seleciona o intervalo desde o último clicado
  const pick = (i: number, id: string, e: MouseEvent) => {
    const list = refs ?? []
    const from = last.current // lido antes: o updater do setState roda depois (e pode rodar 2x no StrictMode)
    setSel((s) => {
      const n = new Set(s)
      if (e.shiftKey && from !== null) { const [a, b] = [Math.min(from, i), Math.max(from, i)]; for (let k = a; k <= b; k++) n.add(list[k].id) }
      else if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
    last.current = i
  }
  const allSelected = !!refs?.length && sel.size === refs.length
  const tagSelected = async (tag: 'solido' | 'humanizado', mode: 'add' | 'remove' = 'add') => {
    try { await tagAssets((refs ?? []).filter((a) => sel.has(a.id)), tag, mode); toast.success(mode === 'add' ? `${sel.size} marcada(s) como ${tag === 'solido' ? 'Sólido' : 'Humanizado'}` : 'Estilo removido'); setSel(new Set()); refresh() } catch (e) { toast.error(errMsg(e)) }
  }
  const favSelected = async () => {
    const { error } = await supabase.from('studio_assets').update({ favorite: true }).in('id', [...sel])
    if (error) return toast.error(errMsg(error))
    toast.success('Marcadas como favoritas'); setSel(new Set()); refresh()
  }
  const pct = Math.min(100, (used.bytes / maxBytes) * 100)
  const pctRefs = Math.min(100, (used.refs / maxRefs) * 100)

  return (
    <div onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true) } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false) }} onDrop={onDrop}>
      {/* medidor */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Meter label="Imagens de referência" value={`${used.refs} / ${maxRefs}`} pct={pctRefs} hint={used.refs < 10 ? 'Ideal: 50 a 100 imagens para um treino forte' : used.refs < 50 ? 'Bom começo — mais referências deixam o estilo mais fiel' : 'Ótima biblioteca'} />
        <Meter label="Armazenamento da pasta" value={`${fmtBytes(used.bytes)} / ${fmtBytes(maxBytes)}`} pct={pct} />
      </div>

      <button type="button" onClick={() => input.current?.click()} disabled={busy}
        className={cn('group flex w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 text-center transition', compact ? 'py-8' : 'py-12', drag ? 'border-brand bg-brand-soft/60' : 'border-zinc-300 bg-white/60 hover:border-ink hover:bg-white')}>
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-white shadow-card transition group-hover:scale-105"><UploadCloud className="h-6 w-6" /></span>
        <p className="font-display text-base font-semibold tracking-tight">Arraste as imagens aqui ou clique para escolher</p>
        <p className="mt-1 max-w-md text-sm text-zinc-500">Anúncios, carrosséis e criativos que representam o estilo desta marca. JPG, PNG, WEBP · até 25 MB cada · envie até {maxRefs} de uma vez.</p>
      </button>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) start(Array.from(e.target.files)); e.target.value = '' }} />

      {uploads.length > 0 && <UploadList items={uploads} onClear={() => setUploads([])} />}

      {sel.size > 0 && (
        <div className="sticky top-2 z-20 mt-4 flex animate-scale-in items-center gap-3 rounded-2xl bg-ink px-4 py-2.5 text-sm text-white shadow-pop">
          <CheckSquare className="h-4 w-4 text-brand" /><b>{sel.size}</b> selecionada(s)
          <span className="hidden text-xs text-zinc-400 md:inline">(só para excluir ou favoritar; as outras continuam valendo)</span>
          <button className="btn-ghost ml-auto h-8 text-white hover:bg-white/10 hover:text-white" onClick={() => setSel(allSelected ? new Set() : new Set((refs ?? []).map((a) => a.id)))}>{allSelected ? 'Desmarcar todas' : `Selecionar todas (${refs?.length ?? 0})`}</button>
          <button className="btn-ghost h-8 text-white hover:bg-white/10 hover:text-white" onClick={() => setSel(new Set())}>Limpar</button>
          <button className="btn-ghost h-8 text-white hover:bg-white/10 hover:text-white" onClick={favSelected}><Star className="h-4 w-4" />Favoritar</button>
          <button className="btn h-8 bg-white/15 text-white hover:bg-white/25" onClick={() => tagSelected('solido')} title="Marca as selecionadas como referência do estilo Sólido">Sólido</button>
          <button className="btn h-8 bg-white/15 text-white hover:bg-white/25" onClick={() => tagSelected('humanizado')} title="Marca as selecionadas como referência do estilo Humanizado">Humanizado</button>
          <button className="btn h-8 bg-brand text-white hover:bg-brand-dark" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Excluir</button>
        </div>
      )}

      {!!refs?.length && (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-[240px] flex-1 text-sm text-zinc-500"><b className="text-ink">{refs.length} {refs.length === 1 ? 'imagem enviada' : 'imagens enviadas'}.</b> Todas já contam para o treino: <b>não precisa selecionar</b>. Marcar serve só para excluir ou favoritar várias de uma vez (Shift+clique marca um intervalo).</p>
          <button className="btn-outline btn-sm" onClick={() => setSel(allSelected ? new Set() : new Set(refs.map((a) => a.id)))}><CheckSquare className="h-3.5 w-3.5" />{allSelected ? 'Desmarcar todas' : 'Selecionar todas'}</button>
        </div>
      )}
      <div className="mt-3">
        {isLoading ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="aspect-square" />)}</div>
          : !refs?.length ? <p className="py-6 text-center text-sm text-zinc-500">Nenhuma referência ainda. Quanto mais exemplos reais da marca, mais fiel fica a IA.</p> : (
            <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {refs.map((a, i) => (
                <div key={a.id} className={cn('group relative overflow-hidden rounded-2xl bg-white shadow-card ring-2 transition', sel.has(a.id) ? 'ring-brand' : 'ring-transparent hover:ring-zinc-300')}>
                  <button type="button" className="block w-full" onClick={() => setView(a)}><StudioImg path={a.thumb_path ?? a.storage_path} className="aspect-square" /></button>
                  <button type="button" aria-label="Selecionar" onClick={(e) => pick(i, a.id, e)}
                    className={cn('absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border-2 transition', sel.has(a.id) ? 'border-brand bg-brand text-white' : 'border-white/80 bg-black/20 text-transparent opacity-0 backdrop-blur group-hover:opacity-100')}><Check className="h-3.5 w-3.5" /></button>
                  {(a.tags ?? []).filter((t) => t === 'solido' || t === 'humanizado').map((t) => <span key={t} className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">{t === 'solido' ? 'Sólido' : 'Humanizado'}</span>)}
                  <button type="button" aria-label="Favoritar" onClick={() => toggleFav(a)}
                    className={cn('absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur transition', a.favorite ? 'bg-amber-400 text-white opacity-100' : 'bg-black/30 text-white opacity-0 group-hover:opacity-100')}><Star className={cn('h-3.5 w-3.5', a.favorite && 'fill-current')} /></button>
                </div>
              ))}
            </div>
          )}
      </div>

      {view && (
        <Modal open onClose={() => setView(null)} size="lg" title={view.name} subtitle={`${view.width ?? '?'}×${view.height ?? '?'} · ${fmtBytes(view.size_bytes)}`}
          footer={<>
            <button className="btn-danger mr-auto" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Excluir</button>
            <button className="btn-outline" onClick={() => { toggleFav(view); setView({ ...view, favorite: !view.favorite }) }}><Star className={cn('h-4 w-4', view.favorite && 'fill-amber-400 text-amber-400')} />{view.favorite ? 'Favorita' : 'Marcar como favorita'}</button>
          </>}>
          <StudioImg path={view.storage_path} fit="contain" className="mx-auto max-h-[62vh] min-h-[280px] rounded-2xl" />
          <p className="mt-3 text-xs text-zinc-500">Favoritas entram primeiro nas referências enviadas à IA a cada geração.</p>
        </Modal>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => remove(view && sel.size === 0 ? [view] : (refs ?? []).filter((a) => sel.has(a.id)))} danger title="Excluir imagens"
        message="As imagens serão apagadas da biblioteca. Para a IA esquecer o estilo delas, treine a marca novamente depois." confirmLabel="Excluir" />
    </div>
  )
}

function Meter({ label, value, pct, hint }: { label: string; value: string; pct: number; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between"><span className="label !mb-0">{label}</span><b className="tabular text-sm">{value}</b></div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-zinc-100"><div className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-700', pct > 90 ? 'from-brand to-brand-light' : 'from-ink to-zinc-600')} style={{ width: `${Math.max(2, pct)}%` }} /></div>
      {hint && <p className="mt-2 text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}

function UploadList({ items, onClear }: { items: UploadState[]; onClear: () => void }) {
  const done = items.filter((i) => i.status === 'done').length
  const errs = items.filter((i) => i.status === 'error')
  const active = items.some((i) => i.status === 'queued' || i.status === 'uploading')
  const overall = Math.round(items.reduce((s, i) => s + i.progress, 0) / items.length)
  return (
    <div className="card mt-4 animate-fade-up p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">{active ? `Enviando ${done}/${items.length}…` : `Envio finalizado · ${done} ok${errs.length ? ` · ${errs.length} com erro` : ''}`}</p>
        {!active && <button className="btn-ghost btn-sm" onClick={onClear}><X className="h-3.5 w-3.5" />Fechar</button>}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-all duration-300" style={{ width: `${overall}%` }} /></div>
      {errs.length > 0 && (
        <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto text-xs text-brand">{errs.map((e) => <li key={e.id} className="truncate"><b>{e.name}</b>: {e.error}</li>)}</ul>
      )}
    </div>
  )
}

