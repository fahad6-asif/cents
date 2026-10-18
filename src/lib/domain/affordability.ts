import { budgetStatuses } from "./budgets";
import { ESSENTIAL_CATEGORIES } from "./categories";
import { formatDateLabel, monthOf, nextIncomeDate } from "./dates";
import { balanceAt } from "./summary";
import type { DomainBill, DomainBudget, DomainTx } from "./types";

export type CountedBill = { name: string; amountCents: number; dueDate: string; category: string };
export type EssentialReserve = { category: string; limitCents: number; spentCents: number; billsDueCents: number; reservedCents: number };

export type DisposableFunds = {
  today: string;
  balanceCents: number;
  nextIncomeDate: string;
  /** Unpaid bills due on or before the next income date. */
  bills: CountedBill[];
  billsTotalCents: number;
  /** Remaining essential budget this month, net of that category's unpaid bills due this month. */
  essentials: EssentialReserve[];
  essentialsTotalCents: number;
  disposableCents: number;
};

type Input = { openingBalanceCents: number; txs: readonly DomainTx[]; budgets: readonly DomainBudget[]; bills: readonly DomainBill[]; today: string };

/**
 * Disposable funds = balance − unpaid bills due on or before the next income date − remaining
 * essential budget this month. A category's remaining budget excludes its unpaid bills due this
 * month, so a bill is never subtracted twice (decision 8).
 */
export function disposableFunds({ openingBalanceCents, txs, budgets, bills, today }: Input): DisposableFunds {
  const month = monthOf(today);
  const income = nextIncomeDate(today);
  const balance = balanceAt(openingBalanceCents, txs, today);

  const counted = bills
    .filter((b) => b.status === "unpaid" && b.dueDate <= income)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name))
    .map((b) => ({ name: b.name, amountCents: b.amountCents, dueDate: b.dueDate, category: b.category }));
  const billsTotal = counted.reduce((s, b) => s + b.amountCents, 0);

  const essentials = budgetStatuses(budgets, txs, month, today)
    .filter((s) => (ESSENTIAL_CATEGORIES as readonly string[]).includes(s.category))
    .map((s) => {
      const billsDue = bills
        .filter((b) => b.status === "unpaid" && b.category === s.category && monthOf(b.dueDate) === month)
        .reduce((sum, b) => sum + b.amountCents, 0);
      return {
        category: s.category,
        limitCents: s.limitCents,
        spentCents: s.spentCents,
        billsDueCents: billsDue,
        reservedCents: Math.max(s.limitCents - s.spentCents - billsDue, 0),
      };
    });
  const essentialsTotal = essentials.reduce((s, e) => s + e.reservedCents, 0);

  return {
    today,
    balanceCents: balance,
    nextIncomeDate: income,
    bills: counted,
    billsTotalCents: billsTotal,
    essentials,
    essentialsTotalCents: essentialsTotal,
    disposableCents: balance - billsTotal - essentialsTotal,
  };
}

export type Affordability = DisposableFunds & {
  amountCents: number;
  affordable: boolean;
  balanceAfterCents: number;
  disposableAfterCents: number;
  assumptions: string[];
};

/** A purchase is affordable when it is ≤ disposable funds. */
export function checkAffordability(amountCents: number, input: Input): Affordability {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("amount must be positive integer cents");
  const funds = disposableFunds(input);
  return {
    ...funds,
    amountCents,
    affordable: amountCents <= funds.disposableCents,
    balanceAfterCents: funds.balanceCents - amountCents,
    disposableAfterCents: funds.disposableCents - amountCents,
    assumptions: [
      `Next income expected on ${formatDateLabel(funds.nextIncomeDate)} (salary on the 14th).`,
      "Counts unpaid bills due on or before the next income date.",
      "Reserves the rest of this month's essential budgets (Housing, Utilities, Groceries, Transport, Health), excluding bills already counted.",
      "Simulated account; no other accounts or pending card transactions are included.",
    ],
  };
}
