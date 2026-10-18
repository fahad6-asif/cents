import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { BudgetChange } from "@/lib/domain/proposals";
import { classifyChanges } from "@/lib/domain/proposals";
import type { ChatMessageView, ProposalView } from "@/lib/chat-types";
import type { Verification } from "@/lib/agent/verify";
import { agentActions, auditLog, chatMessages } from "./schema";
import type { DbOrTx } from "./types";

const HISTORY_LIMIT = 50;

/** Proposal rows → the shape approval cards render. */
export async function loadProposals(db: DbOrTx, sessionId: string, ids: string[]): Promise<Map<string, ProposalView>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select()
    .from(agentActions)
    .where(and(eq(agentActions.sessionId, sessionId), inArray(agentActions.id, ids)));
  return new Map(rows.map((r) => [r.id, toProposalView(r)]));
}

export function toProposalView(r: typeof agentActions.$inferSelect): ProposalView {
  const changes = r.changes as BudgetChange[];
  const { kind, totalDeltaCents } = classifyChanges(changes);
  return {
    id: r.id,
    status: r.status,
    origin: r.origin,
    rationale: r.rationale,
    changes,
    kind,
    totalDeltaCents,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
    executedAt: r.executedAt?.toISOString() ?? null,
    result: (r.result as Record<string, unknown> | null) ?? null,
  };
}

/** The visible thread (oldest first), with any approval cards attached. */
export async function loadChat(db: DbOrTx, sessionId: string): Promise<ChatMessageView[]> {
  const rows = (
    await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
      .limit(HISTORY_LIMIT)
  ).reverse();
  const proposals = await loadProposals(
    db,
    sessionId,
    rows.flatMap((r) => (r.actionId ? [r.actionId] : [])),
  );
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    proposal: r.actionId ? (proposals.get(r.actionId) ?? null) : null,
    verification: (r.verification as Verification | null) ?? null,
  }));
}

/** Last N messages as model context (oldest first). */
export async function loadHistory(db: DbOrTx, sessionId: string, limit: number) {
  const rows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit);
  return rows.reverse();
}

export async function clearChat(db: DbOrTx, sessionId: string): Promise<void> {
  await db.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId));
}

/**
 * Chat turns counted from the append-only audit log, so resetting the demo or clearing the chat
 * cannot be used to get around the limits.
 */
export async function countChatTurns(db: DbOrTx, sessionId: string | null, since: Date): Promise<number> {
  const where = sessionId
    ? and(eq(auditLog.event, "chat_message"), eq(auditLog.sessionId, sessionId), gte(auditLog.createdAt, since))
    : and(eq(auditLog.event, "chat_message"), gte(auditLog.createdAt, since));
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(where);
  return row.n;
}
