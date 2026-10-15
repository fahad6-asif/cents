import { eq } from "drizzle-orm";
import { generateSeed, type SeedData } from "@/seed/generate";
import { accounts, agentActions, alerts, bills, budgets, chatMessages, toolCalls, transactions } from "./schema";
import type { DbOrTx } from "./types";

let cached: SeedData | undefined;
/** The seed is deterministic, so generate it once per server instance. */
function seed(): SeedData {
  cached ??= generateSeed();
  return cached;
}

const CHUNK = 500;

/** Inserts a fresh copy of the seed dataset under `sessionId`. Call inside a transaction. */
export async function cloneSeed(db: DbOrTx, sessionId: string): Promise<void> {
  const data = seed();
  const [account] = await db
    .insert(accounts)
    .values({ sessionId, ...data.account })
    .returning({ id: accounts.id });

  const txRows = data.transactions.map((t) => ({
    sessionId,
    accountId: account.id,
    amountCents: t.amountCents,
    category: t.category,
    merchant: t.merchant,
    occurredAt: new Date(t.occurredAt),
    type: t.type,
    source: "seed" as const,
  }));
  for (let i = 0; i < txRows.length; i += CHUNK) {
    await db.insert(transactions).values(txRows.slice(i, i + CHUNK));
  }
  await db.insert(budgets).values(data.budgets.map((b) => ({ sessionId, ...b })));
  await db.insert(bills).values(data.bills.map((b) => ({ sessionId, ...b })));
}

/** Deletes all of a session's data except the session row and its append-only audit log. */
export async function wipeSessionData(db: DbOrTx, sessionId: string): Promise<void> {
  // Children first; accounts cascade to transactions.
  await db.delete(toolCalls).where(eq(toolCalls.sessionId, sessionId));
  await db.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId));
  await db.delete(alerts).where(eq(alerts.sessionId, sessionId));
  await db.delete(agentActions).where(eq(agentActions.sessionId, sessionId));
  await db.delete(bills).where(eq(bills.sessionId, sessionId));
  await db.delete(budgets).where(eq(budgets.sessionId, sessionId));
  await db.delete(transactions).where(eq(transactions.sessionId, sessionId));
  await db.delete(accounts).where(eq(accounts.sessionId, sessionId));
}
