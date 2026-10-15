import { describe, expect, it } from "vitest";
import { checkAffordability, disposableFunds } from "@/lib/domain/affordability";
import { budgetAlerts, evaluateAlerts, medianCents, unusualSpendingAlerts, upcomingBillAlerts } from "@/lib/domain/alerts";
import { budgetStatuses, type BudgetStatus } from "@/lib/domain/budgets";
import { buildOverrunReallocation, classifyChanges, validateChanges, type BudgetChange } from "@/lib/domain/proposals";
import type { DomainBill, DomainBudget, DomainTx } from "@/lib/domain/types";

const TODAY = "2026-10-15";
let n = 0;
const tx = (day: string, amountCents: number, category = "Dining"): DomainTx => ({
  id: `t${++n}`,
  amountCents,
  category,
  merchant: "m",
  occurredAt: `${day}T12:00:00.000Z`,
  type: amountCents > 0 ? "income" : "expense",
});
const bill = (id: string, dueDate: string, amountCents: number, category = "Utilities", status: DomainBill["status"] = "unpaid"): DomainBill => ({
  id,
  name: id,
  amountCents,
  category,
  dueDate,
  status,
});

describe("budget alerts", () => {
  const budgets: DomainBudget[] = [
    { category: "Dining", month: "2026-10", limitCents: 30_000 },
    { category: "Shopping", month: "2026-10", limitCents: 25_000 },
  ];
  it("creates a warning at 88% with deterministic facts and a dedupe key", () => {
    const [a] = budgetAlerts(TODAY, [tx("2026-10-03", -26_500)], budgets);
    expect(a.type).toBe("budget_warning");
    expect(a.dedupeKey).toBe("budget_warning:Dining:2026-10");
    expect(a.facts).toMatchObject({ spent_cents: 26_500, limit_cents: 30_000, percent: 88, remaining_cents: 3_500 });
  });
  it("upgrades to an overrun above 100% (and no warning)", () => {
    const alerts = budgetAlerts(TODAY, [tx("2026-10-03", -32_500)], budgets);
    expect(alerts.map((a) => a.dedupeKey)).toEqual(["budget_overrun:Dining:2026-10"]);
    expect(alerts[0].facts).toMatchObject({ overage_cents: 2_500 });
  });
  it("ignores other months and spending after today", () => {
    expect(budgetAlerts(TODAY, [tx("2026-09-20", -40_000), tx("2026-10-16", -40_000)], budgets)).toEqual([]);
  });
});

describe("upcoming bill alerts", () => {
  it("fires for unpaid bills due today through 7 days out (inclusive)", () => {
    const alerts = upcomingBillAlerts(TODAY, [
      bill("today", "2026-10-15", 100),
      bill("tomorrow", "2026-10-16", 100),
      bill("day7", "2026-10-22", 100),
      bill("day8", "2026-10-23", 100),
      bill("paid", "2026-10-18", 100, "Utilities", "paid"),
      bill("overdue", "2026-10-14", 100),
    ]);
    expect(alerts.map((a) => a.facts.bill)).toEqual(["today", "tomorrow", "day7"]);
    expect(alerts.map((a) => a.title)).toEqual(["today bill due today", "tomorrow bill due tomorrow", "day7 bill due in 7 days"]);
    expect(alerts[2].dedupeKey).toBe("upcoming_bill:day7");
  });
});

describe("unusual spending", () => {
  const history = [tx("2026-08-01", -2_000), tx("2026-09-01", -2_000), tx("2026-09-15", -3_000)]; // median $20
  it("fires when > 3× the 90-day median and > $50", () => {
    const big = tx("2026-10-10", -6_001);
    const [a] = unusualSpendingAlerts(TODAY, [...history, big]);
    expect(a.dedupeKey).toBe(`unusual_spending:${big.id}`);
    expect(a.facts).toMatchObject({ amount_cents: 6_001, median_cents: 2_000 });
  });
  it("does not fire at exactly 3× the median", () => {
    expect(unusualSpendingAlerts(TODAY, [...history, tx("2026-10-10", -6_000)])).toEqual([]);
  });
  it("does not fire at $50 or less even when far above the median", () => {
    const cheap = [tx("2026-09-01", -500), tx("2026-09-02", -500)];
    expect(unusualSpendingAlerts(TODAY, [...cheap, tx("2026-10-10", -5_000)])).toEqual([]);
  });
  it("needs prior history in the 90-day window", () => {
    expect(unusualSpendingAlerts(TODAY, [tx("2026-10-10", -50_000)])).toEqual([]);
    expect(unusualSpendingAlerts(TODAY, [tx("2026-06-01", -1_000), tx("2026-10-10", -50_000)])).toEqual([]);
  });
  it("only looks at this month's expenses up to today", () => {
    expect(unusualSpendingAlerts(TODAY, [...history, tx("2026-10-16", -90_000)])).toEqual([]);
  });
  it("computes medians for odd, even and empty sets", () => {
    expect(medianCents([3, 1, 2])).toBe(2);
    expect(medianCents([1, 2])).toBe(2);
    expect(medianCents([])).toBeNull();
  });
});

