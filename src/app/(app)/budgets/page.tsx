import type { Metadata } from "next";
import Link from "next/link";
import { ProposalCard } from "@/components/chat/proposal-card";
import { CardTitle, PageHeader } from "@/components/shell/page-header";
import { StatusPill } from "@/components/shell/status-pill";
import { loadProposals } from "@/lib/db/activity";
import { getDb } from "@/lib/db/client";
import { loadSessionData } from "@/lib/db/queries";
import { monthName } from "@/lib/domain/dates";
import { formatUSD } from "@/lib/domain/money";
import { currentSession } from "@/lib/session";
import { simToday } from "@/lib/sim";
import { cn } from "@/lib/utils";
import { budgetsView } from "@/lib/views";

export const metadata: Metadata = { title: "Budgets" };

const STATUS_LABEL = { executed: "Applied", rejected: "Rejected", stale: "Stale", failed: "Failed" } as const;

export default async function BudgetsPage({ searchParams }: PageProps<"/budgets">) {
  const session = await currentSession();
  if (!session) throw new Error("Missing session");
  const which = (await searchParams).month === "next" ? "next" : "current";
  const today = simToday();
  const db = getDb();
  const [data, proposals] = await Promise.all([loadSessionData(db, session.id), loadProposals(db, session.id)]);
  const view = budgetsView(data, today, which);
  const label = `${monthName(view.month)} ${view.month.slice(0, 4)}`;

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col">
      <PageHeader
        title="Budgets"
        subtitle={which === "current" ? `${label}: spending counted through today.` : `${label}: planning next month. No spending counted yet.`}
        action={
          <div role="tablist" aria-label="Month" className="flex w-full gap-1 rounded-[11px] border border-line bg-surface p-1 md:w-auto">
            {(["current", "next"] as const).map((w) => (
              <Link
                key={w}
                role="tab"
                aria-selected={w === which}
                href={w === "current" ? "/budgets" : "/budgets?month=next"}
                className={cn(
                  "flex h-9 flex-1 items-center justify-center rounded-[8px] px-4 text-[14px] font-medium text-text md:flex-none",
                  w === which ? "bg-muted-fill" : "hover:bg-muted-fill/60",
                )}
              >
                {w === "current" ? "Current month" : "Next month"}
              </Link>
            ))}
          </div>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-5 md:mt-[25px] md:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]">
        <section className="card px-6 pt-5 pb-6" data-testid="budget-list">
          <CardTitle aside={<span className="tabular text-[13px] text-text-muted">{formatUSD(view.totals.spentCents)} of {formatUSD(view.totals.limitCents)}</span>}>
            {label}
          </CardTitle>
          <ul className="mt-4 flex flex-col gap-[18px]">
            {view.rows.map((b) => {
              const pct = Number.isFinite(b.utilization) ? b.utilization * 100 : 100;
              const tone = b.state === "overrun" ? "bg-danger" : b.state === "warning" ? "bg-warning" : "bg-brand";
              return (
                <li key={b.category} data-category={b.category}>
                  <div className="flex items-center justify-between gap-3 text-[14px] leading-[20px] text-text">
                    <span className="flex items-center gap-2">
                      {b.category}
                      {b.state === "overrun" && <StatusPill tone="danger">Over by {formatUSD(b.overageCents)}</StatusPill>}
                      {b.state === "warning" && <StatusPill tone="warning">{Math.round(pct)}%</StatusPill>}
                    </span>
                    <span className="tabular text-text-muted">
                      <span className="text-text">{formatUSD(b.spentCents)}</span> / {formatUSD(b.limitCents)}
                    </span>
                  </div>
                  <div className="mt-[6px] h-1.5 rounded-full bg-muted-fill">
                    <div className={cn("h-1.5 rounded-full", tone)} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  {b.pace && (
                    <p data-testid="pace-line" className="tabular mt-1 text-[12px] text-text-muted">
                      {b.pace.kind === "on_pace"
                        ? "On pace"
                        : b.pace.kind === "ahead"
                          ? `Ahead of pace, projected ${formatUSD(b.pace.projectedCents!)}`
                          : b.pace.kind === "history_over"
                            ? `Over in ${b.pace.over} of last ${b.pace.of} months`
                            : "Over budget"}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex flex-col gap-5">
          <section className="card px-6 pt-5 pb-6">
            <CardTitle>Summary</CardTitle>
            <dl className="tabular mt-3 grid grid-cols-2 gap-y-2 text-[14px]">
              <dt className="text-text-muted">Total budget</dt>
              <dd className="text-right text-text">{formatUSD(view.totals.limitCents)}</dd>
              <dt className="text-text-muted">Spent</dt>
              <dd className="text-right text-text">{formatUSD(view.totals.spentCents)}</dd>
              <dt className="text-text-muted">Remaining</dt>
              <dd className="text-right font-semibold text-brand">{formatUSD(view.totals.remainingCents)}</dd>
            </dl>
            <p className="mt-3 text-[12px] text-text-muted">Limits change only when you approve a proposal.</p>
          </section>

          <section className="card px-6 pt-5 pb-5">
            <CardTitle>Recent decisions</CardTitle>
            {proposals.decided.length === 0 ? (
              <p className="mt-3 text-[13px] text-text-muted">No proposals decided yet.</p>
            ) : (
              <ul className="mt-2">
                {proposals.decided.map((p) => (
                  <li key={p.id} className="border-t border-line py-2.5 text-[13px] first:border-t-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-text">
                        {p.changes.map((c) => `${c.category} ${formatUSD(c.old_limit_cents)} → ${formatUSD(c.new_limit_cents)}`).join(", ")}
                      </span>
                      <StatusPill tone={p.status === "executed" ? "brand" : p.status === "stale" ? "warning" : "neutral"}>
                        {STATUS_LABEL[p.status as keyof typeof STATUS_LABEL] ?? p.status}
                      </StatusPill>
                    </div>
                    <div className="mt-0.5 text-text-muted">
                      {p.origin === "alert" ? "From an alert" : "From the assistant"} · {monthName(p.changes[0]?.month ?? view.month)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="mt-5 md:mt-[30px]" aria-labelledby="pending-title">
        <h2 id="pending-title" className="text-[16px] font-semibold text-text">
          Pending proposals
        </h2>
        {proposals.pending.length === 0 ? (
          <p className="card mt-3 px-6 py-5 text-[14px] text-text-muted">
            Nothing waiting for approval. Ask the assistant to plan next month, or simulate a transaction that goes over budget.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            {proposals.pending.map((p) => (
              <div key={`${p.id}-${p.status}`} className="card p-4">
                <ProposalCard proposal={p} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
