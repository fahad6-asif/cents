import { TrendingUp } from "lucide-react";
import { APP_NAME } from "@/lib/brand";

export function BrandMark() {
  return (
    <div className="flex items-center gap-[11px]">
      <span className="flex size-7 items-center justify-center rounded-[7px] bg-text text-white">
        <TrendingUp className="size-4" strokeWidth={2} aria-hidden />
      </span>
      <span className="text-[16px] font-medium tracking-[-0.01em] text-text">{APP_NAME}</span>
    </div>
  );
}
