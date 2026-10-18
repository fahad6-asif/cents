// Chat + proposal shapes shared by server and client.
import type { BudgetChange, ProposalKind } from "@/lib/domain/proposals";
import type { Verification } from "@/lib/agent/verify";

export type ProposalStatus = "pending" | "approved" | "rejected" | "executed" | "failed" | "stale";

export type ProposalView = {
  id: string;
  status: ProposalStatus;
  origin: "assistant" | "alert";
  rationale: string;
  changes: BudgetChange[];
  kind: ProposalKind;
  totalDeltaCents: number;
  createdAt: string;
  decidedAt: string | null;
  executedAt: string | null;
  result: Record<string, unknown> | null;
};

export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  proposal: ProposalView | null;
  /** Grounding check of an assistant reply; null for user messages and failed turns. */
  verification: Verification | null;
};

export type ChatTurnResponse = {
  reply: ChatMessageView;
  user: ChatMessageView;
  proposal: ProposalView | null;
};
