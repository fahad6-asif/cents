import { NextResponse } from "next/server";
import { z } from "zod";
import { IMPACT_MAX_TOOL_ITERATIONS, IMPACT_MAX_TRANSACTIONS, impactFacts, impactPrompt, impactProposalBlock, loadImpactTransactions } from "@/lib/agent/impact";
import { openRouterClient } from "@/lib/agent/llm";
import { runAgentTurn } from "@/lib/agent/loop";
import { checkChatRateLimit, rateLimitConfig } from "@/lib/agent/rate-limit";
import { APP_NAME } from "@/lib/brand";
import { audit } from "@/lib/db/audit";
import { getDb } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";
import { currentSession } from "@/lib/session";
import { simToday } from "@/lib/sim";

export const maxDuration = 60;

// One id, or the debounced batch (B1.3). The prompt itself is fixed server-side.
const Body = z.union([
  z.object({ transactionId: z.uuid() }).strict(),
  z.object({ transactionIds: z.array(z.uuid()).min(1).max(IMPACT_MAX_TRANSACTIONS) }).strict(),
]);

/** AI impact note after custom transactions: one agent turn, read/propose tools only, counted as a chat message. */
export async function POST(request: Request) {
  const body = await readJson(request, Body);
  if (!body.ok) return body.response;
  const session = await currentSession();
  if (!session) return jsonError(401, "No session");
  const db = getDb();

  const ids = "transactionId" in body.data ? [body.data.transactionId] : [...new Set(body.data.transactionIds)];
  const txns = await loadImpactTransactions(db, session.id, ids);
  if (!txns.length) return jsonError(404, "No custom transaction found");

  const limit = await checkChatRateLimit(db, session.id, rateLimitConfig());
  if (!limit.ok) {
    await audit(db, session.id, session.epoch, "chat_rate_limited", { scope: limit.scope, source: "impact_note" });
    return jsonError(429, limit.message, { scope: limit.scope });
  }
  await audit(db, session.id, session.epoch, "impact_note_requested", { transaction_ids: txns.map((t) => t.id) });

  // The server's before → after check runs first and is logged like a tool call (receipts + verifier).
  const started = Date.now();
  const { facts, keyFigures } = await impactFacts(db, session.id, txns, simToday());
  const factsLog = { toolName: "impact_facts", input: { transactions: txns.length }, output: { facts, key_figures: keyFigures }, ok: true, durationMs: Date.now() - started };
  const turn = await runAgentTurn(
    { db, sessionId: session.id, epoch: session.epoch, today: simToday(), appName: APP_NAME },
    openRouterClient(),
    impactPrompt(txns, facts),
    { maxToolIterations: IMPACT_MAX_TOOL_ITERATIONS, impact: { blockProposals: await impactProposalBlock(db, session.id) }, priorLogs: [factsLog] },
  );
  await audit(db, session.id, session.epoch, "impact_note_completed", {
    message_id: turn.reply.id,
    tool_count: turn.reply.trace.length,
    proposal_id: turn.proposal?.id ?? null,
    failed: turn.failed,
  });
  return NextResponse.json(
    { user: turn.user, reply: turn.reply, proposal: turn.proposal },
    { status: turn.failed ? 502 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