describe("evaluateAlerts", () => {
  it("orders by severity: overrun > unusual > warning > upcoming bill", () => {
    const alerts = evaluateAlerts({
      today: TODAY,
      txs: [tx("2026-09-01", -2_000, "Shopping"), tx("2026-10-02", -9_000, "Shopping"), tx("2026-10-03", -32_000), tx("2026-10-04", -4_100, "Health")],
      budgets: [
        { category: "Dining", month: "2026-10", limitCents: 30_000 },
        { category: "Health", month: "2026-10", limitCents: 5_000 },
      ],
      bills: [bill("b", "2026-10-20", 4_500)],
    });
    expect(alerts.map((a) => a.type)).toEqual(["budget_overrun", "unusual_spending", "budget_warning", "upcoming_bill"]);
  });
});

describe("disposable funds and affordability", () => {
  // Balance 5,000.00 on Oct 15; Utilities 300 limit with 95 spent; Internet 45 + Phone 30 due in October.
  const input = {
    openingBalanceCents: 509_500,
    txs: [tx("2026-10-06", -9_500, "Utilities")],
    budgets: [
      { category: "Utilities", month: "2026-10", limitCents: 30_000 },
      { category: "Groceries", month: "2026-10", limitCents: 10_000 },
      { category: "Dining", month: "2026-10", limitCents: 30_000 }, // non-essential: not reserved
    ],
    bills: [
      bill("Internet", "2026-10-20", 4_500),
      bill("Phone", "2026-10-22", 3_000),
      bill("Rent", "2026-11-14", 145_000, "Housing"), // on the next income date: counted
      bill("Late", "2026-11-15", 10_000), // after the next income date: not counted
      bill("Paid", "2026-10-25", 12_000, "Utilities", "paid"),
    ],
    today: TODAY,
  };

  it("subtracts bills due by the next income date and the essential reserve, without double counting", () => {
    const f = disposableFunds(input);
    expect(f.balanceCents).toBe(500_000);
    expect(f.nextIncomeDate).toBe("2026-11-14");
    expect(f.bills.map((b) => b.name)).toEqual(["Internet", "Phone", "Rent"]);
    expect(f.billsTotalCents).toBe(152_500);
    const utilities = f.essentials.find((e) => e.category === "Utilities")!;
    expect(utilities).toMatchObject({ spentCents: 9_500, billsDueCents: 7_500, reservedCents: 13_000 });
    expect(f.essentials.map((e) => e.category)).toEqual(["Utilities", "Groceries"]);
    expect(f.essentialsTotalCents).toBe(13_000 + 10_000);
    expect(f.disposableCents).toBe(500_000 - 152_500 - 23_000);
  });

  it("floors an overspent essential category's reserve at zero", () => {
    const f = disposableFunds({ ...input, txs: [tx("2026-10-06", -40_000, "Utilities")] });
    expect(f.essentials.find((e) => e.category === "Utilities")!.reservedCents).toBe(0);
  });

  it("is affordable exactly at the disposable amount, not one cent above", () => {
    const disposable = disposableFunds(input).disposableCents;
    const yes = checkAffordability(disposable, input);
    expect(yes.affordable).toBe(true);
    expect(yes.disposableAfterCents).toBe(0);
    expect(yes.balanceAfterCents).toBe(500_000 - disposable);
    expect(checkAffordability(disposable + 1, input).affordable).toBe(false);
    expect(yes.assumptions.length).toBeGreaterThan(0);
  });

  it("rejects invalid amounts", () => {
    expect(() => checkAffordability(0, input)).toThrow();
    expect(() => checkAffordability(10.5, input)).toThrow();
  });
});

