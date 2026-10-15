import { formatUSD } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

type Props = { monthLabel: string; inCents: number; outCents: number; outPct: number; netCents: number };

export function CashFlowCard({ monthLabel, inCents, outCents, outPct, netCents }: Props) {
  return (
    <section className="card flex flex-col px-6 pt-[22px] pb-[23px]">
      <h2 className="text-[13px] leading-[18px] text-text-muted">Cash flow · {monthLabel}</h2>
      <Row label="Money in" cents={inCents} className="mt-[19px]" />
      <Bar width={inCents > 0 ? 100 : 0} className="bg-brand" />
      <Row label="Money out" cents={outCents} className="mt-[15px]" />
      <Bar width={outPct} className="bg-ink-bar" />
      <div className="mt-auto pt-6">
        <div className="h-px bg-line" />
        <div className="mt-[14px] flex items-end justify-between">
          <span className="pb-[3px] text-[14px] text-text-muted">Net</span>
          <span
            data-testid="cashflow-net"
            className={cn(
              "tabular text-[22px] leading-[27px] font-semibold tracking-[-0.01em]",
              netCents >= 0 ? "text-brand" : "text-danger",
            )}
          >
            {formatUSD(netCents, { plus: true, whole: true })}
          </span>
        </div>
      </div>
    </section>
  );
}

function Row({ label, cents, className }: { label: string; cents: number; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between text-[14px] leading-[20px] text-text", className)}>
      <span>{label}</span>
      <span className="tabular font-medium">{formatUSD(cents, { whole: true })}</span>
    </div>
  );
}

function Bar({ width, className }: { width: number; className: string }) {
  return (
    <div className="mt-[9px] h-2 rounded-full bg-muted-fill">
      <div className={cn("h-2 rounded-full", className)} style={{ width: `${width}%` }} />
    </div>
  );
}
