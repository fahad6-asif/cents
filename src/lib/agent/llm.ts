import "server-only";
import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { APP_NAME } from "@/lib/brand";
import type { LlmClient, LlmRequest, LlmResponse } from "./types";

export const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";

export function modelName(): string {
  return process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
}

let client: OpenAI | undefined;

/** OpenRouter via its OpenAI-compatible API. The key never leaves the server. */
export function openRouterClient(): LlmClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  client ??= new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: 45_000,
    maxRetries: 1,
    defaultHeaders: { "X-Title": APP_NAME },
  });
  const model = modelName();

  return {
    model,
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const [system, ...rest] = req.messages;
      const params = {
        model,
        // Hidden reasoning counts against max_tokens and truncated answers; plain answers suffice here.
        max_tokens: 1500,
        reasoning: { enabled: false },
        tools: req.tools,
        tool_choice: req.toolChoice,
        // Anthropic prompt caching through OpenRouter: the system prompt + tools prefix is reused.
        messages: [
          { role: "system", content: [{ type: "text", text: system.content, cache_control: { type: "ephemeral" } }] },
          ...rest,
        ],
        usage: { include: true },
      } as unknown as ChatCompletionCreateParamsNonStreaming;
      const res = await client!.chat.completions.create(params);
      const choice = res.choices[0];
      const usage = res.usage as
        | (typeof res.usage & { cost?: number; completion_tokens_details?: { reasoning_tokens?: number } })
        | undefined;
      return {
        finishReason: choice?.finish_reason ?? null,
        content: choice?.message?.content ?? null,
        toolCalls: (choice?.message?.tool_calls ?? [])
          .filter((c) => c.type === "function")
          .map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments })),
        usage: usage
          ? {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              cost: usage.cost ?? null,
              reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
            }
          : null,
      };
    },
  };
}
