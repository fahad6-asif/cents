// Recurring-charge detection (addendum §4.2). Pure and deterministic: same input, same output.
import { medianCents } from "./alerts";
import { addDays, addMonths, dayOf, daysBetween, monthOf } from "./dates";
import { INCOME_CATEGORY, SAVINGS_CATEGORY } from "./categories";
import type { DomainBill, DomainTx } from "./types";

export type Cadence = "weekly" | "monthly" | "yearly";
export type RecurringKind = "subscription" | "bill";

export type RecurringItem = {
  merchant: string;
  category: string;
  kind: RecurringKind;
  cadence: Cadence;
  typicalCents: number;
  monthlyEquivalentCents: number;
  occurrences: number;
  lastCharged: string;
  nextExpected: string;
  totalInWindowCents: number;
};

export type RecurringResult = {
  from: string;
  to: string;
  items: RecurringItem[];
  totals: {
    subscriptionsMonthlyCents: number;
    subscriptionsYearlyCents: number;
    billsMonthlyCents: number;
    countSubscriptions: number;
    countBills: number;
  };
};

const BANDS: { cadence: Cadence; min: number; max: number; spread: number }[] = [
  { cadence: "weekly", min: 6, max: 8, spread: 2 },
  { cadence: "monthly", min: 26, max: 35, spread: 5 },
  { cadence: "yearly", min: 355, max: 375, spread: 5 },
];
/** Bills are the fixed household obligations; everything else that recurs is a subscription. */
const BILL_CATEGORIES = new Set(["Housing", "Utilities"]);
const TOLERANCE = 0.1;
const MIN_OCCURRENCES = 3;

/** "NETFLIX.COM #4821" → "netflix.com"; trailing reference codes and digits are dropped. */
export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/[#*]\s*[a-z0-9-]*\d[a-z0-9-]*\s*$/i, "")
    .replace(/[0-9#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same day of next month, clamped to that month's length (31 Jan → 28/29 Feb). */
function nextMonthSameDay(day: string): string {
  const month = addMonths(monthOf(day), 1);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(Number(day.slice(8, 10)), last)).padStart(2, "0")}`;
}

function monthlyEquivalent(cents: number, cadence: Cadence): number {
  if (cadence === "weekly") return Math.round((cents * 52) / 12);
  if (cadence === "yearly") return Math.round(cents / 12);
  return cents;
}

/** Does this merchant group pay one of the known bills? (first word of the bill name, ≤ 8 chars) */
function matchesBill(norm: string, bills: readonly DomainBill[]): boolean {
  return bills.some((b) => norm.includes(normalizeMerchant(b.name).split(" ")[0].slice(0, 8)));
}

export function findRecurringCharges(
  txs: readonly DomainTx[],
  bills: readonly DomainBill[],
  today: string,
  lookbackMonths = 6,
): RecurringResult {
  const from = `${addMonths(monthOf(today), -lookbackMonths)}-${today.slice(8, 10)}`;
  const groups = new Map<string, DomainTx[]>();
  for (const t of txs) {
    const day = dayOf(t.occurredAt);
    if (t.type !== "expense" || t.amountCents >= 0 || day <= from || day > today) continue;
    if (t.category === INCOME_CATEGORY || t.category === SAVINGS_CATEGORY) continue;
    const key = normalizeMerchant(t.merchant);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const items: RecurringItem[] = [];
  for (const [norm, rows] of groups) {
    const sorted = [...rows].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
    const isBill = matchesBill(norm, bills);
    const median = medianCents(sorted.map((t) => -t.amountCents))!;
    // Keep charges within ±10% of the median (drops a one-off at the same merchant); every
    // known bill keeps all its charges, since variable bills (electricity) can drift more.
    const inBand = isBill ? sorted : sorted.filter((t) => Math.abs(-t.amountCents - median) <= median * TOLERANCE);
    if (inBand.length < MIN_OCCURRENCES) continue;

    const days = inBand.map((t) => dayOf(t.occurredAt));
    const gaps = days.slice(1).map((d, i) => daysBetween(days.at(i)!, d));
    const medianGap = medianCents(gaps)!;
    const spread = Math.max(...gaps) - Math.min(...gaps);
    const band = BANDS.find((b) => medianGap >= b.min && medianGap <= b.max && spread <= b.spread) ?? (isBill ? BANDS[1] : undefined);
    if (!band) continue;

    const typical = medianCents(inBand.map((t) => -t.amountCents))!;
    const latest = inBand.at(-1)!;
    items.push({
      merchant: latest.merchant,
      category: latest.category,
      kind: BILL_CATEGORIES.has(latest.category) ? "bill" : "subscription",
      cadence: band.cadence,
      typicalCents: typical,
      monthlyEquivalentCents: monthlyEquivalent(typical, band.cadence),
      occurrences: inBand.length,
      lastCharged: dayOf(latest.occurredAt),
      nextExpected: band.cadence === "monthly" ? nextMonthSameDay(dayOf(latest.occurredAt)) : addDays(dayOf(latest.occurredAt), medianGap),
      totalInWindowCents: inBand.reduce((s, t) => s - t.amountCents, 0),
    });
  }
  items.sort((a, b) => b.monthlyEquivalentCents - a.monthlyEquivalentCents || a.merchant.localeCompare(b.merchant));

  const subs = items.filter((i) => i.kind === "subscription");
  const billsMonthly = items.filter((i) => i.kind === "bill").reduce((s, i) => s + i.monthlyEquivalentCents, 0);
  const subsMonthly = subs.reduce((s, i) => s + i.monthlyEquivalentCents, 0);
  return {
    from,
    to: today,
    items,
    totals: {
      subscriptionsMonthlyCents: subsMonthly,
      subscriptionsYearlyCents: subsMonthly * 12,
      billsMonthlyCents: billsMonthly,
      countSubscriptions: subs.length,
      countBills: items.length - subs.length,
    },
  };
}
