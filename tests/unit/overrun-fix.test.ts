import { describe, expect, it } from "vitest";
import { budgetStatuses } from "@/lib/domain/budgets";
import { ESSENTIAL_CATEGORIES } from "@/lib/domain/categories";
import { SOURCE_BUFFER, planOverrunFix, type OverrunFix } from "@/lib/domain/overrun-fix";
import { buildOverrunReallocation, validateChanges } from "@/lib/domain/proposals";
import type { DomainBill, DomainBudget, DomainTx } from "@/lib/domain/types";
import { SIM_EVENTS } from "@/lib/sim-events";
import { SEED_END, generateSeed } from "@/seed/generate";

const seed = generateSeed();
const TODAY = SEED_END;
const baseTxs: DomainTx[] = seed.transactions.map((t, i) => ({ ...t, id: `seed-${i}` }));
const bills: DomainBill[] = seed.bills.map((b, i) => ({ ...b, id: `bill-${i}` }));

const spend = (category: string, cents: number, id = `x-${category}-${cents}`): DomainTx => ({
  id,
  amountCents: -cents,
  category,
  merchant: "Test",
  occurredAt: `${TODAY}T15:00:00.000Z`,
  type: "expense",
});
const simulate = (eventId: string) => {
  const e = SIM_EVENTS.find((s) => s.id === eventId)!;
  return spend(e.category, -e.amountCents, `sim-${eventId}`);
};
const plan = (category: string, txs: DomainTx[], budgets: readonly DomainBudget[] = seed.budgets) =>
  planOverrunFix({ category, budgets, txs, bills, today: TODAY });

/** Invariants (a)–(e) from the addendum, checked on any result. */
function assertInvariants(r: OverrunFix, txs: DomainTx[], budgets: readonly DomainBudget[] = seed.budgets) {
  // (a) no essential category in the change set
  for (const c of r.changes) expect(ESSENTIAL_CATEGORIES as readonly string[]).not.toContain(c.category);
  // (b) no source ends below spent + upcoming bills + buffer
  const statuses = budgetStatuses(budgets, txs, r.month, TODAY);
  for (const s of r.sources) {
    const st = statuses.find((x) => x.category === s.category)!;
    const upcoming = bills.filter((b) => b.status === "unpaid" && b.category === s.category && b.dueDate.startsWith(r.month)).reduce((t, b) => t + b.amountCents, 0);
    const buffer = Math.max(SOURCE_BUFFER.minCents, Math.ceil((st.limitCents * SOURCE_BUFFER.pct) / 100));
    expect(st.limitCents - s.takenCents).toBeGreaterThanOrEqual(st.spentCents + upcoming + buffer);
  }
  // (c) everything is accounted for
  expect(r.coveredNowCents + r.carriedCents + r.uncoveredCents).toBe(r.overageCents);
  // (d) fully covered → limits only move between categories and months
  if (r.uncoveredCents === 0) expect(r.netChangeCents).toBe(0);
  // (e) the existing proposal validator accepts it (current + next month)
  if (r.changes.length) {
    const limit = (category: string, month: string) => budgets.find((b) => b.category === category && b.month === month)?.limitCents;
    expect(validateChanges(r.changes, { currentMonth: r.month, currentLimit: limit })).toEqual({ ok: true });
  }
}

