"use client";

import { useCallback, useRef, useState } from "react";
import type { OverviewData, RangeKey, SeriesPoint } from "@/lib/overview-types";
import { BalanceCard } from "./balance-card";
import { CashFlowCard } from "./cash-flow-card";
import { ChatBox } from "./chat-box";
import { OverviewHeader } from "./overview-header";
import { RecentTransactions } from "./recent-transactions";
import { SpendingCard } from "./spending-card";
import { SuggestionChips } from "./suggestion-chips";
import { WorthALook } from "./worth-a-look";

/** Overview page body. Initial data is server-rendered; later refreshes come from GET /api/overview. */
export function OverviewView({ initial }: { initial: OverviewData }) {
  const [data] = useState(initial);
  const [range, setRange] = useState<RangeKey>(initial.series.range);
  const [seriesState, setSeriesState] = useState<"ready" | "loading" | "error">("ready");
  const cache = useRef(new Map<RangeKey, SeriesPoint[]>([[initial.series.range, initial.series.points]]));
  const [points, setPoints] = useState(initial.series.points);

  const loadRange = useCallback(async (next: RangeKey) => {
    setRange(next);
    const cached = cache.current.get(next);
    if (cached) {
      setPoints(cached);
      setSeriesState("ready");
      return;
    }
    setSeriesState("loading");
    try {
      const res = await fetch(`/api/overview?range=${next}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as OverviewData;
      cache.current.set(next, body.series.points);
      setPoints(body.series.points);
      setSeriesState("ready");
    } catch {
      setSeriesState("error");
    }
  }, []);

  const s = data.summary;
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col">
      <OverviewHeader dateLabel={data.dateLabel} name={data.userName} netCents={s.netCents} />
      <div className="mt-6 md:mt-[25px]">
        <ChatBox />
      </div>
      <div className="mt-4">
        <SuggestionChips />
      </div>
      {data.worthALook && (
        <div className="mt-6 md:mt-[27px]">
          <WorthALook body={data.worthALook.top.body} primaryLabel="Ask assistant" moreCount={data.worthALook.moreCount} />
        </div>
      )}
      <div className="mt-6 grid gap-5 md:mt-[30px] md:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]">
        <BalanceCard
          balanceCents={s.balanceCents}
          deltaCents={s.netCents}
          changePct={s.changePct}
          points={points}
          range={range}
          onRangeChange={loadRange}
          seriesState={seriesState}
          onRetry={() => loadRange(range)}
        />
        <CashFlowCard
          monthLabel={data.monthLabel}
          inCents={data.cashFlow.inCents}
          outCents={data.cashFlow.outCents}
          outPct={data.cashFlow.outPct}
          netCents={s.netCents}
        />
      </div>
      <div className="mt-5 grid gap-5 md:mt-[30px] md:grid-cols-[minmax(0,38.5fr)_minmax(0,61.5fr)]">
        <SpendingCard monthLabel={data.monthLabel} totalCents={data.spending.totalCents} rows={data.spending.rows} />
        <RecentTransactions rows={data.recent} />
      </div>
    </div>
  );
}