describe("overrun reallocation", () => {
  const status = (category: string, limitCents: number, spentCents: number): BudgetStatus => ({
    category,
    month: "2026-10",
    limitCents,
    spentCents,
    remainingCents: Math.max(limitCents - spentCents, 0),
    overageCents: Math.max(spentCents - limitCents, 0),
    utilization: spentCents / limitCents,
    state: spentCents > limitCents ? "overrun" : "ok",
  });
  const dining = status("Dining", 30_000, 32_500);
  const statuses = [dining, status("Shopping", 25_000, 9_512), status("Entertainment", 15_000, 7_350), status("Groceries", 60_000, 1_000)];

  it("moves the overage rounded up to $5 from the non-essential category with the most room", () => {
    const r = buildOverrunReallocation(dining, statuses)!;
    expect(r).toMatchObject({ amountCents: 2_500, from: "Shopping", to: "Dining" });
    expect(r.changes).toEqual([
      { category: "Shopping", month: "2026-10", old_limit_cents: 25_000, new_limit_cents: 22_500 },
      { category: "Dining", month: "2026-10", old_limit_cents: 30_000, new_limit_cents: 32_500 },
    ]);
  });
  it("rounds odd overages up to the next $5", () => {
    expect(buildOverrunReallocation(status("Dining", 30_000, 32_301), statuses)!.amountCents).toBe(2_500);
    expect(buildOverrunReallocation(status("Dining", 30_000, 32_501), statuses)!.amountCents).toBe(3_000);
  });
  it("never takes from essential categories, and returns null when nothing can cover", () => {
    const big = status("Shopping", 25_000, 87_512); // $625.12 over → $630
    expect(buildOverrunReallocation(big, [big, status("Dining", 30_000, 26_500), status("Groceries", 200_000, 0)])).toBeNull();
  });
  it("returns null when there is no overage", () => {
    expect(buildOverrunReallocation(status("Dining", 30_000, 30_000), statuses)).toBeNull();
  });
  it("works from real budget statuses", () => {
    const rows = budgetStatuses(
      [
        { category: "Dining", month: "2026-10", limitCents: 30_000 },
        { category: "Subscriptions", month: "2026-10", limitCents: 4_000 },
      ],
      [tx("2026-10-02", -30_100)],
      "2026-10",
      TODAY,
    );
    const r = buildOverrunReallocation(rows[0], rows)!;
    expect(r).toMatchObject({ amountCents: 500, from: "Subscriptions" });
  });
});

describe("proposal validation", () => {
  const limits: Record<string, number> = { "Dining|2026-10": 30_000, "Shopping|2026-10": 25_000, "Dining|2026-11": 30_000 };
  const ctx = { currentMonth: "2026-10", currentLimit: (c: string, m: string) => limits[`${c}|${m}`] };
  const change = (over: Partial<BudgetChange> = {}): BudgetChange => ({
    category: "Dining",
    month: "2026-11",
    old_limit_cents: 30_000,
    new_limit_cents: 25_000,
    ...over,
  });
  const errors = (changes: BudgetChange[]) => {
    const r = validateChanges(changes, ctx);
    return r.ok ? [] : r.errors;
  };

  it("accepts a valid current- or next-month change", () => {
    expect(validateChanges([change()], ctx)).toEqual({ ok: true });
    expect(validateChanges([change({ month: "2026-10", new_limit_cents: 32_500 })], ctx)).toEqual({ ok: true });
  });
  it("rejects unknown categories, other months, out-of-range or fractional limits", () => {
    expect(errors([change({ category: "Crypto" })])[0]).toMatch(/Unknown category/);
    expect(errors([change({ month: "2026-12" })])[0]).toMatch(/month must be/);
    expect(errors([change({ month: "2026-09" })])[0]).toMatch(/month must be/);
    expect(errors([change({ new_limit_cents: -1 })])[0]).toMatch(/between \$0 and \$10,000/);
    expect(errors([change({ new_limit_cents: 1_000_001 })])[0]).toMatch(/between/);
    expect(errors([change({ new_limit_cents: 100.5 })])[0]).toMatch(/integer cents/);
  });
  it("accepts the boundaries $0 and $10,000", () => {
    expect(errors([change({ new_limit_cents: 0 })])).toEqual([]);
    expect(errors([change({ new_limit_cents: 1_000_000 })])).toEqual([]);
  });
  it("rejects no-ops, duplicates, empty and missing budgets", () => {
    expect(errors([change({ new_limit_cents: 30_000 })])[0]).toMatch(/equals the old/);
    expect(errors([change(), change()])).toContainEqual(expect.stringMatching(/duplicate/));
    expect(errors([])[0]).toMatch(/At least one/);
    expect(errors([change({ category: "Health", old_limit_cents: 1 })])[0]).toMatch(/no budget exists/);
  });
  it("marks a proposal stale when the stored limit changed", () => {
    const r = validateChanges([change({ old_limit_cents: 29_000 })], ctx);
    expect(r).toMatchObject({ ok: false, stale: true });
  });
  it("classifies net effect", () => {
    expect(classifyChanges([change()])).toEqual({ kind: "potential_savings", totalDeltaCents: -5_000 });
    expect(classifyChanges([change({ new_limit_cents: 30_500 })]).kind).toBe("increase");
    expect(
      classifyChanges([
        change({ category: "Shopping", month: "2026-10", old_limit_cents: 25_000, new_limit_cents: 22_500 }),
        change({ month: "2026-10", new_limit_cents: 32_500 }),
      ]).kind,
    ).toBe("reallocation");
  });
});
