"use client";

import type { RefObject } from "react";
import { ArrowRight, Sparkle } from "lucide-react";

type Props = {
  draft?: string;
  onDraftChange?: (value: string) => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
};

// Phase 5: controlled draft (Worth a look can prefill it). Sending + the thread arrive in Phase 6.
export function ChatBox({ draft, onDraftChange, inputRef }: Props) {
  return (
    <section aria-label="Assistant" className="card flex min-h-[130px] flex-col pt-[25px] pr-[15px] pb-[14px] pl-5">
      <textarea
        ref={inputRef}
        rows={1}
        value={draft}
        onChange={(e) => onDraftChange?.(e.target.value)}
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
