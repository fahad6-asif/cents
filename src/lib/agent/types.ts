// Provider-agnostic message shapes (OpenAI chat format, which OpenRouter speaks).

export type LlmToolCall = { id: string; name: string; arguments: string };

export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export type LlmRequest = {
  messages: LlmMessage[];
  tools: unknown[];
  toolChoice: "auto" | "none";
};

export type LlmResponse = {
  content: string | null;
  toolCalls: LlmToolCall[];
  usage: { promptTokens: number; completionTokens: number; cost: number | null; reasoningTokens?: number } | null;
  finishReason?: string | null;
};

export type LlmClient = {
  model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
};
