import type { Metadata } from "next";
import { Download } from "lucide-react";
import { CardTitle, PageHeader } from "@/components/shell/page-header";
import { ResetDemoButton } from "@/components/shell/reset-demo-button";
import { modelName } from "@/lib/agent/llm";
import { rateLimitConfig } from "@/lib/agent/rate-limit";
import { APP_NAME } from "@/lib/brand";
import { formatLongDate } from "@/lib/domain/dates";
import { currentSession } from "@/lib/session";
import { demoUserName, simToday } from "@/lib/sim";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await currentSession();
  if (!session) throw new Error("Missing session");
  const limits = rateLimitConfig();
  const today = simToday();

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col">
      <PageHeader title="Settings" subtitle="About this demo, reset and evidence export." />

      <div className="mt-6 grid grid-cols-1 gap-5 md:mt-[25px] md:grid-cols-2">
        <section className="card px-6 pt-5 pb-6">
          <CardTitle>Demo account</CardTitle>
          <p className="mt-2 text-[14px] leading-[21px] text-text-secondary">
            <strong className="font-semibold text-text">All data is synthetic.</strong> {APP_NAME} runs on a simulated checking account for{" "}
            {demoUserName()}. It is not connected to any bank, cannot move money, and makes no trades. Every visitor gets a private copy of
            the same starting data.
          </p>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
            <dt className="text-text-muted">Simulated today</dt>
            <dd className="text-text">{formatLongDate(today)} {today.slice(0, 4)}</dd>
            <dt className="text-text-muted">Session</dt>
            <dd className="text-text">Reset {session.epoch} time{session.epoch === 1 ? "" : "s"}</dd>
          </dl>
        </section>

        <section className="card px-6 pt-5 pb-6">
          <CardTitle>Assistant</CardTitle>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
            <dt className="text-text-muted">Model</dt>
            <dd className="break-all text-text" data-testid="model-name">
              {modelName()}
            </dd>
            <dt className="text-text-muted">Provider</dt>
            <dd className="text-text">OpenRouter</dd>
            <dt className="text-text-muted">Limits</dt>
            <dd className="text-text">
              {limits.perSessionPerHour} questions per hour per visitor, {limits.globalPerDay} per day in total
            </dd>
          </dl>
          <p className="mt-3 text-[12px] leading-[18px] text-text-muted">
            The assistant reads your figures through tools and can only propose budget changes. Changes apply only when you press Approve.
          </p>
        </section>

        <section className="card px-6 pt-5 pb-6">
          <CardTitle>Reset demo</CardTitle>
          <p className="mt-2 text-[14px] leading-[21px] text-text-secondary">
            Clears simulated transactions, alerts, proposals and the chat, and restores the starting data. The action log is kept.
          </p>
          <div className="mt-4">
            <ResetDemoButton />
          </div>
        </section>

        <section className="card px-6 pt-5 pb-6">
          <CardTitle>Export evidence</CardTitle>
          <p className="mt-2 text-[14px] leading-[21px] text-text-secondary">
            Download this session&apos;s action log, assistant tool calls, proposals and alerts as JSON.
          </p>
          <a
            href="/api/evidence"
            download
            data-testid="export-evidence"
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-[9px] bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-hover"
          >
            <Download className="size-4" strokeWidth={2} />
            Export evidence
          </a>
        </section>
      </div>
    </div>
  );
}
