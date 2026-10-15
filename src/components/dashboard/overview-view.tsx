"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DATA_CHANGED, emitDataChanged, postJson, type DataChangedDetail } from "@/lib/client-events";
import { formatUSD } from "@/lib/domain/money";
import type { OverviewData, RangeKey, SeriesPoint, WorthALookView } from "@/lib/overview-types";
import { BalanceCard } from "./balance-card";
import { CashFlowCard } from "./cash-flow-card";
import { ChatBox } from "./chat-box";
import { OverviewHeader } from "./overview-header";
import { RecentTransactions } from "./recent-transactions";
import { SpendingCard } from "./spending-card";
import { SuggestionChips } from "./suggestion-chips";
import { WorthALook } from "./worth-a-look";

async function fetchOverview(range: RangeKey): Promise<OverviewData> {
  const res = await fetch(`/api/overview?range=${range}`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** Question the assistant gets when "Ask assistant" is pressed on an alert without a proposal. */
function questionFor(top: WorthALookView["top"]): string {
  const f = top.facts;
  switch (top.type) {
    case "budget_warning":
    case "budget_overrun":
      return `Why is my ${f.category} budget at ${f.percent}%, and what can I do about it?`;
    case "unusual_spending":
      return `Tell me about the ${formatUSD(Number(f.amount_cents))} ${f.category} purchase at ${f.merchant}.`;
    case "upcoming_bill":
      return "What bills are due soon, and can I cover them?";
  }
}

/** Overview page body. Initial data is server-rendered; later refreshes come from GET /api/overview. */
export function OverviewView({ initial }: { initial: OverviewData }) {
  const [data, setData] = useState(initial);
  const [range, setRange] = useState<RangeKey>(initial.series.range);
  const rangeRef = useRef(range);
  const [seriesState, setSeriesState] = useState<"ready" | "loading" | "error">("ready");
  const cache = useRef(new Map<RangeKey, SeriesPoint[]>([[initial.series.range, initial.series.points]]));
  const [points, setPoints] = useState(initial.series.points);
  const [draft, setDraft] = useState("");
  const chatInput = useRef<HTMLTextAreaElement>(null);
  const [worthBusy, setWorthBusy] = useState(false);

  const loadRange = useCallback(async (next: RangeKey) => {
    setRange(next);
    rangeRef.current = next;
    const cached = cache.current.get(next);
    if (cached) {
      setPoints(cached);
      setSeriesState("ready");
      return;
    }
    setSeriesState("loading");
    try {
      const body = await fetchOverview(next);
      cache.current.set(next, body.series.points);
      if (rangeRef.current === next) setPoints(body.series.points);
      setSeriesState("ready");
    } catch {
      setSeriesState("error");
    }
  }, []);

  const applyOverview = useCallback(
    (next: OverviewData) => {
      setData(next);
      cache.current = new Map([[next.series.range, next.series.points]]);
      if (rangeRef.current === next.series.range) setPoints(next.series.points);
      else void loadRange(rangeRef.current);
    },
    [loadRange],
  );

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<DataChangedDetail>).detail;
      if (detail?.overview) applyOverview(detail.overview);
      else fetchOverview("1M").then(applyOverview).catch(() => toast.error("Couldn't refresh the dashboard"));
    };
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, [applyOverview]);

  const worth = data.worthALook;
  const proposal = worth?.top.proposal ?? null;

  async function onWorthPrimary() {
    if (!worth) return;
    if (!proposal) {
      setDraft(questionFor(worth.top));
      chatInput.current?.focus();
      return;
    }
    // Approval endpoint (atomic approve + execute) arrives in Phase 7.
    toast.info("Approving proposals is enabled in the next build step.");
  }

  async function onWorthDismiss() {
    if (!worth) return;
    setWorthBusy(true);
    try {
      await postJson(`/api/alerts/${worth.top.id}/dismiss`);
      toast("Alert dismissed", { description: proposal ? "The suggested change was rejected." : undefined });
      emitDataChanged();
    } catch (err) {
      toast.error("Couldn't dismiss", { description: (err as Error).message });
    } finally {
      setWorthBusy(false);
    }
  }

  const s = data.summary;
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col">
      <OverviewHeader dateLabel={data.dateLabel} name={data.userName} netCents={s.netCents} />
      <div className="mt-6 md:mt-[25px]">
        <ChatBox draft={draft} onDraftChange={setDraft} inputRef={chatInput} />
      </div>
      <div className="mt-4">
        <SuggestionChips onPick={(text) => setDraft(text)} />
      </div>
      {worth && (
        <div className="mt-6 md:mt-[27px]">
          <WorthALook
            body={proposal ? `${worth.top.body} Move ${formatUSD(proposal.amountCents)} from ${proposal.from} to cover it?` : worth.top.body}
            primaryLabel={proposal ? `Move ${formatUSD(proposal.amountCents, { whole: true })} to ${proposal.to}` : "Ask assistant"}
            moreCount={worth.moreCount}
            busy={worthBusy}
            onPrimary={onWorthPrimary}
            onDismiss={onWorthDismiss}
          />
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
