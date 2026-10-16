"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { monthName } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";

const selectClass =
  "h-10 rounded-[9px] border border-line bg-surface px-3 text-[14px] text-text outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Search + month + category filters, kept in the URL so views are shareable and server-rendered. */
export function TransactionFilters({ months, categories, month }: { months: string[]; categories: string[]; month: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }

  // Debounced search.
  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => update("q", q.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row", pending && "opacity-70")}>
      <label className="relative flex-1">
        <span className="sr-only">Search transactions</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" strokeWidth={1.75} />
        <input
          value={q}
          maxLength={100}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search merchant or category"
          className={cn(selectClass, "w-full pl-9 placeholder:text-placeholder")}
        />
      </label>
      <div className="flex gap-2">
        <label className="flex-1 sm:flex-none">
          <span className="sr-only">Month</span>
          <select aria-label="Month" value={month} onChange={(e) => update("month", e.target.value)} className={cn(selectClass, "w-full")}>
            <option value="all">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthName(m)} {m.slice(0, 4)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 sm:flex-none">
          <span className="sr-only">Category</span>
          <select aria-label="Category" value={params.get("category") ?? ""} onChange={(e) => update("category", e.target.value)} className={cn(selectClass, "w-full")}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
