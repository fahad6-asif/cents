import { Skeleton } from "@/components/ui/skeleton";
import { formatUSD } from "@/lib/domain/money";
import { RANGE_KEYS, type RangeKey, type SeriesPoint } from "@/lib/overview-types";
import { cn } from "@/lib/utils";
import { BalanceChart } from "./balance-chart";

type Props = {
  balanceCents: number;
  deltaCents: number;
  changePct: number | null;
  points: SeriesPoint[];
  range: RangeKey;
  onRangeChange?: (range: RangeKey) => void;
  seriesState?: "ready" | "loading" | "error";
  onRetry?: () => void;
};

export function BalanceCard({ balanceCents, deltaCents, changePct, points, range, onRangeChange, seriesState = "ready", onRetry }: Props) {
  return (
    <section className="card flex flex-col px-6 pt-[21px] pb-[44px]">
      <div className="flex h-8 items-center justify-between">
        <h2 className="text-[13px] text-text-secondary">Total balance</h2>
        <div className="flex gap-[3px]" role="tablist" aria-label="Balance range">
          {RANGE_KEYS.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === range}
              onClick={() => onRangeChange?.(r)}
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
      <p
        data-testid="balance"
        className="tabular mt-[7px] text-[34px] leading-[44px] font-medium tracking-[-0.02em] text-text md:text-[40px]"
      >
        {formatUSD(balanceCents)}
      </p>
      <p className="mt-[7px] text-[14px] leading-[18px] text-text-muted">
        <span data-testid="balance-delta" className={cn("tabular font-semibold", deltaCents >= 0 ? "text-brand" : "text-danger")}>
          {formatUSD(deltaCents, { plus: true })}
          {changePct !== null && ` (${changePct.toFixed(1)}%)`}
        </span>{" "}
        this month
      </p>
      <div className="relative mt-[44px] h-[72px]">
        {seriesState === "error" ? (
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-text-muted">
            Couldn&apos;t load this range.
            <button type="button" onClick={onRetry} className="font-medium text-brand hover:underline">
              Retry
            </button>
          </div>
        ) : points.length < 2 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-text-muted">Not enough history yet.</div>
        ) : (
          <div className={cn("h-full transition-opacity", seriesState === "loading" && "opacity-40")}>
            <BalanceChart points={points} />
          </div>
        )}
        {seriesState === "loading" && <Skeleton className="absolute inset-x-0 top-1/2 h-px" />}
      </div>
    </section>
  );
}
