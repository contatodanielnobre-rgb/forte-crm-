import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ExternalLink, Info, Sparkles, Eye, EyeOff, KeyRound, Lock, PlugZap, ShieldCheck, Star, Trash2, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, errMsg, fromNow } from '@/lib/utils'
import { Skeleton, Spinner, Toggle } from '@/components/ui'
import { AGENT_MODELS, PROVIDERS, PROVIDER_ORDER, fmtBrl, getRate, imageCost } from '@/features/studio/catalog'
import { studioKeys, useModels, useProviderStatus, useStudioSettings } from '@/features/studio/data'
import type { Provider, ProviderStatus, StudioModel } from '@/features/studio/types'

/** Catálogo de modelos + chaves de API (as chaves ficam só no servidor; aqui o status fica verde/cinza) */
export default function StudioModels() {
  const { isAdmin } = useAuth()
  const { data: models, isLoading } = useModels()
  const { data: status } = useProviderStatus()
  const { data: settings } = useStudioSettings()
  const connected = status?.length ?? 0

  return (
    <div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="APIs conectadas" value={`${connected} de ${PROVIDER_ORDER.length}`} ok={connected > 0} />
        <Stat label="Agente (texto)" value={AGENT_MODELS.find((m) => m.id === settings?.text_model)?.name ?? settings?.text_model ?? '—'} />
        <Stat label="Modelo de imagem padrão" value={models?.find((m) => m.id === settings?.default_model)?.name ?? '—'} />
        <div className="card flex items-start gap-3 p-4"><Lock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><p className="text-xs leading-relaxed text-zinc-600"><b className="text-ink">Chaves seguras.</b> Ficam salvas no Supabase, só a Edge Function as lê. O navegador nunca recebe a chave de volta — só o status.</p></div>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-card">
        <Info className="h-5 w-5 shrink-0 text-zinc-400" />
        <p className="min-w-[260px] flex-1 text-sm text-zinc-600"><b className="text-ink">O que é o botão liga/desliga?</b> Ele só decide se o modelo <b>aparece na lista do estúdio</b>. Ligado não custa nada: você só paga quando gera uma imagem com ele. Deixe ligado apenas o que a equipe vai usar.</p>
        {isAdmin && <OnlyRecommended models={models ?? []} />}
      </div>
      {!isAdmin && <p className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Somente administradores podem cadastrar ou trocar chaves de API. Você pode ver quais modelos estão disponíveis.</p>}
      {isLoading ? <div className="space-y-4"><Skeleton className="h-56" /><Skeleton className="h-56" /></div> : (
        <div className="stagger space-y-5">
          {PROVIDER_ORDER.map((p) => <ProviderCard key={p} provider={p} status={status?.find((s) => s.provider === p)} models={(models ?? []).filter((m) => m.provider === p)} isAdmin={isAdmin} defaultModel={settings?.default_model} />)}
        </div>
      )}
    </div>
  )
}

