import { asc, eq } from "drizzle-orm";
import type { DomainBill, DomainBudget, DomainTx } from "@/lib/domain/types";
import { accounts, bills, budgets, transactions } from "./schema";
import type { DbOrTx } from "./types";

export type SessionData = {
  account: { id: string; displayName: string; currency: string; openingBalanceCents: number };
  txs: DomainTx[];
  budgets: DomainBudget[];
  bills: DomainBill[];
};

/** Everything the domain functions need for one session, scoped by session_id. */
export async function loadSessionData(db: DbOrTx, sessionId: string): Promise<SessionData> {
  // Four independent reads in parallel: one round trip's latency instead of four (addendum A8).
  const [[account], txRows, budgetRows, billRows] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.sessionId, sessionId)),
    db.select().from(transactions).where(eq(transactions.sessionId, sessionId)).orderBy(asc(transactions.occurredAt), asc(transactions.id)),
    db.select().from(budgets).where(eq(budgets.sessionId, sessionId)),
    db.select().from(bills).where(eq(bills.sessionId, sessionId)).orderBy(asc(bills.dueDate)),
  ]);
  if (!account) throw new Error("Session has no account");

  return {
    account: {
      id: account.id,
      displayName: account.displayName,
      currency: account.currency,
      openingBalanceCents: account.openingBalanceCents,
    },
    txs: txRows.map((t) => ({
      id: t.id,
      amountCents: t.amountCents,
      category: t.category,
      merchant: t.merchant,
      occurredAt: t.occurredAt.toISOString(),
      type: t.type,
      source: t.source,
    })),
    budgets: budgetRows.map((b) => ({ category: b.category, month: b.month, limitCents: b.limitCents })),
    bills: billRows.map((b) => ({
      id: b.id,
      name: b.name,
      amountCents: b.amountCents,
      category: b.category,
      dueDate: b.dueDate,
      status: b.status,
    })),
  };
}
