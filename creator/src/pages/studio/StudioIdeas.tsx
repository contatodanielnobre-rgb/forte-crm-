import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { RotateCcw, ArrowRight, BrainCircuit, Car, Check, ClipboardCopy, ImageIcon, Lightbulb, ListChecks, MessageSquare, Plug, Plus, Save, Send, ShieldCheck, Sparkles, Swords, TriangleAlert, Trash2, Type, UserRound, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { cn, errMsg } from '@/lib/utils'
import { Skeleton, Spinner } from '@/components/ui'
import { AGENT_MODELS, agentCallUsd, fmtBrl, getRate } from '@/features/studio/catalog'
import FontPicker from '@/features/studio/FontPicker'
import { MicButton, appendDictated } from '@/features/studio/Dictation'
import { CastSection, CompetitorSection, LogoPlanner, buildLogoPlan, defaultLogoUi, logoNoteFor, logoSlideList, usePostCast, type LogoUi } from '@/features/studio/Elements'
import { KindIcon, MentionTextarea, findMentions, type MentionItem } from '@/features/studio/Mentions'
import { Popover, StudioImg } from '@/features/studio/ui'
import { DRAFT_KEY, hasProvider, ideate, saveBrand, type VisualStyle, useAssets, useBrands, useCast, useGeneration, useProviderStatus, useStudioSettings, type IdeaResult, type StudioDraft } from '@/features/studio/data'
import type { PromptSnapshot, StudioKind } from '@/features/studio/types'
import { snapshotFromGeneration } from '@/features/studio/reuse'
import { BrandAvatar } from './StudioCreate'

const KEY = 'fcc-studio-brand'
const ROLE_OPTS = ['capa', 'desenvolvimento', 'prova', 'cta']

function Toggle({ on, onChange, title, desc, icon: Icon }: { on: boolean; onChange: (v: boolean) => void; title: string; desc: string; icon: typeof Lightbulb }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={cn('flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition', on ? 'border-ink bg-ink text-white shadow-card' : 'border-zinc-200 bg-white hover:border-zinc-300')}>
      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', on ? 'bg-brand text-white' : 'bg-zinc-100 text-zinc-500')}><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><b className="block text-sm">{title}</b><span className={cn('text-xs', on ? 'text-zinc-300' : 'text-zinc-500')}>{desc}</span></span>
      <span className={cn('relative mt-1 h-6 w-11 shrink-0 rounded-full transition', on ? 'bg-emerald-500' : 'bg-zinc-300')}><span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} /></span>
    </button>
  )
}

