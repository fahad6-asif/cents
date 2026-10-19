"use client";

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { emitDataChanged, postJson } from "@/lib/client-events";
import { CATEGORIES } from "@/lib/domain/categories";
import { formatUSD } from "@/lib/domain/money";
import { CUSTOM_MAX_CENTS, CUSTOM_MERCHANT_MAX, parseAmountToCents } from "@/lib/engine/simulate-rules";
import { queueImpactNote } from "@/lib/impact-client";
import type { OverviewData } from "@/lib/overview-types";
import { cn } from "@/lib/utils";

type BudgetRow = { category: string; limitCents: number; spentCents: number };
type SimulateResponse = { transaction: { id: string; merchant: string; amountCents: number }; overview: OverviewData };
type TxnType = "expense" | "income";

/** Display-only preview from the loaded budgets; the server stays the source of truth. */
function previewLine(type: TxnType, category: string, cents: number | null, budgets: BudgetRow[] | null) {
  if (cents === null) return null;
  if (type === "income") return { text: `Income this month: ${formatUSD(cents, { plus: true })}`, tone: "ok" as const };
  const b = budgets?.find((x) => x.category === category);
  if (!category || !b) return null;
  const after = b.spentCents + cents;
  const pct = b.limitCents > 0 ? Math.round((after * 100) / b.limitCents) : 100;
  return {
    text: `${category}: ${formatUSD(b.spentCents)} → ${formatUSD(after)} of ${formatUSD(b.limitCents)} (${pct}%)`,
    tone: pct > 100 ? ("over" as const) : pct >= 80 ? ("warn" as const) : ("ok" as const),
  };
}

