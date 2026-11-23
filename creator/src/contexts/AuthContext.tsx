import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  isStaff: boolean
  isClient: boolean
  refreshProfile: () => Promise<void>
  retrySession: () => void
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const askRef = useRef<() => void>(() => {})

  const loadProfile = useCallback(async (uid?: string) => {
    if (!uid) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile((data as Profile) ?? null)
  }, [])

  useEffect(() => {
    // Dentro do admin (iframe da página /criador) o login é o do CRM: a página-mãe entrega a sessão do Supabase.
    const embedded = window.parent !== window
    const onMsg = async (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || ev.data?.type !== 'creator-session') return
      const { access_token, refresh_token } = ev.data
      if (!access_token || !refresh_token) { setLoading(false); return }
      const { data } = await supabase.auth.setSession({ access_token, refresh_token })
      if (timer) clearInterval(timer)
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      setLoading(false)
    }
    let tries = 0, timer: ReturnType<typeof setInterval> | undefined
    if (embedded) {
      window.addEventListener('message', onMsg)
      const ask = () => { window.parent.postMessage({ type: 'creator-ready' }, window.location.origin) }
      ask()
      // se a resposta do CRM demorar ou falhar, pede de novo (até 6 vezes, a cada 4 s)
      timer = setInterval(() => { if (++tries > 6) { clearInterval(timer); return } ask() }, 4000)
      askRef.current = () => { tries = 0; setLoading(true); ask(); clearInterval(timer); timer = setInterval(() => { if (++tries > 6) { clearInterval(timer); setLoading(false); return } ask() }, 4000) }
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (embedded) { // espera a sessão do CRM; se não vier em 10 s, cai no login normal
        setTimeout(() => setLoading(false), 26000)
        return
      }
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'SIGNED_OUT') {
        setTimeout(() => loadProfile(s?.user.id), 0)
      }
    })
    return () => { sub.subscription.unsubscribe(); window.removeEventListener('message', onMsg); if (timer) clearInterval(timer) }
  }, [loadProfile])

  const value: AuthState = {
    session,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    isStaff: profile?.role === 'admin' || profile?.role === 'collaborator',
    isClient: profile?.role === 'client',
    refreshProfile: () => loadProfile(session?.user.id),
    retrySession: () => askRef.current(),
    signOut: async () => {
      await supabase.auth.signOut()
      setProfile(null)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fora do AuthProvider')
  return v
}
