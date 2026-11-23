import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from './contexts/AuthContext'
import App from './App'
import './index.css'

// Tema: dentro do admin segue o modo (claro/escuro) dele; sozinho segue o sistema.
function syncTheme() {
  try {
    const parent = window.parent !== window ? window.parent.document.documentElement : null
    const dark = parent ? parent.classList.contains('dark') : window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.classList.toggle('dark', dark)
  } catch { /* página-mãe de outra origem */ }
}
syncTheme()
try { if (window.parent !== window) new MutationObserver(syncTheme).observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ['class'] }) } catch { /* ok */ }
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme)

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 15_000 } },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter basename="/creator">
        <AuthProvider>
          <App />
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
