import Link from "next/link";
import { formatShortDate } from "@/lib/domain/dates";
import { formatUSD } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

export type RecentTx = {
  id: string;
  merchant: string;
  category: string;
  date: string;
  amountCents: number;
  simulated?: boolean;
};

export function RecentTransactions({ rows }: { rows: RecentTx[] }) {
  return (
    <section className="card px-6 pt-[21px] pb-1.5">
      <div className="flex items-center justify-between pb-[7px]">
        <h2 className="text-[14px] leading-[20px] font-semibold text-text">Recent transactions</h2>
        <Link href="/transactions" className="text-[14px] font-medium text-brand hover:underline">
          View all
        </Link>
      </div>
      <ul>
        {rows.map((tx) => (
          <li
            key={tx.id}
            className="grid h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line text-[14px] md:grid-cols-[39.4%_25.2%_minmax(0,1fr)_auto] md:gap-x-0"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 truncate text-text">
                <span className="truncate">{tx.merchant}</span>
                {tx.simulated && (
                  <span className="shrink-0 rounded-full border border-line px-1.5 text-[10px] leading-[16px] text-text-muted">
                    Simulated
                  </span>
                )}
              </div>
              <div className="text-[12px] text-text-muted md:hidden">{formatShortDate(tx.date)}</div>
            </div>
            <div className="hidden md:block">
              <span className="inline-flex h-[21px] items-center rounded-full bg-muted-fill px-[11px] text-[12px] text-text">
                {tx.category}
              </span>
            </div>
            <div className="hidden text-text-muted md:block">{formatShortDate(tx.date)}</div>
            <div
              className={cn("tabular text-right font-medium", tx.amountCents > 0 ? "text-brand" : "text-text")}
            >
              {formatUSD(tx.amountCents, { plus: true })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
