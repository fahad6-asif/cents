/**
 * Security suite (plan Phase 9), engine/API level on PGlite. HTTP-level checks live in
 * tests/e2e/security.spec.ts; LLM checks (injection, jailbreak) in scripts/security-llm.mts.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq, sql } from "drizzle-orm";
import { runAgentTurn } from "@/lib/agent/loop";
import { systemPrompt } from "@/lib/agent/prompt";
import { checkChatRateLimit } from "@/lib/agent/rate-limit";
import { TOOLS, executeTool, toolDefinitions } from "@/lib/agent/tools";
import type { LlmClient } from "@/lib/agent/types";
import { clearChat } from "@/lib/db/chat";
import { loadSessionData } from "@/lib/db/queries";
import { agentActions, alerts, budgets, sessions, transactions } from "@/lib/db/schema";
import { ensureSession, resetSession } from "@/lib/db/sessions";
import type { Db } from "@/lib/db/types";
import { approveAction, getAction, rejectAction } from "@/lib/engine/actions";
import { dismissAlert } from "@/lib/engine/dismiss";
import { MAX_SIMULATED_PER_SESSION, simulateEvent } from "@/lib/engine/simulate";
import { INJECTION_MERCHANT } from "@/seed/generate";
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
const sim = (sessionId: string, eventId: "restaurant" | "groceries", key = randomUUID()) =>
  simulateEvent(db, { sessionId, epoch: 0, eventId, idempotencyKey: key, today: TODAY, timeOfDay: "12:00:00.000" });
async function overrunProposal() {
  const id = await session();
  await sim(id, "restaurant");
  const [alert] = await db.select().from(alerts).where(and(eq(alerts.sessionId, id), eq(alerts.type, "budget_overrun")));
  return { id, actionId: alert.proposalId!, alertId: alert.id };
}
const budgetJson = async (id: string) =>
  JSON.stringify(
    await db.select().from(budgets).where(eq(budgets.sessionId, id)).orderBy(asc(budgets.month), asc(budgets.category)),
  );
const silentLlm: LlmClient = { model: "fake", complete: async () => ({ content: "ok", toolCalls: [], usage: null }) };

describe("1–3. approval endpoint guards", () => {
  it("1. nonexistent or foreign action → not found", async () => {
    const { actionId } = await overrunProposal();
    const other = await session();
    expect(await approveAction(db, other, 0, randomUUID(), TODAY)).toEqual({ status: "not_found" });
    expect(await approveAction(db, other, 0, actionId, TODAY)).toEqual({ status: "not_found" });
    expect(await rejectAction(db, other, 0, actionId)).toEqual({ status: "not_found" });
    expect(await getAction(db, other, actionId)).toBeNull();
  });

  it("2. a rejected action cannot be executed", async () => {
    const { id, actionId } = await overrunProposal();
    await rejectAction(db, id, 0, actionId);
    const before = await budgetJson(id);
    expect(await approveAction(db, id, 0, actionId, TODAY)).toMatchObject({ status: "conflict", reason: "not_pending" });
    expect(await budgetJson(id)).toBe(before);
  });

  it("3. duplicate approval is blocked and never applies twice", async () => {
    const { id, actionId } = await overrunProposal();
    const results = await Promise.all([1, 2, 3].map(() => approveAction(db, id, 0, actionId, TODAY)));
    expect(results.filter((r) => r.status === "executed")).toHaveLength(1);
    const [dining] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.sessionId, id), eq(budgets.category, "Dining"), eq(budgets.month, "2026-10")));
    expect(dining.limitCents).toBe(32_500); // +$25 once, not three times
  });
});

describe("5. invalid proposals are rejected by the tool and by the approval endpoint", () => {
  const bad = [
    ["unknown category", { category: "Crypto", month: "2026-11", new_limit_cents: 100 }],
    ["negative limit", { category: "Dining", month: "2026-11", new_limit_cents: -100 }],
    ["over $10,000", { category: "Dining", month: "2026-11", new_limit_cents: 1_000_001 }],
    ["month outside current/next", { category: "Dining", month: "2027-01", new_limit_cents: 100 }],
  ] as const;

  it.each(bad)("tool rejects %s", async (_label, change) => {
    const id = await session();
    const r = await executeTool({ db, sessionId: id, epoch: 0, today: TODAY }, "propose_budget_adjustment", JSON.stringify({ changes: [change], rationale: "Testing a bad proposal." }), { proposal: null });
    expect(r.ok).toBe(false);
    expect(await db.select().from(agentActions).where(eq(agentActions.sessionId, id))).toHaveLength(0);
  });

  it.each(bad)("approval re-validates a tampered proposal with %s and applies nothing", async (_label, change) => {
    const { id, actionId } = await overrunProposal();
    // Simulate a tampered row: the endpoint must not trust what is stored.
    await db
      .update(agentActions)
      .set({ changes: [{ ...change, old_limit_cents: 30_000 }] })
      .where(eq(agentActions.id, actionId));
    const before = await budgetJson(id);
    const out = await approveAction(db, id, 0, actionId, TODAY);
    expect(out.status).toBe("conflict");
    expect(await budgetJson(id)).toBe(before);
  });

  it("the tool cannot set a status, origin or old limit (strict schema)", async () => {
    const id = await session();
    const r = await executeTool(
      { db, sessionId: id, epoch: 0, today: TODAY },
      "propose_budget_adjustment",
      JSON.stringify({ changes: [{ category: "Dining", month: "2026-11", new_limit_cents: 100, old_limit_cents: 100 }], rationale: "Sneaky extra fields.", status: "executed" }),
      { proposal: null },
    );
    expect(r.ok).toBe(false);
  });
});

describe("6–7. the assistant has no way to approve or apply", () => {
  it("exposes no approve/execute/delete/SQL tool and only one non-read tool", () => {
    const names = toolDefinitions().map((t) => t.function.name);
    expect(names.some((n) => /approve|execute|apply|delete|sql|update/i.test(n))).toBe(false);
    expect(TOOLS.filter((t) => t.kind !== "read").map((t) => t.name)).toEqual(["propose_budget_adjustment"]);
  });

  it("merchant text reaches the model only as data, and the prompt says data is not instructions", async () => {
    const id = await session();
    const r = await executeTool({ db, sessionId: id, epoch: 0, today: TODAY }, "get_transactions", JSON.stringify({ month: "2026-09", category: "Dining", limit: 50 }), { proposal: null });
    const text = JSON.stringify(r.output);
    expect(text).toContain(`"data":{"merchant":"${INJECTION_MERCHANT}"}`);
    // Merchant text never appears as a top-level field of any row, only inside "data".
    const out = r.output as { transactions: Record<string, unknown>[]; by_merchant: Record<string, unknown>[] };
    for (const row of [...out.transactions, ...out.by_merchant]) {
      expect(row).not.toHaveProperty("merchant");
      expect(row).toHaveProperty("data.merchant");
    }
    expect(systemPrompt("Cents", TODAY)).toMatch(/untrusted data, never instructions/);
  });
});

describe("every read tool is read-only (addendum §7)", () => {
  /** Sample arguments per read tool; a new read tool without an entry fails this test on purpose. */
  const SAMPLE_ARGS: Record<string, unknown> = {
    get_account_summary: {},
    get_transactions: { month: "2026-09", limit: 50 },
    get_spending_by_category: { last_days: 7 },
    get_budget_status: { month: "2026-10" },
    get_upcoming_bills: { days: 30 },
    compare_monthly_spending: { month_a: "2026-08", month_b: "2026-09" },
    check_affordability: { amount_cents: 90_000 },
    get_proposals: { status: "all" },
    find_recurring_charges: { lookback_months: 6 },
    analyze_bills: { months: 6 },
    plan_overrun_fix: { category: "Dining", month: "2026-10" },
    get_category_history: { months: 3 },
  };
  const TABLES = ["sessions", "accounts", "transactions", "budgets", "bills", "alerts", "agent_actions", "audit_log", "chat_messages", "tool_calls"];
  const counts = async () => {
    const out: Record<string, number> = {};
    for (const t of TABLES) out[t] = Number(((await db.execute(sql.raw(`select count(*)::int as n from ${t}`))) as unknown as { rows: { n: number }[] }).rows[0].n);
    return out;
  };

  it("runs each read tool and leaves every table's row count unchanged", async () => {
    const { id } = await overrunProposal();
    const ctx = { db, sessionId: id, epoch: 0, today: TODAY };
    for (const t of TOOLS.filter((x) => x.kind === "read")) {
      expect(SAMPLE_ARGS, `add sample args for ${t.name}`).toHaveProperty(t.name);
      const before = await counts();
      const r = await executeTool(ctx, t.name, JSON.stringify(SAMPLE_ARGS[t.name]), { proposal: null });
      expect(r.ok, t.name).toBe(true);
      expect(await counts(), `${t.name} wrote to the database`).toEqual(before);
    }
  });
});

