import { describe, expect, it } from "vitest";
import { findRecurringCharges, normalizeMerchant } from "@/lib/domain/recurring";
import type { DomainTx } from "@/lib/domain/types";
import { INJECTION_MERCHANT, SEED_END, generateSeed } from "@/seed/generate";

const seed = generateSeed();
const tx = (day: string, cents: number, merchant: string, category = "Subscriptions"): DomainTx => ({
  amountCents: -cents,
  category,
  merchant,
  occurredAt: `${day}T08:00:00.000Z`,
  type: "expense",
});

describe("findRecurringCharges on the seed", () => {
  it("finds exactly the merchants an independent month-by-month check finds", () => {
    // Independent rule: in the 6-month window a merchant recurs if it shows up in ≥ 3 distinct months,
    // at most once a month, on a steady day of month (±3), with amounts within ±10% of their median
    // (known bills exempt from the amount rule).
    const from = "2026-04-15";
    const byMerchant = new Map<string, { month: string; dom: number; cents: number }[]>();
    for (const t of seed.transactions) {
      const d = t.occurredAt.slice(0, 10);
      if (t.type !== "expense" || d <= from || d > SEED_END) continue;
      byMerchant.set(t.merchant, [...(byMerchant.get(t.merchant) ?? []), { month: d.slice(0, 7), dom: Number(d.slice(8)), cents: -t.amountCents }]);
    }
    const billNames = ["rent", "internet", "phone", "electric", "streaming"];
    const expected = [...byMerchant.entries()]
      .filter(([merchant, rows]) => {
        const months = new Set(rows.map((r) => r.month));
        if (months.size < 3 || months.size !== rows.length) return false;
        const doms = rows.map((r) => r.dom);
        if (Math.max(...doms) - Math.min(...doms) > 3) return false;
        const sorted = rows.map((r) => r.cents).sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)];
        const isBill = billNames.some((b) => merchant.toLowerCase().includes(b));
        return isBill || rows.every((r) => Math.abs(r.cents - med) <= med * 0.1);
      })
      .map(([m]) => m)
      .sort();

    const r = findRecurringCharges(seed.transactions, seed.bills, SEED_END, 6);
    expect(r.items.map((i) => i.merchant).sort()).toEqual(expected);
    expect(expected).toContain("Gym membership"); // the subscription outside the Subscriptions category
  });

  it("classifies subscriptions vs bills and totals the monthly cost", () => {
    const r = findRecurringCharges(seed.transactions, seed.bills, SEED_END, 6);
    const subs = r.items.filter((i) => i.kind === "subscription");
    expect(subs.map((i) => i.merchant).sort()).toEqual(["Cloud storage", "Gym membership", "News app", "Streaming plan"]);
    expect(r.totals.subscriptionsMonthlyCents).toBe(subs.reduce((s, i) => s + i.monthlyEquivalentCents, 0));
    expect(r.totals.subscriptionsMonthlyCents).toBe(299 + 3_500 + 999 + 1_599);
    expect(r.totals.subscriptionsYearlyCents).toBe(r.totals.subscriptionsMonthlyCents * 12);
    expect(r.items.find((i) => i.merchant === "Gym membership")).toMatchObject({ category: "Health", cadence: "monthly", monthlyEquivalentCents: 3_500 });
    expect(r.items.find((i) => i.merchant === "Internet")).toMatchObject({ kind: "bill", nextExpected: "2026-10-20" });
    // Variable bill still included although it drifts more than ±10%.
    expect(r.items.find((i) => i.merchant === "Electric bill")?.kind).toBe("bill");
    // Twice-a-month metro top-ups have no cadence band.
    expect(r.items.some((i) => i.merchant === "Metro card")).toBe(false);
    // Sorted by monthly equivalent, largest first.
    const eq = r.items.map((i) => i.monthlyEquivalentCents);
    expect(eq).toEqual([...eq].sort((a, b) => b - a));
  });

  it("is deterministic and keeps the injection record out (it never recurs)", () => {
    const a = findRecurringCharges(seed.transactions, seed.bills, SEED_END, 6);
    expect(findRecurringCharges(seed.transactions, seed.bills, SEED_END, 6)).toEqual(a);
    expect(a.items.some((i) => i.merchant === INJECTION_MERCHANT)).toBe(false);
  });
});

describe("findRecurringCharges rules", () => {
  const today = "2026-10-15";
  it("excludes a merchant whose amounts drift ~12%", () => {
    const txs = [tx("2026-07-05", 1_000, "Drifty"), tx("2026-08-05", 1_120, "Drifty"), tx("2026-09-05", 1_250, "Drifty")];
    expect(findRecurringCharges(txs, [], today).items).toEqual([]);
  });
  it("ignores a one-off purchase at a recurring merchant", () => {
    const txs = ["2026-06-02", "2026-07-02", "2026-08-02", "2026-09-02"].map((d) => tx(d, 3_500, "Gym membership", "Health"));
    txs.push(tx("2026-08-20", 12_000, "Gym membership", "Health"));
    const [item] = findRecurringCharges(txs, [], today).items;
    expect(item).toMatchObject({ occurrences: 4, typicalCents: 3_500, totalInWindowCents: 14_000 });
  });
  it("detects a weekly charge and converts it to a monthly equivalent", () => {
    const txs = [0, 7, 14, 21, 28, 35].map((d) => tx(new Date(Date.UTC(2026, 8, 1 + d)).toISOString().slice(0, 10), 500, "Coffee club", "Dining"));
    const [item] = findRecurringCharges(txs, [], today).items;
    expect(item).toMatchObject({ cadence: "weekly", monthlyEquivalentCents: Math.round((500 * 52) / 12), kind: "subscription" });
  });
  it("needs at least 3 charges and ignores income and savings", () => {
    const txs: DomainTx[] = [tx("2026-08-05", 999, "Twice only"), tx("2026-09-05", 999, "Twice only")];
    for (const d of ["2026-07-14", "2026-08-14", "2026-09-14"]) txs.push({ ...tx(d, 300_000, "Transfer to savings", "Savings"), type: "transfer" });
    expect(findRecurringCharges(txs, [], today).items).toEqual([]);
  });
  it("normalizes merchant names (case, digits, #, trailing reference codes)", () => {
    expect(normalizeMerchant("  NETFLIX.COM #4821 ")).toBe("netflix.com");
    expect(normalizeMerchant("Spotify*AB12CD")).toBe("spotify");
    expect(normalizeMerchant("Gym Membership")).toBe("gym membership");
  });
});
