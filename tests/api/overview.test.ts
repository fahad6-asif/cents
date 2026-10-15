import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { accounts, transactions } from "@/lib/db/schema";
import { loadSessionData } from "@/lib/db/queries";
import { ensureSession } from "@/lib/db/sessions";
import type { Db } from "@/lib/db/types";
import { categorySpend, spendingBreakdown } from "@/lib/domain/budgets";
import { balanceAt, balanceSeries, monthToDate } from "@/lib/domain/summary";
import { buildOverview } from "@/lib/overview";
import { SEED_END, generateSeed } from "@/seed/generate";
import { createTestDb } from "../helpers/db";

const TODAY = SEED_END;
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => close());

// Expected values are computed straight from the seed template (not from DB rows),
// so this checks DB round-trip + overview assembly against the domain functions.
const seed = generateSeed();
const opening = seed.account.openingBalanceCents;

describe("overview payload", () => {
  it("matches the domain functions on the seed data", async () => {
    const id = randomUUID();
    await ensureSession(db, id);
    const o = buildOverview(await loadSessionData(db, id), TODAY, "1M", "Fahad");

    const mtd = monthToDate(seed.transactions, TODAY);
    expect(o.summary.balanceCents).toBe(balanceAt(opening, seed.transactions, TODAY));
    expect(o.summary.netCents).toBe(mtd.netCents);
    expect(o.summary.spendingCents).toBe(mtd.spendingCents);
    expect(o.summary.moneyInCents).toBe(mtd.moneyInCents);
    expect(o.summary.moneyOutCents).toBe(mtd.moneyOutCents);
    expect(o.summary.startOfMonthBalanceCents).toBe(balanceAt(opening, seed.transactions, "2026-09-30"));
    expect(o.cashFlow).toEqual({ inCents: mtd.moneyInCents, outCents: mtd.moneyOutCents, inPct: 100, outPct: (mtd.moneyOutCents / mtd.moneyInCents) * 100 });
    expect(o.spending.totalCents).toBe(mtd.spendingCents);
    expect(o.spending.rows.map(({ name, cents, widthPct }) => ({ name, cents, widthPct }))).toEqual(
      spendingBreakdown(categorySpend(seed.transactions, "2026-10", TODAY)),
    );
    expect(o.series.points.map((p) => p.balanceCents)).toEqual(
      balanceSeries(opening, seed.transactions, TODAY, "1M").map((p) => p.balanceCents),
    );

    // Hand-verified in Phase 3.
    expect(o.summary).toMatchObject({ balanceCents: 584_213, netCents: 91_828, changePct: 18.6, spendingCents: 248_172 });
    expect(o.dateLabel).toBe("Thursday, 15 October");
    expect(o.monthLabel).toBe("October");
  });

  it("uses one net figure for 'ahead', the balance delta and Cash flow → Net", async () => {
    const id = randomUUID();
    await ensureSession(db, id);
    const o = buildOverview(await loadSessionData(db, id), TODAY, "1M", "Fahad");
    expect(o.summary.balanceCents - o.summary.startOfMonthBalanceCents).toBe(o.summary.netCents);
    expect(o.cashFlow.inCents - o.cashFlow.outCents).toBe(o.summary.netCents);
  });

  it.each([
    ["1W", 8],
    ["1M", 31],
    ["3M", 91],
    ["1Y", 366],
  ] as const)("returns the %s series (%i points)", async (range, n) => {
    const id = randomUUID();
    await ensureSession(db, id);
    const o = buildOverview(await loadSessionData(db, id), TODAY, range, "Fahad");
    expect(o.series.range).toBe(range);
    expect(o.series.points).toHaveLength(n);
    expect(o.series.points.at(-1)!.balanceCents).toBe(o.summary.balanceCents);
  });

  it("lists the 5 most recent transactions and flags simulated ones", async () => {
    const id = randomUUID();
    await ensureSession(db, id);
    const [account] = await db.select().from(accounts).where(eq(accounts.sessionId, id));
    await db.insert(transactions).values({
      sessionId: id,
      accountId: account.id,
      amountCents: -6_000,
      category: "Dining",
      merchant: "Bella Napoli",
      occurredAt: new Date(`${TODAY}T20:00:00Z`),
      type: "expense",
      source: "simulated",
      simEventId: "restaurant",
      idempotencyKey: randomUUID(),
    });
    const o = buildOverview(await loadSessionData(db, id), TODAY, "1M", "Fahad");
    expect(o.recent).toHaveLength(5);
    expect(o.recent[0]).toMatchObject({ merchant: "Bella Napoli", amountCents: -6_000, simulated: true, date: TODAY });
    expect(o.recent.slice(1).every((r) => !r.simulated)).toBe(true);

    // Dining is now over budget: flagged on the spending card and surfaced as the top alert.
    expect(o.spending.rows.find((r) => r.name === "Dining")!.overBudget).toBe(true);
    expect(o.worthALook!.top.type).toBe("budget_overrun");
    expect(o.summary.netCents).toBe(91_828 - 6_000);
  });
});
