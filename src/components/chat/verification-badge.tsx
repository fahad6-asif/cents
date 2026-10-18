"use client";

import { useState } from "react";
import type { Verification } from "@/lib/agent/verify";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "✓ 6 figures checked against your account", or amber "⚠ 1 figure couldn't be verified" (tap to see which). */
export function VerificationBadge({ verification }: { verification: Verification | null }) {
  const [open, setOpen] = useState(false);
  if (!verification || verification.total_count === 0) return null;
  if (verification.all_matched) {
    return (
      <p data-testid="verification-badge" data-status="verified" className="text-[12px] leading-4 text-text-muted">
        ✓ {plural(verification.total_count, "figure")} checked against your account
      </p>
    );
  }
  const unmatched = verification.figures.filter((f) => !f.matched).map((f) => f.raw);
  const missing = verification.total_count - verification.verified_count;
  return (
    <div data-testid="verification-badge" data-status="partial" className="text-[12px] leading-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={`Not found in your account data: ${unmatched.join(", ")}`}
        className="cursor-pointer font-medium text-warning hover:underline"
      >
        ⚠ {plural(missing, "figure")} couldn&apos;t be verified
      </button>
      {open && <p className="mt-1 text-text-muted">Not found in your account data: {unmatched.join(", ")}</p>}
    </div>
  );
}
