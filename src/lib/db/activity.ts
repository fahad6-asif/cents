import { and, desc, eq, inArray } from "drizzle-orm";
import type { ProposalView } from "@/lib/chat-types";
import { toProposalView } from "./chat";
import { agentActions, alerts, auditLog, sessions, toolCalls } from "./schema";
import type { DbOrTx } from "./types";

export type AuditRow = { id: string; epoch: number; event: string; details: Record<string, unknown>; createdAt: string };

/** Newest-first audit trail for the session (Insights timeline). */
export async function loadAuditLog(db: DbOrTx, sessionId: string, limit = 150): Promise<AuditRow[]> {
  const rows = await db.select().from(auditLog).where(eq(auditLog.sessionId, sessionId)).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(limit);
  return rows.map((r) => ({ id: r.id, epoch: r.epoch, event: r.event, details: r.details as Record<string, unknown>, createdAt: r.createdAt.toISOString() }));
}

/** Pending proposals and recently decided ones (Budgets page). */
export async function loadProposals(db: DbOrTx, sessionId: string): Promise<{ pending: ProposalView[]; decided: ProposalView[] }> {
  const pending = await db
    .select()
    .from(agentActions)
    .where(and(eq(agentActions.sessionId, sessionId), eq(agentActions.status, "pending")))
    .orderBy(desc(agentActions.createdAt));
  const decided = await db
    .select()
    .from(agentActions)
    .where(and(eq(agentActions.sessionId, sessionId), inArray(agentActions.status, ["executed", "rejected", "stale", "failed"])))
    .orderBy(desc(agentActions.decidedAt))
    .limit(10);
  return { pending: pending.map(toProposalView), decided: decided.map(toProposalView) };
}

/** GET /api/evidence: everything needed to show the core loop, for this session only. */
export async function exportEvidence(db: DbOrTx, sessionId: string) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  const audit = await db.select().from(auditLog).where(eq(auditLog.sessionId, sessionId)).orderBy(auditLog.createdAt);
  const calls = await db.select().from(toolCalls).where(eq(toolCalls.sessionId, sessionId)).orderBy(toolCalls.createdAt);
  const actions = await db.select().from(agentActions).where(eq(agentActions.sessionId, sessionId)).orderBy(agentActions.createdAt);
  const alertRows = await db.select().from(alerts).where(eq(alerts.sessionId, sessionId)).orderBy(alerts.createdAt);
  return {
    exported_at: new Date().toISOString(),
    note: "Simulated demo account. All data is synthetic.",
    session: session ? { id: session.id, epoch: session.epoch, created_at: session.createdAt.toISOString() } : null,
    audit_log: audit,
    tool_calls: calls,
    agent_actions: actions,
    alerts: alertRows,
  };
}
