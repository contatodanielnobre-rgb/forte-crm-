import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Check, ChevronDown, Gauge, GalleryHorizontal, ImageIcon, Images, Plus, Ratio, Rows3, Send, Sparkles, Square, Trash2, WandSparkles, Zap } from 'lucide-react'
import { cn, errMsg } from '@/lib/utils'
import { Spinner } from '@/components/ui'
import { ASPECTS, FORMAT_PRESETS, PROVIDERS, ROLE_LABEL, fmtBrl, getRate, imageCost, normalizeAspect, parseAspect } from './catalog'
import { hasProvider, planSlides, studioGenerate, useAssets, useCast, useModels, useProviderStatus } from './data'
import { localEnhance } from './skill'
import { Popover, StudioImg } from './ui'
import type { Brand, SlideDraft, StudioKind, StudioModel } from './types'

export interface ComposerState {
  kind: StudioKind; aspect: string; modelId: string; quality: string; mode: 'text' | 'slides'; text: string; slides: SlideDraft[]
  preset: string | null; refMode: 'auto' | 'pick'; refIds: string[]; slideCount: number | null
}
export const newSlide = (role = 'desenvolvimento'): SlideDraft => ({ id: crypto.randomUUID(), text: '', notes: '', role, refs: [], cast: [] })
export const initialComposer = (modelId: string): ComposerState => ({
  kind: 'carousel', aspect: '4:5', modelId, quality: 'high', mode: 'text', text: '', slides: [newSlide('capa'), newSlide(), newSlide('cta')], preset: null, refMode: 'auto', refIds: [], slideCount: null,
})

const pill = 'inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-[13px] font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 data-[open=true]:border-ink data-[open=true]:text-ink'

