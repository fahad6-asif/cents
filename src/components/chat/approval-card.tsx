"use client";

import { Check, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProposalView } from "@/lib/chat-types";
import { formatTimeLabel, monthName } from "@/lib/domain/dates";
import { formatUSD } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

type Props = {
  proposal: ProposalView;
  busy?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
};

// Shared formatter: identical on server and client (no locale), so no hydration mismatch.
const time = (iso: string | null) => (iso ? formatTimeLabel(iso) : "");

/** Plan 9.4: "Proposed budget change" with current → proposed per category and Approve / Reject. */
export function ApprovalCard({ proposal, busy, onApprove, onReject }: Props) {
  const { status, kind, totalDeltaCents } = proposal;
  const months = [...new Set(proposal.changes.map((c) => monthName(c.month)))].join(" & ");
  return (
    <div data-testid="approval-card" data-status={status} className="rounded-[12px] border border-line bg-bg/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] font-semibold text-text">Proposed budget change</p>
        <span className="text-[12px] text-text-muted">{months}</span>
      </div>
      <table className="mt-3 w-full text-[13px]">
        <thead>
          <tr className="text-left text-text-muted">
            <th className="pb-1 font-normal">Category</th>
            <th className="pb-1 text-right font-normal">Current → proposed</th>
            <th className="pb-1 text-right font-normal">Difference</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {proposal.changes.map((c) => {
            const diff = c.new_limit_cents - c.old_limit_cents;
            return (
              <tr key={`${c.category}-${c.month}`} className="border-t border-line">
                <td className="py-1.5 text-text">{c.category}</td>
                <td className="py-1.5 text-right text-text">
                  {formatUSD(c.old_limit_cents)} → <span className="font-medium">{formatUSD(c.new_limit_cents)}</span>
                </td>
                <td className={cn("py-1.5 text-right", diff < 0 ? "text-brand" : "text-text")}>
                  {formatUSD(diff, { plus: true })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[13px] leading-[19px] text-text-secondary">{proposal.rationale}</p>
      <p className="mt-2 text-[12px] text-text-muted">
        {kind === "potential_savings"
          ? `Potential savings: ${formatUSD(-totalDeltaCents)} (lower limits, not money saved yet)`
          : kind === "reallocation"
            ? "Reallocation: total budget unchanged"
            : `Increase: total budget ${formatUSD(totalDeltaCents, { plus: true })}`}
      </p>

      <div className="mt-3 flex items-center gap-2">
        {status === "pending" && (
          <>
            <Button
              onClick={onApprove}
              disabled={busy}
              data-testid="approve"
              className="h-9 rounded-[9px] border-0 bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-hover"
            >
              Approve
            </Button>
            <Button
              variant="outline"
              onClick={onReject}
              disabled={busy}
              data-testid="reject"
              className="h-9 rounded-[9px] border-line bg-surface px-4 text-[13px] font-medium text-text hover:bg-muted-fill"
            >
              Reject
            </Button>
            <span className="ml-1 flex items-center gap-1 text-[12px] text-text-muted">
              <Clock className="size-3.5" strokeWidth={1.75} /> Waiting for your approval
            </span>
          </>
        )}
        {status === "executed" && (
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-brand">
            <Check className="size-4" strokeWidth={2} /> Applied {time(proposal.executedAt)}
          </span>
        )}
        {status === "rejected" && (
          <span className="flex items-center gap-1.5 text-[13px] text-text-muted">
            <X className="size-4" strokeWidth={1.75} /> Rejected {time(proposal.decidedAt)}
          </span>
        )}
        {status === "stale" && (
          <span className="rounded-[8px] bg-warning-fill px-2.5 py-1 text-[12px] text-warning">
            Budgets changed. Ask for a new proposal.
          </span>
        )}
        {(status === "failed" || status === "approved") && (
          <span className="text-[12px] text-text-muted">Status: {status}</span>
        )}
      </div>
    </div>
  );
}
