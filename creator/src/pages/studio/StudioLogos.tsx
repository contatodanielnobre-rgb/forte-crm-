import { useEffect, useState } from 'react'
import { Shapes } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui'
import { useBrands } from '@/features/studio/data'
import Studio from '@/features/logo/Studio'
import Training from '@/features/logo/Training'
import { BrandAvatar } from './StudioCreate'

const KEY = 'fcc-studio-brand'

/** Criador de logos: treinamento com logos de referência → estúdio (formulário + IA) → editor de cores/layout → branding */
export default function StudioLogos() {
  const { data: brands } = useBrands()
  const [brandId, setBrandId] = useState<string | null>(null)
  const stored = (() => { try { return localStorage.getItem(KEY) } catch { return null } })()
  const brand = brands?.find((b) => b.id === (brandId ?? stored)) ?? brands?.find((b) => b.is_base) ?? brands?.[0]
  const base = brands?.find((b) => b.is_base)
  const [tab, setTab] = useState<'studio' | 'train'>('studio')
  const [chosen, setChosen] = useState(false)

  // primeira vez sem nenhum treino: sugere começar pelo treinamento
  const anyTrained = !!brands?.some((b) => (b.logo_skill_version ?? 0) > 0)
  useEffect(() => { if (brands && !chosen) { setChosen(true); if (!anyTrained) setTab('train') } }, [brands, anyTrained, chosen])

  if (!brands || !brand) return <Skeleton className="h-64 w-full" />
  const trained = (brand.logo_skill_version ?? 0) > 0 || (base?.logo_skill_version ?? 0) > 0

  return (
    <div className="space-y-5" data-testid="studio-logos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-white"><Shapes className="h-5 w-5" /></span>
          <div><h2 className="font-display text-lg font-bold tracking-tight">Criador de logos</h2><p className="text-xs text-zinc-500">Treine com as logos que você admira, responda o formulário e a IA cria logos únicas. Depois edite cores e layout sem gastar IA e gere o branding.</p></div>
        </div>
        <div className={cn('flex items-center gap-2 rounded-2xl border bg-white px-3.5 py-2 text-xs shadow-card', trained ? 'border-emerald-200' : 'border-amber-200')} data-testid="logo-train-status">
          <span className={cn('h-2 w-2 rounded-full', trained ? 'bg-emerald-500' : 'bg-amber-400')} />
          <span className="text-zinc-500">Treinamento</span>
          <b>{trained ? [base?.logo_skill_version ? `agência v${base.logo_skill_version}` : '', !brand.is_base && brand.logo_skill_version ? `${brand.name} v${brand.logo_skill_version}` : ''].filter(Boolean).join(' · ') : 'não treinado'}</b>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <nav className="flex gap-1 rounded-2xl border border-zinc-200 bg-white p-1 shadow-card">
          {([['studio', 'Estúdio de logos'], ['train', 'Treinamento']] as const).map(([id, l]) => (
            <button key={id} type="button" onClick={() => setTab(id)} data-testid={`ltab-${id}`} className={cn('rounded-xl px-4 py-2 text-sm font-medium transition', tab === id ? 'bg-ink text-white' : 'text-zinc-500 hover:bg-zinc-100')}>{l}</button>
          ))}
        </nav>
        <div className="card flex min-w-[240px] flex-1 items-center gap-2.5 p-1.5 pr-3 sm:max-w-md">
          <BrandAvatar brand={brand} size={34} />
          <select value={brand.id} onChange={(e) => { setBrandId(e.target.value); try { localStorage.setItem(KEY, e.target.value) } catch { /* noop */ } }} className="h-9 min-w-0 flex-1 bg-transparent text-sm font-semibold focus:outline-none" aria-label="Empresa" data-testid="logo-brand">
            {brands.map((b) => <option key={b.id} value={b.id}>{b.is_base ? 'Padrão da agência (todas as empresas)' : b.name}</option>)}
          </select>
        </div>
      </div>

      {tab === 'train' ? <Training key={brand.id} brand={brand} base={base} onTrained={() => setTab('studio')} /> : <Studio key={brand.id} brand={brand} trained={trained} />}
    </div>
  )
}
