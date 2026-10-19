// Pending-proposal re-check (B1.2): after any new transaction, every pending proposal is checked
// against the new data and marked stale right away (before, staleness surfaced only at approve time).
import { and, eq } from "drizzle-orm";
import { audit } from "@/lib/db/audit";
import { loadSessionData } from "@/lib/db/queries";
import { agentActions } from "@/lib/db/schema";
import type { DbOrTx } from "@/lib/db/types";
import { budgetStatuses } from "@/lib/domain/budgets";
import { monthOf } from "@/lib/domain/dates";
import { planOverrunFix } from "@/lib/domain/overrun-fix";
import { validateChanges, type BudgetChange } from "@/lib/domain/proposals";

export type StaleReason = "limits_changed" | "invalid" | "below_spent" | "plan_changed";

const key = (c: BudgetChange) => `${c.category}|${c.month}|${c.old_limit_cents}|${c.new_limit_cents}`;

/**
 * A pending proposal is stale when:
 * - the existing validator rejects it (a stored limit changed → limits_changed; otherwise invalid);
 * - it lowers a current-month limit below what is now already spent (below_spent);
 * - it is an overrun fix whose plan, recomputed on the new data, is no longer the same (plan_changed).
 */
export function staleReason(
  changes: readonly BudgetChange[],
  meta: { overrun_fix?: { category: string } } | null,
  data: Awaited<ReturnType<typeof loadSessionData>>,
  today: string,
): StaleReason | null {
  const month = monthOf(today);
  const limit = (category: string, mm: string) => data.budgets.find((b) => b.category === category && b.month === mm)?.limitCents;
  const check = validateChanges(changes, { currentMonth: month, currentLimit: limit });
  if (!check.ok) return check.stale ? "limits_changed" : "invalid";

  const spent = new Map(budgetStatuses(data.budgets, data.txs, month, today).map((s) => [s.category, s.spentCents]));
  if (changes.some((c) => c.month === month && c.new_limit_cents < c.old_limit_cents && c.new_limit_cents < (spent.get(c.category) ?? 0))) {
    return "below_spent";
  }

  if (meta?.overrun_fix) {
    const plan = planOverrunFix({ category: meta.overrun_fix.category, budgets: data.budgets, txs: data.txs, bills: data.bills, today });
    const now = plan.changes.map(key).sort().join(",");
    if (now !== changes.map(key).sort().join(",")) return "plan_changed";
  }
  return null;
}

export async function recheckPendingProposals(tx: DbOrTx, sessionId: string, epoch: number, today: string): Promise<string[]> {
  const pending = await tx
    .select()
    .from(agentActions)
    .where(and(eq(agentActions.sessionId, sessionId), eq(agentActions.status, "pending")));
  if (!pending.length) return [];
  const data = await loadSessionData(tx, sessionId);
  const stale: string[] = [];
  for (const p of pending) {
    const reason = staleReason(p.changes as BudgetChange[], p.meta as { overrun_fix?: { category: string } } | null, data, today);
    if (!reason) continue;
    await tx
      .update(agentActions)
      .set({ status: "stale", decidedAt: new Date(), result: { reason } })
      .where(and(eq(agentActions.id, p.id), eq(agentActions.status, "pending")));
    await audit(tx, sessionId, epoch, "action_stale", { action_id: p.id, origin: p.origin, reason });
    stale.push(p.id);
  }
  return stale;
}
