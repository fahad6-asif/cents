// Chat + proposal shapes shared by server and client.
import type { BudgetChange, ProposalKind } from "@/lib/domain/proposals";
import type { TraceStep } from "@/lib/agent/trace";
import type { Verification } from "@/lib/agent/verify";

export type ProposalStatus = "pending" | "approved" | "rejected" | "executed" | "failed" | "stale";

/** The overrun-fix split behind a proposal, from plan_overrun_fix in the same turn. */
export type OverrunFixMeta = {
  category: string;
  month: string;
  next_month: string;
  overage_cents: number;
  covered_now_cents: number;
  carried_cents: number;
  uncovered_cents: number;
};

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
  overrunFix: OverrunFixMeta | null;
};

export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  proposal: ProposalView | null;
  /** Grounding check of an assistant reply; null for user messages and failed turns. */
  verification: Verification | null;
  /** "How I got this": one row per tool call this turn (empty for user messages). */
  trace: TraceStep[];
  turnMs: number | null;
};

export type ChatTurnResponse = {
  reply: ChatMessageView;
  user: ChatMessageView;
  proposal: ProposalView | null;
};