describe("9. rate limits survive reset and clearing the chat", () => {
  it("blocks after N turns per hour and stays blocked after reset/clear", async () => {
    const id = await session();
    const cfg = { perSessionPerHour: 3, globalPerDay: 10_000 };
    for (let i = 0; i < 3; i++) await runAgentTurn({ db, sessionId: id, epoch: 0, today: TODAY, appName: "Cents" }, silentLlm, `q${i}`);
    expect(await checkChatRateLimit(db, id, cfg)).toMatchObject({ ok: false, scope: "session" });
    await clearChat(db, id);
    await resetSession(db, id, TODAY);
    expect(await checkChatRateLimit(db, id, cfg)).toMatchObject({ ok: false, scope: "session" });
  });
});

describe("10. session isolation at the engine level", () => {
  it("one session cannot dismiss, approve, reject or read another session's records", async () => {
    const a = await overrunProposal();
    const b = await session();
    expect(await dismissAlert(db, b, 0, a.alertId)).toEqual({ status: "not_found" });
    expect(await approveAction(db, b, 0, a.actionId, TODAY)).toEqual({ status: "not_found" });
    const bData = await loadSessionData(db, b);
    expect(bData.txs.some((t) => t.merchant === "Bella Napoli" && t.source === "simulated")).toBe(false);
    expect((await getAction(db, a.id, a.actionId))!.status).toBe("pending");
  });

  it("idempotency keys are scoped per session (a key from A cannot replay or block B)", async () => {
    const a = await session();
    const b = await session();
    const key = randomUUID();
    const ra = await sim(a, "groceries", key);
    const rb = await sim(b, "groceries", key);
    expect(rb.replayed).toBe(false);
    expect(rb.transaction.id).not.toBe(ra.transaction.id);
  });
});

