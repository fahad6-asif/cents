"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DATA_CHANGED } from "@/lib/client-events";

/** Re-renders server pages after any state change (approve, reject, dismiss, simulate, reset). */
export function RefreshOnDataChange() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener(DATA_CHANGED, refresh);
    return () => window.removeEventListener(DATA_CHANGED, refresh);
  }, [router]);
  return null;
}
