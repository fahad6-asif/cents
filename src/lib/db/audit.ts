import { sql } from "drizzle-orm";
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
  | "demo_reset"
  | "chat_message"
  | "chat_cleared"
  | "chat_rate_limited"
  | "reply_verified"
  | "reply_unverified";

/** Appends one audit entry. The audit log is never updated or deleted by app code. */
export async function audit(
  db: DbOrTx,
  sessionId: string,
  epoch: number,
  event: AuditEvent,
  details: Record<string, unknown> = {},
): Promise<void> {
  // clock_timestamp(), not now(): entries written in one transaction keep their real order.
  await db.insert(auditLog).values({ sessionId, epoch, event, details, createdAt: sql`clock_timestamp()` });
}
