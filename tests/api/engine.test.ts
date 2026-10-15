import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { loadWorthALook } from "@/lib/db/alerts-view";
import { agentActions, alerts, auditLog, bills, transactions } from "@/lib/db/schema";
import { ensureSession, resetSession } from "@/lib/db/sessions";
import type { Db } from "@/lib/db/types";
import { runChecks } from "@/lib/engine/checks";
import { dismissAlert } from "@/lib/engine/dismiss";
import { simulateEvent } from "@/lib/engine/simulate";
import type { SimEventId } from "@/lib/sim-events";
import { TODAY_FOR_TESTS, createTestDb, sessionSnapshot } from "../helpers/db";

const TODAY = TODAY_FOR_TESTS;
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => close());

async function newSession(today = TODAY) {
  const id = randomUUID();
  await ensureSession(db, id, today);
  return id;
}
const sim = (sessionId: string, eventId: SimEventId, idempotencyKey = randomUUID(), today = TODAY) =>
  simulateEvent(db, { sessionId, epoch: 0, eventId, idempotencyKey, today, timeOfDay: "15:30:00.000" });
const activeAlerts = (sessionId: string) =>
  db.select().from(alerts).where(and(eq(alerts.sessionId, sessionId), eq(alerts.status, "active")));
const activeKeys = async (sessionId: string) => (await activeAlerts(sessionId)).map((a) => a.dedupeKey.split(":").slice(0, 2).join(":")).sort();
const events = async (sessionId: string) =>
  (await db.select().from(auditLog).where(eq(auditLog.sessionId, sessionId))).map((r) => r.event);

describe("alert engine at seed state", () => {
  it("has the Dining warning and two upcoming bills active, with no proposals", async () => {
    const id = await newSession();
    const rows = await activeAlerts(id);
    expect(rows.map((a) => a.type).sort()).toEqual(["budget_warning", "upcoming_bill", "upcoming_bill"]);
    expect(rows.find((a) => a.type === "budget_warning")!.facts).toMatchObject({ category: "Dining", spent_cents: 26_500, limit_cents: 30_000, percent: 88 });
    expect(await db.select().from(agentActions).where(eq(agentActions.sessionId, id))).toHaveLength(0);
    expect((await events(id)).filter((e) => e === "alert_created")).toHaveLength(3);

    const worth = await loadWorthALook(db, id);
    expect(worth!.top.type).toBe("budget_warning");
    expect(worth!.top.proposal).toBeNull();
    expect(worth!.moreCount).toBe(2);
  });

  it("re-running checks creates no duplicates", async () => {
    const id = await newSession();
    const result = await runChecks(db, id, 0, TODAY);
    expect(result).toEqual({ created: [], updated: [], resolved: [], proposals: [] });
    expect(await activeAlerts(id)).toHaveLength(3);
  });
});

describe("simulate restaurant", () => {
  it("resolves the warning, raises an overrun and proposes moving $25 from Shopping", async () => {
    const id = await newSession();
    const res = await sim(id, "restaurant");
    expect(res.replayed).toBe(false);
    expect(res.checks!.resolved).toEqual(["budget_warning:Dining:2026-10"]);
    expect(res.checks!.created).toEqual(["budget_overrun:Dining:2026-10"]);

    const overrun = (await activeAlerts(id)).find((a) => a.type === "budget_overrun")!;
    expect(overrun.facts).toMatchObject({ spent_cents: 32_500, limit_cents: 30_000, overage_cents: 2_500 });
    const [action] = await db.select().from(agentActions).where(eq(agentActions.id, overrun.proposalId!));
    expect(action).toMatchObject({ status: "pending", origin: "alert", type: "budget_adjustment" });
    expect(action.changes).toEqual([
      { category: "Shopping", month: "2026-10", old_limit_cents: 25_000, new_limit_cents: 22_500 },
      { category: "Dining", month: "2026-10", old_limit_cents: 30_000, new_limit_cents: 32_500 },
    ]);

    const worth = await loadWorthALook(db, id);
    expect(worth!.top.proposal).toMatchObject({ amountCents: 2_500, from: "Shopping", to: "Dining", newLimitCents: 32_500 });
    expect(await events(id)).toEqual(
      expect.arrayContaining(["transaction_simulated", "alert_resolved", "alert_created", "action_proposed"]),
    );
  });

  it("a second restaurant re-sizes the fix: old proposal stale, new one for $85", async () => {
    const id = await newSession();
    await sim(id, "restaurant");
    const first = (await activeAlerts(id)).find((a) => a.type === "budget_overrun")!;
    const res = await sim(id, "restaurant");
    expect(res.checks!.updated).toEqual(["budget_overrun:Dining:2026-10"]);
    const after = (await activeAlerts(id)).find((a) => a.type === "budget_overrun")!;
    expect(after.id).toBe(first.id);
    const [old] = await db.select().from(agentActions).where(eq(agentActions.id, first.proposalId!));
    expect(old.status).toBe("stale");
    expect((await loadWorthALook(db, id))!.top.proposal).toMatchObject({ amountCents: 8_500, from: "Shopping" });
  });
});

