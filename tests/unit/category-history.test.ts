import { describe, expect, it } from "vitest";
import { categoryHistory, pace, paceLine } from "@/lib/domain/category-history";
import type { DomainBill, DomainBudget, DomainTx } from "@/lib/domain/types";
import { SEED_END, generateSeed } from "@/seed/generate";

const seed = generateSeed();
const seedTxs: DomainTx[] = seed.transactions.map((t, i) => ({ ...t, id: `seed-${i}` }));
const seedBills: DomainBill[] = seed.bills.map((b, i) => ({ ...b, id: `bill-${i}` }));

const tx = (category: string, day: string, cents: number): DomainTx => ({
  id: `${category}-${day}-${cents}`,
  amountCents: -cents,
  category,
  merchant: "Test",
  occurredAt: `${day}T12:00:00.000Z`,
  type: "expense",
});
const both = (category: string, cents: number): DomainBudget[] => [
  { category, month: "2026-10", limitCents: cents },
  { category, month: "2026-11", limitCents: cents },
];
/** Three full months (Jul–Sep) of the given spend, plus October so far. */
const history = (category: string, monthly: [number, number, number], october = 0) => [
  tx(category, "2026-07-10", monthly[0]),
  tx(category, "2026-08-10", monthly[1]),
  tx(category, "2026-09-10", monthly[2]),
  ...(october ? [tx(category, "2026-10-05", october)] : []),
];
const one = (category: string, budgets: DomainBudget[], txs: DomainTx[], today = "2026-10-15", bills: DomainBill[] = []) =>
  categoryHistory({ budgets, txs, bills, today, category }).categories[0];

describe("pace", () => {
  it("day 1, 15 and 31 of a 31-day month", () => {
    expect(pace(1_000, 31_000, 1, 31)).toEqual({ pacePct: 100, projectedCents: 31_000 });
    expect(pace(15_000, 31_000, 15, 31)).toEqual({ pacePct: 100, projectedCents: 31_000 });
    expect(pace(26_500, 30_000, 15, 31)).toEqual({ pacePct: 182.6, projectedCents: 54_767 });
    expect(pace(20_000, 30_000, 31, 31)).toEqual({ pacePct: 66.7, projectedCents: 20_000 });
  });

  it("on_pace and projections through the domain function", () => {
    const early = one("Dining", both("Dining", 30_000), [tx("Dining", "2026-10-01", 2_000)], "2026-10-01");
    expect(early.current).toMatchObject({ daysElapsed: 1, daysInMonth: 31, pacePct: 206.7, projectedMonthEndCents: 62_000, onPace: false });
    const last = one("Dining", both("Dining", 30_000), [tx("Dining", "2026-10-20", 29_000)], "2026-10-31");
    expect(last.current).toMatchObject({ daysElapsed: 31, pacePct: 96.7, projectedMonthEndCents: 29_000, onPace: true });
  });
});

