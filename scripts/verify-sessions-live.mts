/**
 * Live check of session isolation + reset against the configured database through a running app.
 * Usage: npx tsx scripts/verify-sessions-live.ts [baseUrl]   (reads .env.local; prints no secrets)
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });
const base = process.argv[2] ?? "http://localhost:3000";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function newVisitor(): Promise<string> {
  const res = await fetch(base + "/", { redirect: "manual" });
  const cookie = res.headers.get("set-cookie") ?? "";
  const match = /cents_session=([0-9a-f-]{36})/.exec(cookie);
  if (!match) throw new Error(`no session cookie (status ${res.status})`);
  if (!/HttpOnly/i.test(cookie) || !/SameSite=lax/i.test(cookie)) throw new Error("cookie flags missing");
  return match[1];
}

async function snapshot(id: string) {
  const [tx] = await sql`select count(*)::int n, coalesce(sum(amount_cents),0)::bigint s from transactions where session_id = ${id}`;
  const [bu] = await sql`select count(*)::int n, coalesce(sum(limit_cents),0)::bigint s from budgets where session_id = ${id}`;
  const [bi] = await sql`select count(*)::int n, count(*) filter (where status='unpaid')::int unpaid from bills where session_id = ${id}`;
  return `tx=${tx.n}/${tx.s} budgets=${bu.n}/${bu.s} bills=${bi.n}/${bi.unpaid}`;
}

const check = (label: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) process.exitCode = 1;
};

try {
  const a = await newVisitor();
  const b = await newVisitor();
  check("two visitors get two different session cookies", a !== b);
  const seedA = await snapshot(a);
  const seedB = await snapshot(b);
  console.log("      A:", seedA, "\n      B:", seedB);
  check("both sessions seeded identically", seedA === seedB && !seedA.startsWith("tx=0"));

  const [acct] = await sql`select id from accounts where session_id = ${a}`;
  await sql`insert into transactions (session_id, account_id, amount_cents, category, merchant, occurred_at, type, source, sim_event_id, idempotency_key)
            values (${a}, ${acct.id}, -6000, 'Dining', 'Bella Napoli', '2026-10-15T12:00:00Z', 'expense', 'simulated', 'restaurant', ${crypto.randomUUID()})`;
  check("change in A is visible in A", (await snapshot(a)) !== seedA);
  check("B is unchanged after A changed", (await snapshot(b)) === seedB);

  const reset = await fetch(base + "/api/reset", { method: "POST", headers: { cookie: `cents_session=${a}` } });
  const body = await reset.json();
  check(`POST /api/reset → 200 epoch 1 (got ${reset.status} ${JSON.stringify(body)})`, reset.status === 200 && body.epoch === 1);
  check("reset restores A to the exact seed state", (await snapshot(a)) === seedA);
  const events = (await sql`select event from audit_log where session_id = ${a} order by created_at`).map((r) => r.event);
  check(`audit log kept across reset (${events.join(", ")})`, events.includes("session_created") && events.includes("demo_reset"));

  // A forged/invalid cookie is replaced by a brand-new session; it can never address another session.
  const forged = await fetch(base + "/api/reset", { method: "POST", headers: { cookie: "cents_session=not-a-uuid" } });
  const fresh = /cents_session=([0-9a-f-]{36})/.exec(forged.headers.get("set-cookie") ?? "")?.[1];
  check("invalid cookie → a new session is issued (no existing session touched)", !!fresh && fresh !== a && fresh !== b);
  check("B still unchanged after all of the above", (await snapshot(b)) === seedB);

  const rls = await sql`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname <> '__drizzle_migrations'`;
  check(`RLS enabled on all ${rls.length} tables`, rls.length === 10 && rls.every((r) => r.relrowsecurity));
  const [pol] = await sql`select count(*)::int n from pg_policies where schemaname = 'public'`;
  check("no RLS policies exist (nothing readable by non-owner roles)", pol.n === 0);
} finally {
  await sql.end();
}
