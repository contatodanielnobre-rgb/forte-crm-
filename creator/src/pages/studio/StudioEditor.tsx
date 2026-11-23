import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eraser, ImageUp, Sparkles } from 'lucide-react'
import { cn, fromNow } from '@/lib/utils'
import { Skeleton } from '@/components/ui'
import Editor, { type ESlide } from '@/features/studio/editor/Editor'
import { useBrands, useGeneration, useRecentGenerations, useStudioUrl } from '@/features/studio/data'
import type { Generation, StudioImage } from '@/features/studio/types'

function currentSlides(g: Generation): StudioImage[] {
  const by = new Map<number, StudioImage[]>()
  ;(g.studio_images ?? []).forEach((i) => by.set(i.slide_index, [...(by.get(i.slide_index) ?? []), i]))
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list.find((v) => v.is_current) ?? list.sort((a, b) => b.version - a.version)[0]).filter((i) => i.status === 'done' && i.storage_path)
}

function GenCard({ g, brandName }: { g: Generation; brandName: string }) {
  const first = currentSlides(g)[0]
  const url = useStudioUrl(first?.storage_path)
  const n = currentSlides(g).length
  return (
    <Link to={`/studio/editor?gen=${g.id}`} className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="flex h-44 items-center justify-center bg-zinc-100">{url ? <img src={url} alt="" className="h-full w-auto object-contain" /> : <Skeleton className="h-full w-full" />}</div>
      <div className="p-3.5"><p className="line-clamp-2 text-sm font-semibold">{g.input_text?.slice(0, 90) || 'Criação'}</p><p className="mt-1 text-xs text-zinc-500">{brandName} · {g.kind === 'carousel' ? `${n} slides` : 'estático'} · {fromNow(g.created_at)}</p></div>
    </Link>
  )
}

/** Remover IA: editor de fotos para tirar a "cara de IA" das artes (luz, cor, granulação, camadas) em um slide ou em todos de uma vez */
export default function StudioEditor() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const genId = params.get('gen')
  const { data: gen, isLoading } = useGeneration(genId)
  const { data: recent } = useRecentGenerations()
  const { data: brands } = useBrands()
  const [local, setLocal] = useState<ESlide[] | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const slides: ESlide[] | null = useMemo(() => {
    if (local) return local
    if (!gen) return null
    return currentSlides(gen).map((img) => ({ index: img.slide_index, image: img, url: null, name: `Slide ${img.slide_index}` }))
  }, [gen, local])

  if (local) return <Editor key="local" slides={local} title="Imagem do computador" brandId={null} gen={null} onBack={() => setLocal(null)} />
  if (genId) {
    if (isLoading || !gen || !slides) return <div className="space-y-4"><Skeleton className="h-12" /><Skeleton className="h-[480px]" /></div>
    if (!slides.length) return <div className="card p-8 text-center text-sm text-zinc-500">Esta criação ainda não tem slides prontos. <Link to="/studio/editor" className="font-semibold text-brand">Voltar</Link></div>
    const brand = brands?.find((b) => b.id === gen.brand_id)
    return <Editor key={gen.id} slides={slides} title={`${brand?.name ?? 'Criação'} · ${gen.input_text?.slice(0, 60) ?? ''}`} brandId={gen.brand_id} gen={gen} onBack={() => nav('/studio/editor')} />
  }

  const open = (files: FileList | null) => {
    const f = files?.[0]; if (!f) return
    setLocal([{ index: 1, image: null, url: URL.createObjectURL(f), name: f.name }])
  }
  return (
    <div>
      <div className="surface-dark mb-6 flex flex-col gap-4 overflow-hidden rounded-3xl p-6 text-white shadow-pop sm:flex-row sm:items-center">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand shadow-brand"><Eraser className="h-7 w-7" /></span>
        <div className="flex-1">
          <h2 className="font-display text-2xl font-bold tracking-tight">Remover IA</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">Editor de fotos para tirar a “cara de IA” das artes: mede saturação, contraste e falta de grão, corrige com um clique e deixa você ajustar luz, cor e textura em um slide ou em todos de uma vez. Separa cores e textos em camadas para trocar só o que você quiser.</p>
        </div>
        <button className="btn h-11 shrink-0 bg-white px-5 font-semibold text-ink hover:bg-zinc-100" onClick={() => input.current?.click()}><ImageUp className="h-4 w-4" />Abrir imagem do computador</button>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { open(e.target.files); e.target.value = '' }} />
      </div>
      <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold tracking-tight"><Sparkles className="h-4 w-4 text-brand" />Escolha uma criação para editar</h3>
      {!recent ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-60" />)}</div>
        : !recent.length ? <p className={cn('rounded-3xl border border-dashed border-zinc-300 bg-white/60 p-8 text-center text-sm text-zinc-500')}>Ainda não há criações. Gere um carrossel no Estúdio ou abra uma imagem do computador.</p>
          : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{recent.map((g) => <GenCard key={g.id} g={g} brandName={brands?.find((b) => b.id === g.brand_id)?.name ?? ''} />)}</div>}
    </div>
  )
}
