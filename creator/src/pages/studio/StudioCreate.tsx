import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRight, BrainCircuit, Check, ChevronDown, Plug, Rocket, Sparkles } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn, errMsg } from '@/lib/utils'
import { Skeleton } from '@/components/ui'
import { FORMAT_PRESETS } from '@/features/studio/catalog'
import Composer, { initialComposer, newSlide, type ComposerState } from '@/features/studio/Composer'
import { DRAFT_KEY, createGeneration, hasProvider, useBrands, useLogos, useModels, useProviderStatus, useStudioSettings, useUsage } from '@/features/studio/data'
import GenerationFeed from '@/features/studio/Feed'
import { Popover, StudioImg } from '@/features/studio/ui'
import type { Brand, CompetitorPlan, Generation, LogoPlan, PromptSnapshot } from '@/features/studio/types'
import { ImageIcon, RotateCcw, Swords, X } from 'lucide-react'
import type { StudioDraft } from '@/features/studio/data'

const KEY = 'fcc-studio-brand'
const POS_TEXT: Record<string, string> = { tl: 'canto superior esquerdo', tc: 'topo, no centro', tr: 'canto superior direito', ml: 'meio, à esquerda', mc: 'centro', mr: 'meio, à direita', bl: 'canto inferior esquerdo', bc: 'base, no centro', br: 'canto inferior direito' }