export default function Composer({ brand, state, setState, busy, onCreate }: {
  brand: Brand; state: ComposerState; setState: (f: (s: ComposerState) => ComposerState) => void; busy: boolean; onCreate: () => void
}) {
  const { data: models } = useModels()
  const { data: providers } = useProviderStatus()
  const openaiOk = hasProvider(providers, 'openai')
  const [planning, setPlanning] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)
  const set = (p: Partial<ComposerState>) => setState((s) => ({ ...s, ...p }))
  const model = models?.find((m) => m.id === state.modelId)
  const modelReady = !!model && hasProvider(providers, model.provider)
  const preset = FORMAT_PRESETS.find((p) => p.id === state.preset)
  const nSlides = state.kind === 'static' ? 1 : state.mode === 'slides' ? Math.max(1, state.slides.filter((s) => s.text.trim()).length) : state.slideCount ?? 7
  const unit = model ? imageCost(model.api_model, state.quality) : null
  const canCreate = (state.mode === 'text' ? state.text.trim().length > 3 : state.slides.some((s) => s.text.trim())) && modelReady && !busy

  // textarea cresce com o texto
  useEffect(() => { const t = ta.current; if (t) { t.style.height = '0px'; t.style.height = Math.min(220, Math.max(72, t.scrollHeight)) + 'px' } }, [state.text, state.mode])

  const split = async () => {
    if (state.text.trim().length < 4) return toast.info('Escreva o conteúdo do carrossel primeiro.')
    setPlanning(true)
    try {
      const r = await planSlides({ brand, kind: state.kind, text: state.text, slideCount: state.slideCount, preset: state.preset, openaiConnected: openaiOk })
      setState((s) => ({ ...s, mode: 'slides', slides: r.slides.map((x) => ({ ...x, id: crypto.randomUUID() })) }))
      toast.success(`${r.slides.length} slides montados${r.ai ? ' com IA' : ''} — revise e ajuste cada um`)
    } catch (e) { toast.error(errMsg(e)) } finally { setPlanning(false) }
  }

  const enhance = async () => {
    const src = state.mode === 'text' ? state.text : state.slides.map((s) => s.text).join('\n')
    if (src.trim().length < 4) return toast.info('Escreva algo para eu melhorar.')
    setEnhancing(true)
    try {
      const out = openaiOk ? (await studioGenerate<{ text: string }>({ action: 'enhance', brand_id: brand.id, prompt: src, kind: state.kind })).text : localEnhance(src, state.kind)
      if (state.mode === 'text') set({ text: out }); else toast.info('Melhorar prompt funciona no modo "Texto completo". Alterne a aba.')
      if (!openaiOk) toast.info('Melhoria básica aplicada. Conecte a OpenAI para a IA reescrever com a identidade da marca.')
    } catch (e) { toast.error(errMsg(e)) } finally { setEnhancing(false) }
  }

  const applyPreset = (id: string | null) => {
    const p = FORMAT_PRESETS.find((x) => x.id === id)
    if (!p) return set({ preset: null })
    set({ preset: p.id, kind: p.kind, aspect: p.aspect, slideCount: p.kind === 'carousel' ? p.slides : null, slides: p.kind === 'carousel' ? p.roles.map((r) => newSlide(r)) : [newSlide('estático')] })
  }

  return (
    <div className="card relative border-zinc-200 bg-white/95 p-3 shadow-pop backdrop-blur sm:p-4" data-tour="studio-composer">
      {/* abas de modo */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-zinc-100 p-1 text-[13px] font-medium">
          {([['text', 'Texto completo', Rows3], ['slides', state.kind === 'static' ? 'Conteúdo' : 'Slide a slide', GalleryHorizontal]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => set({ mode: id })} className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition', state.mode === id ? 'bg-white text-ink shadow-sm' : 'text-zinc-500 hover:text-ink')}><Icon className="h-3.5 w-3.5" />{label}</button>
          ))}
        </div>
        <p className="hidden text-xs text-zinc-500 md:block">{state.mode === 'text' ? 'Cole o conteúdo inteiro: a IA divide em slides por você.' : 'Escreva o texto de cada slide para ter controle total.'}</p>
        <div className="ml-auto flex gap-1.5">
          {state.mode === 'text' && state.kind === 'carousel' && <button type="button" className="btn-outline btn-sm" onClick={split} disabled={planning}>{planning ? <Spinner className="h-3.5 w-3.5" /> : <Rows3 className="h-3.5 w-3.5" />}Dividir em slides</button>}
          <button type="button" className="btn-outline btn-sm" onClick={enhance} disabled={enhancing} title="Reescreve o briefing com mais clareza e estrutura">{enhancing ? <Spinner className="h-3.5 w-3.5" /> : <WandSparkles className="h-3.5 w-3.5 text-brand" />}Melhorar prompt</button>
        </div>
      </div>

      {state.mode === 'text' ? (
        <textarea ref={ta} value={state.text} onChange={(e) => set({ text: e.target.value })} rows={2}
          placeholder={state.kind === 'carousel' ? 'Sobre o que é o carrossel? Cole o roteiro inteiro, ex.: "5 erros que fazem você perder alunos na academia…" — eu divido em slides.' : 'Descreva o criativo: assunto, oferta, texto que vai na arte…'}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canCreate) onCreate() }}
          className="w-full resize-none rounded-2xl border border-zinc-200 bg-zinc-50/60 px-4 py-3 text-[15px] leading-relaxed outline-none transition placeholder:text-zinc-400 focus:border-ink focus:bg-white focus:ring-4 focus:ring-ink/[.06]" />
      ) : (
        <SlideList brand={brand} state={state} set={set} />
      )}

      {/* barra de controles */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-zinc-200 bg-white p-0.5 text-[13px] font-medium">
          {([['static', 'Estático', Square], ['carousel', 'Carrossel', GalleryHorizontal]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => set({ kind: id, preset: preset?.kind === id ? state.preset : null, mode: id === 'static' && state.mode === 'text' ? 'text' : state.mode })}
              className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition', state.kind === id ? 'bg-ink text-white' : 'text-zinc-500 hover:text-ink')}><Icon className="h-3.5 w-3.5" />{label}</button>
          ))}
        </div>

        <Popover up width={460} trigger={(open, toggle) => <button type="button" data-open={open} className={pill} onClick={toggle}><Sparkles className="h-3.5 w-3.5 text-brand" />{preset?.name ?? 'Formato'}<ChevronDown className="h-3.5 w-3.5 opacity-50" /></button>}>
          {(close) => (
            <div>
              <p className="label px-2 pt-1">Formatos prontos</p>
              <div className="grid max-h-[320px] gap-1.5 overflow-y-auto p-1 sm:grid-cols-2">
                {FORMAT_PRESETS.map((p) => (
                  <button key={p.id} type="button" onClick={() => { applyPreset(p.id); close() }} className={cn('rounded-xl border p-3 text-left transition', state.preset === p.id ? 'border-ink bg-zinc-50' : 'border-zinc-200 hover:border-zinc-400')}>
                    <span className="flex items-center justify-between"><b className="text-sm">{p.name}</b><span className="text-[10px] font-bold uppercase tracking-wide text-brand">{p.kind === 'static' ? 'Estático' : `${p.slides} slides`}</span></span>
                    <span className="mt-0.5 block text-xs text-zinc-500">{p.desc}</span>
                  </button>
                ))}
              </div>
              {state.preset && <button type="button" className="btn-ghost btn-sm mt-1 w-full" onClick={() => { applyPreset(null); close() }}>Sem formato (livre)</button>}
            </div>
          )}
        </Popover>

        <AspectPicker value={state.aspect} onChange={(a) => set({ aspect: a })} />

        {state.kind === 'carousel' && state.mode === 'text' && (
          <Popover up width={200} trigger={(open, toggle) => <button type="button" data-open={open} className={pill} onClick={toggle}><Rows3 className="h-3.5 w-3.5" />{state.slideCount ? `${state.slideCount} slides` : 'Slides: auto'}<ChevronDown className="h-3.5 w-3.5 opacity-50" /></button>}>
            {(close) => (
              <div className="grid grid-cols-4 gap-1 p-1">
                <button type="button" className={cn('col-span-4 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-50', !state.slideCount && 'font-semibold')} onClick={() => { set({ slideCount: null }); close() }}>Automático (IA decide)</button>
                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <button key={n} type="button" className={cn('h-9 rounded-lg text-sm font-medium', state.slideCount === n ? 'bg-ink text-white' : 'hover:bg-zinc-100')} onClick={() => { set({ slideCount: n }); close() }}>{n}</button>)}
              </div>
            )}
          </Popover>
        )}

        <RefPicker brandId={brand.id} mode={state.refMode} ids={state.refIds} onChange={(mode, ids) => set({ refMode: mode, refIds: ids })} />

        <ModelPicker models={models ?? []} providers={providers?.map((p) => p.provider) ?? []} value={state.modelId} onChange={(id) => set({ modelId: id })} />

        <Popover up width={220} trigger={(open, toggle) => <button type="button" data-open={open} className={pill} onClick={toggle} title="Qualidade (custo)"><Gauge className="h-3.5 w-3.5" />{{ high: 'Alta', medium: 'Média', low: 'Rápida' }[state.quality]}<ChevronDown className="h-3.5 w-3.5 opacity-50" /></button>}>
          {(close) => (
            <div className="p-1">
              {[['high', 'Alta qualidade', 'Melhor texto e detalhes'], ['medium', 'Média', 'Equilíbrio custo/qualidade'], ['low', 'Rápida', 'Rascunhos baratos']].map(([id, t, d]) => (
                <button key={id} type="button" onClick={() => { set({ quality: id }); close() }} className={cn('flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-zinc-50', state.quality === id && 'bg-zinc-50')}><Check className={cn('mt-0.5 h-4 w-4', state.quality === id ? 'text-brand' : 'opacity-0')} /><span><b className="block text-sm">{t}</b><span className="text-xs text-zinc-500">{d}</span></span></button>
              ))}
            </div>
          )}
        </Popover>

        {unit && <span className="ml-auto hidden text-right text-[11px] leading-tight text-zinc-500 sm:block" title="Estimativa: saída + prompt + referências. O custo real aparece em cada criação.">≈ <b className="text-ink">{fmtBrl(unit.total * nSlides, getRate())}</b><br />{nSlides} {nSlides === 1 ? 'imagem' : 'imagens'} · sem erros</span>}
        <button type="button" onClick={onCreate} disabled={!canCreate} data-tour="studio-create"
          className={cn('btn-brand h-10 px-5 text-sm disabled:from-zinc-300 disabled:to-zinc-300 disabled:shadow-none', !unit && 'ml-auto')} title={!modelReady ? 'Conecte a API deste modelo em Modelos e APIs' : undefined}>
          {busy ? <Spinner className="h-4 w-4 text-white" /> : <Send className="h-4 w-4" />}Criar {state.kind === 'carousel' ? 'carrossel' : 'criativo'}
        </button>
      </div>

      {!modelReady && model && (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Zap className="h-3.5 w-3.5" />API não disponível para <b>{model.name}</b> ({PROVIDERS[model.provider].name}). <Link to="/studio/models" className="font-semibold underline">Plugar a chave de API</Link> ou escolha outro modelo conectado.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------
function SlideList({ brand, state, set }: { brand: Brand; state: ComposerState; set: (p: Partial<ComposerState>) => void }) {
  const upd = (id: string, p: Partial<SlideDraft>) => set({ slides: state.slides.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  const move = (i: number, d: number) => { const n = [...state.slides]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; set({ slides: n }) }
  const list = state.kind === 'static' ? state.slides.slice(0, 1) : state.slides
  const { data: cast } = useCast(brand.id)
  return (
    <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
      {list.map((s, i) => (
        <div key={s.id} className="group animate-fade-up rounded-2xl border border-zinc-200 bg-zinc-50/60 px-3 py-2 transition focus-within:border-ink focus-within:bg-white">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-2 text-[11px] font-bold text-white">{state.kind === 'static' ? '•' : i + 1}</span>
            <select value={s.role} onChange={(e) => upd(s.id, { role: e.target.value })} className="rounded-lg border-0 bg-transparent py-0.5 pr-6 text-xs font-semibold uppercase tracking-wide text-zinc-500 focus:ring-0">
              {Object.entries(ROLE_LABEL).filter(([k]) => state.kind === 'static' ? k === 'estático' : k !== 'estático').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              <SlideRefs brandId={brand.id} ids={s.refs} onChange={(refs) => upd(s.id, { refs })} />
              {state.kind === 'carousel' && <>
                <button type="button" className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-ink" onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-ink" onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-brand" onClick={() => set({ slides: state.slides.filter((x) => x.id !== s.id) })} aria-label="Remover slide"><Trash2 className="h-3.5 w-3.5" /></button>
              </>}
            </div>
          </div>
          <textarea value={s.text} onChange={(e) => upd(s.id, { text: e.target.value })} rows={1} style={{ fieldSizing: "content" } as React.CSSProperties} placeholder={i === 0 && state.kind === 'carousel' ? 'Texto da capa (o gancho)…' : 'Texto que vai escrito neste slide…'} className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-zinc-400" />
          <input value={s.notes} onChange={(e) => upd(s.id, { notes: e.target.value })} placeholder="Estilo / direção visual deste slide (opcional)" className="mt-1 w-full border-t border-zinc-200/70 bg-transparent pt-1.5 text-xs text-zinc-600 outline-none placeholder:text-zinc-400" />
          {!!s.cast?.length && (
            <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid={`composer-cast-${i + 1}`}>
              {s.cast.map((cid) => { const a = cast?.find((x) => x.id === cid); return a ? (
                <span key={cid} className="inline-flex items-center gap-1.5 rounded-full bg-ink py-0.5 pl-0.5 pr-2 text-[11px] font-semibold text-white"><StudioImg path={a.thumb_path ?? a.storage_path} className="h-5 w-5 rounded-full" />@{a.label}
                  <button type="button" aria-label={`Tirar ${a.label}`} onClick={() => upd(s.id, { cast: (s.cast ?? []).filter((x) => x !== cid) })} className="opacity-70 hover:opacity-100">×</button></span>) : null })}
            </div>
          )}
        </div>
      ))}
      {state.kind === 'carousel' && state.slides.length < 12 && (
        <button type="button" onClick={() => set({ slides: [...state.slides.slice(0, -1), newSlide(), ...state.slides.slice(-1)] })} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 py-2.5 text-sm font-medium text-zinc-500 transition hover:border-ink hover:text-ink"><Plus className="h-4 w-4" />Adicionar slide</button>
      )}
    </div>
  )
}

function SlideRefs({ brandId, ids, onChange }: { brandId: string; ids: string[]; onChange: (v: string[]) => void }) {
  return (
    <Popover up align="right" width={340} trigger={(open, toggle) => (
      <button type="button" data-open={open} onClick={toggle} className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition hover:bg-zinc-200', ids.length ? 'text-brand' : 'text-zinc-500')}><Images className="h-3.5 w-3.5" />{ids.length ? `${ids.length} ref.` : 'Estilo'}</button>
    )}>
      {() => <RefGrid brandId={brandId} ids={ids} onChange={onChange} hint="Referências só para este slide. Vazio = usa as da geração." />}
    </Popover>
  )
}

function RefGrid({ brandId, ids, onChange, hint }: { brandId: string; ids: string[]; onChange: (v: string[]) => void; hint?: string }) {
  const { data: refs } = useAssets(brandId, 'reference')
  if (!refs?.length) return <p className="p-3 text-sm text-zinc-500">Esta marca ainda não tem referências. Envie na Biblioteca para a IA seguir o estilo.</p>
  return (
    <div>
      {hint && <p className="px-2 pb-2 pt-1 text-xs text-zinc-500">{hint}</p>}
      <div className="grid max-h-[260px] grid-cols-4 gap-1.5 overflow-y-auto p-1">
        {refs.map((a) => {
          const on = ids.includes(a.id)
          return (
            <button key={a.id} type="button" onClick={() => onChange(on ? ids.filter((x) => x !== a.id) : ids.length >= 8 ? ids : [...ids, a.id])} className={cn('relative overflow-hidden rounded-lg ring-2 transition', on ? 'ring-brand' : 'ring-transparent hover:ring-zinc-300')}>
              <StudioImg path={a.thumb_path ?? a.storage_path} className="aspect-square" />
              {on && <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-white"><Check className="h-3 w-3" /></span>}
            </button>
          )
        })}
      </div>
      <p className="px-2 py-1.5 text-[11px] text-zinc-400">{ids.length}/8 selecionadas</p>
    </div>
  )
}

function RefPicker({ brandId, mode, ids, onChange }: { brandId: string; mode: 'auto' | 'pick'; ids: string[]; onChange: (m: 'auto' | 'pick', ids: string[]) => void }) {
  return (
    <Popover up width={360} trigger={(open, toggle) => <button type="button" data-open={open} className={pill} onClick={toggle}><ImageIcon className="h-3.5 w-3.5" />{mode === 'auto' ? 'Referências: auto' : `${ids.length} referência(s)`}<ChevronDown className="h-3.5 w-3.5 opacity-50" /></button>}>
      {() => (
        <div>
          <div className="grid grid-cols-2 gap-1 p-1">
            {([['auto', 'Automático', 'Logo + favoritas da marca'], ['pick', 'Escolher', 'Imagens específicas']] as const).map(([id, t, d]) => (
              <button key={id} type="button" onClick={() => onChange(id, id === 'auto' ? [] : ids)} className={cn('rounded-xl border p-2.5 text-left transition', mode === id ? 'border-ink bg-zinc-50' : 'border-zinc-200 hover:border-zinc-400')}><b className="block text-sm">{t}</b><span className="text-xs text-zinc-500">{d}</span></button>
            ))}
          </div>
          {mode === 'pick' && <RefGrid brandId={brandId} ids={ids} onChange={(v) => onChange('pick', v)} />}
        </div>
      )}
    </Popover>
  )
}

function AspectPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState('')
  const known = ASPECTS.find((a) => a.id === value)
  return (
    <Popover up width={340} trigger={(open, toggle) => <button type="button" data-open={open} className={pill} onClick={toggle}><Ratio className="h-3.5 w-3.5" />{value}<ChevronDown className="h-3.5 w-3.5 opacity-50" /></button>}>
      {(close) => (
        <div>
          <p className="label px-2 pt-1">Aspecto</p>
          <div className="grid grid-cols-4 gap-1.5 p-1">
            {ASPECTS.map((a) => {
              const k = 30 / Math.max(a.w, a.h)
              return (
                <button key={a.id} type="button" onClick={() => { onChange(a.id); close() }} title={a.hint} className={cn('flex flex-col items-center gap-1.5 rounded-xl border p-2 transition', value === a.id ? 'border-ink bg-zinc-50' : 'border-zinc-200 hover:border-zinc-400')}>
                  <span className="flex h-8 items-center"><span className={cn('rounded-[3px] border-2', value === a.id ? 'border-brand' : 'border-zinc-400')} style={{ width: a.w * k, height: a.h * k }} /></span>
                  <span className="text-[11px] font-semibold">{a.label}</span>
                </button>
              )
            })}
          </div>
          <form className="mt-1 flex gap-1.5 border-t border-zinc-100 p-1.5 pt-2.5" onSubmit={(e) => { e.preventDefault(); const n = normalizeAspect(text); if (!n || !parseAspect(n)) return toast.error('Use o formato 4:5 ou 1080x1350'); onChange(n); setText(''); close() }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={known ? 'Digitar: 1080x1350, 5:7…' : value} className="input h-9" />
            <button className="btn-primary h-9">Usar</button>
          </form>
          {known && <p className="px-2 pb-1.5 text-[11px] text-zinc-500">{known.hint}</p>}
        </div>
      )}
    </Popover>
  )
}

function ModelPicker({ models, providers, value, onChange }: { models: StudioModel[]; providers: string[]; value: string; onChange: (id: string) => void }) {
  const current = models.find((m) => m.id === value)
  const ok = !!current && providers.includes(current.provider)
  const groups = useMemo(() => {
    const m = new Map<string, StudioModel[]>()
    models.filter((x) => x.enabled).forEach((x) => m.set(x.provider, [...(m.get(x.provider) ?? []), x]))
    return [...m.entries()]
  }, [models])
  return (
    <Popover up width={380} trigger={(open, toggle) => (
      <button type="button" data-open={open} className={pill} onClick={toggle}>
        <span className={cn('h-2 w-2 rounded-full', ok ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,.2)]' : 'bg-zinc-300')} />{current?.name ?? 'Modelo'}<ChevronDown className="h-3.5 w-3.5 opacity-50" />
      </button>
    )}>
      {(close) => (
        <div className="max-h-[360px] overflow-y-auto">
          {groups.map(([prov, list]) => {
            const connected = providers.includes(prov)
            return (
              <div key={prov} className="pb-1">
                <p className="flex items-center justify-between px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">{PROVIDERS[prov as keyof typeof PROVIDERS]?.name ?? prov}<span className={cn('rounded-full px-2 py-0.5 text-[10px] normal-case tracking-normal', connected ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500')}>{connected ? 'API disponível' : 'API não disponível'}</span></p>
                {list.map((m) => (
                  <button key={m.id} type="button" onClick={() => { onChange(m.id); close() }} className={cn('flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-zinc-50', value === m.id && 'bg-zinc-50')}>
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', connected ? 'bg-emerald-500' : 'bg-zinc-300')} />
                    <span className="min-w-0"><b className="block text-sm">{m.name}</b><span className="block truncate text-xs text-zinc-500">{m.description}</span></span>
                    {value === m.id && <Check className="ml-auto mt-1 h-4 w-4 shrink-0 text-brand" />}
                  </button>
                ))}
              </div>
            )
          })}
          <Link to="/studio/models" className="mt-1 block rounded-lg bg-zinc-50 px-3 py-2 text-center text-xs font-semibold text-ink hover:bg-zinc-100">Gerenciar modelos e chaves de API →</Link>
        </div>
      )}
    </Popover>
  )
}
