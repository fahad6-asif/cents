import type { Metadata } from "next";
import Link from "next/link";
import { Activity, CalendarClock, Gauge, TriangleAlert, type LucideIcon } from "lucide-react";
import { DismissAlertButton } from "@/components/pages/alert-actions";
import { CardTitle, PageHeader } from "@/components/shell/page-header";
import { StatusPill } from "@/components/shell/status-pill";
import { loadAuditLog } from "@/lib/db/activity";
import { listAlerts, type AlertRow } from "@/lib/db/alerts-view";
import { getDb } from "@/lib/db/client";
import { formatUSD } from "@/lib/domain/money";
import { currentSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Insights" };

const ALERT_META: Record<string, { icon: LucideIcon; label: string; tone: string }> = {
  budget_overrun: { icon: TriangleAlert, label: "Over budget", tone: "text-danger bg-danger-fill" },
  unusual_spending: { icon: Activity, label: "Unusual spending", tone: "text-warning bg-warning-fill" },
  budget_warning: { icon: Gauge, label: "Budget warning", tone: "text-warning bg-warning-fill" },
  upcoming_bill: { icon: CalendarClock, label: "Upcoming bill", tone: "text-brand bg-brand/10" },
};

const EVENT_LABEL: Record<string, string> = {
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
  demo_reset: "Demo reset",
  chat_message: "Assistant answered",
  chat_cleared: "Chat cleared",
  chat_rate_limited: "Chat rate-limited",
};

const EVENT_TONE: Record<string, string> = {
  action_executed: "bg-brand",
  action_approved: "bg-brand",
  action_rejected: "bg-text-muted",
  action_blocked: "bg-danger",
  alert_created: "bg-warning",
  demo_reset: "bg-ink-bar",
};

/** Fact keys ending in _cents render as dollars. */
function factChips(facts: Record<string, string | number>) {
  const skip = new Set(["month", "lookback_days", "remaining_cents", "overage_cents"]);
  return Object.entries(facts)
    .filter(([k, v]) => !skip.has(k) && !(k.endsWith("_cents") && v === 0))
    .map(([k, v]) => [k.replace(/_cents$/, "").replace(/_/g, " "), k.endsWith("_cents") ? formatUSD(Number(v)) : k === "percent" ? `${v}%` : String(v)] as const);
}

function describe(event: string, d: Record<string, unknown>): string {
  const money = (v: unknown) => (typeof v === "number" ? formatUSD(v) : "");
  switch (event) {
    case "transaction_simulated":
      return `${d.merchant} ${money(d.amount_cents)} (${d.category})`;
    case "alert_created":
    case "alert_resolved":
    case "alert_dismissed":
      // Older entries have no title: fall back to the key without its id.
      return typeof d.title === "string" ? d.title : String(d.dedupe_key ?? d.type ?? "").split(":").filter((part) => !/^[0-9a-f-]{36}$/.test(part)).join(" · ").replace(/_/g, " ");
    case "action_proposed":
    case "action_executed": {
      const changes = (d.changes as { category: string; old_limit_cents: number; new_limit_cents: number }[] | undefined) ?? [];
      return changes.map((c) => `${c.category} ${money(c.old_limit_cents)} → ${money(c.new_limit_cents)}`).join(", ") + (d.origin ? ` · by ${d.origin}` : "");
    }
    case "action_blocked":
      return `${d.attempted ?? "approve"} refused: ${d.reason}`;
    case "chat_message":
      return Array.isArray(d.tools) && d.tools.length ? `tools: ${(d.tools as string[]).join(", ")}` : "no tools";
    default:
      return "";
  }
}

const time = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });

function AlertCard({ alert, actions }: { alert: AlertRow; actions?: boolean }) {
  const meta = ALERT_META[alert.type] ?? ALERT_META.budget_warning;
  const Icon = meta.icon;
  return (
    <li className="flex gap-3 border-t border-line py-4 first:border-t-0" data-testid="alert-row" data-status={alert.status}>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[9px]", meta.tone)}>
        <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-text">{alert.title}</p>
          <StatusPill tone={alert.status === "active" ? "warning" : "neutral"}>{alert.status}</StatusPill>
        </div>
        <p className="mt-1 text-[14px] leading-[20px] break-words text-text-secondary">{alert.body}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {factChips(alert.facts).map(([k, v]) => (
            <span key={k} className="tabular rounded-full border border-line px-2 py-0.5 text-[12px] text-text-muted">
              {k}: <span className="text-text">{v}</span>
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[12px] text-text-muted">
          <span>{meta.label}</span>
          <span>{time(alert.updatedAt)} UTC</span>
          {alert.proposalId && alert.status === "active" && (
            <Link href="/budgets" className="font-medium text-brand hover:underline">
              Review proposal
            </Link>
          )}
        </div>
      </div>
      {actions && alert.status === "active" && <DismissAlertButton alertId={alert.id} />}
    </li>
  );
}

export default async function InsightsPage() {
  const session = await currentSession();
  if (!session) throw new Error("Missing session");
  const db = getDb();
  const [alerts, audit] = await Promise.all([listAlerts(db, session.id), loadAuditLog(db, session.id)]);

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col">
      <PageHeader title="Insights" subtitle="Alerts from the rule checks, and the full action log for this demo." />

      <div className="mt-6 grid grid-cols-1 gap-5 md:mt-[25px] md:grid-cols-[minmax(0,58fr)_minmax(0,42fr)]">
        <div className="flex flex-col gap-5">
          <section className="card px-6 pt-5 pb-2">
            <CardTitle aside={<span className="text-[13px] text-text-muted">{alerts.active.length} active</span>}>Active alerts</CardTitle>
            {alerts.active.length === 0 ? (
              <p className="py-5 text-[14px] text-text-muted">No active alerts. Everything is within budget.</p>
            ) : (
              <ul className="mt-1" data-testid="active-alerts">
                {alerts.active.map((a) => (
                  <AlertCard key={a.id} alert={a} actions />
                ))}
              </ul>
            )}
          </section>
          <section className="card px-6 pt-5 pb-2">
            <CardTitle>Resolved and dismissed</CardTitle>
            {alerts.recent.length === 0 ? (
              <p className="py-5 text-[14px] text-text-muted">Nothing yet.</p>
            ) : (
              <ul className="mt-1">
                {alerts.recent.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="card px-6 pt-5 pb-4" aria-labelledby="log-title">
          <CardTitle aside={<span className="text-[12px] text-text-muted">Real clock, UTC</span>}>
            <span id="log-title">Action log</span>
          </CardTitle>
          <ol className="mt-3" data-testid="action-log">
            {audit.map((e) => (
              <li key={e.id} className="relative flex gap-3 pb-3 pl-1">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", EVENT_TONE[e.event] ?? "bg-line")} aria-hidden />
                <div className="min-w-0 flex-1 text-[13px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-text" data-event={e.event}>
                      {EVENT_LABEL[e.event] ?? e.event}
                    </span>
                    <span className="tabular shrink-0 text-[12px] text-text-muted">{time(e.createdAt)}</span>
                  </div>
                  {describe(e.event, e.details) && <p className="truncate text-text-muted">{describe(e.event, e.details)}</p>}
                  {e.event === "demo_reset" && <p className="text-[12px] text-text-muted">Epoch {e.epoch} starts</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
