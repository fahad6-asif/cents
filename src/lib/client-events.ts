"use client";

import type { OverviewData } from "./overview-types";

/** Fired after any state change (simulate, reset, dismiss, approve) so views can refresh. */
export const DATA_CHANGED = "cents:data-changed";

export type DataChangedDetail = { overview?: OverviewData };

export function emitDataChanged(detail: DataChangedDetail = {}): void {
  window.dispatchEvent(new CustomEvent<DataChangedDetail>(DATA_CHANGED, { detail }));
}

/** POST JSON and return the parsed body; throws with the server's error message on failure. */
export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}
