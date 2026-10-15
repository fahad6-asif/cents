-- Row Level Security on every table with NO policies: any non-owner role (e.g. a public data API)
-- can read or write nothing. The app connects as the table owner from the server only.
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tool_calls" ENABLE ROW LEVEL SECURITY;
