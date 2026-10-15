ALTER TABLE "chat_messages" ADD COLUMN "action_id" uuid;--> statement-breakpoint
CREATE INDEX "audit_log_event_idx" ON "audit_log" USING btree ("event","created_at");