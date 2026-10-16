import { and, eq } from "drizzle-orm";
import { audit } from "@/lib/db/audit";
import { toProposalView } from "@/lib/db/chat";
import { agentActions, budgets } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { monthOf } from "@/lib/domain/dates";
import { validateChanges, type BudgetChange } from "@/lib/domain/proposals";
import type { ProposalView } from "@/lib/chat-types";
import { lockSession, runChecks } from "./checks";

export type ActionOutcome =
  | { status: "executed" | "rejected"; proposal: ProposalView }
  | { status: "not_found" }
  | { status: "conflict"; reason: "not_pending" | "stale" | "invalid"; message: string; proposal: ProposalView };

/**
 * Plan 7.4: approve + execute atomically. Inside one transaction: lock the action row (FOR UPDATE,
 * scoped to the session), refuse anything not pending, re-validate every change against the
 * *current* stored limits (mismatch → stale), apply, mark executed, audit. Checks run after commit.
 * This is only reachable from a UI button → endpoint; the AI has no tool that calls it.
 */
export async function approveAction(db: Db, sessionId: string, epoch: number, actionId: string, today: string): Promise<ActionOutcome> {
  const outcome = await db.transaction(async (tx): Promise<ActionOutcome> => {
    await lockSession(tx, sessionId);
    const [action] = await tx
      .select()
      .from(agentActions)
      .where(and(eq(agentActions.id, actionId), eq(agentActions.sessionId, sessionId)))
      .for("update");
    if (!action) {
      await audit(tx, sessionId, epoch, "action_blocked", { action_id: actionId, attempted: "approve", reason: "not_found" });
      return { status: "not_found" };
    }
    if (action.status !== "pending") {
      await audit(tx, sessionId, epoch, "action_blocked", { action_id: action.id, attempted: "approve", reason: "not_pending", current_status: action.status });
      return { status: "conflict", reason: "not_pending", message: `This proposal is already ${action.status}.`, proposal: toProposalView(action) };
    }

    const changes = action.changes as BudgetChange[];
    const rows = await tx.select().from(budgets).where(eq(budgets.sessionId, sessionId)).for("update");
    const limitOf = (category: string, month: string) => rows.find((r) => r.category === category && r.month === month)?.limitCents;
    const check = validateChanges(changes, { currentMonth: monthOf(today), currentLimit: limitOf });
    const now = new Date();
    if (!check.ok) {
      const status = check.stale ? "stale" : "failed";
      const [updated] = await tx
        .update(agentActions)
        .set({ status, decidedAt: now, result: { errors: check.errors } })
        .where(eq(agentActions.id, action.id))
        .returning();
      await audit(tx, sessionId, epoch, "action_blocked", { action_id: action.id, attempted: "approve", reason: status, errors: check.errors });
      return {
        status: "conflict",
        reason: check.stale ? "stale" : "invalid",
        message: check.stale ? "Budgets changed since this was proposed. Ask for a new proposal." : "This proposal is no longer valid.",
        proposal: toProposalView(updated),
      };
    }

    for (const c of changes) {
      await tx
        .update(budgets)
        .set({ limitCents: c.new_limit_cents, updatedAt: now })
        .where(and(eq(budgets.sessionId, sessionId), eq(budgets.category, c.category), eq(budgets.month, c.month)));
    }
    const [executed] = await tx
      .update(agentActions)
      .set({ status: "executed", decidedAt: now, executedAt: now, result: { applied: changes } })
      .where(eq(agentActions.id, action.id))
      .returning();
    await audit(tx, sessionId, epoch, "action_approved", { action_id: action.id, origin: action.origin });
    await audit(tx, sessionId, epoch, "action_executed", { action_id: action.id, changes });
    return { status: "executed", proposal: toProposalView(executed) };
  });

  if (outcome.status === "executed") await runChecks(db, sessionId, epoch, today);
  return outcome;
}

/** Reject: mark the proposal rejected and log it. Nothing else changes. */
export async function rejectAction(db: Db, sessionId: string, epoch: number, actionId: string): Promise<ActionOutcome> {
  return db.transaction(async (tx): Promise<ActionOutcome> => {
    await lockSession(tx, sessionId);
    const [action] = await tx
      .select()
      .from(agentActions)
      .where(and(eq(agentActions.id, actionId), eq(agentActions.sessionId, sessionId)))
      .for("update");
    if (!action) return { status: "not_found" };
    if (action.status !== "pending") {
      await audit(tx, sessionId, epoch, "action_blocked", { action_id: action.id, attempted: "reject", reason: "not_pending", current_status: action.status });
      return { status: "conflict", reason: "not_pending", message: `This proposal is already ${action.status}.`, proposal: toProposalView(action) };
    }
    const [rejected] = await tx
      .update(agentActions)
      .set({ status: "rejected", decidedAt: new Date(), result: { reason: "rejected by user" } })
      .where(eq(agentActions.id, action.id))
      .returning();
    await audit(tx, sessionId, epoch, "action_rejected", { action_id: action.id, origin: action.origin });
    return { status: "rejected", proposal: toProposalView(rejected) };
  });
}

export async function getAction(db: Db, sessionId: string, actionId: string): Promise<ProposalView | null> {
  const [action] = await db
    .select()
    .from(agentActions)
    .where(and(eq(agentActions.id, actionId), eq(agentActions.sessionId, sessionId)));
  return action ? toProposalView(action) : null;
}
