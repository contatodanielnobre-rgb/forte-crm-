CREATE TYPE "public"."chat_task_status" AS ENUM('AGENDADA', 'EM_PROCESSAMENTO', 'ENVIADA', 'FALHOU', 'CANCELADA', 'CONCLUIDA', 'AGUARDANDO_ENVIO_MANUAL');--> statement-breakpoint
CREATE TYPE "public"."chat_task_type" AS ENUM('ENVIAR_MENSAGEM', 'ENVIAR_AUDIO', 'ENVIAR_DOCUMENTO', 'ENVIAR_IMAGEM', 'LIGACAO', 'FOLLOW_UP', 'REUNIAO', 'RETORNAR_CONTATO', 'OUTRA');--> statement-breakpoint
CREATE TABLE "chat_contact_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"label_id" text NOT NULL,
	"lead_id" text,
	"client_id" text,
	"conversation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"wa_id" text NOT NULL,
	"profile_name" text,
	"lead_id" text,
	"client_id" text,
	"assignee_id" text,
	"status" text DEFAULT 'ABERTA' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"last_message_direction" text,
	"last_inbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_conversations_wa_id_unique" UNIQUE("wa_id")
);
--> statement-breakpoint
CREATE TABLE "chat_favorites" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6B7280' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_labels_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "chat_media" (
	"id" text PRIMARY KEY NOT NULL,
	"storage_url" text NOT NULL,
	"storage_access" text DEFAULT 'local' NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"duration_sec" integer,
	"kind" text NOT NULL,
	"wa_media_id" text,
	"sha256" text,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"direction" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"body" text,
	"media_id" text,
	"reply_to_id" text,
	"forwarded_from_id" text,
	"sender_id" text,
	"wa_message_id" text,
	"idempotency_key" text,
	"status" text DEFAULT 'PENDENTE' NOT NULL,
	"error" text,
	"template" text,
	"scheduled_task_id" text,
	"deleted_at" timestamp with time zone,
	"deleted_by_id" text,
	"payload" jsonb,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_scheduled_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" "chat_task_type" NOT NULL,
	"status" "chat_task_status" DEFAULT 'AGENDADA' NOT NULL,
	"description" text,
	"run_at" timestamp with time zone NOT NULL,
	"recurrence" text DEFAULT 'NONE' NOT NULL,
	"conversation_id" text,
	"lead_id" text,
	"client_id" text,
	"assignee_id" text,
	"created_by_id" text,
	"media_id" text,
	"task_id" text,
	"appointment_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"lock_token" text,
	"locked_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"last_error" text,
	"result_message_id" text,
	"parent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_task_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"status" text NOT NULL,
	"detail" text,
	"wa_message_id" text,
	"actor_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "chat_contact_labels" ADD CONSTRAINT "chat_contact_labels_label_id_chat_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."chat_labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_contact_labels" ADD CONSTRAINT "chat_contact_labels_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_contact_labels" ADD CONSTRAINT "chat_contact_labels_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_contact_labels" ADD CONSTRAINT "chat_contact_labels_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_favorites" ADD CONSTRAINT "chat_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_favorites" ADD CONSTRAINT "chat_favorites_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_media" ADD CONSTRAINT "chat_media_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_media_id_chat_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."chat_media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_scheduled_tasks" ADD CONSTRAINT "chat_scheduled_tasks_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_scheduled_tasks" ADD CONSTRAINT "chat_scheduled_tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_scheduled_tasks" ADD CONSTRAINT "chat_scheduled_tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_scheduled_tasks" ADD CONSTRAINT "chat_scheduled_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_scheduled_tasks" ADD CONSTRAINT "chat_scheduled_tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_scheduled_tasks" ADD CONSTRAINT "chat_scheduled_tasks_media_id_chat_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."chat_media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_scheduled_tasks" ADD CONSTRAINT "chat_scheduled_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_scheduled_tasks" ADD CONSTRAINT "chat_scheduled_tasks_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_task_attempts" ADD CONSTRAINT "chat_task_attempts_task_id_chat_scheduled_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."chat_scheduled_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_task_attempts" ADD CONSTRAINT "chat_task_attempts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_cl_lead_uq" ON "chat_contact_labels" USING btree ("label_id","lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_cl_client_uq" ON "chat_contact_labels" USING btree ("label_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_cl_conv_uq" ON "chat_contact_labels" USING btree ("label_id","conversation_id");--> statement-breakpoint
CREATE INDEX "chat_conv_last_idx" ON "chat_conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "chat_conv_lead_idx" ON "chat_conversations" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "chat_conv_client_idx" ON "chat_conversations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "chat_conv_assignee_idx" ON "chat_conversations" USING btree ("assignee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_fav_uq" ON "chat_favorites" USING btree ("user_id","conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_msg_wa_uq" ON "chat_messages" USING btree ("wa_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_msg_idem_uq" ON "chat_messages" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "chat_msg_conv_idx" ON "chat_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_msg_updated_idx" ON "chat_messages" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "chat_tasks_due_idx" ON "chat_scheduled_tasks" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "chat_tasks_assignee_idx" ON "chat_scheduled_tasks" USING btree ("assignee_id","run_at");--> statement-breakpoint
CREATE INDEX "chat_tasks_conv_idx" ON "chat_scheduled_tasks" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_attempts_task_idx" ON "chat_task_attempts" USING btree ("task_id");