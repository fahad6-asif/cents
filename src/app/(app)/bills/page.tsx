import type { Metadata } from "next";
import { CardTitle, PageHeader } from "@/components/shell/page-header";
import { StatusPill } from "@/components/shell/status-pill";
import { getDb } from "@/lib/db/client";
import { loadSessionData } from "@/lib/db/queries";
import { formatShortDate } from "@/lib/domain/dates";
import { formatUSD } from "@/lib/domain/money";
import { currentSession } from "@/lib/session";
import { simToday } from "@/lib/sim";
import { cn } from "@/lib/utils";
import { billsView } from "@/lib/views";

export const metadata: Metadata = { title: "Bills" };

function dueLabel(days: number) {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

export default async function BillsPage() {
  const session = await currentSession();
  if (!session) throw new Error("Missing session");
  const today = simToday();
  const view = billsView(await loadSessionData(getDb(), session.id), today);

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col">
      <PageHeader title="Bills" subtitle="Recurring bills on your simulated account." />

      <section className="card mt-6 flex flex-col gap-1 px-6 py-5 md:mt-[25px] md:flex-row md:items-center md:justify-between" data-testid="bills-summary">
        <div>
          <p className="text-[13px] text-text-muted">Due before your next income ({formatShortDate(view.nextIncomeDate)})</p>
          <p className="tabular text-[28px] leading-[36px] font-semibold tracking-[-0.01em] text-text">{formatUSD(view.dueBeforeIncome.totalCents)}</p>
        </div>
        <p className="text-[14px] text-text-secondary">
          {view.dueBeforeIncome.count} unpaid bill{view.dueBeforeIncome.count === 1 ? "" : "s"}, counted in affordability checks.
        </p>
      </section>

      <div className="mt-5 grid grid-cols-1 gap-5 md:mt-[30px] md:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]">
        <section className="card px-6 pt-5 pb-1.5">
          <CardTitle>Upcoming</CardTitle>
          {view.unpaid.length === 0 ? (
            <p className="mt-3 border-t border-line py-5 text-[14px] text-text-muted">No unpaid bills.</p>
          ) : (
            <ul className="mt-3" data-testid="bills-upcoming">
              {view.unpaid.map((b) => (
                <li key={b.id} className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line py-2 text-[14px]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-text">
                      {b.name}
                      <StatusPill className="hidden sm:inline-flex">{b.category}</StatusPill>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[12px] text-text-muted">
                      {formatShortDate(b.dueDate)}
                      <StatusPill tone={b.daysUntilDue < 0 ? "danger" : b.daysUntilDue <= 7 ? "warning" : "neutral"}>{dueLabel(b.daysUntilDue)}</StatusPill>
                    </div>
                    {b.usual && (
                      <div data-testid="bill-usual" className={cn("tabular mt-0.5 text-[12px]", b.usual.unusual ? "font-medium text-warning" : "text-text-muted")}>
                        Avg {formatUSD(b.usual.averageCents)} ·{" "}
                        {b.usual.pct === 0 ? "same as usual" : `${b.usual.pct > 0 ? "↑" : "↓"} ${Math.abs(b.usual.pct).toFixed(1)}% vs usual`}
                      </div>
                    )}
                  </div>
                  <div className="tabular text-right font-medium text-text">{formatUSD(b.amountCents)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card px-6 pt-5 pb-1.5">
          <CardTitle>Recently paid</CardTitle>
          <ul className="mt-3">
            {view.paid.map((b) => (
              <li key={b.id} className="flex min-h-12 items-center justify-between gap-3 border-t border-line text-[14px]">
                <span className="text-text">
                  {b.name} <span className="text-text-muted">· {formatShortDate(b.dueDate)}</span>
                </span>
                <span className="tabular text-text-muted">{formatUSD(b.amountCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