export function CustomTransactionDialog({ open, onOpenChange, returnFocus }: { open: boolean; onOpenChange: (open: boolean) => void; returnFocus: RefObject<HTMLButtonElement | null> }) {
  const router = useRouter();
  const ids = { amount: useId(), amountErr: useId(), merchant: useId(), merchantCount: useId(), category: useId(), categoryErr: useId(), preview: useId() };
  const [type, setType] = useState<TxnType>("expense");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [reevaluate, setReevaluate] = useState(true);
  const [touched, setTouched] = useState({ amount: false, category: false });
  const [busy, setBusy] = useState(false);
  const [budgets, setBudgets] = useState<BudgetRow[] | null>(null);
  // One idempotency key per dialog submission: a retried request never inserts twice.
  const idemKey = useRef<string>("");

  useEffect(() => {
    if (!open) return;
    idemKey.current = crypto.randomUUID();
    let live = true;
    fetch("/api/budgets", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setBudgets(d?.budgets ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open]);

  function reset() {
    setType("expense");
    setCategory("");
    setAmount("");
    setMerchant("");
    setReevaluate(true);
    setTouched({ amount: false, category: false });
  }

  const cents = parseAmountToCents(amount);
  const amountError =
    amount.trim() === "" ? "Enter an amount" : cents === null ? "Use a number with up to 2 decimals" : cents < 1 || cents > CUSTOM_MAX_CENTS ? "Amount must be between $0.01 and $10,000.00" : null;
  const categoryError = type === "expense" && !category ? "Pick a category" : null;
  const valid = !amountError && !categoryError && merchant.trim().length <= CUSTOM_MERCHANT_MAX;
  const preview = useMemo(() => previewLine(type, category, amountError ? null : cents, budgets), [type, category, cents, amountError, budgets]);

  async function submit() {
    setTouched({ amount: true, category: true });
    if (!valid || busy) return;
    setBusy(true);
    try {
      const res = await postJson<SimulateResponse>("/api/simulate", {
        kind: "custom",
        type,
        ...(type === "expense" ? { category } : {}),
        amountCents: cents,
        ...(merchant.trim() ? { merchant: merchant.trim() } : {}),
        idempotencyKey: idemKey.current,
      });
      toast.success("Transaction added", { description: `${res.transaction.merchant} ${formatUSD(res.transaction.amountCents, { plus: true })}` });
      onOpenChange(false);
      reset();
      emitDataChanged({ overview: res.overview });
      router.refresh();
      if (reevaluate) queueImpactNote(res.transaction.id);
    } catch (err) {
      toast.error("Couldn't add that transaction", { description: (err as Error).message });
      idemKey.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = "h-11 w-full rounded-[9px] border border-line bg-surface px-3 text-[16px] text-text outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (onOpenChange(o), o ? null : reset())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-testid="custom-txn-dialog"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            returnFocus.current?.focus();
          }}
          className={cn(
            "fixed z-50 flex max-h-[92dvh] flex-col gap-4 overflow-y-auto border border-line bg-surface p-5 shadow-lg outline-none",
            // Bottom sheet on phones, centered card from 768px.
            "inset-x-0 bottom-0 rounded-t-[16px]",
            "md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[16px]",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogPrimitive.Title className="text-[17px] font-semibold text-text">Custom transaction</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-[13px] text-text-muted">Adds a simulated transaction and re-checks your budgets.</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close aria-label="Close" className="rounded-[8px] p-1 text-text-muted hover:text-text focus-visible:ring-2 focus-visible:ring-ring">
              <XIcon className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div role="radiogroup" aria-label="Type" className="grid grid-cols-2 gap-1 rounded-[10px] bg-muted-fill p-1">
              {(["expense", "income"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => setType(t)}
                  className={cn("h-9 rounded-[8px] text-[14px] font-medium", type === t ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text")}
                >
                  {t === "expense" ? "Expense" : "Income"}
                </button>
              ))}
            </div>

            {type === "expense" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={ids.category} className="text-[13px] font-medium text-text">
                  Category
                </label>
                <select
                  id={ids.category}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, category: true }))}
                  aria-invalid={touched.category && !!categoryError}
                  aria-describedby={touched.category && categoryError ? ids.categoryErr : undefined}
                  className={fieldClass}
                >
                  <option value="" disabled>
                    Choose a category
                  </option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {touched.category && categoryError && (
                  <p id={ids.categoryErr} className="text-[12px] text-danger">
                    {categoryError}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.amount} className="text-[13px] font-medium text-text">
                Amount
              </label>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[16px] text-text-muted">
                  $
                </span>
                <input
                  id={ids.amount}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
                  aria-invalid={touched.amount && !!amountError}
                  aria-describedby={[touched.amount && amountError ? ids.amountErr : null, preview ? ids.preview : null].filter(Boolean).join(" ") || undefined}
                  className={cn(fieldClass, "tabular pl-7")}
                />
              </div>
              {touched.amount && amountError && (
                <p id={ids.amountErr} className="text-[12px] text-danger">
                  {amountError}
                </p>
              )}
              {preview && (
                <p
                  id={ids.preview}
                  data-testid="custom-preview"
                  data-tone={preview.tone}
                  className={cn("tabular text-[13px]", preview.tone === "over" ? "font-medium text-danger" : preview.tone === "warn" ? "font-medium text-warning" : "text-text-muted")}
                >
                  {preview.text}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <label htmlFor={ids.merchant} className="text-[13px] font-medium text-text">
                  Merchant <span className="font-normal text-text-muted">(optional)</span>
                </label>
                <span id={ids.merchantCount} className="tabular text-[12px] text-text-muted">
                  {merchant.length}/{CUSTOM_MERCHANT_MAX}
                </span>
              </div>
              <input
                id={ids.merchant}
                value={merchant}
                maxLength={CUSTOM_MERCHANT_MAX}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="e.g. Weekend trip"
                aria-describedby={ids.merchantCount}
                autoComplete="off"
                className={fieldClass}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <span id={`${ids.preview}-ai`} className="text-[14px] text-text">
                Re-evaluate with AI
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={reevaluate}
                aria-labelledby={`${ids.preview}-ai`}
                onClick={() => setReevaluate((v) => !v)}
                className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring", reevaluate ? "bg-brand" : "bg-line")}
              >
                <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", reevaluate && "translate-x-5")} />
              </button>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="submit"
                disabled={!valid || busy}
                data-testid="custom-submit"
                className="h-11 flex-1 rounded-[9px] border-0 bg-brand text-[14px] font-semibold text-white hover:bg-brand-hover"
              >
                {busy ? "Adding…" : "Add transaction"}
              </Button>
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="outline" className="h-11 rounded-[9px] border-line bg-surface px-5 text-[14px] text-text hover:bg-muted-fill">
                  Cancel
                </Button>
              </DialogPrimitive.Close>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
