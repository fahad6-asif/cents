/**
 * Execution evidence for submission: runs the core scenario on one fresh session and exports its
 * /api/evidence log. Default target is production. Four real model turns (about $0.005).
 *
 *   simulate (restaurant) → calculation → alert + "Move $25" proposal → AI explains (tool calls,
 *   verified) → AI plans next month (proposal) → user REJECTS it → user APPROVES the $25 move →
 *   execution → alert resolved → custom transaction → re-evaluation → AI impact note → log.
 *
 * Usage: npx tsx scripts/core-scenario-evidence.mts [baseUrl]
 * Writes docs/evidence/evidence_core_scenario.json (synthetic demo data; no secrets).
 */
import { writeFileSync } from "node:fs";

const base = process.argv[2] ?? "https://cents-iota.vercel.app";
const r0 = await fetch(base + "/", { redirect: "manual" });
const cookie = `cents_session=${/cents_session=([0-9a-f-]{36})/.exec(r0.headers.get("set-cookie") ?? "")![1]}`;
const call = async (path: string, init?: RequestInit) => {
  const res = await fetch(base + path, { ...init, headers: { cookie, "content-type": "application/json" } });
  return { status: res.status, body: await res.json() };
};
const post = (path: string, body?: unknown) => call(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

const steps: { step: string; result: unknown }[] = [];
const log = (step: string, result: unknown) => {
  steps.push({ step, result });
  console.log(`✓ ${step}`);
};
const usd = (c: number) => `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;

// 1. Simulate + calculation + alert + rule-engine proposal.
const sim = await post("/api/simulate", { eventId: "restaurant", idempotencyKey: crypto.randomUUID() });
const top = sim.body.overview.worthALook.top;
log("1. Simulate transaction: Restaurant (−$60.00)", {
  status: sim.status,
  transaction: sim.body.transaction,
  alerts_created: sim.body.alerts.created.length,
  worth_a_look: { title: top.title, body: top.body, one_click_fix: top.proposal ? `Move ${usd(top.proposal.amountCents)} to ${top.proposal.to}` : null },
  balance_after: usd(sim.body.overview.summary.balanceCents),
});

// 2. The assistant explains it (tool calls + verified figures).
const why = await post("/api/chat", { message: "Why am I over budget, and what can I do?" });
log("2. Ask: “Why am I over budget, and what can I do?”", {
  status: why.status,
  tools: why.body.reply.trace.map((s: { tool: string; label: string }) => `${s.tool} (${s.label})`),
  verification: { status: why.body.reply.verification?.status, figures_checked: why.body.reply.verification?.total_count },
  reply: why.body.reply.content,
});

// 3. The assistant plans next month → a pending proposal → the user rejects it.
const plan = await post("/api/chat", { message: "Plan next month’s budget" });
const planned = plan.body.proposal;
log("3. Ask: “Plan next month’s budget” → proposal", {
  status: plan.status,
  tools: plan.body.reply.trace.map((s: { tool: string }) => s.tool),
  proposal: planned && { id: planned.id, status: planned.status, kind: planned.kind, total_change: usd(planned.totalDeltaCents), changes: planned.changes },
  verification: plan.body.reply.verification?.status,
});
const rejected = await post(`/api/actions/${planned.id}/reject`);
const nov = (await call("/api/budgets?month=2026-11")).body.budgets.map((b: { category: string; limitCents: number }) => `${b.category} ${usd(b.limitCents)}`);
log("4. User rejects the plan (button) → nothing changes", { status: rejected.status, proposal_status: rejected.body.proposal?.status, november_limits_after: nov });

// 4. The user approves the rule-engine fix → execution → alert resolved.
const approved = await post(`/api/actions/${top.proposal.id}/approve`);
const again = await post(`/api/actions/${top.proposal.id}/approve`);
log("5. User approves “Move $25 to Dining” (button) → executed; a second approve is blocked", {
  status: approved.status,
  proposal_status: approved.body.proposal?.status,
  applied: approved.body.proposal?.result,
  second_approve_status: again.status,
});

// 5. A custom transaction → re-evaluation → AI impact note.
const custom = await post("/api/simulate", { kind: "custom", type: "expense", category: "Entertainment", amountCents: 12_000, merchant: "Concert tickets", idempotencyKey: crypto.randomUUID() });
log("6. Custom transaction: Entertainment −$120.00 “Concert tickets”", {
  status: custom.status,
  transaction: custom.body.transaction,
  alerts_created: custom.body.alerts.created.length,
  proposals_made_stale: custom.body.proposals.stale.length,
  worth_a_look: custom.body.overview.worthALook?.top?.body,
});
const impact = await post("/api/chat/impact", { transactionId: custom.body.transaction.id });
log("7. AI impact note (fixed prompt, server-computed facts, read tools only)", {
  status: impact.status,
  steps: impact.body.reply.trace.map((s: { tool: string; label: string; key_figures: string[] }) => ({ tool: s.tool, label: s.label, key_figures: s.key_figures })),
  verification: { status: impact.body.reply.verification?.status, figures_checked: impact.body.reply.verification?.total_count },
  proposal_created: impact.body.proposal !== null,
  reply: impact.body.reply.content,
});

// 6. The full log.
const evidence = (await call("/api/evidence")).body;
const events: string[] = evidence.audit_log.map((a: { event: string }) => a.event);
const count = (e: string) => events.filter((x) => x === e).length;
const summary = {
  target: base,
  generated_at: new Date().toISOString(),
  chain: "simulation → calculation → alert → tool calls → proposal → rejection / approval → execution → log",
  audit_events: Object.fromEntries([...new Set(events)].map((e) => [e, count(e)])),
  tool_calls: evidence.tool_calls.length,
  proposals: evidence.agent_actions.map((a: { origin: string; status: string }) => `${a.origin}: ${a.status}`),
  alerts: evidence.alerts.map((a: { dedupeKey: string; status: string }) => `${a.dedupeKey.split(":").slice(0, 2).join(":")} → ${a.status}`),
  verification: evidence.verification,
};
log("8. Export /api/evidence (this session only)", summary);

writeFileSync(
  "docs/evidence/evidence_core_scenario.json",
  JSON.stringify({ note: "Simulated demo account. All data is synthetic. Recorded on the live site.", summary, steps, evidence }, null, 2),
);
console.log("\nwrote docs/evidence/evidence_core_scenario.json");
console.log(JSON.stringify(summary, null, 2));
