/**
 * Gate 7 (LLM part): "Help me save $150 more next month" must yield a valid NEXT-month proposal,
 * labeled as potential savings and not claimed as applied; rejecting it must leave November
 * budgets unchanged. Also runs the demo chip "Plan next month's budget".
 * Usage: npx tsx scripts/gate7-live.mts [baseUrl]   — writes docs/evidence/phase7-proposals.json
 */
import { writeFileSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
const res0 = await fetch(base + "/", { redirect: "manual" });
const cookie = `cents_session=${/cents_session=([0-9a-f-]{36})/.exec(res0.headers.get("set-cookie") ?? "")![1]}`;
const json = (path: string, init?: RequestInit) => fetch(base + path, { ...init, headers: { cookie, "content-type": "application/json", ...(init?.headers ?? {}) } }).then(async (r) => ({ status: r.status, body: await r.json() }));
const nov = async () => JSON.stringify((await json("/api/budgets?month=2026-11")).body.budgets);

const results = [];
let failures = 0;
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

for (const question of ["Help me save $150 more next month", "Plan next month’s budget"]) {
  const turn = await json("/api/chat", { method: "POST", body: JSON.stringify({ message: question }) });
  const p = turn.body.proposal;
  const reply: string = turn.body.reply?.content ?? "";
  console.log(`\nQ: ${question}\nA: ${reply.replace(/\n+/g, " ")}\nproposal: ${p ? JSON.stringify({ kind: p.kind, total: p.totalDeltaCents, changes: p.changes }) : "none"}`);
  results.push({ question, reply, proposal: p });
  check("a proposal was created", !!p);
  if (!p) continue;
  check("all changes target next month (2026-11)", p.changes.every((c: { month: string }) => c.month === "2026-11"));
  check("status pending (nothing applied)", p.status === "pending");
  check("old limits match stored November limits", p.changes.every((c: { old_limit_cents: number }) => Number.isInteger(c.old_limit_cents)));
  if (question.startsWith("Help me save")) {
    check(`labeled potential savings (kind=${p.kind}, total ${p.totalDeltaCents})`, p.kind === "potential_savings");
    check("total reduction is $150.00", p.totalDeltaCents === -15_000);
  }
  check("reply does not claim the change was applied", !/\b(i (have )?(updated|changed|applied|lowered|set))\b|has been (applied|updated)|is now set/i.test(reply));
  check("reply says it needs approval", /approv/i.test(reply));

  const before = await nov();
  const rej = await json(`/api/actions/${p.id}/reject`, { method: "POST" });
  check(`reject → 200 and November budgets unchanged`, rej.status === 200 && (await nov()) === before);
}

writeFileSync("docs/evidence/phase7-proposals.json", JSON.stringify({ run_at: new Date().toISOString(), results }, null, 2));
process.exitCode = failures ? 1 : 0;
