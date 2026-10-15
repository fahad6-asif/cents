import { describe, expect, it } from "vitest";
import { budgetState, budgetStatuses, cashFlowBars, categorySpend, spendingBreakdown, utilization } from "@/lib/domain/budgets";
import { balanceAt, balanceChangePct, balanceSeries, monthToDate, monthTotals, summarize } from "@/lib/domain/summary";
import type { DomainTx } from "@/lib/domain/types";

const tx = (occurredAt: string, amountCents: number, category = "Dining", type: DomainTx["type"] = amountCents > 0 ? "income" : "expense"): DomainTx => ({
  amountCents,
  category,
  merchant: "m",
  occurredAt: occurredAt.length === 10 ? `${occurredAt}T12:00:00.000Z` : occurredAt,
  type,
});

const TXS: DomainTx[] = [
  tx("2026-09-30T23:59:00.000Z", -1_000), // previous month
  tx("2026-10-01T00:00:00.000Z", -145_000, "Housing"),
  tx("2026-10-05", -2_500),
  tx("2026-10-14", 640_000, "Income"),
  tx("2026-10-14", -300_000, "Savings", "transfer"),
  tx("2026-10-15", -1_200, "Groceries"),
  tx("2026-10-16", -9_999), // after today
];

describe("balance", () => {
  it("is opening balance + all amounts up to and including the day", () => {
    expect(balanceAt(100_000, TXS, "2026-09-30")).toBe(99_000);
    expect(balanceAt(100_000, TXS, "2026-10-15")).toBe(100_000 - 1_000 - 145_000 - 2_500 + 640_000 - 300_000 - 1_200);
  });
});

describe("month-to-date totals", () => {
  const mtd = monthToDate(TXS, "2026-10-15");
  it("counts only this month up to today", () => {
    expect(mtd.incomeCents).toBe(640_000);
    expect(mtd.spendingCents).toBe(145_000 + 2_500 + 1_200);
    expect(mtd.transfersOutCents).toBe(300_000);
  });
  it("treats transfers as money out but not spending", () => {
    expect(mtd.moneyOutCents).toBe(mtd.spendingCents + 300_000);
    expect(mtd.moneyInCents).toBe(640_000);
  });
  it("net equals the month's balance change", () => {
    expect(mtd.netCents).toBe(balanceAt(100_000, TXS, "2026-10-15") - balanceAt(100_000, TXS, "2026-09-30"));
  });
  it("respects the month boundary at midnight UTC", () => {
    expect(monthTotals(TXS, "2026-09").spendingCents).toBe(1_000);
  });
  it("can be negative", () => {
    expect(monthToDate([tx("2026-10-03", -5_000)], "2026-10-15").netCents).toBe(-5_000);
  });
  it("ignores positive non-income rows for income but counts them as money in", () => {
    const refund = { ...tx("2026-10-03", 2_000, "Shopping"), type: "expense" as const };
    const t = monthToDate([refund], "2026-10-15");
    expect(t.incomeCents).toBe(0);
    expect(t.moneyInCents).toBe(2_000);
  });
});

describe("balance change %", () => {
  it("is net ÷ start-of-month balance × 100, rounded to 1 decimal", () => {
    expect(balanceChangePct(112_400, 4_709_160)).toBe(2.4);
    expect(balanceChangePct(-5_000, 200_000)).toBe(-2.5);
    expect(balanceChangePct(1, 300)).toBe(0.3);
  });
  it("is null when the start balance is not positive", () => {
    expect(balanceChangePct(100, 0)).toBeNull();
    expect(balanceChangePct(100, -50)).toBeNull();
  });
  it("summarize ties balance, start balance and change together", () => {
    const s = summarize(100_000, TXS, "2026-10-15");
    expect(s.startOfMonthBalanceCents).toBe(99_000);
    expect(s.balanceCents - s.startOfMonthBalanceCents).toBe(s.netCents);
    expect(s.changePct).toBe(balanceChangePct(s.netCents, 99_000));
  });
});

