import {
  pgTable, pgEnum, text, integer, boolean, timestamp, numeric, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createId } from "@/lib/id";

const id = () => text("id").primaryKey().$defaultFn(() => createId());
const money = (name: string) => numeric(name, { precision: 14, scale: 2 }).notNull().default("0");
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

// ───────────── Enums ─────────────
export const roleEnum = pgEnum("role", ["ADMIN", "GESTOR", "COMERCIAL", "OPERACIONAL"]);
export const clientStatusEnum = pgEnum("client_status", ["ONBOARDING", "ATIVO", "PAUSADO", "ENCERRADO"]);
export const journeyKeyEnum = pgEnum("journey_key", ["GRUPO_CRIADO", "CONTRATO", "FORMULARIO", "ONBOARDING", "REUNIOES_SEMANAIS", "RELATORIOS"]);
export const stepStatusEnum = pgEnum("step_status", ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDO"]);
export const contractStatusEnum = pgEnum("contract_status", ["PENDENTE", "ENVIADO", "ASSINADO", "CANCELADO"]);
export const installmentStatusEnum = pgEnum("installment_status", ["PENDENTE", "PAGO", "PARCIAL", "ATRASADO", "CANCELADO"]);
export const appointmentStatusEnum = pgEnum("appointment_status", ["AGENDADO", "REALIZADO", "CANCELADO", "NAO_COMPARECEU"]);
export const taskStatusEnum = pgEnum("task_status", ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA"]);
export const reportStatusEnum = pgEnum("report_status", ["PENDENTE", "ENTREGUE"]);
// SALES COP AI
export const aiPriorityEnum = pgEnum("ai_priority", ["URGENTE", "ALTA", "MEDIA", "BAIXA"]);
export const aiPlanStatusEnum = pgEnum("ai_plan_status", ["RASCUNHO", "APROVADO", "REJEITADO", "ENCERRADO"]);
export const aiItemStatusEnum = pgEnum("ai_item_status", ["PENDENTE", "APROVADO", "REJEITADO", "CONCLUIDO"]);
export const aiFindingStatusEnum = pgEnum("ai_finding_status", ["ABERTO", "RESOLVIDO", "IGNORADO"]);
export const aiSeverityEnum = pgEnum("ai_severity", ["CRITICO", "ALTO", "MEDIO", "BAIXO"]);

export type Role = (typeof roleEnum.enumValues)[number];
export type JourneyKey = (typeof journeyKeyEnum.enumValues)[number];

// ───────────── Usuários ─────────────
export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("COMERCIAL"),
  avatarUrl: text("avatar_url"),
  phone: text("phone"),
  theme: text("theme").notNull().default("system"),
  monthlyGoal: money("monthly_goal"),
  active: boolean("active").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────────── Pipeline ─────────────
export const pipelineStages = pgTable("pipeline_stages", {
  id: id(),
  name: text("name").notNull(),
  order: integer("order").notNull(),
  color: text("color").notNull().default("#6B7280"),
  isWon: boolean("is_won").notNull().default(false),
  isLost: boolean("is_lost").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
});

export const leadSources = pgTable("lead_sources", {
  id: id(),
  name: text("name").notNull().unique(),
});

export const lossReasons = pgTable("loss_reasons", {
  id: id(),
  name: text("name").notNull().unique(),
});

export const leads = pgTable("leads", {
  id: id(),
  name: text("name").notNull(),
  company: text("company"),
  phone: text("phone"),
  email: text("email"),
  segment: text("segment"),
  value: money("value"),
  notes: text("notes"),
  nextActivityAt: timestamp("next_activity_at", { withTimezone: true }),
  lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }).notNull().defaultNow(), // SALES COP: tempo na etapa atual
  wonAt: timestamp("won_at", { withTimezone: true }),
  lostAt: timestamp("lost_at", { withTimezone: true }),
  archived: boolean("archived").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  position: integer("position").notNull().default(0),
  stageId: text("stage_id").notNull().references(() => pipelineStages.id),
  sourceId: text("source_id").references(() => leadSources.id, { onDelete: "set null" }),
  lossReasonId: text("loss_reason_id").references(() => lossReasons.id, { onDelete: "set null" }),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("leads_stage_idx").on(t.stageId), index("leads_owner_idx").on(t.ownerId)]);

