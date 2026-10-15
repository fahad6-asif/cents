"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatUSD } from "@/lib/domain/money";
import { SIM_EVENTS } from "@/lib/sim-events";
import { cn } from "@/lib/utils";

// Phase 1: menu UI only. Wired to POST /api/simulate and /api/reset in Phase 5.
export function SimulateMenu({ className }: { className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn(
            "h-[43px] rounded-[9px] border-0 bg-brand px-[18px] text-[14px] font-semibold text-white hover:bg-brand-hover",
            className,
          )}
        >
          Simulate transaction
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-[12px] border-line bg-surface p-1.5">
        <DropdownMenuLabel className="text-[12px] font-normal text-text-muted">
          Add a simulated bank event
        </DropdownMenuLabel>
        {SIM_EVENTS.map((event) => (
          <DropdownMenuItem key={event.id} className="flex justify-between gap-4 rounded-[8px] px-2.5 py-2 text-[14px]">
            <span>{event.label}</span>
            <span className={cn("tabular", event.amountCents > 0 ? "text-brand" : "text-text-muted")}>
              {formatUSD(event.amountCents, { plus: true })}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="bg-line" />
        <DropdownMenuItem className="gap-2 rounded-[8px] px-2.5 py-2 text-[14px] text-danger focus:text-danger">
          <RotateCcw className="size-4" strokeWidth={1.75} />
          Reset demo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
