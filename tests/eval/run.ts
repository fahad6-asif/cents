/**
 * AI evaluation runner (plan Phase 10).
 * For each question: reset a session, compute the expected figures INDEPENDENTLY with the domain
 * functions from that session's DB rows, ask the running app (real model), then check the reply:
 * expected figures (±$0.01), phrases, tools called, grounding of every $ figure, and state safety.
 * Usage: npx tsx tests/eval/run.ts [baseUrl]   → writes docs/AI_EVAL.md and docs/evidence/ai-eval.json
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../src/lib/db/schema";
import { loadSessionData, type SessionData } from "../../src/lib/db/queries";
import type { Db } from "../../src/lib/db/types";
import { checkAffordability } from "../../src/lib/domain/affordability";
import { categorySpend } from "../../src/lib/domain/budgets";
import { addDays } from "../../src/lib/domain/dates";
import { formatUSD } from "../../src/lib/domain/money";
import { monthToDate } from "../../src/lib/domain/summary";

config({ path: ".env.local", quiet: true });
const BASE = process.argv[2] ?? "http://localhost:3000";
const TODAY = process.env.SIM_TODAY ?? "2026-10-15";
const MODEL = process.env.LLM_MODEL ?? "anthropic/claude-haiku-5.5";

type Question = {
  id: string;
  question: string;
  expect: string[];
  phrases?: string[];
  phrases_regex?: string[];
  tools_any: string[];
  must_not_change_state?: boolean;
};

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/** Every expected value, computed from the session's own rows with the domain layer. */
function expectations(d: SessionData): Record<string, number | string> {
  const oct = categorySpend(d.txs, "2026-10", TODAY);
  const top = [...oct.entries()].sort((a, b) => b[1] - a[1])[0];
  const aug = sum(categorySpend(d.txs, "2026-08"));
  const sep = sum(categorySpend(d.txs, "2026-09"));
  const input = { openingBalanceCents: d.account.openingBalanceCents, txs: d.txs, budgets: d.budgets, bills: d.bills, today: TODAY };
  const a900 = checkAffordability(90_000, input);
  const in7 = addDays(TODAY, 7);
  return {
    mtd_spending: monthToDate(d.txs, TODAY).spendingCents,
    top_category_name: top[0],
    top_category_amount: top[1],
    groceries_mtd: oct.get("Groceries") ?? 0,
    aug_total: aug,
    sep_total: sep,
    sep_minus_aug_abs: Math.abs(sep - aug),
    bills_7d_total: d.bills.filter((b) => b.status === "unpaid" && b.dueDate <= in7).reduce((s, b) => s + b.amountCents, 0),
    disposable: a900.disposableCents,
    afford_900_disposable_after: a900.disposableAfterCents,
    sep_dining_total: categorySpend(d.txs, "2026-09").get("Dining") ?? 0,
  };
}

/** Dollar amounts in text → cents (handles $1,234.56, $1,234, −$5.00). */
function dollarFigures(text: string): number[] {
  return [...text.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g)].map((m) => Math.round(Number(m[1].replace(/,/g, "")) * 100));
}
const near = (a: number, b: number) => Math.abs(a - b) <= 1;

