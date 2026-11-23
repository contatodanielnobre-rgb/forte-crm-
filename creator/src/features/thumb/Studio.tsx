import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Check, ChevronDown, Download, Lightbulb, Mic, Plus, RefreshCcw, Sparkles, Star, Trash2, Upload, Wand2, X } from 'lucide-react'
import { cn, errMsg } from '@/lib/utils'
import { ConfirmDialog, Skeleton, Spinner } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { COST_ASSUMPTIONS, fmtBrl, getRate, imageCost } from '@/features/studio/catalog'
import { MicButton, appendDictated } from '@/features/studio/Dictation'
import { CastSection } from '@/features/studio/Elements'
import { hasProvider, useCast, useModels, useProviderStatus, useStudioSettings, useStudioUrl } from '@/features/studio/data'
import { StudioImg } from '@/features/studio/ui'
import type { Brand } from '@/features/studio/types'
import FontPicker from '@/features/studio/FontPicker'
import { THUMB_CATEGORIES, THUMB_LETTERING, THUMB_TYPE_GUIDE } from '../../../supabase/functions/_shared/thumb-skill'
import { approveThumb, createThumbProject, deleteThumbProject, deleteThumbVersion, downloadThumb, generateThumbImages, ideateThumbs, invalidateThumb, refineThumb, retryThumb, saveConcept, toggleFavoriteThumb, useThumbProjects, useThumbVersions, type NewInput } from './data'
import { emptyDirection, type CastRole, type CastShow, type InputRole, type ThumbConcept, type ThumbDirection, type ThumbForm, type ThumbProject, type ThumbVersion } from './types'

const emptyForm = (): ThumbForm => ({ title: '', brief: '', categories: [], cast: [], text_mode: 'auto', text_custom: '', lang: 'português do Brasil', notes: '', avoid: '', count: 6, dir: emptyDirection() })
const EXPRESSIONS: [string, string][] = [['auto', 'Automática'], ['open_mouth', 'Boca aberta (grito/espanto)'], ['shock', 'Choque'], ['smile', 'Sorriso largo'], ['smirk', 'Sorriso de canto confiante'], ['serious', 'Sério / desafiador'], ['fear', 'Pavor'], ['anger', 'Raiva / dentes à mostra'], ['think', 'Pensativo (mão no queixo)'], ['sad', 'Decepção / cansaço'], ['doubt', 'Dúvida / ceticismo']]
const GAZES: [string, string][] = [['auto', 'Automático'], ['camera', 'Olhando para a câmera'], ['object', 'Olhando para o objeto/prova'], ['side', 'Olhando de lado'], ['up', 'Olhando para cima'], ['down', 'Olhando para baixo']]
const POSITIONS: [string, string][] = [['auto', 'Automática'], ['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']]
const DEPTHS: [string, string][] = [['auto', 'Automática'], ['behind', 'Atrás do personagem'], ['front', 'Na frente do personagem']]
const AREAS: [string, string][] = [['auto', 'Automática'], ['left', 'Lado esquerdo'], ['right', 'Lado direito'], ['top', 'Parte superior'], ['bottom', 'Parte inferior'], ['center', 'Centro']]
const BACKGROUNDS: [string, string][] = [['auto', 'Automático'], ['real', 'Cenário real fotográfico'], ['dark_glow', 'Estúdio escuro com contraluz'], ['light_clean', 'Fundo claro limpo'], ['illustrated', 'Ilustrado / sketch'], ['blur_crowd', 'Multidão / ambiente desfocado']]
const SKELETONS: [string, string][] = [['', 'Automático (pela categoria e referências)'], ['A', 'A · Rosto de lado + prova'], ['B', 'B · Palavra gigante atrás do sujeito'], ['C', 'C · Dois blocos de texto em volta do rosto'], ['D', 'D · Educativo claro'], ['E', 'E · Plongée de provocação'], ['F', 'F · Aventura cinematográfica'], ['G', 'G · Painel de investigação'], ['H', 'H · Comparação / VS'], ['I', 'I · Indivíduo × multidão']]
const Sel = ({ value, onChange, options, label, testid }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string; testid?: string }) => (
  <label className="block"><span className="mb-1 block text-[11px] font-semibold text-zinc-600">{label}</span><select className="input h-9 text-xs" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}>{options.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
)
const ROLES: { id: CastRole; label: string }[] = [{ id: 'owner', label: 'Eu / dono do canal' }, { id: 'story', label: 'Personagem da história' }, { id: 'support', label: 'Coadjuvante' }]
const SHOWS: { id: CastShow; label: string }[] = [{ id: 'auto', label: 'A IA decide' }, { id: 'face', label: 'Rosto (close)' }, { id: 'half', label: 'Meio corpo' }, { id: 'full', label: 'Corpo inteiro' }]
const IN_ROLES: { id: InputRole; label: string }[] = [{ id: 'competitor', label: 'Thumb de outro canal (fazer diferente)' }, { id: 'inspiration', label: 'Inspiração' }, { id: 'own', label: 'Minha thumb anterior (melhorar)' }]
const QUALITIES = [{ id: 'low', label: 'Rascunho' }, { id: 'medium', label: 'Normal' }, { id: 'high', label: 'Alta' }]
const catShort = (id: string) => THUMB_CATEGORIES.find((c) => c.id === id)?.label.split(' / ')[0] ?? id
const KEY = (id: string) => `fcc-thumb-cast-${id}`

