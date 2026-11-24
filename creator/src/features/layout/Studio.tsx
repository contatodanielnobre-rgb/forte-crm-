import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Check, ChevronDown, Download, FileText, Film, Globe, Image as ImageIcon, Layers, Mic, Pencil, Plus, RefreshCcw, Sparkles, Star, Trash2, Upload, Wand2, X } from 'lucide-react'
import { cn, errMsg } from '@/lib/utils'
import { ConfirmDialog, Modal, Skeleton, Spinner } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { COST_ASSUMPTIONS, fmtBrl, getRate, imageCost } from '@/features/studio/catalog'
import { MicButton, appendDictated } from '@/features/studio/Dictation'
import FontPicker from '@/features/studio/FontPicker'
import { supabase } from '@/lib/supabase'
import { useModels, useStudioSettings } from '@/features/studio/data'
import { StudioImg } from '@/features/studio/ui'
import type { Brand } from '@/features/studio/types'
import { GOAL_LABEL, emptyLayoutForm } from '../../../supabase/functions/_shared/layout'
import { LAYOUT_CATEGORIES, LAYOUT_STYLES } from '../../../supabase/functions/_shared/layout-skill'
import { activeRuns, analyzeLayout, createLayoutProject, deleteLayoutProject, downloadAllZip, downloadPageImage, downloadSection, generateRows, invalidateLayout, planLayout, refineSection, retrySection, saveConcept, toggleApprove, toggleFavoriteSection, useLayoutProjects, useLayoutSections, selectVersion, type NewInput } from './data'
import { ACCEPT_SITE, isSiteFile } from './slice'
import type { InputRole, LayoutForm, LayoutProject, LayoutSection, LayoutSectionPlan, LayoutUrl } from './types'

const QUALITIES = [{ id: 'low', label: 'Rascunho' }, { id: 'medium', label: 'Normal' }, { id: 'high', label: 'Alta' }]
const PAGES: [string, string][] = [['home', 'Home'], ['sobre', 'Sobre'], ['servicos', 'Serviços'], ['produtos', 'Produtos'], ['precos', 'Planos e preços'], ['contato', 'Contato'], ['blog', 'Blog'], ['faq', 'Perguntas frequentes']]
const IN_ROLES: { id: InputRole; label: string }[] = [{ id: 'current', label: 'Meu site atual' }, { id: 'competitor', label: 'Concorrente (fazer diferente)' }, { id: 'inspiration', label: 'Inspiração' }]
const catShort = (id: string) => LAYOUT_CATEGORIES.find((c) => c.id === id)?.label.split(' (')[0].split(' / ')[0] ?? id
const STATUS_LABEL: Record<LayoutProject['status'], string> = { draft: 'Rascunho', analyzing: 'Lendo o site', planned: 'Plano pronto', generating: 'Gerando', ready: 'Layout pronto', approved: 'Aprovado' }