export default function StudioCreate() {
  const { profile, isAdmin } = useAuth()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const { data: brands, isLoading } = useBrands()
  const { data: models } = useModels()
  const { data: providers } = useProviderStatus()
  const { data: settings } = useStudioSettings()
  const { data: usage } = useUsage()
  const { data: logos } = useLogos()
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<ComposerState | null>(null)
  const [meta, setMeta] = useState<{ caption: string; hashtags: string[]; style?: 'solido' | 'humanizado' | null; logo?: LogoPlan | null; competitor?: CompetitorPlan | null; snapshot?: PromptSnapshot | null } | null>(null)
  const [reusing, setReusing] = useState<Generation | null>(null) // criação escolhida em "Reusar": oferece voltar ao Criador de prompts
  const nav = useNavigate() // legenda/hashtags vindas do criador de prompts

  const stored = (() => { try { return localStorage.getItem(KEY) } catch { return null } })()
  const brand = brands?.find((b) => b.id === (params.get('brand') ?? stored)) ?? brands?.find((b) => !b.is_base) ?? brands?.find((b) => b.is_base) ?? brands?.[0]
  const pickBrand = (b: Brand) => { try { localStorage.setItem(KEY, b.id) } catch { /* noop */ } setParams({ brand: b.id }, { replace: true }) }

  // modelo inicial: padrão do sistema se conectado; senão o primeiro conectado; senão o padrão
  useEffect(() => {
    if (state || !models || !providers || !settings) return
    const ready = models.filter((m) => m.enabled && hasProvider(providers, m.provider))
    const pick = ready.find((m) => m.id === settings.default_model) ?? ready[0] ?? models.find((m) => m.id === settings.default_model) ?? models[0]
    setState({ ...initialComposer(pick?.id ?? settings.default_model), quality: settings.default_quality ?? 'high' })
  }, [models, providers, settings, state])

  // roteiro entregue pelo Criador de prompts (sessionStorage) → vira slides no composer
  useEffect(() => {
    if (!state || !brands) return
    let raw: string | null = null
    try { raw = sessionStorage.getItem(DRAFT_KEY) } catch { /* noop */ }
    if (!raw) return
    let d: StudioDraft
    try { d = JSON.parse(raw) as StudioDraft } catch { try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* noop */ } return }
    const b = brands.find((x) => x.id === d.brandId)
    if (b && b.id !== brand?.id) { pickBrand(b); return }
    try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* noop */ }
    setMeta({ caption: d.caption, hashtags: d.hashtags, style: d.style ?? null, logo: d.logo ?? null, competitor: d.competitor ?? null, snapshot: d.snapshot ?? null })
    setState((s) => s && ({ ...s, kind: d.kind, mode: 'slides', slideCount: null, slides: d.slides.map((x) => ({ ...newSlide(x.role), text: x.text, notes: x.notes, cast: x.cast ?? [] })) }))
    toast.success('Roteiro do Criador de prompts carregado: revise os slides e clique em Criar')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, brands, brand?.id])

  const create = async () => {
    if (!brand || !state || !profile) return
    setBusy(true)
    try {
      await createGeneration({
        brand, userId: profile.id, kind: state.kind, aspect: state.aspect, modelId: state.modelId, quality: state.quality, mode: state.mode, text: state.text, slides: state.slides,
        preset: state.preset, refAssetIds: state.refMode === 'pick' ? state.refIds : [], slideCount: state.slideCount, openaiConnected: hasProvider(providers, 'openai'), caption: meta?.caption, hashtags: meta?.hashtags, style: meta?.style ?? null, logo: meta?.logo ?? null, competitor: meta?.competitor ?? null,
        // o que foi mudado no composer entra no snapshot (mesmo nº de slides: o texto final vale)
        snapshot: meta?.snapshot ? { ...meta.snapshot, slides: meta.snapshot.slides.map((s, i, all) => (state.mode === 'slides' && state.slides.length === all.length && state.slides[i]?.text.trim() ? { ...s, text: state.slides[i].text } : s)) } : null,
      }, qc)
      setMeta(null); setReusing(null)
      toast.success('Criação iniciada — as imagens aparecem aqui assim que ficarem prontas')
      // volta o composer ao modo compacto para o resultado aparecer logo acima
      setState((s) => s && ({ ...s, text: '', mode: 'text', slides: s.kind === 'static' ? [newSlide('estático')] : [newSlide('capa'), newSlide(), newSlide('cta')] }))
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }

  const reuse = (g: Generation) => { setReusing(g); setTimeout(() => document.querySelector('[data-testid="reuse-banner"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); setState((s) => s && ({ ...s, kind: g.kind, aspect: g.aspect, mode: 'text', text: g.input_text ?? '', preset: g.format_preset })) }
  const preset = (id: string) => {
    const p = FORMAT_PRESETS.find((x) => x.id === id)!
    setState((s) => s && ({ ...s, preset: p.id, kind: p.kind, aspect: p.aspect, slideCount: p.kind === 'carousel' ? p.slides : null, slides: p.kind === 'carousel' ? p.roles.map((r) => newSlide(r)) : [newSlide('estático')] }))
  }

  const noApi = providers && providers.length === 0
  const info = useMemo(() => (brand ? { refs: usage?.get(brand.id)?.refs ?? 0, logo: logos?.get(brand.id) } : null), [brand, usage, logos])

  if (isLoading || !brand || !state) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-72" /><Skeleton className="h-40" /></div>

  return (
    <div>
      {/* barra da marca */}
      <div className="mb-5 flex flex-wrap items-center gap-3" data-tour="studio-brand">
        <Popover width={360} trigger={(open, toggle) => (
          <button type="button" onClick={toggle} data-open={open} className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white py-2 pl-2 pr-3 shadow-card transition hover:border-zinc-300 data-[open=true]:border-ink">
            <BrandAvatar brand={brand} logoPath={info?.logo?.thumb_path ?? info?.logo?.storage_path} size={40} />
            <span className="text-left"><span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">Marca ativa</span><b className="block max-w-[200px] truncate text-sm">{brand.name}</b></span>
            <ChevronDown className="h-4 w-4 text-zinc-400" />
          </button>
        )}>
          {(close) => (
            <div className="max-h-[380px] overflow-y-auto">
              {(brands ?? []).map((b) => (
                <button key={b.id} type="button" onClick={() => { pickBrand(b); close() }} className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-zinc-50', b.id === brand.id && 'bg-zinc-50')}>
                  <BrandAvatar brand={b} logoPath={logos?.get(b.id)?.thumb_path ?? logos?.get(b.id)?.storage_path} size={36} />
                  <span className="min-w-0 flex-1"><b className="block truncate text-sm">{b.name}</b><span className="text-xs text-zinc-500">{b.is_base ? 'Diretrizes gerais da agência' : b.skill_version ? `Treinada · v${b.skill_version}` : 'Ainda não treinada'}</span></span>
                  {b.id === brand.id && <Check className="h-4 w-4 text-brand" />}
                </button>
              ))}
              <Link to="/studio/library" className="mt-1 block rounded-lg bg-zinc-50 px-3 py-2 text-center text-xs font-semibold hover:bg-zinc-100">Abrir biblioteca →</Link>
            </div>
          )}
        </Popover>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={cn('chip', brand.skill_version ? (brand.dirty ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700') : 'bg-zinc-100 text-zinc-600')}><BrainCircuit className="h-3 w-3" />{brand.skill_version ? `Skill v${brand.skill_version}${brand.dirty ? ' · alterações a treinar' : ''}` : 'Sem treinamento'}</span>
          <span className="chip bg-zinc-100 text-zinc-600">{info?.refs ?? 0} referências</span>
          {brand.colors.length > 0 && <span className="flex items-center gap-0.5 rounded-full bg-white px-2 py-1 ring-1 ring-zinc-200">{brand.colors.slice(0, 6).map((c, i) => <span key={i} className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: c.hex }} />)}</span>}
          <Link to={`/studio/library/${brand.id}`} className="font-semibold text-brand hover:underline">{brand.skill_version ? 'Ajustar treinamento' : 'Treinar agora'}</Link>
        </div>
      </div>

      {isAdmin && settings && !settings.onboarding_done && (
        <Link to="/studio/start" className="surface-dark group mb-5 flex items-center gap-4 overflow-hidden rounded-3xl p-5 text-white shadow-pop">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand shadow-brand"><Rocket className="h-6 w-6" /></span>
          <span className="flex-1"><b className="font-display text-lg">Inicie o programa de criação de conteúdo</b><span className="mt-0.5 block text-sm text-zinc-400">Passo a passo: suba 50–100 referências, treine a skill base e crie a primeira pasta de cliente.</span></span>
          <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
        </Link>
      )}
      {noApi && (
        <Link to="/studio/models" className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100">
          <Plug className="h-4 w-4" /><span className="flex-1"><b>Nenhuma API conectada ainda.</b> Cole a chave do GPT Image 2.5 (ou outro modelo) para liberar a geração.</span><ArrowRight className="h-4 w-4" />
        </Link>
      )}

      <GenerationFeed brand={brand} onReuse={reuse} onEmpty={
        <div className="animate-fade-up rounded-3xl border border-dashed border-zinc-300 bg-white/60 p-8 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-white shadow-card"><Sparkles className="h-6 w-6" /></span>
          <h3 className="font-display text-xl font-semibold tracking-tight">Crie o primeiro conteúdo de {brand.name}</h3>
          <p className="mx-auto mt-1.5 max-w-lg text-sm text-zinc-500">Escreva o assunto lá embaixo ou comece por um formato pronto. A IA segue a skill e as referências desta marca.</p>
          <div className="mx-auto mt-6 grid max-w-4xl gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {FORMAT_PRESETS.slice(0, 5).map((p) => (
              <button key={p.id} type="button" onClick={() => preset(p.id)} className="rounded-2xl border border-zinc-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-ink hover:shadow-card-hover">
                <span className="text-[10px] font-bold uppercase tracking-wide text-brand">{p.kind === 'static' ? 'Estático' : `${p.slides} slides`}</span>
                <b className="mt-0.5 block text-sm">{p.name}</b><span className="text-xs text-zinc-500">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>
      } />

      {reusing && (
        <div className="mt-4 flex scroll-mt-24 flex-wrap items-center gap-3 rounded-2xl border-2 border-brand bg-white p-3.5 shadow-pop" data-testid="reuse-banner">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white"><RotateCcw className="h-4 w-4" /></span>
          <p className="min-w-0 flex-1 text-sm"><b>Reusando a criação de {new Date(reusing.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}.</b> <span className="text-zinc-500">O composer só traz o texto. Para voltar com tudo (estilo, personagens, objetos, logo, fontes, legenda) e poder mudar, abra no Criador de prompts.</span></p>
          <button type="button" className="btn-brand h-10 px-4" onClick={() => nav(`/studio/ideas?from=${reusing.id}`)} data-testid="reuse-to-ideas"><RotateCcw className="h-4 w-4" />Levar novamente ao Criador de prompts</button>
          <button type="button" className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100" onClick={() => setReusing(null)} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
      )}
      {meta?.style && (
        <div className="mt-4 flex items-center gap-2 text-xs"><span className="chip bg-ink text-white">Estilo {meta.style === 'solido' ? 'Sólido' : 'Humanizado'}</span><span className="text-zinc-500">vindo do Criador de prompts: as referências desse estilo vão primeiro ao gerador.</span><button type="button" className="font-semibold text-brand hover:underline" onClick={() => setMeta((m) => (m ? { ...m, style: null } : m))}>remover</button></div>
      )}
      {(meta?.logo?.slides.length || meta?.competitor?.asset_ids.length) ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs" data-testid="studio-elements-strip">
          {meta?.logo?.slides.length ? <span className="chip bg-zinc-100 text-zinc-700"><ImageIcon className="h-3 w-3" />Logo no slide {meta.logo.slides.join(', ')} · {POS_TEXT[meta.logo.position]}</span> : null}
          {meta?.competitor?.asset_ids.length ? <span className="chip bg-zinc-100 text-zinc-700"><Swords className="h-3 w-3" />{meta.competitor.asset_ids.length} post(s) de concorrentes · semelhança {meta.competitor.intensity}%</span> : null}
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline" onClick={() => setMeta((m) => (m ? { ...m, logo: null, competitor: null } : m))}><X className="h-3 w-3" />remover</button>
        </div>
      ) : null}
      <div className="z-30 mt-6 md:sticky md:bottom-3">
        <Composer brand={brand} state={state} setState={(f) => setState((s) => (s ? f(s) : s))} busy={busy} onCreate={create} />
      </div>
    </div>
  )
}

export function BrandAvatar({ brand, logoPath, size = 40 }: { brand: Brand; logoPath?: string | null; size?: number }) {
  const c = brand.colors[0]?.hex ?? '#0B0B0C'
  if (logoPath) return <div style={{ width: size, height: size }} className="shrink-0"><StudioImg path={logoPath} fit="contain" className="h-full w-full rounded-xl bg-white p-1 ring-1 ring-black/5" /></div>
  return <span style={{ width: size, height: size, background: brand.is_base ? '#0B0B0C' : c }} className="flex shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold text-white">{brand.is_base ? <Sparkles className="h-4 w-4" /> : brand.name.slice(0, 2).toUpperCase()}</span>
}