const RECOMMENDED = 'gpt-image-2.6-sunburst'
function OnlyRecommended({ models }: { models: StudioModel[] }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const done = models.length > 0 && models.every((m) => m.enabled === (m.id === RECOMMENDED))
  const run = async () => {
    setBusy(true)
    try {
      const a = await supabase.from('studio_models').update({ enabled: false }).neq('id', RECOMMENDED); if (a.error) throw a.error
      const b = await supabase.from('studio_models').update({ enabled: true }).eq('id', RECOMMENDED); if (b.error) throw b.error
      const c = await supabase.from('studio_settings').update({ default_model: RECOMMENDED }).eq('id', 1); if (c.error) throw c.error
      qc.invalidateQueries({ queryKey: ['studio'] }); toast.success('Só o GPT Image 2.6 Sunburst ficou ligado')
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }
  return <button className="btn-outline h-10 shrink-0" onClick={run} disabled={busy || done}>{busy ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}{done ? 'Só o recomendado está ligado' : 'Deixar só o recomendado ligado'}</button>
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return <div className="card p-4"><p className="label !mb-1">{label}</p><p className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">{ok !== undefined && <span className={cn('h-2.5 w-2.5 rounded-full', ok ? 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.2)]' : 'bg-zinc-300')} />}{value}</p></div>
}

function ProviderCard({ provider, status, models, isAdmin, defaultModel }: { provider: Provider; status?: ProviderStatus; models: StudioModel[]; isAdmin: boolean; defaultModel?: string }) {
  const meta = PROVIDERS[provider]
  const qc = useQueryClient()
  const [key, setKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(status?.base_url ?? '')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState<null | 'save' | 'test' | 'del'>(null)
  const ok = !!status
  const refresh = () => qc.invalidateQueries({ queryKey: ['studio', 'providers'] })

  const run = async (kind: 'save' | 'test' | 'del') => {
    setBusy(kind)
    try {
      if (kind === 'save') {
        const r = await studioKeys<{ encrypted?: boolean }>({ action: 'set', provider, api_key: key.trim(), base_url: baseUrl.trim() || null })
        toast.success(`${meta.name} conectada`, { description: r.encrypted ? 'Chave salva com criptografia.' : 'Dica: defina STUDIO_ENC_KEY nos secrets para criptografar as chaves em repouso.' }); setKey('')
      } else if (kind === 'test') { await studioKeys({ action: 'test', provider }); toast.success('Conexão funcionando') }
      else { await studioKeys({ action: 'delete', provider }); toast.success('Chave removida') }
      refresh()
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(null) }
  }

  return (
    <section className={cn('card overflow-hidden transition', ok && 'ring-1 ring-emerald-200')} data-tour={provider === 'openai' ? 'studio-openai' : undefined}>
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-5 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl font-display text-sm font-bold text-white" style={{ background: meta.color }}>{meta.name.slice(0, 2)}</span>
        <div className="min-w-0 flex-1"><h3 className="font-display text-base font-semibold tracking-tight">{meta.name}</h3><p className="text-xs text-zinc-500">{meta.hint}</p></div>
        <span className={cn('chip px-3 py-1 text-xs', ok ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500')}>
          <span className={cn('h-2 w-2 rounded-full', ok ? 'bg-emerald-500' : 'bg-zinc-400')} />{ok ? `API disponível · ••••${status!.last4 ?? ''}` : 'API não disponível'}
        </span>
      </header>

      {isAdmin && (
        <div className="space-y-3 border-b border-zinc-100 bg-zinc-50/60 px-5 py-4">
          {provider === 'custom' && <input className="input h-10" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="URL base (ex.: https://meu-servidor.com/v1)" />}
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[240px] flex-1">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} className="input h-10 pl-9 pr-10 font-mono text-xs" value={key} onChange={(e) => setKey(e.target.value)} placeholder={ok ? 'Colar uma nova chave para substituir…' : 'Colar a chave de API…'} />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-ink" aria-label="Mostrar chave">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
            <button className="btn-brand h-10" onClick={() => run('save')} disabled={busy !== null || key.trim().length < 8}>{busy === 'save' ? <Spinner className="h-4 w-4 text-white" /> : <PlugZap className="h-4 w-4" />}Salvar e conectar</button>
            {ok && <button className="btn-outline h-10" onClick={() => run('test')} disabled={busy !== null}>{busy === 'test' ? <Spinner className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}Testar</button>}
            {ok && <button className="btn-ghost h-10 hover:text-brand" onClick={() => run('del')} disabled={busy !== null} aria-label="Remover chave"><Trash2 className="h-4 w-4" /></button>}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-zinc-500">
            {status && <span>Atualizada {fromNow(status.updated_at)}</span>}
            {meta.keyUrl && <a href={meta.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-ink hover:text-brand">Onde gerar a chave <ExternalLink className="h-3 w-3" /></a>}
          </p>
        </div>
      )}

      <ul className="divide-y divide-zinc-100">
        {models.map((m) => <ModelRow key={m.id} m={m} ok={ok} isAdmin={isAdmin} isDefault={defaultModel === m.id} />)}
      </ul>
    </section>
  )
}

const CAPS: [keyof StudioModel['capabilities'], string][] = [['text', 'Texto na arte'], ['refs', 'Referências'], ['edit', 'Edição'], ['mask', 'Máscara']]

function ModelRow({ m, ok, isAdmin, isDefault }: { m: StudioModel; ok: boolean; isAdmin: boolean; isDefault: boolean }) {
  const qc = useQueryClient()
  const [api, setApi] = useState(m.api_model)
  const refresh = () => qc.invalidateQueries({ queryKey: ['studio'] })
  const patch = async (p: Partial<StudioModel>) => { const { error } = await supabase.from('studio_models').update(p).eq('id', m.id); if (error) return toast.error(errMsg(error)); refresh() }
  const makeDefault = async () => { const { error } = await supabase.from('studio_settings').update({ default_model: m.id }).eq('id', 1); if (error) return toast.error(errMsg(error)); toast.success(`${m.name} agora é o modelo padrão`); refresh() }
  return (
    <li className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5', !m.enabled && 'opacity-50')}>
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', ok ? 'bg-emerald-500' : 'bg-zinc-300')} title={ok ? 'API disponível' : 'API não disponível'} />
      <div className="min-w-[200px] flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold">{m.name}{isDefault && <span className="chip bg-brand text-white"><Star className="h-3 w-3 fill-current" />Padrão</span>}</p>
        <p className="text-xs text-zinc-500">{m.description}</p>
        {(() => { const c = imageCost(m.api_model, 'high'); return c ? <p className="mt-1 text-[11px] text-zinc-500">≈ <b className="text-ink">{fmtBrl(c.total, getRate())}</b> por imagem em qualidade alta com referências <span className="text-zinc-400">(só saída: {fmtBrl(c.out, getRate())})</span></p> : null })()}
        <div className="mt-1.5 flex flex-wrap gap-1">{CAPS.map(([k, label]) => <span key={k} className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium', m.capabilities[k] ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-400 line-through')}>{m.capabilities[k] && <Check className="h-2.5 w-2.5" />}{label}</span>)}</div>
      </div>
      <label className="flex w-full items-center gap-2 text-xs text-zinc-500 sm:w-auto" title="Nome do modelo na API do provedor — edite se ele mudar">
        <Zap className="h-3.5 w-3.5" />
        <input value={api} disabled={!isAdmin} onChange={(e) => setApi(e.target.value)} onBlur={() => api.trim() && api !== m.api_model && patch({ api_model: api.trim() })} className="input h-8 w-full font-mono text-[11px] sm:w-72" aria-label={`ID na API de ${m.name}`} />
      </label>
      {isAdmin && (
        <div className="flex items-center gap-3">
          {!isDefault && ok && m.enabled && <button className="btn-ghost btn-sm" onClick={makeDefault}><Star className="h-3.5 w-3.5" />Tornar padrão</button>}
          <Toggle checked={m.enabled} onChange={(v) => patch({ enabled: v })} />
        </div>
      )}
    </li>
  )
}
