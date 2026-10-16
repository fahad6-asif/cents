"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { emitDataChanged, postJson } from "@/lib/client-events";

/** "Not now" for an active alert on the Insights page (also rejects its pending proposal). */
export function DismissAlertButton({ alertId }: { alertId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await postJson(`/api/alerts/${alertId}/dismiss`);
          toast("Alert dismissed");
          emitDataChanged();
        } catch (err) {
          toast.error("Couldn't dismiss", { description: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }}
      className="h-8 rounded-[8px] border-line bg-surface px-3 text-[13px] font-medium text-text hover:bg-muted-fill"
    >
      Not now
    </Button>
  );
}
