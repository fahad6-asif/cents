import { and, asc, eq } from "drizzle-orm";
import { audit } from "@/lib/db/audit";
import { accounts, bills, transactions } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { SIM_EVENTS, type SimEventId } from "@/lib/sim-events";
import { lockSession, runChecksInTx, type CheckResult } from "./checks";

/** Which bill a simulated payment settles (plan Section 6: electricity marks the bill paid). */
const PAYS_BILL: Partial<Record<SimEventId, string>> = { electricity: "Electricity" };

export type SimulateResult = {
  replayed: boolean;
  transaction: { id: string; merchant: string; category: string; amountCents: number; occurredAt: string };
  paidBillId: string | null;
  checks: CheckResult | null;
};

/**
 * Inserts one simulated transaction, settles its bill if any, logs it, and runs the rule checks,
 * all in one transaction. Replaying an idempotency key returns the original transaction and
 * changes nothing.
 */
export async function simulateEvent(
  db: Db,
  args: { sessionId: string; epoch: number; eventId: SimEventId; idempotencyKey: string; today: string; timeOfDay: string },
): Promise<SimulateResult> {
  const event = SIM_EVENTS.find((e) => e.id === args.eventId);
  if (!event) throw new Error(`Unknown event ${args.eventId}`);

  return db.transaction(async (tx) => {
    await lockSession(tx, args.sessionId);

    const [account] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.sessionId, args.sessionId));
    const inserted = await tx
      .insert(transactions)
      .values({
        sessionId: args.sessionId,
        accountId: account.id,
        amountCents: event.amountCents,
        category: event.category,
        merchant: event.merchant,
        occurredAt: new Date(`${args.today}T${args.timeOfDay}Z`),
        type: event.amountCents > 0 ? "income" : "expense",
        source: "simulated",
        simEventId: event.id,
        idempotencyKey: args.idempotencyKey,
      })
      .onConflictDoNothing()
      .returning();

    if (!inserted.length) {
      const [original] = await tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.sessionId, args.sessionId), eq(transactions.idempotencyKey, args.idempotencyKey)));
      return { replayed: true, transaction: view(original), paidBillId: null, checks: null };
    }
    const row = inserted[0];

    let paidBillId: string | null = null;
    const billName = PAYS_BILL[event.id];
    if (billName) {
      const [bill] = await tx
        .select({ id: bills.id })
        .from(bills)
        .where(and(eq(bills.sessionId, args.sessionId), eq(bills.name, billName), eq(bills.status, "unpaid")))
        .orderBy(asc(bills.dueDate))
        .limit(1);
      if (bill) {
        await tx.update(bills).set({ status: "paid" }).where(eq(bills.id, bill.id));
        paidBillId = bill.id;
      }
    }

    await audit(tx, args.sessionId, args.epoch, "transaction_simulated", {
      event_id: event.id,
      transaction_id: row.id,
      merchant: event.merchant,
      category: event.category,
      amount_cents: event.amountCents,
      idempotency_key: args.idempotencyKey,
      paid_bill_id: paidBillId,
    });
    const checks = await runChecksInTx(tx, args.sessionId, args.epoch, args.today);
    return { replayed: false, transaction: view(row), paidBillId, checks };
  });
}

function view(t: typeof transactions.$inferSelect) {
  return {
    id: t.id,
    merchant: t.merchant,
    category: t.category,
    amountCents: t.amountCents,
    occurredAt: t.occurredAt.toISOString(),
  };
}
