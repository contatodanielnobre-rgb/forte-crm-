CREATE TYPE "public"."ai_finding_status" AS ENUM('ABERTO', 'RESOLVIDO', 'IGNORADO');--> statement-breakpoint
CREATE TYPE "public"."ai_item_status" AS ENUM('PENDENTE', 'APROVADO', 'REJEITADO', 'CONCLUIDO');--> statement-breakpoint
CREATE TYPE "public"."ai_plan_status" AS ENUM('RASCUNHO', 'APROVADO', 'REJEITADO', 'ENCERRADO');--> statement-breakpoint
CREATE TYPE "public"."ai_priority" AS ENUM('URGENTE', 'ALTA', 'MEDIA', 'BAIXA');--> statement-breakpoint
CREATE TYPE "public"."ai_severity" AS ENUM('CRITICO', 'ALTO', 'MEDIO', 'BAIXO');--> statement-breakpoint
CREATE TABLE "ai_action_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"status" "ai_plan_status" DEFAULT 'RASCUNHO' NOT NULL,
	"summary" text,
	"generated_by" text DEFAULT 'regras' NOT NULL,
	"model" text,
	"snapshot" jsonb,
	"created_by_id" text,
	"approved_by_id" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_execution_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"action" text NOT NULL,
	"status" text DEFAULT 'OK' NOT NULL,
	"summary" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"tokens_in" integer,
	"tokens_out" integer,
	"duration_ms" integer,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"rule_key" text NOT NULL,
	"severity" "ai_severity" DEFAULT 'MEDIO' NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"recommendation" text,
	"dedupe_key" text NOT NULL,
	"status" "ai_finding_status" DEFAULT 'ABERTO' NOT NULL,
	"data" jsonb,
	"lead_id" text,
	"client_id" text,
	"appointment_id" text,
	"user_id" text,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_plan_items" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"rule_key" text,
	"title" text NOT NULL,
	"description" text,
	"justification" text,
	"expected_result" text,
	"priority" "ai_priority" DEFAULT 'MEDIA' NOT NULL,
	"recommended_time" text,
	"due_at" timestamp with time zone,
	"status" "ai_item_status" DEFAULT 'PENDENTE' NOT NULL,
	"assignee_id" text,
	"lead_id" text,
	"client_id" text,
	"appointment_id" text,
	"task_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"user_id" text,
	"content" jsonb NOT NULL,
	"narrative" text,
	"generated_by" text DEFAULT 'regras' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"direction" text NOT NULL,
	"wa_id" text NOT NULL,
	"user_id" text,
	"body" text,
	"template" text,
	"wa_message_id" text,
	"status" text DEFAULT 'PENDENTE' NOT NULL,
	"error" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "lead_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority" "ai_priority" DEFAULT 'MEDIA' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "plan_item_id" text;--> statement-breakpoint
ALTER TABLE "ai_action_plans" ADD CONSTRAINT "ai_action_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_action_plans" ADD CONSTRAINT "ai_action_plans_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_execution_logs" ADD CONSTRAINT "ai_execution_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_findings" ADD CONSTRAINT "ai_findings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_findings" ADD CONSTRAINT "ai_findings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_findings" ADD CONSTRAINT "ai_findings_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_findings" ADD CONSTRAINT "ai_findings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_findings" ADD CONSTRAINT "ai_findings_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_plan_items" ADD CONSTRAINT "ai_plan_items_plan_id_ai_action_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."ai_action_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_plan_items" ADD CONSTRAINT "ai_plan_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_plan_items" ADD CONSTRAINT "ai_plan_items_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_plan_items" ADD CONSTRAINT "ai_plan_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_plan_items" ADD CONSTRAINT "ai_plan_items_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_plan_items" ADD CONSTRAINT "ai_plan_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_plans_date_uq" ON "ai_action_plans" USING btree ("date");--> statement-breakpoint
CREATE INDEX "ai_logs_created_idx" ON "ai_execution_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_logs_kind_idx" ON "ai_execution_logs" USING btree ("kind","action");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_findings_dedupe_uq" ON "ai_findings" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "ai_findings_status_idx" ON "ai_findings" USING btree ("status","severity");--> statement-breakpoint
CREATE INDEX "ai_findings_user_idx" ON "ai_findings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_items_plan_idx" ON "ai_plan_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "ai_items_assignee_idx" ON "ai_plan_items" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "ai_reports_kind_idx" ON "ai_reports" USING btree ("kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_msg_id_uq" ON "whatsapp_messages" USING btree ("wa_message_id");--> statement-breakpoint
CREATE INDEX "wa_user_idx" ON "whatsapp_messages" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_lead_idx" ON "tasks" USING btree ("lead_id");--> statement-breakpoint
UPDATE "leads" l SET "stage_entered_at" = COALESCE((SELECT max(i."created_at") FROM "interactions" i WHERE i."lead_id" = l."id" AND i."type" = 'sistema' AND i."content" LIKE 'Etapa alterada:%'), l."entered_at");