describe("suggestions (rounded up to $10)", () => {
  it("chronically over → meet halfway", () => {
    // avg $360 vs limit $300 → $330
    const h = one("Dining", both("Dining", 30_000), history("Dining", [36_000, 34_000, 38_000]));
    expect(h).toMatchObject({ averageFullMonthsCents: 36_000, monthsOverBudget: 3, suggestedNextLimitCents: 33_000, suggestionReason: "chronically_over" });
    // avg $303.33 → 300 + 1.67 = $301.67 → $310
    expect(one("Dining", both("Dining", 30_000), history("Dining", [30_000, 30_000, 31_000])).suggestedNextLimitCents).toBe(31_000);
  });

  it("consistently under → max(avg × 1.15, 70% of limit)", () => {
    // avg $100 vs $250: max(115, 175) = $175 → $180
    expect(one("Shopping", both("Shopping", 25_000), history("Shopping", [10_000, 10_000, 10_000]))).toMatchObject({ suggestedNextLimitCents: 18_000, suggestionReason: "consistently_under" });
    // avg $170 vs $250: max(195.50, 175) → $200
    expect(one("Shopping", both("Shopping", 25_000), history("Shopping", [17_000, 17_000, 17_000])).suggestedNextLimitCents).toBe(20_000);
  });

  it("on track → keep the limit", () => {
    expect(one("Entertainment", both("Entertainment", 15_000), history("Entertainment", [12_000, 14_000, 13_000]))).toMatchObject({ suggestedNextLimitCents: 15_000, suggestionReason: "on_track" });
  });

  it("fixed → keep, unless next month's known bills exceed it", () => {
    const rent: DomainBill = { id: "r", name: "Rent", amountCents: 190_000, category: "Housing", dueDate: "2026-11-01", status: "unpaid" };
    const h = one("Housing", both("Housing", 185_000), history("Housing", [185_000, 185_000, 185_000], 185_000));
    expect(h).toMatchObject({ fixed: true, suggestedNextLimitCents: 185_000, suggestionReason: "fixed" });
    expect(h.current).toMatchObject({ projectedMonthEndCents: 185_000, onPace: true });
    expect(one("Housing", both("Housing", 185_000), [], "2026-10-15", [rent])).toMatchObject({ suggestedNextLimitCents: 190_000, suggestionReason: "fixed_bills_due" });
  });

  it("never cuts an essential category", () => {
    expect(one("Groceries", both("Groceries", 60_000), history("Groceries", [20_000, 20_000, 20_000]))).toMatchObject({ suggestedNextLimitCents: 60_000, suggestionReason: "essential_kept" });
  });

  it("uses next month's stored limit as the base and totals the difference", () => {
    const budgets: DomainBudget[] = [...both("Dining", 30_000).slice(0, 1), { category: "Dining", month: "2026-11", limitCents: 20_000 }];
    const r = categoryHistory({ budgets, txs: history("Dining", [30_000, 30_000, 30_000]), bills: [], today: "2026-10-15" });
    expect(r.categories[0]).toMatchObject({ nextLimitCents: 20_000, suggestedNextLimitCents: 25_000, limitBasis: "current_limit" });
    expect(r.totals).toEqual({ currentLimitsSumCents: 20_000, suggestedLimitsSumCents: 25_000, differenceCents: 5_000 });
  });
});

describe("paceLine", () => {
  it("ahead of pace beats history; history shows when two or more months were over", () => {
    const ahead = one("Dining", both("Dining", 30_000), [...history("Dining", [36_000, 34_000, 38_000]), tx("Dining", "2026-10-05", 26_500)]);
    expect(paceLine(ahead)).toEqual({ kind: "ahead", projectedCents: 54_767 });
    const chronic = one("Dining", both("Dining", 30_000), [...history("Dining", [36_000, 34_000, 20_000]), tx("Dining", "2026-10-05", 5_000)]);
    expect(paceLine(chronic)).toEqual({ kind: "history_over", over: 2, of: 3 });
    expect(paceLine(one("Dining", both("Dining", 30_000), [tx("Dining", "2026-10-05", 5_000)]))).toEqual({ kind: "on_pace" });
  });
});

describe("seed", () => {
  it("gives a deterministic plan where nothing on pace or essential is cut", () => {
    const r = categoryHistory({ budgets: seed.budgets, txs: seedTxs, bills: seedBills, today: SEED_END });
    expect(r).toEqual(categoryHistory({ budgets: seed.budgets, txs: [...seedTxs], bills: seedBills, today: SEED_END }));
    for (const c of r.categories) {
      if (c.essential || c.fixed) expect(c.suggestedNextLimitCents, c.category).toBeGreaterThanOrEqual(c.nextLimitCents);
      if (c.suggestedNextLimitCents < c.nextLimitCents) expect(c.suggestionReason, c.category).toBe("consistently_under");
      expect(c.suggestedNextLimitCents % 1_000 === 0 || c.suggestedNextLimitCents === c.nextLimitCents, c.category).toBe(true);
    }
  });
});
