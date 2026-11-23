import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowUpRight, BrainCircuit, FolderPlus, HardDrive, Images, Sparkles } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useClients } from '@/lib/queries'
import { cn, errMsg, fmtBytes, fromNow } from '@/lib/utils'
import { EmptyState, Field, Input, Modal, Skeleton, Spinner } from '@/components/ui'
import { createBrand, useBrands, useLogos, useStudioSettings, useUsage } from '@/features/studio/data'
import { StudioImg } from '@/features/studio/ui'
import type { Brand } from '@/features/studio/types'

/** Biblioteca estilo Drive: a Skill base da agência + uma pasta para cada cliente */
export default function StudioLibrary() {
  const { profile } = useAuth()
  const { data: brands, isLoading } = useBrands()
  const { data: usage } = useUsage()
  const { data: logos } = useLogos()
  const { data: settings } = useStudioSettings()
  const [modal, setModal] = useState(false)
  const base = brands?.find((b) => b.is_base)
  const folders = (brands ?? []).filter((b) => !b.is_base)
  const total = [...(usage?.values() ?? [])].reduce((s, u) => s + u.bytes, 0)

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-2 text-sm"><HardDrive className="h-4 w-4 text-zinc-400" /><b>Biblioteca</b><span className="text-zinc-400">· {fmtBytes(total)} usados · limite de {fmtBytes(settings?.max_bytes ?? 1073741824)} por pasta</span></nav>
        <button className="btn-brand" onClick={() => setModal(true)} data-tour="studio-new-folder"><FolderPlus className="h-4 w-4" />Nova pasta de cliente</button>
      </div>

      {isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-52" />)}</div> : (
        <>
          {base && (
            <Link to={`/studio/library/${base.id}`} className="surface-dark group relative mb-6 flex flex-col gap-4 overflow-hidden rounded-3xl p-6 text-white shadow-pop transition hover:-translate-y-0.5 sm:flex-row sm:items-center">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-ink shadow-card"><Sparkles className="h-7 w-7" /></span>
              <span className="flex-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">Skill base</span>
                <b className="mt-1 block font-display text-xl tracking-tight">Forte Company — diretrizes gerais</b>
                <span className="mt-1 block max-w-xl text-sm text-zinc-400">Como a agência faz carrosséis e criativos. Vale para todas as marcas; cada pasta de cliente pode sobrescrever.</span>
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <span className={cn('chip', base.skill_version ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-zinc-300')}><BrainCircuit className="h-3 w-3" />{base.skill_version ? `Treinada v${base.skill_version}` : 'Não treinada'}</span>
                <span className="chip bg-white/10 text-zinc-300"><Images className="h-3 w-3" />{usage?.get(base.id)?.refs ?? 0} referências</span>
                <ArrowUpRight className="h-5 w-5 opacity-60 transition group-hover:opacity-100" />
              </span>
            </Link>
          )}
          {!folders.length ? (
            <EmptyState icon={<FolderPlus className="h-6 w-6" />} title="Nenhuma pasta de cliente ainda" description="Crie uma pasta para cada empresa: logo, cores, referências e o estilo de post que a IA deve seguir." action={<button className="btn-brand" onClick={() => setModal(true)}><FolderPlus className="h-4 w-4" />Nova pasta de cliente</button>} />
          ) : (
            <div className="stagger grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {folders.map((b) => <FolderCard key={b.id} b={b} logo={logos?.get(b.id)} u={usage?.get(b.id)} max={settings?.max_bytes ?? 1073741824} />)}
            </div>
          )}
        </>
      )}
      {modal && <NewFolderModal brands={brands ?? []} userId={profile!.id} onClose={() => setModal(false)} />}
    </div>
  )
}

function FolderCard({ b, logo, u, max }: { b: Brand; logo?: { thumb_path: string | null; storage_path: string }; u?: { refs: number; bytes: number }; max: number }) {
  const bytes = u?.bytes ?? 0
  return (
    <Link to={`/studio/library/${b.id}`} className="group relative pt-3">
      {/* aba da pasta, como no Drive */}
      <span className="absolute left-5 top-0 h-4 w-24 rounded-t-xl bg-zinc-200 transition group-hover:bg-zinc-300" />
      <div className="card card-hover relative overflow-hidden rounded-tl-none p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-black/10" style={{ background: logo ? '#fff' : b.colors[0]?.hex ?? '#0B0B0C' }}>
            {logo ? <StudioImg path={logo.thumb_path ?? logo.storage_path} fit="contain" className="h-full w-full bg-white p-1.5" /> : <b className="font-display text-lg text-white">{b.name.slice(0, 2).toUpperCase()}</b>}
          </span>
          <div className="min-w-0 flex-1">
            <b className="block truncate font-display text-base tracking-tight">{b.name}</b>
            <span className="block truncate text-xs text-zinc-500">{[b.segment, b.handle].filter(Boolean).join(' · ') || 'Sem detalhes ainda'}</span>
          </div>
          <ArrowUpRight className="h-4 w-4 text-zinc-300 transition group-hover:text-ink" />
        </div>
        <div className="mt-4 flex h-6 overflow-hidden rounded-lg ring-1 ring-black/5">
          {b.colors.length ? b.colors.map((c, i) => <span key={i} className="flex-1" style={{ background: c.hex }} />) : <span className="flex flex-1 items-center bg-zinc-50 px-2 text-[10px] text-zinc-400">Sem paleta</span>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={cn('chip', b.skill_version ? (b.dirty ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700') : 'bg-zinc-100 text-zinc-600')}><BrainCircuit className="h-3 w-3" />{b.skill_version ? (b.dirty ? `v${b.skill_version} · a treinar` : `Treinada v${b.skill_version}`) : 'Não treinada'}</span>
          <span className="chip bg-zinc-100 text-zinc-600"><Images className="h-3 w-3" />{u?.refs ?? 0}</span>
          <span className="ml-auto text-zinc-400">{b.trained_at ? fromNow(b.trained_at) : 'novo'}</span>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-ink transition-all duration-700" style={{ width: `${Math.max(2, (bytes / max) * 100)}%` }} /></div>
        <p className="mt-1 text-[11px] text-zinc-400">{fmtBytes(bytes)} de {fmtBytes(max)}</p>
      </div>
    </Link>
  )
}

function NewFolderModal({ brands, userId, onClose }: { brands: Brand[]; userId: string; onClose: () => void }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data: clients } = useClients()
  const [clientId] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const free = (clients ?? []).filter((c) => c.status === 'active' && !brands.some((b) => b.client_id === c.id))
  const chosen = free.find((c) => c.id === clientId)
  const go = async () => {
    const finalName = (chosen?.name ?? name).trim()
    if (finalName.length < 2) return toast.error('Escolha um cliente ou digite o nome da empresa')
    setBusy(true)
    try {
      const b = await createBrand({ name: finalName, client_id: chosen?.id ?? null, segment: chosen?.segment ?? null }, userId)
      qc.invalidateQueries({ queryKey: ['studio'] })
      toast.success('Pasta criada — agora preencha o formulário de treinamento')
      nav(`/studio/library/${b.id}`)
    } catch (e) { toast.error(errMsg(e)); setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} size="sm" title="Nova pasta de cliente" subtitle="Cada pasta tem logo, cores, referências e uma skill própria."
      footer={<><button className="btn-outline" onClick={onClose}>Cancelar</button><button className="btn-brand" onClick={go} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />}Criar pasta</button></>}>
      <div className="space-y-4">
        <Field label="Nome da empresa"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Bella Joias" onKeyDown={(e) => e.key === 'Enter' && go()} /></Field>
      </div>
    </Modal>
  )
}