interface FileItem { id: string; file: File; role: InputRole; note: string }
const fileIcon = (f: File) => (f.type === 'application/pdf' ? <FileText className="h-4 w-4" /> : /^video\//.test(f.type) ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />)

const Sel = ({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string }) => (
  <label className="block"><span className="mb-1 block text-[11px] font-semibold text-zinc-600">{label}</span><select className="input h-9 text-xs" value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
)
const Chip = ({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) => (
  <button type="button" onClick={onClick} aria-pressed={on} title={title} className={cn('rounded-xl border px-3 py-2 text-left text-xs font-medium transition', on ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400')}>{on && <Check className="mr-1 inline h-3 w-3" />}{children}</button>
)

// ---------------------------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------------------------
function NewLayoutForm({ brand, trained, onCreated }: { brand: Brand; trained: boolean; onCreated: (p: LayoutProject) => void }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { data: models } = useModels()
  const { data: settings } = useStudioSettings()
  const [form, setForm] = useState<LayoutForm>(emptyLayoutForm())
  const [files, setFiles] = useState<FileItem[]>([])
  const [modelId, setModelId] = useState('')
  const [quality, setQuality] = useState('medium')
  const [step, setStep] = useState<{ text: string; pct: number } | null>(null)
  const [drag, setDrag] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const set = (p: Partial<LayoutForm>) => setForm((f) => ({ ...f, ...p }))
  const imgModels = (models ?? []).filter((m) => m.enabled && m.capabilities?.refs)
  useEffect(() => { if (!modelId) setModelId(imgModels.find((m) => m.id === settings?.default_model)?.id ?? imgModels[0]?.id ?? '') }, [imgModels, settings, modelId])
  const model = imgModels.find((m) => m.id === modelId)
  const unit = model ? (imageCost(model.api_model, quality, COST_ASSUMPTIONS, true)?.total ?? null) : null

  const addFiles = (list: File[]) => {
    const ok = list.filter(isSiteFile); if (!ok.length) return toast.error('Envie prints (PNG, JPG, WEBP), PDF ou vídeo (WEBM, MP4).')
    setFiles((cur) => [...cur, ...ok.map((file) => ({ id: crypto.randomUUID(), file, role: 'current' as InputRole, note: '' }))].slice(0, 8))
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); addFiles(Array.from(e.dataTransfer.files)) }
  const toggleCat = (id: string) => set({ categories: form.categories.includes(id) ? form.categories.filter((x) => x !== id) : [...form.categories, id].slice(-2) })
  const toggleStyle = (id: string) => set({ style_ids: form.style_ids.includes(id) ? form.style_ids.filter((x) => x !== id) : [...form.style_ids, id].slice(-2) })
  const togglePage = (id: string) => set({ pages: form.pages.includes(id) ? form.pages.filter((x) => x !== id) : [...form.pages, id].slice(0, 6) })
  const addUrl = () => { const u = urlDraft.trim(); if (!u) return; set({ urls: [...form.urls, { url: u, role: (files.length || form.urls.some((x) => x.role === 'current') ? 'inspiration' : 'current') as LayoutUrl['role'] }].slice(0, 6) }); setUrlDraft('') }
  const valid = form.business.trim().length >= 2

  const submit = async () => {
    if (!profile) return
    if (!valid) return toast.error('Informe o nome do negócio.')
    if (!model) return toast.error('Ative um modelo de imagem em Modelos e APIs.')
    setStep({ text: 'Preparando os arquivos…', pct: 3 })
    try {
      const f: LayoutForm = { ...form, business: form.business.trim(), about: form.about.trim(), notes: form.notes.trim() }
      const p = await createLayoutProject({ brandId: brand.id, userId: profile.id, form: f, inputs: files.map((x): NewInput => ({ file: x.file, role: x.role, note: x.note.trim() || undefined })), modelId, quality, onStep: (text, pct) => setStep({ text, pct: Math.max(3, Math.round(pct * 0.3)) }) })
      invalidateLayout(qc, 'projects')
      const hasCurrent = files.some((x) => x.role === 'current') || f.urls.some((u) => u.role === 'current')
      if (hasCurrent) { setStep({ text: 'A IA está lendo o seu site atual (textos, seções, problemas)…', pct: 40 }); try { await analyzeLayout(p, qc) } catch (e) { toast.error(`Não consegui ler o site atual: ${errMsg(e)}. Sigo sem a leitura.`) } }
      setStep({ text: 'A IA está montando o plano: sistema de design, páginas e seções…', pct: 65 })
      const { data } = await supabase.from('layout_projects').select('*').eq('id', p.id).single()
      const fresh = (data as LayoutProject) ?? p
      await planLayout(fresh, qc)
      invalidateLayout(qc, 'projects')
      const { data: done } = await supabase.from('layout_projects').select('*').eq('id', p.id).single()
      onCreated((done as LayoutProject) ?? fresh)
    } catch (e) { toast.error(errMsg(e)); setStep(null) }
  }

  return (
    <div className="card space-y-6 p-5 sm:p-6" data-testid="layout-form">
      {!trained && <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>O criador ainda não foi treinado com os seus sites. Funciona assim mesmo (com a skill embutida), mas treinar deixa o resultado bem mais parecido com o seu estilo. <b>Abra a aba Treinamento.</b></span></p>}

      <div>
        <p className="label">1 · Sobre o negócio</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Nome do negócio *</span><input className="input" value={form.business} onChange={(e) => set({ business: e.target.value })} placeholder="Ex.: Academia Power Fit" data-testid="layout-business" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Segmento</span><input className="input" value={form.segment} onChange={(e) => set({ segment: e.target.value })} placeholder="Ex.: academia de musculação em Fortaleza" /></label>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-zinc-600">O que a empresa faz, vende e o que a diferencia</span><span className="flex items-center gap-2 text-[11px] text-zinc-500"><Mic className="h-3 w-3" />Pode ditar<MicButton onText={(x) => set({ about: appendDictated(form.about, x) })} vocab={[form.business]} title="Ditar com a voz" /></span></div>
          <textarea className="input" rows={5} value={form.about} onChange={(e) => set({ about: e.target.value })} data-testid="layout-about" placeholder="Ex.: Academia com 12 anos, 3 unidades, aulas de musculação, funcional e spinning, professores formados, planos a partir de R$ 99. Diferencial: avaliação física gratuita e horário até meia-noite." />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Oferta / produto principal</span><input className="input" value={form.offer} onChange={(e) => set({ offer: e.target.value })} placeholder="Ex.: Plano mensal + aula experimental grátis" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Público</span><input className="input" value={form.audience} onChange={(e) => set({ audience: e.target.value })} placeholder="Ex.: adultos de 20 a 45 anos" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Tom de voz</span><input className="input" value={form.tone} onChange={(e) => set({ tone: e.target.value })} placeholder="Ex.: motivador, direto" /></label>
        </div>
      </div>

      <div>
        <p className="label">2 · Tipo de site <span className="font-normal normal-case text-zinc-400">(até 2; vazio = a IA decide pelo negócio)</span></p>
        <div className="flex flex-wrap gap-2" data-testid="layout-cats">{LAYOUT_CATEGORIES.map((c) => <Chip key={c.id} on={form.categories.includes(c.id)} onClick={() => toggleCat(c.id)} title={c.hint}>{c.label.split(' (')[0]}</Chip>)}</div>
        <div className="mt-3 max-w-xs"><Sel label="Objetivo do site" value={form.goal} onChange={(v) => set({ goal: v })} options={Object.entries(GOAL_LABEL)} /></div>
      </div>

      <div>
        <p className="label">3 · Site atual e referências <span className="font-normal normal-case text-zinc-400">(opcional, mas melhora muito)</span></p>
        <div onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true) } }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
          <button type="button" onClick={() => input.current?.click()} data-testid="layout-input-drop" className={cn('flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-5 text-sm transition', drag ? 'border-brand bg-brand-soft/60' : 'border-zinc-300 bg-white/60 hover:border-ink')}>
            <Upload className="h-5 w-5" /><span><b>Suba o print, o PDF ou o vídeo do seu site</b> <span className="text-zinc-500">(PNG, JPG, WEBP, PDF, WEBM, MP4 · até 8 arquivos; prints compridos são cortados sozinhos)</span></span>
          </button>
          <input ref={input} type="file" accept={ACCEPT_SITE} multiple hidden data-testid="layout-input-file" onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = '' }} />
        </div>
        {files.length > 0 && (
          <ul className="mt-3 space-y-2" data-testid="layout-files">
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
                {fileIcon(f.file)}<span className="max-w-[220px] truncate font-medium">{f.file.name}</span>
                <select className="input h-8 w-auto text-xs" value={f.role} onChange={(e) => setFiles((c) => c.map((x) => (x.id === f.id ? { ...x, role: e.target.value as InputRole } : x)))} aria-label="Tipo">{IN_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
                <input className="input h-8 min-w-[160px] flex-1 text-xs" value={f.note} onChange={(e) => setFiles((c) => c.map((x) => (x.id === f.id ? { ...x, note: e.target.value } : x)))} placeholder="Nota (ex.: página inicial; gostei do hero)" />
                <button type="button" aria-label="Remover" onClick={() => setFiles((c) => c.filter((x) => x.id !== f.id))} className="text-zinc-400 hover:text-brand"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <span className="mb-1 block text-xs font-semibold text-zinc-600">Links (a IA lê o texto das páginas)</span>
          <div className="flex gap-2"><input className="input" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl() } }} placeholder="https://site-do-cliente.com.br" data-testid="layout-url" /><button type="button" className="btn-outline shrink-0" onClick={addUrl}><Plus className="h-4 w-4" />Adicionar</button></div>
          {form.urls.length > 0 && <ul className="mt-2 space-y-1.5">{form.urls.map((u, i) => (
            <li key={u.url + i} className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs"><Globe className="h-3.5 w-3.5 text-zinc-400" /><span className="min-w-0 flex-1 truncate">{u.url}</span>
              <select className="input h-8 w-auto text-xs" value={u.role} onChange={(e) => set({ urls: form.urls.map((x, j) => (j === i ? { ...x, role: e.target.value as LayoutUrl['role'] } : x)) })}>{IN_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
              <button type="button" aria-label="Remover" onClick={() => set({ urls: form.urls.filter((_, j) => j !== i) })} className="text-zinc-400 hover:text-brand"><X className="h-4 w-4" /></button></li>))}</ul>}
        </div>
      </div>

      <div>
        <p className="label">4 · Estilo <span className="font-normal normal-case text-zinc-400">(tudo opcional: em branco a IA decide pela categoria, pelo negócio e pelas suas referências)</span></p>
        <div className="flex flex-wrap gap-2" data-testid="layout-styles">{LAYOUT_STYLES.map((s) => <Chip key={s.id} on={form.style_ids.includes(s.id)} onClick={() => toggleStyle(s.id)} title={s.look}>{s.label}</Chip>)}</div>
        <textarea className="input mt-3" rows={2} value={form.style_notes} onChange={(e) => set({ style_notes: e.target.value })} placeholder="Ex.: bem moderno, estilo iPhone, fontes Inter com degradê nos títulos, botões com brilho, banners grandes." data-testid="layout-style-notes" />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Sel label="Cores" value={form.palette_mode} onChange={(v) => set({ palette_mode: v as LayoutForm['palette_mode'] })} options={[['auto', 'A IA escolhe pela marca e segmento'], ['keep', 'Manter as cores do site atual'], ['custom', 'Usar as minhas cores']]} />
          <div><span className="mb-1 block text-[11px] font-semibold text-zinc-600">Fonte dos títulos</span><FontPicker value={form.font_heading ? [form.font_heading] : []} max={1} placeholder="Automática" onChange={(v) => set({ font_heading: v[v.length - 1] ?? '' })} /></div>
          <div><span className="mb-1 block text-[11px] font-semibold text-zinc-600">Fonte do texto</span><FontPicker value={form.font_body ? [form.font_body] : []} max={1} placeholder="Automática" onChange={(v) => set({ font_body: v[v.length - 1] ?? '' })} /></div>
        </div>
        {form.palette_mode === 'custom' && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-zinc-600">Suas cores (até 5)</span>
            {form.palette.map((c, i) => <label key={i} className="relative inline-flex h-8 w-8 cursor-pointer overflow-hidden rounded-lg ring-1 ring-black/10" style={{ background: c }}><input type="color" value={c.toLowerCase()} onChange={(e) => set({ palette: form.palette.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)) })} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`Cor ${i + 1}`} /></label>)}
            {form.palette.length < 5 && <button type="button" className="btn-outline btn-sm" onClick={() => set({ palette: [...form.palette, '#D91E3A'] })}><Plus className="h-3.5 w-3.5" />Cor</button>}
            {form.palette.length > 0 && <button type="button" className="text-zinc-400 hover:text-brand" onClick={() => set({ palette: form.palette.slice(0, -1) })} aria-label="Remover última cor"><X className="h-4 w-4" /></button>}
          </div>
        )}
      </div>

      <div>
        <p className="label">5 · Páginas e seções</p>
        <div className="flex flex-wrap gap-2">{PAGES.map(([id, l]) => <Chip key={id} on={form.pages.includes(id)} onClick={() => togglePage(id)}>{l}</Chip>)}</div>
        <textarea className="input mt-3" rows={2} value={form.sections_wanted} onChange={(e) => set({ sections_wanted: e.target.value })} placeholder="Seções que você quer (opcional). Ex.: hero com vídeo, planos, depoimentos, FAQ, mapa com as 3 unidades." />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Sel label="Formato" value={form.format} onChange={(v) => set({ format: v as LayoutForm['format'] })} options={[['desktop', 'Desktop (computador, 16:9)'], ['mobile', 'Mobile (celular em pé, 9:16)']]} />
          <Sel label="Textos" value={form.copy_mode} onChange={(v) => set({ copy_mode: v as LayoutForm['copy_mode'] })} options={[['auto', 'Reescrever com foco em conversão'], ['keep', 'Reaproveitar os textos do site atual']]} />
          <Sel label="Mascote" value={form.mascot} onChange={(v) => set({ mascot: v })} options={[['auto', 'A IA decide se combina'], ['yes', 'Criar um mascote'], ['no', 'Sem mascote']]} />
        </div>
        {form.mascot === 'yes' && <input className="input mt-3" value={form.mascot_desc} onChange={(e) => set({ mascot_desc: e.target.value })} placeholder="Ideia do mascote (opcional). Ex.: um haltere simpático com braços e bigode" />}
      </div>

      <div>
        <p className="label">6 · Ajustes finos <span className="font-normal normal-case text-zinc-400">(opcional)</span></p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Manter do site atual</span><textarea className="input" rows={2} value={form.keep} onChange={(e) => set({ keep: e.target.value })} placeholder="Ex.: o logo, as cores, a seção de planos" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Mudar / melhorar</span><textarea className="input" rows={2} value={form.change} onChange={(e) => set({ change: e.target.value })} placeholder="Ex.: o hero está fraco, o site é escuro demais, falta prova social" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Observações</span><textarea className="input" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Qualquer outra coisa que a IA precisa saber" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Evitar</span><textarea className="input" rows={2} value={form.avoid} onChange={(e) => set({ avoid: e.target.value })} placeholder="Ex.: fotos de banco de imagens, vermelho, texto longo" /></label>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-4">
        <label className="block"><span className="mb-1 block text-[11px] font-semibold text-zinc-600">Modelo de imagem</span>
          <select className="input h-10 w-56 text-sm" value={modelId} onChange={(e) => setModelId(e.target.value)} data-testid="layout-model">{imgModels.length ? imgModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>) : <option value="">Nenhum modelo ativo</option>}</select></label>
        <div><span className="mb-1 block text-[11px] font-semibold text-zinc-600">Qualidade</span><div className="flex gap-1">{QUALITIES.map((q) => <button key={q.id} type="button" onClick={() => setQuality(q.id)} aria-pressed={quality === q.id} className={cn('h-10 rounded-xl border px-3 text-xs font-medium transition', quality === q.id ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white hover:border-zinc-400')}>{q.label}</button>)}</div></div>
        <button className="btn-brand ml-auto h-11 px-6" onClick={submit} disabled={!!step || !valid} data-testid="layout-submit">{step ? <><Spinner className="h-4 w-4 text-white" />Trabalhando…</> : <><Sparkles className="h-4 w-4" />Ler o site e montar o plano</>}</button>
      </div>
      {unit && <p className="text-[11px] text-zinc-500">Cada imagem custa cerca de <b>US$ {unit.toFixed(3)}</b> (≈ {fmtBrl(unit, getRate())}). Um site de 10 seções + guia de estilo ≈ <b>US$ {(unit * 11).toFixed(2)}</b>. Montar o plano não gera imagem: só texto (centavos).</p>}
      {step && <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="h-2 overflow-hidden rounded-full bg-zinc-200"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-all" style={{ width: `${step.pct}%` }} /></div><p className="mt-2 text-xs text-zinc-600" data-testid="layout-step">{step.text}</p></div>}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Editor de uma seção (copy e direção)
// ---------------------------------------------------------------------------------------------
function ConceptModal({ row, onClose, onSaved }: { row: LayoutSection; onClose: () => void; onSaved: () => void }) {
  const c = row.concept as LayoutSectionPlan
  const [v, setV] = useState<LayoutSectionPlan>({ ...c, copy: { ...c.copy, items: c.copy?.items ?? [] }, components: c.components ?? [] })
  const [busy, setBusy] = useState(false)
  const setCopy = (p: Partial<LayoutSectionPlan['copy']>) => setV((x) => ({ ...x, copy: { ...x.copy, ...p } }))
  const save = async () => { setBusy(true); try { await saveConcept(row, v); toast.success('Seção salva. Gere de novo para aplicar.'); onSaved(); onClose() } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) } }
  const T = ({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (s: string) => void; rows?: number }) => <label className="block"><span className="mb-1 block text-[11px] font-semibold text-zinc-600">{label}</span>{rows > 1 ? <textarea className="input text-sm" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} /> : <input className="input h-9 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />}</label>
  return (
    <Modal open onClose={onClose} size="lg" title={`Editar · ${row.name}`} subtitle="Os textos abaixo são EXATAMENTE o que vai aparecer na imagem." footer={<><button className="btn-outline" onClick={onClose}>Cancelar</button><button className="btn-brand" onClick={save} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}Salvar</button></>}>
      <div className="space-y-3">
        <T label="Nome da seção" value={v.name} onChange={(s) => setV({ ...v, name: s })} rows={1} />
        <T label="Manchete" value={v.copy.headline} onChange={(s) => setCopy({ headline: s })} />
        <T label="Subtítulo" value={v.copy.sub} onChange={(s) => setCopy({ sub: s })} />
        <div className="grid gap-3 sm:grid-cols-2"><T label="Botão principal" value={v.copy.cta} onChange={(s) => setCopy({ cta: s })} rows={1} /><T label="Botão secundário" value={v.copy.cta2} onChange={(s) => setCopy({ cta2: s })} rows={1} /></div>
        <T label="Itens (um por linha: cartões, perguntas, números…)" value={v.copy.items.join('\n')} onChange={(s) => setCopy({ items: s.split('\n').map((x) => x.trim()).filter(Boolean) })} rows={4} />
        <T label="Composição" value={v.layout} onChange={(s) => setV({ ...v, layout: s })} rows={3} />
        <T label="Imagens da seção" value={v.imagery} onChange={(s) => setV({ ...v, imagery: s })} />
        <T label="Direção de arte detalhada" value={v.image_brief} onChange={(s) => setV({ ...v, image_brief: s })} rows={4} />
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------------------------
// Projeto: leitura, plano, galeria
// ---------------------------------------------------------------------------------------------
function Swatches({ list }: { list: { role: string; hex: string; usage: string }[] }) {
  return <div className="flex flex-wrap gap-2">{list.map((p) => <div key={p.role + p.hex} className="w-24" title={p.usage}><span className="block h-10 rounded-lg ring-1 ring-black/10" style={{ background: p.hex }} /><p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{p.role.replace('_', ' ')}</p><p className="font-mono text-[11px]">{p.hex}</p></div>)}</div>
}

function Tile({ row, versions, project, onOpen, onEdit }: { row: LayoutSection; versions: LayoutSection[]; project: LayoutProject; onOpen: (r: LayoutSection) => void; onEdit: (r: LayoutSection) => void }) {
  const qc = useQueryClient()
  const [fb, setFb] = useState('')
  const [open, setOpen] = useState(false)
  const mobile = project.form.format === 'mobile' && row.kind === 'section'
  const busy = row.status === 'queued' || row.status === 'running'
  const act = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); invalidateLayout(qc, 'sections', project.id); if (ok) toast.success(ok) } catch (e) { toast.error(errMsg(e)) } }
  return (
    <div className={cn('card overflow-hidden', row.approved && 'ring-2 ring-emerald-400')} data-testid="layout-tile">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2">
        <b className="min-w-0 flex-1 truncate text-sm">{row.name}</b>
        {versions.length > 1 && <span className="flex gap-1">{versions.map((v) => <button key={v.id} type="button" onClick={() => act(() => selectVersion(v))} className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', v.id === row.id ? 'bg-ink text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')} title="Usar esta versão">v{v.version}</button>)}</span>}
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', row.status === 'done' ? 'bg-emerald-50 text-emerald-700' : row.status === 'error' ? 'bg-brand-soft text-red-700' : busy ? 'bg-amber-50 text-amber-800' : 'bg-zinc-100 text-zinc-500')}>{row.status === 'done' ? 'pronta' : row.status === 'error' ? 'erro' : row.status === 'running' ? 'gerando…' : row.status === 'queued' ? 'na fila' : 'plano'}</span>
      </div>
      <button type="button" className={cn('block w-full', mobile ? 'mx-auto max-w-[260px]' : '')} onClick={() => row.storage_path && onOpen(row)} disabled={!row.storage_path}>
        {row.storage_path ? <StudioImg path={row.storage_path} className={mobile ? 'aspect-[9/16]' : 'aspect-video'} />
          : <div className={cn('flex items-center justify-center bg-zinc-50 text-xs text-zinc-400', mobile ? 'aspect-[9/16]' : 'aspect-video')}>{busy ? <span className="flex flex-col items-center gap-2"><Spinner className="h-5 w-5" />{row.status === 'running' ? 'Desenhando…' : 'Na fila'}</span> : row.status === 'error' ? <span className="max-w-[80%] text-center text-red-600">{row.error}</span> : 'Ainda não gerada'}</div>}
      </button>
      <div className="flex flex-wrap items-center gap-1 px-2 py-2">
        {row.status === 'plan' && <button className="btn-brand btn-sm" onClick={() => act(() => retrySection(project, row, qc))}><Wand2 className="h-3.5 w-3.5" />Gerar</button>}
        {row.status === 'error' && <button className="btn-brand btn-sm" onClick={() => act(() => retrySection(project, row, qc))}><RefreshCcw className="h-3.5 w-3.5" />Tentar de novo</button>}
        {row.status === 'done' && <>
          <button className={cn('btn-sm', row.approved ? 'btn-brand' : 'btn-outline')} onClick={() => act(() => toggleApprove(row))} title="Aprovar"><Check className="h-3.5 w-3.5" />{row.approved ? 'Aprovada' : 'Aprovar'}</button>
          <button className="btn-outline btn-sm" onClick={() => setOpen((v) => !v)}><Pencil className="h-3.5 w-3.5" />Ajustar</button>
          <button className="btn-ghost btn-sm" onClick={() => act(() => toggleFavoriteSection(row))} aria-label="Favoritar"><Star className={cn('h-3.5 w-3.5', row.favorite && 'fill-amber-400 text-amber-400')} /></button>
          <button className="btn-ghost btn-sm" onClick={() => act(() => downloadSection(row))} aria-label="Baixar"><Download className="h-3.5 w-3.5" /></button>
        </>}
        {row.kind === 'section' && <button className="btn-ghost btn-sm ml-auto" onClick={() => onEdit(row)}>Editar textos</button>}
      </div>
      {open && row.status === 'done' && (
        <div className="space-y-2 border-t border-zinc-100 p-3">
          <textarea className="input text-sm" rows={2} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="O que mudar nesta seção? Ex.: botão maior, fundo escuro, trocar a foto por um mockup…" data-testid="layout-feedback" />
          <div className="flex gap-2"><button className="btn-brand btn-sm" disabled={fb.trim().length < 3} onClick={() => { const t = fb.trim(); setFb(''); setOpen(false); act(() => refineSection(project, row, t, qc), 'Nova versão gerada') }}><Wand2 className="h-3.5 w-3.5" />Aplicar ajuste</button><button className="btn-outline btn-sm" onClick={() => act(() => retrySection(project, row, qc), 'Gerada de novo')}><RefreshCcw className="h-3.5 w-3.5" />Gerar de novo</button></div>
        </div>
      )}
    </div>
  )
}

function ProjectView({ project, onClose, onDeleted }: { project: LayoutProject; onClose: () => void; onDeleted: () => void }) {
  const qc = useQueryClient()
  const { data: all } = useLayoutSections(project.id)
  const { data: models } = useModels()
  const [view, setView] = useState<LayoutSection | null>(null)
  const [edit, setEdit] = useState<LayoutSection | null>(null)
  const [fb, setFb] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'delete' | 'replan' | 'regen' | null>(null)
  const rows = useMemo(() => all ?? [], [all])
  const current = rows.filter((r) => r.is_current)
  const byKey = (r: LayoutSection) => `${r.page_key}|${r.section_key}|${r.position}`
  const versionsOf = (r: LayoutSection) => rows.filter((x) => byKey(x) === byKey(r)).sort((a, b) => a.version - b.version)
  const pages = useMemo(() => { const m = new Map<string, { name: string; rows: LayoutSection[] }>(); current.filter((r) => r.kind === 'section').forEach((r) => { const e = m.get(r.page_key) ?? { name: r.page_name, rows: [] }; e.rows.push(r); m.set(r.page_key, e) }); return [...m.entries()] }, [current])
  const plan = project.plan, ds = plan?.design_system, a = project.analysis
  const model = (models ?? []).find((m) => m.id === project.model_id)
  const unit = model ? (imageCost(model.api_model, project.quality, COST_ASSUMPTIONS, true)?.total ?? null) : null
  const stale = !activeRuns.has(project.id) // nada rodando nesta aba: o que ficou "na fila" ou "gerando" foi interrompido
  const pending = current.filter((r) => r.status === 'plan' || r.status === 'error' || (stale && (r.status === 'queued' || r.status === 'running')))
  const generating = !stale && (current.some((r) => r.status === 'queued' || r.status === 'running') || project.status === 'generating')
  const doneCount = current.filter((r) => r.status === 'done').length
  const spent = rows.reduce((s, r) => s + (r.cost_usd ?? 0), 0)
  const go = async (fn: () => Promise<unknown>, key: string, ok?: string) => { setBusy(key); try { await fn(); if (ok) toast.success(ok) } catch (e) { toast.error(errMsg(e)) } finally { setBusy(null); invalidateLayout(qc, 'sections', project.id); invalidateLayout(qc, 'projects') } }
  const generateAll = (all = false) => { void generateRows(project, all || !pending.length ? current : pending, qc); toast.success('Gerando na ordem: guia de estilo, hero e demais seções. O hero aparece assim que ficar pronto.') }
  const replan = async () => { setConfirm(null); await go(async () => { await planLayout(project, qc, { feedback: fb.trim() || undefined }); setFb('') }, 'plan', 'Plano refeito') }

  return (
    <div className="space-y-5" data-testid="layout-project">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-outline btn-sm" onClick={onClose}>← Projetos</button>
        <h3 className="font-display text-lg font-bold tracking-tight">{project.name}</h3>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-600">{STATUS_LABEL[project.status]}</span>
        <span className="text-xs text-zinc-500">{doneCount}/{current.length} imagens · gasto US$ {spent.toFixed(2)}</span>
        <div className="ml-auto flex gap-2">
          {doneCount > 0 && <button className="btn-outline btn-sm" onClick={() => go(() => downloadAllZip(project, rows), 'zip')} disabled={busy === 'zip'}><Download className="h-3.5 w-3.5" />Baixar tudo (ZIP)</button>}
          <button className="btn-ghost btn-sm text-brand" onClick={() => setConfirm('delete')}><Trash2 className="h-3.5 w-3.5" />Excluir</button>
        </div>
      </div>

      {a && (
        <details className="card p-5" data-testid="layout-analysis-card">
          <summary className="cursor-pointer font-display text-[15px] font-semibold tracking-tight">1 · Leitura do site atual <span className="ml-2 text-xs font-normal text-zinc-500">{a.sections.length} seção(ões) lidas · {a.ux_issues.length} problemas de UX/UI</span></summary>
          <div className="mt-3 space-y-3 text-sm text-zinc-700">
            <p>{a.summary}</p>
            <div className="grid gap-4 md:grid-cols-2">
              {a.ux_issues.length > 0 && <div><p className="label">Problemas encontrados</p><ul className="space-y-1">{a.ux_issues.map((x) => <li key={x} className="rounded-xl bg-brand-soft px-3 py-1.5 text-xs text-red-900">{x}</li>)}</ul></div>}
              {a.opportunities.length > 0 && <div><p className="label">Oportunidades do redesign</p><ul className="space-y-1">{a.opportunities.map((x) => <li key={x} className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900">{x}</li>)}</ul></div>}
            </div>
            {a.sections.length > 0 && <div><p className="label">Seções do site atual</p><ol className="list-decimal space-y-0.5 pl-5 text-xs">{a.sections.map((s) => <li key={s.order + s.key}><b>{s.label || s.key}</b>{s.content.headline ? ` — “${s.content.headline}”` : ''}{s.fails ? ` · fraco: ${s.fails}` : ''}</li>)}</ol></div>}
          </div>
        </details>
      )}

      {plan && ds && (
        <section className="card space-y-4 p-5" data-testid="layout-plan-card">
          <div className="flex items-start gap-2"><Layers className="mt-0.5 h-4 w-4 text-zinc-500" /><div><h4 className="font-display text-[15px] font-semibold tracking-tight">2 · Plano do redesign · {ds.name || 'Sistema de design'}</h4><p className="mt-0.5 text-xs text-zinc-500">{plan.strategy}</p></div></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><p className="label">Paleta</p><Swatches list={ds.palette} /></div>
            <div className="space-y-1 text-xs text-zinc-700">
              <p className="label">Sistema</p>
              <p><b>Estilo:</b> {ds.mood}</p>
              <p><b>Títulos:</b> {ds.typography.heading} {ds.typography.heading_weight} · <b>Texto:</b> {ds.typography.body} {ds.typography.body_weight}</p>
              <p><b>Cantos:</b> {ds.radius}</p><p><b>Botões:</b> {ds.buttons}</p><p><b>Imagens:</b> {ds.imagery}</p>
              {ds.mascot.use && <p className="rounded-lg bg-amber-50 px-2 py-1"><b>Mascote:</b> {ds.mascot.name} — {ds.mascot.description}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3">
            <textarea className="input min-h-[40px] flex-1 text-sm" rows={1} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="Quer mudar o plano? Ex.: mais escuro, adicionar seção de planos, tirar o mascote, trocar a paleta…" data-testid="layout-replan-text" />
            <button className="btn-outline" disabled={busy === 'plan'} onClick={() => (doneCount > 0 ? setConfirm('replan') : replan())} data-testid="layout-replan">{busy === 'plan' ? <Spinner className="h-4 w-4" /> : <RefreshCcw className="h-4 w-4" />}Refazer o plano</button>
          </div>
        </section>
      )}

      <section className="space-y-4" data-testid="layout-gallery">
        <div className="flex flex-wrap items-center gap-3">
          <h4 className="font-display text-[15px] font-semibold tracking-tight">3 · Layout (uma imagem por seção)</h4>
          <button className={cn('h-10', pending.length || !doneCount ? 'btn-brand' : 'btn-outline')} onClick={() => (pending.length || !doneCount ? generateAll() : setConfirm('regen'))} disabled={generating || !current.length} data-testid="layout-generate">{generating ? <><Spinner className="h-4 w-4 text-white" />Gerando…</> : <><Wand2 className="h-4 w-4" />{!doneCount ? 'Gerar o layout' : pending.length ? `Gerar as ${pending.length} pendentes` : 'Gerar tudo de novo'}</>}</button>
          {unit && !generating && pending.length > 0 && <span className="text-xs text-zinc-500">≈ US$ {(unit * pending.length).toFixed(2)} ({fmtBrl(unit * pending.length, getRate())})</span>}
          {doneCount > 0 && pages.length > 0 && pages.map(([key, p]) => <button key={key} className="btn-ghost btn-sm" onClick={() => go(() => downloadPageImage(project, p.name, rows.filter((r) => r.page_key === key)), `pg-${key}`)} disabled={busy === `pg-${key}`}><Download className="h-3.5 w-3.5" />{p.name} inteira (1 imagem)</button>)}
        </div>

        {current.filter((r) => r.kind !== 'section').length > 0 && (
          <div><p className="label">Guia de estilo{ds?.mascot.use ? ' e mascote' : ''} (base visual de todas as seções)</p>
            <div className="grid gap-4 md:grid-cols-2">{current.filter((r) => r.kind !== 'section').map((r) => <Tile key={r.id} row={r} versions={versionsOf(r)} project={project} onOpen={setView} onEdit={setEdit} />)}</div></div>
        )}
        {pages.map(([key, p]) => (
          <div key={key}><p className="label">{p.name}</p>
            <div className={cn('grid gap-4', project.form.format === 'mobile' ? 'sm:grid-cols-2 lg:grid-cols-4' : 'lg:grid-cols-2')}>{p.rows.map((r) => <Tile key={r.id} row={r} versions={versionsOf(r)} project={project} onOpen={setView} onEdit={setEdit} />)}</div></div>
        ))}
        {!current.length && <p className="py-6 text-center text-sm text-zinc-500">O plano ainda não tem seções. Use “Refazer o plano”.</p>}
      </section>

      {view && <Modal open onClose={() => setView(null)} size="xl" title={view.name} subtitle={`${view.page_name} · v${view.version}${view.cost_usd ? ` · US$ ${view.cost_usd.toFixed(3)}` : ''}`} footer={<><button className="btn-outline" onClick={() => downloadSection(view)}><Download className="h-4 w-4" />Baixar PNG</button></>}><StudioImg path={view.storage_path} fit="contain" className="min-h-[300px] rounded-2xl bg-zinc-100" /></Modal>}
      {edit && <ConceptModal row={edit} onClose={() => setEdit(null)} onSaved={() => invalidateLayout(qc, 'sections', project.id)} />}
      <ConfirmDialog open={confirm === 'delete'} onClose={() => setConfirm(null)} onConfirm={async () => { setConfirm(null); await go(async () => { await deleteLayoutProject(project, rows); onDeleted() }, 'del') }} danger title="Excluir projeto" message="O projeto e todas as imagens geradas serão apagados." confirmLabel="Excluir" />
      <ConfirmDialog open={confirm === 'regen'} onClose={() => setConfirm(null)} onConfirm={() => { setConfirm(null); generateAll(true) }} title="Gerar tudo de novo?" message={`Todas as ${current.length} imagens serão geradas outra vez (≈ ${unit ? `US$ ${(unit * current.length).toFixed(2)}` : 'custo de imagens'}). As versões atuais ficam salvas como histórico apenas se você usar "Ajustar"; aqui elas são substituídas.`} confirmLabel="Gerar tudo" />
      <ConfirmDialog open={confirm === 'replan'} onClose={() => setConfirm(null)} onConfirm={replan} title="Refazer o plano?" message="As imagens já geradas serão substituídas por um novo plano (as seções voltam a “plano” e você gera de novo)." confirmLabel="Refazer" />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Estúdio
// ---------------------------------------------------------------------------------------------
export default function Studio({ brand, trained }: { brand: Brand; trained: boolean }) {
  const { data: projects, isLoading } = useLayoutProjects(brand.id)
  const [sel, setSel] = useState<string | 'new' | null>(null)
  const [fresh, setFresh] = useState<LayoutProject | null>(null)
  useEffect(() => { setSel(null); setFresh(null) }, [brand.id])
  const project = fresh && fresh.id === sel ? (projects?.find((p) => p.id === sel) ?? fresh) : projects?.find((p) => p.id === sel)

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (sel === 'new' || (!projects?.length && !project)) return (
    <div className="space-y-3">
      {projects && projects.length > 0 && <button className="btn-outline btn-sm" onClick={() => setSel(null)}>← Projetos</button>}
      <NewLayoutForm brand={brand} trained={trained} onCreated={(p) => { setFresh(p); setSel(p.id) }} />
    </div>
  )
  if (project) return <ProjectView project={project} onClose={() => { setSel(null); setFresh(null) }} onDeleted={() => { setSel(null); setFresh(null) }} />
  return (
    <div className="space-y-4" data-testid="layout-projects">
      <button className="btn-brand h-11" onClick={() => setSel('new')} data-testid="layout-new"><Plus className="h-4 w-4" />Novo layout de site</button>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(projects ?? []).map((p) => (
          <button key={p.id} type="button" onClick={() => setSel(p.id)} className="card card-hover p-4 text-left" data-testid="layout-project-card">
            <div className="flex items-center justify-between gap-2"><b className="truncate text-sm">{p.name}</b><span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">{STATUS_LABEL[p.status]}</span></div>
            <p className="mt-1 text-xs text-zinc-500">{p.form.categories.map(catShort).join(' + ') || p.form.segment || 'Site'} · {p.form.format === 'mobile' ? 'mobile' : 'desktop'}</p>
            <p className="mt-2 flex items-center gap-1 text-[11px] text-zinc-400"><ChevronDown className="h-3 w-3 -rotate-90" />{new Date(p.created_at).toLocaleDateString('pt-BR')}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
