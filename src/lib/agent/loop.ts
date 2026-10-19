import { audit } from "@/lib/db/audit";
import { loadHistory } from "@/lib/db/chat";
import { loadSessionData, type SessionData } from "@/lib/db/queries";
import { sql } from "drizzle-orm";
import { chatMessages, toolCalls } from "@/lib/db/schema";
import type { ChatMessageView, ChatTurnResponse } from "@/lib/chat-types";
import { systemPrompt } from "./prompt";
import { checkReadability, ensureBoldLead } from "./readability";
import { buildTrace } from "./trace";
import { TOOL_BY_NAME, executeTool, toolDefinitions, type ToolContext, type TurnState } from "./tools";
import type { LlmClient, LlmMessage } from "./types";
import { correctionMessage, toVerification, verifyReply, type Verification, type VerifyResult } from "./verify";

export const HISTORY_MESSAGES = 20;
export const MAX_TOOL_ITERATIONS = 6;
const MAX_ITERATIONS_DEFAULT = MAX_TOOL_ITERATIONS;
export const FALLBACK_REPLY = "Sorry, the assistant is unavailable right now. Please try again in a moment.";
/** Internal reminder (never stored) when a reply lists limit changes but no proposal exists. */
export const PROPOSAL_NUDGE =
  "[internal check] Your reply lists budget limit changes, but no proposal exists. Call propose_budget_adjustment now with exactly those changes, then reply briefly using the tool's figures.";
const LISTS_LIMIT_CHANGES = /\$[\d,]+\.\d{2}\s*(→|->)\s*\$[\d,]+\.\d{2}/;
const ASKS_FOR_BUDGET_CHANGE = /\b(budget|save|saving|cut|trim|plan|limit|rebalance|lower|reduce)/i;

export type ToolLog = { toolName: string; input: unknown; output: unknown; ok: boolean; durationMs: number };

/**
 * One assistant turn (plan 8.1): last 20 messages + system prompt + tools; execute tool calls
 * server-side and feed results back, up to 6 tool iterations, then force a text answer.
 * Every tool call is logged. The user message and the reply are stored together at the end.
 */
export type TurnOptions = {
  /** Tool rounds before a text answer is forced (default 6; impact notes use 4). */
  maxToolIterations?: number;
  /**
   * Impact note (B1.3): the fixed prompt is stored hidden (kind impact_request) and the reply as kind
   * impact. Proposals are allowed only when an overrun has no rule-engine fix (blockProposals is the reason otherwise).
   */
  impact?: { blockProposals: string | null };
  /** Server-side steps done before the model runs (the impact note's fact check): logged, traced and verifiable like tool calls. */
  priorLogs?: ToolLog[];
};

