CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"opening_balance_cents" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"type" text NOT NULL,
	"changes" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"origin" text NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"facts" jsonb NOT NULL,
	"severity" integer NOT NULL,
	"status" text NOT NULL,
	"related_transaction_id" uuid,
	"related_bill_id" uuid,
	"proposal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"epoch" integer NOT NULL,
	"event" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"category" text NOT NULL,
	"due_date" date NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"category" text NOT NULL,
	"month" text NOT NULL,
	"limit_cents" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"epoch" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"message_id" uuid,
	"tool_name" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"ok" boolean NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"category" text NOT NULL,
	"merchant" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"sim_event_id" text,
	"idempotency_key" text
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_session_idx" ON "accounts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "agent_actions_session_idx" ON "agent_actions" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "alerts_session_idx" ON "alerts" USING btree ("session_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_session_dedupe_active_uq" ON "alerts" USING btree ("session_id","dedupe_key") WHERE "alerts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "audit_log_session_idx" ON "audit_log" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "bills_session_idx" ON "bills" USING btree ("session_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_session_cat_month_uq" ON "budgets" USING btree ("session_id","category","month");--> statement-breakpoint
CREATE INDEX "chat_messages_session_idx" ON "chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "tool_calls_session_idx" ON "tool_calls" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "transactions_session_idx" ON "transactions" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_session_idem_uq" ON "transactions" USING btree ("session_id","idempotency_key");