// "How I got this" receipts (addendum A5): one friendly row per tool call, built server-side from
// the logged tool_calls. Only labels, small input chips and pre-formatted figures leave the server:
// no IDs, no raw outputs, nothing from the environment.
import { monthName } from "../domain/dates";
import { formatUSD } from "../domain/money";

export type TraceStep = {
  tool: string;
  label: string;
  input_summary: string[];
  ok: boolean;
  duration_ms: number;
  key_figures: string[];
};

export type ToolCallRow = { toolName: string; input: unknown; output: unknown; ok: boolean; durationMs: number };

// Tool inputs and outputs are loose JSON here; every accessor below tolerates a missing field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const MAX_FIGURES = 4;
const MAX_CHIPS = 3;
const month = (m: unknown) => (typeof m === "string" && /^\d{4}-\d{2}$/.test(m) ? monthName(m) : null);
const usd = (x: Loose) => (typeof x?.usd === "string" ? x.usd : null);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

type Spec = { label: (input: Loose, ok: boolean) => string; summarizeForTrace: (output: Loose) => (string | null)[] };

const SPECS: Record<string, Spec> = {
  get_account_summary: {
    label: () => "Read your account summary",
    summarizeForTrace: (o) => [`Balance ${usd(o.balance)}`, `Spent ${usd(o.month_to_date?.spending)}`, `Net ${usd(o.month_to_date?.net)}`],
  },
  get_transactions: {
    label: (i) => (month(i.month) ? `Searched ${month(i.month)} transactions` : "Searched your transactions"),
    summarizeForTrace: (o) => [
      plural(o.matching_count, "transaction"),
      o.matching_expenses_total?.cents ? `Spent ${usd(o.matching_expenses_total)}` : null,
      o.matching_income_total?.cents ? `Income ${usd(o.matching_income_total)}` : null,
    ],
  },
  get_spending_by_category: {
    label: (i) => (month(i.month) ? `Totalled ${month(i.month)} spending by category` : `Totalled the last ${i.last_days ?? "few"} days by category`),
    summarizeForTrace: (o) => [`Total ${usd(o.total_spending)}`, ...(o.categories ?? []).slice(0, 3).map((c: Loose) => `${c.category} ${usd(c.spent)}`)],
  },
  get_budget_status: {
    label: (i) => `Checked ${month(i.month) ?? "your"} budgets`,
    summarizeForTrace: (o) =>
      [...(o.budgets ?? [])]
        .filter((b: Loose) => typeof b.utilization_pct === "number")
        .sort((a: Loose, b: Loose) => b.utilization_pct - a.utilization_pct)
        .slice(0, 3)
        .map((b: Loose) => `${b.category} ${b.utilization_pct}%`),
  },
  get_upcoming_bills: {
    label: (i) => `Checked bills due in the next ${i.days ?? 14} days`,
    summarizeForTrace: (o) => [plural((o.bills ?? []).length, "bill"), `Total ${usd(o.total)}`],
  },
  compare_monthly_spending: {
    label: (i) => `Compared ${month(i.month_a) ?? "one month"} with ${month(i.month_b) ?? "another"}`,
    summarizeForTrace: (o) => [
      `${month(o.month_a)} ${usd(o.totals?.month_a)}`,
      `${month(o.month_b)} ${usd(o.totals?.month_b)}`,
      `Change ${usd(o.totals?.change)}`,
      typeof o.totals?.change_pct === "number" ? `${o.totals.change_pct}%` : null,
    ],
  },
  check_affordability: {
    label: () => "Ran affordability check",
    summarizeForTrace: (o) => [`Disposable ${usd(o.disposable_funds)}`, `After purchase ${usd(o.disposable_after_purchase)}`, `Bills ${usd(o.bills_total)}`],
  },
  find_recurring_charges: {
    label: (i) => `Scanned ${i.lookback_months ?? 6} months for recurring charges`,
    summarizeForTrace: (o) => [
      `Subscriptions ${usd(o.totals?.subscriptions_monthly)}/mo`,
      typeof o.totals?.count_subscriptions === "number" ? plural(o.totals.count_subscriptions, "subscription") : null,
      `Bills ${usd(o.totals?.bills_monthly)}/mo`,
    ],
  },
  analyze_bills: {
    label: (i) => (i.bill ? `Analyzed your ${String(i.bill).slice(0, 40)} bill` : `Analyzed ${i.months ?? 6} months of bills`),
    summarizeForTrace: (o) => {
      const bills = o.bills ?? [];
      if (bills.length === 1) {
        const b = bills[0];
        const p = b.vs_average?.pct;
        return [`Avg ${usd(b.average)}`, b.upcoming ? `Upcoming ${usd(b.upcoming.amount)}` : null, typeof p === "number" ? `${p > 0 ? "+" : ""}${p}% vs avg` : null];
      }
      return [`All bills avg ${usd(o.totals?.monthly_average_all_bills)}/mo`, typeof o.totals?.unusual_count === "number" ? `${o.totals.unusual_count} unusual` : null];
    },
  },
  plan_overrun_fix: {
    label: (i) => `Planned a fix for the ${String(i.category ?? "budget").slice(0, 40)} overrun`,
    summarizeForTrace: (o) =>
      o.needed === false
        ? ["Not over budget"]
        : [`Over ${usd(o.overage)}`, `Covered now ${usd(o.covered_now)}`, `Carried ${usd(o.carried)}`, o.uncovered?.cents ? `Uncovered ${usd(o.uncovered)}` : null],
  },
  get_category_history: {
    label: (i) => `Reviewed ${i.months ?? 3} months of ${i.category ? String(i.category).slice(0, 40) : "category"} history`,
    summarizeForTrace: (o) => [
      `Limits ${usd(o.totals?.current_limits_sum)} → ${usd(o.totals?.suggested_limits_sum)}`,
      ...(o.propose_with ?? []).slice(0, 3).map((p: Loose) => {
        const c = (o.categories ?? []).find((x: Loose) => x.category === p.category);
        return c ? `${c.category} ${usd(c.suggested_next_limit)}` : null;
      }),
    ],
  },
  get_proposals: {
    label: () => "Checked your proposals",
    summarizeForTrace: (o) => [typeof o.counts?.pending === "number" ? `${o.counts.pending} pending` : null, typeof o.counts?.executed === "number" ? `${o.counts.executed} applied` : null],
  },
  propose_budget_adjustment: {
    label: (_i, ok) => (ok ? "Drafted a proposal for your approval" : "Tried to draft a proposal"),
    summarizeForTrace: (o) =>
      o.ok === false
        ? ["Not created"]
        : [`Total ${usd(o.total_change)}`, ...(o.changes ?? []).slice(0, 3).map((c: Loose) => `${c.category} ${usd(c.current_limit)} → ${usd(c.proposed_limit)}`)],
  },
};

