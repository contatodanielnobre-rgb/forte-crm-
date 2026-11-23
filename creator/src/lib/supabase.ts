import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) as string | undefined
const url = SUPABASE_URL
const key = SUPABASE_KEY

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 10 } },
})

export const BUCKET = 'materials'

/** Lança erro amigável se a operação do Supabase falhar */
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(translateError(res.error.message))
  return res.data
}

export function translateError(msg: string): string {
  if (/row-level security/i.test(msg)) return 'Você não tem permissão para esta ação.'
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar.'
  if (/duplicate key/i.test(msg)) return 'Este registro já existe.'
  if (/violates foreign key/i.test(msg)) return 'Este item está vinculado a outros registros.'
  if (/Payload too large|exceeded the maximum allowed size/i.test(msg)) return 'Arquivo acima do limite permitido.'
  if (/mime type .* is not supported/i.test(msg)) return 'Formato de arquivo não permitido.'
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Falha de conexão. Verifique sua internet.'
  return msg
}
