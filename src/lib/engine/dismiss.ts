import { and, eq } from "drizzle-orm";
import { audit } from "@/lib/db/audit";
import { agentActions, alerts } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { lockSession } from "./checks";

export type DismissOutcome =
  | { status: "dismissed"; alertId: string; rejectedProposalId: string | null }
  | { status: "not_found" }
  | { status: "not_active"; current: string };

/** "Not now": dismisses an active alert and rejects its linked pending proposal. */
export async function dismissAlert(db: Db, sessionId: string, epoch: number, alertId: string): Promise<DismissOutcome> {
  return db.transaction(async (tx) => {
    await lockSession(tx, sessionId);
    const [alert] = await tx
      .select()
      .from(alerts)
      .where(and(eq(alerts.id, alertId), eq(alerts.sessionId, sessionId)))
      .for("update");
    if (!alert) return { status: "not_found" };
    if (alert.status !== "active") return { status: "not_active", current: alert.status };

    const now = new Date();
    await tx.update(alerts).set({ status: "dismissed", updatedAt: now }).where(eq(alerts.id, alert.id));
    await audit(tx, sessionId, epoch, "alert_dismissed", { alert_id: alert.id, type: alert.type, dedupe_key: alert.dedupeKey });

    let rejectedProposalId: string | null = null;
    if (alert.proposalId) {
      const rejected = await tx
        .update(agentActions)
        .set({ status: "rejected", decidedAt: now, result: { reason: "alert dismissed" } })
        .where(and(eq(agentActions.id, alert.proposalId), eq(agentActions.sessionId, sessionId), eq(agentActions.status, "pending")))
        .returning({ id: agentActions.id });
      if (rejected.length) {
        rejectedProposalId = rejected[0].id;
        await audit(tx, sessionId, epoch, "action_rejected", { action_id: rejectedProposalId, via: "alert_dismissed" });
      }
    }
    return { status: "dismissed", alertId: alert.id, rejectedProposalId };
  });
}
