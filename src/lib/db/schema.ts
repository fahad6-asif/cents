import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Money columns are bigint cents (mode "number": all amounts stay far below 2^53).
const cents = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const id = () => uuid("id").primaryKey().defaultRandom();
/** Session-owned rows cascade away when the session is cleaned up. */
const sessionRef = () =>
  uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" });

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  epoch: integer("epoch").notNull().default(0),
});

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    sessionId: sessionRef(),
    displayName: text("display_name").notNull(),
    currency: text("currency").notNull().default("USD"),
    openingBalanceCents: cents("opening_balance_cents").notNull(),
  },
  (t) => [index("accounts_session_idx").on(t.sessionId)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    sessionId: sessionRef(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    amountCents: cents("amount_cents").notNull(),
    category: text("category").notNull(),
    merchant: text("merchant").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    type: text("type", { enum: ["income", "expense", "transfer"] }).notNull(),
    source: text("source", { enum: ["seed", "simulated"] }).notNull(),
    simEventId: text("sim_event_id"),
    idempotencyKey: text("idempotency_key"),
  },
  (t) => [
    index("transactions_session_idx").on(t.sessionId, t.occurredAt),
    uniqueIndex("transactions_session_idem_uq").on(t.sessionId, t.idempotencyKey),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    sessionId: sessionRef(),
    category: text("category").notNull(),
    month: text("month").notNull(), // YYYY-MM
    limitCents: cents("limit_cents").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("budgets_session_cat_month_uq").on(t.sessionId, t.category, t.month)],
);

export const bills = pgTable(
  "bills",
  {
    id: id(),
    sessionId: sessionRef(),
    name: text("name").notNull(),
    amountCents: cents("amount_cents").notNull(),
    category: text("category").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    status: text("status", { enum: ["unpaid", "paid"] }).notNull(),
  },
  (t) => [index("bills_session_idx").on(t.sessionId, t.dueDate)],
);

export const agentActions = pgTable(
  "agent_actions",
  {
    id: id(),
    sessionId: sessionRef(),
    type: text("type", { enum: ["budget_adjustment"] }).notNull(),
    changes: jsonb("changes").notNull(),
    rationale: text("rationale").notNull(),
    origin: text("origin", { enum: ["assistant", "alert"] }).notNull(),
    status: text("status", {
      enum: ["pending", "approved", "rejected", "executed", "failed", "stale"],
    }).notNull(),
    result: jsonb("result"),
    /** Server-computed context shown on the card, e.g. the overrun-fix split (addendum A6). Never model-written. */
    meta: jsonb("meta"),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
  },
  (t) => [index("agent_actions_session_idx").on(t.sessionId, t.createdAt)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: id(),
    sessionId: sessionRef(),
    type: text("type", {
      enum: ["budget_warning", "budget_overrun", "upcoming_bill", "unusual_spending"],
    }).notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    facts: jsonb("facts").notNull(),
    severity: integer("severity").notNull(),
    status: text("status", { enum: ["active", "resolved", "dismissed"] }).notNull(),
    relatedTransactionId: uuid("related_transaction_id"),
    relatedBillId: uuid("related_bill_id"),
    proposalId: uuid("proposal_id"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("alerts_session_idx").on(t.sessionId, t.status),
    uniqueIndex("alerts_session_dedupe_active_uq")
      .on(t.sessionId, t.dedupeKey)
      .where(sql`${t.status} = 'active'`),
  ],
);

// Append-only. No FK: audit rows outlive session cleanup (kept 7 days) and survive resets.
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    sessionId: uuid("session_id").notNull(),
    epoch: integer("epoch").notNull(),
    event: text("event").notNull(),
    details: jsonb("details").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_session_idx").on(t.sessionId, t.createdAt), index("audit_log_event_idx").on(t.event, t.createdAt)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: id(),
    sessionId: sessionRef(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    /** Proposal created during this assistant turn (renders an approval card in the thread). */
    actionId: uuid("action_id"),
    /** Grounding check of an assistant reply's $ and % figures (addendum A4). */
    verification: jsonb("verification"),
    /** Wall-clock time of the assistant turn, for the receipts line (addendum A5). */
    turnMs: integer("turn_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("chat_messages_session_idx").on(t.sessionId, t.createdAt)],
);

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: id(),
    sessionId: sessionRef(),
    messageId: uuid("message_id"),
    toolName: text("tool_name").notNull(),
    input: jsonb("input").notNull(),
    output: jsonb("output").notNull(),
    ok: boolean("ok").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("tool_calls_session_idx").on(t.sessionId, t.createdAt)],
);
