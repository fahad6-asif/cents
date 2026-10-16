import { audit } from "@/lib/db/audit";
import { loadHistory } from "@/lib/db/chat";
import { chatMessages, toolCalls } from "@/lib/db/schema";
import type { ChatMessageView, ChatTurnResponse } from "@/lib/chat-types";
import { systemPrompt } from "./prompt";
import { executeTool, toolDefinitions, type ToolContext, type TurnState } from "./tools";
import type { LlmClient, LlmMessage } from "./types";

export const HISTORY_MESSAGES = 20;
export const MAX_TOOL_ITERATIONS = 6;
export const FALLBACK_REPLY = "Sorry, the assistant is unavailable right now. Please try again in a moment.";
/** Internal reminder (never stored) when a reply lists limit changes but no proposal exists. */
export const PROPOSAL_NUDGE =
  "[internal check] Your reply lists budget limit changes, but no proposal exists. Call propose_budget_adjustment now with exactly those changes, then reply briefly using the tool's figures.";
const LISTS_LIMIT_CHANGES = /\$[\d,]+\.\d{2}\s*(→|->)\s*\$[\d,]+\.\d{2}/;
const ASKS_FOR_BUDGET_CHANGE = /\b(budget|save|saving|cut|trim|plan|limit|rebalance|lower|reduce)/i;

type ToolLog = { toolName: string; input: unknown; output: unknown; ok: boolean; durationMs: number };

/**
 * One assistant turn (plan 8.1): last 20 messages + system prompt + tools; execute tool calls
 * server-side and feed results back, up to 6 tool iterations, then force a text answer.
 * Every tool call is logged. The user message and the reply are stored together at the end.
 */
export async function runAgentTurn(
  ctx: ToolContext & { appName: string },
  llm: LlmClient,
  message: string,
): Promise<ChatTurnResponse & { failed: boolean }> {
  const history = await loadHistory(ctx.db, ctx.sessionId, HISTORY_MESSAGES);
  const messages: LlmMessage[] = [
    { role: "system", content: systemPrompt(ctx.appName, ctx.today) },
    ...history.map((h) => ({ role: h.role, content: h.content }) as LlmMessage),
    { role: "user", content: message },
  ];
  const tools = toolDefinitions();
  const state: TurnState = { proposal: null };
  const logs: ToolLog[] = [];
  const usage = { promptTokens: 0, completionTokens: 0, cost: 0, calls: 0 };
  const perCall: { finish: string | null; completion: number; reasoning: number; text_chars: number; tool_calls: number }[] = [];

  let reply: string | null = null;
  let failed = false;
  let nudged = false;
  let beforeNudge: string | null = null;
  const wantsChange = ASKS_FOR_BUDGET_CHANGE.test(message);
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
          beforeNudge = text;
          messages.push({ role: "assistant", content: text }, { role: "user", content: PROPOSAL_NUDGE });
          continue;
        }
        // If the reminder didn't produce a proposal, keep the original answer rather than a reply to the reminder.
        reply = (nudged && !state.proposal && beforeNudge) || text || "I couldn't produce an answer from the available data.";
        break;
      }
      messages.push({
        role: "assistant",
        content: res.content,
        tool_calls: res.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })),
      });
      for (const call of res.toolCalls) {
        const started = Date.now();
        const result = await executeTool(ctx, call.name, call.arguments, state);
        logs.push({ toolName: call.name, input: result.input, output: result.output, ok: result.ok, durationMs: Date.now() - started });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result.output) });
      }
    }
  } catch (err) {
    console.error("agent turn failed", (err as Error).message);
    failed = true;
    reply = FALLBACK_REPLY;
  }

  const saved = await ctx.db.transaction(async (tx) => {
    const [user] = await tx.insert(chatMessages).values({ sessionId: ctx.sessionId, role: "user", content: message }).returning();
    const [assistant] = await tx
      .insert(chatMessages)
      .values({
        sessionId: ctx.sessionId,
        role: "assistant",
        content: reply!,
        actionId: state.proposal?.id ?? null,
        createdAt: new Date(user.createdAt.getTime() + 1),
      })
      .returning();
    if (logs.length) {
      await tx.insert(toolCalls).values(logs.map((l) => ({ sessionId: ctx.sessionId, messageId: assistant.id, ...l })));
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
    });
    return { user, assistant };
  });

  const view = (r: typeof saved.user): ChatMessageView => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    proposal: r.actionId && state.proposal?.id === r.actionId ? state.proposal : null,
  });
  return { user: view(saved.user), reply: view(saved.assistant), proposal: state.proposal, failed };
}
