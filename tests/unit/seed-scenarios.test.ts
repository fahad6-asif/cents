// The demo scenarios the seed was designed for, checked with the real domain functions.
import { describe, expect, it } from "vitest";
import { checkAffordability } from "@/lib/domain/affordability";
import { evaluateAlerts } from "@/lib/domain/alerts";
import { budgetStatuses } from "@/lib/domain/budgets";
import { buildOverrunReallocation } from "@/lib/domain/proposals";
import { summarize } from "@/lib/domain/summary";
import type { DomainBill, DomainTx } from "@/lib/domain/types";
import { SIM_EVENTS } from "@/lib/sim-events";
import { SEED_END, generateSeed } from "@/seed/generate";

const seed = generateSeed();
const TODAY = SEED_END;
const baseTxs: DomainTx[] = seed.transactions.map((t, i) => ({ ...t, id: `seed-${i}` }));
const bills: DomainBill[] = seed.bills.map((b, i) => ({ ...b, id: `bill-${i}` }));

function simulate(eventId: string): DomainTx {
  const e = SIM_EVENTS.find((s) => s.id === eventId)!;
  return {
    id: `sim-${eventId}`,
    amountCents: e.amountCents,
    category: e.category,
    merchant: e.merchant,
    occurredAt: `${TODAY}T15:00:00.000Z`,
    type: e.amountCents > 0 ? "income" : "expense",
  };
}
const alertsFor = (txs: DomainTx[]) => evaluateAlerts({ today: TODAY, txs, budgets: seed.budgets, bills });

describe("seed state", () => {
  it("has a Dining warning and the two bills due within 7 days, nothing else", () => {
    const keys = alertsFor(baseTxs).map((a) => a.dedupeKey);
    const internet = bills.find((b) => b.name === "Internet" && b.status === "unpaid")!;
    const phone = bills.find((b) => b.name === "Phone" && b.status === "unpaid")!;
    expect(keys).toEqual(["budget_warning:Dining:2026-10", `upcoming_bill:${internet.id}`, `upcoming_bill:${phone.id}`]);
  });

  it("keeps 'ahead this month', the balance delta and Net identical", () => {
    const s = summarize(seed.account.openingBalanceCents, baseTxs, TODAY);
    expect(s.balanceCents - s.startOfMonthBalanceCents).toBe(s.netCents);
    expect(s.balanceCents).toBe(584_213);
  });

  it("can afford $900 but not $4,000", () => {
    const input = { openingBalanceCents: seed.account.openingBalanceCents, txs: baseTxs, budgets: seed.budgets, bills, today: TODAY };
    expect(checkAffordability(90_000, input).affordable).toBe(true);
    expect(checkAffordability(400_000, input).affordable).toBe(false);
    expect(checkAffordability(90_000, input).bills.map((b) => b.name)).toEqual(["Internet", "Phone", "Electricity", "Streaming", "Rent"]);
  });
});

describe("simulated events", () => {
  it("restaurant: Dining $325/$300 overrun (not unusual), $25 from Shopping", () => {
    const txs = [...baseTxs, simulate("restaurant")];
    const types = alertsFor(txs).map((a) => a.dedupeKey);
    expect(types).toContain("budget_overrun:Dining:2026-10");
    expect(types).not.toContain("budget_warning:Dining:2026-10");
    expect(types.some((k) => k.startsWith("unusual_spending"))).toBe(false);

    const statuses = budgetStatuses(seed.budgets, txs, "2026-10", TODAY);
    const dining = statuses.find((s) => s.category === "Dining")!;
    expect(dining).toMatchObject({ spentCents: 32_500, overageCents: 2_500 });
    expect(buildOverrunReallocation(dining, statuses)).toMatchObject({ amountCents: 2_500, from: "Shopping", to: "Dining" });
  });

  it("large purchase: unusual spending alert (plus a Shopping overrun no category can cover)", () => {
    const txs = [...baseTxs, simulate("large_purchase")];
    const alerts = alertsFor(txs);
    expect(alerts.map((a) => a.dedupeKey)).toContain("unusual_spending:sim-large_purchase");
    const statuses = budgetStatuses(seed.budgets, txs, "2026-10", TODAY);
    const shopping = statuses.find((s) => s.category === "Shopping")!;
    expect(shopping.state).toBe("overrun");
    expect(buildOverrunReallocation(shopping, statuses)).toBeNull();
  });

  it.each(["groceries", "subscription", "electricity", "salary"])("%s triggers no new budget or unusual alert", (id) => {
    const before = alertsFor(baseTxs).map((a) => a.dedupeKey);
    const after = alertsFor([...baseTxs, simulate(id)]).map((a) => a.dedupeKey);
    expect(after).toEqual(before);
  });
});
