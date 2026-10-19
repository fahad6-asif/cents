// A8: per-tool latency against the real database (same code path the chat route uses), and the
// cost of loading one session's data. Usage: npx tsx scripts/perf-tools.mts [runs=5]
// Read-only apart from creating one fresh demo session; never prints secrets.
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { TOOLS, executeTool, type ToolContext } from "../src/lib/agent/tools";
import { loadSessionData } from "../src/lib/db/queries";
import * as schema from "../src/lib/db/schema";
import { ensureSession } from "../src/lib/db/sessions";
import type { Db } from "../src/lib/db/types";

config({ path: ".env.local", quiet: true });
const RUNS = Number(process.argv[2] ?? 5);
const TODAY = process.env.SIM_TODAY ?? "2026-10-15";
const ARGS: Record<string, unknown> = {
  get_account_summary: {},
  get_transactions: { month: "2026-10", category: "Dining" },
  get_spending_by_category: { month: "2026-10" },
  get_budget_status: { month: "2026-10" },
  get_upcoming_bills: { days: 14 },
  compare_monthly_spending: { month_a: "2026-08", month_b: "2026-09" },
  check_affordability: { amount_cents: 90_000 },
  find_recurring_charges: {},
  analyze_bills: { bill: "Electricity" },
  plan_overrun_fix: { category: "Dining", month: "2026-10" },
  get_category_history: {},
  get_proposals: {},
};

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 5 });
  const db = drizzle({ client, schema }) as unknown as Db;
  const sessionId = randomUUID();
  await ensureSession(db, sessionId, TODAY);
  const ctx: ToolContext = { db, sessionId, epoch: 0, today: TODAY };
  await client`select 1`; // warm the connection

  const rtt: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    await client`select 1`;
    rtt.push(performance.now() - t);
  }
  const load: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    await loadSessionData(db, sessionId);
    load.push(performance.now() - t);
  }
  console.log(`| DB round trip (select 1) | ${Math.round(pct(rtt, 50))} | ${Math.round(pct(rtt, 95))} |`);
  console.log(`| loadSessionData | ${Math.round(pct(load, 50))} | ${Math.round(pct(load, 95))} |`);

  const all: number[] = [];
  for (const t of TOOLS) {
    if (t.kind !== "read") continue;
    const ms: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const s = performance.now();
      const r = await executeTool(ctx, t.name, JSON.stringify(ARGS[t.name] ?? {}), { proposal: null });
      ms.push(performance.now() - s);
      if (!r.ok) throw new Error(`${t.name} failed`);
    }
    all.push(...ms);
    console.log(`| ${t.name} | ${Math.round(pct(ms, 50))} | ${Math.round(pct(ms, 95))} |`);
  }
  console.log(`| **all read tools** | **${Math.round(pct(all, 50))}** | **${Math.round(pct(all, 95))}** |`);

  // As the chat route runs them (A8): one snapshot per turn, prefetched while the model thinks.
  if (process.argv.includes("--snapshot")) {
    console.log("\nWith a per-turn snapshot (loaded once, before the tools run):");
    const snap = loadSessionData(db, sessionId);
    await snap;
    const withSnap: ToolContext = { ...ctx, snapshot: () => snap };
    const shared: number[] = [];
    for (const t of TOOLS) {
      if (t.kind !== "read") continue;
      const ms: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        const s = performance.now();
        await executeTool(withSnap, t.name, JSON.stringify(ARGS[t.name] ?? {}), { proposal: null });
        ms.push(performance.now() - s);
      }
      shared.push(...ms);
      console.log(`| ${t.name} | ${Math.round(pct(ms, 50))} | ${Math.round(pct(ms, 95))} |`);
    }
    console.log(`| **all read tools** | **${Math.round(pct(shared, 50))}** | **${Math.round(pct(shared, 95))}** |`);
  }
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
