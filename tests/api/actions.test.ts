import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { executeTool } from "@/lib/agent/tools";
import { agentActions, alerts, auditLog, budgets } from "@/lib/db/schema";
import { ensureSession } from "@/lib/db/sessions";
import type { Db } from "@/lib/db/types";
import { approveAction, getAction, rejectAction } from "@/lib/engine/actions";
import { simulateEvent } from "@/lib/engine/simulate";
import { TODAY_FOR_TESTS, createTestDb } from "../helpers/db";

const TODAY = TODAY_FOR_TESTS;
let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => close());

async function session() {
  const id = randomUUID();
  await ensureSession(db, id, TODAY);
  return id;
}
/** Restaurant → overrun alert with its pending "move $25 Shopping → Dining" proposal. */
async function withOverrunProposal() {
  const id = await session();
  await simulateEvent(db, { sessionId: id, epoch: 0, eventId: "restaurant", idempotencyKey: randomUUID(), today: TODAY, timeOfDay: "15:00:00.000" });
  const [alert] = await db.select().from(alerts).where(and(eq(alerts.sessionId, id), eq(alerts.type, "budget_overrun")));
  return { id, actionId: alert.proposalId!, alertId: alert.id };
}
const budgetRows = (id: string) =>
  db
    .select({ category: budgets.category, month: budgets.month, limitCents: budgets.limitCents, updatedAt: budgets.updatedAt })
    .from(budgets)
    .where(eq(budgets.sessionId, id))
    .orderBy(asc(budgets.month), asc(budgets.category));
const events = async (id: string) => (await db.select().from(auditLog).where(eq(auditLog.sessionId, id))).map((e) => e.event);

describe("approve (atomic approve + execute)", () => {
  it("applies only the listed budgets, marks executed, logs, and resolves the overrun", async () => {
    const { id, actionId } = await withOverrunProposal();
    const before = await budgetRows(id);
    const out = await approveAction(db, id, 0, actionId, TODAY);
    expect(out.status).toBe("executed");

    const after = await budgetRows(id);
    const changed = after.filter((row, i) => row.limitCents !== before[i].limitCents);
    expect(changed.map((r) => [r.category, r.month, r.limitCents])).toEqual([
      ["Dining", "2026-10", 32_500],
      ["Shopping", "2026-10", 22_500],
    ]);
    // Everything else is byte-identical, including updated_at.
    const untouched = (rows: typeof before) => JSON.stringify(rows.filter((r) => !(r.month === "2026-10" && ["Dining", "Shopping"].includes(r.category))));
    expect(untouched(after)).toBe(untouched(before));

    const action = (await getAction(db, id, actionId))!;
    expect(action).toMatchObject({ status: "executed" });
    expect(action.executedAt).not.toBeNull();
    expect(await events(id)).toEqual(expect.arrayContaining(["action_approved", "action_executed"]));

    const active = await db.select().from(alerts).where(and(eq(alerts.sessionId, id), eq(alerts.status, "active")));
    expect(active.some((a) => a.type === "budget_overrun")).toBe(false);
    // $325 of $325 is exactly 100%: by the plan's formula that is a (fresh) warning.
    expect(active.find((a) => a.dedupeKey === "budget_warning:Dining:2026-10")?.facts).toMatchObject({ percent: 100 });
  });

  it("approving again is blocked (409 path), logged, and changes nothing", async () => {
    const { id, actionId } = await withOverrunProposal();
    await approveAction(db, id, 0, actionId, TODAY);
    const before = JSON.stringify(await budgetRows(id));
    const again = await approveAction(db, id, 0, actionId, TODAY);
    expect(again).toMatchObject({ status: "conflict", reason: "not_pending" });
    expect(JSON.stringify(await budgetRows(id))).toBe(before);
    expect((await events(id)).filter((e) => e === "action_blocked")).toHaveLength(1);
  });

  it("marks the proposal stale when the stored limit changed since it was proposed", async () => {
    const { id, actionId } = await withOverrunProposal();
    await db
      .update(budgets)
      .set({ limitCents: 24_000 })
      .where(and(eq(budgets.sessionId, id), eq(budgets.category, "Shopping"), eq(budgets.month, "2026-10")));
    const before = JSON.stringify(await budgetRows(id));
    const out = await approveAction(db, id, 0, actionId, TODAY);
    expect(out).toMatchObject({ status: "conflict", reason: "stale" });
    expect((await getAction(db, id, actionId))!.status).toBe("stale");
    expect(JSON.stringify(await budgetRows(id))).toBe(before);
    expect(await events(id)).toContain("action_blocked");
  });

  it("fails a proposal whose month is no longer current or next", async () => {
    const { id, actionId } = await withOverrunProposal();
    const out = await approveAction(db, id, 0, actionId, "2026-12-02");
    expect(out).toMatchObject({ status: "conflict", reason: "invalid" });
    expect((await getAction(db, id, actionId))!.status).toBe("failed");
  });

  it("cannot approve another session's proposal (not found) and logs the attempt", async () => {
    const { actionId } = await withOverrunProposal();
    const attacker = await session();
    expect(await approveAction(db, attacker, 0, actionId, TODAY)).toEqual({ status: "not_found" });
    expect(await getAction(db, attacker, actionId)).toBeNull();
    const [blocked] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.sessionId, attacker), eq(auditLog.event, "action_blocked")));
    expect(blocked.details).toMatchObject({ action_id: actionId, reason: "not_found" });
  });

  it("applies an assistant proposal for next month", async () => {
    const id = await session();
    const state = { proposal: null as { id: string } | null };
    await executeTool(
      { db, sessionId: id, epoch: 0, today: TODAY },
      "propose_budget_adjustment",
      JSON.stringify({ changes: [{ category: "Dining", month: "2026-11", new_limit_cents: 22_500 }], rationale: "Save $75 next month on dining." }),
      state as never,
    );
    expect((await approveAction(db, id, 0, state.proposal!.id, TODAY)).status).toBe("executed");
    const [row] = await db.select().from(budgets).where(and(eq(budgets.sessionId, id), eq(budgets.category, "Dining"), eq(budgets.month, "2026-11")));
    expect(row.limitCents).toBe(22_500);
  });
});

describe("reject", () => {
  it("marks rejected, logs it, and leaves budgets byte-identical", async () => {
    const { id, actionId } = await withOverrunProposal();
    const before = JSON.stringify(await budgetRows(id));
    const out = await rejectAction(db, id, 0, actionId);
    expect(out.status).toBe("rejected");
    expect(JSON.stringify(await budgetRows(id))).toBe(before);
    expect(await events(id)).toContain("action_rejected");
  });

  it("a rejected proposal can be neither approved nor rejected again", async () => {
    const { id, actionId } = await withOverrunProposal();
    await rejectAction(db, id, 0, actionId);
    expect(await approveAction(db, id, 0, actionId, TODAY)).toMatchObject({ status: "conflict", reason: "not_pending" });
    expect(await rejectAction(db, id, 0, actionId)).toMatchObject({ status: "conflict", reason: "not_pending" });
    const [row] = await db.select().from(agentActions).where(eq(agentActions.id, actionId));
    expect(row.status).toBe("rejected");
  });

  it("cannot reject another session's proposal", async () => {
    const { actionId } = await withOverrunProposal();
    expect(await rejectAction(db, await session(), 0, actionId)).toEqual({ status: "not_found" });
  });
});
