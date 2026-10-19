import { and, asc, eq, gte, sql } from "drizzle-orm";
import { audit } from "@/lib/db/audit";
import { accounts, auditLog, bills, transactions } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { INCOME_CATEGORY } from "@/lib/domain/categories";
import { SIM_EVENTS, type SimEventId } from "@/lib/sim-events";
import { lockSession, runChecksInTx, type CheckResult } from "./checks";
import { recheckPendingProposals } from "./proposal-recheck";
import { MAX_CUSTOM_PER_HOUR, normalizeMerchant } from "./simulate-rules";

export { CUSTOM_MAX_CENTS, CUSTOM_MERCHANT_MAX, MAX_CUSTOM_PER_HOUR, normalizeMerchant } from "./simulate-rules";

/** Per-session cap on simulated transactions (reset the demo to start over). */
export const MAX_SIMULATED_PER_SESSION = 100;
/** Which bill a simulated payment settles (plan Section 6: electricity marks the bill paid). Preset-only. */
const PAYS_BILL: Partial<Record<SimEventId, string>> = { electricity: "Electricity" };

export type SimulateSpec =
  | { kind: "preset"; eventId: SimEventId }
  | { kind: "custom"; type: "expense" | "income"; category?: string; amountCents: number; merchant?: string };

/** What gets stored for a spec: the server applies the sign, the category for income and the default name. */
export function resolveSpec(spec: SimulateSpec) {
  if (spec.kind === "preset") {
    const event = SIM_EVENTS.find((e) => e.id === spec.eventId);
    if (!event) throw new Error(`Unknown event ${spec.eventId}`);
    return { amountCents: event.amountCents as number, category: event.category as string, merchant: event.merchant as string, simEventId: event.id as string | null, origin: "preset" as const };
  }
  const income = spec.type === "income";
  const category = income ? INCOME_CATEGORY : spec.category!;
  const merchant = normalizeMerchant(spec.merchant) || (income ? "Custom income" : `Custom: ${category}`);
  return { amountCents: income ? spec.amountCents : -spec.amountCents, category, merchant, simEventId: null, origin: "custom" as const };
}

export type SimulateResult = {
  limited?: boolean;
  rateLimited?: boolean;
  replayed: boolean;
  transaction: { id: string; merchant: string; category: string; amountCents: number; occurredAt: string; origin: "preset" | "custom" | null };
  paidBillId: string | null;
  checks: CheckResult | null;
  staleProposals: string[];
};

/**
 * Inserts one simulated transaction (a preset event or a custom one), settles its bill if any,
 * logs it, runs the rule checks and re-checks pending proposals, all in one transaction.
 * Replaying an idempotency key returns the original transaction and changes nothing.
 */
export async function simulateEvent(
  db: Db,
  args: { sessionId: string; epoch: number; eventId?: SimEventId; spec?: SimulateSpec; idempotencyKey: string; today: string; timeOfDay: string },
): Promise<SimulateResult> {
  const spec: SimulateSpec = args.spec ?? { kind: "preset", eventId: args.eventId! };
  const row = resolveSpec(spec);

  return db.transaction(async (tx) => {
    await lockSession(tx, args.sessionId);

    const findReplay = async () =>
      (
        await tx
          .select()
          .from(transactions)
          .where(and(eq(transactions.sessionId, args.sessionId), eq(transactions.idempotencyKey, args.idempotencyKey)))
      )[0];
    const empty = { transaction: null as never, paidBillId: null, checks: null, staleProposals: [] };

    const [account] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.sessionId, args.sessionId));
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(and(eq(transactions.sessionId, args.sessionId), eq(transactions.source, "simulated")));
    if (count.n >= MAX_SIMULATED_PER_SESSION && !(await findReplay())) return { limited: true, replayed: false, ...empty };

    if (spec.kind === "custom" && !(await findReplay())) {
      const [recent] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.sessionId, args.sessionId),
            eq(auditLog.event, "transaction_simulated"),
            sql`${auditLog.details}->>'origin' = 'custom'`,
            gte(auditLog.createdAt, sql`now() - interval '1 hour'`),
          ),
        );
      if (recent.n >= MAX_CUSTOM_PER_HOUR) {
        await audit(tx, args.sessionId, args.epoch, "simulate_rate_limited", { origin: "custom", limit_per_hour: MAX_CUSTOM_PER_HOUR });
        return { rateLimited: true, replayed: false, ...empty };
      }
    }

    const inserted = await tx
      .insert(transactions)
      .values({
        sessionId: args.sessionId,
        accountId: account.id,
        amountCents: row.amountCents,
        category: row.category,
        merchant: row.merchant,
        occurredAt: new Date(`${args.today}T${args.timeOfDay}Z`),
        type: row.amountCents > 0 ? "income" : "expense",
        source: "simulated",
        origin: row.origin,
        simEventId: row.simEventId,
        idempotencyKey: args.idempotencyKey,
      })
      .onConflictDoNothing()
      .returning();

    if (!inserted.length) return { replayed: true, ...empty, transaction: view((await findReplay())!) };
    const txRow = inserted[0];

    let paidBillId: string | null = null;
    const billName = spec.kind === "preset" ? PAYS_BILL[spec.eventId] : undefined;
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
      origin: row.origin,
      event_id: row.simEventId,
      transaction_id: txRow.id,
      category: row.category,
      amount_cents: row.amountCents,
      idempotency_key: args.idempotencyKey,
      paid_bill_id: paidBillId,
      // Custom merchant text is user-controlled: log its length only (preset names are fixed strings).
      ...(row.origin === "custom" ? { merchant_length: row.merchant.length } : { merchant: row.merchant }),
    });
    // Re-evaluation pipeline (B1.2): rule checks first, then every pending proposal against the new data.
    const checks = await runChecksInTx(tx, args.sessionId, args.epoch, args.today);
    const staleProposals = await recheckPendingProposals(tx, args.sessionId, args.epoch, args.today);
    return { replayed: false, transaction: view(txRow), paidBillId, checks, staleProposals };
  });
}

function view(t: typeof transactions.$inferSelect) {
  return {
    id: t.id,
    merchant: t.merchant,
    category: t.category,
    amountCents: t.amountCents,
    occurredAt: t.occurredAt.toISOString(),
    origin: t.origin,
  };
}
