import { useMemo, useState } from 'react'
import { Calculator, CircleDollarSign, Info, Layers, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AGENT_MODELS, COST_ASSUMPTIONS, USD_BRL_DEFAULT, agentCallUsd, fmtBrl, getRate, imageCost, setRate, type CostAssumptions } from '@/features/studio/catalog'
import { useQuery } from '@tanstack/react-query'
import { must, supabase } from '@/lib/supabase'
import { useModels, useStudioSettings } from '@/features/studio/data'

const num = (v: string, d = 0) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : d }
const QUALITY = [['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta']] as const

function Field({ label, value, onChange, suffix, hint }: { label: string; value: string; onChange: (v: string) => void; suffix?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="relative block"><input className="input pr-14" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />{suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">{suffix}</span>}</span>
      {hint && <span className="mt-1 block text-[11px] text-zinc-400">{hint}</span>}
    </label>
  )
}

/** Calculadora de custos: quanto custa um carrossel/estático, quantos cabem num orçamento e quanto sai por cliente ao mês */
export default function StudioCosts() {
  const { data: models } = useModels()
  const { data: settings } = useStudioSettings()
  const [rate, setRateS] = useState(String(getRate()))
  const [modelId, setModelId] = useState('gpt-image-2.6-sunburst')
  const [quality, setQuality] = useState('high')
  const [slides, setSlides] = useState('6')
  const [errors, setErrors] = useState('3')
  const [car, setCar] = useState('2')
  const [sta, setSta] = useState('1')
  const [weeks, setWeeks] = useState('4.33')
  const [refs, setRefs] = useState(String(settings?.refs_per_slide ?? COST_ASSUMPTIONS.refsPerSlide))
  const [prompt, setPrompt] = useState(String(COST_ASSUMPTIONS.promptTokens))
  const [refTok, setRefTok] = useState(String(COST_ASSUMPTIONS.refTokens))

  const r = num(rate, USD_BRL_DEFAULT) || USD_BRL_DEFAULT
  const a: CostAssumptions = { promptTokens: num(prompt, 3500), refTokens: num(refTok, 1000), refsPerSlide: num(refs, 3) }
  const agent = AGENT_MODELS.find((m) => m.id === (settings?.text_model ?? 'gpt-6-luna')) ?? AGENT_MODELS[0]
  const agentUsd = agentCallUsd(agent)
  const priced = (models ?? []).filter((m) => imageCost(m.api_model, 'high'))

  const calc = (apiModel: string, q: string, withRefs = true, asm = a) => {
    const u = imageCost(apiModel, q, asm, withRefs)
    if (!u) return null
    const nS = Math.max(1, num(slides, 6)), nE = num(errors, 0)
    const carousel = u.total * (nS + nE) + agentUsd
    const stat = u.total * (1 + (nE > 0 ? 1 : 0)) + agentUsd
    const week = carousel * num(car, 2) + stat * num(sta, 1)
    const month = week * num(weeks, 4.33)
    return { u, carousel, stat, week, month }
  }
  const model = models?.find((m) => m.id === modelId) ?? priced[0]
  const main = model ? calc(model.api_model, quality) : null

  const scenarios = model ? ([
    ['Otimista', 'Sem referências anexadas: só o custo de saída + prompt curto', calc(model.api_model, quality, false, { ...a, promptTokens: 1500 })],
    ['Realista', 'Com logo + referências e a skill da marca (o que o estúdio faz)', main],
    ['Pesado', 'Skill longa e 5+ referências por slide', calc(model.api_model, quality, true, { ...a, promptTokens: 6000, refsPerSlide: 6 })],
  ] as const) : []

  const budgets = [20, 50, 100]
  const real = useRealCost()

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div className="space-y-4">
        <div className="card space-y-4 p-5">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-white"><Calculator className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-bold tracking-tight">Calculadora de custos</h2><p className="text-xs text-zinc-500">Estimativa antes de gerar. O custo real fica em cada criação.</p></div></div>
          <div>
            <p className="label">Modelo de imagem</p>
            <select className="input" value={model?.id ?? ''} onChange={(e) => setModelId(e.target.value)}>{priced.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          </div>
          <div>
            <p className="label">Qualidade</p>
            <div className="grid grid-cols-3 gap-2">{QUALITY.map(([id, t]) => <button key={id} type="button" onClick={() => setQuality(id)} className={cn('rounded-xl border px-3 py-2 text-sm font-semibold transition', quality === id ? 'border-ink bg-ink text-white' : 'border-zinc-200 hover:border-zinc-400')}>{t}</button>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Slides" value={slides} onChange={setSlides} />
            <Field label="Refeitos (2–3)" value={errors} onChange={setErrors} />
            <Field label="Carrosséis/semana" value={car} onChange={setCar} />
            <Field label="Estáticos/semana" value={sta} onChange={setSta} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dólar (18/11)" value={rate} onChange={(v) => { setRateS(v); setRate(num(v, USD_BRL_DEFAULT)) }} suffix="R$" />
            <Field label="Semanas/mês" value={weeks} onChange={setWeeks} />
          </div>
          <details className="rounded-2xl bg-zinc-50 p-3 text-sm">
            <summary className="cursor-pointer font-semibold">Suposições de entrada (avançado)</summary>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <Field label="Referências por slide" value={refs} onChange={setRefs} hint="Cada imagem anexada é cobrada como entrada" />
              <Field label="Tokens do prompt (skill + texto)" value={prompt} onChange={setPrompt} suffix="tok" />
              <Field label="Tokens por imagem de referência" value={refTok} onChange={setRefTok} suffix="tok" hint="Suposição. A OpenAI cobra US$ 8 por 1M de tokens de imagem." />
            </div>
          </details>
        </div>
      </div>

      <div className="space-y-4">
        {main && model && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Big icon={Layers} label="Cada imagem" value={fmtBrl(main.u.total, r)} sub={`saída ${fmtBrl(main.u.out, r)} + entrada ${fmtBrl(main.u.input, r)}`} />
              <Big icon={CircleDollarSign} label={`Carrossel de ${num(slides, 6)} slides`} value={fmtBrl(main.carousel, r)} sub={`com ${num(errors, 0)} refeitos + agente ${fmtBrl(agentUsd, r)}`} />
              <Big icon={Wallet} label="Por cliente / mês" value={fmtBrl(main.month, r)} sub={`${num(car, 2)} carrosséis + ${num(sta, 1)} estático(s) por semana`} accent />
            </div>

            <div className="card p-5">
              <h3 className="font-display text-base font-semibold tracking-tight">Quantos carrosséis cabem no orçamento?</h3>
              <p className="text-xs text-zinc-500">Usando {model.name} · qualidade {QUALITY.find(([q]) => q === quality)?.[1].toLowerCase()} · {num(slides, 6)} slides + {num(errors, 0)} refeitos.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {budgets.map((b) => (
                  <div key={b} className="rounded-2xl border border-zinc-200 p-4">
                    <p className="text-xs text-zinc-500">Com</p><p className="font-display text-xl font-bold">R$ {b}</p>
                    <p className="mt-2 text-sm"><b className="font-display text-2xl text-brand">{Math.floor(b / (main.carousel * r))}</b> carrosséis</p>
                    <p className="text-xs text-zinc-500">ou {Math.floor(b / (main.stat * r))} estáticos</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <h3 className="font-display text-base font-semibold tracking-tight">Faixa de custo (por carrossel)</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {scenarios.map(([name, desc, s]) => s && (
                  <div key={name} className={cn('rounded-2xl border p-3', name === 'Realista' ? 'border-ink bg-zinc-50' : 'border-zinc-200')}>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{name}</p>
                    <p className="font-display text-lg font-bold">{fmtBrl(s.carousel, r)}</p>
                    <p className="text-[11px] leading-snug text-zinc-500">{desc}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">≈ {fmtBrl(s.month, r)}/mês por cliente</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-zinc-100 px-5 py-3"><h3 className="font-display text-base font-semibold tracking-tight">Comparativo de modelos</h3><p className="text-xs text-zinc-500">Carrossel completo (com refeitos e agente) · cenário realista</p></div>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-500"><th className="px-5 py-2">Modelo</th>{QUALITY.map(([, t]) => <th key={t} className="px-3 py-2">{t}</th>)}<th className="px-3 py-2">Por cliente/mês (alta)</th></tr></thead>
                <tbody className="divide-y divide-zinc-100">{priced.map((m) => (
                  <tr key={m.id} className={m.id === model.id ? 'bg-zinc-50/70' : ''}><td className="px-5 py-2.5 font-medium">{m.name}</td>
                    {QUALITY.map(([q]) => <td key={q} className="px-3 py-2.5 tabular-nums">{fmtBrl(calc(m.api_model, q)!.carousel, r)}</td>)}
                    <td className="px-3 py-2.5 font-semibold tabular-nums">{fmtBrl(calc(m.api_model, 'high')!.month, r)}</td></tr>
                ))}</tbody></table></div>
            </div>

            <div className="card p-5">
              <h3 className="font-display text-base font-semibold tracking-tight">Agente (texto)</h3>
              <p className="mt-1 text-sm text-zinc-600">{agent.name}: ≈ <b>{fmtBrl(agentUsd, r)}</b> por ideação (≈ 8 mil tokens de entrada e 2 mil de saída). É desprezível perto das imagens; o custo está nas imagens e nas referências que vão junto.</p>
              <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500"><th className="py-1.5 pr-3">Modelo</th><th className="px-3">Entrada / 1M</th><th className="px-3">Saída / 1M</th><th className="px-3">Por ideia</th></tr></thead>
                <tbody className="divide-y divide-zinc-100">{AGENT_MODELS.map((m) => <tr key={m.id}><td className="py-1.5 pr-3 font-medium">{m.name}</td><td className="px-3 tabular-nums">US$ {m.inUsd}</td><td className="px-3 tabular-nums">US$ {m.outUsd}</td><td className="px-3 tabular-nums">{fmtBrl(agentCallUsd(m), r)}</td></tr>)}</tbody></table></div>
            </div>

            {real && (
              <div className="card flex items-start gap-3 border-emerald-200 bg-emerald-50/60 p-5 text-sm">
                <CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <p><b>Custo real medido:</b> {real.images} imagens geradas custaram {fmtBrl(real.usd, r)} no total (≈ {fmtBrl(real.usd / real.images, r)} por imagem). Use esse número no lugar da estimativa.</p>
              </div>
            )}

            <p className="flex items-start gap-2 rounded-2xl bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-500">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />A OpenAI cobra por token (imagem de saída US$ 30/1M, prompt US$ 5/1M, imagem anexada US$ 8/1M) e não publica preço fixo por imagem. Os valores de saída vêm da calculadora de tokens da OpenAI para ~1024×1280; os de entrada são suposição (ajuste acima). Dólar e preços mudam: a cada criação OpenAI o estúdio grava o custo real a partir do uso informado pela API.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Big({ icon: Icon, label, value, sub, accent }: { icon: typeof Layers; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-3xl p-5 shadow-card', accent ? 'surface-dark text-white' : 'card')}>
      <p className={cn('mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide', accent ? 'text-zinc-400' : 'text-zinc-400')}><Icon className="h-3.5 w-3.5" />{label}</p>
      <p className={cn('font-display text-3xl font-bold tracking-tight', accent && 'text-white')}>{value}</p>
      <p className={cn('mt-1 text-xs', accent ? 'text-zinc-400' : 'text-zinc-500')}>{sub}</p>
    </div>
  )
}

/** Soma do custo real (cost_usd) das imagens já geradas, quando a API informou o uso */
function useRealCost() {
  const { data } = useQuery({
    queryKey: ['studio', 'real-cost'],
    queryFn: async () => (must(await supabase.from('studio_images').select('cost_usd').not('cost_usd', 'is', null).limit(5000)) as { cost_usd: number }[]),
  })
  return useMemo(() => (data?.length ? { usd: data.reduce((s, r) => s + Number(r.cost_usd), 0), images: data.length } : null), [data])
}