function useCastIds(brandId: string) {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => { try { setIds(JSON.parse(sessionStorage.getItem(KEY(brandId)) ?? '[]')) } catch { setIds([]) } }, [brandId])
  const set = (f: (p: string[]) => string[]) => setIds((p) => { const n = f(p); try { sessionStorage.setItem(KEY(brandId), JSON.stringify(n)) } catch { /* noop */ } return n })
  return [ids, set] as const
}

interface FileItem { id: string; file: File; role: InputRole; note: string; url: string }

// ---------------------------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------------------------
function NewThumbForm({ brand, initial, onCreated, trained }: { brand: Brand; initial?: ThumbForm | null; onCreated: (p: ThumbProject, count: number) => void; trained: boolean }) {
  const { profile } = useAuth()
  const { data: models } = useModels()
  const { data: settings } = useStudioSettings()
  const { data: providers } = useProviderStatus()
  const { data: cast } = useCast(brand.id)
  const [form, setForm] = useState<ThumbForm>(initial ?? emptyForm())
  const [castIds, setCastIds] = useCastIds(brand.id)
  type CastCfg = { role: CastRole; show: CastShow; expression: string; gaze: string; position: string }
  const [cfg, setCfg] = useState<Record<string, Partial<CastCfg>>>({})
  const [files, setFiles] = useState<FileItem[]>([])
  const [modelId, setModelId] = useState('')
  const [quality, setQuality] = useState('medium')
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const set = (p: Partial<ThumbForm>) => setForm((f) => ({ ...f, ...p }))
  useEffect(() => { setForm(initial ?? emptyForm()) }, [initial, brand.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const imgModels = (models ?? []).filter((m) => m.enabled && m.capabilities?.refs)
  useEffect(() => { if (!modelId) setModelId(imgModels.find((m) => m.id === settings?.default_model)?.id ?? imgModels[0]?.id ?? '') }, [imgModels, settings, modelId])
  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const picked = (cast ?? []).filter((a) => a.kind === 'character' && castIds.includes(a.id))
  const roleOf = (id: string) => cfg[id]?.role ?? 'owner'
  const showOf = (id: string) => cfg[id]?.show ?? 'auto'
  const setCfgFor = (id: string, p: Partial<CastCfg>) => setCfg((c) => ({ ...c, [id]: { ...c[id], ...p } }))
  const exprOf = (id: string) => cfg[id]?.expression ?? 'auto'
  const gazeOf = (id: string) => cfg[id]?.gaze ?? 'auto'
  const posOf = (id: string) => cfg[id]?.position ?? 'auto'
  const dir: ThumbDirection = form.dir ?? emptyDirection()
  const recFonts = Array.from(new Set(form.categories.flatMap((c) => (THUMB_TYPE_GUIDE[c]?.fonts ?? []).map((f) => f.name)))).slice(0, 8)
  const setDir = (p: Partial<ThumbDirection>) => set({ dir: { ...dir, ...p } })

  const addFiles = (list: File[]) => {
    const ok = list.filter((f) => f.type.startsWith('image/')); if (!ok.length) return toast.error('Envie imagens (JPG, PNG, WEBP).')
    setFiles((cur) => [...cur, ...ok.map((file) => ({ id: crypto.randomUUID(), file, role: 'competitor' as InputRole, note: '', url: URL.createObjectURL(file) }))].slice(0, 4))
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); addFiles(Array.from(e.dataTransfer.files)) }
  const toggleCat = (id: string) => set({ categories: form.categories.includes(id) ? form.categories.filter((x) => x !== id) : [...form.categories, id].slice(-3) })

  const model = imgModels.find((m) => m.id === modelId)
  const unit = model ? imageCost(model.api_model, quality, COST_ASSUMPTIONS, true) : null
  const valid = form.brief.trim().length >= 15 || form.title.trim().length >= 4

  const submit = async () => {
    if (!profile) return
    if (!valid) return toast.error('Explique sobre o que é o vídeo (ou escreva o título).')
    if (!model) return toast.error('Ative um modelo de imagem em Modelos e APIs.')
    setBusy(true)
    try {
      const f: ThumbForm = { ...form, title: form.title.trim(), brief: form.brief.trim(), channel: brand.is_base ? '' : brand.name, cast: picked.map((a) => ({ id: a.id, label: a.label ?? a.name, description: a.caption, role: roleOf(a.id), show: showOf(a.id), expression: exprOf(a.id), gaze: gazeOf(a.id), position: posOf(a.id) })) }
      const p = await createThumbProject({ brand, userId: profile.id, form: f, inputs: files.map((x): NewInput => ({ file: x.file, role: x.role, note: x.note.trim() || undefined })), modelId, quality })
      onCreated(p, form.count ?? 6)
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <div className="card space-y-6 p-5 sm:p-6" data-testid="thumb-form">
      {!trained && <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>O criador ainda não foi treinado com as suas thumbnails. Funciona assim mesmo (com a skill embutida), mas treinar deixa o resultado bem mais parecido com o seu estilo. <b>Abra a aba Treinamento.</b></span></p>}

      <div>
        <p className="label">1 · Sobre o vídeo</p>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Título do vídeo (opcional)</span><input className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: A ascensão e queda de Pablo Escobar" data-testid="thumb-title" /></label>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-600">Explique o vídeo: do que ele fala, a história, o conflito, o resultado</span>
            <span className="flex items-center gap-2 text-[11px] text-zinc-500"><Mic className="h-3 w-3" />Pode ditar o roteiro inteiro<MicButton onText={(x) => set({ brief: appendDictated(form.brief, x) })} vocab={[form.title, brand.name]} title="Ditar com a voz (transcrição Whisper/OpenAI)" /></span>
          </div>
          <textarea className="input" rows={7} value={form.brief} onChange={(e) => set({ brief: e.target.value })} data-testid="thumb-brief"
            placeholder="Ex.: Vídeo contando a história de Pablo Escobar: de pequeno contrabandista a maior traficante do mundo, o império de dinheiro (tinha tanto que as notas eram roídas por ratos), a guerra com o governo e a queda. O tom é de documentário sombrio. Quero que o público sinta curiosidade pelo segredo por trás do império." />
          <p className="mt-1 text-[11px] text-zinc-500">{form.brief.trim().length} caracteres · quanto mais detalhe (emoção, números, reviravolta), melhores as ideias.</p>
        </div>
      </div>

      <div>
        <p className="label">2 · Tipo de thumbnail <span className="font-normal normal-case text-zinc-400">(até 3; vazio = a IA decide pelo tema)</span></p>
        <div className="flex flex-wrap gap-2" data-testid="thumb-cats">
          {THUMB_CATEGORIES.map((c) => <button key={c.id} type="button" onClick={() => toggleCat(c.id)} aria-pressed={form.categories.includes(c.id)} title={c.hint} data-testid={`cat-${c.id}`} className={cn('rounded-xl border px-3 py-2 text-left text-xs font-medium transition', form.categories.includes(c.id) ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400')}>{form.categories.includes(c.id) && <Check className="mr-1 inline h-3 w-3" />}{c.label}</button>)}
        </div>
      </div>

      <div>
        <p className="label">3 · Quem aparece</p>
        <CastSection brand={brand} kind="character" postIds={castIds} setPostIds={setCastIds} openaiOk={hasProvider(providers, 'openai')} mentioned={[]} />
        {picked.length > 0 && (
          <ul className="mt-3 space-y-2" data-testid="thumb-cast-cfg">
            {picked.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <b className="text-sm">@{a.label}</b>
                <select className="input h-8 w-auto text-xs" value={roleOf(a.id)} onChange={(e) => setCfgFor(a.id, { role: e.target.value as CastRole })} aria-label="Papel">{ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
                <select className="input h-8 w-auto text-xs" value={showOf(a.id)} onChange={(e) => setCfgFor(a.id, { show: e.target.value as CastShow })} aria-label="Enquadramento">{SHOWS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
                {roleOf(a.id) === 'story' && <span className="text-[11px] text-zinc-500">O dono do canal não aparece por causa dele.</span>}
                <div className="grid w-full gap-2 sm:grid-cols-3">
                  <Sel label="Expressão" value={exprOf(a.id)} onChange={(v) => setCfgFor(a.id, { expression: v })} options={EXPRESSIONS} testid="cast-expression" />
                  <Sel label="Olhar" value={gazeOf(a.id)} onChange={(v) => setCfgFor(a.id, { gaze: v })} options={GAZES} testid="cast-gaze" />
                  <Sel label="Posição na imagem" value={posOf(a.id)} onChange={(v) => setCfgFor(a.id, { position: v })} options={POSITIONS} testid="cast-position" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {!picked.length && <p className="mt-2 text-[11px] text-zinc-500">Em Automático a IA escolhe expressão, olhar e posição pela categoria e pelas suas referências. Sem pessoa selecionada: a IA cria cenas, objetos e conceitos sem rosto. Suba a sua foto (ou a do personagem da história) para a IA usar o MESMO rosto.</p>}
      </div>

      <div>
        <p className="label">4 · Texto na thumbnail</p>
        <div className="flex flex-wrap gap-2">
          {([['auto', 'A IA decide pela categoria'], ['none', 'Sem texto'], ['custom', 'Texto exato']] as const).map(([id, l]) => <button key={id} type="button" onClick={() => set({ text_mode: id })} aria-pressed={form.text_mode === id} data-testid={`text-${id}`} className={cn('rounded-full border px-3.5 py-1.5 text-xs font-medium transition', form.text_mode === id ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400')}>{l}</button>)}
        </div>
        {form.text_mode === 'custom' && <input className="input mt-2 max-w-md" value={form.text_custom} onChange={(e) => set({ text_custom: e.target.value })} placeholder="Ex.: O REI DA COCAÍNA" data-testid="text-custom" />}
        {form.text_mode !== 'none' && (
          <div className="mt-3 space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3.5" data-testid="text-controls">
            <p className="text-[11px] text-zinc-500">Ajustes do texto <b>(opcionais)</b>: em Automático a IA escolhe posição, profundidade, fonte e cor pela categoria e pelas suas referências.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Sel label="Posição do texto" value={dir.text_area} onChange={(v) => setDir({ text_area: v })} options={AREAS} testid="dir-area" />
              <Sel label="Atrás ou na frente" value={dir.text_depth} onChange={(v) => setDir({ text_depth: v })} options={DEPTHS} testid="dir-depth" />
              <Sel label="Estilo de lettering" value={dir.lettering} onChange={(v) => setDir({ lettering: v })} options={[['', 'Automático'], ...THUMB_LETTERING.map((l): [string, string] => [l.id, l.label])]} testid="dir-lettering" />
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-semibold text-zinc-600">Fonte do texto {dir.text_font ? '' : '(Automática)'}</span>
              <FontPicker value={dir.text_font ? [dir.text_font] : []} max={2} placeholder="Buscar fonte… (vazio = a IA escolhe pela categoria)" onChange={(v) => setDir({ text_font: v[v.length - 1] ?? '' })} />
              {recFonts.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500" data-testid="rec-fonts">Recomendadas para {form.categories.map((c) => THUMB_CATEGORIES.find((x) => x.id === c)?.label.split(' / ')[0]).join(' + ')}:
                  {recFonts.map((f) => <button key={f} type="button" onClick={() => setDir({ text_font: f })} className={cn('rounded-full border px-2.5 py-1 font-medium transition', dir.text_font === f ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white text-zinc-700 hover:border-ink')}>{f}</button>)}</div>
              ) : <p className="mt-2 text-[11px] text-zinc-500">Escolha uma categoria acima para ver as fontes recomendadas daquele nicho. Em Automático a IA já usa as do nicho.</p>}
              {form.categories.some((c) => THUMB_TYPE_GUIDE[c]?.text === 'none') && <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">Este nicho costuma ficar <b>sem texto</b>. Em Automático a IA não coloca texto; ao escolher fonte, posição ou "Texto exato", ela coloca.</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-zinc-600">Cor do texto</span>
              <button type="button" onClick={() => setDir({ text_color: '' })} aria-pressed={!dir.text_color} className={cn('rounded-full border px-3 py-1 font-medium', !dir.text_color ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white')}>Automática</button>
              <label className="relative inline-flex h-8 w-8 cursor-pointer overflow-hidden rounded-lg ring-1 ring-black/10" style={{ background: dir.text_color || 'repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 50% / 10px 10px' }} title="Escolher cor"><input type="color" value={(dir.text_color || '#ffffff').toLowerCase()} onChange={(e) => setDir({ text_color: e.target.value.toUpperCase() })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Cor do texto" data-testid="dir-color" /></label>
              {dir.text_color && <span className="tabular text-zinc-500">{dir.text_color}</span>}
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="label">5 · Cena <span className="font-normal normal-case text-zinc-400">(opcional: Automático = a IA decide)</span></p>
        <div className="grid gap-3 sm:grid-cols-3" data-testid="scene-controls">
          <Sel label="Fundo" value={dir.background} onChange={(v) => setDir({ background: v })} options={BACKGROUNDS} testid="dir-bg" />
          <Sel label="Composição" value={dir.skeleton} onChange={(v) => setDir({ skeleton: v })} options={SKELETONS} testid="dir-skeleton" />
          <div>
            <span className="mb-1 block text-[11px] font-semibold text-zinc-600">Cor dominante</span>
            <div className="flex h-9 items-center gap-2 text-xs">
              <button type="button" onClick={() => setDir({ dominant_color: '' })} aria-pressed={!dir.dominant_color} className={cn('rounded-full border px-3 py-1.5 font-medium', !dir.dominant_color ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white')}>Automática</button>
              <label className="relative inline-flex h-8 w-8 cursor-pointer overflow-hidden rounded-lg ring-1 ring-black/10" style={{ background: dir.dominant_color || 'repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 50% / 10px 10px' }}><input type="color" value={(dir.dominant_color || '#ff6600').toLowerCase()} onChange={(e) => setDir({ dominant_color: e.target.value.toUpperCase() })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Cor dominante" data-testid="dir-dominant" /></label>
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="label">6 · Imagens de apoio <span className="font-normal normal-case text-zinc-400">(opcional, até 4)</span></p>
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()} data-testid="thumb-input-drop"
          className={cn('flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition', drag ? 'border-brand bg-brand/5' : 'border-zinc-200 hover:border-zinc-400')}>
          <Upload className="h-5 w-5 text-zinc-400" /><p className="text-sm font-semibold">Suba uma thumb de outro canal, uma inspiração ou uma thumb sua que não ficou boa</p>
          <input ref={input} type="file" accept="image/*" multiple hidden data-testid="thumb-input-files" onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = '' }} />
        </div>
        {files.length > 0 && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="thumb-input-list">
            {files.map((f) => (
              <li key={f.id} className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-2.5">
                <img src={f.url} alt="" className="h-16 w-28 shrink-0 rounded-xl bg-zinc-50 object-cover" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <select className="input h-8 text-xs" value={f.role} aria-label="O que é esta imagem" onChange={(e) => setFiles((c) => c.map((x) => (x.id === f.id ? { ...x, role: e.target.value as InputRole } : x)))}>{IN_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
                  <input className="input h-8 text-xs" value={f.note} onChange={(e) => setFiles((c) => c.map((x) => (x.id === f.id ? { ...x, note: e.target.value } : x)))} placeholder="Observação (opcional)" />
                </div>
                <button type="button" aria-label="Remover imagem" className="self-start text-zinc-400 hover:text-red-600" onClick={() => { URL.revokeObjectURL(f.url); setFiles((c) => c.filter((x) => x.id !== f.id)) }}><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">O que evitar</span><input className="input" value={form.avoid} onChange={(e) => set({ avoid: e.target.value })} placeholder="Ex.: sangue, armas, setas vermelhas" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Observações</span><input className="input" value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Ex.: público de 30+, tom sério" /></label>
        </div>
      </div>

      <div className="rounded-2xl bg-zinc-50 p-4">
        <p className="label">7 · Geração</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Quantas ideias</span><select className="input h-9" value={form.count} onChange={(e) => set({ count: Number(e.target.value) })} data-testid="thumb-count">{[3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-zinc-600">Modelo de imagem</span><select className="input h-9" value={modelId} onChange={(e) => setModelId(e.target.value)} data-testid="thumb-model">{imgModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}{!imgModels.length && <option value="">Nenhum modelo ativo</option>}</select></label>
          <div><span className="mb-1 block text-xs font-semibold text-zinc-600">Qualidade</span><div className="flex gap-1">{QUALITIES.map((q) => <button key={q.id} type="button" onClick={() => setQuality(q.id)} aria-pressed={quality === q.id} data-testid={`tq-${q.id}`} className={cn('flex-1 rounded-lg border px-2 py-2 text-xs font-semibold transition', quality === q.id ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white hover:border-zinc-400')}>{q.label}</button>)}</div></div>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Primeiro a IA só propõe as <b>ideias</b> (centavos). Você escolhe quais viram imagem{unit ? <>; cada thumbnail custa ≈ <b className="text-ink">{fmtBrl(unit.total, getRate())}</b></> : ''}.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-brand h-11 px-6" onClick={submit} disabled={busy} data-testid="thumb-submit">{busy ? <><Spinner className="h-4 w-4 text-white" />Enviando…</> : <><Lightbulb className="h-4 w-4" />Gerar {form.count} ideias de thumbnail</>}</button>
        {!valid && <span className="text-xs text-zinc-500">Explique o vídeo (ou escreva o título).</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Ideias e resultados
// ---------------------------------------------------------------------------------------------
function IdeaCard({ v, checked, onCheck, onSave }: { v: ThumbVersion; checked: boolean; onCheck: () => void; onSave: (c: ThumbConcept) => void }) {
  const c = v.concept
  const [text, setText] = useState(c.text?.headline ?? '')
  useEffect(() => setText(c.text?.headline ?? ''), [c.text?.headline])
  const commit = () => { if (text.trim() !== (c.text?.headline ?? '')) onSave({ ...c, text: { ...c.text, mode: text.trim() ? 'short' : 'none', headline: text.trim() } }) }
  return (
    <article className={cn('rounded-2xl border bg-white p-4 transition', checked ? 'border-ink shadow-card' : 'border-zinc-200')} data-testid="thumb-idea" data-checked={checked}>
      <div className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={onCheck} aria-label="Gerar esta ideia" data-testid="idea-check" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5"><b className="text-sm">{c.name}</b>{c.category && <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">{catShort(c.category)}</span>}{c.angle && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{c.angle}</span>}</div>
          <p className="mt-1.5 text-xs text-zinc-700"><b>Por que clica:</b> {c.hook}</p>
          <p className="mt-1 text-xs text-zinc-600"><b>Composição:</b> {c.composition}</p>
          {c.characters?.length > 0 && <p className="mt-1 text-xs text-zinc-600"><b>Personagens:</b> {c.characters.map((x) => `${x.who}${x.expression ? ` (${x.expression})` : ''}`).join(' · ')}</p>}
          <p className="mt-1 text-xs text-zinc-600"><b>Cenário:</b> {c.scene}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {c.colors?.map((x) => <span key={x} className="h-4 w-4 rounded ring-1 ring-black/10" style={{ background: x }} title={x} />)}
            <label className="ml-auto flex min-w-[220px] flex-1 items-center gap-2 text-xs"><span className="font-semibold text-zinc-600">Texto</span><input className="input h-8 text-xs" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} placeholder="(sem texto)" aria-label="Texto da thumbnail" data-testid="idea-text" /></label>
          </div>
          {c.text_reason && <p className="mt-1 text-[11px] text-zinc-500">{c.text_reason}</p>}
        </div>
      </div>
    </article>
  )
}

function VersionCard({ v, project, approved, onRefine, onApprove, onRetry, qc }: { v: ThumbVersion; project: ThumbProject; approved: boolean; onRefine: (fb: string) => Promise<void>; onApprove: () => void; onRetry: () => void; qc: ReturnType<typeof useQueryClient> }) {
  const [refine, setRefine] = useState(false); const [fb, setFb] = useState(''); const [busy, setBusy] = useState(false); const [info, setInfo] = useState(false); const [del, setDel] = useState(false)
  const url = useStudioUrl(v.storage_path)
  const working = v.status === 'queued' || v.status === 'running'
  const name = `${project.name.replace(/[^\w]+/g, '-').toLowerCase().slice(0, 30)}-${v.number}`
  const send = async () => { if (fb.trim().length < 3) return toast.error('Diga o que mudar.'); setBusy(true); try { await onRefine(fb.trim()); setFb(''); setRefine(false) } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) } }
  return (
    <article className={cn('overflow-hidden rounded-2xl border bg-white shadow-card', approved ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-zinc-200')} data-testid="thumb-card" data-status={v.status} data-approved={approved}>
      <div className="relative">
        {v.storage_path && v.status === 'done' ? <StudioImg path={v.storage_path} className="aspect-video" />
          : <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-zinc-50 p-4 text-center text-sm text-zinc-500">{working ? <><Spinner className="h-5 w-5" />{v.status === 'queued' ? 'Na fila…' : 'Criando a thumbnail…'}</> : <><AlertTriangle className="h-5 w-5 text-brand" /><span className="line-clamp-4 text-xs text-brand">{v.error ?? 'Não foi possível gerar.'}</span><button type="button" className="btn-outline btn-sm" onClick={onRetry}><RefreshCcw className="h-3.5 w-3.5" />Tentar de novo</button></>}</div>}
        {approved && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white shadow"><Check className="h-3 w-3" />Aprovada</span>}
        <button type="button" aria-label="Favoritar" onClick={() => toggleFavoriteThumb(v).then(() => invalidateThumb(qc, 'versions', project.id))} className={cn('absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur transition', v.favorite ? 'bg-amber-400 text-white' : 'bg-black/30 text-white opacity-60 hover:opacity-100')}><Star className={cn('h-3.5 w-3.5', v.favorite && 'fill-current')} /></button>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{v.concept?.name}</p><p className="text-[11px] text-zinc-500">{v.parent_id ? 'Ajuste' : [catShort(v.concept?.category ?? ''), v.concept?.angle].filter(Boolean).join(' · ')}{v.concept?.text?.headline ? ` · “${v.concept.text.headline}”` : ' · sem texto'}</p></div></div>
        {v.feedback && <p className="rounded-lg bg-zinc-50 px-2 py-1 text-[11px] text-zinc-600">Pedido: {v.feedback}</p>}
        {v.concept?.hook && <button type="button" onClick={() => setInfo((x) => !x)} className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-ink"><Lightbulb className="h-3 w-3" />A ideia<ChevronDown className={cn('h-3 w-3 transition', info && 'rotate-180')} /></button>}
        {info && <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900">{v.concept.hook}<br /><b>Composição:</b> {v.concept.composition}</p>}
        {v.status === 'done' && (
          <div className="flex flex-wrap gap-1.5">
            {approved ? <span className="text-xs font-semibold text-emerald-700">Escolhida ✓</span> : <button type="button" className="btn-primary btn-sm" onClick={onApprove} data-testid="thumb-approve"><Check className="h-3.5 w-3.5" />Aprovar</button>}
            <button type="button" className="btn-outline btn-sm" onClick={() => setRefine((x) => !x)} data-testid="thumb-refine"><Wand2 className="h-3.5 w-3.5" />Ajustar</button>
            <button type="button" className="btn-outline btn-sm" title="JPG 1280×720 (formato do YouTube)" data-testid="thumb-dl-yt" onClick={() => downloadThumb(v.storage_path!, name, 'youtube').catch((e) => toast.error(errMsg(e)))}><Download className="h-3.5 w-3.5" />YouTube</button>
            <button type="button" className="btn-outline btn-sm !px-2" aria-label="Baixar original" title="Original em alta" onClick={() => downloadThumb(v.storage_path!, name, 'png').catch((e) => toast.error(errMsg(e)))}>HD</button>
            <button type="button" className="btn-ghost btn-sm !px-2 text-red-600" aria-label="Excluir" onClick={() => setDel(true)}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {refine && (
          <div className="space-y-1.5" data-testid="thumb-refine-box">
            <textarea className="input text-xs" rows={2} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="O que mudar? Ex.: expressão de mais choque; texto maior; fundo mais escuro; tire a seta." data-testid="thumb-refine-text" />
            <button type="button" className="btn-brand btn-sm" disabled={busy} onClick={send} data-testid="thumb-refine-send">{busy ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Sparkles className="h-3.5 w-3.5" />}Gerar ajuste</button>
          </div>
        )}
      </div>
      {url && null}
      <ConfirmDialog open={del} onClose={() => setDel(false)} danger title="Excluir esta thumbnail" message="A imagem será apagada." confirmLabel="Excluir" onConfirm={async () => { await deleteThumbVersion(v); setDel(false); invalidateThumb(qc, 'versions', project.id) }} />
    </article>
  )
}

function ProjectView({ project, brand, onReuse, onDeleted }: { project: ThumbProject; brand: Brand; onReuse: (f: ThumbForm) => void; onDeleted: () => void }) {
  const qc = useQueryClient()
  const { data: versions, isLoading } = useThumbVersions(project.id)
  const { data: models } = useModels()
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [more, setMore] = useState(false)
  const [gen, setGen] = useState(false)
  const [del, setDel] = useState(false)
  const ideas = (versions ?? []).filter((v) => v.status === 'idea')
  const images = (versions ?? []).filter((v) => v.status !== 'idea')
  const m = models?.find((x) => x.id === project.model_id)
  const unit = m ? imageCost(m.api_model, project.quality, COST_ASSUMPTIONS, true) : null
  const seen = useRef<Set<string>>(new Set())
  useEffect(() => { // novas ideias já vêm marcadas (até 4)
    const fresh = ideas.filter((v) => !seen.current.has(v.id)); if (!fresh.length) return
    fresh.forEach((v) => seen.current.add(v.id))
    setChecked((c) => { const n = new Set(c); fresh.slice(0, Math.max(0, 4 - n.size)).forEach((v) => n.add(v.id)); return n })
  }, [ideas.map((v) => v.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const sel = ideas.filter((v) => checked.has(v.id))

  const moreIdeas = async () => { setMore(true); try { await ideateThumbs(project, 4, qc, { used: (versions ?? []).filter((v) => !v.parent_id).map((v) => v.concept?.name).filter(Boolean) }) } catch (e) { toast.error(errMsg(e)) } finally { setMore(false) } }
  const generate = async () => {
    if (!sel.length) return toast.error('Marque ao menos uma ideia.')
    setGen(true)
    try { setChecked(new Set()); await generateThumbImages(project, sel, qc) } catch (e) { toast.error(errMsg(e)) } finally { setGen(false) }
  }
  const approve = async (v: ThumbVersion) => { try { await approveThumb(project, v); invalidateThumb(qc, 'projects'); toast.success('Thumbnail aprovada!') } catch (e) { toast.error(errMsg(e)) } }

  return (
    <div className="space-y-5" data-testid="thumb-project" data-project-status={project.status}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight">{project.name}</h3>
          <p className="text-xs text-zinc-500">{project.form.categories?.length ? project.form.categories.map(catShort).join(' + ') : 'categoria escolhida pela IA'}{project.form.cast?.length ? ` · ${project.form.cast.map((c) => c.label).join(', ')}` : ''}</p>
          {project.analysis && <p className="mt-1 max-w-3xl text-xs text-zinc-600" data-testid="thumb-analysis-text"><b>Leitura do vídeo:</b> {project.analysis}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline btn-sm" onClick={moreIdeas} disabled={more} data-testid="thumb-more">{more ? <Spinner className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}Mais 4 ideias</button>
          <button type="button" className="btn-outline btn-sm" onClick={() => onReuse(project.form)} data-testid="thumb-reuse">Usar este briefing</button>
          <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => setDel(true)} aria-label="Excluir projeto"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {isLoading ? <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="aspect-video" /><Skeleton className="aspect-video" /></div> : !versions?.length && (
        <div className="card flex items-center justify-center gap-2 p-10 text-sm text-zinc-500"><Spinner className="h-4 w-4" />A IA está lendo o vídeo e pensando as ideias…</div>
      )}

      {ideas.length > 0 && (
        <section className="space-y-3" data-testid="thumb-ideas">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-display text-sm font-semibold">Ideias · escolha quais viram thumbnail ({sel.length} marcada{sel.length === 1 ? '' : 's'})</h4>
            <button type="button" className="btn-brand" onClick={generate} disabled={gen || !sel.length} data-testid="thumb-generate">{gen ? <><Spinner className="h-4 w-4 text-white" />Gerando…</> : <><Sparkles className="h-4 w-4" />Gerar {sel.length} thumbnail{sel.length === 1 ? '' : 's'}{unit && sel.length ? ` · ≈ ${fmtBrl(unit.total * sel.length, getRate())}` : ''}</>}</button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {ideas.map((v) => <IdeaCard key={v.id} v={v} checked={checked.has(v.id)} onCheck={() => setChecked((c) => { const n = new Set(c); if (n.has(v.id)) n.delete(v.id); else n.add(v.id); return n })} onSave={(c) => saveConcept(v, c).then(() => invalidateThumb(qc, 'versions', project.id))} />)}
          </div>
        </section>
      )}

      {images.length > 0 && (
        <section className="space-y-3">
          <h4 className="font-display text-sm font-semibold">Thumbnails</h4>
          <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="thumb-grid">
            {images.map((v) => <VersionCard key={v.id} v={v} project={project} qc={qc} approved={v.id === project.approved_version_id} onApprove={() => approve(v)} onRefine={(fb) => refineThumb(project, v, fb, qc)} onRetry={() => retryThumb(project, v, qc)} />)}
          </div>
        </section>
      )}
      <ConfirmDialog open={del} onClose={() => setDel(false)} danger title="Excluir este projeto" message="Todas as ideias e thumbnails deste projeto serão apagadas." confirmLabel="Excluir" onConfirm={async () => { await deleteThumbProject(project, versions ?? []); setDel(false); invalidateThumb(qc, 'projects'); onDeleted() }} />
      <span className="hidden">{brand.id}</span>
    </div>
  )
}

export default function Studio({ brand, trained }: { brand: Brand; trained: boolean }) {
  const qc = useQueryClient()
  const { data: projects, isLoading } = useThumbProjects(brand.id)
  const [sel, setSel] = useState<string | 'new'>('new')
  const [seed, setSeed] = useState<ThumbForm | null>(null)
  const picked = useRef<string | null>(null)
  useEffect(() => { if (!projects || picked.current === brand.id) return; picked.current = brand.id; setSel(projects[0]?.id ?? 'new') }, [projects, brand.id])
  const current = useMemo(() => projects?.find((p) => p.id === sel) ?? null, [projects, sel])
  const created = (p: ThumbProject, count: number) => {
    invalidateThumb(qc, 'projects'); setSel(p.id); setSeed(null)
    ideateThumbs(p, count, qc).catch((e) => { toast.error(errMsg(e)); invalidateThumb(qc, 'projects') })
  }
  return (
    <div className="space-y-5" data-testid="thumb-studio">
      <div className="flex flex-wrap items-center gap-2" data-testid="thumb-projects">
        <button type="button" onClick={() => { setSel('new'); setSeed(null) }} aria-pressed={sel === 'new'} data-testid="thumb-new" className={cn('inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition', sel === 'new' ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white hover:border-zinc-400')}><Plus className="h-4 w-4" />Novo vídeo</button>
        {isLoading && <Skeleton className="h-10 w-32" />}
        {projects?.map((p) => <button key={p.id} type="button" onClick={() => setSel(p.id)} aria-pressed={p.id === sel} data-testid="thumb-project-chip" className={cn('inline-flex max-w-[260px] items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition', p.id === sel ? 'border-ink bg-ink text-white' : 'border-zinc-200 bg-white hover:border-zinc-400')}><span className={cn('h-2 w-2 shrink-0 rounded-full', p.status === 'approved' ? 'bg-emerald-500' : p.status === 'generating' ? 'animate-pulse bg-amber-400' : 'bg-zinc-300')} /><span className="truncate">{p.name}</span></button>)}
      </div>
      {sel === 'new' || !current ? <NewThumbForm brand={brand} initial={seed} onCreated={created} trained={trained} /> : <ProjectView key={current.id} project={current} brand={brand} onReuse={(f) => { setSeed({ ...f }); setSel('new'); window.scrollTo({ top: 0, behavior: 'smooth' }) }} onDeleted={() => setSel('new')} />}
    </div>
  )
}
