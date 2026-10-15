import { NextResponse } from "next/server";
import { z } from "zod";
import { openRouterClient } from "@/lib/agent/llm";
import { runAgentTurn } from "@/lib/agent/loop";
import { checkChatRateLimit, rateLimitConfig } from "@/lib/agent/rate-limit";
import { APP_NAME } from "@/lib/brand";
import { audit } from "@/lib/db/audit";
import { clearChat, loadChat } from "@/lib/db/chat";
import { getDb } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";
import { currentSession } from "@/lib/session";
import { simToday } from "@/lib/sim";

export const maxDuration = 60;

const Body = z.object({ message: z.string().trim().min(1).max(2000) }).strict();

export async function GET() {
  const session = await currentSession();
  if (!session) return jsonError(401, "No session");
  return NextResponse.json({ messages: await loadChat(getDb(), session.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const session = await currentSession();
  if (!session) return jsonError(401, "No session");
  const db = getDb();

  const limit = await checkChatRateLimit(db, session.id, rateLimitConfig());
  if (!limit.ok) {
    await audit(db, session.id, session.epoch, "chat_rate_limited", { scope: limit.scope });
    return jsonError(429, limit.message, { scope: limit.scope });
  }

  const turn = await runAgentTurn(
    { db, sessionId: session.id, epoch: session.epoch, today: simToday(), appName: APP_NAME },
    openRouterClient(),
    body.data.message,
  );
  return NextResponse.json(
    { user: turn.user, reply: turn.reply, proposal: turn.proposal },
    { status: turn.failed ? 502 : 200, headers: { "Cache-Control": "no-store" } },
  );
}

/** "Clear" in the chat card. Tool-call logs and the audit trail are kept as evidence. */
export async function DELETE() {
  const session = await currentSession();
  if (!session) return jsonError(401, "No session");
  const db = getDb();
  await clearChat(db, session.id);
  await audit(db, session.id, session.epoch, "chat_cleared");
  return NextResponse.json({ ok: true });
}
