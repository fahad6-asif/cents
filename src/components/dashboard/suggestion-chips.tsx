"use client";

export const SUGGESTIONS = [
  "Where did my money go this week?",
  "Can I afford a $900 purchase?",
  "Find my subscriptions",
  "Analyze my bills",
  "Plan next month’s budget",
];

export function SuggestionChips({ onPick, disabled }: { onPick?: (text: string) => void; disabled?: boolean }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
      {SUGGESTIONS.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onPick?.(text)}
          disabled={disabled}
          className="h-11 shrink-0 rounded-full border border-line px-[17px] text-[14px] whitespace-nowrap text-text transition-colors hover:bg-surface disabled:opacity-60"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
