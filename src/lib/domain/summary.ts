import { addDays, dayOf, daysBetween, monthOf, startOfMonth } from "./dates";
import type { DomainTx } from "./types";

/** Balance at the end of `asOfDay` (inclusive): opening balance + every signed amount up to it. */
export function balanceAt(openingBalanceCents: number, txs: readonly DomainTx[], asOfDay: string): number {
  let balance = openingBalanceCents;
  for (const t of txs) if (dayOf(t.occurredAt) <= asOfDay) balance += t.amountCents;
  return balance;
}

export type MonthTotals = {
  /** Salary and other income. */
  incomeCents: number;
  /** Expenses only (positive number). Savings transfers are not spending. */
  spendingCents: number;
  /** Transfers out (positive number), e.g. to savings. */
  transfersOutCents: number;
  /** Every inflow (positive number). */
  moneyInCents: number;
  /** Every outflow: spending + transfers out (positive number). */
  moneyOutCents: number;
  /** Money in − money out. Equals the month's balance change, so "ahead", delta and Net agree. */
  netCents: number;
};

/** Month-to-date totals: transactions in `today`'s month dated on or before `today`. */
export function monthToDate(txs: readonly DomainTx[], today: string): MonthTotals {
  return monthTotals(txs, monthOf(today), today);
}

/** Totals for a month, optionally cut off at `untilDay` (inclusive). */
export function monthTotals(txs: readonly DomainTx[], month: string, untilDay?: string): MonthTotals {
  const totals: MonthTotals = {
    incomeCents: 0,
    spendingCents: 0,
    transfersOutCents: 0,
    moneyInCents: 0,
    moneyOutCents: 0,
    netCents: 0,
  };
  for (const t of txs) {
    const day = dayOf(t.occurredAt);
    if (monthOf(day) !== month || (untilDay && day > untilDay)) continue;
    if (t.amountCents >= 0) {
      totals.moneyInCents += t.amountCents;
      if (t.type === "income") totals.incomeCents += t.amountCents;
    } else {
      totals.moneyOutCents -= t.amountCents;
      if (t.type === "expense") totals.spendingCents -= t.amountCents;
      if (t.type === "transfer") totals.transfersOutCents -= t.amountCents;
    }
  }
  totals.netCents = totals.moneyInCents - totals.moneyOutCents;
  return totals;
}

/**
 * Balance change % = net MTD ÷ balance at the start of the month × 100, rounded to 1 decimal.
 * Returns null when the starting balance is zero or negative (no meaningful percentage).
 */
export function balanceChangePct(netCents: number, startBalanceCents: number): number | null {
  if (startBalanceCents <= 0) return null;
  return Math.round((netCents * 1000) / startBalanceCents) / 10;
}

export type MonthSummary = MonthTotals & {
  balanceCents: number;
  startOfMonthBalanceCents: number;
  changePct: number | null;
};

export function summarize(openingBalanceCents: number, txs: readonly DomainTx[], today: string): MonthSummary {
  const mtd = monthToDate(txs, today);
  const start = balanceAt(openingBalanceCents, txs, addDays(startOfMonth(monthOf(today)), -1));
  return {
    ...mtd,
    balanceCents: balanceAt(openingBalanceCents, txs, today),
    startOfMonthBalanceCents: start,
    changePct: balanceChangePct(mtd.netCents, start),
  };
}

export const RANGES = { "1W": 7, "1M": 30, "3M": 90, "1Y": 365 } as const;
export type Range = keyof typeof RANGES;

export type BalancePoint = { date: string; balanceCents: number };

/** End-of-day balances from `today − N days` through `today` (N + 1 points). */
export function balanceSeries(
  openingBalanceCents: number,
  txs: readonly DomainTx[],
  today: string,
  range: Range,
): BalancePoint[] {
  const first = addDays(today, -RANGES[range]);
  const deltas = new Map<string, number>();
  let balance = openingBalanceCents;
  for (const t of txs) {
    const day = dayOf(t.occurredAt);
    if (day > today) continue;
    if (day < first) balance += t.amountCents;
    else deltas.set(day, (deltas.get(day) ?? 0) + t.amountCents);
  }
  const points: BalancePoint[] = [];
  const n = daysBetween(first, today);
  for (let i = 0; i <= n; i++) {
    const day = addDays(first, i);
    balance += deltas.get(day) ?? 0;
    points.push({ date: day, balanceCents: balance });
  }
  return points;
}
