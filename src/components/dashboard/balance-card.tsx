import { formatUSD } from "@/lib/domain/money";
import { cn } from "@/lib/utils";
import { BalanceChart, type BalancePoint } from "./balance-chart";

const RANGES = ["1W", "1M", "3M", "1Y"] as const;

type Props = {
  balanceCents: number;
  deltaCents: number;
  deltaPct: string;
  points: BalancePoint[];
  range?: (typeof RANGES)[number];
};

// Phase 1: range tabs are visual only; switching the series arrives in Phase 4.
export function BalanceCard({ balanceCents, deltaCents, deltaPct, points, range = "1M" }: Props) {
  return (
    <section className="card flex flex-col px-6 pt-[21px] pb-[44px]">
      <div className="flex h-8 items-center justify-between">
        <h2 className="text-[13px] text-text-secondary">Total balance</h2>
        <div className="flex gap-[3px]" role="tablist" aria-label="Balance range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === range}
              className={cn(
                "h-8 w-11 rounded-[8px] text-[13px] font-medium text-text",
                r === range ? "bg-muted-fill" : "hover:bg-muted-fill/60",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <p className="tabular mt-[7px] text-[34px] leading-[44px] font-medium tracking-[-0.02em] text-text md:text-[40px]">
        {formatUSD(balanceCents)}
      </p>
      <p className="mt-[7px] text-[14px] leading-[18px] text-text-muted">
        <span className={cn("tabular font-semibold", deltaCents >= 0 ? "text-brand" : "text-danger")}>
          {formatUSD(deltaCents, { plus: true })} ({deltaPct})
        </span>{" "}
        this month
      </p>
      <div className="mt-[44px] h-[72px]">
        <BalanceChart points={points} />
      </div>
    </section>
  );
}
