// AI impact note (B1.3): a fixed, server-built agent turn after custom transactions. The user can't
// change the prompt, and it never contains merchant text: the model sees merchants only inside tool
// outputs, under `data`, like every other merchant name.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { alerts, transactions } from "@/lib/db/schema";
import type { DbOrTx } from "@/lib/db/types";
import { dayOf, formatDateLabel } from "@/lib/domain/dates";
import { formatUSD } from "@/lib/domain/money";

export const IMPACT_MAX_TOOL_ITERATIONS = 4;
export const IMPACT_MAX_TRANSACTIONS = 10;

export type ImpactTxn = { id: string; amountCents: number; category: string; occurredAt: Date };

/** This session's custom transactions among the given ids (anything else is ignored). */
export async function loadImpactTransactions(db: DbOrTx, sessionId: string, ids: string[]): Promise<ImpactTxn[]> {
  const rows = await db
    .select({ id: transactions.id, amountCents: transactions.amountCents, category: transactions.category, occurredAt: transactions.occurredAt })
    .from(transactions)
    .where(and(eq(transactions.sessionId, sessionId), eq(transactions.origin, "custom"), inArray(transactions.id, ids)));
  return rows.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

/** The fixed prompt. Figures are server-formatted; categories come from a fixed list. */
export function impactPrompt(txns: readonly ImpactTxn[]): string {
  const items = txns.map((t) => `${formatUSD(t.amountCents, { plus: true })} in ${t.category} on ${formatDateLabel(dayOf(t.occurredAt.toISOString()))}`);
  const what = items.length === 1 ? `A new transaction was just added: ${items[0]}.` : `New transactions were just added: ${items.join("; ")}.`;
  return (
    `[Impact of new transaction] ${what} Its merchant name, if any, is in get_transactions under data. ` +
    "Re-evaluate the account: what changed for this category's budget, this month's net, affordability headroom, and any alerts or stale proposals. Keep it short."
  );
}

/**
 * Proposals in an impact note are allowed only when a budget overrun has no rule-engine fix
 * (an active budget_overrun alert without a proposal). Returns the refusal reason otherwise.
 */
export async function impactProposalBlock(db: DbOrTx, sessionId: string): Promise<string | null> {
  const unfixable = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.sessionId, sessionId), eq(alerts.status, "active"), eq(alerts.type, "budget_overrun"), isNull(alerts.proposalId)));
  return unfixable.length ? null : "Impact notes only propose a fix for an overrun the rule engine can't fix, and there is none right now.";
}
