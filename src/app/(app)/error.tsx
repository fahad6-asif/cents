"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-[1240px]">
      <div className="card flex flex-col items-start gap-3 p-6">
        <h1 className="text-[16px] font-semibold text-text">Something went wrong loading your account</h1>
        <p className="text-[14px] text-text-muted">
          The simulated account couldn&apos;t be loaded. This is usually temporary.
        </p>
        <Button
          onClick={reset}
          className="h-10 rounded-[9px] border-0 bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-hover"
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
