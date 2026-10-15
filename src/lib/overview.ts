import { evaluateAlerts } from "@/lib/domain/alerts";
import { budgetStatuses, cashFlowBars, categorySpend, spendingBreakdown } from "@/lib/domain/budgets";
import { dayOf, formatLongDate, formatShortDate, monthName, monthOf } from "@/lib/domain/dates";
import { balanceSeries, summarize } from "@/lib/domain/summary";
import type { SessionData } from "@/lib/db/queries";
import type { OverviewData, RangeKey } from "./overview-types";

const RECENT_COUNT = 5;

/** Builds the Overview payload from one session's data. Every figure comes from the domain layer. */
export function buildOverview(data: SessionData, today: string, range: RangeKey, userName: string): OverviewData {
  const { txs, budgets, bills, account } = data;
  const month = monthOf(today);
  const s = summarize(account.openingBalanceCents, txs, today);
  const bars = cashFlowBars(s.moneyInCents, s.moneyOutCents);

  const statuses = budgetStatuses(budgets, txs, month, today);
  const overBudget = new Set(statuses.filter((b) => b.state === "overrun").map((b) => b.category));
  const rows = spendingBreakdown(categorySpend(txs, month, today)).map((r) => ({ ...r, overBudget: overBudget.has(r.name) }));

  const recent = txs
    .filter((t) => dayOf(t.occurredAt) <= today)
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0))
    .slice(0, RECENT_COUNT)
    .map((t) => ({
      id: t.id!,
      merchant: t.merchant,
      category: t.category,
      date: dayOf(t.occurredAt),
      amountCents: t.amountCents,
      simulated: t.source === "simulated",
    }));

  // Phase 4: computed live from the rules. Phase 5 switches this to persisted alerts with actions.
  const alerts = evaluateAlerts({ today, txs, budgets, bills });

  return {
    today,
    dateLabel: formatLongDate(today),
    monthLabel: monthName(month),
    userName,
    summary: {
      balanceCents: s.balanceCents,
      startOfMonthBalanceCents: s.startOfMonthBalanceCents,
      netCents: s.netCents,
      changePct: s.changePct,
      incomeCents: s.incomeCents,
      spendingCents: s.spendingCents,
      moneyInCents: s.moneyInCents,
      moneyOutCents: s.moneyOutCents,
    },
    cashFlow: { inCents: s.moneyInCents, outCents: s.moneyOutCents, inPct: bars.inPct, outPct: bars.outPct },
    spending: { totalCents: s.spendingCents, rows },
    recent,
    series: {
      range,
      points: balanceSeries(account.openingBalanceCents, txs, today, range).map((p) => ({
        ...p,
        label: range === "1Y" ? `${formatShortDate(p.date)} ${p.date.slice(0, 4)}` : formatShortDate(p.date),
      })),
    },
    worthALook: alerts.length
      ? {
          top: { type: alerts[0].type, title: alerts[0].title, body: alerts[0].body, facts: alerts[0].facts },
          moreCount: alerts.length - 1,
        }
      : null,
  };
}
