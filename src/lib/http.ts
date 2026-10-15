import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";

const MAX_BODY_BYTES = 8 * 1024;

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Reads and zod-validates a JSON body. Oversized, malformed or invalid bodies → 400. */
export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return { ok: false, response: jsonError(400, "Body too large") };
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: jsonError(400, "Unreadable body") };
  }
  if (raw.length > MAX_BODY_BYTES) return { ok: false, response: jsonError(400, "Body too large") };
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, response: jsonError(400, "Malformed JSON") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(400, "Invalid request", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      }),
    };
  }
  return { ok: true, data: parsed.data };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