/** Small chips describing what the tool was asked (month, category, amount, window). */
function inputChips(input: Loose): string[] {
  if (!input || typeof input !== "object") return [];
  const chips: string[] = [];
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (k === "month" || k === "month_a" || k === "month_b") {
      if (month(v)) chips.push(month(v)!);
    } else if ((k === "category" || k === "bill") && typeof v === "string") chips.push(v.slice(0, 40));
    else if (k === "status" && typeof v === "string" && v !== "all") chips.push(v);
    else if (k === "last_days" && typeof v === "number") chips.push(`last ${v} days`);
    else if (k === "days" && typeof v === "number") chips.push(`next ${v} days`);
    else if ((k === "lookback_months" || k === "months") && typeof v === "number") chips.push(`${v} months`);
    else if (k === "amount_cents" && Number.isInteger(v)) chips.push(formatUSD(v as number));
    else if (k === "target_savings_cents" && Number.isInteger(v)) chips.push(`save ${formatUSD(v as number)}`);
    else if (k === "changes" && Array.isArray(v)) chips.push(plural(v.length, "change"));
  }
  return chips.slice(0, MAX_CHIPS);
}

function keyFigures(spec: Spec | undefined, ok: boolean, output: unknown): string[] {
  if (!spec || !output || typeof output !== "object") return [];
  if (!ok && spec !== SPECS.propose_budget_adjustment) return [];
  try {
    return spec
      .summarizeForTrace(output)
      .filter((s): s is string => typeof s === "string" && !s.includes("null") && !s.includes("undefined"))
      .slice(0, MAX_FIGURES);
  } catch {
    return [];
  }
}

export function buildTrace(rows: readonly ToolCallRow[]): TraceStep[] {
  return rows.map((r) => {
    const spec = SPECS[r.toolName];
    let label = "Ran a check";
    try {
      if (spec) label = spec.label(r.input ?? {}, r.ok);
    } catch {
      /* keep the generic label */
    }
    return {
      tool: r.toolName,
      label,
      input_summary: inputChips(r.input),
      ok: r.ok,
      duration_ms: r.durationMs,
      key_figures: keyFigures(spec, r.ok, r.output),
    };
  });
}

/** Every tool the trace has a friendly label for (kept in step with the registry by a test). */
export const TRACED_TOOLS = Object.keys(SPECS);