describe("balance series", () => {
  it.each([
    ["1W", 8],
    ["1M", 31],
    ["3M", 91],
    ["1Y", 366],
  ] as const)("%s has %i daily points ending at today's balance", (range, n) => {
    const pts = balanceSeries(100_000, TXS, "2026-10-15", range);
    expect(pts).toHaveLength(n);
    expect(pts.at(-1)).toEqual({ date: "2026-10-15", balanceCents: balanceAt(100_000, TXS, "2026-10-15") });
    expect(pts[0].balanceCents).toBe(balanceAt(100_000, TXS, pts[0].date));
  });
});

describe("budget utilization and states", () => {
  it("is spent ÷ limit", () => {
    expect(utilization(26_500, 30_000)).toBeCloseTo(0.8833, 4);
    expect(utilization(0, 0)).toBe(0);
    expect(utilization(1, 0)).toBe(Number.POSITIVE_INFINITY);
  });
  it("warns at exactly 80% and at exactly 100%", () => {
    expect(budgetState(24_000, 30_000)).toBe("warning");
    expect(budgetState(23_999, 30_000)).toBe("ok");
    expect(budgetState(30_000, 30_000)).toBe("warning");
    expect(budgetState(30_001, 30_000)).toBe("overrun");
  });
  it("handles a zero budget", () => {
    expect(budgetState(0, 0)).toBe("ok");
    expect(budgetState(1, 0)).toBe("overrun");
  });
  it("reports spent, remaining and overage per category", () => {
    const rows = budgetStatuses(
      [
        { category: "Dining", month: "2026-10", limitCents: 3_000 },
        { category: "Housing", month: "2026-10", limitCents: 185_000 },
        { category: "Dining", month: "2026-11", limitCents: 3_000 },
      ],
      TXS,
      "2026-10",
      "2026-10-15",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ category: "Dining", spentCents: 2_500, remainingCents: 500, overageCents: 0, state: "warning" });
    expect(rows[1]).toMatchObject({ category: "Housing", spentCents: 145_000, remainingCents: 40_000, state: "ok" });
  });
  it("category spend counts expenses only", () => {
    const spend = categorySpend(TXS, "2026-10", "2026-10-15");
    expect(spend.get("Income")).toBeUndefined();
    expect(spend.get("Savings")).toBeUndefined();
    expect(spend.get("Dining")).toBe(2_500);
  });
});

describe("spending card rows", () => {
  it("shows the top 4 plus Everything else, widths relative to the largest row", () => {
    const rows = spendingBreakdown(
      new Map([
        ["Housing", 145_000],
        ["Groceries", 82_000],
        ["Dining", 64_000],
        ["Transport", 41_000],
        ["Shopping", 50_000],
        ["Health", 45_600],
        ["Entertainment", 0],
      ]),
    );
    expect(rows.map((r) => r.name)).toEqual(["Housing", "Groceries", "Dining", "Shopping", "Everything else"]);
    expect(rows[0].widthPct).toBe(100);
    expect(rows[4]).toMatchObject({ cents: 86_600 });
    expect(rows[4].widthPct).toBeCloseTo((86_600 / 145_000) * 100, 6);
  });
  it("lets Everything else be the largest row", () => {
    const rows = spendingBreakdown(new Map([["A", 10], ["B", 9], ["C", 8], ["D", 7], ["E", 6], ["F", 6]]));
    expect(rows.at(-1)).toMatchObject({ name: "Everything else", cents: 12, widthPct: 100 });
  });
  it("omits Everything else when there are 4 or fewer categories, and handles empty", () => {
    expect(spendingBreakdown(new Map([["A", 5]]))).toEqual([{ name: "A", cents: 5, widthPct: 100 }]);
    expect(spendingBreakdown(new Map())).toEqual([]);
  });
});

describe("cash flow bars", () => {
  it("money in is 100%, money out is out ÷ in capped at 100%", () => {
    expect(cashFlowBars(640_000, 427_600)).toEqual({ inPct: 100, outPct: (427_600 / 640_000) * 100 });
    expect(cashFlowBars(100, 500)).toEqual({ inPct: 100, outPct: 100 });
  });
  it("handles no income", () => {
    expect(cashFlowBars(0, 500)).toEqual({ inPct: 100, outPct: 100 });
    expect(cashFlowBars(0, 0)).toEqual({ inPct: 100, outPct: 0 });
  });
});
