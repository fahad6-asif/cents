"use client";

import type { ChatTurnResponse } from "./chat-types";
import { emitDataChanged } from "./client-events";

/** Fired while an impact note is queued or running, when it arrives, and when it fails (B1.3). */
export const IMPACT_PENDING = "cents:impact-pending";
export const IMPACT_DONE = "cents:impact-done";
export const IMPACT_FAILED = "cents:impact-failed";
export const IMPACT_DEBOUNCE_MS = 3000;
export const IMPACT_UNAVAILABLE = "AI impact note unavailable. Your dashboard is up to date.";

let queued: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Queue one AI impact note for a custom transaction. Several added within 3 s share one note
 * (only the last one triggers it, covering all of them), so a burst costs one chat message.
 */
export function queueImpactNote(transactionId: string): void {
  queued.push(transactionId);
  if (timer) clearTimeout(timer);
  window.dispatchEvent(new CustomEvent(IMPACT_PENDING));
  timer = setTimeout(() => void flush(), IMPACT_DEBOUNCE_MS);
}

async function flush(): Promise<void> {
  const transactionIds = queued;
  queued = [];
  timer = null;
  try {
    const res = await fetch("/api/chat/impact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionIds }),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.reply) throw new Error(body.error ?? String(res.status));
    window.dispatchEvent(new CustomEvent<ChatTurnResponse>(IMPACT_DONE, { detail: body as ChatTurnResponse }));
    // A proposal may have been created: let every view refresh.
    emitDataChanged();
  } catch {
    window.dispatchEvent(new CustomEvent(IMPACT_FAILED));
  }
}
