import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Check, Globe, Plug, Sparkles, TriangleAlert } from 'lucide-react'
import { cn, errMsg } from '@/lib/utils'
import { Field, Input, Spinner, Textarea } from '@/components/ui'
import { buildBrandBase, type BrandBaseResult } from './data'
import { SectionCard } from './ui'
import type { BrandBrief } from './types'

/**
 * Assistente de treinamento: o usuário conta quem é a empresa, o que vende, para quem e o objetivo;
 * a IA lê isso (e o site, se informado) e propõe a base de treino inteira (voz, estilo, regras, fontes, padrão de carrossel…).
 * O resultado preenche o formulário para revisão: nada é gravado até o usuário clicar em "Salvar e treinar".
 */
export default function BrandAssistant({ brandId, name, website, segment, handle, brief, onBrief, onApply, openaiOk }: {
  brandId: string; name: string; website: string; segment: string; handle: string; brief: BrandBrief
  onBrief: (b: BrandBrief) => void; onApply: (r: BrandBaseResult, replace: boolean) => string[]; openaiOk: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [replace, setReplace] = useState(false)
  const [readSite, setReadSite] = useState(true)
  const [res, setRes] = useState<{ r: BrandBaseResult; filled: string[] } | null>(null)
  const set = (k: keyof BrandBrief, v: string) => onBrief({ ...brief, [k]: v })
  const hasSite = website.trim().length > 3
  const ready = (brief.about ?? '').trim().length > 3 || (brief.products ?? '').trim().length > 3 || hasSite

  const go = async () => {
    setBusy(true)
    try {
      const r = await buildBrandBase({ brandId, name, website, segment, handle, brief, readSite: readSite && hasSite })
      const filled = onApply(r, replace)
      setRes({ r, filled })
      toast.success(r.demo ? 'Resposta simulada (sem chave real)' : 'Base de treino gerada: revise o formulário e clique em Salvar e treinar')
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <SectionCard icon={<Sparkles className="h-4 w-4" />} title="Assistente de treinamento (IA)" hint="Conte sobre a empresa e a IA monta a base de treino: voz, estilo, regras, fontes e padrão de carrossel. Você revisa e clica em Salvar e treinar.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="O que a empresa faz e para quem" className="sm:col-span-2"><Textarea rows={3} value={brief.about ?? ''} onChange={(e) => set('about', e.target.value)} placeholder="Ex.: Clínica de estética em Curitiba que atende mulheres de 30 a 55 anos que querem rejuvenescer com resultado natural." /></Field>
        <Field label="Produtos e serviços"><Textarea rows={2} value={brief.products ?? ''} onChange={(e) => set('products', e.target.value)} placeholder="Ex.: Botox, preenchimento, bioestimuladores, protocolos faciais." /></Field>
        <Field label="Objetivo com os posts"><Textarea rows={2} value={brief.goal ?? ''} onChange={(e) => set('goal', e.target.value)} placeholder="Ex.: Gerar agendamentos de avaliação e posicionar a clínica como referência." /></Field>
        <Field label="Público"><Input value={brief.audience ?? ''} onChange={(e) => set('audience', e.target.value)} placeholder="Ex.: Mulheres 30–55, classe A/B, preocupadas com naturalidade" /></Field>
        <Field label="Diferenciais e como quer ser percebida"><Input value={brief.differentiators ?? ''} onChange={(e) => set('differentiators', e.target.value)} placeholder="Ex.: Médica própria, resultado discreto, atendimento premium" /></Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className={cn('flex items-center gap-2', !hasSite && 'opacity-50')}><input type="checkbox" className="accent-[#E10600]" checked={readSite && hasSite} disabled={!hasSite} onChange={(e) => setReadSite(e.target.checked)} /><Globe className="h-4 w-4 text-zinc-400" />Ler o site (textos, cores e fontes)</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#E10600]" checked={replace} onChange={(e) => setReplace(e.target.checked)} />Substituir o que já está preenchido</label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-brand h-11 px-5" onClick={go} disabled={busy || !ready || !openaiOk}>{busy ? <><Spinner className="h-4 w-4 text-white" />A IA está montando a base…</> : <><Sparkles className="h-4 w-4" />Gerar base de treino com IA</>}</button>
        {!openaiOk && <Link to="/studio/models" className="flex items-center gap-2 text-xs font-semibold text-amber-800 hover:underline"><Plug className="h-4 w-4" />Conecte a OpenAI para usar</Link>}
        {openaiOk && !ready && <span className="text-xs text-zinc-500">Preencha ao menos “o que faz” ou o site (em Identidade).</span>}
      </div>

      {res && (
        <div className="mt-5 animate-fade-up space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-sm">
          {res.r.demo && <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900"><TriangleAlert className="h-4 w-4" />Resposta SIMULADA: nenhuma IA foi chamada.</p>}
          {res.r.summary && <p className="text-zinc-700">{res.r.summary}</p>}
          {res.filled.length > 0 && <p className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-800"><Check className="h-4 w-4" /><b>Preenchido no formulário:</b>{res.filled.map((f) => <span key={f} className="rounded-md bg-white px-1.5 py-0.5 ring-1 ring-emerald-200">{f}</span>)}</p>}
          {res.r.site?.fetched && (
            <div className="text-xs text-zinc-600">
              <b className="text-ink">Lido do site:</b> {res.r.site.title || website}
              {!!res.r.site.colors?.length && <span className="ml-2 inline-flex items-center gap-1 align-middle">{res.r.site.colors.map((c) => <span key={c} title={c} className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: c }} />)}</span>}
              {!!res.r.site.fonts?.length && <span className="ml-2">fontes: {res.r.site.fonts.join(', ')}</span>}
            </div>
          )}
          {res.r.site && !res.r.site.fetched && res.r.site.requested && <p className="text-xs text-amber-800">Não consegui abrir o site (pode bloquear leitura automática). A base foi montada só com o que você escreveu.</p>}
          {!!res.r.missing?.length && (
            <div className="rounded-xl bg-white p-3 text-xs text-zinc-600 ring-1 ring-zinc-200">
              <b className="text-ink">Para melhorar ainda mais, conte também:</b>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{res.r.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}
          <p className="text-xs text-zinc-500">Revise os campos abaixo, ajuste o que quiser e clique em <b>Salvar e treinar</b>.</p>
        </div>
      )}
    </SectionCard>
  )
}
