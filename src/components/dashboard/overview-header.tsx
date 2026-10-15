import { formatUSD } from "@/lib/domain/money";
import { Greeting } from "./greeting";
import { SimulateMenu } from "./simulate-menu";

type Props = { dateLabel: string; name: string; netCents: number };

export function OverviewHeader({ dateLabel, name, netCents }: Props) {
  const ahead = netCents >= 0;
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-[13px] leading-[18px] text-text-muted">{dateLabel}</p>
        <div className="mt-[7px]">
          <Greeting name={name} />
        </div>
        <p className="mt-[7px] text-[15px] leading-[21px] text-text-secondary">
          You are{" "}
          <span data-testid="ahead-amount" className={ahead ? "font-semibold text-brand" : "font-semibold text-danger"}>
            {formatUSD(Math.abs(netCents), { whole: true })} {ahead ? "ahead" : "behind"}
          </span>{" "}
          this month.
        </p>
      </div>
      <SimulateMenu className="w-full md:w-auto" />
    </header>
  );
}
