"use client";

import { useState } from "react";
import type { ProposalView } from "@/lib/chat-types";
import { decideProposal, type Decision } from "@/lib/proposal-actions";
import { ApprovalCard } from "./approval-card";

/**
 * Approval card with live Approve / Reject (chat thread, Budgets page). Parents key it by
 * `${id}-${status}` so a server-side status change remounts it with fresh state.
 */
export function ProposalCard({ proposal: initial }: { proposal: ProposalView }) {
  const [proposal, setProposal] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function decide(decision: Decision) {
    setBusy(true);
    const updated = await decideProposal(proposal.id, decision);
    if (updated) setProposal(updated);
    setBusy(false);
  }

  return <ApprovalCard proposal={proposal} busy={busy} onApprove={() => decide("approve")} onReject={() => decide("reject")} />;
}
