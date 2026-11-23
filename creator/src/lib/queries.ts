import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { must, supabase } from './supabase'
import type { Client, Notification, Profile, Project } from './types'

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => must(await supabase.from('profiles').select('*').order('full_name')) as Profile[],
    staleTime: 60_000,
  })
}

export function useProfileMap() {
  const { data } = useProfiles()
  const map = new Map<string, Profile>()
  data?.forEach((p) => map.set(p.id, p))
  return map
}

/** Equipe com acesso a um cliente (para atribuição e menções) */
export function useStaffFor(clientId?: string | null) {
  const { data: profiles } = useProfiles()
  const { data: members } = useQuery({
    queryKey: ['client_members', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase.from('client_members').select('user_id').eq('client_id', clientId!)
      return (data ?? []).map((m) => m.user_id as string)
    },
  })
  return (profiles ?? []).filter((p) => p.active && (p.role === 'admin' || (p.role === 'collaborator' && (!members || members.includes(p.id)))))
}

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => must(await supabase.from('clients').select('*').order('name')) as Client[],
  })
}

export function useClient(id?: string) {
  return useQuery({
    queryKey: ['clients', id],
    enabled: !!id,
    queryFn: async () => must(await supabase.from('clients').select('*').eq('id', id!).single()) as Client,
  })
}

export function useProjects(clientId?: string) {
  return useQuery({
    queryKey: ['projects', clientId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('projects').select('*, clients(name)').order('created_at', { ascending: false })
      if (clientId) q = q.eq('client_id', clientId)
      return must(await q) as Project[]
    },
  })
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () =>
      must(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50)) as Notification[],
  })
}

const TABLE_KEYS: Record<string, string[][]> = {
  tasks: [['tasks'], ['dashboard'], ['projects'], ['task_history'], ['calendar']],
  board_columns: [['columns']],
  comments: [['comments']],
  approvals: [['approvals'], ['dashboard'], ['tasks']],
  files: [['files'], ['approvals']],
  activity_log: [['activity']],
  projects: [['projects'], ['dashboard']],
  events: [['calendar']],
  notifications: [['notifications']],
  studio_images: [['studio', 'generations']],
  studio_generations: [['studio', 'generations']],
}

/** Assina mudanças do banco e atualiza a interface sem recarregar. */
export function useRealtimeSync(userId?: string) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!userId) return
    const ch = supabase.channel(`sync-${userId}`)
    Object.keys(TABLE_KEYS).forEach((table) => {
      const filter = table === 'notifications' ? `user_id=eq.${userId}` : undefined
      ch.on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, (payload) => {
        TABLE_KEYS[table].forEach((key) => qc.invalidateQueries({ queryKey: key }))
        if (table === 'notifications' && payload.eventType === 'INSERT') {
          const n = payload.new as Notification
          toast(n.title, { description: n.body ?? undefined })
        }
      })
    })
    ch.subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [userId, qc])
}
