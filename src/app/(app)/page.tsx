import { BalanceCard } from "@/components/dashboard/balance-card";
import type { BalancePoint } from "@/components/dashboard/balance-chart";
import { CashFlowCard } from "@/components/dashboard/cash-flow-card";
import { ChatBox } from "@/components/dashboard/chat-box";
import { OverviewHeader } from "@/components/dashboard/overview-header";
import { RecentTransactions, type RecentTx } from "@/components/dashboard/recent-transactions";
import { SpendingCard } from "@/components/dashboard/spending-card";
import { SuggestionChips } from "@/components/dashboard/suggestion-chips";
import { WorthALook } from "@/components/dashboard/worth-a-look";
import { formatLongDate, monthName } from "@/lib/domain/dates";
import { demoUserName, simToday } from "@/lib/sim";

// PHASE 1 PLACEHOLDER DATA (mirrors the reference for the visual gate).
// Replaced by GET /api/overview in Phase 4; nothing below may survive that phase.
const PLACEHOLDER = {
  netCents: 212400,
  balanceCents: 4821560,
  deltaCents: 112400,
  deltaPct: "2.4%",
  inCents: 640000,
  outCents: 427600,
  spending: [
    { name: "Housing", cents: 145000 },
    { name: "Groceries", cents: 82000 },
    { name: "Dining", cents: 64000 },
    { name: "Transport", cents: 41000 },
    { name: "Everything else", cents: 95600 },
  ],
  recent: [
    { id: "1", merchant: "Monthly salary", category: "Income", date: "2026-10-14", amountCents: 640000 },
    { id: "2", merchant: "Grocery Mart", category: "Groceries", date: "2026-10-14", amountCents: -8640 },
    { id: "3", merchant: "Ride share", category: "Transport", date: "2026-10-13", amountCents: -1290 },
    { id: "4", merchant: "Streaming plan", category: "Subscriptions", date: "2026-10-12", amountCents: -1599 },
    { id: "5", merchant: "Electric bill", category: "Utilities", date: "2026-10-11", amountCents: -9420 },
  ] satisfies RecentTx[],
  worth:
    "Dining is up 18% on September, mostly weekend orders from two delivery apps. Cap it at $320 for the rest of the month?",
};

const PLACEHOLDER_POINTS: BalancePoint[] = [
  0, 6, -4, 18, 14, 30, 26, 40, 34, 48, 44, 56, 52, 60, 70,
].map((v, i) => ({
  date: `2026-10-${String(i + 1).padStart(2, "0")}`,
  label: `${i + 1} Oct`,
  balanceCents: 4700000 + v * 1800,
}));

export default function OverviewPage() {
  const today = simToday();
  const month = monthName(today);
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col">
      <OverviewHeader dateLabel={formatLongDate(today)} name={demoUserName()} netCents={PLACEHOLDER.netCents} />
      <div className="mt-6 md:mt-[25px]">
        <ChatBox />
      </div>
      <div className="mt-4">
        <SuggestionChips />
      </div>
      <div className="mt-6 md:mt-[27px]">
        <WorthALook body={PLACEHOLDER.worth} primaryLabel="Set $320 cap" />
      </div>
      <div className="mt-6 grid gap-5 md:mt-[30px] md:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]">
        <BalanceCard
          balanceCents={PLACEHOLDER.balanceCents}
          deltaCents={PLACEHOLDER.deltaCents}
          deltaPct={PLACEHOLDER.deltaPct}
          points={PLACEHOLDER_POINTS}
        />
        <CashFlowCard monthLabel={month} inCents={PLACEHOLDER.inCents} outCents={PLACEHOLDER.outCents} />
      </div>
      <div className="mt-5 grid gap-5 md:mt-[30px] md:grid-cols-[minmax(0,38.5fr)_minmax(0,61.5fr)]">
        <SpendingCard monthLabel={month} totalCents={PLACEHOLDER.outCents} rows={PLACEHOLDER.spending} />
        <RecentTransactions rows={PLACEHOLDER.recent} />
      </div>
    </div>
  );
}
