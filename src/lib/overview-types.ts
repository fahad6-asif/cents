// Shape of GET /api/overview (shared by server and client; no server-only imports).

export const RANGE_KEYS = ["1W", "1M", "3M", "1Y"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export type SeriesPoint = { date: string; label: string; balanceCents: number };

export type WorthALookView = {
  top: {
    id: string;
    type: "budget_overrun" | "unusual_spending" | "budget_warning" | "upcoming_bill";
    title: string;
    body: string;
    /** Deterministic numbers behind the alert. */
    facts: Record<string, string | number>;
    /** Pending reallocation attached to an overrun ("Move $25 to Dining"). */
    proposal: null | {
      id: string;
      amountCents: number;
      from: string;
      to: string;
      newLimitCents: number;
      rationale: string;
    };
  };
  moreCount: number;
};

export type OverviewData = {
  today: string;
  dateLabel: string;
  monthLabel: string;
  userName: string;
  summary: {
    balanceCents: number;
    startOfMonthBalanceCents: number;
    /** The single number behind "ahead this month", the balance delta and Cash flow → Net. */
    netCents: number;
    changePct: number | null;
    incomeCents: number;
    spendingCents: number;
    moneyInCents: number;
    moneyOutCents: number;
  };
  cashFlow: { inCents: number; outCents: number; inPct: number; outPct: number };
  spending: {
    totalCents: number;
    rows: { name: string; cents: number; widthPct: number; overBudget: boolean }[];
  };
  recent: {
    id: string;
    merchant: string;
    category: string;
    date: string;
    amountCents: number;
    simulated: boolean;
  }[];
  series: { range: RangeKey; points: SeriesPoint[] };
  worthALook: WorthALookView | null;
};