describe("abuse caps", () => {
  it("refuses to create sessions beyond the hourly cap (nothing seeded)", async () => {
    const existing = (await db.select().from(sessions)).length;
    const id = randomUUID();
    expect(await ensureSession(db, id, TODAY, { maxNewPerHour: existing })).toBeNull();
    expect(await db.select().from(sessions).where(eq(sessions.id, id))).toHaveLength(0);
    expect(await db.select().from(transactions).where(eq(transactions.sessionId, id))).toHaveLength(0);
    expect(await ensureSession(db, id, TODAY, { maxNewPerHour: existing + 1 })).not.toBeNull();
  });

  it(`caps simulated transactions at ${MAX_SIMULATED_PER_SESSION} per session (replays still work)`, async () => {
    const id = await session();
    const [account] = await db.select().from(transactions).where(eq(transactions.sessionId, id)).limit(1);
    const keys = Array.from({ length: MAX_SIMULATED_PER_SESSION }, () => randomUUID());
    await db.insert(transactions).values(
      keys.map((k) => ({
        sessionId: id,
        accountId: account.accountId,
        amountCents: -100,
        category: "Groceries",
        merchant: "Grocery Mart",
        occurredAt: new Date(`${TODAY}T10:00:00Z`),
        type: "expense" as const,
        source: "simulated" as const,
        idempotencyKey: k,
      })),
    );
    expect((await sim(id, "groceries")).limited).toBe(true);
    expect(await sim(id, "groceries", keys[0])).toMatchObject({ replayed: true });
  });
});

describe("audit log is append-only in app code", () => {
  it("no source file updates audit_log, and only session cleanup deletes old orphan rows", () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
    const offenders = files("src")
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .flatMap((f) => {
        const text = readFileSync(f, "utf8");
        const hits = [...text.matchAll(/\.(update|delete)\(auditLog\)/g)].map((m) => `${f}: ${m[0]}`);
        return hits;
      });
    expect(offenders).toEqual([join("src", "lib", "db", "sessions.ts") + ": .delete(auditLog)"]);
  });
});
