"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLine, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { emitDataChanged, postJson } from "@/lib/client-events";
import { formatUSD } from "@/lib/domain/money";
import type { OverviewData } from "@/lib/overview-types";
import { SIM_EVENTS, type SimEventId } from "@/lib/sim-events";
import { cn } from "@/lib/utils";
import { ResetDemoDialog } from "@/components/shell/reset-demo-button";
import { CustomTransactionDialog } from "./custom-txn-dialog";

type SimulateResponse = {
  replayed: boolean;
  transaction: { merchant: string; amountCents: number };
  alerts: { created: string[]; resolved: string[] } | null;
  overview: OverviewData;
};

export function SimulateMenu({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  async function simulate(eventId: SimEventId) {
    setBusy(true);
    try {
      // One idempotency key per click: a retried request can never insert twice.
      const res = await postJson<SimulateResponse>("/api/simulate", { eventId, idempotencyKey: crypto.randomUUID() });
      const created = res.alerts?.created.length ?? 0;
      toast.success(`${res.transaction.merchant} ${formatUSD(res.transaction.amountCents, { plus: true })} added`, {
        description: created ? `${created} new alert${created > 1 ? "s" : ""}` : "Simulated transaction",
      });
      emitDataChanged({ overview: res.overview });
      router.refresh();
    } catch (err) {
      toast.error("Couldn't simulate that transaction", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            disabled={busy}
            className={cn(
              "h-[43px] rounded-[9px] border-0 bg-brand px-[18px] text-[14px] font-semibold text-white hover:bg-brand-hover",
              className,
            )}
          >
            Simulate transaction
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 rounded-[12px] border-line bg-surface p-1.5">
          <DropdownMenuLabel className="text-[12px] font-normal text-text-muted">Add a simulated bank event</DropdownMenuLabel>
          {SIM_EVENTS.map((event) => (
            <DropdownMenuItem
              key={event.id}
              onSelect={() => simulate(event.id)}
              aria-label={`${event.label} ${formatUSD(event.amountCents, { plus: true })}`}
              className="flex w-full cursor-pointer justify-between gap-4 rounded-[8px] px-2.5 py-2 text-[14px] focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>{event.label}</span>
              <span className={cn("tabular", event.amountCents > 0 ? "text-brand" : "text-text-muted")}>
                {formatUSD(event.amountCents, { plus: true })}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="bg-line" />
          <DropdownMenuItem
            // Open after the menu has closed, so focus and pointer handling hand over cleanly.
            onSelect={() => setTimeout(() => setCustomOpen(true), 0)}
            className="w-full cursor-pointer gap-2 rounded-[8px] px-2.5 py-2 text-[14px] focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PencilLine className="size-4" strokeWidth={1.75} />
            Custom transaction…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setConfirmReset(true)}
            className="w-full cursor-pointer gap-2 rounded-[8px] px-2.5 py-2 text-[14px] text-danger focus:text-danger focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw className="size-4" strokeWidth={1.75} />
            Reset demo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResetDemoDialog open={confirmReset} onOpenChange={setConfirmReset} />
      <CustomTransactionDialog open={customOpen} onOpenChange={setCustomOpen} returnFocus={trigger} />
    </>
  );
}
