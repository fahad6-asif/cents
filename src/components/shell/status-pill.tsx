import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-muted-fill text-text",
  brand: "bg-brand/10 text-brand",
  warning: "bg-warning-fill text-warning",
  danger: "bg-danger-fill text-danger",
} as const;

export function StatusPill({ tone = "neutral", children, className }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[21px] items-center rounded-full px-[10px] text-[12px] whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}
