import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { BrainCircuit, Calculator, Clapperboard, Eraser, FolderOpen, Lightbulb, Plug, PanelTop, Rocket, Shapes, WandSparkles } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { ensureBase, useBrands, useProviderStatus, useStudioSettings } from '@/features/studio/data'

/** Casca da área "Criação de conteúdo": título, sub-navegação e criação automática da skill base */
export default function StudioShell() {
  const { isAdmin, profile } = useAuth()
  const qc = useQueryClient()
  const { data: brands } = useBrands()
  const { data: settings } = useStudioSettings()
  const { data: providers } = useProviderStatus()

  useEffect(() => {
    if (isAdmin && profile && brands && !brands.some((b) => b.is_base)) ensureBase(profile.id).then(() => qc.invalidateQueries({ queryKey: ['studio', 'brands'] })).catch(() => null)
  }, [isAdmin, profile, brands, qc])

  const base = brands?.find((b) => b.is_base)
  const tabs = [
    { to: '/studio', label: 'Estúdio', icon: WandSparkles, end: true, tour: 'studio-tab-create' },
    { to: '/studio/ideas', label: 'Criador de prompts', icon: Lightbulb, tour: 'studio-tab-ideas' },
    { to: '/studio/logos', label: 'Criador de logos', icon: Shapes, tour: 'studio-tab-logos' },
    { to: '/studio/thumbs', label: 'Criador de thumbnails', icon: PanelTop, tour: 'studio-tab-thumbs' },
    { to: '/studio/video', label: 'Editor de vídeo', icon: Clapperboard, tour: 'studio-tab-video' },
    { to: '/studio/editor', label: 'Remover IA', icon: Eraser, tour: 'studio-tab-editor' },
    { to: '/studio/library', label: 'Biblioteca', icon: FolderOpen, tour: 'studio-tab-library' },
    { to: '/studio/models', label: 'Modelos e APIs', icon: Plug, tour: 'studio-tab-models', dot: !providers?.length },
    { to: '/studio/costs', label: 'Custos', icon: Calculator, tour: 'studio-tab-costs' },
    ...(isAdmin ? [{ to: '/studio/start', label: settings?.onboarding_done ? 'Treinamento' : 'Começar', icon: Rocket, tour: 'studio-tab-start', dot: !settings?.onboarding_done }] : []),
  ]

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-brand"><BrainCircuit className="h-3.5 w-3.5" />Forte Company · IA</p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-[2rem] sm:leading-tight">Criação de conteúdo</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-zinc-500">Carrosséis e criativos com a identidade de cada cliente. Treine a skill base da agência, crie uma pasta por empresa e gere no estúdio.</p>
        </div>
        {base && (
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3.5 py-2 text-xs shadow-card">
            <span className={cn('h-2 w-2 rounded-full', base.skill_version ? 'bg-emerald-500' : 'bg-amber-400')} />
            <span className="text-zinc-500">Skill base</span><b>{base.skill_version ? `v${base.skill_version} treinada` : 'não treinada'}</b>
          </div>
        )}
      </div>
      {import.meta.env.VITE_SUPABASE_ANON_KEY === 'demo' && (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900"><b>Modo demonstração.</b> Os textos usam a OpenAI de verdade quando há uma chave real conectada; sem chave são simulados. As imagens são sempre simuladas aqui (artes de exemplo).</p>
      )}
      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1 shadow-card sm:inline-flex" data-tour="studio-subnav">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} data-tour={t.tour}
            className={({ isActive }) => cn('relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition', isActive ? 'bg-ink text-white shadow-sm' : 'text-zinc-500 hover:bg-zinc-100 hover:text-ink')}>
            <t.icon className="h-4 w-4" />{t.label}
            {t.dot && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand shadow-[0_0_0_3px_rgba(225,6,0,.2)]" />}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
