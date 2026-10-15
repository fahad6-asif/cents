import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { accounts, agentActions, alerts, auditLog, budgets, chatMessages, sessions, transactions } from "@/lib/db/schema";
import { ensureSession, resetSession } from "@/lib/db/sessions";
import type { Db } from "@/lib/db/types";
import { generateSeed } from "@/seed/generate";
import { createTestDb, sessionSnapshot } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;
const seed = generateSeed();

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => close());

async function addTransaction(sessionId: string) {
  const [account] = await db.select().from(accounts).where(eq(accounts.sessionId, sessionId));
  await db.insert(transactions).values({
    sessionId,
    accountId: account.id,
    amountCents: -6_000,
    category: "Dining",
    merchant: "Bella Napoli",
    occurredAt: new Date("2026-10-15T12:00:00Z"),
    type: "expense",
    source: "simulated",
    simEventId: "restaurant",
    idempotencyKey: randomUUID(),
  });
}

describe("sessions", () => {
  it("clones the full seed for a new session", async () => {
    const id = randomUUID();
    const info = await ensureSession(db, id);
    expect(info).toEqual({ id, epoch: 0, created: true });
    const snap = await sessionSnapshot(db, id);
    expect(snap.transactions).toHaveLength(seed.transactions.length);
    expect(snap.budgets).toHaveLength(seed.budgets.length);
    expect(snap.bills).toHaveLength(seed.bills.length);
    expect(snap.account.openingBalanceCents).toBe(seed.account.openingBalanceCents);
  });

  it("does not re-seed an existing session", async () => {
    const id = randomUUID();
    await ensureSession(db, id);
    const again = await ensureSession(db, id);
    expect(again.created).toBe(false);
    expect((await sessionSnapshot(db, id)).transactions).toHaveLength(seed.transactions.length);
  });

  it("isolates sessions: changing A leaves B untouched", async () => {
    const a = randomUUID();
    const b = randomUUID();
    await ensureSession(db, a);
    await ensureSession(db, b);
    const before = JSON.stringify(await sessionSnapshot(db, b));

    await addTransaction(a);
    await db
      .update(budgets)
      .set({ limitCents: 32_500 })
      .where(and(eq(budgets.sessionId, a), eq(budgets.category, "Dining"), eq(budgets.month, "2026-10")));

    expect(JSON.stringify(await sessionSnapshot(db, b))).toBe(before);
    expect((await sessionSnapshot(db, a)).transactions).toHaveLength(seed.transactions.length + 1);
  });

  it("enforces one transaction per (session, idempotency key)", async () => {
    const id = randomUUID();
    await ensureSession(db, id);
    const [account] = await db.select().from(accounts).where(eq(accounts.sessionId, id));
    const row = {
      sessionId: id,
      accountId: account.id,
      amountCents: -1_800,
      category: "Subscriptions",
      merchant: "Music plan",
      occurredAt: new Date("2026-10-15T12:00:00Z"),
      type: "expense" as const,
      source: "simulated" as const,
      idempotencyKey: "same-key",
    };
    await db.insert(transactions).values(row);
    await expect(db.insert(transactions).values(row)).rejects.toThrow();
  });

  it("reset restores the exact seed state, bumps the epoch and keeps the audit log", async () => {
    const id = randomUUID();
    await ensureSession(db, id);
    const pristine = JSON.stringify(await sessionSnapshot(db, id));

    // Mutate everything a demo can touch.
    await addTransaction(id);
    await db.update(budgets).set({ limitCents: 1 }).where(eq(budgets.sessionId, id));
    const [action] = await db
      .insert(agentActions)
      .values({ sessionId: id, type: "budget_adjustment", changes: [], rationale: "test", origin: "alert", status: "pending" })
      .returning();
    await db.insert(alerts).values({
      sessionId: id,
      type: "budget_overrun",
      dedupeKey: "budget_overrun:Dining:2026-10",
      title: "t",
      body: "b",
      facts: {},
      severity: 4,
      status: "active",
      proposalId: action.id,
    });
    await db.insert(chatMessages).values({ sessionId: id, role: "user", content: "hi" });
    expect(JSON.stringify(await sessionSnapshot(db, id))).not.toBe(pristine);

    const { epoch } = await resetSession(db, id);
    expect(epoch).toBe(1);
    expect(JSON.stringify(await sessionSnapshot(db, id))).toBe(pristine);

    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    expect(session.epoch).toBe(1);
    const events = (await db.select().from(auditLog).where(eq(auditLog.sessionId, id))).map((r) => r.event);
    expect(events).toEqual(expect.arrayContaining(["session_created", "demo_reset"]));
  });

  it("refuses to reset an unknown session", async () => {
    await expect(resetSession(db, randomUUID())).rejects.toThrow();
  });
});
