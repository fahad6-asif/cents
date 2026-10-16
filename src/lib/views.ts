// Page/API view builders. Pure functions over one session's data; every figure from the domain layer.
import { disposableFunds } from "@/lib/domain/affordability";
import { budgetStatuses, type BudgetStatus } from "@/lib/domain/budgets";
import { addMonths, dayOf, daysBetween, monthOf, nextIncomeDate } from "@/lib/domain/dates";
import type { SessionData } from "@/lib/db/queries";

// ---------------------------------------------------------------- transactions

export type TxFilter = { month?: string; category?: string; q?: string };
export type TxRow = {
  id: string;
  date: string;
  merchant: string;
  category: string;
  type: "income" | "expense" | "transfer";
  amountCents: number;
  simulated: boolean;
};

export const TX_PAGE_LIMIT = 300;

export function transactionsView(data: SessionData, today: string, filter: TxFilter) {
  const q = filter.q?.trim().toLowerCase();
  const matching = data.txs
    .filter((t) => dayOf(t.occurredAt) <= today)
    .filter((t) => !filter.month || monthOf(dayOf(t.occurredAt)) === filter.month)
    .filter((t) => !filter.category || t.category === filter.category)
    .filter((t) => !q || t.merchant.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
    .reverse();
  const totals = { count: matching.length, spendingCents: 0, incomeCents: 0, transfersCents: 0 };
  for (const t of matching) {
    if (t.type === "expense") totals.spendingCents -= t.amountCents;
    else if (t.type === "income") totals.incomeCents += t.amountCents;
    else totals.transfersCents -= t.amountCents;
  }
  const months = [...new Set(data.txs.map((t) => monthOf(dayOf(t.occurredAt))))].filter((m) => m <= monthOf(today)).sort().reverse();
  const categories = [...new Set(data.txs.map((t) => t.category))].sort();
  return {
    filter,
    totals,
    truncated: matching.length > TX_PAGE_LIMIT,
    rows: matching.slice(0, TX_PAGE_LIMIT).map(
      (t): TxRow => ({
        id: t.id!,
        date: dayOf(t.occurredAt),
        merchant: t.merchant,
        category: t.category,
        type: t.type,
        amountCents: t.amountCents,
        simulated: t.source === "simulated",
      }),
    ),
    months,
    categories,
  };
}

// ---------------------------------------------------------------- budgets

export function budgetsView(data: SessionData, today: string, which: "current" | "next") {
  const current = monthOf(today);
  const month = which === "current" ? current : addMonths(current, 1);
  const rows: BudgetStatus[] = budgetStatuses(data.budgets, data.txs, month, today);
  const sum = (f: (r: BudgetStatus) => number) => rows.reduce((s, r) => s + f(r), 0);
  return {
    month,
    which,
    rows: [...rows].sort((a, b) => b.utilization - a.utilization || a.category.localeCompare(b.category)),
    totals: { limitCents: sum((r) => r.limitCents), spentCents: sum((r) => r.spentCents), remainingCents: sum((r) => r.remainingCents) },
  };
}

// ---------------------------------------------------------------- bills

export function billsView(data: SessionData, today: string) {
  const unpaid = data.bills
    .filter((b) => b.status === "unpaid")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((b) => ({ ...b, id: b.id!, daysUntilDue: daysBetween(today, b.dueDate) }));
  const paid = data.bills
    .filter((b) => b.status === "paid")
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .slice(0, 15)
    .map((b) => ({ ...b, id: b.id! }));
  const funds = disposableFunds({ openingBalanceCents: data.account.openingBalanceCents, txs: data.txs, budgets: data.budgets, bills: data.bills, today });
  return {
    today,
    nextIncomeDate: nextIncomeDate(today),
    dueBeforeIncome: { count: funds.bills.length, totalCents: funds.billsTotalCents },
    unpaid,
    paid,
  };
}
