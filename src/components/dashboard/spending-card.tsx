import { formatUSD } from "@/lib/domain/money";
import type { OverviewData } from "@/lib/overview-types";

type Props = { monthLabel: string } & OverviewData["spending"];

export function SpendingCard({ monthLabel, totalCents, rows }: Props) {
  return (
    <section className="card px-6 pt-[22px] pb-6">
      <h2 className="text-[14px] leading-[20px] font-semibold text-text">Spending by category</h2>
      <p className="text-[13px] leading-[18px] text-text-muted">
        {monthLabel} · {formatUSD(totalCents, { whole: true })} so far
      </p>
      {rows.length === 0 ? (
        <p className="mt-[19px] text-[14px] text-text-muted">No spending yet this month.</p>
      ) : (
        <ul className="mt-[19px] flex flex-col gap-[18.5px]">
          {rows.map((row) => (
            <li key={row.name}>
              <div className="flex items-center justify-between text-[14px] leading-[20px] text-text">
                <span className="flex items-center gap-2">
                  {row.name}
                  {row.overBudget && (
                    <span className="size-1.5 rounded-full bg-danger" role="img" aria-label="over budget" />
                  )}
                </span>
                <span className="tabular">{formatUSD(row.cents, { whole: true })}</span>
              </div>
              <div className="mt-[6px] h-1.5 rounded-full bg-muted-fill">
                <div className="h-1.5 rounded-full bg-brand" style={{ width: `${row.widthPct}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
