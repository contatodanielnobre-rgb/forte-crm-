import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Star, AtSign, BrainCircuit, Check, FileText, Hash, LayoutGrid, Layers, Palette, Save, Sparkles, Type, UploadCloud, ShieldCheck, MessageSquareQuote, Trash2, Globe } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn, errMsg, fromNow } from '@/lib/utils'
import { Field, Input, Modal, Spinner, Textarea } from '@/components/ui'
import type { BrandBrief } from './types'
import { FONT_SUGGESTIONS, STYLE_CHIPS, TONE_CHIPS } from './catalog'
import ColorPalette from './ColorPalette'
import BrandAssistant from './BrandAssistant'
import FontPicker from './FontPicker'
import { deleteAssets, hasProvider, saveBrand, trainBrand, updateAsset, uploadAssets, useAssets, useProviderStatus, useStudioSettings, useUsage } from './data'
import DocImport from './DocImport'
import BrandFontReader from '@/features/fonts/BrandFontReader'
import { compileSkill, completeness } from './skill'
import { ChipSelect, RuleList, SectionCard, StudioImg, TagInput } from './ui'
import type { BrandImportResult } from './data'
import type { Brand, BrandSpec, StudioAsset } from './types'

type Draft = Pick<Brand, 'name' | 'handle' | 'segment' | 'website' | 'colors' | 'fonts' | 'hashtags' | 'cta' | 'voice' | 'tone_tags' | 'style_tags' | 'style_notes' | 'rules_do' | 'rules_dont' | 'carousel_spec' | 'static_spec' | 'font_prefs' | 'brand_brief'>
const pick = (b: Brand): Draft => ({
  name: b.name, handle: b.handle, segment: b.segment, website: b.website, colors: b.colors, fonts: b.fonts, hashtags: b.hashtags, cta: b.cta, voice: b.voice,
  tone_tags: b.tone_tags, style_tags: b.style_tags, style_notes: b.style_notes, rules_do: b.rules_do, rules_dont: b.rules_dont, carousel_spec: b.carousel_spec, static_spec: b.static_spec,
  font_prefs: { list: b.font_prefs?.list ?? [], notes: b.font_prefs?.notes ?? '' }, brand_brief: b.brand_brief ?? {},
})

