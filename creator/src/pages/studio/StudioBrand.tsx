import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, BrainCircuit, GalleryHorizontal, Images, Sparkles, Trash2, WandSparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { errMsg } from '@/lib/utils'
import { ConfirmDialog, EmptyState, PageLoader, Tabs } from '@/components/ui'
import BrandForm from '@/features/studio/BrandForm'
import { useBrand, useLogos } from '@/features/studio/data'
import GenerationFeed from '@/features/studio/Feed'
import References from '@/features/studio/References'
import { BrandAvatar } from './StudioCreate'

type Tab = 'train' | 'refs' | 'creations'

export default function StudioBrand() {
  const { brandId } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const { data: brand, isLoading, error } = useBrand(brandId)
  const { data: logos } = useLogos()
  const [del, setDel] = useState(false)
  const tab = (params.get('tab') as Tab) || 'train'

  if (isLoading) return <PageLoader />
  if (error || !brand) return <EmptyState title="Pasta não encontrada" description="Ela pode ter sido removida ou você não tem acesso." action={<Link className="btn-outline" to="/studio/library">Voltar à biblioteca</Link>} />
  const logo = logos?.get(brand.id)

  const remove = async () => {
    const { error } = await supabase.from('studio_brands').delete().eq('id', brand.id)
    if (error) return toast.error(errMsg(error))
    qc.invalidateQueries({ queryKey: ['studio'] }); toast.success('Pasta excluída'); nav('/studio/library')
  }

  return (
    <div>
      <Link to="/studio/library" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />Biblioteca</Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14"><BrandAvatar brand={brand} logoPath={logo?.thumb_path ?? logo?.storage_path} size={56} /></div>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">{brand.name}</h2>
            <p className="flex items-center gap-2 text-sm text-zinc-500">{brand.is_base ? 'Skill base da agência — vale para todas as marcas' : [brand.segment, brand.handle].filter(Boolean).join(' · ') || 'Pasta de cliente'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && !brand.is_base && <button className="btn-ghost text-zinc-500 hover:text-brand" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" />Excluir pasta</button>}
          <Link to={`/studio?brand=${brand.id}`} className="btn-primary"><WandSparkles className="h-4 w-4" />Abrir no estúdio</Link>
        </div>
      </div>

      <div className="mb-6">
        <Tabs<Tab> value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={[
          { id: 'train', label: 'Treinamento', icon: <BrainCircuit className="h-4 w-4" /> },
          { id: 'refs', label: 'Referências', icon: <Images className="h-4 w-4" /> },
          { id: 'creations', label: 'Criações', icon: <GalleryHorizontal className="h-4 w-4" /> },
        ]} />
      </div>

      <div key={tab} className="animate-fade-up">
        {tab === 'train' && <BrandForm brand={brand} />}
        {tab === 'refs' && (
          <div>
            <p className="mb-4 max-w-2xl text-sm text-zinc-500">Imagens que mostram o estilo real {brand.is_base ? 'da Forte Company' : `de ${brand.name}`}. Depois de enviar, volte em <b>Treinamento</b> e clique em <b>Salvar e treinar</b>.</p>
            <References brandId={brand.id} />
          </div>
        )}
        {tab === 'creations' && (
          <GenerationFeed brand={brand} onEmpty={<EmptyState icon={<Sparkles className="h-5 w-5" />} title="Nenhuma criação ainda" description="As artes geradas para esta marca aparecem aqui." action={<Link to={`/studio?brand=${brand.id}`} className="btn-brand"><WandSparkles className="h-4 w-4" />Criar agora</Link>} />} />
        )}
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={remove} danger title="Excluir pasta" confirmLabel="Excluir" message={<>Excluir <b>{brand.name}</b> com referências, criações e treinamento? Os arquivos do cliente na plataforma não são afetados.</>} />
    </div>
  )
}
