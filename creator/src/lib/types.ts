export type Role = 'admin' | 'collaborator' | 'client'
export type ProjectStatus = 'planning' | 'in_progress' | 'paused' | 'completed' | 'cancelled'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type ApprovalStatus = 'pending' | 'approved' | 'changes_requested' | 'superseded'
export type EventType = 'delivery' | 'publication' | 'approval_deadline' | 'meeting' | 'task' | 'other'
export type Stage =
  | 'todo' | 'planning' | 'production' | 'internal_review' | 'awaiting_client'
  | 'changes_requested' | 'approved' | 'done' | 'custom'

export interface Profile {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
  phone: string | null
  job_title: string | null
  role: Role
  client_id: string | null
  active: boolean
  created_at: string
}

export interface Client {
  id: string
  name: string
  company: string | null
  document: string | null
  email: string | null
  phone: string | null
  segment: string | null
  notes: string | null
  status: 'active' | 'inactive'
  created_at: string
}

export interface Project {
  id: string
  client_id: string
  name: string
  description: string | null
  status: ProjectStatus
  start_date: string | null
  due_date: string | null
  progress: number
  template_id: string | null
  created_at: string
  clients?: { name: string } | null
}

export interface BoardColumn {
  id: string
  project_id: string
  name: string
  stage: Stage
  color: string
  position: number
}

export interface BoardTemplate {
  id: string
  name: string
  description: string | null
  columns: { name: string; stage: Stage; color: string }[]
  is_default: boolean
  created_at: string
}

export interface Task {
  id: string
  project_id: string
  client_id: string
  column_id: string
  stage: Stage
  title: string
  description: string | null
  assignee_id: string | null
  due_date: string | null
  priority: Priority
  labels: string[]
  position: number
  visible_to_client: boolean
  completed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TaskHistory {
  id: number
  task_id: string
  actor_id: string | null
  field: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

export interface Folder {
  id: string
  client_id: string
  project_id: string | null
  parent_id: string | null
  name: string
  created_at: string
}

export interface FileRow {
  id: string
  client_id: string
  project_id: string | null
  folder_id: string | null
  task_id: string | null
  name: string
  mime_type: string
  size_bytes: number
  storage_path: string
  current_version: number
  shared_with_client: boolean
  shared_at: string | null
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

export interface FileVersion {
  id: string
  file_id: string
  version: number
  storage_path: string
  mime_type: string
  size_bytes: number
  notes: string | null
  uploaded_by: string | null
  created_at: string
}

export interface Approval {
  id: string
  client_id: string
  project_id: string | null
  task_id: string | null
  file_id: string
  file_version_id: string
  version: number
  title: string
  message: string | null
  status: ApprovalStatus
  due_date: string | null
  requested_by: string | null
  requested_at: string
  responded_by: string | null
  responded_at: string | null
  response_comment: string | null
}

export interface Comment {
  id: string
  client_id: string
  project_id: string | null
  task_id: string | null
  approval_id: string | null
  parent_id: string | null
  author_id: string
  body: string
  is_internal: boolean
  mentions: string[]
  attachment_file_id: string | null
  edited_at: string | null
  created_at: string
}

export interface CalendarEvent {
  id: string
  client_id: string
  project_id: string | null
  task_id: string | null
  title: string
  description: string | null
  type: EventType
  starts_at: string
  ends_at: string | null
  all_day: boolean
  location: string | null
  visible_to_client: boolean
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  client_id: string | null
  type: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export interface Activity {
  id: number
  client_id: string | null
  project_id: string | null
  actor_id: string | null
  entity_type: string
  entity_id: string | null
  action: string
  summary: string
  details: Record<string, unknown>
  visible_to_client: boolean
  created_at: string
}
