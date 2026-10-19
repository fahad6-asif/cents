// AI impact note (B1.3): a fixed, server-built agent turn after custom transactions. The user can't
// change the prompt, and it never contains merchant text: the model sees merchants only inside tool
// outputs, under `data`, like every other merchant name.
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { loadSessionData } from "@/lib/db/queries";
import { agentActions, alerts, auditLog, transactions } from "@/lib/db/schema";
import type { DbOrTx } from "@/lib/db/types";
import { disposableFunds } from "@/lib/domain/affordability";
import { budgetStatuses } from "@/lib/domain/budgets";
import { INCOME_CATEGORY } from "@/lib/domain/categories";
import { dayOf, formatDateLabel, monthName, monthOf } from "@/lib/domain/dates";
import { formatUSD } from "@/lib/domain/money";
import type { BudgetChange } from "@/lib/domain/proposals";
import { summarize } from "@/lib/domain/summary";

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

/**
 * Before → after facts, computed by the server from the session's rows (the model explains them,
 * it never works out a delta). "Before" is the same data without the new transactions.
 */
export async function impactFacts(db: DbOrTx, sessionId: string, txns: readonly ImpactTxn[], today: string): Promise<{ facts: string[]; keyFigures: string[] }> {
  const data = await loadSessionData(db, sessionId);
  const ids = new Set(txns.map((t) => t.id));
  const before = { ...data, txs: data.txs.filter((t) => !ids.has(t.id!)) };
  const month = monthOf(today);
  const facts: string[] = [];
  const keyFigures: string[] = [];
  const overage = new Map<string, number>();

  for (const category of [...new Set(txns.map((t) => t.category))]) {
    if (category === INCOME_CATEGORY) continue;
    const was = budgetStatuses(before.budgets, before.txs, month, today).find((s) => s.category === category);
    const now = budgetStatuses(data.budgets, data.txs, month, today).find((s) => s.category === category);
    if (!was || !now) continue;
    overage.set(category, now.overageCents);
    const pct = now.limitCents > 0 ? Math.round((now.spentCents * 100) / now.limitCents) : 100;
    const state = now.overageCents > 0 ? `over by ${formatUSD(now.overageCents)}` : `${formatUSD(now.remainingCents)} left`;
    keyFigures.push(`${category} ${formatUSD(was.spentCents)} → ${formatUSD(now.spentCents)}`);
    facts.push(`${category} budget (${monthName(month)}): spent ${formatUSD(was.spentCents)} → ${formatUSD(now.spentCents)} of ${formatUSD(now.limitCents)} (${pct}% used, ${state}).`);
  }
  const net = (d: typeof data) => summarize(d.account.openingBalanceCents, d.txs, today).netCents;
  facts.push(`This month's net: ${formatUSD(net(before))} → ${formatUSD(net(data))}.`);
  keyFigures.push(`Net ${formatUSD(net(before))} → ${formatUSD(net(data))}`);
  const free = (d: typeof data) => disposableFunds({ openingBalanceCents: d.account.openingBalanceCents, txs: d.txs, budgets: d.budgets, bills: d.bills, today }).disposableCents;
  facts.push(`Free to spend after bills and essential budgets (disposable funds): ${formatUSD(free(before))} → ${formatUSD(free(data))}.`);
  keyFigures.push(`Free to spend ${formatUSD(free(before))} → ${formatUSD(free(data))}`);

  // Rule-engine fixes created for these categories (alert proposals still waiting for approval).
  const pending = await db
    .select({ changes: agentActions.changes })
    .from(agentActions)
    .where(and(eq(agentActions.sessionId, sessionId), eq(agentActions.origin, "alert"), eq(agentActions.status, "pending")));
  for (const p of pending) {
    const changes = p.changes as BudgetChange[];
    const to = changes.find((c) => c.new_limit_cents > c.old_limit_cents);
    const from = changes.find((c) => c.new_limit_cents < c.old_limit_cents);
    if (to && from && txns.some((t) => t.category === to.category)) {
      const moved = to.new_limit_cents - to.old_limit_cents;
      const over = overage.get(to.category) ?? 0;
      const covers = moved >= over ? `which covers the full ${formatUSD(over)} overage` : `which covers ${formatUSD(moved)} of the ${formatUSD(over)} overage`;
      facts.push(`A one-click fix now waits for the user's approval (created by this transaction's checks): move ${formatUSD(moved)} from ${from.category} to ${to.category}, ${covers}.`);
    }
  }
  const unfixed = await db
    .select({ facts: alerts.facts })
    .from(alerts)
    .where(and(eq(alerts.sessionId, sessionId), eq(alerts.status, "active"), eq(alerts.type, "budget_overrun"), isNull(alerts.proposalId)));
  for (const a of unfixed) {
    const category = String((a.facts as { category?: string }).category ?? "");
    if (txns.some((t) => t.category === category)) facts.push(`${category} is over budget with no one-click fix: plan_overrun_fix can plan one.`);
  }

  const first = await db
    .select({ at: auditLog.createdAt })
    .from(auditLog)
    .where(and(eq(auditLog.sessionId, sessionId), eq(auditLog.event, "transaction_simulated"), inArray(sql`${auditLog.details}->>'transaction_id'`, [...ids])))
    .orderBy(auditLog.createdAt)
    .limit(1);
  const stale = first.length
    ? await db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.sessionId, sessionId), eq(auditLog.event, "action_stale"), gte(auditLog.createdAt, first[0].at)))
    : [];
  facts.push(stale.length ? `Proposals made stale by this transaction: ${stale.length} (they can no longer be approved; ask for a new one).` : "No pending proposal became stale.");
  return { facts, keyFigures: keyFigures.slice(0, 4) };
}

/** The fixed prompt. Figures are server-formatted; categories come from a fixed list. */
export function impactPrompt(txns: readonly ImpactTxn[], facts: readonly string[] = []): string {
  const items = txns.map((t) => `${formatUSD(t.amountCents, { plus: true })} in ${t.category} on ${formatDateLabel(dayOf(t.occurredAt.toISOString()))}`);
  const what = items.length === 1 ? `A new transaction was just added: ${items[0]}.` : `New transactions were just added: ${items.join("; ")}.`;
  return (
    `[Impact of new transaction] ${what} Its merchant name, if any, is in get_transactions under data. ` +
    "Re-evaluate the account: what changed for this category's budget, this month's net, affordability headroom, and any alerts or stale proposals. Keep it short." +
    (facts.length
      ? `\nFacts computed by the server (exact; quote them, never recompute; call a tool only for something not listed):\n${facts.map((f) => `- ${f}`).join("\n")}`
      : "")
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
