import { dayOf, monthOf } from "./dates";
import type { DomainBudget, DomainTx } from "./types";

/** Expense totals per category for `month`, counting days up to `untilDay` (inclusive) if given. */
export function categorySpend(txs: readonly DomainTx[], month: string, untilDay?: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== "expense") continue;
    const day = dayOf(t.occurredAt);
    if (monthOf(day) !== month || (untilDay && day > untilDay)) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) - t.amountCents);
  }
  return totals;
}

/** Expense totals per category for days in [fromDay, toDay] (inclusive). */
export function categorySpendBetween(txs: readonly DomainTx[], fromDay: string, toDay: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== "expense") continue;
    const day = dayOf(t.occurredAt);
    if (day < fromDay || day > toDay) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) - t.amountCents);
  }
  return totals;
}

/** Spent ÷ limit. A zero limit is 0 when nothing is spent, otherwise unbounded. */
export function utilization(spentCents: number, limitCents: number): number {
  if (limitCents <= 0) return spentCents > 0 ? Number.POSITIVE_INFINITY : 0;
  return spentCents / limitCents;
}

export type BudgetState = "ok" | "warning" | "overrun";

/** Warning at ≥ 80% and ≤ 100%; overrun above 100%. Integer math, no float edge cases. */
export function budgetState(spentCents: number, limitCents: number): BudgetState {
  if (spentCents > limitCents) return "overrun";
  if (spentCents * 100 >= limitCents * 80 && spentCents > 0) return "warning";
  return "ok";
}

export type BudgetStatus = {
  category: string;
  month: string;
  limitCents: number;
  spentCents: number;
  /** max(limit − spent, 0) */
  remainingCents: number;
  /** max(spent − limit, 0) */
  overageCents: number;
  utilization: number;
  state: BudgetState;
};

/** Status of each budget in `month`, with spending counted up to `untilDay`. */
export function budgetStatuses(
  budgets: readonly DomainBudget[],
  txs: readonly DomainTx[],
  month: string,
  untilDay?: string,
): BudgetStatus[] {
  const spend = categorySpend(txs, month, untilDay);
  return budgets
    .filter((b) => b.month === month)
    .map((b) => {
      const spent = spend.get(b.category) ?? 0;
      return {
        category: b.category,
        month,
        limitCents: b.limitCents,
        spentCents: spent,
        remainingCents: Math.max(b.limitCents - spent, 0),
        overageCents: Math.max(spent - b.limitCents, 0),
        utilization: utilization(spent, b.limitCents),
        state: budgetState(spent, b.limitCents),
      };
    });
}

export type SpendingRow = { name: string; cents: number; widthPct: number };

/**
 * Spending card rows: the top 4 categories plus "Everything else". Each bar's width is the row
 * amount ÷ the largest row amount (largest = 100%).
 */
export function spendingBreakdown(totals: Map<string, number>, top = 4): SpendingRow[] {
  const sorted = [...totals.entries()]
    .filter(([, cents]) => cents > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const rows = sorted.slice(0, top).map(([name, cents]) => ({ name, cents }));
  const rest = sorted.slice(top).reduce((s, [, cents]) => s + cents, 0);
  if (rest > 0) rows.push({ name: "Everything else", cents: rest });
  const max = Math.max(0, ...rows.map((r) => r.cents));
  return rows.map((r) => ({ ...r, widthPct: max > 0 ? (r.cents / max) * 100 : 0 }));
}

/** Cash flow bars: money in is 100%; money out = out ÷ in, capped at 100%. */
export function cashFlowBars(moneyInCents: number, moneyOutCents: number): { inPct: number; outPct: number } {
  if (moneyInCents <= 0) return { inPct: moneyInCents < 0 ? 0 : 100, outPct: moneyOutCents > 0 ? 100 : 0 };
  return { inPct: 100, outPct: Math.min((moneyOutCents / moneyInCents) * 100, 100) };
}
