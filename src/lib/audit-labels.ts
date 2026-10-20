// Human labels for the Insights action log. One entry per audit event (typed, so a new event
// without a label fails the build). Details never show raw ids or user-typed merchant text.
import type { AuditEvent } from "./db/audit";
import { formatUSD } from "./domain/money";

export const EVENT_LABEL: Record<AuditEvent, string> = {
  session_created: "Demo account created",
  transaction_simulated: "Transaction simulated",
  alert_created: "Alert raised",
  alert_resolved: "Alert resolved",
  alert_dismissed: "Alert dismissed",
  action_proposed: "Change proposed",
  action_approved: "Change approved",
  action_executed: "Change executed",
  action_rejected: "Change rejected",
  action_blocked: "Action blocked",
  action_stale: "Proposal went stale",
  demo_reset: "Demo reset",
  chat_message: "Assistant answered",
  chat_cleared: "Chat cleared",
  chat_rate_limited: "Chat rate-limited",
  reply_verified: "Answer verified",
  reply_unverified: "Answer partly verified",
  impact_note_requested: "AI impact note requested",
  impact_note_completed: "AI impact note ready",
  simulate_rate_limited: "Custom transaction limit reached",
};

export const EVENT_TONE: Partial<Record<AuditEvent, string>> = {
  action_executed: "bg-brand",
  action_approved: "bg-brand",
  reply_verified: "bg-brand",
  action_rejected: "bg-text-muted",
  action_blocked: "bg-danger",
  simulate_rate_limited: "bg-danger",
  alert_created: "bg-warning",
  action_stale: "bg-warning",
  reply_unverified: "bg-warning",
  demo_reset: "bg-ink-bar",
};

const STALE_REASON: Record<string, string> = {
  limits_changed: "budgets changed since it was proposed",
  below_spent: "it would set a limit below what’s already spent",
  plan_changed: "the fix no longer matches the new spending",
  invalid: "it’s no longer valid",
};

/** Plain names for the assistant's tools (and the impact note's server step) in the log. */
const TOOL_NAME: Record<string, string> = {
  get_account_summary: "account summary",
  get_transactions: "transactions",
  get_spending_by_category: "spending by category",
  get_budget_status: "budget status",
  get_upcoming_bills: "upcoming bills",
  compare_monthly_spending: "month comparison",
  check_affordability: "affordability check",
  find_recurring_charges: "recurring charges",
  analyze_bills: "bill analysis",
  plan_overrun_fix: "overrun fix plan",
  get_category_history: "category history",
  get_proposals: "proposal status",
  propose_budget_adjustment: "budget proposal",
  impact_facts: "server fact check",
};
const toolName = (t: string) => TOOL_NAME[t] ?? t.replace(/_/g, " ");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Unknown events (older or newer than this code) fall back to their name, made readable. */
export function eventLabel(event: string): string {
  return EVENT_LABEL[event as AuditEvent] ?? event.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function describeEvent(event: string, d: Record<string, unknown>): string {
  const money = (v: unknown) => (typeof v === "number" ? formatUSD(v) : "");
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  switch (event) {
    case "transaction_simulated":
      // Custom merchant text is user-typed and is logged as a length only.
      return d.origin === "custom" || typeof d.merchant !== "string"
        ? `Custom ${money(d.amount_cents)} (${d.category})`
        : `${d.merchant} ${money(d.amount_cents)} (${d.category})`;
    case "alert_created":
    case "alert_resolved":
    case "alert_dismissed":
      // Older entries have no title: fall back to the key without its id.
      return typeof d.title === "string"
        ? d.title
        : String(d.dedupe_key ?? d.type ?? "")
            .split(":")
            .filter((part) => !/^[0-9a-f-]{36}$/.test(part))
            .join(" · ")
            .replace(/_/g, " ");
    case "action_proposed":
    case "action_executed": {
      const changes = (d.changes as { category: string; old_limit_cents: number; new_limit_cents: number }[] | undefined) ?? [];
      return changes.map((c) => `${c.category} ${money(c.old_limit_cents)} → ${money(c.new_limit_cents)}`).join(", ") + (d.origin ? ` · by ${d.origin}` : "");
    }
    case "action_blocked":
      return `${d.attempted ?? "approve"} refused: ${d.reason}`;
    case "action_stale":
      return `Can no longer be approved: ${STALE_REASON[String(d.reason)] ?? String(d.reason ?? "")}`;
    case "chat_message":
      return Array.isArray(d.tools) && d.tools.length ? `Used: ${[...new Set((d.tools as string[]).map(toolName))].join(", ")}` : "Answered without tools";
    case "reply_verified":
    case "reply_unverified": {
      const total = num(d.total_count);
      if (total === 0) return "No figures to check";
      const retry = d.retried ? " · after one correction" : "";
      return event === "reply_verified" ? `All ${plural(total, "figure")} checked against the account${retry}` : `${num(d.verified_count)} of ${plural(total, "figure")} matched${retry}`;
    }
    case "impact_note_requested":
      return `For ${plural(Array.isArray(d.transaction_ids) ? d.transaction_ids.length : 1, "new transaction")}`;
    case "impact_note_completed":
      return d.failed ? "Couldn’t finish; the dashboard is still up to date" : plural(num(d.tool_count), "step");
    case "simulate_rate_limited":
      return `Up to ${num(d.limit_per_hour)} custom transactions per hour`;
    default:
      return "";
  }
}
