"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

  async function reset() {
    setBusy(true);
    try {
      const res = await postJson<{ overview: OverviewData }>("/api/reset");
      toast.success("Demo reset", { description: "The simulated account is back to its starting state." });
      emitDataChanged({ overview: res.overview });
      router.refresh();
    } catch (err) {
      toast.error("Reset failed", { description: (err as Error).message });
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
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
              className="flex justify-between gap-4 rounded-[8px] px-2.5 py-2 text-[14px]"
            >
              <span>{event.label}</span>
              <span className={cn("tabular", event.amountCents > 0 ? "text-brand" : "text-text-muted")}>
                {formatUSD(event.amountCents, { plus: true })}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="bg-line" />
          <DropdownMenuItem
            onSelect={() => setConfirmReset(true)}
            className="gap-2 rounded-[8px] px-2.5 py-2 text-[14px] text-danger focus:text-danger"
          >
            <RotateCcw className="size-4" strokeWidth={1.75} />
            Reset demo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className="rounded-[14px] border-line bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the demo?</AlertDialogTitle>
            <AlertDialogDescription>
              Simulated transactions, alerts, proposals and the chat are cleared and the account returns to its starting
              state. The action log is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-[9px] border-line">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void reset();
              }}
              className="rounded-[9px] bg-brand text-white hover:bg-brand-hover"
            >
              Reset demo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
