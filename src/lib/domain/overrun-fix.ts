// Overrun fix planner (addendum §4.5). Pure: computes a ready-to-propose change set that covers a
// current-month overrun from discretionary budgets with room, carries the rest to next month's
// limit for the same category, and reports anything it can't cover. Writes nothing.
import { budgetStatuses } from "./budgets";
import { DISCRETIONARY_CATEGORIES, ESSENTIAL_CATEGORIES } from "./categories";
import { addMonths, monthName, monthOf } from "./dates";
import { formatUSD, roundUpTo } from "./money";
import { REALLOCATION_STEP_CENTS, type BudgetChange } from "./proposals";
import type { DomainBill, DomainBudget, DomainTx } from "./types";

/** Sources keep at least this much headroom above spent + upcoming bills. */
export const SOURCE_BUFFER = { minCents: 1_000, pct: 10 };
/** Next month's limit for the target never drops below this. */
export const CARRY_FLOOR = { minCents: 2_000, pct: 30 };
/** Only sources under this utilization are touched. */
export const SOURCE_MAX_UTILIZATION = 0.8;

export type OverrunFix = {
  needed: boolean;
  category: string;
  month: string;
  nextMonth: string;
  /** Spent minus limit, exact. */
  overspentCents: number;
  /** The amount to cover: the overspend rounded up to $5 (as the rule engine does). */
  overageCents: number;
  coveredNowCents: number;
  carriedCents: number;
  uncoveredCents: number;
  changes: BudgetChange[];
  sources: { category: string; roomCents: number; takenCents: number }[];
  netChangeCents: number;
  notes: string[];
};

const pctOf = (cents: number, pct: number) => Math.ceil((cents * pct) / 100);
const wholeDollarsDown = (cents: number) => Math.floor(cents / 100) * 100;

export function planOverrunFix(input: {
  category: string;
  budgets: readonly DomainBudget[];
  txs: readonly DomainTx[];
  bills: readonly DomainBill[];
  today: string;
}): OverrunFix {
  const { category, budgets, txs, bills, today } = input;
  const month = monthOf(today);
  const nextMonth = addMonths(month, 1);
  const statuses = budgetStatuses(budgets, txs, month, today);
  const target = statuses.find((s) => s.category === category);
  const empty = { coveredNowCents: 0, carriedCents: 0, changes: [], sources: [], netChangeCents: 0 };
  const base = { category, month, nextMonth };

  if (!target || target.spentCents <= target.limitCents) {
    const overspent = target ? Math.max(0, target.spentCents - target.limitCents) : 0;
    return { ...base, ...empty, needed: false, overspentCents: overspent, overageCents: 0, uncoveredCents: 0, notes: [target ? `${category} is within its ${monthName(month)} budget.` : `No ${monthName(month)} budget for ${category}.`] };
  }
  const overspent = target.spentCents - target.limitCents;
  const overage = roundUpTo(overspent, REALLOCATION_STEP_CENTS);
  if ((ESSENTIAL_CATEGORIES as readonly string[]).includes(category)) {
    return {
      ...base,
      ...empty,
      needed: true,
      overspentCents: overspent,
      overageCents: overage,
      uncoveredCents: overage,
      notes: [`${category} is an essential budget, so it isn't rebalanced automatically. Review it on the Budgets page.`],
    };
  }

  // 1–3. Discretionary sources under 80% with room after spent, upcoming bills and a buffer; biggest room first.
  const upcomingIn = (cat: string) =>
    bills.filter((b) => b.status === "unpaid" && b.category === cat && monthOf(b.dueDate) === month).reduce((s, b) => s + b.amountCents, 0);
  const candidates = statuses
    .filter((s) => s.category !== category && (DISCRETIONARY_CATEGORIES as readonly string[]).includes(s.category) && s.utilization < SOURCE_MAX_UTILIZATION)
    .map((s) => {
      const buffer = Math.max(SOURCE_BUFFER.minCents, pctOf(s.limitCents, SOURCE_BUFFER.pct));
      return { status: s, roomCents: wholeDollarsDown(s.limitCents - s.spentCents - upcomingIn(s.category) - buffer) };
    })
    // Moves under $5 are noise; skip sources with less room than that.
    .filter((c) => c.roomCents >= REALLOCATION_STEP_CENTS)
    .sort((a, b) => b.roomCents - a.roomCents || a.status.category.localeCompare(b.status.category));

  let remaining = overage;
  const sources: OverrunFix["sources"] = [];
  for (const c of candidates) {
    if (remaining <= 0) break;
    const taken = Math.min(c.roomCents, remaining);
    sources.push({ category: c.status.category, roomCents: c.roomCents, takenCents: taken });
    remaining -= taken;
  }
  const coveredNow = overage - remaining;

  // 4. Carry the rest to next month's limit for the same category, down to a floor.
  const nextLimit = budgets.find((b) => b.category === category && b.month === nextMonth)?.limitCents;
  const floor = nextLimit === undefined ? 0 : Math.max(CARRY_FLOOR.minCents, pctOf(nextLimit, CARRY_FLOOR.pct));
  const carried = nextLimit === undefined ? 0 : Math.min(remaining, wholeDollarsDown(Math.max(0, nextLimit - floor)));
  // 5.
  const uncovered = overage - coveredNow - carried;

  // 6. Change set: raise this month's target, lower the sources, lower next month's target.
  const changes: BudgetChange[] = [];
  if (coveredNow + carried > 0) {
    changes.push({ category, month, old_limit_cents: target.limitCents, new_limit_cents: target.limitCents + coveredNow + carried });
    for (const s of sources) {
      const st = statuses.find((x) => x.category === s.category)!;
      changes.push({ category: s.category, month, old_limit_cents: st.limitCents, new_limit_cents: st.limitCents - s.takenCents });
    }
    if (carried > 0) changes.push({ category, month: nextMonth, old_limit_cents: nextLimit!, new_limit_cents: nextLimit! - carried });
  }

  const notes = ["This rebalances limits; it doesn't undo the spending."];
  if (overage !== overspent) notes.push(`The ${formatUSD(overspent)} overspend is rounded up to ${formatUSD(overage)}.`);
  if (sources.length) notes.push(`Covered now from ${sources.map((s) => `${s.category} (${formatUSD(s.takenCents)})`).join(", ")}.`);
  else notes.push(`No discretionary budget has room to spare in ${monthName(month)}.`);
  if (carried > 0) notes.push(`${formatUSD(carried)} is carried: ${category} for ${monthName(nextMonth)} drops by that amount.`);
  if (uncovered > 0) {
    notes.push(
      `${formatUSD(uncovered)} can't be covered without cutting essential budgets or taking ${category} for ${monthName(nextMonth)} below its floor, so ${category} stays ${formatUSD(uncovered)} over in ${monthName(month)}.`,
    );
  }

  return {
    ...base,
    needed: true,
    overspentCents: overspent,
    overageCents: overage,
    coveredNowCents: coveredNow,
    carriedCents: carried,
    uncoveredCents: uncovered,
    changes,
    sources,
    netChangeCents: changes.reduce((s, c) => s + c.new_limit_cents - c.old_limit_cents, 0),
    notes,
  };
}
