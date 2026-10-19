ALTER TABLE "chat_messages" ADD COLUMN "kind" text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "origin" text;--> statement-breakpoint
UPDATE "transactions" SET "origin" = 'preset' WHERE "source" = 'simulated';