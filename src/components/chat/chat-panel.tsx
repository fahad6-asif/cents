"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkle } from "lucide-react";
import { toast } from "sonner";
import { SuggestionChips } from "@/components/dashboard/suggestion-chips";
import type { ChatMessageView, ChatTurnResponse } from "@/lib/chat-types";
import { DATA_CHANGED } from "@/lib/client-events";
import { IMPACT_DONE, IMPACT_FAILED, IMPACT_PENDING, IMPACT_UNAVAILABLE } from "@/lib/impact-client";
import { cn } from "@/lib/utils";
import { ProposalCard } from "./proposal-card";
import { MessageContent } from "./message-content";
import { TurnReceipts } from "./turn-receipts";

/** Other components ask the assistant by dispatching this event with the question text. */
export const ASK_EVENT = "cents:ask";
export function askAssistant(text: string) {
  window.dispatchEvent(new CustomEvent<string>(ASK_EVENT, { detail: text }));
}

type Props = { initialMessages: ChatMessageView[]; variant?: "card" | "page" };

/**
 * The assistant chat. "card" is the centered Overview chatbox (grows to ~560px, then scrolls);
 * "page" fills the Assistant page. Both share the same stored thread.
 */
export function ChatPanel({ initialMessages, variant = "card" }: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeMuted, setNoticeMuted] = useState(false);
  const [impactPending, setImpactPending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const hasThread = messages.length > 0 || sending || impactPending;
  // The impact note's fixed prompt is stored for the model's context but never shown.
  const visible = messages.filter((m) => m.kind !== "impact_request");

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, impactPending]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || sending) return;
      setSending(true);
      setNotice(null);
      setNoticeMuted(false);
      setDraft("");
      const optimistic: ChatMessageView = { id: `tmp-${Date.now()}`, role: "user", content: message, createdAt: new Date().toISOString(), kind: "chat", proposal: null, verification: null, trace: [], turnMs: null };
      setMessages((m) => [...m, optimistic]);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.status === 429 || (!res.ok && !body.reply)) {
          setMessages((m) => m.filter((x) => x.id !== optimistic.id));
          setDraft(message);
          setNotice(body.error ?? "The assistant couldn't answer. Please try again.");
          return;
        }
        const turn = body as ChatTurnResponse;
        setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), turn.user, turn.reply]);
      } catch {
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        setDraft(message);
        setNotice("Network error. Please try again.");
      } finally {
        setSending(false);
        input.current?.focus();
      }
    },
    [sending],
  );

  useEffect(() => {
    const onAsk = (e: Event) => void send((e as CustomEvent<string>).detail);
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, [send]);

  // Proposals can be decided elsewhere (Worth a look, Budgets page): refresh card states.
  useEffect(() => {
    const refresh = async () => {
      const res = await fetch("/api/chat", { cache: "no-store" });
      if (res.ok) setMessages((await res.json()).messages);
    };
    window.addEventListener(DATA_CHANGED, refresh);
    return () => window.removeEventListener(DATA_CHANGED, refresh);
  }, []);

  // AI impact notes after custom transactions (B1.3): typing while queued, the note when it arrives.
  useEffect(() => {
    const onPending = () => {
      setImpactPending(true);
      setNotice(null);
    };
    const onDone = (e: Event) => {
      const turn = (e as CustomEvent<ChatTurnResponse>).detail;
      setImpactPending(false);
      setMessages((m) => (m.some((x) => x.id === turn.reply.id) ? m : [...m, turn.user, turn.reply]));
    };
    const onFailed = () => {
      setImpactPending(false);
      setNoticeMuted(true);
      setNotice(IMPACT_UNAVAILABLE);
    };
    window.addEventListener(IMPACT_PENDING, onPending);
    window.addEventListener(IMPACT_DONE, onDone);
    window.addEventListener(IMPACT_FAILED, onFailed);
    return () => {
      window.removeEventListener(IMPACT_PENDING, onPending);
      window.removeEventListener(IMPACT_DONE, onDone);
      window.removeEventListener(IMPACT_FAILED, onFailed);
    };
  }, []);

  async function clear() {
    const res = await fetch("/api/chat", { method: "DELETE" });
    if (res.ok) {
      setMessages([]);
      setNotice(null);
    } else toast.error("Couldn't clear the conversation");
  }

  return (
    <div className={cn("flex flex-col", variant === "page" && "min-h-0 flex-1")}>
      <section
        aria-label="Assistant"
        className={cn(
          "card flex flex-col pt-[25px] pr-[15px] pb-[14px] pl-5",
          variant === "card" ? "min-h-[130px]" : "min-h-[420px] flex-1",
          hasThread && "pt-4",
        )}
      >
        {hasThread && (
          <>
            <div className="flex items-center justify-end gap-4 pb-2 text-[13px]">
              <button type="button" onClick={clear} disabled={sending} className="text-text-muted hover:text-text">
                Clear
              </button>
              {variant === "card" && (
                <Link href="/assistant" className="font-medium text-brand hover:underline">
                  Open full view
                </Link>
              )}
            </div>
            <div
              ref={scroller}
              data-testid="chat-thread"
              className={cn(
                "-mr-[5px] flex flex-col gap-4 overflow-y-auto pr-[5px] pb-4",
                variant === "card" ? "max-h-[420px]" : "min-h-0 flex-1",
              )}
            >
              {visible.map((msg) =>
                msg.role === "user" ? (
                  <div key={msg.id} className="flex justify-end">
                    <p className="max-w-[80%] rounded-[14px] bg-muted-fill px-4 py-2.5 text-[15px] leading-[22px] whitespace-pre-wrap text-text">
                      {msg.content}
                    </p>
                  </div>
                ) : (
                  <div key={msg.id} data-testid="assistant-message" className="flex gap-3">
                    <Sparkle className="mt-1 size-[14px] shrink-0 text-brand" strokeWidth={1.75} aria-hidden />
                    <div className="flex min-w-0 flex-1 flex-col gap-3 text-[15px] leading-[22px] text-text">
                      {msg.kind === "impact" && (
                        <span data-testid="impact-chip" className="w-fit rounded-full bg-muted-fill px-2.5 py-0.5 text-[12px] leading-[18px] font-medium text-brand">
                          Impact of new transaction
                        </span>
                      )}
                      <MessageContent text={msg.content} />
                      {msg.proposal && <ProposalCard key={`${msg.proposal.id}-${msg.proposal.status}`} proposal={msg.proposal} />}
                      <TurnReceipts trace={msg.trace} verification={msg.verification} turnMs={msg.turnMs} />
                    </div>
                  </div>
                ),
              )}
              {(sending || impactPending) && (
                <div data-testid="typing" className="flex items-center gap-3" aria-live="polite">
                  <Sparkle className="size-[14px] text-brand" strokeWidth={1.75} aria-hidden />
                  <span className="flex gap-1">
                    {[0, 150, 300].map((d) => (
                      <span key={d} className="size-1.5 animate-bounce rounded-full bg-text-muted" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </span>
                  {impactPending && !sending ? (
                    <span data-testid="impact-pending" className="text-[13px] text-text-muted">
                      Re-evaluating with AI…
                    </span>
                  ) : (
                    <span className="sr-only">Assistant is typing</span>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <textarea
          ref={input}
          rows={1}
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(draft);
            }
          }}
          placeholder="Ask anything about your money"
          aria-label="Ask anything about your money"
          className={cn(
            "max-h-40 w-full resize-none bg-transparent pr-1 text-[18px] leading-[24px] text-text outline-none [field-sizing:content] placeholder:text-placeholder",
            hasThread && "border-t border-line pt-3 text-[16px]",
          )}
        />
        {notice && (
          <p role="status" data-testid="chat-notice" className={cn("mt-2 text-[13px]", noticeMuted ? "text-text-muted" : "text-danger")}>
            {notice}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-[13px] text-text-muted">
            <Sparkle className="size-[14px] text-brand" strokeWidth={1.75} aria-hidden />
            Assistant
          </div>
          <button
            type="button"
            aria-label="Send"
            onClick={() => void send(draft)}
            disabled={sending}
            className="flex size-[43px] items-center justify-center rounded-[9px] bg-brand text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            <ArrowRight className="size-[18px]" strokeWidth={2} />
          </button>
        </div>
      </section>
      <div className="mt-4">
        <SuggestionChips onPick={(text) => void send(text)} disabled={sending} />
      </div>
    </div>
  );
}
