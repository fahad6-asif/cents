import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVENT_LABEL, describeEvent, eventLabel } from "@/lib/audit-labels";

// Every event name the AuditEvent union declares (read from the source, so a new event is covered here).
const declared = [...readFileSync("src/lib/db/audit.ts", "utf8").matchAll(/\|\s*"([a-z_]+)"/g)].map((m) => m[1]);

describe("Insights action-log labels", () => {
  it("gives every audit event a human label (no raw snake_case shown)", () => {
    expect(declared.length).toBeGreaterThanOrEqual(20);
    for (const e of declared) {
      expect(EVENT_LABEL[e as keyof typeof EVENT_LABEL], e).toBeTruthy();
      expect(eventLabel(e), e).not.toMatch(/_/);
    }
    expect(eventLabel("some_future_event")).toBe("Some future event");
  });

  it("describes the newer events in plain words", () => {
    expect(describeEvent("reply_verified", { verified_count: 12, total_count: 12, retried: false })).toBe("All 12 figures checked against the account");
    expect(describeEvent("reply_verified", { verified_count: 3, total_count: 3, retried: true })).toBe("All 3 figures checked against the account · after one correction");
    expect(describeEvent("reply_verified", { verified_count: 0, total_count: 0 })).toBe("No figures to check");
    expect(describeEvent("reply_unverified", { verified_count: 1, total_count: 2, retried: true })).toBe("1 of 2 figures matched · after one correction");
    expect(describeEvent("action_stale", { reason: "limits_changed" })).toBe("Can no longer be approved: budgets changed since it was proposed");
    expect(describeEvent("impact_note_requested", { transaction_ids: ["a"] })).toBe("For 1 new transaction");
    expect(describeEvent("impact_note_completed", { tool_count: 1, failed: false })).toBe("1 step");
    expect(describeEvent("simulate_rate_limited", { limit_per_hour: 30 })).toBe("Up to 30 custom transactions per hour");
    expect(describeEvent("chat_message", { tools: ["plan_overrun_fix", "propose_budget_adjustment"] })).toBe("Used: overrun fix plan, budget proposal");
    expect(describeEvent("chat_message", { tools: ["impact_facts", "get_budget_status", "get_budget_status"] })).toBe("Used: server fact check, budget status");
    expect(describeEvent("chat_message", { tools: [] })).toBe("Answered without tools");
  });

  it("never shows a custom transaction's merchant (it isn't logged) or the word undefined", () => {
    const custom = describeEvent("transaction_simulated", { origin: "custom", category: "Entertainment", amount_cents: -12_000, merchant_length: 15 });
    expect(custom).toBe("Custom −$120.00 (Entertainment)");
    expect(describeEvent("transaction_simulated", { origin: "preset", merchant: "Bella Napoli", category: "Dining", amount_cents: -6_000 })).toBe("Bella Napoli −$60.00 (Dining)");
    expect(describeEvent("transaction_simulated", { category: "Dining", amount_cents: -100 })).not.toContain("undefined");
  });
});