describe("idempotency", () => {
  it("the same key twice creates exactly one transaction", async () => {
    const id = await newSession();
    const key = randomUUID();
    const a = await sim(id, "groceries", key);
    const b = await sim(id, "groceries", key);
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(true);
    expect(b.transaction.id).toBe(a.transaction.id);
    const rows = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.sessionId, id), eq(transactions.source, "simulated")));
    expect(rows).toHaveLength(1);
    expect((await events(id)).filter((e) => e === "transaction_simulated")).toHaveLength(1);
  });

  it("two different clicks create two transactions", async () => {
    const id = await newSession();
    await sim(id, "groceries");
    await sim(id, "groceries");
    const rows = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.sessionId, id), eq(transactions.source, "simulated")));
    expect(rows).toHaveLength(2);
  });
});

describe("other events", () => {
  it("large_purchase raises unusual spending (and a Shopping overrun with no possible proposal)", async () => {
    const id = await newSession();
    const res = await sim(id, "large_purchase");
    const unusual = (await activeAlerts(id)).find((a) => a.type === "unusual_spending")!;
    expect(unusual.relatedTransactionId).toBe(res.transaction.id);
    expect(unusual.facts).toMatchObject({ amount_cents: 78_000, category: "Shopping" });
    const shopping = (await activeAlerts(id)).find((a) => a.dedupeKey === "budget_overrun:Shopping:2026-10")!;
    expect(shopping.proposalId).toBeNull();
    expect((await loadWorthALook(db, id))!.top).toMatchObject({ type: "budget_overrun", proposal: null });
  });

  it("electricity marks the Electricity bill paid and removes its upcoming-bill alert", async () => {
    // On Oct 20 the Oct 25 Electricity bill is within 7 days, so its alert exists before paying.
    const today = "2026-10-20";
    const id = await newSession(today);
    const keysBefore = await activeKeys(id);
    const [elec] = await db.select().from(bills).where(and(eq(bills.sessionId, id), eq(bills.name, "Electricity"), eq(bills.status, "unpaid")));
    expect((await activeAlerts(id)).some((a) => a.relatedBillId === elec.id)).toBe(true);

    const res = await sim(id, "electricity", randomUUID(), today);
    expect(res.paidBillId).toBe(elec.id);
    const [paid] = await db.select().from(bills).where(eq(bills.id, elec.id));
    expect(paid.status).toBe("paid");
    expect((await activeAlerts(id)).some((a) => a.relatedBillId === elec.id)).toBe(false);
    expect(res.checks!.resolved).toEqual([`upcoming_bill:${elec.id}`]);
    expect((await activeKeys(id)).length).toBe(keysBefore.length - 1);
  });

  it("electricity at seed state (bill 10 days out) just marks the bill paid", async () => {
    const id = await newSession();
    const res = await sim(id, "electricity");
    expect(res.paidBillId).not.toBeNull();
    expect(res.checks!.created).toEqual([]);
  });

  it.each(["groceries", "subscription", "salary"] as const)("%s adds no alerts", async (event) => {
    const id = await newSession();
    const res = await sim(id, event);
    expect(res.checks).toMatchObject({ created: [], resolved: [] });
  });
});

describe("Not now (dismiss)", () => {
  it("dismisses the alert, rejects its proposal, logs both, and does not resurrect it", async () => {
    const id = await newSession();
    await sim(id, "restaurant");
    const overrun = (await activeAlerts(id)).find((a) => a.type === "budget_overrun")!;
    const out = await dismissAlert(db, id, 0, overrun.id);
    expect(out).toEqual({ status: "dismissed", alertId: overrun.id, rejectedProposalId: overrun.proposalId });
    const [action] = await db.select().from(agentActions).where(eq(agentActions.id, overrun.proposalId!));
    expect(action.status).toBe("rejected");
    expect(await events(id)).toEqual(expect.arrayContaining(["alert_dismissed", "action_rejected"]));

    expect((await runChecks(db, id, 0, TODAY)).created).toEqual([]);
    expect((await activeAlerts(id)).some((a) => a.type === "budget_overrun")).toBe(false);
    expect((await loadWorthALook(db, id))!.top.type).toBe("upcoming_bill");
  });

  it("refuses to dismiss twice, or another session's alert", async () => {
    const a = await newSession();
    const b = await newSession();
    const [alert] = await activeAlerts(a);
    expect((await dismissAlert(db, a, 0, alert.id)).status).toBe("dismissed");
    expect(await dismissAlert(db, a, 0, alert.id)).toEqual({ status: "not_active", current: "dismissed" });
    const [other] = await activeAlerts(a);
    expect(await dismissAlert(db, b, 0, other.id)).toEqual({ status: "not_found" });
  });
});

describe("reset", () => {
  it("returns alerts, proposals and data to the seed state", async () => {
    const id = await newSession();
    const pristine = JSON.stringify(await sessionSnapshot(db, id));
    await sim(id, "restaurant");
    await sim(id, "large_purchase");
    await sim(id, "electricity");
    const [first] = await activeAlerts(id);
    await dismissAlert(db, id, 0, first.id);

    await resetSession(db, id, TODAY);
    expect(JSON.stringify(await sessionSnapshot(db, id))).toBe(pristine);
    expect((await activeAlerts(id)).map((a) => a.type).sort()).toEqual(["budget_warning", "upcoming_bill", "upcoming_bill"]);
    expect(await db.select().from(agentActions).where(eq(agentActions.sessionId, id))).toHaveLength(0);
  });
});
