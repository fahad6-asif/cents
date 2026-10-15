import { budgetStatuses } from "./budgets";
import { addDays, dayOf, daysBetween, formatShortDate, monthName, monthOf } from "./dates";
import { formatUSD } from "./money";
import type { DomainBill, DomainBudget, DomainTx } from "./types";

export type AlertType = "budget_overrun" | "unusual_spending" | "budget_warning" | "upcoming_bill";

/** Higher = more urgent. Worth a look shows the highest (plan 9.3 item 4). */
export const SEVERITY: Record<AlertType, number> = {
  budget_overrun: 4,
  unusual_spending: 3,
  budget_warning: 2,
  upcoming_bill: 1,
};

export const UPCOMING_BILL_DAYS = 7;
export const UNUSUAL_MULTIPLIER = 3;
export const UNUSUAL_MIN_CENTS = 5_000;
export const UNUSUAL_LOOKBACK_DAYS = 90;

export type AlertCandidate = {
  type: AlertType;
  dedupeKey: string;
  severity: number;
  title: string;
  body: string;
  /** The deterministic numbers. UI renders figures from here, never from text. */
  facts: Record<string, string | number>;
  relatedTransactionId?: string;
  relatedBillId?: string;
};

type Input = {
  today: string;
  txs: readonly DomainTx[];
  budgets: readonly DomainBudget[];
  bills: readonly DomainBill[];
};

/** Runs every rule for the current month and returns the alerts whose condition holds now. */
export function evaluateAlerts({ today, txs, budgets, bills }: Input): AlertCandidate[] {
  return [
    ...budgetAlerts(today, txs, budgets),
    ...unusualSpendingAlerts(today, txs),
    ...upcomingBillAlerts(today, bills),
  ].sort((a, b) => b.severity - a.severity || a.dedupeKey.localeCompare(b.dedupeKey));
}

export function budgetAlerts(today: string, txs: readonly DomainTx[], budgets: readonly DomainBudget[]): AlertCandidate[] {
  const month = monthOf(today);
  const out: AlertCandidate[] = [];
  for (const s of budgetStatuses(budgets, txs, month, today)) {
    if (s.state === "ok") continue;
    const pct = s.limitCents > 0 ? Math.round((s.spentCents * 100) / s.limitCents) : 100;
    const facts = {
      category: s.category,
      month,
      spent_cents: s.spentCents,
      limit_cents: s.limitCents,
      percent: pct,
      remaining_cents: s.remainingCents,
      overage_cents: s.overageCents,
    };
    if (s.state === "overrun") {
      out.push({
        type: "budget_overrun",
        dedupeKey: `budget_overrun:${s.category}:${month}`,
        severity: SEVERITY.budget_overrun,
        title: `${s.category} is over budget`,
        body: `${s.category} is ${formatUSD(s.overageCents)} over its ${formatUSD(s.limitCents)} ${monthName(month)} budget (${formatUSD(s.spentCents)} spent).`,
        facts,
      });
    } else {
      out.push({
        type: "budget_warning",
        dedupeKey: `budget_warning:${s.category}:${month}`,
        severity: SEVERITY.budget_warning,
        title: `${s.category} is at ${pct}% of budget`,
        body: `You've spent ${formatUSD(s.spentCents)} of your ${formatUSD(s.limitCents)} ${s.category} budget for ${monthName(month)}, with ${formatUSD(s.remainingCents)} left.`,
        facts,
      });
    }
  }
  return out;
}

/** Median of integer cents (mean of the two middle values, rounded half up, for even counts). */
export function medianCents(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Unusual spending: an expense this month that is > 3× the median expense in its category over
 * the 90 days before it, and > $50. Needs at least one prior expense in the category.
 */
export function unusualSpendingAlerts(today: string, txs: readonly DomainTx[]): AlertCandidate[] {
  const month = monthOf(today);
  const expenses = txs.filter((t) => t.type === "expense" && t.amountCents < 0);
  const out: AlertCandidate[] = [];
  for (const t of expenses) {
    const day = dayOf(t.occurredAt);
    if (monthOf(day) !== month || day > today || !t.id) continue;
    const amount = -t.amountCents;
    if (amount <= UNUSUAL_MIN_CENTS) continue;
    const from = addDays(day, -UNUSUAL_LOOKBACK_DAYS);
    const prior = expenses
      .filter((p) => p !== t && p.category === t.category && p.occurredAt < t.occurredAt && dayOf(p.occurredAt) >= from)
      .map((p) => -p.amountCents);
    const median = medianCents(prior);
    if (median === null || amount <= median * UNUSUAL_MULTIPLIER) continue;
    const multiple = Math.round((amount * 10) / median) / 10;
    out.push({
      type: "unusual_spending",
      dedupeKey: `unusual_spending:${t.id}`,
      severity: SEVERITY.unusual_spending,
      title: `Unusual ${t.category} purchase`,
      body: `${formatUSD(amount)} on ${formatShortDate(day)} is about ${multiple}× your typical ${t.category} purchase of ${formatUSD(median)}.`,
      facts: {
        category: t.category,
        merchant: t.merchant,
        date: day,
        amount_cents: amount,
        median_cents: median,
        multiple,
        lookback_days: UNUSUAL_LOOKBACK_DAYS,
      },
      relatedTransactionId: t.id,
    });
  }
  return out;
}

/** Upcoming bill: unpaid and due within 7 days of today (inclusive of both ends). */
export function upcomingBillAlerts(today: string, bills: readonly DomainBill[]): AlertCandidate[] {
  return bills
    .filter((b) => b.status === "unpaid" && b.id)
    .map((b) => ({ bill: b, days: daysBetween(today, b.dueDate) }))
    .filter(({ days }) => days >= 0 && days <= UPCOMING_BILL_DAYS)
    .map(({ bill, days }) => ({
      type: "upcoming_bill" as const,
      dedupeKey: `upcoming_bill:${bill.id}`,
      severity: SEVERITY.upcoming_bill,
      title: `${bill.name} bill due ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`,
      body: `${bill.name} (${formatUSD(bill.amountCents)}) is due on ${formatShortDate(bill.dueDate)}.`,
      facts: { bill: bill.name, amount_cents: bill.amountCents, due_date: bill.dueDate, days_until_due: days },
      relatedBillId: bill.id,
    }));
}
