import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ImageIcon, Plus, Save, Sparkles, Swords, Trash2, UserRound, X, Car, BookmarkCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn, errMsg } from '@/lib/utils'
import { Spinner } from '@/components/ui'
import { Link } from 'react-router-dom'
import { deleteAssets, describeAsset, updateAsset, uploadAssets, useAssets, useCast, useStudioSettings, useUsage } from './data'
import { StudioImg } from './ui'
import type { Brand, LogoPlan, LogoPos, StudioAsset } from './types'

// ---------------------------------------------------------------------------------
// Personagens e objetos
// ---------------------------------------------------------------------------------
const POST_CAST_KEY = (brandId: string) => `fcc-studio-postcast-${brandId}`
/** Itens que o usuário colocou neste post (sobrevive a recarregar a página) */
export function usePostCast(brandId?: string | null) {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    if (!brandId) return
    try { setIds(JSON.parse(sessionStorage.getItem(POST_CAST_KEY(brandId)) ?? '[]')) } catch { setIds([]) }
  }, [brandId])
  const set = (f: string[] | ((p: string[]) => string[])) => setIds((p) => {
    const n = typeof f === 'function' ? f(p) : f
    try { if (brandId) sessionStorage.setItem(POST_CAST_KEY(brandId), JSON.stringify(n)) } catch { /* noop */ }
    return n
  })
  return [ids, set] as const
}

const WORDS = { character: { one: 'personagem', Cap: 'Personagem', add: 'Adicionar personagem', icon: UserRound, ph: 'Quem é e como aparece (ex.: Dennis, dono da empresa, camisa preta)…' },
  object: { one: 'objeto', Cap: 'Objeto', add: 'Adicionar objeto', icon: Car, ph: 'O que é (ex.: Land Rover preta, placa ABC1D23)…' } } as const

function nextLabel(kind: 'character' | 'object', existing: StudioAsset[]) {
  const taken = new Set(existing.map((a) => (a.label ?? '').toLowerCase()))
  let n = existing.filter((a) => a.kind === kind).length + 1
  while (taken.has(`${WORDS[kind].Cap} ${n}`.toLowerCase())) n++
  return `${WORDS[kind].Cap} ${n}`
}

export function useAssetUploader(brand: Brand) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { data: settings } = useStudioSettings()
  const { data: usage } = useUsage()
  const [busy, setBusy] = useState(false)
  const upload = async (files: File[], kind: 'character' | 'object' | 'competitor', labels?: string[]) => {
    if (!files.length || !profile) return [] as StudioAsset[]
    setBusy(true)
    try {
      const created = await uploadAssets(brand.id, files, kind, profile.id, { bytesLeft: (settings?.max_bytes ?? 1073741824) - (usage?.get(brand.id)?.bytes ?? 0), refsLeft: 999 }, () => null, 2, { labels, saved: false, maxSide: kind === 'competitor' ? 1280 : 1600 })
      if (created.length < files.length) toast.error('Alguma imagem não foi enviada (use JPG, PNG ou WEBP de até 25 MB).')
      qc.invalidateQueries({ queryKey: ['studio', 'assets'] }); qc.invalidateQueries({ queryKey: ['studio', 'usage'] })
      return created
    } catch (e) { toast.error(errMsg(e)); return [] } finally { setBusy(false) }
  }
  return { upload, busy }
}

