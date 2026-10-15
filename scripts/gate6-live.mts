/**
 * Gate 6: asks the six plan questions through the running app (real model), then checks
 *  (a) the expected figures (computed independently with the domain functions) appear in the reply,
 *  (b) every dollar figure in the reply appears in that turn's tool outputs (grounding),
 *  (c) the expected tools were called.
 * Usage: npx tsx scripts/gate6-live.mts [baseUrl]   — writes docs/evidence/phase6-questions.json
 */
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import postgres from "postgres";
import { checkAffordability } from "../src/lib/domain/affordability";
import { categorySpend } from "../src/lib/domain/budgets";
import { formatUSD } from "../src/lib/domain/money";
import { monthToDate } from "../src/lib/domain/summary";
import { SEED_END, generateSeed } from "../src/seed/generate";

config({ path: ".env.local", quiet: true });
const base = process.argv[2] ?? "http://localhost:3000";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const usd = (c: number) => formatUSD(c).replace("−", "-");

// Independent expectations from the seed template.
const seed = generateSeed();
const bills = seed.bills.map((b, i) => ({ ...b, id: String(i) }));
const oct = categorySpend(seed.transactions, "2026-10", SEED_END);
const top = [...oct.entries()].sort((a, b) => b[1] - a[1])[0];
const aff = checkAffordability(90_000, { openingBalanceCents: seed.account.openingBalanceCents, txs: seed.transactions, budgets: seed.budgets, bills, today: SEED_END });
const aug = categorySpend(seed.transactions, "2026-08");
const sep = categorySpend(seed.transactions, "2026-09");
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

type Q = { q: string; expect: string[]; tools: string[]; before?: () => Promise<void> };
let cookie = "";
const QUESTIONS: Q[] = [
  { q: "How much did I spend this month?", expect: [usd(monthToDate(seed.transactions, SEED_END).spendingCents)], tools: ["get_account_summary|get_spending_by_category|get_budget_status"] },
  { q: "Which category consumed the most money?", expect: [top[0], usd(top[1])], tools: ["get_spending_by_category|get_budget_status"] },
  { q: "What bills are due soon?", expect: ["Internet", usd(4_500), "Phone", usd(3_000)], tools: ["get_upcoming_bills"] },
  { q: "Can I afford a $900 purchase?", expect: [usd(aff.disposableCents), "Rent"], tools: ["check_affordability"] },
  {
    q: "Why am I over my dining budget?",
    expect: ["$325.00", "$300.00", "$25.00"],
    tools: ["get_budget_status|get_transactions"],
    before: async () => {
      const r = await fetch(base + "/api/simulate", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ eventId: "restaurant", idempotencyKey: crypto.randomUUID() }) });
      if (r.status !== 201) throw new Error("simulate failed " + r.status);
    },
  },
  { q: "Compare my spending in September vs August.", expect: [usd(sum(sep)), usd(sum(aug))], tools: ["compare_monthly_spending"] },
];

const res0 = await fetch(base + "/", { redirect: "manual" });
const sid = /cents_session=([0-9a-f-]{36})/.exec(res0.headers.get("set-cookie") ?? "")![1];
cookie = `cents_session=${sid}`;

const rows = [];
for (const item of QUESTIONS) {
  await item.before?.();
  const t0 = Date.now();
  const r = await fetch(base + "/api/chat", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ message: item.q }) });
  const body = await r.json();
  const reply: string = body.reply?.content ?? body.error;
  const calls = await sql`select tool_name, output from tool_calls where session_id = ${sid} and message_id = ${body.reply?.id ?? null}`;
  const toolText = JSON.stringify(calls.map((c) => c.output));
  const figures = [...reply.matchAll(/[−-]?\$[\d,]+(?:\.\d{2})?/g)].map((x) => x[0].replace("−", "-").replace(/^-/, ""));
  const ungrounded = figures.filter((f) => {
    const exact = toolText.includes(f);
    const whole = /\.\d{2}$/.test(f) ? false : toolText.includes(`${f}.`); // "$1,450" vs "$1,450.00"
    return !exact && !whole;
  });
  const missing = item.expect.filter((e) => !reply.includes(e));
  const toolNames = calls.map((c) => c.tool_name);
  const toolsOk = item.tools.every((alt) => alt.split("|").some((t) => toolNames.includes(t)));
  const pass = r.status === 200 && missing.length === 0 && ungrounded.length === 0 && toolsOk;
  rows.push({ question: item.q, status: r.status, ms: Date.now() - t0, pass, expected: item.expect, missing, figures_in_reply: figures, ungrounded, tools: toolNames, reply });
  console.log(`${pass ? "PASS" : "FAIL"}  ${item.q}\n      tools: ${toolNames.join(", ")}\n      expected: ${item.expect.join(" | ")}${missing.length ? `  MISSING: ${missing.join(", ")}` : ""}\n      figures: ${figures.join(", ") || "-"}${ungrounded.length ? `  UNGROUNDED: ${ungrounded.join(", ")}` : ""}\n      reply: ${reply.replace(/\n+/g, " ")}\n`);
}
const [cost] = await sql`select coalesce(sum((details->>'cost_usd')::float),0) c, count(*)::int n from audit_log where session_id = ${sid} and event = 'chat_message'`;
console.log(`turns ${cost.n}, total cost $${Number(cost.c).toFixed(5)}`);
writeFileSync("docs/evidence/phase6-questions.json", JSON.stringify({ run_at: new Date().toISOString(), session: sid, cost_usd: Number(cost.c), results: rows }, null, 2));
await sql.end();
process.exitCode = rows.every((r) => r.pass) ? 0 : 1;
