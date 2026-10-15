import { and, eq, lt, notExists, sql } from "drizzle-orm";
import { lockSession, runChecksInTx } from "@/lib/engine/checks";
import { audit } from "./audit";
import { auditLog, sessions } from "./schema";
import { cloneSeed, wipeSessionData } from "./seed-clone";
import type { Db } from "./types";

const SESSION_TTL_HOURS = 48;
const AUDIT_RETENTION_DAYS = 7;
const TOUCH_INTERVAL_MINUTES = 5;

export type SessionInfo = { id: string; epoch: number; created: boolean };

/**
 * Returns the session, creating it (and cloning the seed) on first sight. Safe under concurrent
 * first requests: only the request whose INSERT wins seeds the data; the others wait on the
 * unique key and then see the committed row.
 */
export async function ensureSession(db: Db, sessionId: string, today: string): Promise<SessionInfo> {
  const existing = await db
    .select({ epoch: sessions.epoch, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (existing.length) {
    await touch(db, sessionId, existing[0].lastSeenAt);
    return { id: sessionId, epoch: existing[0].epoch, created: false };
  }

  const created = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(sessions)
      .values({ id: sessionId })
      .onConflictDoNothing()
      .returning({ id: sessions.id });
    if (!inserted.length) return false;
    await lockSession(tx, sessionId);
    await cloneSeed(tx, sessionId);
    await audit(tx, sessionId, 0, "session_created");
    await runChecksInTx(tx, sessionId, 0, today);
    return true;
  });

  if (created) await cleanupExpired(db);
  const [row] = await db.select({ epoch: sessions.epoch }).from(sessions).where(eq(sessions.id, sessionId));
  return { id: sessionId, epoch: row.epoch, created };
}

/** Wipes the session's data (audit log kept), re-clones the seed, increments the epoch, re-runs checks. */
export async function resetSession(db: Db, sessionId: string, today: string): Promise<{ epoch: number }> {
  return db.transaction(async (tx) => {
    await lockSession(tx, sessionId);
    const [row] = await tx
      .update(sessions)
      .set({ epoch: sql`${sessions.epoch} + 1`, lastSeenAt: new Date() })
      .where(eq(sessions.id, sessionId))
      .returning({ epoch: sessions.epoch });
    if (!row) throw new Error("Unknown session");
    await wipeSessionData(tx, sessionId);
    await cloneSeed(tx, sessionId);
    await audit(tx, sessionId, row.epoch, "demo_reset");
    await runChecksInTx(tx, sessionId, row.epoch, today);
    return { epoch: row.epoch };
  });
}

async function touch(db: Db, sessionId: string, lastSeenAt: Date) {
  if (Date.now() - lastSeenAt.getTime() < TOUCH_INTERVAL_MINUTES * 60_000) return;
  await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Lazy cleanup (real clock, not simulated time): stale sessions cascade; old orphan audit rows go. */
async function cleanupExpired(db: Db) {
  await db
    .delete(sessions)
    .where(lt(sessions.lastSeenAt, sql`now() - make_interval(hours => ${SESSION_TTL_HOURS})`));
  await db
    .delete(auditLog)
    .where(
      and(
        lt(auditLog.createdAt, sql`now() - make_interval(days => ${AUDIT_RETENTION_DAYS})`),
        notExists(db.select({ one: sql`1` }).from(sessions).where(eq(sessions.id, auditLog.sessionId))),
      ),
    );
}