export function CastSection({ brand, kind, postIds, setPostIds, openaiOk, mentioned }: {
  brand: Brand; kind: 'character' | 'object'; postIds: string[]; setPostIds: (f: (p: string[]) => string[]) => void; openaiOk: boolean; mentioned: string[]
}) {
  const { data: all } = useCast(brand.id)
  const qc = useQueryClient()
  const { upload, busy } = useAssetUploader(brand)
  const input = useRef<HTMLInputElement>(null)
  const [describing, setDescribing] = useState<string[]>([])
  const W = WORDS[kind]
  const list = (all ?? []).filter((a) => a.kind === kind && (a.saved !== false || postIds.includes(a.id)))

  const describe = async (a: StudioAsset, quiet = false) => {
    setDescribing((d) => [...d, a.id])
    try { await describeAsset(a.id); qc.invalidateQueries({ queryKey: ['studio', 'assets'] }); if (!quiet) toast.success('IA descreveu a imagem: revise o texto') }
    catch (e) { if (!quiet) toast.error(errMsg(e)) } finally { setDescribing((d) => d.filter((x) => x !== a.id)) }
  }
  const onFiles = async (files: File[]) => {
    const base = all ?? []
    const labels: string[] = []
    files.forEach(() => labels.push(nextLabel(kind, [...base, ...labels.map((l) => ({ label: l, kind }) as StudioAsset)])))
    const created = await upload(files, kind, labels)
    if (!created.length) return
    setPostIds((p) => [...p, ...created.map((c) => c.id)])
    toast.success(`${created.length} ${created.length === 1 ? W.one : W.one + 's'} adicionado${created.length === 1 ? '' : 's'} ao post`, { description: 'Dê um nome, descreva e use @ no texto do post para citar.' })
    if (openaiOk) for (const c of created) void describe(c, true)
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="label !mb-0 flex items-center gap-1.5"><W.icon className="h-3.5 w-3.5" />{kind === 'character' ? 'Personagens' : 'Objetos'}</p>
        <button type="button" className="btn-outline btn-sm" onClick={() => input.current?.click()} disabled={busy} data-testid={`add-${kind}`}>
          {busy ? <Spinner className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{W.add}
        </button>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { void onFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      </div>
      {list.length === 0 && <p className="rounded-xl bg-zinc-50 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-500">{kind === 'character' ? 'Suba a foto de uma pessoa (ex.: o dono da empresa). A IA usa o MESMO rosto nos slides em que você citar com @.' : 'Suba a foto de um carro, produto ou objeto. A IA reproduz o mesmo modelo, cor e detalhes (até a placa).'}</p>}
      {list.map((a) => (
        <CastCard key={a.id} a={a} inPost={postIds.includes(a.id)} used={mentioned.includes(a.id)} describing={describing.includes(a.id)} openaiOk={openaiOk} ph={W.ph} noun={W.one}
          onTogglePost={() => setPostIds((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id]))}
          onDescribe={() => void describe(a)}
          onChanged={() => qc.invalidateQueries({ queryKey: ['studio', 'assets'] })}
          onRemoved={() => setPostIds((p) => p.filter((x) => x !== a.id))} siblings={all ?? []} />
      ))}
    </div>
  )
}

function CastCard({ a, inPost, used, describing, openaiOk, ph, noun, onTogglePost, onDescribe, onChanged, onRemoved, siblings }: {
  a: StudioAsset; inPost: boolean; used: boolean; describing: boolean; openaiOk: boolean; ph: string; noun: string; siblings: StudioAsset[]
  onTogglePost: () => void; onDescribe: () => void; onChanged: () => void; onRemoved: () => void
}) {
  const [label, setLabel] = useState(a.label ?? '')
  const [desc, setDesc] = useState(a.caption ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => setDesc(a.caption ?? ''), [a.caption])
  useEffect(() => setLabel(a.label ?? ''), [a.label])
  const run = async (f: () => Promise<void>) => { setBusy(true); try { await f(); onChanged() } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) } }
  const commitLabel = () => {
    const v = label.trim().replace(/[@\n]/g, '')
    if (!v) { setLabel(a.label ?? ''); return }
    if (siblings.some((s) => s.id !== a.id && (s.label ?? '').toLowerCase() === v.toLowerCase())) { toast.error('Já existe um item com esse nome.'); setLabel(a.label ?? ''); return }
    if (v !== a.label) void run(() => updateAsset(a.id, { label: v }))
  }
  const saved = a.saved !== false
  return (
    <div className={cn('rounded-2xl border bg-white p-2.5 transition', inPost ? 'border-ink' : 'border-zinc-200')} data-testid="cast-card">
      <div className="flex gap-2.5">
        <StudioImg path={a.thumb_path ?? a.storage_path} className="h-[72px] w-[72px] shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-zinc-400">@</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={commitLabel} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur())} className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 text-sm font-semibold focus:border-ink focus:outline-none" aria-label={`Nome do ${noun}`} />
            <button type="button" className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-brand" aria-label={`Excluir ${noun}`} title={saved ? 'Excluir da empresa' : 'Excluir'} onClick={() => { if (saved && !window.confirm(`Excluir "${a.label}" da biblioteca da empresa? Posts já criados não são afetados.`)) return; void run(async () => { await deleteAssets([a]); onRemoved() }) }}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={onTogglePost} className={cn('inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition', inPost ? 'border-ink bg-ink text-white' : 'border-zinc-200 text-zinc-600 hover:border-ink')}>
              {inPost ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}{inPost ? 'Neste post' : 'Usar neste post'}
            </button>
            {saved
              ? <span className="inline-flex h-7 items-center gap-1 rounded-full bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-700"><BookmarkCheck className="h-3 w-3" />Salvo na empresa</span>
              : <button type="button" disabled={busy} onClick={() => void run(async () => { await updateAsset(a.id, { saved: true }); toast.success(`${a.label} salvo: aparece sempre que você digitar @`) })} className="inline-flex h-7 items-center gap-1 rounded-full border border-brand/40 bg-brand-soft px-2.5 text-[11px] font-semibold text-brand hover:border-brand" data-testid="save-cast">
                {busy ? <Spinner className="h-3 w-3" /> : <Save className="h-3 w-3" />}Salvar {noun}
              </button>}
            {used && <span className="text-[10px] font-semibold text-emerald-700">citado com @</span>}
          </div>
        </div>
      </div>
      <textarea value={desc} rows={2} onChange={(e) => setDesc(e.target.value)} onBlur={() => { if (desc.trim() !== (a.caption ?? '').trim()) void run(() => updateAsset(a.id, { caption: desc.trim() || null })) }} placeholder={ph}
        className="mt-2 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50/60 px-2.5 py-1.5 text-xs leading-relaxed focus:border-ink focus:bg-white focus:outline-none" aria-label={`Descrição do ${noun}`} />
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[10px] text-zinc-400">A foto vai junto com a descrição para o gerador reproduzir o mesmo.</span>
        <button type="button" className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline disabled:opacity-40" onClick={onDescribe} disabled={describing || !openaiOk}>{describing ? <Spinner className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}{describing ? 'Descrevendo…' : 'Descrever com IA'}</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------
