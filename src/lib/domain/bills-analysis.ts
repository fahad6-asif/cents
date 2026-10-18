// Bill analysis (addendum §4.3): history, average, trend and "is this one unusual". Pure.
import { addMonths, monthOf, nextIncomeDate } from "./dates";
import type { DomainBill } from "./types";

export const UNUSUAL_BILL_PCT = 15;
export const FLAT_TREND_PCT = 5;

export type BillAnalysis = {
  name: string;
  category: string;
  /** Paid instances in the window, newest first. */
  history: { date: string; amountCents: number }[];
  averageCents: number | null;
  minCents: number | null;
  maxCents: number | null;
  lastPaid: string | null;
  upcoming: { amountCents: number; due: string } | null;
  /** Upcoming amount (or the last paid one if nothing is upcoming) vs the paid average. */
  vsAverage: { deltaCents: number; pct: number } | null;
  trend: "rising" | "falling" | "flat";
  unusual: boolean;
};

export type BillsAnalysis = {
  from: string;
  to: string;
  bills: BillAnalysis[];
  totals: { monthlyAverageAllBillsCents: number; upcomingTotalBeforeNextIncomeCents: number; unusualCount: number };
};

const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
const pct1 = (delta: number, base: number) => Math.round((delta * 1000) / base) / 10;

export function analyzeBills(bills: readonly DomainBill[], today: string, months = 6, only?: string): BillsAnalysis {
  const from = `${addMonths(monthOf(today), -months)}-${today.slice(8, 10)}`;
  const names = [...new Set(bills.map((b) => b.name))]
    .filter((n) => !only || n.toLowerCase() === only.toLowerCase())
    .sort();

  const out: BillAnalysis[] = names.map((name) => {
    const rows = bills.filter((b) => b.name === name);
    const history = rows
      .filter((b) => b.status === "paid" && b.dueDate > from && b.dueDate <= today)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
      .map((b) => ({ date: b.dueDate, amountCents: b.amountCents }));
    const next = rows.filter((b) => b.status === "unpaid").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const amounts = history.map((h) => h.amountCents);
    const avg = amounts.length ? mean(amounts) : null;

    const compareTo = next?.amountCents ?? history[0]?.amountCents;
    const vsAverage = avg && compareTo !== undefined ? { deltaCents: compareTo - avg, pct: pct1(compareTo - avg, avg) } : null;

    // Trend: mean of the newest half vs the oldest half of the paid history (±5% = flat).
    let trend: BillAnalysis["trend"] = "flat";
    const half = Math.floor(amounts.length / 2);
    if (half >= 1) {
      const newest = mean(amounts.slice(0, half));
      const oldest = mean(amounts.slice(-half));
      const change = pct1(newest - oldest, oldest);
      trend = change > FLAT_TREND_PCT ? "rising" : change < -FLAT_TREND_PCT ? "falling" : "flat";
    }

    return {
      name,
      category: rows[0].category,
      history,
      averageCents: avg,
      minCents: amounts.length ? Math.min(...amounts) : null,
      maxCents: amounts.length ? Math.max(...amounts) : null,
      lastPaid: history[0]?.date ?? null,
      upcoming: next ? { amountCents: next.amountCents, due: next.dueDate } : null,
      vsAverage,
      trend,
      // Exact integer comparison (the rounded pct would call 14.99% "15.0").
      unusual: vsAverage && avg ? Math.abs(vsAverage.deltaCents) * 100 >= UNUSUAL_BILL_PCT * avg : false,
    };
  });

  const income = nextIncomeDate(today);
  return {
    from,
    to: today,
    bills: out,
    totals: {
      monthlyAverageAllBillsCents: out.reduce((s, b) => s + (b.averageCents ?? 0), 0),
      upcomingTotalBeforeNextIncomeCents: bills
        .filter((b) => b.status === "unpaid" && b.dueDate <= income && (!only || b.name.toLowerCase() === only.toLowerCase()))
        .reduce((s, b) => s + b.amountCents, 0),
      unusualCount: out.filter((b) => b.unusual).length,
    },
  };
}