export async function runAgentTurn(
  ctx: ToolContext & { appName: string },
  llm: LlmClient,
  message: string,
  opts: TurnOptions = {},
): Promise<ChatTurnResponse & { failed: boolean }> {
  const MAX_TOOL_ITERATIONS = opts.maxToolIterations ?? MAX_ITERATIONS_DEFAULT;
  const startedAt = Date.now();
  // A8: start loading the session's rows now, so the read tools find them ready after the first model call.
  let snap: Promise<SessionData> | null = loadSessionData(ctx.db, ctx.sessionId);
  snap.catch(() => {}); // a failed prefetch surfaces (and is retried) when a tool asks for it
  const snapshot = () => {
    snap = (snap ?? loadSessionData(ctx.db, ctx.sessionId)).catch((err) => {
      snap = null;
      throw err;
    });
    return snap;
  };
  const toolCtx: ToolContext = { ...ctx, snapshot };
  const history = await loadHistory(ctx.db, ctx.sessionId, HISTORY_MESSAGES);
  const messages: LlmMessage[] = [
    { role: "system", content: systemPrompt(ctx.appName, ctx.today) },
    ...history.map((h) => ({ role: h.role, content: h.content }) as LlmMessage),
    { role: "user", content: message },
  ];
  const tools = toolDefinitions();
  const state: TurnState = { proposal: null, blockProposals: opts.impact?.blockProposals ?? null };
  const logs: ToolLog[] = [...(opts.priorLogs ?? [])];
  const usage = { promptTokens: 0, completionTokens: 0, cost: 0, calls: 0 };
  const perCall: { finish: string | null; completion: number; reasoning: number; text_chars: number; tool_calls: number }[] = [];

  let reply: string | null = null;
  let failed = false;
  let nudged = false;
  let beforeNudge: string | null = null;
  let nudgePending = false;
  let retried = false;
  let firstAttempt: { text: string; check: VerifyResult } | null = null;
  let verification: Verification | null = null;
  const outputs = () => logs.map((l) => ({ tool: l.toolName, output: l.output }));
  // No nudge where proposals are blocked (an impact note with nothing the rule engine can't fix).
  const wantsChange = !state.blockProposals && ASKS_FOR_BUDGET_CHANGE.test(message);
  try {
    for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS && reply === null; iteration++) {
      const res = await llm.complete({ messages, tools, toolChoice: iteration < MAX_TOOL_ITERATIONS ? "auto" : "none" });
      usage.calls++;
      perCall.push({
        finish: res.finishReason ?? null,
        completion: res.usage?.completionTokens ?? 0,
        reasoning: res.usage?.reasoningTokens ?? 0,
        text_chars: res.content?.length ?? 0,
        tool_calls: res.toolCalls.length,
      });
      if (res.usage) {
        usage.promptTokens += res.usage.promptTokens;
        usage.completionTokens += res.usage.completionTokens;
        usage.cost += res.usage.cost ?? 0;
      }
      if (!res.toolCalls.length || iteration === MAX_TOOL_ITERATIONS) {
        const text = res.content?.trim() ?? "";
        if (wantsChange && !state.proposal && !nudged && iteration < MAX_TOOL_ITERATIONS && LISTS_LIMIT_CHANGES.test(text)) {
          // The model described changes without proposing them: ask once for the tool call.
          nudged = true;
          nudgePending = true;
          beforeNudge = text;
          messages.push({ role: "assistant", content: text }, { role: "user", content: PROPOSAL_NUDGE });
          continue;
        }
        // If the reminder didn't produce a proposal, keep the original answer rather than a reply to the reminder.
        let candidate = (nudgePending && !state.proposal && beforeNudge) || text || "I couldn't produce an answer from the available data.";
        nudgePending = false;
        let check = verifyReply(candidate, outputs(), message);
        if (!check.all_matched && !retried && iteration < MAX_TOOL_ITERATIONS) {
          // One correction turn (A4): name the ungrounded figures and ask for a grounded rewrite.
          retried = true;
          firstAttempt = { text: candidate, check };
          messages.push({ role: "assistant", content: candidate }, { role: "user", content: correctionMessage(check) });
          continue;
        }
        // Never silently drop a reply: keep whichever attempt has fewer ungrounded figures.
        const unmatched = (r: VerifyResult) => r.total_count - r.verified_count;
        if (firstAttempt && unmatched(firstAttempt.check) < unmatched(check)) ({ text: candidate, check } = firstAttempt);
        reply = ensureBoldLead(candidate);
        verification = toVerification(check, retried);
        break;
      }
      messages.push({
        role: "assistant",
        content: res.content,
        tool_calls: res.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })),
      });
      // A8: read tools from one model response run in parallel; proposals run after them, one at a time.
      // Results are logged and fed back in the order the model asked for them.
      const timed = async (call: (typeof res.toolCalls)[number]) => {
        const started = Date.now();
        const result = await executeTool(toolCtx, call.name, call.arguments, state);
        return { call, result, durationMs: Date.now() - started };
      };
      const isRead = (name: string) => TOOL_BY_NAME.get(name)?.kind === "read";
      const reads = await Promise.all(res.toolCalls.filter((c) => isRead(c.name)).map(timed));
      const writes = [];
      for (const call of res.toolCalls.filter((c) => !isRead(c.name))) writes.push(await timed(call));
      const done = new Map([...reads, ...writes].map((r) => [r.call.id, r]));
      for (const call of res.toolCalls) {
        const { result, durationMs } = done.get(call.id)!;
        logs.push({ toolName: call.name, input: result.input, output: result.output, ok: result.ok, durationMs });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result.output) });
      }
    }
  } catch (err) {
    console.error("agent turn failed", (err as Error).message);
    failed = true;
    reply = FALLBACK_REPLY;
    verification = null;
  }
  if (!failed && !verification) verification = toVerification(verifyReply(reply!, outputs(), message), retried);

  const turnMs = Date.now() - startedAt;
  const saved = await ctx.db.transaction(async (tx) => {
    const [user] = await tx
      .insert(chatMessages)
      .values({ sessionId: ctx.sessionId, role: "user", content: message, kind: opts.impact ? "impact_request" : "chat" })
      .returning();
    const [assistant] = await tx
      .insert(chatMessages)
      .values({
        sessionId: ctx.sessionId,
        role: "assistant",
        kind: opts.impact ? "impact" : "chat",
        content: reply!,
        actionId: state.proposal?.id ?? null,
        verification,
        turnMs,
        createdAt: new Date(user.createdAt.getTime() + 1),
      })
      .returning();
    if (logs.length) {
      // clock_timestamp() per row keeps the calls in the order they ran (the receipts panel lists them).
      await tx.insert(toolCalls).values(logs.map((l) => ({ sessionId: ctx.sessionId, messageId: assistant.id, ...l, createdAt: sql`clock_timestamp()` })));
    }
    await audit(tx, ctx.sessionId, ctx.epoch, "chat_message", {
      message_id: assistant.id,
      model: llm.model,
      tools: logs.map((l) => l.toolName),
      model_calls: usage.calls,
      proposal_nudge: nudged,
      calls: perCall,
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      cost_usd: Math.round(usage.cost * 1e6) / 1e6,
      failed,
      proposal_id: state.proposal?.id ?? null,
      // B2.3: logged only (no retry; the verifier owns the one retry). Issue kinds, never the text.
      readability: failed ? null : readabilitySummary(reply!),
    });
    if (verification) {
      // Counts only, never the reply text.
      await audit(tx, ctx.sessionId, ctx.epoch, verification.all_matched ? "reply_verified" : "reply_unverified", {
        message_id: assistant.id,
        verified_count: verification.verified_count,
        total_count: verification.total_count,
        retried: verification.retried,
      });
    }
    return { user, assistant };
  });

  const view = (r: typeof saved.user): ChatMessageView => ({
    id: r.id,
    role: r.role,
    kind: r.kind,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    proposal: r.actionId && state.proposal?.id === r.actionId ? state.proposal : null,
    verification: (r.verification as Verification | null) ?? null,
    trace: r.role === "assistant" ? buildTrace(logs) : [],
    turnMs: r.turnMs ?? null,
  });
  return { user: view(saved.user), reply: view(saved.assistant), proposal: state.proposal, failed };
}

function readabilitySummary(reply: string) {
  const r = checkReadability(reply);
  return { ok: r.ok, issues: r.issues.map((i) => i.kind) };
}