// Posts de concorrentes (referência de estrutura) + intensidade
// ---------------------------------------------------------------------------------
export const intensityLabel = (v: number) => v >= 80 ? 'Bem parecido com os concorrentes, mas com a sua cara' : v >= 55 ? 'Inspirado neles, com cara própria' : v >= 30 ? 'Só um pouco de inspiração; o resto é seu' : 'Nada a ver com eles: algo totalmente próprio'

export function CompetitorSection({ brand, sel, setSel, intensity, setIntensity }: { brand: Brand; sel: string[]; setSel: (f: (p: string[]) => string[]) => void; intensity: number; setIntensity: (n: number) => void }) {
  const { data: all } = useAssets(brand.id, 'competitor')
  const qc = useQueryClient()
  const { upload, busy } = useAssetUploader(brand)
  const input = useRef<HTMLInputElement>(null)
  const list = all ?? []
  const onFiles = async (files: File[]) => {
    const created = await upload(files, 'competitor')
    if (created.length) { setSel((p) => [...p, ...created.map((c) => c.id)]); toast.success(`${created.length} post(s) de concorrente adicionados`) }
  }
  const remove = async (a: StudioAsset) => { try { await deleteAssets([a]); setSel((p) => p.filter((x) => x !== a.id)); qc.invalidateQueries({ queryKey: ['studio', 'assets'] }) } catch (e) { toast.error(errMsg(e)) } }
  const n = sel.filter((id) => list.some((a) => a.id === id)).length
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="label !mb-0 flex items-center gap-1.5"><Swords className="h-3.5 w-3.5" />Posts de concorrentes</p>
        <button type="button" className="btn-outline btn-sm" onClick={() => input.current?.click()} disabled={busy} data-testid="add-competitor">{busy ? <Spinner className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}Subir posts</button>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { void onFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      </div>
      {list.length === 0 ? <p className="rounded-xl bg-zinc-50 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-500">Suba posts de concorrentes ou de perfis que você admira. A IA entende a estrutura deles e você decide o quanto o novo post deve se parecer.</p> : (
        <>
          <div className="grid grid-cols-4 gap-1.5">
            {list.map((a) => {
              const on = sel.includes(a.id)
              return (
                <div key={a.id} className="group relative">
                  <button type="button" onClick={() => setSel((p) => (on ? p.filter((x) => x !== a.id) : [...p, a.id]))} className={cn('block w-full overflow-hidden rounded-lg ring-2 transition', on ? 'ring-ink' : 'opacity-60 ring-transparent hover:opacity-100')} aria-pressed={on} title={on ? 'Usando neste post' : 'Clique para usar neste post'}>
                    <StudioImg path={a.thumb_path ?? a.storage_path} className="aspect-[4/5]" />
                    {on && <span className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-white"><Check className="h-3 w-3" /></span>}
                  </button>
                  <button type="button" onClick={() => void remove(a)} className="absolute right-1 top-1 hidden rounded-full bg-white/90 p-1 text-zinc-500 shadow hover:text-brand group-hover:block" aria-label="Excluir"><X className="h-3 w-3" /></button>
                </div>
              )
            })}
          </div>
          <div className={cn('rounded-xl bg-zinc-50 p-3 transition', n === 0 && 'opacity-50')}>
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500"><span>Nada a ver</span><span className="tabular text-ink">{intensity}%</span><span>Bem parecido</span></div>
            <input type="range" min={0} max={100} step={5} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} disabled={n === 0} className="mt-1 w-full accent-[#E10600]" aria-label="Intensidade da semelhança com os concorrentes" data-testid="intensity" />
            <p className="mt-1 text-xs font-medium text-ink">{n === 0 ? 'Marque ao menos um post para usar.' : intensityLabel(intensity)}</p>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------
// Logo: em quais slides e em qual posição
// ---------------------------------------------------------------------------------
export type LogoWhere = 'none' | 'cover' | 'last' | 'cover_last' | 'all' | 'custom'
export interface LogoUi { where: LogoWhere; custom: number[]; position: LogoPos; size: 'sm' | 'md' | 'lg'; assetId: string | null }
export const defaultLogoUi = (): LogoUi => ({ where: 'last', custom: [], position: 'br', size: 'md', assetId: null })

export function logoSlideList(ui: LogoUi, n: number): number[] {
  const last = Math.max(1, n)
  switch (ui.where) {
    case 'none': return []
    case 'cover': return [1]
    case 'last': return [last]
    case 'cover_last': return last === 1 ? [1] : [1, last]
    case 'all': return Array.from({ length: last }, (_, i) => i + 1)
    default: return ui.custom.filter((x) => x >= 1 && x <= last)
  }
}
export const buildLogoPlan = (ui: LogoUi, n: number, hasLogo: boolean, mainId?: string | null): LogoPlan | null => (hasLogo ? { asset_id: ui.assetId ?? mainId ?? null, position: ui.position, size: ui.size, slides: logoSlideList(ui, n) } : null)
const POS_NAME: Record<LogoPos, string> = { tl: 'canto superior esquerdo', tc: 'topo, no centro', tr: 'canto superior direito', ml: 'meio, à esquerda', mc: 'centro', mr: 'meio, à direita', bl: 'canto inferior esquerdo', bc: 'base, no centro', br: 'canto inferior direito' }
export const logoNoteFor = (ui: LogoUi, n: number): string | null => {
  const s = logoSlideList(ui, n)
  if (!s.length) return null
  const where = ui.where === 'all' ? 'em TODOS os slides' : ui.where === 'cover' ? 'na capa (slide 1)' : ui.where === 'last' ? 'no último slide' : ui.where === 'cover_last' ? 'na capa e no último slide' : `nos slides ${s.join(', ')}`
  return `A logo da marca aparece ${where}, no ${POS_NAME[ui.position]}.`
}

const WHERE_OPTS: [LogoWhere, string][] = [['none', 'Sem logo'], ['cover', 'Capa'], ['last', 'Último'], ['cover_last', 'Capa + último'], ['all', 'Todos'], ['custom', 'Escolher']]
const POS_GRID: LogoPos[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']
const POS_CSS: Record<LogoPos, string> = { tl: 'left-[6%] top-[5%]', tc: 'left-1/2 top-[5%] -translate-x-1/2', tr: 'right-[6%] top-[5%]', ml: 'left-[6%] top-1/2 -translate-y-1/2', mc: 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2', mr: 'right-[6%] top-1/2 -translate-y-1/2', bl: 'bottom-[5%] left-[6%]', bc: 'bottom-[5%] left-1/2 -translate-x-1/2', br: 'bottom-[5%] right-[6%]' }
const SIZE_W: Record<string, number> = { sm: 12, md: 20, lg: 30 }

export function LogoPlanner({ brand, ui, setUi, slidesCount }: { brand: Brand; ui: LogoUi; setUi: (f: (u: LogoUi) => LogoUi) => void; slidesCount: number }) {
  const { data: logos } = useAssets(brand.id, 'logo')
  const list = logos ?? []
  const chosen = list.find((l) => l.id === ui.assetId) ?? list.find((l) => l.id === brand.logo_asset_id) ?? list[0] ?? null
  const set = (p: Partial<LogoUi>) => setUi((u) => ({ ...u, ...p }))
  const n = Math.max(1, slidesCount)
  const active = logoSlideList(ui, n)
  return (
    <div className="space-y-3" data-testid="logo-planner">
      <div className="flex items-center justify-between gap-2">
        <p className="label !mb-0 flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />Logo do cliente</p>
        {!list.length && <Link to={`/studio/library/${brand.id}`} className="text-[11px] font-semibold text-brand hover:underline">Enviar a logo no Treinamento</Link>}
      </div>
      {!list.length ? <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900">{brand.name} ainda não tem logo. Envie em Biblioteca › Treinamento › Logo (pode mandar mais de uma versão).</p> : (
        <>
          {list.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {list.map((l) => <button key={l.id} type="button" onClick={() => set({ assetId: l.id })} title={l.label || l.name} className={cn('h-11 w-14 overflow-hidden rounded-lg bg-[conic-gradient(#f1f1ee_25%,#fff_0_50%,#f1f1ee_0_75%,#fff_0)] bg-[length:12px_12px] p-1 ring-2 transition', chosen?.id === l.id ? 'ring-ink' : 'ring-transparent hover:ring-zinc-300')}><StudioImg path={l.thumb_path ?? l.storage_path} fit="contain" className="h-full w-full bg-transparent" /></button>)}
            </div>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            {WHERE_OPTS.map(([id, t]) => <button key={id} type="button" onClick={() => set({ where: id, custom: id === 'custom' && !ui.custom.length ? logoSlideList({ ...ui, where: ui.where }, n) : ui.custom })} aria-pressed={ui.where === id} className={cn('rounded-xl border px-2 py-2 text-xs font-semibold transition', ui.where === id ? 'border-ink bg-ink text-white' : 'border-zinc-200 hover:border-zinc-400')}>{t}</button>)}
          </div>
          {ui.where === 'custom' && (
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: n }, (_, i) => i + 1).map((i) => { const on = ui.custom.includes(i); return <button key={i} type="button" onClick={() => set({ custom: on ? ui.custom.filter((x) => x !== i) : [...ui.custom, i].sort((a, b) => a - b) })} className={cn('h-8 w-8 rounded-lg border text-xs font-bold', on ? 'border-ink bg-ink text-white' : 'border-zinc-200 hover:border-zinc-400')}>{i}</button> })}
            </div>
          )}
          <div className={cn('flex gap-3', ui.where === 'none' && 'pointer-events-none opacity-40')}>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-zinc-500">Posição</p>
              <div className="grid w-[102px] grid-cols-3 gap-1" role="radiogroup" aria-label="Posição da logo">
                {POS_GRID.map((p) => <button key={p} type="button" role="radio" aria-checked={ui.position === p} title={POS_NAME[p]} onClick={() => set({ position: p })} data-testid={`pos-${p}`} className={cn('h-8 rounded-md border transition', ui.position === p ? 'border-brand bg-brand' : 'border-zinc-200 bg-zinc-50 hover:border-zinc-400')} />)}
              </div>
              <div className="flex gap-1">{(['sm', 'md', 'lg'] as const).map((s) => <button key={s} type="button" onClick={() => set({ size: s })} className={cn('h-7 flex-1 rounded-md border text-[11px] font-bold', ui.size === s ? 'border-ink bg-ink text-white' : 'border-zinc-200 hover:border-zinc-400')}>{s === 'sm' ? 'P' : s === 'md' ? 'M' : 'G'}</button>)}</div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[11px] font-semibold text-zinc-500">Prévia</p>
              <div className="relative mx-auto aspect-[4/5] w-full max-w-[132px] overflow-hidden rounded-xl bg-gradient-to-br from-zinc-200 to-zinc-100 ring-1 ring-black/5">
                <span className="absolute inset-x-[12%] top-[34%] h-1.5 rounded bg-zinc-300" /><span className="absolute inset-x-[12%] top-[42%] h-1.5 w-1/2 rounded bg-zinc-300" />
                {chosen && ui.where !== 'none' && <div className={cn('absolute rounded bg-white/70 p-0.5', POS_CSS[ui.position])} style={{ width: `${SIZE_W[ui.size]}%` }}><StudioImg path={chosen.thumb_path ?? chosen.storage_path} fit="contain" className="aspect-square w-full bg-transparent" /></div>}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">{active.length ? <>Aparece {ui.where === 'all' ? 'em todos os slides' : active.length === 1 ? `no slide ${active[0]}` : `nos slides ${active.join(', ')}`}, no <b className="text-ink">{POS_NAME[ui.position]}</b>. A IA recebe o arquivo da logo e a posição.</> : 'Nenhum slide terá a logo.'}</p>
        </>
      )}
    </div>
  )
}
