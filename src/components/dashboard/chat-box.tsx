"use client";

import { ArrowRight, Sparkle } from "lucide-react";

// Phase 1: static shell in its mandated position. Conversation behavior arrives in Phase 6.
export function ChatBox() {
  return (
    <section aria-label="Assistant" className="card flex min-h-[130px] flex-col pt-[25px] pr-[15px] pb-[14px] pl-5">
      <textarea
        rows={1}
        placeholder="Ask anything about your money"
        className="w-full resize-none bg-transparent pr-1 text-[18px] leading-[24px] text-text outline-none placeholder:text-placeholder"
      />
      <div className="mt-auto flex items-center justify-between pt-2">
        <div className="flex items-center gap-2 text-[13px] text-text-muted">
          <Sparkle className="size-[14px] text-brand" strokeWidth={1.75} aria-hidden />
          Assistant
        </div>
        <button
          type="button"
          aria-label="Send"
          className="flex size-[43px] items-center justify-center rounded-[9px] bg-brand text-white transition-colors hover:bg-brand-hover"
        >
          <ArrowRight className="size-[18px]" strokeWidth={2} />
        </button>
      </div>
    </section>
  );
}