export const interactions = pgTable("interactions", {
  id: id(),
  type: text("type").notNull(), // ligacao | whatsapp | email | reuniao | nota | sistema
  content: text("content").notNull(),
  createdAt: createdAt(),
  leadId: text("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => [index("interactions_lead_idx").on(t.leadId), index("interactions_client_idx").on(t.clientId)]);

// ───────────── Clientes ─────────────
export const clients = pgTable("clients", {
  id: id(),
  name: text("name").notNull(),
  company: text("company"),
  cnpj: text("cnpj"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  segment: text("segment"),
  address: text("address"),
  service: text("service"),
  contractValue: money("contract_value"),
  closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
  status: clientStatusEnum("status").notNull().default("ONBOARDING"),
  isDemo: boolean("is_demo").notNull().default(false),
  notes: text("notes"),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
  leadId: text("lead_id").unique().references(() => leads.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("clients_owner_idx").on(t.ownerId)]);

// ───────────── Jornada ─────────────
export const journeySteps = pgTable("journey_steps", {
  id: id(),
  key: journeyKeyEnum("key").notNull(),
  order: integer("order").notNull(),
  status: stepStatusEnum("status").notNull().default("PENDENTE"),
  recurring: boolean("recurring").notNull().default(false),
  dueAt: timestamp("due_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes"),
  data: jsonb("data").$type<Record<string, unknown>>(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("journey_client_key_uq").on(t.clientId, t.key)]);

// ───────────── Financeiro ─────────────
export const contracts = pgTable("contracts", {
  id: id(),
  clientId: text("client_id").notNull().unique().references(() => clients.id, { onDelete: "cascade" }),
  totalValue: money("total_value"),
  downPayment: money("down_payment"),
  installments: integer("installments").notNull().default(1),
  paymentMethod: text("payment_method"),
  firstDueDate: timestamp("first_due_date", { withTimezone: true }),
  discount: money("discount"),
  status: contractStatusEnum("status").notNull().default("PENDENTE"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const installments = pgTable("installments", {
  id: id(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  number: integer("number").notNull(), // 0 = entrada
  description: text("description"),
  amount: money("amount"),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  status: installmentStatusEnum("status").notNull().default("PENDENTE"),
  createdAt: createdAt(),
}, (t) => [index("installments_client_idx").on(t.clientId), index("installments_due_idx").on(t.dueDate)]);

export const payments = pgTable("payments", {
  id: id(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  installmentId: text("installment_id").references(() => installments.id, { onDelete: "set null" }),
  amount: money("amount"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  method: text("method"),
  notes: text("notes"),
  receiptUrl: text("receipt_url"),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("payments_client_idx").on(t.clientId)]);

// ───────────── Agenda / Reuniões ─────────────
export const appointmentTypes = pgTable("appointment_types", {
  id: id(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#D91E3A"),
  isCommercial: boolean("is_commercial").notNull().default(false),
});

export const appointments = pgTable("appointments", {
  id: id(),
  title: text("title").notNull(),
  description: text("description"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  durationMin: integer("duration_min").notNull().default(60),
  link: text("link"),
  status: appointmentStatusEnum("status").notNull().default("AGENDADO"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }), // SALES COP: confirmação da reunião
  isDemo: boolean("is_demo").notNull().default(false),
  typeId: text("type_id").references(() => appointmentTypes.id, { onDelete: "set null" }),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("appointments_start_idx").on(t.startAt), index("appointments_owner_idx").on(t.ownerId)]);

export const meetings = pgTable("meetings", {
  id: id(),
  appointmentId: text("appointment_id").notNull().unique().references(() => appointments.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
  participants: text("participants"),
  agenda: text("agenda"),
  decisions: text("decisions"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const tasks = pgTable("tasks", {
  id: id(),
  title: text("title").notNull(),
  description: text("description"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: taskStatusEnum("status").notNull().default("PENDENTE"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
  meetingId: text("meeting_id").references(() => meetings.id, { onDelete: "set null" }),
  assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
  // SALES COP: tarefas comerciais vinculadas a lead, com prioridade e origem
  leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
  priority: aiPriorityEnum("priority").notNull().default("MEDIA"),
  source: text("source").notNull().default("manual"), // manual | salescop
  planItemId: text("plan_item_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("tasks_client_idx").on(t.clientId), index("tasks_assignee_idx").on(t.assigneeId), index("tasks_lead_idx").on(t.leadId)]);

// ───────────── Relatórios ao cliente ─────────────
export const reports = pgTable("reports", {
  id: id(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  periodLabel: text("period_label"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  status: reportStatusEnum("status").notNull().default("PENDENTE"),
  indicators: jsonb("indicators").$type<Record<string, string>>(),
  observations: text("observations"),
  createdAt: createdAt(),
}, (t) => [index("reports_client_idx").on(t.clientId)]);

// ───────────── Documentos ─────────────
export const documents = pgTable("documents", {
  id: id(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  mimeType: text("mime_type"),
  size: integer("size"),
  category: text("category"),
  clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
  reportId: text("report_id").references(() => reports.id, { onDelete: "set null" }),
  uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("documents_client_idx").on(t.clientId)]);

// ───────────── Ranking ─────────────
export const scoringRules = pgTable("scoring_rules", {
  id: id(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  points: integer("points").notNull(),
  description: text("description"),
});

export const pointEntries = pgTable("point_entries", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ruleKey: text("rule_key").notNull(),
  points: integer("points").notNull(),
  referenceId: text("reference_id"),
  description: text("description"),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("points_unique").on(t.userId, t.ruleKey, t.referenceId), index("points_user_idx").on(t.userId, t.earnedAt)]);

export const awards = pgTable("awards", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon").notNull().default("trophy"),
  kind: text("kind").notNull().default("custom"),
  value: text("value"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const awardGrants = pgTable("award_grants", {
  id: id(),
  awardId: text("award_id").notNull().references(() => awards.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  notes: text("notes"),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("grants_user_idx").on(t.userId)]);

// ───────────── Notificações / Auditoria / Config ─────────────
export const notifications = pgTable("notifications", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body"),
  href: text("href"),
  kind: text("kind").notNull().default("info"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("notifications_user_idx").on(t.userId, t.readAt)]);

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  diff: jsonb("diff"),
  createdAt: createdAt(),
}, (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_created_idx").on(t.createdAt)]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const financeCategories = pgTable("finance_categories", {
  id: id(),
  name: text("name").notNull().unique(),
});

// ───────────── SALES COP AI ─────────────
/** Plano de operação diário gerado pelo agente (um por dia). */
export const aiActionPlans = pgTable("ai_action_plans", {
  id: id(),
  date: text("date").notNull(), // yyyy-MM-dd
  status: aiPlanStatusEnum("status").notNull().default("RASCUNHO"),
  summary: text("summary"),
  generatedBy: text("generated_by").notNull().default("regras"), // regras | ia
  model: text("model"),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
  createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
  approvedById: text("approved_by_id").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("ai_plans_date_uq").on(t.date)]);

export const aiPlanItems = pgTable("ai_plan_items", {
  id: id(),
  planId: text("plan_id").notNull().references(() => aiActionPlans.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
  ruleKey: text("rule_key"),
  title: text("title").notNull(),
  description: text("description"),
  justification: text("justification"),
  expectedResult: text("expected_result"),
  priority: aiPriorityEnum("priority").notNull().default("MEDIA"),
  recommendedTime: text("recommended_time"), // HH:mm
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: aiItemStatusEnum("status").notNull().default("PENDENTE"),
  assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
  leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
  appointmentId: text("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("ai_items_plan_idx").on(t.planId), index("ai_items_assignee_idx").on(t.assigneeId)]);

/** Irregularidades, alertas e recomendações detectadas pela fiscalização. */
export const aiFindings = pgTable("ai_findings", {
  id: id(),
  kind: text("kind").notNull(), // IRREGULARIDADE | ALERTA | RECOMENDACAO | GARGALO
  ruleKey: text("rule_key").notNull(),
  severity: aiSeverityEnum("severity").notNull().default("MEDIO"),
  title: text("title").notNull(),
  detail: text("detail"),
  recommendation: text("recommendation"),
  dedupeKey: text("dedupe_key").notNull(),
  status: aiFindingStatusEnum("status").notNull().default("ABERTO"),
  data: jsonb("data").$type<Record<string, unknown>>(),
  leadId: text("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
  appointmentId: text("appointment_id").references(() => appointments.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }), // vendedor relacionado
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedById: text("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("ai_findings_dedupe_uq").on(t.dedupeKey), index("ai_findings_status_idx").on(t.status, t.severity), index("ai_findings_user_idx").on(t.userId)]);

/** Log de tudo que o agente executa (rotinas, chamadas de IA, ações, mensagens). */
export const aiExecutionLogs = pgTable("ai_execution_logs", {
  id: id(),
  kind: text("kind").notNull(), // rotina | ia | acao | whatsapp | sistema
  action: text("action").notNull(),
  status: text("status").notNull().default("OK"), // OK | ERRO | BLOQUEADO | IGNORADO
  summary: text("summary").notNull(),
  input: jsonb("input"),
  output: jsonb("output"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  durationMs: integer("duration_ms"),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("ai_logs_created_idx").on(t.createdAt), index("ai_logs_kind_idx").on(t.kind, t.action)]);

/** Relatórios inteligentes gerados (histórico). */
export const aiReports = pgTable("ai_reports", {
  id: id(),
  kind: text("kind").notNull(), // diario | semanal | mensal | vendedor | conversao | produtividade | gargalos
  title: text("title").notNull(),
  periodFrom: timestamp("period_from", { withTimezone: true }).notNull(),
  periodTo: timestamp("period_to", { withTimezone: true }).notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }), // relatório individual
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  narrative: text("narrative"),
  generatedBy: text("generated_by").notNull().default("regras"),
  createdAt: createdAt(),
}, (t) => [index("ai_reports_kind_idx").on(t.kind, t.createdAt)]);

/** Mensagens trocadas via WhatsApp Business Cloud API. */
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: id(),
  direction: text("direction").notNull(), // IN | OUT
  waId: text("wa_id").notNull(), // telefone (E.164 sem +)
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body"),
  template: text("template"),
  waMessageId: text("wa_message_id"),
  status: text("status").notNull().default("PENDENTE"), // PENDENTE | ENVIADA | ENTREGUE | LIDA | FALHA | RECEBIDA
  error: text("error"),
  payload: jsonb("payload"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("wa_msg_id_uq").on(t.waMessageId), index("wa_user_idx").on(t.userId, t.createdAt)]);

// ───────────── FORTE CHAT ─────────────
export const chatTaskTypeEnum = pgEnum("chat_task_type", ["ENVIAR_MENSAGEM", "ENVIAR_AUDIO", "ENVIAR_DOCUMENTO", "ENVIAR_IMAGEM", "LIGACAO", "FOLLOW_UP", "REUNIAO", "RETORNAR_CONTATO", "OUTRA"]);
export const chatTaskStatusEnum = pgEnum("chat_task_status", ["AGENDADA", "EM_PROCESSAMENTO", "ENVIADA", "FALHOU", "CANCELADA", "CONCLUIDA", "AGUARDANDO_ENVIO_MANUAL"]);

/** Etiquetas coloridas (compartilhadas por toda a empresa). */
export const chatLabels = pgTable("chat_labels", {
  id: id(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#6B7280"),
  order: integer("order").notNull().default(0),
  createdAt: createdAt(),
});

/** Etiquetas vinculadas ao cadastro do contato (lead e/ou cliente) — a mesma etiqueta aparece no chat e no CRM. */
export const chatContactLabels = pgTable("chat_contact_labels", {
  id: id(),
  labelId: text("label_id").notNull().references(() => chatLabels.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").references(() => chatConversations.id, { onDelete: "cascade" }), // contato ainda não cadastrado
  createdAt: createdAt(),
}, (t) => [uniqueIndex("chat_cl_lead_uq").on(t.labelId, t.leadId), uniqueIndex("chat_cl_client_uq").on(t.labelId, t.clientId), uniqueIndex("chat_cl_conv_uq").on(t.labelId, t.conversationId)]);

/** Uma conversa por número de WhatsApp — nunca duplica contato. Vinculada ao lead e/ou cliente. */
export const chatConversations = pgTable("chat_conversations", {
  id: id(),
  waId: text("wa_id").notNull().unique(), // telefone E.164 sem "+"
  profileName: text("profile_name"), // nome do perfil no WhatsApp
  leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
  assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull().default("ABERTA"), // ABERTA | AGUARDANDO | RESOLVIDA
  archived: boolean("archived").notNull().default(false),
  unreadCount: integer("unread_count").notNull().default(0),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  lastMessagePreview: text("last_message_preview"),
  lastMessageDirection: text("last_message_direction"),
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }), // janela de atendimento de 24h
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("chat_conv_last_idx").on(t.lastMessageAt), index("chat_conv_lead_idx").on(t.leadId), index("chat_conv_client_idx").on(t.clientId), index("chat_conv_assignee_idx").on(t.assigneeId)]);

/** Favoritas são por usuário. */
export const chatFavorites = pgTable("chat_favorites", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => chatConversations.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("chat_fav_uq").on(t.userId, t.conversationId)]);

/** Arquivos (áudios, imagens, documentos). A URL de armazenamento nunca é exposta: o acesso passa por /api/chat/media/[id]. */
export const chatMedia = pgTable("chat_media", {
  id: id(),
  storageUrl: text("storage_url").notNull(),
  storageAccess: text("storage_access").notNull().default("local"), // local | private | public
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull().default(0),
  durationSec: integer("duration_sec"),
  kind: text("kind").notNull(), // image | audio | document | video | sticker
  waMediaId: text("wa_media_id"),
  sha256: text("sha256"),
  uploadedById: text("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const chatMessages = pgTable("chat_messages", {
  id: id(),
  conversationId: text("conversation_id").notNull().references(() => chatConversations.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(), // IN | OUT
  type: text("type").notNull().default("text"), // text | image | audio | document | video | sticker | location | template | contacts | reaction | unsupported
  body: text("body"),
  mediaId: text("media_id").references(() => chatMedia.id, { onDelete: "set null" }),
  replyToId: text("reply_to_id"),
  forwardedFromId: text("forwarded_from_id"),
  senderId: text("sender_id").references(() => users.id, { onDelete: "set null" }),
  waMessageId: text("wa_message_id"),
  idempotencyKey: text("idempotency_key"),
  status: text("status").notNull().default("PENDENTE"), // PENDENTE | ENVIADA | ENTREGUE | LIDA | FALHA | RECEBIDA
  error: text("error"),
  template: text("template"),
  scheduledTaskId: text("scheduled_task_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedById: text("deleted_by_id").references(() => users.id, { onDelete: "set null" }),
  payload: jsonb("payload"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("chat_msg_wa_uq").on(t.waMessageId), uniqueIndex("chat_msg_idem_uq").on(t.idempotencyKey), index("chat_msg_conv_idx").on(t.conversationId, t.createdAt), index("chat_msg_updated_idx").on(t.updatedAt)]);

/** Tarefas/mensagens agendadas. Processadas no backend (/api/chat/scheduler), mesmo com o CRM fechado. */
export const chatScheduledTasks = pgTable("chat_scheduled_tasks", {
  id: id(),
  title: text("title").notNull(),
  type: chatTaskTypeEnum("type").notNull(),
  status: chatTaskStatusEnum("status").notNull().default("AGENDADA"),
  description: text("description"), // texto da mensagem para ENVIAR_MENSAGEM / legenda dos anexos
  runAt: timestamp("run_at", { withTimezone: true }).notNull(),
  recurrence: text("recurrence").notNull().default("NONE"), // NONE | DAILY | WEEKLY | MONTHLY
  conversationId: text("conversation_id").references(() => chatConversations.id, { onDelete: "set null" }),
  leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
  assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
  createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
  mediaId: text("media_id").references(() => chatMedia.id, { onDelete: "set null" }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }), // espelho na tabela tasks (agenda, SALES COP)
  appointmentId: text("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  lockToken: text("lock_token"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  remindedAt: timestamp("reminded_at", { withTimezone: true }),
  lastError: text("last_error"),
  resultMessageId: text("result_message_id"),
  parentId: text("parent_id"), // ocorrência anterior (recorrência)
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("chat_tasks_due_idx").on(t.status, t.runAt), index("chat_tasks_assignee_idx").on(t.assigneeId, t.runAt), index("chat_tasks_conv_idx").on(t.conversationId)]);

export const chatTaskAttempts = pgTable("chat_task_attempts", {
  id: id(),
  taskId: text("task_id").notNull().references(() => chatScheduledTasks.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // OK | ERRO | BLOQUEADO
  detail: text("detail"),
  waMessageId: text("wa_message_id"),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }), // manual
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [index("chat_attempts_task_idx").on(t.taskId)]);

export const chatConversationsRelations = relations(chatConversations, ({ one, many }) => ({
  lead: one(leads, { fields: [chatConversations.leadId], references: [leads.id] }),
  client: one(clients, { fields: [chatConversations.clientId], references: [clients.id] }),
  assignee: one(users, { fields: [chatConversations.assigneeId], references: [users.id] }),
  messages: many(chatMessages),
}));
export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, { fields: [chatMessages.conversationId], references: [chatConversations.id] }),
  media: one(chatMedia, { fields: [chatMessages.mediaId], references: [chatMedia.id] }),
  sender: one(users, { fields: [chatMessages.senderId], references: [users.id] }),
}));
export const chatContactLabelsRelations = relations(chatContactLabels, ({ one }) => ({ label: one(chatLabels, { fields: [chatContactLabels.labelId], references: [chatLabels.id] }) }));
export const chatScheduledTasksRelations = relations(chatScheduledTasks, ({ one, many }) => ({
  conversation: one(chatConversations, { fields: [chatScheduledTasks.conversationId], references: [chatConversations.id] }),
  lead: one(leads, { fields: [chatScheduledTasks.leadId], references: [leads.id] }),
  client: one(clients, { fields: [chatScheduledTasks.clientId], references: [clients.id] }),
  assignee: one(users, { fields: [chatScheduledTasks.assigneeId], references: [users.id] }),
  media: one(chatMedia, { fields: [chatScheduledTasks.mediaId], references: [chatMedia.id] }),
  attemptsLog: many(chatTaskAttempts),
}));
export const chatTaskAttemptsRelations = relations(chatTaskAttempts, ({ one }) => ({ task: one(chatScheduledTasks, { fields: [chatTaskAttempts.taskId], references: [chatScheduledTasks.id] }) }));

// ───────────── Relations (para db.query) ─────────────
export const aiActionPlansRelations = relations(aiActionPlans, ({ one, many }) => ({
  items: many(aiPlanItems),
  createdBy: one(users, { fields: [aiActionPlans.createdById], references: [users.id] }),
  approvedBy: one(users, { fields: [aiActionPlans.approvedById], references: [users.id] }),
}));
export const aiPlanItemsRelations = relations(aiPlanItems, ({ one }) => ({
  plan: one(aiActionPlans, { fields: [aiPlanItems.planId], references: [aiActionPlans.id] }),
  assignee: one(users, { fields: [aiPlanItems.assigneeId], references: [users.id] }),
  lead: one(leads, { fields: [aiPlanItems.leadId], references: [leads.id] }),
  client: one(clients, { fields: [aiPlanItems.clientId], references: [clients.id] }),
  appointment: one(appointments, { fields: [aiPlanItems.appointmentId], references: [appointments.id] }),
  task: one(tasks, { fields: [aiPlanItems.taskId], references: [tasks.id] }),
}));
export const aiFindingsRelations = relations(aiFindings, ({ one }) => ({
  lead: one(leads, { fields: [aiFindings.leadId], references: [leads.id] }),
  client: one(clients, { fields: [aiFindings.clientId], references: [clients.id] }),
  appointment: one(appointments, { fields: [aiFindings.appointmentId], references: [appointments.id] }),
  user: one(users, { fields: [aiFindings.userId], references: [users.id] }),
}));
export const aiExecutionLogsRelations = relations(aiExecutionLogs, ({ one }) => ({ actor: one(users, { fields: [aiExecutionLogs.actorId], references: [users.id] }) }));
export const aiReportsRelations = relations(aiReports, ({ one }) => ({ user: one(users, { fields: [aiReports.userId], references: [users.id] }) }));
export const whatsappMessagesRelations = relations(whatsappMessages, ({ one }) => ({ user: one(users, { fields: [whatsappMessages.userId], references: [users.id] }) }));

export const usersRelations = relations(users, ({ many }) => ({
  leads: many(leads), clients: many(clients), appointments: many(appointments), tasks: many(tasks),
  points: many(pointEntries), awardGrants: many(awardGrants), notifications: many(notifications),
}));
export const leadsRelations = relations(leads, ({ one, many }) => ({
  stage: one(pipelineStages, { fields: [leads.stageId], references: [pipelineStages.id] }),
  source: one(leadSources, { fields: [leads.sourceId], references: [leadSources.id] }),
  lossReason: one(lossReasons, { fields: [leads.lossReasonId], references: [lossReasons.id] }),
  owner: one(users, { fields: [leads.ownerId], references: [users.id] }),
  interactions: many(interactions),
  appointments: many(appointments),
  tasks: many(tasks),
  client: one(clients, { fields: [leads.id], references: [clients.leadId] }),
}));
export const pipelineStagesRelations = relations(pipelineStages, ({ many }) => ({ leads: many(leads) }));
export const leadSourcesRelations = relations(leadSources, ({ many }) => ({ leads: many(leads) }));
export const lossReasonsRelations = relations(lossReasons, ({ many }) => ({ leads: many(leads) }));
export const interactionsRelations = relations(interactions, ({ one }) => ({
  lead: one(leads, { fields: [interactions.leadId], references: [leads.id] }),
  client: one(clients, { fields: [interactions.clientId], references: [clients.id] }),
  user: one(users, { fields: [interactions.userId], references: [users.id] }),
}));
export const clientsRelations = relations(clients, ({ one, many }) => ({
  owner: one(users, { fields: [clients.ownerId], references: [users.id] }),
  lead: one(leads, { fields: [clients.leadId], references: [leads.id] }),
  journeySteps: many(journeySteps),
  contract: one(contracts, { fields: [clients.id], references: [contracts.clientId] }),
  installments: many(installments),
  payments: many(payments),
  appointments: many(appointments),
  tasks: many(tasks),
  reports: many(reports),
  documents: many(documents),
  interactions: many(interactions),
  meetings: many(meetings),
}));
export const journeyStepsRelations = relations(journeySteps, ({ one }) => ({
  client: one(clients, { fields: [journeySteps.clientId], references: [clients.id] }),
  owner: one(users, { fields: [journeySteps.ownerId], references: [users.id] }),
}));
export const contractsRelations = relations(contracts, ({ one }) => ({
  client: one(clients, { fields: [contracts.clientId], references: [clients.id] }),
}));
export const installmentsRelations = relations(installments, ({ one, many }) => ({
  client: one(clients, { fields: [installments.clientId], references: [clients.id] }),
  payments: many(payments),
}));
export const paymentsRelations = relations(payments, ({ one }) => ({
  client: one(clients, { fields: [payments.clientId], references: [clients.id] }),
  installment: one(installments, { fields: [payments.installmentId], references: [installments.id] }),
  user: one(users, { fields: [payments.userId], references: [users.id] }),
}));
export const appointmentTypesRelations = relations(appointmentTypes, ({ many }) => ({ appointments: many(appointments) }));
export const appointmentsRelations = relations(appointments, ({ one }) => ({
  type: one(appointmentTypes, { fields: [appointments.typeId], references: [appointmentTypes.id] }),
  owner: one(users, { fields: [appointments.ownerId], references: [users.id] }),
  client: one(clients, { fields: [appointments.clientId], references: [clients.id] }),
  lead: one(leads, { fields: [appointments.leadId], references: [leads.id] }),
  meeting: one(meetings, { fields: [appointments.id], references: [meetings.appointmentId] }),
}));
export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  appointment: one(appointments, { fields: [meetings.appointmentId], references: [appointments.id] }),
  client: one(clients, { fields: [meetings.clientId], references: [clients.id] }),
  tasks: many(tasks),
}));
export const tasksRelations = relations(tasks, ({ one }) => ({
  client: one(clients, { fields: [tasks.clientId], references: [clients.id] }),
  meeting: one(meetings, { fields: [tasks.meetingId], references: [meetings.id] }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id] }),
  lead: one(leads, { fields: [tasks.leadId], references: [leads.id] }),
}));
export const reportsRelations = relations(reports, ({ one, many }) => ({
  client: one(clients, { fields: [reports.clientId], references: [clients.id] }),
  documents: many(documents),
}));
export const documentsRelations = relations(documents, ({ one }) => ({
  client: one(clients, { fields: [documents.clientId], references: [clients.id] }),
  report: one(reports, { fields: [documents.reportId], references: [reports.id] }),
  user: one(users, { fields: [documents.uploadedBy], references: [users.id] }),
}));
export const pointEntriesRelations = relations(pointEntries, ({ one }) => ({
  user: one(users, { fields: [pointEntries.userId], references: [users.id] }),
}));
export const awardsRelations = relations(awards, ({ many }) => ({ grants: many(awardGrants) }));
export const awardGrantsRelations = relations(awardGrants, ({ one }) => ({
  award: one(awards, { fields: [awardGrants.awardId], references: [awards.id] }),
  user: one(users, { fields: [awardGrants.userId], references: [users.id] }),
}));
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export { sql };
