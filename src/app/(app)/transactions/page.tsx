import type { Metadata } from "next";
import { Suspense } from "react";
import { SimulateMenu } from "@/components/dashboard/simulate-menu";
import { TransactionFilters } from "@/components/pages/transaction-filters";
import { PageHeader } from "@/components/shell/page-header";
import { StatusPill } from "@/components/shell/status-pill";
import { getDb } from "@/lib/db/client";
import { loadSessionData } from "@/lib/db/queries";
import { formatShortDate, monthName, monthOf } from "@/lib/domain/dates";
import { formatUSD } from "@/lib/domain/money";
import { currentSession } from "@/lib/session";
import { simToday } from "@/lib/sim";
import { cn } from "@/lib/utils";
import { TX_PAGE_LIMIT, transactionsView } from "@/lib/views";

export const metadata: Metadata = { title: "Transactions" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const str = (v: string | string[] | undefined, max: number) => (typeof v === "string" && v.length <= max ? v : undefined);

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const session = await currentSession();
  if (!session) throw new Error("Missing session");
  const sp = await searchParams;
  const today = simToday();
  const monthParam = str(sp.month, 7);
  const filter = {
    // Default to the current month; "all" (empty select) is represented by month=all.
    month: monthParam === "all" ? undefined : monthParam && MONTH.test(monthParam) ? monthParam : sp.month === undefined ? monthOf(today) : undefined,
    category: str(sp.category, 40),
    q: str(sp.q, 100),
  };
  const view = transactionsView(await loadSessionData(getDb(), session.id), today, filter);
  const period = filter.month ? `${monthName(filter.month)} ${filter.month.slice(0, 4)}` : "All months";

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col">
      <PageHeader
        title="Transactions"
        subtitle="Everything on your simulated checking account."
        action={<SimulateMenu className="w-full md:w-auto" />}
      />
      <div className="mt-6 md:mt-[25px]">
        <Suspense>
          <TransactionFilters months={view.months} categories={view.categories} month={filter.month ?? "all"} />
        </Suspense>
      </div>
      <section className="card mt-4 px-6 pt-5 pb-1.5">
        <div className="flex flex-col gap-1 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[14px] font-semibold text-text">
            {period} · {view.totals.count} transaction{view.totals.count === 1 ? "" : "s"}
          </h2>
          <p className="tabular text-[13px] text-text-muted">
            Spent {formatUSD(view.totals.spendingCents)} · Income {formatUSD(view.totals.incomeCents)}
            {view.totals.transfersCents > 0 && ` · Saved ${formatUSD(view.totals.transfersCents)}`}
          </p>
        </div>
        {view.rows.length === 0 ? (
          <p className="border-t border-line py-6 text-[14px] text-text-muted">No transactions match these filters.</p>
        ) : (
          <ul data-testid="tx-list">
            {view.rows.map((tx) => (
              <li
                key={tx.id}
                className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line py-2 text-[14px] md:grid-cols-[90px_minmax(0,1fr)_180px_auto] md:gap-x-4"
              >
                <div className="hidden text-text-muted md:block">{formatShortDate(tx.date)}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-text">
                    <span className="truncate" title={tx.merchant}>
                      {tx.merchant}
                    </span>
                    {tx.simulated && (
                      <span className="shrink-0 rounded-full border border-line px-1.5 text-[10px] leading-[16px] text-text-muted">Simulated</span>
                    )}
                  </div>
                  <div className="text-[12px] text-text-muted md:hidden">
                    {formatShortDate(tx.date)} · {tx.category}
                  </div>
                </div>
                <div className="hidden md:block">
                  <StatusPill>{tx.category}</StatusPill>
                </div>
                <div className={cn("tabular text-right font-medium", tx.amountCents > 0 ? "text-brand" : "text-text")}>
                  {formatUSD(tx.amountCents, { plus: true })}
                </div>
              </li>
            ))}
          </ul>
        )}
        {view.truncated && (
          <p className="border-t border-line py-3 text-[13px] text-text-muted">Showing the latest {TX_PAGE_LIMIT}. Filter by month to see more.</p>
        )}
      </section>
    </div>
  );
}