export default function BrandForm({ brand, onTrained }: { brand: Brand; onTrained?: () => void }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [d, setD] = useState<Draft>(() => pick(brand))
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [doc, setDoc] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const base = useRef(JSON.stringify(pick(brand)))
  const { data: logos } = useAssets(brand.id, 'logo')
  const { data: refs } = useAssets(brand.id, 'reference')
  const { data: providers } = useProviderStatus()
  const { data: settings } = useStudioSettings()
  const { data: usage } = useUsage()
  const logo = logos?.find((l) => l.id === brand.logo_asset_id) ?? logos?.[0] ?? null
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const spec = (k: 'carousel_spec' | 'static_spec', patch: Partial<BrandSpec>) => set(k, { ...d[k], ...patch })

  // quando a marca é recarregada do servidor (ex.: depois de salvar), o rascunho acompanha
  // Quando a marca muda no servidor (ex.: logo enviada), o rascunho só é substituído se NÃO houver edições locais; assim nada digitado se perde.
  const lastBrand = useRef(brand.id)
  useEffect(() => {
    const server = pick(brand); const sj = JSON.stringify(server)
    const otherBrand = lastBrand.current !== brand.id; lastBrand.current = brand.id
    const localEdits = !otherBrand && JSON.stringify(d) !== base.current
    base.current = sj
    if (!localEdits) setD(server)
  }, [brand.id, brand.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const changed = JSON.stringify(d) !== base.current
  const refCount = usage?.get(brand.id)?.refs ?? refs?.length ?? 0
  const comp = useMemo(() => completeness({ ...brand, ...d }, refCount, !!logo), [brand, d, refCount, logo])
  const openaiOk = hasProvider(providers, 'openai')

  const applyAI = (r: BrandImportResult, replace: boolean): string[] => {
    const filled: string[] = []
    const txt = (key: string, cur: string | null | undefined, next: string | undefined) => { const v = next?.trim(); if (!v) return cur ?? null; if (replace || !cur?.trim()) { filled.push(key); return v } return cur }
    const arr = (key: string, cur: string[], next: string[] | undefined) => { if (!next?.length) return cur; if (replace || !cur.length) { filled.push(key); return next } const merged = Array.from(new Set([...cur, ...next])); if (merged.length > cur.length) filled.push(key); return merged }
    const spec = (key: string, cur: BrandSpec, next: BrandSpec | undefined) => { if (!next) return cur; const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as BrandSpec; const keep = Object.fromEntries(Object.entries(cur).filter(([, v]) => v)) as BrandSpec; const out = replace ? { ...cur, ...clean } : { ...clean, ...keep }; if (JSON.stringify(out) !== JSON.stringify(cur)) filled.push(key); return out }
    const x = d // calculado já (síncrono) para devolver a lista do que foi preenchido
    const bk = (k: keyof BrandBrief, label: string) => txt(label, x.brand_brief?.[k], r.brief?.[k]) ?? ''
    const colors = (() => {
      if (!r.colors?.length) return x.colors
      if (replace || !x.colors.length) { filled.push('cores'); return r.colors }
      const have = new Set(x.colors.map((c) => c.hex.toUpperCase())); const add = r.colors.filter((c) => !have.has(c.hex.toUpperCase()))
      if (add.length) { filled.push('cores'); return [...x.colors, ...add] }
      return x.colors
    })()
    setD({
      ...x,
      name: txt('nome', x.name, r.name) ?? x.name, handle: txt('Instagram', x.handle, r.handle), website: txt('site', x.website, r.website),
      brand_brief: { about: bk('about', 'o que faz'), products: bk('products', 'produtos'), goal: bk('goal', 'objetivo'), audience: bk('audience', 'público'), differentiators: bk('differentiators', 'diferenciais') },
      segment: txt('segmento', x.segment, r.segment), voice: txt('voz', x.voice, r.voice), style_notes: txt('estilo visual', x.style_notes, r.style_notes), cta: txt('CTA', x.cta, r.cta),
      tone_tags: arr('tom', x.tone_tags, r.tone_tags), style_tags: arr('estilo', x.style_tags, r.style_tags), rules_do: arr('regras (sempre)', x.rules_do, r.rules_do), rules_dont: arr('regras (nunca)', x.rules_dont, r.rules_dont),
      hashtags: arr('hashtags', x.hashtags, r.hashtags), carousel_spec: spec('padrão de carrossel', x.carousel_spec, r.carousel_spec), static_spec: spec('padrão de estático', x.static_spec, r.static_spec),
      font_prefs: { list: arr('fontes', x.font_prefs.list, r.font_prefs?.list), notes: txt('uso das fontes', x.font_prefs.notes, r.font_prefs?.notes) ?? '' },
      colors,
    })
    return filled
  }

  const refresh = () => { qc.invalidateQueries({ queryKey: ['studio', 'brand', brand.id] }); qc.invalidateQueries({ queryKey: ['studio', 'brands'] }) }

  const save = async (train: boolean) => {
    if (d.name.trim().length < 2) return toast.error('Informe o nome da marca')
    setSaving(true)
    try {
      const patch = { ...d, name: d.name.trim(), handle: d.handle?.trim() || null, segment: d.segment?.trim() || null, website: d.website?.trim() || null, cta: d.cta?.trim() || null, voice: d.voice?.trim() || null, style_notes: d.style_notes?.trim() || null }
      await saveBrand(brand.id, patch)
      { const saved = pick({ ...brand, ...patch } as Brand); base.current = JSON.stringify(saved); setD(saved) } // o rascunho passa a ser o que foi gravado (valores já "limpos")
      if (train) {
        const r = await trainBrand({ ...brand, ...patch }, { analyze: openaiOk && refCount > 0, onStep: setStep })
        toast.success(`Treinamento concluído — skill v${r.version}`, { description: r.analyzed ? 'Referências analisadas com IA de visão.' : r.analysisError ? `Análise visual indisponível: ${r.analysisError}` : openaiOk ? undefined : 'Conecte a OpenAI em Modelos e APIs para a IA analisar também as imagens.' })
        onTrained?.()
      } else toast.success('Alterações salvas')
      refresh()
    } catch (e) { toast.error(errMsg(e)) } finally { setSaving(false); setStep(null) }
  }

  const onLogos = async (files: File[]) => {
    if (!files.length) return
    setLogoBusy(true)
    try {
      const created = await uploadAssets(brand.id, files, 'logo', profile!.id, { bytesLeft: (settings?.max_bytes ?? 1073741824) - (usage?.get(brand.id)?.bytes ?? 0), refsLeft: 999 }, () => null, 2)
      if (!created.length) throw new Error('Não foi possível enviar a logo (use PNG/JPG/WEBP/SVG de até 25 MB).')
      if (!brand.logo_asset_id || !(logos ?? []).some((l) => l.id === brand.logo_asset_id)) await saveBrand(brand.id, { logo_asset_id: created[0].id } as Partial<Brand>)
      qc.invalidateQueries({ queryKey: ['studio', 'assets'] }); refresh()
      toast.success(created.length === 1 ? 'Logo adicionada' : `${created.length} logos adicionadas`)
    } catch (e) { toast.error(errMsg(e)) } finally { setLogoBusy(false) }
  }
  const removeLogo = async (l: StudioAsset) => {
    try {
      if (brand.logo_asset_id === l.id) { const other = (logos ?? []).find((x) => x.id !== l.id); await saveBrand(brand.id, { logo_asset_id: other?.id ?? null } as Partial<Brand>) }
      await deleteAssets([l]); qc.invalidateQueries({ queryKey: ['studio', 'assets'] }); refresh()
    } catch (e) { toast.error(errMsg(e)) }
  }
  const setMainLogo = async (l: StudioAsset) => { try { await saveBrand(brand.id, { logo_asset_id: l.id } as Partial<Brand>); refresh(); toast.success('Logo principal atualizada') } catch (e) { toast.error(errMsg(e)) } }
  const renameLogo = async (l: StudioAsset, label: string) => { if ((l.label ?? '') === label.trim()) return; try { await updateAsset(l.id, { label: label.trim() || null }); qc.invalidateQueries({ queryKey: ['studio', 'assets'] }) } catch (e) { toast.error(errMsg(e)) } }

  const status = brand.training_status === 'training' ? { t: 'Treinando…', c: 'bg-amber-50 text-amber-700' }
    : brand.skill_version === 0 ? { t: 'Ainda não treinada', c: 'bg-zinc-100 text-zinc-600' }
      : brand.dirty || changed ? { t: 'Alterações a treinar', c: 'bg-amber-50 text-amber-700' } : { t: `Treinada · v${brand.skill_version}`, c: 'bg-emerald-50 text-emerald-700' }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-5">
        <SectionCard icon={<AtSign className="h-4 w-4" />} title="Identidade" hint="Quem é a marca e onde ela aparece.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da empresa *"><Input value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Club Fitness" /></Field>
            <Field label="Instagram"><Input value={d.handle ?? ''} onChange={(e) => set('handle', e.target.value)} placeholder="@clubfitness" /></Field>
            <Field label="Segmento"><Input value={d.segment ?? ''} onChange={(e) => set('segment', e.target.value)} placeholder="Academia, clínica, joalheria…" /></Field>
            <Field label="Site"><div className="relative"><Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input className="pl-9" value={d.website ?? ''} onChange={(e) => set('website', e.target.value)} placeholder="clubfitness.com.br" /></div></Field>
          </div>
        </SectionCard>

        <DocImport brand={brand} name={d.name} website={d.website ?? ''} segment={d.segment ?? ''} handle={d.handle ?? ''} openaiOk={openaiOk} vocab={[d.name, d.handle ?? '', d.segment ?? '', ...d.font_prefs.list]} onApply={applyAI} />

        <BrandAssistant brandId={brand.id} name={d.name} website={d.website ?? ''} segment={d.segment ?? ''} handle={d.handle ?? ''} brief={d.brand_brief} onBrief={(b) => set('brand_brief', b)} onApply={applyAI} openaiOk={openaiOk} />

        <SectionCard icon={<Layers className="h-4 w-4" />} title="Logos" hint="Envie quantas versões quiser (positiva, negativa, ícone…). A principal vai como referência em toda geração; no Criador de prompts você escolhe qual usar e onde.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="logo-list">
            {(logos ?? []).map((l) => {
              const main = l.id === (logo?.id ?? null)
              return (
                <div key={l.id} className={cn('rounded-2xl border p-2.5', main ? 'border-ink' : 'border-zinc-200')} data-testid="logo-card">
                  <div className="flex h-24 items-center justify-center overflow-hidden rounded-xl bg-[conic-gradient(#f1f1ee_25%,#fff_0_50%,#f1f1ee_0_75%,#fff_0)] bg-[length:16px_16px] ring-1 ring-black/5"><StudioImg path={l.storage_path} fit="contain" className="h-full w-full bg-transparent p-2" /></div>
                  <input defaultValue={l.label ?? ''} onBlur={(e) => void renameLogo(l, e.target.value)} placeholder="Versão (ex.: positiva, negativa, ícone)" className="mt-2 h-8 w-full rounded-lg border border-zinc-200 px-2 text-xs focus:border-ink focus:outline-none" aria-label="Nome da versão da logo" />
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {main ? <span className="inline-flex h-7 items-center gap-1 rounded-full bg-ink px-2.5 text-[11px] font-semibold text-white"><Star className="h-3 w-3" />Principal</span>
                      : <button type="button" className="inline-flex h-7 items-center gap-1 rounded-full border border-zinc-200 px-2.5 text-[11px] font-semibold text-zinc-600 hover:border-ink" onClick={() => void setMainLogo(l)}><Star className="h-3 w-3" />Tornar principal</button>}
                    <button type="button" className="ml-auto rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-brand" aria-label="Remover logo" onClick={() => void removeLogo(l)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              )
            })}
            <label className="flex min-h-[148px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 text-center text-sm font-semibold text-zinc-500 transition hover:border-ink hover:text-ink">
              {logoBusy ? <Spinner className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}{logos?.length ? 'Adicionar mais logos' : 'Enviar logo(s)'}
              <span className="px-3 text-[11px] font-normal text-zinc-400">PNG com fundo transparente ou SVG funciona melhor</span>
              <input type="file" accept="image/*" multiple hidden data-testid="logo-input" onChange={(e) => { void onLogos(Array.from(e.target.files ?? [])); e.target.value = '' }} />
            </label>
          </div>
        </SectionCard>

        <SectionCard icon={<Palette className="h-4 w-4" />} title="Cores da marca" hint="Escolha no seletor, use o conta-gotas em qualquer ponto da tela ou de uma imagem da biblioteca.">
          <ColorPalette value={d.colors} onChange={(v) => set('colors', v)} logo={logo} refs={refs ?? []} />
        </SectionCard>

        <SectionCard icon={<Type className="h-4 w-4" />} title="Tipografia" hint="Fontes padrão desta empresa: digite o nome, escolha na lista e ela fica salva. O Criador de prompts usa estas fontes (e você pode desligá-las por post).">
          <BrandFontReader refs={refs ?? []} onUse={(s) => { set('fonts', { ...d.fonts, ...(s.title ? { title: s.title } : {}), ...(s.body ? { body: s.body } : {}), ...(s.accent ? { accent: s.accent } : {}) }); set('font_prefs', { ...d.font_prefs, list: [...new Set([...d.font_prefs.list, ...s.list])].slice(0, 14) }) }} />
          <p className="label">Fontes da empresa</p>
          <FontPicker value={d.font_prefs.list} onChange={(v) => set('font_prefs', { ...d.font_prefs, list: v })} />
          <Field label="Como usar (opcional)" className="mt-3"><Textarea rows={2} value={d.font_prefs.notes} onChange={(e) => set('font_prefs', { ...d.font_prefs, notes: e.target.value })} placeholder="Ex.: Títulos em Anton, caixa alta; palavra de destaque em Playfair Display itálico; texto corrido em Inter." /></Field>
          <details className="mt-4 rounded-2xl bg-zinc-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold">Papéis fixos (opcional)</summary>
            <datalist id="fonts">{FONT_SUGGESTIONS.map((f) => <option key={f} value={f} />)}</datalist>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Field label="Títulos"><Input list="fonts" value={d.fonts.title ?? ''} onChange={(e) => set('fonts', { ...d.fonts, title: e.target.value })} placeholder="Ex.: Bebas Neue" /></Field>
              <Field label="Texto"><Input list="fonts" value={d.fonts.body ?? ''} onChange={(e) => set('fonts', { ...d.fonts, body: e.target.value })} placeholder="Ex.: Inter" /></Field>
              <Field label="Destaques"><Input list="fonts" value={d.fonts.accent ?? ''} onChange={(e) => set('fonts', { ...d.fonts, accent: e.target.value })} placeholder="Ex.: Playfair Display" /></Field>
            </div>
          </details>
        </SectionCard>

        <SectionCard icon={<MessageSquareQuote className="h-4 w-4" />} title="Voz e tom" hint="Como a marca fala nos posts.">
          <ChipSelect options={TONE_CHIPS} value={d.tone_tags} onChange={(v) => set('tone_tags', v)} />
          <Textarea className="mt-3" rows={3} value={d.voice ?? ''} onChange={(e) => set('voice', e.target.value)} placeholder="Ex.: Fala como um treinador amigo: direto, motivador, sem jargão. Usa 'você'. Frases curtas." />
        </SectionCard>

        <SectionCard icon={<Sparkles className="h-4 w-4" />} title="Estilo visual" hint="O jeito de a marca aparecer: composição, fotografia, acabamento.">
          <ChipSelect options={STYLE_CHIPS} value={d.style_tags} onChange={(v) => set('style_tags', v)} />
          <Textarea className="mt-3" rows={4} value={d.style_notes ?? ''} onChange={(e) => set('style_notes', e.target.value)} placeholder="Ex.: Fundo preto com fotos de alto contraste, título em caixa alta amarela, selo redondo no canto superior direito, bastante respiro." />
        </SectionCard>

        <div className="grid gap-5 xl:grid-cols-2">
          <SpecCard title="Padrão dos carrosséis" icon={<LayoutGrid className="h-4 w-4" />} spec={d.carousel_spec} onChange={(p) => spec('carousel_spec', p)} showSlides />
          <SpecCard title="Padrão dos estáticos" icon={<LayoutGrid className="h-4 w-4" />} spec={d.static_spec} onChange={(p) => spec('static_spec', p)} />
        </div>

        <SectionCard icon={<ShieldCheck className="h-4 w-4" />} title="Regras da marca" hint="O que a IA sempre deve fazer e o que nunca pode aparecer.">
          <div className="grid gap-5 lg:grid-cols-2">
            <div><p className="label">Sempre</p><RuleList tone="ok" value={d.rules_do} onChange={(v) => set('rules_do', v)} placeholder="Ex.: usar a logo no último slide" /></div>
            <div><p className="label">Nunca</p><RuleList tone="no" value={d.rules_dont} onChange={(v) => set('rules_dont', v)} placeholder="Ex.: usar emojis na arte" /></div>
          </div>
        </SectionCard>

        <SectionCard icon={<Hash className="h-4 w-4" />} title="Hashtags e chamada para ação" hint="Usadas na legenda gerada junto do carrossel.">
          <div className="space-y-4">
            <Field label="Hashtags da marca"><TagInput prefix="#" value={d.hashtags} onChange={(v) => set('hashtags', v)} placeholder="#clubfitness (Enter para adicionar)" /></Field>
            <Field label="CTA padrão"><Input value={d.cta ?? ''} onChange={(e) => set('cta', e.target.value)} placeholder="Ex.: Agende sua aula experimental pelo link da bio" /></Field>
          </div>
        </SectionCard>
      </div>

      {/* painel de treinamento */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card surface-dark overflow-hidden border-0 p-5 text-white">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-brand"><BrainCircuit className="h-4 w-4" />Treinamento</span>
            <span className={cn('chip', status.c)}>{status.t}</span>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <p className="tabular font-display text-5xl font-bold tracking-tight">{comp.pct}<span className="text-2xl text-zinc-500">%</span></p>
            <p className="pb-1.5 text-xs text-zinc-400">{brand.trained_at ? `Último treino ${fromNow(brand.trained_at)}` : 'Nunca treinada'}</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light shadow-[0_0_14px_rgba(225,6,0,.7)] transition-all duration-700" style={{ width: `${comp.pct}%` }} /></div>
          <ul className="mt-4 space-y-1.5">
            {comp.items.map((i) => (
              <li key={i.label} className={cn('flex items-center gap-2 text-sm', i.ok ? 'text-zinc-200' : 'text-zinc-500')}>
                <span className={cn('flex h-4 w-4 items-center justify-center rounded-full', i.ok ? 'bg-emerald-500 text-white' : 'border border-zinc-600')}>{i.ok && <Check className="h-3 w-3" />}</span>{i.label}
              </li>
            ))}
          </ul>
          <div className="mt-5 space-y-2">
            <button className="btn-brand h-11 w-full" onClick={() => save(true)} disabled={saving}>{saving ? <Spinner className="h-4 w-4 text-white" /> : <BrainCircuit className="h-4 w-4" />}Salvar e treinar</button>
            <button className="btn h-10 w-full bg-white/10 text-white hover:bg-white/15" onClick={() => save(false)} disabled={saving || !changed}><Save className="h-4 w-4" />Salvar sem treinar</button>
            <button className="btn-ghost h-9 w-full text-zinc-300 hover:bg-white/10 hover:text-white" onClick={() => setDoc(true)}><FileText className="h-4 w-4" />Ver documento de treinamento</button>
          </div>
          {!openaiOk && <p className="mt-4 rounded-xl bg-white/[.06] p-3 text-xs leading-relaxed text-zinc-400">A IA já usa este cadastro e as referências em cada geração. Para ela também <b className="text-zinc-200">analisar as imagens</b> no treino, conecte a chave da OpenAI em Modelos e APIs.</p>}
        </div>
      </aside>

      {step && (
        <Modal open onClose={() => null} size="sm" title="Treinando a IA">
          <div className="flex flex-col items-center py-6 text-center">
            <span className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink text-white"><BrainCircuit className="h-7 w-7" /><span className="absolute inset-0 animate-pulse-ring rounded-2xl" /></span>
            <p className="font-display text-base font-semibold">{step}</p>
            <p className="mt-1 text-xs text-zinc-500">Isso leva alguns segundos.</p>
          </div>
        </Modal>
      )}
      {doc && (
        <Modal open onClose={() => setDoc(false)} size="lg" title="Documento de treinamento" subtitle={brand.skill_version ? `Versão ${brand.skill_version} gravada · abaixo, a prévia com o cadastro atual` : 'Prévia — ainda não treinada'}>
          <pre className="whitespace-pre-wrap rounded-2xl bg-zinc-50 p-4 font-sans text-[13px] leading-relaxed text-zinc-700">{compileSkill({ ...brand, ...d }, brand.skill_version + (changed || brand.dirty || !brand.skill_version ? 1 : 0))}</pre>
          <p className="mt-3 text-xs text-zinc-500">Este texto — junto com as imagens de referência desta pasta — é enviado ao modelo a cada geração. Ele nunca é compartilhado com outras empresas.</p>
        </Modal>
      )}
    </div>
  )
}

function SpecCard({ title, icon, spec, onChange, showSlides }: { title: string; icon: React.ReactNode; spec: BrandSpec; onChange: (p: Partial<BrandSpec>) => void; showSlides?: boolean }) {
  return (
    <SectionCard icon={icon} title={title} hint={showSlides ? 'Estrutura que os carrosséis desta marca sempre seguem.' : 'Como são os criativos de um slide só.'}>
      <div className="space-y-3">
        {showSlides && <Field label="Nº padrão de slides"><Input type="number" min={2} max={12} value={spec.slides ?? ''} onChange={(e) => onChange({ slides: e.target.value ? Number(e.target.value) : undefined })} placeholder="7" /></Field>}
        <Field label={showSlides ? 'Capa' : 'Composição'}><Textarea rows={2} value={(showSlides ? spec.cover : spec.layout) ?? ''} onChange={(e) => onChange(showSlides ? { cover: e.target.value } : { layout: e.target.value })} placeholder={showSlides ? 'Título grande em caixa alta, foto do produto, selo no canto' : 'Foto centralizada, título no topo, CTA em botão'} /></Field>
        {showSlides && <Field label="Último slide / CTA"><Textarea rows={2} value={spec.closing ?? ''} onChange={(e) => onChange({ closing: e.target.value })} placeholder="Fundo da cor principal, logo e chamada para o link da bio" /></Field>}
        <Field label="Densidade de texto">
          <div className="grid grid-cols-3 gap-2">
            {['Baixa', 'Média', 'Alta'].map((o) => <button key={o} type="button" onClick={() => onChange({ density: spec.density === o ? undefined : o })} className={cn('rounded-xl border px-3 py-2 text-sm font-medium transition', spec.density === o ? 'border-ink bg-ink text-white' : 'border-zinc-200 hover:border-zinc-400')}>{o}</button>)}
          </div>
        </Field>
        <Field label="Observações"><Textarea rows={2} value={spec.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Detalhes extras do padrão" /></Field>
      </div>
    </SectionCard>
  )
}

