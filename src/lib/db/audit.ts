import { auditLog } from "./schema";
import type { DbOrTx } from "./types";

export type AuditEvent =
  | "session_created"
  | "transaction_simulated"
  | "alert_created"
  | "alert_resolved"
  | "alert_dismissed"
  | "action_proposed"
  | "action_approved"
  | "action_rejected"
  | "action_executed"
  | "action_blocked"
  | "demo_reset";

/** Appends one audit entry. The audit log is never updated or deleted by app code. */
export async function audit(
  db: DbOrTx,
  sessionId: string,
  epoch: number,
  event: AuditEvent,
  details: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(auditLog).values({ sessionId, epoch, event, details });
}
