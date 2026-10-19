// Category history, pace and next-month suggestions (addendum §4.4). Pure and deterministic.
import { categorySpend } from "./budgets";
import { CATEGORIES, ESSENTIAL_CATEGORIES, FIXED_CATEGORIES } from "./categories";
import { addMonths, dayOf, monthOf } from "./dates";
import { roundUpTo } from "./money";
import type { DomainBill, DomainBudget, DomainTx } from "./types";

export const SUGGESTION_STEP_CENTS = 1_000; // round suggestions up to $10
export const UNDER_RATIO = 0.7;
export const UNDER_HEADROOM = 1.15;

export type SuggestionReason = "fixed" | "fixed_bills_due" | "chronically_over" | "consistently_under" | "on_track" | "essential_kept";

export type CategoryHistory = {
  category: string;
  fixed: boolean;
  essential: boolean;
  months: { month: string; spentCents: number; limitCents: number; over: boolean }[];
  /** Past months have no stored budgets in the seed; their limit is then this month's. */
  limitBasis: "stored" | "current_limit";
  averageFullMonthsCents: number;
  monthsOverBudget: number;
  current: {
    month: string;
    spentCents: number;
    limitCents: number;
    daysElapsed: number;
    daysInMonth: number;
    pacePct: number | null;
    projectedMonthEndCents: number;
    onPace: boolean;
  };
  nextMonth: string;
  nextLimitCents: number;
  suggestedNextLimitCents: number;
  suggestionReason: SuggestionReason;
};

export type CategoryHistoryResult = {
  categories: CategoryHistory[];
  totals: { currentLimitsSumCents: number; suggestedLimitsSumCents: number; differenceCents: number };
};

const daysIn = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Pace of a month so far: 100 = exactly on pace for the limit. */
export function pace(spentCents: number, limitCents: number, daysElapsed: number, daysInMonth: number) {
  const pacePct = limitCents > 0 ? Math.round(((spentCents / limitCents) * 1000) / (daysElapsed / daysInMonth)) / 10 : null;
  return { pacePct, projectedCents: Math.round((spentCents / daysElapsed) * daysInMonth) };
}

export function categoryHistory(input: {
  budgets: readonly DomainBudget[];
  txs: readonly DomainTx[];
  bills: readonly DomainBill[];
  today: string;
  months?: number;
  category?: string;
}): CategoryHistoryResult {
  const { budgets, txs, bills, today } = input;
  const n = input.months ?? 3;
  const month = monthOf(today);
  const nextMonth = addMonths(month, 1);
  const past = Array.from({ length: n }, (_, i) => addMonths(month, -(n - i)));
  const limitOf = (category: string, mm: string) => budgets.find((b) => b.category === category && b.month === mm)?.limitCents;
  const spentPast = new Map(past.map((mm) => [mm, categorySpend(txs, mm)]));
  const spentNow = categorySpend(txs, month, today);
  const daysElapsed = Number(dayOf(today).slice(8, 10));
  const daysInMonth = daysIn(month);

  const names = CATEGORIES.filter((c) => (!input.category || c.toLowerCase() === input.category.toLowerCase()) && limitOf(c, month) !== undefined);
  const categories = names.map((category): CategoryHistory => {
    const limit = limitOf(category, month)!;
    const fixed = (FIXED_CATEGORIES as readonly string[]).includes(category);
    const essential = (ESSENTIAL_CATEGORIES as readonly string[]).includes(category);
    const stored = past.every((mm) => limitOf(category, mm) !== undefined);
    const months = past.map((mm) => {
      const spent = spentPast.get(mm)!.get(category) ?? 0;
      const lim = limitOf(category, mm) ?? limit;
      return { month: mm, spentCents: spent, limitCents: lim, over: spent > lim };
    });
    const average = Math.round(months.reduce((s, m) => s + m.spentCents, 0) / months.length);

    const spent = spentNow.get(category) ?? 0;
    const p = pace(spent, limit, daysElapsed, daysInMonth);
    const projected = fixed ? Math.max(spent, limit) : p.projectedCents;
    const onPace = fixed ? spent <= limit : p.pacePct === null || p.pacePct <= 100;

    // Suggestion for next month, measured against next month's stored limit.
    const nextLimit = limitOf(category, nextMonth) ?? limit;
    let suggested = nextLimit;
    let reason: SuggestionReason = "on_track";
    if (fixed) {
      const due = bills.filter((b) => b.category === category && b.status === "unpaid" && monthOf(b.dueDate) === nextMonth).reduce((s, b) => s + b.amountCents, 0);
      [suggested, reason] = due > nextLimit ? [roundUpTo(due, SUGGESTION_STEP_CENTS), "fixed_bills_due"] : [nextLimit, "fixed"];
    } else if (average > nextLimit) {
      suggested = roundUpTo(nextLimit + Math.ceil((average - nextLimit) / 2), SUGGESTION_STEP_CENTS);
      reason = "chronically_over";
    } else if (average < UNDER_RATIO * nextLimit) {
      suggested = roundUpTo(Math.max(Math.ceil(average * UNDER_HEADROOM), Math.ceil(nextLimit * UNDER_RATIO)), SUGGESTION_STEP_CENTS);
      reason = "consistently_under";
    }
    // Essential budgets are never cut automatically.
    if (essential && suggested < nextLimit) [suggested, reason] = [nextLimit, "essential_kept"];

    return {
      category,
      fixed,
      essential,
      months,
      limitBasis: stored ? "stored" : "current_limit",
      averageFullMonthsCents: average,
      monthsOverBudget: months.filter((m) => m.over).length,
      current: { month, spentCents: spent, limitCents: limit, daysElapsed, daysInMonth, pacePct: p.pacePct, projectedMonthEndCents: projected, onPace },
      nextMonth,
      nextLimitCents: nextLimit,
      suggestedNextLimitCents: suggested,
      suggestionReason: reason,
    };
  });

  const current = categories.reduce((s, c) => s + c.nextLimitCents, 0);
  const suggested = categories.reduce((s, c) => s + c.suggestedNextLimitCents, 0);
  return { categories, totals: { currentLimitsSumCents: current, suggestedLimitsSumCents: suggested, differenceCents: suggested - current } };
}

/** The Budgets page line under each bar (no LLM): "On pace" / "Ahead of pace, projected $X" / "Over in 2 of last 3 months". */
export function paceLine(h: CategoryHistory): { kind: "on_pace" | "ahead" | "history_over" | "over"; projectedCents?: number; over?: number; of?: number } {
  if (h.fixed) return h.current.onPace ? { kind: "on_pace" } : { kind: "over" };
  if (!h.current.onPace) return { kind: "ahead", projectedCents: h.current.projectedMonthEndCents };
  if (h.monthsOverBudget >= 2) return { kind: "history_over", over: h.monthsOverBudget, of: h.months.length };
  return { kind: "on_pace" };
}
