import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAgentTurn } from "@/lib/agent/loop";
import { TOOLS, executeTool, type ToolContext } from "@/lib/agent/tools";
import { TRACED_TOOLS, buildTrace } from "@/lib/agent/trace";
import type { LlmClient, LlmResponse } from "@/lib/agent/types";
import { loadChat } from "@/lib/db/chat";
import { ensureSession } from "@/lib/db/sessions";
import type { Db } from "@/lib/db/types";
import { TODAY_FOR_TESTS, createTestDb } from "../helpers/db";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => close());

async function ctx(): Promise<ToolContext> {
  const sessionId = randomUUID();
  await ensureSession(db, sessionId, TODAY_FOR_TESTS);
  return { db, sessionId, epoch: 0, today: TODAY_FOR_TESTS };
}

const ARGS: Record<string, unknown> = {
  get_account_summary: {},
  get_transactions: { month: "2026-10", category: "Dining" },
  get_spending_by_category: { month: "2026-10" },
  get_budget_status: { month: "2026-10" },
  get_upcoming_bills: { days: 7 },
  compare_monthly_spending: { month_a: "2026-08", month_b: "2026-09" },
  check_affordability: { amount_cents: 90_000 },
  find_recurring_charges: {},
  analyze_bills: { bill: "Electricity" },
  plan_overrun_fix: { category: "Dining", month: "2026-10" },
  get_proposals: {},
  propose_budget_adjustment: { changes: [{ category: "Dining", month: "2026-11", new_limit_cents: 25_000 }], rationale: "Lower dining next month." },
};
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe("receipts trace", () => {
  it("has a friendly label and summary for every registered tool", () => {
    expect([...TRACED_TOOLS].sort()).toEqual(TOOLS.map((t) => t.name).sort());
  });

  it("summarizes every tool's real output with ≤ 4 key figures and no IDs", async () => {
    const c = await ctx();
    for (const t of TOOLS) {
      const r = await executeTool(c, t.name, JSON.stringify(ARGS[t.name]), { proposal: null });
      expect(r.ok, t.name).toBe(true);
      const [step] = buildTrace([{ toolName: t.name, input: r.input, output: r.output, ok: r.ok, durationMs: 12 }]);
      expect(step.label, t.name).not.toBe("Ran a check");
      expect(step.key_figures.length, t.name).toBeGreaterThan(0);
      expect(step.key_figures.length, t.name).toBeLessThanOrEqual(4);
      const json = JSON.stringify(step);
      expect(json, t.name).not.toMatch(UUID);
      expect(json, t.name).not.toMatch(/null|undefined|session/i);
    }
  });

  it("the $900 affordability row reads as the user would say it", async () => {
    const c = await ctx();
    const r = await executeTool(c, "check_affordability", JSON.stringify({ amount_cents: 90_000 }), { proposal: null });
    expect(buildTrace([{ toolName: "check_affordability", input: r.input, output: r.output, ok: true, durationMs: 40 }])[0]).toEqual({
      tool: "check_affordability",
      label: "Ran affordability check",
      input_summary: ["$900.00"],
      ok: true,
      duration_ms: 40,
      key_figures: ["Disposable $3,261.26", "After purchase $2,361.26", "Bills $1,660.99"],
    });
  });

  it("labels inputs (months, windows) and shows failed calls without figures", () => {
    const [budget, compare, bad] = buildTrace([
      { toolName: "get_budget_status", input: { month: "2026-10" }, output: { budgets: [] }, ok: true, durationMs: 5 },
      { toolName: "compare_monthly_spending", input: { month_a: "2026-08", month_b: "2026-09" }, output: {}, ok: true, durationMs: 5 },
      { toolName: "get_budget_status", input: { month: "nope" }, output: { error: "Invalid arguments" }, ok: false, durationMs: 1 },
    ]);
    expect(budget.label).toBe("Checked October budgets");
    expect(compare).toMatchObject({ label: "Compared August with September", input_summary: ["August", "September"] });
    expect(bad).toMatchObject({ ok: false, key_figures: [], label: "Checked your budgets" });
  });

  it("the turn response and the reloaded thread carry the same trace, in call order", async () => {
    const c = await ctx();
    const call = (name: string, args: unknown) => ({ id: randomUUID(), name, arguments: JSON.stringify(args) });
    const script: LlmResponse[] = [
      { content: null, toolCalls: [call("check_affordability", { amount_cents: 90_000 }), call("get_upcoming_bills", { days: 30 }), call("get_account_summary", {})], usage: null },
      { content: "Yes: disposable funds are $3,261.26, and $2,361.26 after the purchase.", toolCalls: [], usage: null },
    ];
    const llm: LlmClient = { model: "fake", complete: async () => script.shift()! };
    const turn = await runAgentTurn({ ...c, appName: "Cents" }, llm, "Can I afford a $900 purchase?");
    expect(turn.reply.trace.map((s) => s.tool)).toEqual(["check_affordability", "get_upcoming_bills", "get_account_summary"]);
    expect(turn.reply.turnMs).toBeGreaterThanOrEqual(0);
    expect(turn.user.trace).toEqual([]);
    const [, reply] = await loadChat(db, c.sessionId);
    expect(reply.trace).toEqual(turn.reply.trace);
    expect(reply.turnMs).toBe(turn.reply.turnMs);
    expect(JSON.stringify(turn)).not.toContain(c.sessionId);
  });
});
