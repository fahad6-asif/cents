import { and, desc, eq, inArray } from "drizzle-orm";
import type { BudgetChange } from "@/lib/domain/proposals";
import type { WorthALookView } from "@/lib/overview-types";
import { agentActions, alerts } from "./schema";
import type { DbOrTx } from "./types";

/** Highest-severity active alert (newest first on ties), with its pending proposal if any. */
export async function loadWorthALook(db: DbOrTx, sessionId: string): Promise<WorthALookView | null> {
  const active = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.sessionId, sessionId), eq(alerts.status, "active")))
    .orderBy(desc(alerts.severity), desc(alerts.createdAt));
  if (!active.length) return null;
  const top = active[0];

  let proposal: WorthALookView["top"]["proposal"] = null;
  if (top.proposalId) {
    const [action] = await db
      .select()
      .from(agentActions)
      .where(and(eq(agentActions.id, top.proposalId), eq(agentActions.sessionId, sessionId), eq(agentActions.status, "pending")));
    if (action) {
      const changes = action.changes as BudgetChange[];
      const to = changes.find((c) => c.new_limit_cents > c.old_limit_cents);
      const from = changes.find((c) => c.new_limit_cents < c.old_limit_cents);
      if (to && from) {
        proposal = {
          id: action.id,
          amountCents: to.new_limit_cents - to.old_limit_cents,
          from: from.category,
          to: to.category,
          newLimitCents: to.new_limit_cents,
          rationale: action.rationale,
        };
      }
    }
  }

  return {
    top: {
      id: top.id,
      type: top.type,
      title: top.title,
      body: top.body,
      facts: top.facts as Record<string, string | number>,
      proposal,
    },
    moreCount: active.length - 1,
  };
}

export type AlertRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  facts: Record<string, string | number>;
  severity: number;
  status: string;
  proposalId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Active alerts plus the most recent resolved/dismissed ones (GET /api/alerts, Insights). */
export async function listAlerts(db: DbOrTx, sessionId: string, recentLimit = 30): Promise<{ active: AlertRow[]; recent: AlertRow[] }> {
  const map = (a: typeof alerts.$inferSelect): AlertRow => ({
    id: a.id,
    type: a.type,
    title: a.title,
    body: a.body,
    facts: a.facts as Record<string, string | number>,
    severity: a.severity,
    status: a.status,
    proposalId: a.proposalId,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  });
  const active = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.sessionId, sessionId), eq(alerts.status, "active")))
    .orderBy(desc(alerts.severity), desc(alerts.createdAt));
  const recent = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.sessionId, sessionId), inArray(alerts.status, ["resolved", "dismissed"])))
    .orderBy(desc(alerts.updatedAt))
    .limit(recentLimit);
  return { active: active.map(map), recent: recent.map(map) };
}