async function main() {
  const { questions } = JSON.parse(readFileSync("tests/eval/questions.json", "utf8")) as { questions: Question[] };
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });
  const db = drizzle({ client, schema }) as unknown as Db;

  const r0 = await fetch(BASE + "/", { redirect: "manual" });
  const sid = /cents_session=([0-9a-f-]{36})/.exec(r0.headers.get("set-cookie") ?? "")![1];
  const cookie = `cents_session=${sid}`;
  /** JSON call with one retry on network errors or non-JSON bodies (flaky local links to the DB). */
  const call = async (path: string, init?: RequestInit, attempt = 1): Promise<{ status: number; body: any }> => {
    try {
      const r = await fetch(BASE + path, { ...init, headers: { cookie, "content-type": "application/json" } });
      const text = await r.text();
      return { status: r.status, body: JSON.parse(text) };
    } catch (err) {
      if (attempt >= 2) throw err;
      await new Promise((res) => setTimeout(res, 3000));
      return call(path, init, attempt + 1);
    }
  };

  const rows = [];
  for (const q of questions) {
    await call("/api/reset", { method: "POST" }); // fresh seed state + empty chat for every question
    const data = await loadSessionData(db, sid);
    const exp = expectations(data);
    const actionsBefore = JSON.stringify(await client`select id, status from agent_actions where session_id = ${sid} order by id`);
    const budgetsBefore = JSON.stringify(await client`select category, month, limit_cents from budgets where session_id = ${sid} order by month, category`);

    const t0 = Date.now();
    const turn = await call("/api/chat", { method: "POST", body: JSON.stringify({ message: q.question }) });
    const ms = Date.now() - t0;
    const reply: string = turn.body.reply?.content ?? turn.body.error ?? "";
    const calls = await client`select tool_name, output from tool_calls where session_id = ${sid} and message_id = ${turn.body.reply?.id ?? null}`;
    const tools = calls.map((c) => c.tool_name as string);
    const toolText = JSON.stringify(calls.map((c) => c.output));
    const toolFigures = new Set(dollarFigures(toolText.replace(/\\u2212/g, "-")));
    const [audit] = await client`select details from audit_log where session_id = ${sid} and event = 'chat_message' order by created_at desc limit 1`;

    const figures = dollarFigures(reply);
    const failures: string[] = [];
    const expected: string[] = [];
    for (const key of q.expect) {
      const cents = exp[key] as number;
      expected.push(`${key}=${formatUSD(cents)}`);
      if (!figures.some((f) => near(f, cents))) failures.push(`missing ${key} ${formatUSD(cents)}`);
    }
    for (const key of q.phrases ?? []) {
      const phrase = String(exp[key] ?? key);
      expected.push(`"${phrase}"`);
      if (!reply.toLowerCase().includes(phrase.toLowerCase())) failures.push(`missing phrase "${phrase}"`);
    }
    for (const re of q.phrases_regex ?? []) {
      expected.push(`/${re}/`);
      if (!new RegExp(re, "i").test(reply)) failures.push(`no match /${re}/`);
    }
    if (q.tools_any.length && !q.tools_any.some((t) => tools.includes(t))) failures.push(`expected one of tools ${q.tools_any.join("|")}`);
    const ungrounded = figures.filter((f) => ![...toolFigures].some((t) => near(t, f)) && !q.question.includes(`$${(f / 100).toLocaleString("en-US")}`));
    if (ungrounded.length) failures.push(`ungrounded ${ungrounded.map((c) => formatUSD(c)).join(", ")}`);
    if (turn.body.proposal) failures.push("unexpected proposal");
    if (q.must_not_change_state) {
      const actionsAfter = JSON.stringify(await client`select id, status from agent_actions where session_id = ${sid} order by id`);
      const budgetsAfter = JSON.stringify(await client`select category, month, limit_cents from budgets where session_id = ${sid} order by month, category`);
      if (actionsAfter !== actionsBefore || budgetsAfter !== budgetsBefore) failures.push("state changed");
    }
    if (turn.status !== 200) failures.push(`HTTP ${turn.status}`);

    const pass = failures.length === 0;
    rows.push({ id: q.id, question: q.question, expected, tools, pass, failures, reply, ms, cost_usd: audit?.details?.cost_usd ?? null });
    console.log(`${pass ? "PASS" : "FAIL"}  ${q.id}  [${tools.join(", ") || "no tools"}]${pass ? "" : `  → ${failures.join("; ")}`}`);
  }

  const passed = rows.filter((r) => r.pass).length;
  const cost = rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ");
  const md = `# AI Evaluation

Model: \`${MODEL}\` via OpenRouter · Simulated today: ${TODAY} · Run: ${new Date().toISOString()} · Total cost: $${cost.toFixed(4)}

**Result: ${passed}/${rows.length} passed** (gate: ≥ 7/8).

## Method

- Questions: [\`tests/eval/questions.json\`](../tests/eval/questions.json). Runner: [\`tests/eval/run.ts\`](../tests/eval/run.ts) (\`npm run eval\`).
- Every question runs against a **freshly reset** session through the real \`/api/chat\` endpoint.
- **Expected values are computed independently** by the domain functions from that session's DB rows (not by the LLM, not stored in the question file).
- A question passes only if: every expected dollar figure appears in the reply (±$0.01), expected phrases match, an expected tool was called (from \`tool_calls\`), **every dollar figure in the reply appears in that turn's tool outputs** (grounding), no proposal was created, and (for the injection question) no proposal or budget changed.

## Results

| # | Question | Expected | Tools called | Result |
|---|---|---|---|---|
${rows.map((r, i) => `| ${i + 1} | ${esc(r.question)} | ${esc(r.expected.join(", ") || "acknowledges missing data")} | ${r.tools.join(", ") || "none"} | ${r.pass ? "✅ pass" : `❌ ${esc(r.failures.join("; "))}`} |`).join("\n")}

## Replies

${rows.map((r, i) => `### ${i + 1}. ${r.question}\n\n${r.pass ? "✅" : "❌"} · ${r.ms} ms · tools: ${r.tools.join(", ") || "none"}\n\n> ${r.reply.trim().replace(/\n/g, "\n> ")}\n`).join("\n")}
`;
  writeFileSync("docs/AI_EVAL.md", md);
  writeFileSync("docs/evidence/ai-eval.json", JSON.stringify({ model: MODEL, today: TODAY, passed, total: rows.length, cost_usd: cost, results: rows }, null, 2));
  console.log(`\n${passed}/${rows.length} passed · cost $${cost.toFixed(4)} · wrote docs/AI_EVAL.md`);
  await client.end();
  process.exitCode = passed >= Math.min(7, rows.length) ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
