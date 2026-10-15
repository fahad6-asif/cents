import "server-only";
import { cookies } from "next/headers";
import { getDb } from "./db/client";
import { ensureSession, type SessionInfo } from "./db/sessions";

export const SESSION_COOKIE = "cents_session";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isSessionId(value: string | undefined): value is string {
  return !!value && UUID.test(value);
}

/**
 * The current visitor's session (seeded on first use). The cookie itself is issued by
 * src/proxy.ts, so every page and API request already carries a valid id here.
 */
export async function currentSession(): Promise<SessionInfo | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isSessionId(id)) return null;
  return ensureSession(getDb(), id);
}
