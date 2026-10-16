"use client";

import { toast } from "sonner";
import type { ProposalView } from "./chat-types";
import { emitDataChanged } from "./client-events";
import { formatUSD } from "./domain/money";

export type Decision = "approve" | "reject";

/**
 * Sends the user's decision to the server. Approval happens only here: a person pressing a
 * button. Returns the updated proposal (also on 409, e.g. stale or already decided).
 */
export async function decideProposal(id: string, decision: Decision): Promise<ProposalView | null> {
  try {
    const res = await fetch(`/api/actions/${id}/${decision}`, { method: "POST", cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { proposal?: ProposalView; error?: string; reason?: string };
    if (res.ok && body.proposal) {
      if (decision === "approve") {
        const raised = body.proposal.changes.find((c) => c.new_limit_cents > c.old_limit_cents) ?? body.proposal.changes[0];
        toast.success("Budget updated", {
          description: raised ? `${raised.category} budget is now ${formatUSD(raised.new_limit_cents)}.` : undefined,
        });
      } else {
        toast("Proposal rejected", { description: "No budgets were changed." });
      }
      emitDataChanged();
      return body.proposal;
    }
    toast.error(res.status === 409 ? "Couldn't apply this proposal" : "Something went wrong", {
      description: body.error ?? `Request failed (${res.status})`,
    });
    if (res.status === 409) emitDataChanged();
    return body.proposal ?? null;
  } catch {
    toast.error("Network error", { description: "Please try again." });
    return null;
  }
}
