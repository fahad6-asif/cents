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
import { emitDataChanged, postJson } from "@/lib/client-events";
import type { OverviewData } from "@/lib/overview-types";

/** Confirm dialog + POST /api/reset. `open`/`onOpenChange` let a menu item open it. */
export function ResetDemoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

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
      onOpenChange(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-[14px] border-line bg-surface">
        <AlertDialogHeader>
          <AlertDialogTitle>Reset the demo?</AlertDialogTitle>
          <AlertDialogDescription>
            Simulated transactions, alerts, proposals and the chat are cleared and the account returns to its starting state. The action
            log is kept.
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
  );
}

export function ResetDemoButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-10 rounded-[9px] border-line bg-surface px-4 text-[14px] font-medium text-danger hover:bg-danger-fill"
      >
        <RotateCcw className="size-4" strokeWidth={1.75} />
        Reset demo
      </Button>
      <ResetDemoDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
