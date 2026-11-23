import { useCallback, useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BookOpen, BrainCircuit, Check, ChevronDown, CheckSquare, Copy, Save, Shapes, Star, Trash2, UploadCloud, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, errMsg, fmtBytes } from '@/lib/utils'
import { ConfirmDialog, Modal, Skeleton, Spinner } from '@/components/ui'
import { deleteAssets, saveSettings, uploadAssets, useAssets, useStudioSettings, type UploadState } from '@/features/studio/data'
import { StudioImg } from '@/features/studio/ui'
import type { Brand, StudioAsset } from '@/features/studio/types'
import { BRANDING_SKILL, LOGO_SKILL } from '../../../supabase/functions/_shared/logo-skill'
import { saveLogoNotes, trainLogos } from './data'

const MAX_LOGOS = 100

/** Logos de referência de uma pasta (agência ou empresa): envio em lote, favoritas pesam mais */
function LogoRefs({ brand }: { brand: Brand }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { data: refs, isLoading } = useAssets(brand.id, 'logo_ref')
  const [uploads, setUploads] = useState<UploadState[]>([])
  const [drag, setDrag] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [view, setView] = useState<StudioAsset | null>(null)
  const [confirm, setConfirm] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const busy = uploads.some((u) => u.status === 'queued' || u.status === 'uploading')
  const refresh = () => { qc.invalidateQueries({ queryKey: ['studio', 'assets'] }); qc.invalidateQueries({ queryKey: ['studio', 'usage'] }) }

  const start = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return toast.error('Selecione arquivos de imagem.')
    const created = await uploadAssets(brand.id, imgs, 'logo_ref', profile!.id, { bytesLeft: 1e9, refsLeft: MAX_LOGOS - (refs?.length ?? 0) }, setUploads)
    refresh()
    if (created.length) toast.success(`${created.length} logo(s) enviada(s)`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.id, profile, refs?.length])

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); start(Array.from(e.dataTransfer.files)) }
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const fav = async (a: StudioAsset) => { await supabase.from('studio_assets').update({ favorite: !a.favorite }).eq('id', a.id); refresh() }
  const remove = async (list: StudioAsset[]) => { try { await deleteAssets(list); setSel(new Set()); setView(null); refresh(); toast.success('Removido') } catch (e) { toast.error(errMsg(e)) } setConfirm(false) }
  const total = refs?.length ?? 0

  return (
    <div onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true) } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false) }} onDrop={onDrop}>
      <button type="button" onClick={() => input.current?.click()} disabled={busy} data-testid="logo-ref-drop"
        className={cn('group flex w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-9 text-center transition', drag ? 'border-brand bg-brand-soft/60' : 'border-zinc-300 bg-white/60 hover:border-ink hover:bg-white')}>
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-white shadow-card transition group-hover:scale-105"><UploadCloud className="h-6 w-6" /></span>
        <p className="font-display text-base font-semibold tracking-tight">Arraste as logos de referência ou clique para escolher</p>
        <p className="mt-1 max-w-lg text-sm text-zinc-500">Logos que você admira e quer como nível de qualidade: pode subir até {MAX_LOGOS}. JPG, PNG, WEBP ou SVG · até 25 MB cada.</p>
      </button>
      <input ref={input} type="file" accept="image/*" multiple hidden data-testid="logo-ref-input" onChange={(e) => { if (e.target.files) start(Array.from(e.target.files)); e.target.value = '' }} />

      {uploads.length > 0 && (
        <div className="card mt-4 p-3 text-sm">
          <div className="flex items-center justify-between"><b>{busy ? 'Enviando…' : `Envio finalizado · ${uploads.filter((u) => u.status === 'done').length} ok`}</b>{!busy && <button className="btn-ghost btn-sm" onClick={() => setUploads([])}><X className="h-3.5 w-3.5" />Fechar</button>}</div>
          {uploads.filter((u) => u.status === 'error').map((u) => <p key={u.id} className="mt-1 text-xs text-brand"><b>{u.name}</b>: {u.error}</p>)}
        </div>
      )}

      {sel.size > 0 && (
        <div className="sticky top-2 z-20 mt-4 flex animate-scale-in flex-wrap items-center gap-3 rounded-2xl bg-ink px-4 py-2.5 text-sm text-white shadow-pop">
          <CheckSquare className="h-4 w-4 text-brand" /><b>{sel.size}</b> selecionada(s)
          <button className="btn-ghost ml-auto h-8 text-white hover:bg-white/10 hover:text-white" onClick={() => setSel(new Set())}>Limpar</button>
          <button className="btn h-8 bg-brand text-white hover:bg-brand-dark" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Excluir</button>
        </div>
      )}

      <div className="mt-4">
        {isLoading ? <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="aspect-square" />)}</div>
          : !total ? <p className="py-4 text-center text-sm text-zinc-500">Nenhuma logo ainda. Quanto mais exemplos de qualidade, mais fiel fica o padrão da IA.</p> : (
            <>
              <p className="mb-2 text-sm text-zinc-500"><b className="text-ink">{total} {total === 1 ? 'logo' : 'logos'}</b> contam para o treino. Favoritas (estrela) são enviadas primeiro ao gerador.</p>
              <div className="stagger grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7" data-testid="logo-refs">
                {refs!.map((a) => (
                  <div key={a.id} className={cn('group relative overflow-hidden rounded-2xl bg-white shadow-card ring-2 transition', sel.has(a.id) ? 'ring-brand' : 'ring-transparent hover:ring-zinc-300')}>
                    <button type="button" className="block w-full" onClick={() => setView(a)}><StudioImg path={a.thumb_path ?? a.storage_path} fit="contain" className="aspect-square bg-white" /></button>
                    <button type="button" aria-label="Selecionar" onClick={() => toggle(a.id)} className={cn('absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border-2 transition', sel.has(a.id) ? 'border-brand bg-brand text-white' : 'border-zinc-300 bg-white/80 text-transparent opacity-0 group-hover:opacity-100')}><Check className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Favoritar" onClick={() => fav(a)} className={cn('absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full transition', a.favorite ? 'bg-amber-400 text-white opacity-100' : 'bg-black/30 text-white opacity-0 group-hover:opacity-100')}><Star className={cn('h-3.5 w-3.5', a.favorite && 'fill-current')} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
      </div>

      {view && (
        <Modal open onClose={() => setView(null)} size="lg" title={view.name} subtitle={`${view.width ?? '?'}×${view.height ?? '?'} · ${fmtBytes(view.size_bytes)}`}
          footer={<button className="btn-danger mr-auto" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Excluir</button>}>
          <StudioImg path={view.storage_path} fit="contain" className="mx-auto max-h-[60vh] min-h-[260px] rounded-2xl bg-white" />
        </Modal>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => remove(view && sel.size === 0 ? [view] : (refs ?? []).filter((a) => sel.has(a.id)))} danger title="Excluir logos" message="As logos serão apagadas. Para a IA esquecer o estilo delas, treine novamente depois." confirmLabel="Excluir" />
    </div>
  )
}

function SkillView({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold" aria-expanded={open}>
        <BookOpen className="h-4 w-4 text-zinc-500" />{title}<span className="ml-1 text-xs font-normal text-zinc-500">· {Math.round(text.length / 1000)} mil caracteres</span>
        <ChevronDown className={cn('ml-auto h-4 w-4 text-zinc-400 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-zinc-100 p-4">
          <div className="mb-2 flex justify-end"><button type="button" className="btn-outline btn-sm" onClick={() => { navigator.clipboard?.writeText(text); toast.success('Copiado') }}><Copy className="h-3.5 w-3.5" />Copiar</button></div>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 text-xs leading-relaxed text-zinc-700" data-testid="skill-text">{text}</pre>
        </div>
      )}
    </div>
  )
}

/** Treinamento de logos: sobe as referências, clica em Treinar e a IA aprende o padrão (da agência ou da empresa) */
export default function Training({ brand, base, onTrained }: { brand: Brand; base: Brand | undefined; onTrained: () => void }) {
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const { data: refs } = useAssets(brand.id, 'logo_ref')
  const { data: settings } = useStudioSettings()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ version: number; refs: number; demo: boolean; analysis: Brand['logo_analysis'] } | null>(null)
  const [notes, setNotes] = useState(brand.logo_notes ?? '')
  const agent = (settings?.agent_notes ?? {}) as { logo_rules?: string; branding_rules?: string }
  const [logoRules, setLogoRules] = useState(agent.logo_rules ?? '')
  const [brandRules, setBrandRules] = useState(agent.branding_rules ?? '')
  const total = refs?.length ?? 0
  const newer = Math.max(0, total - (brand.logo_trained_refs ?? 0))
  const trained = (brand.logo_skill_version ?? 0) > 0

  const train = async () => {
    setBusy(true)
    try {
      const r = await trainLogos(brand.id, true)
      setResult({ version: r.version, refs: r.refs, demo: !!r.demo, analysis: r.analysis })
      qc.invalidateQueries({ queryKey: ['studio', 'brands'] }); qc.invalidateQueries({ queryKey: ['studio', 'brand', brand.id] })
      toast.success(`Treino v${r.version} concluído`)
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }
  const saveNotes = async () => { try { await saveLogoNotes(brand.id, notes); qc.invalidateQueries({ queryKey: ['studio', 'brands'] }); toast.success('Regras da empresa salvas. Treine de novo para aplicar.') } catch (e) { toast.error(errMsg(e)) } }
  const saveRules = async () => { try { await saveSettings({ agent_notes: { ...(settings?.agent_notes ?? {}), logo_rules: logoRules.trim(), branding_rules: brandRules.trim() } }, qc); toast.success('Regras da agência salvas (valem já na próxima criação).') } catch (e) { toast.error(errMsg(e)) } }
  const a = result?.analysis ?? brand.logo_analysis

  return (
    <div className="space-y-5" data-testid="logo-training">
      <section className="card p-5 sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100"><Shapes className="h-4 w-4" /></span>
          <div>
            <h3 className="font-display text-[15px] font-semibold tracking-tight">{brand.is_base ? 'Logos de referência da agência' : `Logos de referência · ${brand.name}`}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">{brand.is_base ? 'Valem para TODAS as empresas: é o gosto e o nível de acabamento da Forte Company.' : `Valem só para ${brand.name} (somam ao padrão da agência${base?.logo_skill_version ? `, treinado na v${base.logo_skill_version}` : ''}).`}</p>
          </div>
        </div>
        <LogoRefs brand={brand} />
      </section>

      <section className="card p-6 text-center">
        <span className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink text-white shadow-card"><BrainCircuit className="h-8 w-8" />{busy && <span className="absolute inset-0 animate-pulse-ring rounded-2xl" />}</span>
        <h2 className="font-display text-xl font-bold tracking-tight">{trained ? `Treinado · v${brand.logo_skill_version}` : 'Treinar o criador de logos'}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-500">
          A IA de visão estuda as {total || 'suas'} logos, descobre o que as torna boas (construção, tipografia, cor, acabamento) e grava isso como padrão. Nas próximas criações ela segue esse nível e nunca copia as formas.
        </p>
        {trained && newer > 0 && <p className="mx-auto mt-3 max-w-md rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{newer} logo(s) nova(s) desde o último treino. Treine de novo para incluir.</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button className="btn-brand h-11 px-6" onClick={train} disabled={busy || !total} data-testid="logo-train">{busy ? <><Spinner className="h-4 w-4 text-white" />Analisando as logos…</> : <><BrainCircuit className="h-4 w-4" />{trained ? 'Treinar de novo' : 'Treinar agora'}</>}</button>
          {trained && <button className="btn-outline h-11" onClick={onTrained} data-testid="logo-open-studio">Abrir o estúdio de logos</button>}
        </div>
        {!total && <p className="mt-3 text-xs text-zinc-500">Envie ao menos uma logo para treinar. Sem treino o estúdio também funciona, usando só a skill embutida.</p>}
        {result?.demo && <p className="mx-auto mt-3 max-w-md rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900"><b>Análise simulada.</b> Sem chave real da OpenAI, a IA de visão não leu as suas logos. Conecte a chave em Modelos e APIs e treine de novo.</p>}
        {result && !result.demo && (
          <div className="mx-auto mt-5 max-w-lg rounded-2xl bg-emerald-50 p-4 text-left text-sm text-emerald-900" data-testid="logo-train-done">
            <p className="font-semibold"><Check className="mr-1 inline h-4 w-4" />Treino v{result.version} concluído com {result.refs} logo(s).</p>
            <button className="btn-brand mt-3 h-10" onClick={onTrained}>Abrir o estúdio de logos →</button>
          </div>
        )}
      </section>

      {a && (
        <section className="card p-5 sm:p-6" data-testid="logo-analysis">
          <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">O que a IA aprendeu com as suas logos</h3>
          {a.summary && <p className="mb-4 text-sm text-zinc-700">{a.summary}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            {([['Linguagem dos símbolos', a.symbol_language], ['Tipografia', a.typography], ['Composição', a.composition], ['Uso de cor', a.color_usage], ['Acabamento', a.craft], ['Padrão de qualidade', a.quality_bar]] as const).filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><p className="label">{k}</p><p className="text-sm text-zinc-700">{v}</p></div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {a.do?.length ? <div><p className="label">Sempre</p><ul className="space-y-1">{a.do.map((x) => <li key={x} className="rounded-xl bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900">{x}</li>)}</ul></div> : null}
            {a.dont?.length ? <div><p className="label">Nunca</p><ul className="space-y-1">{a.dont.map((x) => <li key={x} className="rounded-xl bg-brand-soft px-3 py-1.5 text-sm text-red-900">{x}</li>)}</ul></div> : null}
          </div>
        </section>
      )}

      <section className="card space-y-4 p-5 sm:p-6">
        <div>
          <h3 className="font-display text-[15px] font-semibold tracking-tight">Skills do criador de logos</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Duas skills trabalham juntas e já vêm prontas: o designer de logos cria a marca e o diretor de branding aplica a logo aprovada em situações reais. Você pode somar regras suas.</p>
        </div>
        <SkillView title="Skill 1 · Designer de logos profissional" text={LOGO_SKILL} />
        <SkillView title="Skill 2 · Diretor de branding e mockups" text={BRANDING_SKILL} />
        {brand.logo_skill_doc && <SkillView title={`Documento treinado · ${brand.is_base ? 'agência' : brand.name} v${brand.logo_skill_version}`} text={brand.logo_skill_doc} />}
        {!brand.is_base && (
          <div>
            <p className="label">Regras extras só desta empresa</p>
            <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: o dono odeia degradê; sempre usar cantos arredondados; evitar tons de vermelho." data-testid="logo-notes" />
            <button className="btn-outline btn-sm mt-2" onClick={saveNotes}><Save className="h-3.5 w-3.5" />Salvar regras da empresa</button>
          </div>
        )}
        {isAdmin && (
          <div className="grid gap-4 md:grid-cols-2">
            <div><p className="label">Regras extras da agência para criar logos</p><textarea className="input" rows={4} value={logoRules} onChange={(e) => setLogoRules(e.target.value)} placeholder="Ex.: nunca usar mais de 2 cores; priorizar tipografia própria." data-testid="logo-rules" /></div>
            <div><p className="label">Regras extras da agência para o branding</p><textarea className="input" rows={4} value={brandRules} onChange={(e) => setBrandRules(e.target.value)} placeholder="Ex.: sempre incluir uma cena de fachada e uma de uniforme." /></div>
            <div className="md:col-span-2"><button className="btn-outline btn-sm" onClick={saveRules}><Save className="h-3.5 w-3.5" />Salvar regras da agência</button></div>
          </div>
        )}
      </section>
    </div>
  )
}
