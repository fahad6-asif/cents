import type { BudgetStatus } from "./budgets";
import { CATEGORIES, ESSENTIAL_CATEGORIES, isCategory } from "./categories";
import { addMonths, isMonth } from "./dates";
import { roundUpTo } from "./money";

export const MAX_LIMIT_CENTS = 1_000_000; // $10,000
export const REALLOCATION_STEP_CENTS = 500; // round overages up to $5

export type BudgetChange = { category: string; month: string; old_limit_cents: number; new_limit_cents: number };

/** Non-essential categories can fund a reallocation. */
export const NON_ESSENTIAL_CATEGORIES = CATEGORIES.filter((c) => !ESSENTIAL_CATEGORIES.includes(c));

export type Reallocation = {
  amountCents: number;
  from: string;
  to: string;
  month: string;
  changes: BudgetChange[];
};

/**
 * Overrun fix: move the overage (rounded up to $5) from the non-essential category with the most
 * remaining budget that can cover it. Returns null when no category can (decision 10).
 */
export function buildOverrunReallocation(overrun: BudgetStatus, statuses: readonly BudgetStatus[]): Reallocation | null {
  if (overrun.overageCents <= 0) return null;
  const amount = roundUpTo(overrun.overageCents, REALLOCATION_STEP_CENTS);
  const source = statuses
    .filter(
      (s) =>
        s.month === overrun.month &&
        s.category !== overrun.category &&
        (NON_ESSENTIAL_CATEGORIES as readonly string[]).includes(s.category) &&
        s.remainingCents >= amount,
    )
    .sort((a, b) => b.remainingCents - a.remainingCents || a.category.localeCompare(b.category))[0];
  if (!source) return null;
  return {
    amountCents: amount,
    from: source.category,
    to: overrun.category,
    month: overrun.month,
    changes: [
      { category: source.category, month: overrun.month, old_limit_cents: source.limitCents, new_limit_cents: source.limitCents - amount },
      { category: overrun.category, month: overrun.month, old_limit_cents: overrun.limitCents, new_limit_cents: overrun.limitCents + amount },
    ],
  };
}

export type ProposalKind = "potential_savings" | "reallocation" | "increase";

/** Net effect of a set of changes: lower total limits are potential savings, not money saved. */
export function classifyChanges(changes: readonly BudgetChange[]): { kind: ProposalKind; totalDeltaCents: number } {
  const total = changes.reduce((s, c) => s + (c.new_limit_cents - c.old_limit_cents), 0);
  return { kind: total < 0 ? "potential_savings" : total === 0 ? "reallocation" : "increase", totalDeltaCents: total };
}

export type ValidationContext = {
  currentMonth: string;
  /** Current stored limit for a category + month, or undefined if no such budget exists. */
  currentLimit: (category: string, month: string) => number | undefined;
};

/**
 * Server-side validation for proposals (when created by the AI tool) and again at approval time:
 * known category, current or next month, 0 ≤ new limit ≤ $10,000, integer cents, no duplicates,
 * no no-op changes, and old limit equal to the stored limit (otherwise the proposal is stale).
 */
export function validateChanges(
  changes: readonly BudgetChange[],
  ctx: ValidationContext,
): { ok: true } | { ok: false; stale: boolean; errors: string[] } {
  const errors: string[] = [];
  let stale = false;
  const allowedMonths = [ctx.currentMonth, addMonths(ctx.currentMonth, 1)];
  const seen = new Set<string>();

  if (changes.length === 0) errors.push("At least one change is required.");
  if (changes.length > CATEGORIES.length * 2) errors.push("Too many changes.");

  for (const c of changes) {
    const label = `${c.category} ${c.month}`;
    if (!isCategory(c.category)) errors.push(`Unknown category "${c.category}".`);
    if (!isMonth(c.month) || !allowedMonths.includes(c.month)) {
      errors.push(`${label}: month must be ${allowedMonths.join(" or ")}.`);
    }
    if (!Number.isSafeInteger(c.new_limit_cents) || !Number.isSafeInteger(c.old_limit_cents)) {
      errors.push(`${label}: limits must be integer cents.`);
    } else if (c.new_limit_cents < 0 || c.new_limit_cents > MAX_LIMIT_CENTS) {
      errors.push(`${label}: new limit must be between $0 and $10,000.`);
    } else if (c.new_limit_cents === c.old_limit_cents) {
      errors.push(`${label}: new limit equals the old limit.`);
    }
    const key = `${c.category}|${c.month}`;
    if (seen.has(key)) errors.push(`${label}: duplicate change.`);
    seen.add(key);

    const stored = ctx.currentLimit(c.category, c.month);
    if (stored === undefined) {
      if (isCategory(c.category) && allowedMonths.includes(c.month)) errors.push(`${label}: no budget exists.`);
    } else if (stored !== c.old_limit_cents) {
      stale = true;
      errors.push(`${label}: budget changed since this was proposed (now ${stored}).`);
    }
  }
  return errors.length ? { ok: false, stale, errors } : { ok: true };
}
