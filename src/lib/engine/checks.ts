import { and, eq, inArray, sql } from "drizzle-orm";
import { audit } from "@/lib/db/audit";
import { loadSessionData } from "@/lib/db/queries";
import { agentActions, alerts } from "@/lib/db/schema";
import type { Db, DbOrTx } from "@/lib/db/types";
import { evaluateAlerts, type AlertCandidate } from "@/lib/domain/alerts";
import { budgetStatuses, type BudgetStatus } from "@/lib/domain/budgets";
import { monthOf } from "@/lib/domain/dates";
import { formatUSD } from "@/lib/domain/money";
import { buildOverrunReallocation } from "@/lib/domain/proposals";

export type CheckResult = { created: string[]; updated: string[]; resolved: string[]; proposals: string[] };

/** Serializes writers for one session (simulate, approve, dismiss, reset) inside a transaction. */
export async function lockSession(tx: DbOrTx, sessionId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${sessionId}))`);
}

/** Runs the rule checks in their own transaction. */
export async function runChecks(db: Db, sessionId: string, epoch: number, today: string): Promise<CheckResult> {
  return db.transaction(async (tx) => {
    await lockSession(tx, sessionId);
    return runChecksInTx(tx, sessionId, epoch, today);
  });
}

/**
 * Plan 7.2: upsert active alerts by dedupe key (no duplicates), resolve alerts whose condition no
 * longer holds, and attach a deterministic reallocation proposal to each new budget overrun.
 * Alerts the user dismissed stay dismissed while their condition holds. Call inside a transaction
 * that holds the session lock.
 */
export async function runChecksInTx(tx: DbOrTx, sessionId: string, epoch: number, today: string): Promise<CheckResult> {
  const result: CheckResult = { created: [], updated: [], resolved: [], proposals: [] };
  const data = await loadSessionData(tx, sessionId);
  const candidates = evaluateAlerts({ today, txs: data.txs, budgets: data.budgets, bills: data.bills });
  const statuses = budgetStatuses(data.budgets, data.txs, monthOf(today), today);

  const existing = await tx
    .select()
    .from(alerts)
    .where(and(eq(alerts.sessionId, sessionId), inArray(alerts.status, ["active", "dismissed"])));
  const active = new Map(existing.filter((a) => a.status === "active").map((a) => [a.dedupeKey, a]));
  const dismissed = new Set(existing.filter((a) => a.status === "dismissed").map((a) => a.dedupeKey));
  const now = new Date();

  for (const c of candidates) {
    const current = active.get(c.dedupeKey);
    if (current) {
      if (sameFacts(current.facts as AlertCandidate["facts"], c.facts)) continue;
      let proposalId = current.proposalId;
      if (c.type === "budget_overrun" && current.facts && (current.facts as AlertCandidate["facts"]).overage_cents !== c.facts.overage_cents) {
        // The overage changed: the old fix no longer fits. Retire it and propose a new one.
        if (proposalId) {
          await tx
            .update(agentActions)
            .set({ status: "stale", decidedAt: now, result: { reason: "overage changed" } })
            .where(and(eq(agentActions.id, proposalId), eq(agentActions.status, "pending")));
        }
        proposalId = await proposeReallocation(tx, sessionId, epoch, c, statuses, result);
      }
      await tx
        .update(alerts)
        .set({ title: c.title, body: c.body, facts: c.facts, proposalId, updatedAt: now })
        .where(eq(alerts.id, current.id));
      result.updated.push(c.dedupeKey);
      continue;
    }
    if (dismissed.has(c.dedupeKey)) continue;

    const proposalId = c.type === "budget_overrun" ? await proposeReallocation(tx, sessionId, epoch, c, statuses, result) : null;
    const inserted = await tx
      .insert(alerts)
      .values({
        sessionId,
        type: c.type,
        dedupeKey: c.dedupeKey,
        title: c.title,
        body: c.body,
        facts: c.facts,
        severity: c.severity,
        status: "active",
        relatedTransactionId: c.relatedTransactionId ?? null,
        relatedBillId: c.relatedBillId ?? null,
        proposalId,
      })
      .onConflictDoNothing()
      .returning({ id: alerts.id });
    if (inserted.length) {
      result.created.push(c.dedupeKey);
      await audit(tx, sessionId, epoch, "alert_created", {
        alert_id: inserted[0].id,
        type: c.type,
        title: c.title,
        dedupe_key: c.dedupeKey,
        facts: c.facts,
        proposal_id: proposalId,
      });
    }
  }

  const live = new Set(candidates.map((c) => c.dedupeKey));
  for (const [key, alert] of active) {
    if (live.has(key)) continue;
    await tx.update(alerts).set({ status: "resolved", updatedAt: now }).where(eq(alerts.id, alert.id));
    result.resolved.push(key);
    await audit(tx, sessionId, epoch, "alert_resolved", { alert_id: alert.id, type: alert.type, title: alert.title, dedupe_key: key });
  }
  return result;
}

/** Order-insensitive comparison: Postgres jsonb does not preserve key order. */
function sameFacts(a: AlertCandidate["facts"] | null, b: AlertCandidate["facts"]): boolean {
  if (!a) return false;
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

async function proposeReallocation(
  tx: DbOrTx,
  sessionId: string,
  epoch: number,
  alert: AlertCandidate,
  statuses: readonly BudgetStatus[],
  result: CheckResult,
): Promise<string | null> {
  const overrun = statuses.find((s) => s.category === alert.facts.category);
  if (!overrun) return null;
  const plan = buildOverrunReallocation(overrun, statuses);
  if (!plan) return null;
  const source = statuses.find((s) => s.category === plan.from)!;
  const rationale =
    `${plan.to} is ${formatUSD(overrun.overageCents)} over its ${formatUSD(overrun.limitCents)} budget. ` +
    `Moving ${formatUSD(plan.amountCents)} from ${plan.from} (${formatUSD(source.remainingCents)} left) covers it ` +
    `without raising total planned spending.`;
  const [row] = await tx
    .insert(agentActions)
    .values({
      sessionId,
      type: "budget_adjustment",
      changes: plan.changes,
      rationale,
      origin: "alert",
      status: "pending",
    })
    .returning({ id: agentActions.id });
  result.proposals.push(row.id);
  await audit(tx, sessionId, epoch, "action_proposed", {
    action_id: row.id,
    origin: "alert",
    dedupe_key: alert.dedupeKey,
    changes: plan.changes,
  });
  return row.id;
}
