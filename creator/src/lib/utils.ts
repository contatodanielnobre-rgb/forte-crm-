import { format, formatDistanceToNow, isPast, isToday, isTomorrow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ApprovalStatus, EventType, Priority, ProjectStatus, Role, Stage } from './types'

export { clsx as cn } from 'clsx'

export const roleLabel: Record<Role, string> = {
  admin: 'Administrador',
  collaborator: 'Colaborador',
  client: 'Cliente',
}

export const projectStatusLabel: Record<ProjectStatus, string> = {
  planning: 'Planejamento',
  in_progress: 'Em andamento',
  paused: 'Pausado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

export const projectStatusColor: Record<ProjectStatus, string> = {
  planning: 'bg-zinc-100 text-zinc-700',
  in_progress: 'bg-blue-50 text-blue-700',
  paused: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-zinc-100 text-zinc-500 line-through',
}

export const priorityLabel: Record<Priority, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' }
export const priorityColor: Record<Priority, string> = {
  low: 'bg-zinc-100 text-zinc-600',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-amber-50 text-amber-700',
  urgent: 'bg-brand-soft text-brand',
}

export const stageLabel: Record<Stage, string> = {
  todo: 'A fazer',
  planning: 'Em planejamento',
  production: 'Em produção',
  internal_review: 'Em revisão interna',
  awaiting_client: 'Aguardando aprovação',
  changes_requested: 'Ajustes solicitados',
  approved: 'Aprovado',
  done: 'Concluído',
  custom: 'Personalizada',
}

export const approvalStatusLabel: Record<ApprovalStatus, string> = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovado',
  changes_requested: 'Alteração solicitada',
  superseded: 'Substituído por nova versão',
}
export const approvalStatusColor: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  changes_requested: 'bg-brand-soft text-brand',
  superseded: 'bg-zinc-100 text-zinc-500',
}

export const eventTypeLabel: Record<EventType, string> = {
  delivery: 'Entrega',
  publication: 'Publicação',
  approval_deadline: 'Prazo de aprovação',
  meeting: 'Reunião',
  task: 'Tarefa',
  other: 'Outro',
}
export const eventTypeColor: Record<EventType, string> = {
  delivery: 'bg-ink text-white',
  publication: 'bg-blue-600 text-white',
  approval_deadline: 'bg-amber-500 text-white',
  meeting: 'bg-violet-600 text-white',
  task: 'bg-zinc-200 text-ink',
  other: 'bg-zinc-100 text-zinc-700',
}

const d = (v: string | Date) => (typeof v === 'string' ? parseISO(v) : v)
export const fmtDate = (v?: string | null) => (v ? format(d(v), 'dd/MM/yyyy', { locale: ptBR }) : '—')
export const fmtDateTime = (v?: string | null) => (v ? format(d(v), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—')
export const fmtShort = (v?: string | null) => (v ? format(d(v), "d 'de' MMM", { locale: ptBR }) : '—')
export const fromNow = (v?: string | null) => (v ? formatDistanceToNow(d(v), { addSuffix: true, locale: ptBR }) : '')
export function dueLabel(v?: string | null) {
  if (!v) return null
  const date = d(v)
  if (isToday(date)) return 'Hoje'
  if (isTomorrow(date)) return 'Amanhã'
  return format(date, "d MMM", { locale: ptBR })
}
export const isOverdue = (v?: string | null, done = false) => !!v && !done && isPast(d(v))

export function fmtBytes(n: number) {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1)
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`
}

export function initials(name?: string | null) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function fileKind(mime: string, name = ''): 'image' | 'video' | 'audio' | 'pdf' | 'sheet' | 'slides' | 'doc' | 'archive' | 'other' {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  if (/sheet|excel|csv/.test(mime) || ['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet'
  if (/presentation|powerpoint/.test(mime) || ['ppt', 'pptx', 'key'].includes(ext)) return 'slides'
  if (/word|text\/plain/.test(mime) || ['doc', 'docx', 'txt'].includes(ext)) return 'doc'
  if (/zip|compressed/.test(mime)) return 'archive'
  return 'other'
}

export function extOf(name: string) {
  const e = name.split('.').pop()
  return e && e !== name ? e.toUpperCase() : 'ARQ'
}

export function slugFileName(name: string) {
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').slice(0, 80)
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  return ext ? `${base || 'arquivo'}.${ext}` : base || 'arquivo'
}

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}
