import { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { SEED_END } from "@/seed/generate";

/** Simulated "today" for tests (the seed is designed for it). */
export const TODAY_FOR_TESTS = SEED_END;

/** Fresh in-process Postgres with the real migrations applied. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return { db: db as unknown as Db, close: () => client.close() };
}

/**
 * Content snapshot of everything a session owns, without generated ids or timestamps,
 * so two sessions (or one session before/after reset) can be compared exactly.
 */
export async function sessionSnapshot(db: Db, sessionId: string) {
  const s = schema;
  const [account] = await db
    .select({
      displayName: s.accounts.displayName,
      currency: s.accounts.currency,
      openingBalanceCents: s.accounts.openingBalanceCents,
    })
    .from(s.accounts)
    .where(eq(s.accounts.sessionId, sessionId));
  const transactions = await db
    .select({
      amountCents: s.transactions.amountCents,
      category: s.transactions.category,
      merchant: s.transactions.merchant,
      occurredAt: s.transactions.occurredAt,
      type: s.transactions.type,
      source: s.transactions.source,
    })
    .from(s.transactions)
    .where(eq(s.transactions.sessionId, sessionId))
    .orderBy(asc(s.transactions.occurredAt), asc(s.transactions.merchant), asc(s.transactions.amountCents));
  const budgets = await db
    .select({ category: s.budgets.category, month: s.budgets.month, limitCents: s.budgets.limitCents })
    .from(s.budgets)
    .where(eq(s.budgets.sessionId, sessionId))
    .orderBy(asc(s.budgets.month), asc(s.budgets.category));
  const bills = await db
    .select({
      name: s.bills.name,
      amountCents: s.bills.amountCents,
      category: s.bills.category,
      dueDate: s.bills.dueDate,
      status: s.bills.status,
    })
    .from(s.bills)
    .where(eq(s.bills.sessionId, sessionId))
    .orderBy(asc(s.bills.dueDate), asc(s.bills.name));
  const counts = {
    alerts: (await db.select().from(s.alerts).where(eq(s.alerts.sessionId, sessionId))).length,
    actions: (await db.select().from(s.agentActions).where(eq(s.agentActions.sessionId, sessionId))).length,
    chat: (await db.select().from(s.chatMessages).where(eq(s.chatMessages.sessionId, sessionId))).length,
    toolCalls: (await db.select().from(s.toolCalls).where(eq(s.toolCalls.sessionId, sessionId))).length,
  };
  return { account, transactions, budgets, bills, counts };
}
