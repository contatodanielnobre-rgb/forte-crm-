import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, BrainCircuit, Check, Cpu, FolderPlus, Images, ListChecks, Plug, Rocket, Sparkles, WandSparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, errMsg } from '@/lib/utils'
import { Field, Input, PageLoader, Spinner, Textarea } from '@/components/ui'
import { AGENT_MODELS, STYLE_CHIPS, TONE_CHIPS, agentCallUsd, fmtBrl, getRate, imageCost } from '@/features/studio/catalog'
import { ensureBase, hasProvider, saveBrand, saveSettings, trainAgent, trainBrand, trainStyles, useBrands, useModels, useProviderStatus, useStudioSettings, useUsage } from '@/features/studio/data'
import References from '@/features/studio/References'
import { ChipSelect, RuleList, SectionCard } from '@/features/studio/ui'
import type { Brand, StudioSettings } from '@/features/studio/types'

const STEPS = [
  { id: 'welcome', label: 'Boas-vindas', icon: Rocket },
  { id: 'models', label: 'Escolher os modelos', icon: Cpu },
  { id: 'refs', label: 'Referências', icon: Images },
  { id: 'goal', label: 'Perguntas', icon: ListChecks },
  { id: 'train', label: 'Treinar o designer', icon: BrainCircuit },
  { id: 'client', label: 'Primeira pasta', icon: FolderPlus },
] as const

