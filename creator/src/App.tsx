import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { isConfigured } from './lib/supabase'
import { PageLoader } from './components/ui'

const StudioShell = lazy(() => import('./pages/studio/StudioShell'))
const StudioCreate = lazy(() => import('./pages/studio/StudioCreate'))
const StudioLibrary = lazy(() => import('./pages/studio/StudioLibrary'))
const StudioBrand = lazy(() => import('./pages/studio/StudioBrand'))
const StudioModels = lazy(() => import('./pages/studio/StudioModels'))
const StudioStart = lazy(() => import('./pages/studio/StudioStart'))
const StudioIdeas = lazy(() => import('./pages/studio/StudioIdeas'))
const StudioCosts = lazy(() => import('./pages/studio/StudioCosts'))
const StudioEditor = lazy(() => import('./pages/studio/StudioEditor'))
const StudioVideo = lazy(() => import('./pages/studio/StudioVideo'))
const StudioLogos = lazy(() => import('./pages/studio/StudioLogos'))
const StudioThumbs = lazy(() => import('./pages/studio/StudioThumbs'))
const StudioLayouts = lazy(() => import('./pages/studio/StudioLayouts'))

/**
 * Só equipe entra, e SEM tela de login própria: o Criador é uma ferramenta do admin e usa o login do CRM.
 * A sessão chega pela página /criador. Aberto fora do admin, volta para o login do CRM.
 */
function Protected({ children }: { children: ReactNode }) {
  const { session, profile, loading, isStaff, retrySession } = useAuth()
  if (loading) return <div className="flex h-full items-center justify-center"><PageLoader /></div>
  if (!session || !profile || !profile.active || !isStaff) {
    if (window.parent === window) { window.location.replace('/login?next=/criador'); return <PageLoader /> }
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-zinc-500">Não consegui abrir o Criador com o seu login do CRM.</p>
        <button className="btn-outline" onClick={retrySession}>Tentar de novo</button>
      </div>
    )
  }
  return <>{children}</>
}

function Frame() {
  return <div className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-5"><Outlet /></div>
}

export default function App() {
  if (!isConfigured) return <div className="p-8 text-sm">Criador sem configuração do Supabase (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).</div>
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<Protected><Frame /></Protected>}>
          <Route index element={<Navigate to="/studio" replace />} />
          <Route path="studio" element={<StudioShell />}>
            <Route index element={<StudioCreate />} />
            <Route path="ideas" element={<StudioIdeas />} />
            <Route path="library" element={<StudioLibrary />} />
            <Route path="library/:brandId" element={<StudioBrand />} />
            <Route path="models" element={<StudioModels />} />
            <Route path="start" element={<StudioStart />} />
            <Route path="costs" element={<StudioCosts />} />
            <Route path="editor" element={<StudioEditor />} />
            <Route path="video" element={<StudioVideo />} />
            <Route path="logos" element={<StudioLogos />} />
            <Route path="thumbs" element={<StudioThumbs />} />
            <Route path="layouts" element={<StudioLayouts />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/studio" replace />} />
      </Routes>
    </Suspense>
  )
}
