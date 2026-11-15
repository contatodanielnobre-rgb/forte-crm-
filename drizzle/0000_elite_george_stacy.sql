CREATE TYPE "public"."appointment_status" AS ENUM('AGENDADO', 'REALIZADO', 'CANCELADO', 'NAO_COMPARECEU');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('ONBOARDING', 'ATIVO', 'PAUSADO', 'ENCERRADO');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('PENDENTE', 'ENVIADO', 'ASSINADO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."installment_status" AS ENUM('PENDENTE', 'PAGO', 'PARCIAL', 'ATRASADO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."journey_key" AS ENUM('GRUPO_CRIADO', 'CONTRATO', 'FORMULARIO', 'ONBOARDING', 'REUNIOES_SEMANAIS', 'RELATORIOS');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('PENDENTE', 'ENTREGUE');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'GESTOR', 'COMERCIAL', 'OPERACIONAL');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA');--> statement-breakpoint
CREATE TABLE "appointment_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#D91E3A' NOT NULL,
	"is_commercial" boolean DEFAULT false NOT NULL,
	CONSTRAINT "appointment_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_at" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"link" text,
	"status" "appointment_status" DEFAULT 'AGENDADO' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"type_id" text,
	"owner_id" text,
	"client_id" text,
	"lead_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "award_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"award_id" text NOT NULL,
	"user_id" text NOT NULL,
	"period" text NOT NULL,
	"notes" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "awards" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'trophy' NOT NULL,
	"kind" text DEFAULT 'custom' NOT NULL,
	"value" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"cnpj" text,
	"phone" text,
	"whatsapp" text,
	"email" text,
	"segment" text,
	"address" text,
	"service" text,
	"contract_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "client_status" DEFAULT 'ONBOARDING' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"notes" text,
	"owner_id" text,
	"lead_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_lead_id_unique" UNIQUE("lead_id")
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"total_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"down_payment" numeric(14, 2) DEFAULT '0' NOT NULL,
	"installments" integer DEFAULT 1 NOT NULL,
	"payment_method" text,
	"first_due_date" timestamp with time zone,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "contract_status" DEFAULT 'PENDENTE' NOT NULL,
	"sent_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" text,
	"size" integer,
	"category" text,
	"client_id" text,
	"report_id" text,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "finance_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "installments" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"number" integer NOT NULL,
	"description" text,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"status" "installment_status" DEFAULT 'PENDENTE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lead_id" text,
	"client_id" text,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "journey_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"key" "journey_key" NOT NULL,
	"order" integer NOT NULL,
	"status" "step_status" DEFAULT 'PENDENTE' NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"notes" text,
	"data" jsonb,
	"client_id" text NOT NULL,
	"owner_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "lead_sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"phone" text,
	"email" text,
	"segment" text,
	"value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"next_activity_at" timestamp with time zone,
	"last_contact_at" timestamp with time zone,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"won_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"stage_id" text NOT NULL,
	"source_id" text,
	"loss_reason_id" text,
	"owner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loss_reasons" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "loss_reasons_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"client_id" text,
	"participants" text,
	"agenda" text,
	"decisions" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_appointment_id_unique" UNIQUE("appointment_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"kind" text DEFAULT 'info' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"installment_id" text,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text,
	"notes" text,
	"receipt_url" text,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL,
	"color" text DEFAULT '#6B7280' NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"rule_key" text NOT NULL,
	"points" integer NOT NULL,
	"reference_id" text,
	"description" text,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"title" text NOT NULL,
	"period_label" text,
	"due_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"status" "report_status" DEFAULT 'PENDENTE' NOT NULL,
	"indicators" jsonb,
	"observations" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"points" integer NOT NULL,
	"description" text,
	CONSTRAINT "scoring_rules_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"status" "task_status" DEFAULT 'PENDENTE' NOT NULL,
	"completed_at" timestamp with time zone,
	"client_id" text,
	"meeting_id" text,
	"assignee_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'COMERCIAL' NOT NULL,
	"avatar_url" text,
	"phone" text,
	"theme" text DEFAULT 'system' NOT NULL,
	"monthly_goal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_type_id_appointment_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."appointment_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_grants" ADD CONSTRAINT "award_grants_award_id_awards_id_fk" FOREIGN KEY ("award_id") REFERENCES "public"."awards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_grants" ADD CONSTRAINT "award_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_loss_reason_id_loss_reasons_id_fk" FOREIGN KEY ("loss_reason_id") REFERENCES "public"."loss_reasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_installment_id_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."installments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_start_idx" ON "appointments" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "appointments_owner_idx" ON "appointments" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "grants_user_idx" ON "award_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clients_owner_idx" ON "clients" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "documents_client_idx" ON "documents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "installments_client_idx" ON "installments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "installments_due_idx" ON "installments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "interactions_lead_idx" ON "interactions" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "interactions_client_idx" ON "interactions" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_client_key_uq" ON "journey_steps" USING btree ("client_id","key");--> statement-breakpoint
CREATE INDEX "leads_stage_idx" ON "leads" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "leads_owner_idx" ON "leads" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "payments_client_idx" ON "payments" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "points_unique" ON "point_entries" USING btree ("user_id","rule_key","reference_id");--> statement-breakpoint
CREATE INDEX "points_user_idx" ON "point_entries" USING btree ("user_id","earned_at");--> statement-breakpoint
CREATE INDEX "reports_client_idx" ON "reports" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "tasks_client_idx" ON "tasks" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id");