/** Criador de prompts: ideia/roteiro → o "designer" (agente) pensa o post e entrega slides prontos para o estúdio */
export default function StudioIdeas() {
  const nav = useNavigate()
  const { data: brands } = useBrands()
  const { data: providers } = useProviderStatus()
  const { data: settings } = useStudioSettings()
  const [brandId, setBrandId] = useState<string | null>(null)
  const [kind, setKind] = useState<StudioKind>('carousel')
  const [idea, setIdea] = useState('')
  const [count, setCount] = useState('')
  const [platform, setPlatform] = useState<'instagram' | 'tiktok' | 'both'>('instagram')
  const [think, setThink] = useState(true)
  const [follow, setFollow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<IdeaResult | null>(null)
  const qc = useQueryClient()
  const [slides, setSlides] = useState<{ id: string; role: string; text: string; visual: string; typography: string; cast: string[] }[]>([])
  const [elTab, setElTab] = useState<null | 'character' | 'object' | 'competitor' | 'logo'>(null)
  const [compSel, setCompSel] = useState<string[]>([])
  const [intensity, setIntensity] = useState(50)
  const [logoUi, setLogoUi] = useState<LogoUi>(defaultLogoUi())
  const [useBrandFonts, setUseBrandFonts] = useState(true)
  const [customFonts, setCustomFonts] = useState<string[]>([])
  const [fontStyle, setFontStyle] = useState('')
  const [vstyle, setVstyle] = useState<VisualStyle>(null)
  const [feedback, setFeedback] = useState('')
  const [chat, setChat] = useState<string[]>([])
  const [showDebug, setShowDebug] = useState(false)
  const [params, setParams] = useSearchParams()
  const from = params.get('from')
  const { data: fromGen } = useGeneration(from)
  const restored = useRef<string | null>(null)
  const [reopened, setReopened] = useState<{ date: string; legacy: boolean; recovered: boolean } | null>(null)

  const stored = (() => { try { return localStorage.getItem(KEY) } catch { return null } })()
  const brand = brands?.find((b) => b.id === (brandId ?? stored)) ?? brands?.find((b) => !b.is_base) ?? brands?.find((b) => b.is_base) ?? brands?.[0]
  const openaiOk = hasProvider(providers, 'openai')
  const brandFonts = brand?.font_prefs?.list ?? []
  const fromBrand = useBrandFonts && brandFonts.length > 0
  const fontList = fromBrand ? brandFonts : customFonts
  const [postCast, setPostCast] = usePostCast(brand?.id)
  const { data: castAll } = useCast(brand?.id)
  const { data: logos } = useAssets(brand?.id, 'logo')
  const { data: competitors } = useAssets(brand?.id, 'competitor')
  const available = useMemo(() => (castAll ?? []).filter((a) => a.saved !== false || postCast.includes(a.id)), [castAll, postCast])
  const mentionItems: MentionItem[] = useMemo(() => [
    ...(logos?.length ? [{ id: 'logo', label: 'logo', kind: 'logo' as const, thumb: (logos.find((l) => l.id === brand?.logo_asset_id) ?? logos[0]).thumb_path ?? (logos.find((l) => l.id === brand?.logo_asset_id) ?? logos[0]).storage_path, hint: 'da empresa' }] : []),
    ...available.map((a) => ({ id: a.id, label: a.label ?? '', kind: a.kind as 'character' | 'object', thumb: a.thumb_path ?? a.storage_path, hint: a.saved !== false ? 'salvo' : 'deste post' })).filter((i) => i.label),
  ], [logos, available])
  const mentioned = useMemo(() => findMentions(idea, mentionItems), [idea, mentionItems])
  const castForPost = useMemo(() => available.filter((a) => postCast.includes(a.id) || mentioned.some((m) => m.id === a.id)), [available, postCast, mentioned])
  const compValid = compSel.filter((id) => competitors?.some((c) => c.id === id))
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const vocab = useMemo(() => [brand?.name ?? '', brand?.handle ?? '', brand?.segment ?? '', ...(brand?.font_prefs?.list ?? []), ...available.map((a) => a.label ?? '')].filter(Boolean), [brand, available])
  const snapshot = (): PromptSnapshot => ({
    v: 1, brandId: brand?.id ?? '', kind, idea, count, platform, think, follow, vstyle, fonts: { useBrand: useBrandFonts, custom: customFonts, style: fontStyle },
    slides: slides.map((s) => ({ role: s.role, text: s.text, visual: s.visual, typography: s.typography, cast: s.cast })),
    res: res ? { angle: res.angle, hooks: res.hooks ?? [], caption: res.caption, hashtags: res.hashtags ?? [], checks: res.checks ?? [], rationale: res.rationale, type_system: res.type_system ?? null, visual_style: res.visual_style ?? null } : null,
    postCast, compSel, intensity, logoUi: { where: logoUi.where, custom: logoUi.custom, position: logoUi.position, size: logoUi.size, assetId: logoUi.assetId }, chat,
  })
  const applySnapshot = (s: PromptSnapshot) => {
    setKind(s.kind); setIdea(s.idea); setCount(s.count); setPlatform(s.platform); setThink(s.think); setFollow(s.follow); setVstyle(s.vstyle)
    setUseBrandFonts(s.fonts.useBrand); setCustomFonts(s.fonts.custom); setFontStyle(s.fonts.style)
    setSlides(s.slides.map((x) => ({ id: crypto.randomUUID(), ...x })))
    setRes(s.res || s.slides.length ? { angle: '', hooks: [], caption: '', hashtags: [], checks: [], rationale: '', ...(s.res ?? {}), slides: [] } as IdeaResult : null)
    setPostCast(s.postCast); setCompSel(s.compSel); setIntensity(s.intensity); setLogoUi({ ...s.logoUi }); setChat(s.chat ?? []); setElTab(null); setFeedback('')
  }
  // "Reusar" no Estúdio → /studio/ideas?from=ID: volta tudo como estava (criações antigas são reconstruídas)
  useEffect(() => {
    if (!from || !fromGen || !brand || castAll === undefined || restored.current === from) return
    if (brand.id !== fromGen.brand_id) { setBrandId(fromGen.brand_id); try { localStorage.setItem(KEY, fromGen.brand_id) } catch { /* noop */ } return }
    restored.current = from
    const snap = snapshotFromGeneration(fromGen, castAll)
    applySnapshot(snap)
    setReopened({ date: new Date(fromGen.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), legacy: !!snap.legacy, recovered: !!snap.ideaRecovered })
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, fromGen, brand?.id, castAll])
  const agent = AGENT_MODELS.find((m) => m.id === settings?.text_model)
  const trained = (settings?.agent_version ?? 0) > 0

  useEffect(() => { if (!think && !follow) setThink(true) }, [think, follow])

  const mode = think && follow ? 'Pensar seguindo o seu roteiro' : follow ? 'Só organizar o seu roteiro' : 'A IA pensa o post'
  const go = async (ajuste?: string) => {
    if (!brand) return
    if (idea.trim().length < 3) return toast.info('Escreva a ideia, o tema ou o roteiro primeiro.')
    setBusy(true)
    try {
      const labelOf = (id: string) => available.find((a) => a.id === id)?.label ?? ''
      const previous = ajuste && res ? { ...res, debug: undefined, slides: slides.map((s) => ({ role: s.role, text: s.text, visual: s.visual, typography: s.typography, cast: s.cast.map(labelOf).filter(Boolean) })) } : undefined
      const nSlides = kind === 'static' ? 1 : slides.length || Number(count) || 7
      const r = await ideate({ brandId: brand.id, kind, idea, count: Number(count) || 0, think, follow, platform, previous, feedback: ajuste, fonts: { list: fontList, style: fontStyle, override: !fromBrand }, visualStyle: vstyle,
        cast: castForPost.map((a) => ({ id: a.id, kind: a.kind as 'character' | 'object', label: a.label ?? '', description: a.caption })),
        logoNote: logos?.length ? logoNoteFor(logoUi, nSlides) : null,
        competitor: compValid.length ? { asset_ids: compValid, intensity } : null })
      if (ajuste) setChat((c) => [...c, ajuste]); else setChat([])
      setFeedback('')
      setRes(r)
      const byName = new Map(castForPost.map((a) => [norm(a.label ?? ''), a.id]))
      const next = r.slides.map((s, i) => ({ id: crypto.randomUUID(), role: s.role ?? (i === 0 ? 'capa' : 'desenvolvimento'), text: s.text, visual: s.visual ?? '', typography: s.typography ?? '', cast: Array.from(new Set((s.cast ?? []).map((n) => byName.get(norm(String(n)))).filter(Boolean) as string[])) }))
      // a IA não distribuiu ninguém? Os itens do post entram na capa (o usuário pôs de propósito)
      if (castForPost.length && next.length && !next.some((s) => s.cast.length)) next[0].cast = castForPost.map((a) => a.id)
      setSlides(next)
      toast.success(`${r.slides.length} ${r.slides.length === 1 ? 'slide pensado' : 'slides pensados'}: revise e leve para o estúdio`)
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }

  const brief = useMemo(() => slides.map((s, i) => `Slide ${i + 1} (${s.role}): ${s.text}${s.visual ? `\nVisual: ${s.visual}` : ''}`).join('\n\n'), [slides])
  const toStudio = () => {
    if (!brand || !slides.length) return
    const draft: StudioDraft = { brandId: brand.id, kind, slides: slides.map((s) => ({ role: s.role, text: s.text, notes: `${s.visual}${s.typography ? `\nTipografia: ${s.typography}` : ''}`.trim(), cast: s.cast })), logo: buildLogoPlan(logoUi, kind === 'static' ? 1 : slides.length, !!logos?.length, brand.logo_asset_id ?? logos?.[0]?.id), competitor: compValid.length ? { asset_ids: compValid, intensity } : null, snapshot: snapshot(), caption: res?.caption ?? '', hashtags: res?.hashtags ?? [], style: (vstyle ?? (res?.visual_style === 'solido' || res?.visual_style === 'humanizado' ? res.visual_style : null)) as VisualStyle }
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* noop */ }
    nav('/studio')
  }
  const logoActive = logoSlideList(logoUi, kind === 'static' ? 1 : slides.length || Number(count) || 7)
  const toggleLogo = (i: number) => { const n = i + 1; const on = logoActive.includes(n); setLogoUi((u) => ({ ...u, where: 'custom', custom: (on ? logoActive.filter((x) => x !== n) : [...logoActive, n]).sort((a, b) => a - b) })) }
  const upd = (id: string, p: Partial<(typeof slides)[number]>) => setSlides((l) => l.map((s) => (s.id === id ? { ...s, ...p } : s)))

  const nSlidesUi = kind === 'static' ? 1 : slides.length || Number(count) || 7
  const elCount = { character: postCast.filter((id) => available.find((a) => a.id === id)?.kind === 'character').length, object: postCast.filter((id) => available.find((a) => a.id === id)?.kind === 'object').length, competitor: compValid.length }

  if (!brands || !settings || !brand) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* entrada */}
      <div className="space-y-4">
        {reopened && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-testid="reopened-banner">
            <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1"><b>Reaberto da criação de {reopened.date}.</b> {reopened.recovered ? 'Essa criação é anterior ao salvamento automático: recuperei a ideia original, os slides, a direção visual, as fontes por slide, o estilo, a legenda, a logo e os personagens. Só não existem registros de configurações como Pensar/Seguir regras.' : reopened.legacy ? 'Essa criação é anterior ao salvamento automático e o registro da ideia original dela já não existe: recuperei os slides, a direção visual, as fontes por slide, o estilo, a legenda, a logo e os personagens, e o campo da ideia mostra o texto dos slides.' : 'Está tudo como você deixou: ideia, estilo, fontes, personagens, objetos, concorrentes, logo e os slides.'} Mude o que quiser e clique em Levar para o estúdio.</p>
            <button type="button" className="rounded-md p-1 text-emerald-700 hover:bg-emerald-100" onClick={() => setReopened(null)} aria-label="Fechar"><X className="h-4 w-4" /></button>
          </div>
        )}
        {!openaiOk && (
          <Link to="/studio/models" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100">
            <Plug className="h-4 w-4" /><span className="flex-1"><b>Conecte a OpenAI.</b> O designer (agente) usa o modelo de texto da OpenAI para pensar o post.</span><ArrowRight className="h-4 w-4" />
          </Link>
        )}
        <div className="card space-y-4 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-white"><Lightbulb className="h-5 w-5" /></span>
            <div><h2 className="font-display text-lg font-bold tracking-tight">Criador de prompts</h2><p className="text-xs text-zinc-500">Mande a ideia; o designer devolve os slides prontos para o estúdio.</p></div>
          </div>

          <div>
            <p className="label">Para qual cliente?</p>
            <div className="flex items-center gap-2.5 rounded-2xl border border-zinc-200 bg-white p-1.5 pr-3">
              <BrandAvatar brand={brand} size={34} />
              <select value={brand.id} onChange={(e) => { setBrandId(e.target.value); try { localStorage.setItem(KEY, e.target.value) } catch { /* noop */ } }} className="h-9 min-w-0 flex-1 bg-transparent text-sm font-semibold focus:outline-none">
                {brands.map((b) => <option key={b.id} value={b.id}>{b.is_base ? 'Diretrizes gerais da agência' : b.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {([['carousel', 'Carrossel'], ['static', 'Estático']] as const).map(([id, t]) => (
              <button key={id} type="button" onClick={() => setKind(id)} className={cn('rounded-xl border px-3 py-2 text-sm font-semibold transition', kind === id ? 'border-ink bg-ink text-white' : 'border-zinc-200 hover:border-zinc-400')}>{t}</button>
            ))}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="label !mb-0">A ideia, o tema ou o roteiro</p>
              <MicButton onText={(x) => setIdea((v) => appendDictated(v, x))} vocab={vocab} title="Ditar a ideia com a voz" />
            </div>
            <MentionTextarea value={idea} onChange={setIdea} items={mentionItems} rows={7} className="input" dataTour="ideas-input"
              placeholder="Fale como numa conversa (ou clique no microfone e dite). Ex.: Quero um carrossel de 5 slides mostrando por que uma agência com IA entrega mais rápido, tom provocativo. @Dennis aparece na capa. Digite @ para citar personagens, objetos e a logo." />
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
              <span>Entende “4 slides”, tom e público. Use <b className="text-zinc-600">@</b> para citar personagens, objetos e a logo.</span>
              {mentioned.map((m) => <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 font-semibold text-white"><KindIcon kind={m.kind} className="h-3 w-3" />@{m.label}</span>)}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-3" data-tour="ideas-elements">
            <p className="label">Elementos do post <span className="font-normal text-zinc-400">(opcional)</span></p>
            <div className="grid grid-cols-4 gap-1.5">
              {([['character', 'Personagem', UserRound, elCount.character], ['object', 'Objeto', Car, elCount.object], ['competitor', 'Concorrentes', Swords, elCount.competitor], ['logo', 'Logo', ImageIcon, logoActive.length && logos?.length ? logoActive.length : 0]] as const).map(([id, name, Icon, n]) => (
                <button key={id} type="button" aria-pressed={elTab === id} data-testid={`el-${id}`} onClick={() => setElTab((v) => (v === id ? null : id))}
                  className={cn('relative flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[11px] font-semibold transition', elTab === id ? 'border-ink bg-ink text-white' : 'border-zinc-200 hover:border-zinc-400')}>
                  <Icon className="h-4 w-4" />{name}
                  {n > 0 && <span className={cn('absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold', elTab === id ? 'bg-brand text-white' : 'bg-ink text-white')}>{n}</span>}
                </button>
              ))}
            </div>
            {elTab && (
              <div className="mt-3 animate-fade-up border-t border-zinc-100 pt-3">
                {elTab === 'character' && <CastSection brand={brand} kind="character" postIds={postCast} setPostIds={setPostCast} openaiOk={openaiOk} mentioned={mentioned.map((m) => m.id)} />}
                {elTab === 'object' && <CastSection brand={brand} kind="object" postIds={postCast} setPostIds={setPostCast} openaiOk={openaiOk} mentioned={mentioned.map((m) => m.id)} />}
                {elTab === 'competitor' && <CompetitorSection brand={brand} sel={compSel} setSel={(f) => setCompSel(f)} intensity={intensity} setIntensity={setIntensity} />}
                {elTab === 'logo' && <LogoPlanner brand={brand} ui={logoUi} setUi={(f) => setLogoUi(f)} slidesCount={nSlidesUi} />}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><p className="label">Nº de slides</p><input className="input" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Automático" disabled={kind === 'static'} /></div>
            <div><p className="label">Plataforma</p>
              <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)}><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="both">Instagram + TikTok</option></select>
            </div>
          </div>

          <div data-tour="ideas-style">
            <p className="label">Estilo do post</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['solido', 'Sólido', 'Pessoa ou objeto recortado sobre fundo sólido, numa cena exagerada. Parece cartaz.'],
                ['humanizado', 'Humanizado', 'Foto real inteira de fundo e texto por cima, com troca de fontes. Parece momento real.'],
              ] as const).map(([id, t, d]) => (
                <button key={id} type="button" aria-pressed={vstyle === id} onClick={() => setVstyle((v) => (v === id ? null : id))}
                  className={cn('rounded-2xl border p-3 text-left transition', vstyle === id ? 'border-ink bg-ink text-white shadow-card' : 'border-zinc-200 bg-white hover:border-zinc-400')}>
                  <b className="block text-sm">{t}</b>
                  <span className={cn('mt-0.5 block text-[11px] leading-snug', vstyle === id ? 'text-zinc-300' : 'text-zinc-500')}>{d}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500">{vstyle ? <>O designer segue o estilo <b className="text-ink">{vstyle === 'solido' ? 'Sólido' : 'Humanizado'}</b> (clique de novo para desmarcar).</> : 'Nenhum marcado: o designer escolhe o melhor estilo para o tema e avisa qual.'}</p>
          </div>

          <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-3.5" data-tour="ideas-fonts">
            <div className="flex items-center justify-between gap-2">
              <p className="label !mb-0 flex items-center gap-1.5"><Type className="h-3.5 w-3.5" />Fontes deste post</p>
              {brandFonts.length > 0 && (
                <button type="button" role="switch" aria-checked={useBrandFonts} onClick={() => setUseBrandFonts((v) => !v)} className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                  Usar as da empresa
                  <span className={cn('relative h-5 w-9 rounded-full transition', useBrandFonts ? 'bg-emerald-500' : 'bg-zinc-300')}><span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', useBrandFonts ? 'left-[18px]' : 'left-0.5')} /></span>
                </button>
              )}
            </div>
            {fromBrand ? (
              <div>
                <div className="flex flex-wrap gap-1.5">{brandFonts.map((f) => <span key={f} className="rounded-lg bg-zinc-100 px-2.5 py-1 text-sm" style={{ fontFamily: `"${f}", system-ui, sans-serif` }}>{f}</span>)}</div>
                <p className="mt-1.5 text-[11px] text-zinc-500">Padrão de {brand?.name} (Biblioteca › Treinamento › Tipografia). Desligue para escolher outras só neste post.</p>
              </div>
            ) : (
              <div>
                <FontPicker value={customFonts} onChange={setCustomFonts} placeholder="Digite o nome (ex.: Playfair Display, Inter, Anton) e Enter" />
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                  <span>{brandFonts.length ? 'Valem só para este post.' : 'Esta empresa ainda não tem fontes padrão.'}</span>
                  {customFonts.length > 0 && brand && !brand.is_base && (
                    <button type="button" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline" onClick={async () => { try { await saveBrand(brand.id, { font_prefs: { list: customFonts, notes: brand.font_prefs?.notes ?? '' } } as never); qc.invalidateQueries({ queryKey: ['studio', 'brands'] }); setUseBrandFonts(true); toast.success('Fontes salvas como padrão da empresa') } catch (e) { toast.error(errMsg(e)) } }}><Save className="h-3 w-3" />Salvar como padrão da empresa</button>
                  )}
                </div>
              </div>
            )}
            <div>
              <input className="input h-10 text-sm" value={fontStyle} onChange={(e) => setFontStyle(e.target.value)} placeholder="Estilo (opcional): serifada nos destaques e uma grotesk bem grossa nos títulos" />
              <p className="mt-1 text-[11px] text-zinc-400">Diga o estilo e o designer escolhe fontes reais com nome. Sem nada, ele escolhe as que combinam.</p>
            </div>
          </div>

          <div className="space-y-2" data-tour="ideas-toggles">
            <Toggle on={think} onChange={setThink} icon={BrainCircuit} title="Pensar no post" desc="A IA escolhe o ângulo, cria 3 ganchos e escreve o texto de cada slide." />
            <Toggle on={follow} onChange={setFollow} icon={ShieldCheck} title="Seguir regras" desc="Respeita o roteiro e as regras que você escreveu: não inventa nem muda o sentido." />
            <p className="px-1 text-[11px] text-zinc-500">Modo atual: <b className="text-ink">{mode}</b>. Ligue os dois para a IA pensar <i>dentro</i> do seu roteiro.</p>
          </div>

          <button className="btn-brand h-11 w-full" onClick={() => go()} disabled={busy || !openaiOk}>
            {busy ? <><Spinner className="h-4 w-4 text-white" />Pensando o post…</> : <><Sparkles className="h-4 w-4" />Criar prompt dos slides</>}
          </button>
          <p className="text-center text-[11px] text-zinc-500">
            Agente: <b className="text-zinc-700">{agent?.name ?? settings.text_model}</b>{agent && <> · ≈ {fmtBrl(agentCallUsd(agent), getRate())} por ideia</>}
            {' · '}{trained ? <span className="text-emerald-700">treinado (v{settings.agent_version})</span> : <Link to="/studio/start" className="font-semibold text-brand hover:underline">ainda não treinado</Link>}
          </p>
        </div>
      </div>

      {/* resultado */}
      <div>
        {!res ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 bg-white/60 p-8 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-white shadow-card"><ListChecks className="h-6 w-6" /></span>
            <h3 className="font-display text-xl font-semibold tracking-tight">O roteiro dos slides aparece aqui</h3>
            <p className="mt-1.5 max-w-md text-sm text-zinc-500">Escreva a ideia do dia ou da semana. O designer treinado com a skill da agência e a da marca monta capa, desenvolvimento e CTA, com direção visual de cada slide.</p>
          </div>
        ) : (
          <div className="animate-fade-up space-y-4">
            {res.demo && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <p><b>Resposta SIMULADA: nenhuma IA foi chamada.</b> Isto é só o esqueleto da demonstração (sem chave real da OpenAI). Conecte a chave em Modelos e APIs para o GPT-6 Luna pensar o post de verdade.</p>
              </div>
            )}
            <div className="card p-5">
              {(res.visual_style === 'solido' || res.visual_style === 'humanizado') && <span className="chip mb-2 bg-ink text-white">Estilo {res.visual_style === 'solido' ? 'Sólido' : 'Humanizado'}{vstyle ? '' : ' (escolhido pela IA)'}</span>}
              {res.angle && <><p className="label !mb-1">Ângulo escolhido</p>
              <p className="font-display text-lg font-semibold leading-snug tracking-tight">{res.angle}</p></>}
              {res.rationale && <p className="mt-1 text-sm text-zinc-500">{res.rationale}</p>}
              {res.type_system && (res.type_system.title || res.type_system.accent || res.type_system.body) && (
                <div className="mt-4 rounded-2xl bg-zinc-50 p-3.5">
                  <p className="label flex items-center gap-1.5"><Type className="h-3.5 w-3.5" />Sistema tipográfico escolhido</p>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {([['Título', res.type_system.title], ['Destaque', res.type_system.accent], ['Corpo', res.type_system.body]] as const).filter(([, v]) => v).map(([k, v]) => (
                      <span key={k} className="rounded-xl bg-white px-3 py-1.5 ring-1 ring-zinc-200"><span className="mr-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{k}</span><b style={{ fontFamily: `"${String(v).split(',')[0].trim()}", system-ui, sans-serif` }}>{v}</b></span>
                    ))}
                  </div>
                  {res.type_system.logic && <p className="mt-2 text-xs text-zinc-500">{res.type_system.logic}</p>}
                </div>
              )}
              {res.hooks?.length > 0 && (
                <div className="mt-4">
                  <p className="label">Ganchos de capa (clique para usar no slide 1)</p>
                  <div className="flex flex-col gap-1.5">
                    {res.hooks.map((h, i) => (
                      <button key={i} type="button" onClick={() => slides[0] && upd(slides[0].id, { text: h })} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition hover:border-ink', slides[0]?.text === h ? 'border-ink bg-zinc-50' : 'border-zinc-200')}>
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[11px] font-bold">{i + 1}</span><span className="flex-1">{h}</span>{slides[0]?.text === h && <Check className="h-4 w-4 text-brand" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <ol className="space-y-3">
              {slides.map((s, i) => (
                <li key={s.id} className="card animate-fade-up p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink font-display text-sm font-bold text-white">{i + 1}</span>
                    <select value={s.role} onChange={(e) => upd(s.id, { role: e.target.value })} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold uppercase tracking-wide text-brand">{ROLE_OPTS.concat(ROLE_OPTS.includes(s.role) ? [] : [s.role]).map((r) => <option key={r} value={r}>{r}</option>)}</select>
                    <button type="button" className="ml-auto text-zinc-400 hover:text-brand" aria-label="Remover slide" onClick={() => setSlides((l) => l.filter((x) => x.id !== s.id))}><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <textarea value={s.text} onChange={(e) => upd(s.id, { text: e.target.value })} rows={2} className="input font-semibold" aria-label={`Texto do slide ${i + 1}`} />
                  <textarea value={s.visual} onChange={(e) => upd(s.id, { visual: e.target.value })} rows={2} className="input mt-2 min-h-0 text-sm text-zinc-600" placeholder="Direção visual deste slide" aria-label={`Direção visual do slide ${i + 1}`} />
                  <input value={s.typography} onChange={(e) => upd(s.id, { typography: e.target.value })} className="input mt-2 h-10 text-sm text-zinc-600" placeholder="Tipografia deste slide (fontes reais e onde usar)" aria-label={`Tipografia do slide ${i + 1}`} />
                  <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid={`slide-elements-${i + 1}`}>
                    {s.cast.map((cid) => { const a = available.find((x) => x.id === cid); if (!a) return null; return (
                      <span key={cid} className="inline-flex items-center gap-1.5 rounded-full bg-ink py-0.5 pl-0.5 pr-2 text-[11px] font-semibold text-white"><StudioImg path={a.thumb_path ?? a.storage_path} className="h-5 w-5 rounded-full" />@{a.label}
                        <button type="button" aria-label={`Tirar ${a.label} do slide ${i + 1}`} onClick={() => upd(s.id, { cast: s.cast.filter((x) => x !== cid) })} className="opacity-70 hover:opacity-100"><X className="h-3 w-3" /></button></span>) })}
                    {available.some((a) => !s.cast.includes(a.id)) && (
                      <Popover width={250} trigger={(open, toggle) => <button type="button" data-open={open} onClick={toggle} className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-zinc-300 px-2 text-[11px] font-semibold text-zinc-500 hover:border-ink hover:text-ink"><Plus className="h-3 w-3" />Personagem / objeto</button>}>
                        {(close) => <div className="max-h-56 overflow-y-auto">{available.filter((a) => !s.cast.includes(a.id)).map((a) => <button key={a.id} type="button" onClick={() => { upd(s.id, { cast: [...s.cast, a.id] }); close() }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-50"><StudioImg path={a.thumb_path ?? a.storage_path} className="h-7 w-7 rounded-md" /><span className="text-sm font-semibold">@{a.label}</span><span className="ml-auto text-[10px] uppercase text-zinc-400">{a.kind === 'character' ? 'personagem' : 'objeto'}</span></button>)}</div>}
                      </Popover>)}
                    {!!logos?.length && <button type="button" onClick={() => toggleLogo(i)} aria-pressed={logoActive.includes(i + 1)} data-testid={`logo-toggle-${i + 1}`} className={cn('ml-auto inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold transition', logoActive.includes(i + 1) ? 'border-brand bg-brand-soft text-brand' : 'border-zinc-200 text-zinc-400 hover:border-zinc-400')}><ImageIcon className="h-3 w-3" />{logoActive.includes(i + 1) ? 'Com logo' : 'Sem logo'}</button>}
                  </div>
                </li>
              ))}
            </ol>

            {(res.caption || res.hashtags?.length > 0) && (
              <div className="card p-5">
                <p className="label">Legenda sugerida</p>
                <p className="whitespace-pre-wrap text-sm text-zinc-700">{res.caption}</p>
                {res.hashtags?.length > 0 && <p className="mt-2 text-sm text-brand">{res.hashtags.join(' ')}</p>}
              </div>
            )}
            {res.checks?.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <b className="mb-1 flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" />Verifique antes de postar</b>
                <ul className="list-disc space-y-0.5 pl-5 text-[13px]">{res.checks.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </div>
            )}

            <div className="card p-4">
              <p className="label flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Peça ajustes ao designer</p>
              {chat.length > 0 && <ul className="mb-2 space-y-1">{chat.map((c, i) => <li key={i} className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-tr-sm bg-ink px-3 py-1.5 text-sm text-white">{c}</li>)}</ul>}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (feedback.trim() && !busy) void go(feedback.trim()) }}>
                <input className="input flex-1" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Ex.: deixe o gancho mais provocativo · troque o slide 3 por um exemplo real · tire o slide 5" disabled={busy} />
                <MicButton onText={(x) => setFeedback((v) => appendDictated(v, x))} vocab={vocab} className="h-11 shrink-0" title="Ditar o ajuste com a voz" />
                <button className="btn-primary h-11 px-4" disabled={busy || !feedback.trim()}>{busy ? <Spinner className="h-4 w-4 text-white" /> : <Send className="h-4 w-4" />}Enviar</button>
              </form>
            </div>

            {res.debug && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-500">
                <button type="button" className="font-semibold text-ink hover:text-brand" onClick={() => setShowDebug((v) => !v)}>{showDebug ? 'Esconder' : 'Ver'} o que o designer recebeu</button>
                <span className="ml-2">modelo <b>{res.debug.model}</b> · manual treinado: <b>{res.debug.playbook ? 'sim' : 'não'}</b> · skill base: <b>{res.debug.base_skill ? 'sim' : 'não'}</b> · skill da marca: <b>{res.debug.brand_skill ? 'sim' : 'não'}</b></span>
                {showDebug && <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed text-zinc-700">{res.debug.system}{'\n\n————— MENSAGEM —————\n'}{res.debug.user}</pre>}
              </div>
            )}

            <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-pop backdrop-blur">
              <button className="btn-outline h-10" onClick={() => { void navigator.clipboard?.writeText(brief).then(() => toast.success('Prompt copiado')) }}><ClipboardCopy className="h-4 w-4" />Copiar prompt</button>
              <button className="btn-outline h-10" onClick={() => go()} disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}Pensar de novo</button>
              <button className="btn-brand ml-auto h-10 px-5" onClick={toStudio} disabled={!slides.length} data-tour="ideas-send"><Send className="h-4 w-4" />Levar para o estúdio</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
