"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { TraceStep } from "@/lib/agent/trace";
import type { Verification } from "@/lib/agent/verify";
import { cn } from "@/lib/utils";
import { VerificationBadge } from "./verification-badge";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const stepTime = (ms: number) => (ms >= 1000 ? seconds(ms) : `${ms} ms`);

/**
 * "How I got this": `✦ 3 steps · ✓ 6 figures checked · 2.4s ▾`, expanding to one row per tool
 * (label, input chips, key figures, duration). Turns without tools fall back to the A4 badge.
 */
export function TurnReceipts({ trace, verification, turnMs }: { trace: TraceStep[]; verification: Verification | null; turnMs: number | null }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panel = useRef<HTMLOListElement>(null);
  // Inside the chat box's own scroller the opened panel can land below the fold.
  useEffect(() => {
    if (open) panel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);
  if (!trace?.length) return <VerificationBadge verification={verification} />;

  const hasFigures = !!verification && verification.total_count > 0;
  const partial = hasFigures && !verification!.all_matched;
  const unmatched = verification?.figures.filter((f) => !f.matched).map((f) => f.raw) ?? [];
  const missing = verification ? verification.total_count - verification.verified_count : 0;

  return (
    <div data-testid="receipts" className="min-w-0 text-[12px] leading-4 text-text-muted">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex cursor-pointer flex-wrap items-center gap-x-1.5 gap-y-0.5 text-left hover:text-text"
      >
        <span>✦ {plural(trace.length, "step")}</span>
        {hasFigures && (
          <>
            <span aria-hidden>·</span>
            <span
              data-testid="verification-badge"
              data-status={partial ? "partial" : "verified"}
              title={partial ? `Not found in your account data: ${unmatched.join(", ")}` : undefined}
              className={cn(partial && "font-medium text-warning")}
            >
              {partial ? `⚠ ${plural(missing, "figure")} couldn't be verified` : `✓ ${plural(verification!.total_count, "figure")} checked`}
            </span>
          </>
        )}
        {turnMs !== null && (
          <>
            <span aria-hidden>·</span>
            <span className="tabular">{seconds(turnMs)}</span>
          </>
        )}
        <span aria-hidden className={cn("inline-block transition-transform", open && "rotate-180")}>
          ▾
        </span>
        <span className="sr-only">{open ? "Hide how I got this" : "Show how I got this"}</span>
      </button>

      {open && (
        <ol ref={panel} id={panelId} data-testid="trace-panel" className="mt-2 divide-y divide-line rounded-[10px] border border-line">
          {trace.map((s, i) => (
            <li key={i} data-testid="trace-step" data-tool={s.tool} className="flex min-w-0 flex-col gap-1 px-3 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-[13px] leading-[18px] text-text">
                  {s.label}
                  {!s.ok && <span className="text-warning"> · didn&apos;t work</span>}
                </span>
                <span className="tabular shrink-0">{stepTime(s.duration_ms)}</span>
              </div>
              {s.input_summary.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {s.input_summary.map((c) => (
                    <span key={c} className="rounded-full border border-line px-2 py-px text-[11px]">
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {s.key_figures.length > 0 && <p className="tabular break-words">{s.key_figures.join(" · ")}</p>}
            </li>
          ))}
          {partial && <li className="px-3 py-2 text-warning">Not found in your account data: {unmatched.join(", ")}</li>}
        </ol>
      )}
    </div>
  );
}
