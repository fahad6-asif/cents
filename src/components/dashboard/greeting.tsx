"use client";

import { useSyncExternalStore } from "react";

// The greeting word follows the viewer's real local clock (plan Section 2); the server render
// falls back to "Good afternoon" and the client corrects it after hydration.
function partOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const subscribe = () => () => {};

export function Greeting({ name }: { name: string }) {
  const word = useSyncExternalStore(subscribe, partOfDay, () => "Good afternoon");
  return (
    <h1 className="text-[28px] leading-[1.2] font-semibold tracking-[-0.02em] text-text md:text-[32px]">
      {word}, {name}
    </h1>
  );
}
