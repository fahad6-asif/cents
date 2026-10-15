/** Prints a human-readable summary of the deterministic seed. Usage: npx tsx scripts/seed-summary.ts */
import { generateSeed } from "../src/seed/generate";
import { seedHash } from "../src/seed/hash";

const seed = generateSeed();
const usd = (c: number) => (c / 100).toFixed(2);
let balance = seed.account.openingBalanceCents;
let low = { cents: balance, at: "" };
for (const t of seed.transactions) {
  balance += t.amountCents;
  if (balance < low.cents) low = { cents: balance, at: t.occurredAt };
}
console.log("hash", seedHash(seed));
console.log("opening", usd(seed.account.openingBalanceCents), "final", usd(balance), "low", usd(low.cents), low.at);
console.log("transactions", seed.transactions.length, "bills", seed.bills.length);
const oct = seed.transactions.filter((t) => t.occurredAt.startsWith("2026-10"));
const byCat = new Map<string, number>();
for (const t of oct) if (t.type === "expense") byCat.set(t.category, (byCat.get(t.category) ?? 0) - t.amountCents);
for (const b of seed.budgets.filter((b) => b.month === "2026-10")) {
  const spent = byCat.get(b.category) ?? 0;
  console.log(b.category.padEnd(14), usd(spent).padStart(9), "/", usd(b.limitCents).padStart(8), `${((spent / b.limitCents) * 100).toFixed(1)}%`);
}
console.log("Oct rows", oct.map((t) => `${t.occurredAt.slice(5, 10)} ${t.category}:${t.merchant} ${usd(t.amountCents)}`).join("\n"));
console.log("unpaid bills", seed.bills.filter((b) => b.status === "unpaid"));