/** Programa de início: sobe as referências da agência, define o objetivo, treina a skill base e abre a primeira pasta de cliente */
export default function StudioStart() {
  const { isAdmin, profile } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data: brands } = useBrands()
  const { data: settings } = useStudioSettings()
  const { data: providers } = useProviderStatus()
  const { data: usage } = useUsage()
  const [step, setStep] = useState(0)
  const base = brands?.find((b) => b.is_base)

  useEffect(() => { if (isAdmin && profile && brands && !base) ensureBase(profile.id).then(() => qc.invalidateQueries({ queryKey: ['studio', 'brands'] })).catch((e) => toast.error(errMsg(e))) }, [isAdmin, profile, brands, base, qc])
  if (!isAdmin) return <Navigate to="/studio" replace />
  if (!base || !settings) return <PageLoader />

  const refs = usage?.get(base.id)?.refs ?? 0
  const finish = async () => {
    await supabase.from('studio_settings').update({ onboarding_done: true }).eq('id', 1)
    qc.invalidateQueries({ queryKey: ['studio'] })
    toast.success('Programa concluído! O estúdio está pronto.'); nav('/studio')
  }
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  return (
    <div className="mx-auto max-w-4xl">
      <ol className="mb-8 flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <button type="button" onClick={() => setStep(i)} className={cn('flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition', i === step ? 'border-ink bg-ink text-white shadow-card' : i < step ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300')}>
              <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', i === step ? 'bg-brand text-white' : i < step ? 'bg-emerald-500 text-white' : 'bg-zinc-100')}>{i < step ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}</span>
              <span className="hidden text-xs font-semibold leading-tight lg:block">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div key={step} className="animate-fade-up">
        {step === 0 && (
          <div className="surface-dark overflow-hidden rounded-3xl p-8 text-white shadow-pop sm:p-10">
            <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand shadow-brand"><Rocket className="h-7 w-7" /></span>
            <h2 className="font-display text-3xl font-bold tracking-tight">Vamos treinar a IA da Forte Company</h2>
            <p className="mt-3 max-w-2xl text-zinc-400">São duas IAs trabalhando juntas: o designer (agente), que pensa o post e escreve cada slide, e o gerador de imagens, que desenha. Aqui você escolhe os modelos, ensina o jeito da agência e treina o designer.</p>
            <ul className="mt-7 grid gap-3 sm:grid-cols-2">
              {[['Escolha os modelos', 'Agente barato e inteligente + gerador de imagens.'], ['Suba 50 a 100 referências', 'Peças que a Forte já produziu (até 1 GB).'], ['Responda às perguntas', 'Objetivo, linguagem, tom, regras e estrutura.'], ['Treine o designer', 'Skill base + manual do agente. Depois, uma pasta por cliente.']].map(([t, d], i) => (
                <li key={t} className="flex gap-3 rounded-2xl bg-white/[.06] p-4 ring-1 ring-white/10"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 font-display text-sm font-bold">{i + 1}</span><span><b className="block text-sm">{t}</b><span className="text-xs text-zinc-400">{d}</span></span></li>
              ))}
            </ul>
            {!hasProvider(providers, 'openai') && (
              <Link to="/studio/models" className="mt-7 flex items-center gap-3 rounded-2xl bg-white/[.06] p-4 text-sm ring-1 ring-white/10 transition hover:bg-white/10"><Plug className="h-5 w-5 text-brand" /><span className="flex-1"><b>Dica:</b> conecte a chave da OpenAI agora (opcional) para a IA analisar as imagens no treino e dividir textos em slides.</span><ArrowRight className="h-4 w-4" /></Link>
            )}
          </div>
        )}

        {step === 1 && <ModelsStep settings={settings} />}

        {step === 2 && (
          <SectionCard icon={<Images className="h-4 w-4" />} title="Referências da agência" hint="Carrosséis, anúncios e criativos que a Forte já fez. Pode subir de 50 a 100 imagens de uma vez, no máximo 1 GB.">
            <References brandId={base.id} />
          </SectionCard>
        )}

        {step === 3 && <GoalStep brand={base} settings={settings} />}

        {step === 4 && <TrainStep brand={base} refs={refs} analyze={hasProvider(providers, 'openai')} settings={settings} />}

        {step === 5 && (
          <div className="card p-8 text-center">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-white shadow-card"><FolderPlus className="h-7 w-7" /></span>
            <h2 className="font-display text-2xl font-bold tracking-tight">Crie a pasta do primeiro cliente</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-500">Cada empresa tem seu próprio formulário: nome, logo, cores (com conta-gotas), referências e regras. Assim a IA nunca mistura uma marca com a outra.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button className="btn-brand h-11 px-6" onClick={async () => { await finish2(); nav('/studio/library') }}><FolderPlus className="h-4 w-4" />Ir criar a pasta</button>
              <button className="btn-outline h-11" onClick={finish}>Concluir e abrir o estúdio</button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button className="btn-ghost" onClick={back} disabled={step === 0}><ArrowLeft className="h-4 w-4" />Voltar</button>
        {step < STEPS.length - 1 && <button className="btn-primary h-10 px-5" onClick={next}>{step === 0 ? 'Começar' : 'Continuar'}<ArrowRight className="h-4 w-4" /></button>}
      </div>
    </div>
  )

  async function finish2() { await supabase.from('studio_settings').update({ onboarding_done: true }).eq('id', 1); qc.invalidateQueries({ queryKey: ['studio'] }) }
}

const OBJECTIVES = ['Atrair seguidores', 'Gerar leads', 'Vender', 'Educar o público', 'Construir autoridade', 'Engajar a comunidade']
function GoalStep({ brand, settings }: { brand: Brand; settings: StudioSettings }) {
  const qc = useQueryClient()
  const [d, setD] = useState({ style_tags: brand.style_tags, tone_tags: brand.tone_tags, style_notes: brand.style_notes ?? '', voice: brand.voice ?? '', rules_do: brand.rules_do, rules_dont: brand.rules_dont, slides: String(brand.carousel_spec.slides ?? '') })
  const notes = settings.agent_notes as { company?: string; objectives?: string[]; language?: string; audience?: string; platforms?: string }
  const [q, setQ] = useState({ company: notes.company ?? '', objectives: notes.objectives ?? [], language: notes.language ?? 'Português do Brasil, linguagem natural e direta', audience: notes.audience ?? '', platforms: notes.platforms ?? 'Instagram (carrossel e estático) e TikTok' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await saveSettings({ agent_notes: { ...settings.agent_notes, ...q } }, qc)
      await saveBrand(brand.id, { style_tags: d.style_tags, tone_tags: d.tone_tags, style_notes: d.style_notes.trim() || null, voice: d.voice.trim() || null, rules_do: d.rules_do, rules_dont: d.rules_dont, carousel_spec: { ...brand.carousel_spec, slides: d.slides ? Number(d.slides) : undefined } } as Partial<Brand>)
      qc.invalidateQueries({ queryKey: ['studio', 'brands'] }); toast.success('Objetivo salvo')
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-5">
      <SectionCard icon={<ListChecks className="h-4 w-4" />} title="Perguntas para o designer" hint="O agente lê estas respostas toda vez que pensa um post.">
        <Field label="Quem é a empresa e o que ela faz?" className="mb-4"><Textarea rows={3} value={q.company} onChange={(e) => setQ({ ...q, company: e.target.value })} placeholder="Ex.: A Forte Company é uma agência digital que usa IA para acelerar processos e entregar mais rápido. Vendemos gestão de conteúdo, branding e tráfego para donos de pequenas e médias empresas." /></Field>
        <p className="label">Qual o objetivo principal dos posts?</p>
        <ChipSelect options={OBJECTIVES} value={q.objectives} onChange={(v) => setQ({ ...q, objectives: v })} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Qual a linguagem de fala?"><Input value={q.language} onChange={(e) => setQ({ ...q, language: e.target.value })} placeholder="Ex.: Português do Brasil, informal, com gírias leves" /></Field>
          <Field label="Onde publicamos?"><Input value={q.platforms} onChange={(e) => setQ({ ...q, platforms: e.target.value })} placeholder="Instagram, TikTok…" /></Field>
        </div>
        <Field label="Quem é o público típico dos clientes?" className="mt-3"><Textarea rows={2} value={q.audience} onChange={(e) => setQ({ ...q, audience: e.target.value })} placeholder="Ex.: Donos de pequenos negócios locais, 25–45 anos, que querem mais clientes pelo Instagram." /></Field>
      </SectionCard>
      <SectionCard icon={<Sparkles className="h-4 w-4" />} title="O que a agência quer criar" hint="Descreva o padrão geral da Forte Company. Cada cliente pode ter regras próprias depois.">
        <p className="label">Estilo geral</p><ChipSelect options={STYLE_CHIPS} value={d.style_tags} onChange={(v) => setD({ ...d, style_tags: v })} />
        <Field label="Como são os nossos carrosséis e criativos?" className="mt-4"><Textarea rows={5} value={d.style_notes} onChange={(e) => setD({ ...d, style_notes: e.target.value })} placeholder="Ex.: Capa com promessa forte e número no título, slides com uma ideia por vez, muito respiro, tipografia grande, CTA claro no último slide, fotos reais com tratamento premium." /></Field>
        <p className="label mt-4">Tom de voz</p><ChipSelect options={TONE_CHIPS} value={d.tone_tags} onChange={(v) => setD({ ...d, tone_tags: v })} />
        <Field label="Como falamos" className="mt-3"><Textarea rows={2} value={d.voice} onChange={(e) => setD({ ...d, voice: e.target.value })} placeholder="Ex.: Direto, em português do Brasil, sem jargões, frases curtas." /></Field>
        <Field label="Slides por carrossel (padrão)" className="mt-3 max-w-[200px]"><Input type="number" min={2} max={12} value={d.slides} onChange={(e) => setD({ ...d, slides: e.target.value })} placeholder="7" /></Field>
      </SectionCard>
      <SectionCard icon={<Check className="h-4 w-4" />} title="Regras da agência">
        <div className="grid gap-5 lg:grid-cols-2">
          <div><p className="label">Sempre</p><RuleList tone="ok" value={d.rules_do} onChange={(v) => setD({ ...d, rules_do: v })} placeholder="Ex.: texto legível em celular" /></div>
          <div><p className="label">Nunca</p><RuleList tone="no" value={d.rules_dont} onChange={(v) => setD({ ...d, rules_dont: v })} placeholder="Ex.: mais de 30 palavras por slide" /></div>
        </div>
      </SectionCard>
      <div className="flex justify-end"><button className="btn-primary h-10" onClick={save} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}Salvar objetivo</button></div>
    </div>
  )
}

function TrainStep({ brand, refs, analyze, settings }: { brand: Brand; refs: number; analyze: boolean; settings: StudioSettings }) {
  const qc = useQueryClient()
  const [step, setStep] = useState<string | null>(null)
  const [done, setDone] = useState<{ version: number; analyzed: boolean; err: string | null; agent: number | null; agentErr: string | null; agentDemo: boolean; styles: string | null } | null>(null)
  const go = async () => {
    try {
      const r = await trainBrand(brand, { analyze: analyze && refs > 0, onStep: setStep })
      let agent: number | null = null, agentErr: string | null = null, agentDemo = false
      if (analyze) {
        setStep('Treinando o designer (agente)…')
        try { const a = await trainAgent(); agent = a.version; agentDemo = !!a.demo } catch (e) { agentErr = errMsg(e) }
      }
      let styles: string | null = null
      if (analyze) { setStep('Analisando os estilos Sólido e Humanizado…'); try { const s = await trainStyles(); styles = Object.entries(s.counts).filter(([, n]) => n > 0).map(([k, n]) => `${k === 'solido' ? 'Sólido' : 'Humanizado'} (${n} imagens)`).join(' · ') } catch { /* sem referências marcadas: segue */ } }
      setDone({ version: r.version, analyzed: r.analyzed, err: r.analysisError, agent, agentErr, agentDemo, styles }); qc.invalidateQueries({ queryKey: ['studio'] })
    } catch (e) { toast.error(errMsg(e)) } finally { setStep(null) }
  }
  const agentName = AGENT_MODELS.find((m) => m.id === settings.text_model)?.name ?? settings.text_model
  return (
    <div className="card p-8 text-center">
      <span className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink text-white shadow-card"><BrainCircuit className="h-8 w-8" />{step && <span className="absolute inset-0 animate-pulse-ring rounded-2xl" />}</span>
      <h2 className="font-display text-2xl font-bold tracking-tight">{done ? 'Designer treinado' : 'Treinar o designer da agência'}</h2>
      {done ? (
        <ul className="mx-auto mt-4 max-w-md space-y-2 text-left text-sm">
          <li className="flex gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800"><Check className="mt-0.5 h-4 w-4 shrink-0" /><span><b>Skill base v{done.version}</b>: {done.analyzed ? 'referências analisadas por IA de visão.' : done.err ? `documento gravado; análise visual indisponível (${done.err}).` : 'documento gravado a partir das suas respostas.'}</span></li>
          {done.agent && done.agentDemo ? <li className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900"><Plug className="mt-0.5 h-4 w-4 shrink-0" /><span><b>Treino SIMULADO.</b> Sem chave real da OpenAI nenhuma IA escreveu o manual (mantive o que já estava salvo). Conecte a chave e treine de novo.</span></li> : done.agent ? <li className="flex gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800"><Check className="mt-0.5 h-4 w-4 shrink-0" /><span><b>Agente v{done.agent}</b> ({agentName}): manual do designer gerado e pronto no Criador de prompts.</span></li>
            : <li className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900"><Plug className="mt-0.5 h-4 w-4 shrink-0" /><span>{done.agentErr ? `O manual do agente não foi gerado: ${done.agentErr}` : 'Para gerar o manual do agente conecte a OpenAI e treine de novo. Até lá ele usa o conhecimento embutido + a skill base.'}</span></li>}
          {done.styles && <li className="flex gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800"><Check className="mt-0.5 h-4 w-4 shrink-0" /><span><b>Estilos treinados:</b> {done.styles}: a IA de visão analisou as suas referências.</span></li>}
        </ul>
      ) : (
        <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-500">
          Dois passos: (1) compilamos suas respostas {refs ? `e as ${refs} referências` : '(sem referências ainda)'} na <b>skill base</b>; (2) o agente <b>{agentName}</b> escreve o <b>manual do designer</b> com isso: como pensar ganchos, estruturar carrosséis e dirigir a arte.{analyze ? '' : ' Conecte a OpenAI para a IA também analisar as imagens e gerar o manual.'}
        </p>
      )}
      <div className="mt-6">
        <button className="btn-brand h-11 px-6" onClick={go} disabled={!!step}>{step ? <><Spinner className="h-4 w-4 text-white" />{step}</> : done ? 'Treinar de novo' : <><BrainCircuit className="h-4 w-4" />Treinar agora</>}</button>
      </div>
      {refs < 10 && !done && <p className="mx-auto mt-4 max-w-md rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Você tem poucas referências ({refs}). Funciona, mas 50–100 imagens deixam o resultado bem mais fiel.</p>}
    </div>
  )
}

/** Passo 2: escolher o agente (texto) e o gerador de imagens, com custo estimado de cada um */
function ModelsStep({ settings }: { settings: StudioSettings }) {
  const qc = useQueryClient()
  const { data: models } = useModels()
  const { data: providers } = useProviderStatus()
  const rate = getRate()
  const pick = async (p: Partial<StudioSettings>, label: string) => { try { await saveSettings(p, qc); toast.success(label) } catch (e) { toast.error(errMsg(e)) } }
  const imgModels = (models ?? []).filter((m) => m.enabled && imageCost(m.api_model, 'high'))
  return (
    <div className="space-y-5">
      <SectionCard icon={<BrainCircuit className="h-4 w-4" />} title="1 · O agente (cérebro do designer)" hint="Ele pensa o post, escreve cada slide e dirige o gerador de imagens. Quanto mais barato, melhor para o dia a dia; o texto custa centavos perto das imagens.">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {AGENT_MODELS.map((m) => {
            const on = settings.text_model === m.id
            return (
              <button key={m.id} type="button" onClick={() => pick({ text_model: m.id }, `Agente: ${m.name}`)} className={cn('relative rounded-2xl border p-4 text-left transition', on ? 'border-ink bg-zinc-50 shadow-card' : 'border-zinc-200 hover:border-zinc-400')}>
                <span className={cn('chip mb-2', m.tier === 'budget' ? 'bg-emerald-50 text-emerald-700' : m.tier === 'balanced' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-800')}>{m.tag}</span>
                <b className="block font-display text-base">{m.name}</b>
                <span className="mt-0.5 block text-xs text-zinc-500">{m.desc}</span>
                <span className="mt-2 block text-[11px] text-zinc-500">US$ {m.inUsd} / {m.outUsd} por 1M tokens · <b className="text-ink">≈ {fmtBrl(agentCallUsd(m), rate)}</b> por ideia</span>
                {on && <Check className="absolute right-3 top-3 h-4 w-4 text-brand" />}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-zinc-500">Recomendação: comece com <b>GPT-6 Luna</b>. Se os ganchos ficarem fracos, suba para <b>GPT-6 Sol</b>. A faixa de preço é da OpenAI; confirme o desempenho nos seus posts.</p>
      </SectionCard>

      <SectionCard icon={<WandSparkles className="h-4 w-4" />} title="2 · O gerador de imagens" hint="Quem desenha cada slide. Dá para mudar por criação no estúdio.">
        <div className="space-y-2">
          {imgModels.map((m) => {
            const on = settings.default_model === m.id; const c = imageCost(m.api_model, settings.default_quality)!
            return (
              <button key={m.id} type="button" onClick={() => pick({ default_model: m.id }, `Gerador: ${m.name}`)} className={cn('flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition', on ? 'border-ink bg-zinc-50 shadow-card' : 'border-zinc-200 hover:border-zinc-400')}>
                <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', on ? 'border-brand bg-brand text-white' : 'border-zinc-300')}>{on && <Check className="h-3 w-3" />}</span>
                <span className="min-w-0 flex-1"><b className="block text-sm">{m.name}</b><span className="text-xs text-zinc-500">{m.description}</span></span>
                <span className="text-right text-xs text-zinc-500"><b className="block text-sm text-ink">≈ {fmtBrl(c.total, rate)}</b>por imagem</span>
              </button>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="label !mb-0 mr-1">Qualidade padrão</span>
          {([['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta']] as const).map(([id, t]) => (
            <button key={id} type="button" onClick={() => pick({ default_quality: id }, `Qualidade: ${t}`)} className={cn('rounded-xl border px-3 py-1.5 text-sm font-semibold transition', settings.default_quality === id ? 'border-ink bg-ink text-white' : 'border-zinc-200 hover:border-zinc-400')}>{t}</button>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">Texto dentro da arte pede <b>qualidade alta</b>. O preço por token é igual entre 2.6 e 2.5; a diferença está em quantos tokens cada qualidade gasta. Veja a conta completa na aba <Link to="/studio/costs" className="font-semibold text-brand hover:underline">Custos</Link>.</p>
        {!hasProvider(providers, 'openai') && <Link to="/studio/models" className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900"><Plug className="h-4 w-4" />Falta conectar a chave da OpenAI em Modelos e APIs.</Link>}
      </SectionCard>
    </div>
  )
}
