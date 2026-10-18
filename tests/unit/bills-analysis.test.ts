import { describe, expect, it } from "vitest";
import { analyzeBills } from "@/lib/domain/bills-analysis";
import type { DomainBill } from "@/lib/domain/types";
import { SEED_END, generateSeed } from "@/seed/generate";

const bill = (name: string, dueDate: string, amountCents: number, status: DomainBill["status"] = "paid"): DomainBill => ({ name, dueDate, amountCents, status, category: "Utilities" });
const TODAY = "2026-10-15";

describe("analyzeBills", () => {
  it("computes history (newest first), average, min/max, trend and vs-average", () => {
    const bills = [bill("Power", "2026-06-25", 10_000), bill("Power", "2026-07-25", 10_000), bill("Power", "2026-08-25", 12_000), bill("Power", "2026-09-25", 12_000), bill("Power", "2026-10-25", 13_200, "unpaid")];
    const [p] = analyzeBills(bills, TODAY).bills;
    expect(p.history.map((h) => h.date)).toEqual(["2026-09-25", "2026-08-25", "2026-07-25", "2026-06-25"]);
    expect(p).toMatchObject({ averageCents: 11_000, minCents: 10_000, maxCents: 12_000, lastPaid: "2026-09-25", upcoming: { amountCents: 13_200, due: "2026-10-25" } });
    expect(p.vsAverage).toEqual({ deltaCents: 2_200, pct: 20 });
    expect(p.trend).toBe("rising");
    expect(p.unusual).toBe(true);
  });

  it("flags unusual at exactly 15% but not at 14.99%", () => {
    const base = ["2026-07-20", "2026-08-20", "2026-09-20"].map((d) => bill("Net", d, 10_000));
    expect(analyzeBills([...base, bill("Net", "2026-10-20", 11_500, "unpaid")], TODAY).bills[0].unusual).toBe(true);
    expect(analyzeBills([...base, bill("Net", "2026-10-20", 11_499, "unpaid")], TODAY).bills[0].unusual).toBe(false);
    expect(analyzeBills([...base, bill("Net", "2026-10-20", 8_500, "unpaid")], TODAY).bills[0].unusual).toBe(true); // −15% counts too
  });

  it("treats ±5% as a flat trend, and compares the last paid bill when nothing is upcoming", () => {
    const bills = [bill("Water", "2026-07-06", 10_000), bill("Water", "2026-08-06", 10_000), bill("Water", "2026-09-06", 10_400), bill("Water", "2026-10-06", 10_400)];
    const [w] = analyzeBills(bills, TODAY).bills;
    expect(w.trend).toBe("flat");
    expect(w.upcoming).toBeNull();
    expect(w.vsAverage).toEqual({ deltaCents: 200, pct: 2 });
  });

  it("handles a bill with no paid history", () => {
    const [n] = analyzeBills([bill("New", "2026-10-30", 5_000, "unpaid")], TODAY).bills;
    expect(n).toMatchObject({ history: [], averageCents: null, vsAverage: null, trend: "flat", unusual: false, upcoming: { amountCents: 5_000 } });
  });

  it("filters to one bill by name and totals bills due before the next income", () => {
    const seed = generateSeed();
    const all = analyzeBills(seed.bills, SEED_END);
    expect(all.totals.upcomingTotalBeforeNextIncomeCents).toBe(166_099);
    const elec = analyzeBills(seed.bills, SEED_END, 6, "electricity");
    expect(elec.bills.map((b) => b.name)).toEqual(["Electricity"]);
    const e = elec.bills[0];
    const paid = seed.bills.filter((b) => b.name === "Electricity" && b.status === "paid" && b.dueDate > "2026-04-15");
    expect(e.averageCents).toBe(Math.round(paid.reduce((s, b) => s + b.amountCents, 0) / paid.length));
    expect(e.upcoming?.amountCents).toBe(12_000);
    expect(e.vsAverage!.deltaCents).toBe(12_000 - e.averageCents!);
  });
});
