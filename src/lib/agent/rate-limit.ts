import { countChatTurns } from "@/lib/db/chat";
import type { DbOrTx } from "@/lib/db/types";

export type RateLimitConfig = { perSessionPerHour: number; globalPerDay: number };

export function rateLimitConfig(): RateLimitConfig {
  const num = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);
  return {
    perSessionPerHour: num(process.env.CHAT_RATE_LIMIT_PER_HOUR, 30),
    globalPerDay: num(process.env.CHAT_GLOBAL_LIMIT_PER_DAY, 500),
  };
}

export type RateLimitResult = { ok: true } | { ok: false; scope: "session" | "global"; message: string };

/** Per-session hourly limit (plan) + a global daily cap protecting the LLM credit. Real clock. */
export async function checkChatRateLimit(db: DbOrTx, sessionId: string, cfg: RateLimitConfig, now = new Date()): Promise<RateLimitResult> {
  const hourAgo = new Date(now.getTime() - 3_600_000);
  if ((await countChatTurns(db, sessionId, hourAgo)) >= cfg.perSessionPerHour) {
    return {
      ok: false,
      scope: "session",
      message: `You've reached the limit of ${cfg.perSessionPerHour} questions per hour for this demo. Please try again a bit later.`,
    };
  }
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if ((await countChatTurns(db, null, startOfDay)) >= cfg.globalPerDay) {
    return {
      ok: false,
      scope: "global",
      message: "The demo assistant has reached today's usage limit. Everything else in the app still works.",
    };
  }
  return { ok: true };
}