describe("planOverrunFix", () => {
  it("large purchase: Shopping over, covered from Entertainment now and carried to November, net $0", () => {
    const txs = [...baseTxs, simulate("large_purchase")];
    const r = plan("Shopping", txs);
    assertInvariants(r, txs);
    expect(r).toMatchObject({ needed: true, overspentCents: 19_412, overageCents: 19_500, coveredNowCents: 6_100, carriedCents: 13_400, uncoveredCents: 0, netChangeCents: 0 });
    expect(r.sources).toEqual([{ category: "Entertainment", roomCents: 6_100, takenCents: 6_100 }]);
    expect(r.changes).toEqual([
      { category: "Shopping", month: "2026-10", old_limit_cents: 25_000, new_limit_cents: 44_500 },
      { category: "Entertainment", month: "2026-10", old_limit_cents: 15_000, new_limit_cents: 8_900 },
      { category: "Shopping", month: "2026-11", old_limit_cents: 25_000, new_limit_cents: 11_600 },
    ]);
    expect(r.notes[0]).toBe("This rebalances limits; it doesn't undo the spending.");
    // After approval October Shopping covers what was spent, so the overrun alert can resolve.
    expect(44_500).toBeGreaterThanOrEqual(25_000 + r.overspentCents);
    // The rule engine can't do this with a single move.
    const statuses = budgetStatuses(seed.budgets, txs, "2026-10", TODAY);
    expect(buildOverrunReallocation(statuses.find((s) => s.category === "Shopping")!, statuses)).toBeNull();
  });

  it("restaurant: agrees with the rule engine's single move ($25 from Shopping)", () => {
    const txs = [...baseTxs, simulate("restaurant")];
    const r = plan("Dining", txs);
    assertInvariants(r, txs);
    const statuses = budgetStatuses(seed.budgets, txs, "2026-10", TODAY);
    const rule = buildOverrunReallocation(statuses.find((s) => s.category === "Dining")!, statuses)!;
    expect(r).toMatchObject({ coveredNowCents: rule.amountCents, carriedCents: 0, uncoveredCents: 0 });
    expect(r.changes).toEqual(rule.changes.slice().reverse());
  });

  it("an overrun too big for sources + carry leaves an honest uncovered amount", () => {
    const txs = [...baseTxs, spend("Shopping", 120_000)];
    const r = plan("Shopping", txs);
    assertInvariants(r, txs);
    expect(r.uncoveredCents).toBeGreaterThan(0);
    expect(r.netChangeCents).toBe(0);
    expect(r.notes.at(-1)).toMatch(/can't be covered .* stays \$[\d,]+\.\d{2} over in October/);
    // Next month's Shopping never drops below its floor (max $20, 30%).
    expect(r.changes.find((c) => c.month === "2026-11")!.new_limit_cents).toBeGreaterThanOrEqual(7_500);
  });

  it("only touches discretionary sources under 80%, skipping ones with upcoming bills eating their room", () => {
    // Entertainment at 85% is not a source; Subscriptions has Streaming due and too little room.
    const txs = [...baseTxs, simulate("large_purchase"), spend("Entertainment", 5_400)];
    const r = plan("Shopping", txs);
    assertInvariants(r, txs);
    expect(r.sources).toEqual([]);
    expect(r.coveredNowCents).toBe(0);
    expect(r.notes).toContain("No discretionary budget has room to spare in October.");
  });

  it("returns needed: false when the category is within budget", () => {
    const r = plan("Dining", baseTxs);
    expect(r).toMatchObject({ needed: false, overageCents: 0, changes: [] });
  });

  it("never rebalances an essential category, but reports the overrun", () => {
    const txs = [...baseTxs, spend("Groceries", 40_000)];
    const r = plan("Groceries", txs);
    assertInvariants(r, txs);
    expect(r).toMatchObject({ needed: true, changes: [], coveredNowCents: 0, carriedCents: 0 });
    expect(r.uncoveredCents).toBe(r.overageCents);
  });

  it("carries nothing when next month has no budget for the category", () => {
    const txs = [...baseTxs, simulate("large_purchase")];
    const budgets = seed.budgets.filter((b) => !(b.category === "Shopping" && b.month === "2026-11"));
    const r = plan("Shopping", txs, budgets);
    assertInvariants(r, txs, budgets);
    expect(r).toMatchObject({ carriedCents: 0, uncoveredCents: 19_500 - 6_100 });
  });

  it("(f) is deterministic", () => {
    const txs = [...baseTxs, simulate("large_purchase")];
    expect(plan("Shopping", txs)).toEqual(plan("Shopping", [...txs]));
  });
});
