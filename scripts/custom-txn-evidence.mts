/**
 * Gate B1 evidence: on a fresh session, add a custom transaction ($120 Entertainment "Concert tickets"),
 * run the AI impact note, and export /api/evidence → docs/evidence/custom-txn-evidence.json.
 * Usage: npx tsx scripts/custom-txn-evidence.mts [baseUrl]   (one LLM call)
 */
import { writeFileSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
const r0 = await fetch(base + "/", { redirect: "manual" });
const cookie = `cents_session=${/cents_session=([0-9a-f-]{36})/.exec(r0.headers.get("set-cookie") ?? "")![1]}`;
const call = async (path: string, init?: RequestInit) => {
  const res = await fetch(base + path, { ...init, headers: { cookie, "content-type": "application/json" } });
  return { status: res.status, body: await res.json() };
};

const added = await call("/api/simulate", {
  method: "POST",
  body: JSON.stringify({ kind: "custom", type: "expense", category: "Entertainment", amountCents: 12_000, merchant: "Concert tickets", idempotencyKey: crypto.randomUUID() }),
});
console.log("simulate", added.status, added.body.transaction, "alerts", added.body.alerts, "proposals", added.body.proposals);
const impact = await call("/api/chat/impact", { method: "POST", body: JSON.stringify({ transactionId: added.body.transaction.id }) });
console.log("impact", impact.status, impact.body.reply?.kind, impact.body.reply?.verification?.status, impact.body.reply?.trace?.map((s: { tool: string }) => s.tool));
const evidence = await call("/api/evidence");

const e = evidence.body;
const events = e.audit_log.map((a: { event: string }) => a.event);
const custom = e.audit_log.find((a: { event: string; details: { origin?: string } }) => a.event === "transaction_simulated" && a.details.origin === "custom");
const impactCalls = e.tool_calls.filter((t: { messageId: string }) => t.messageId === impact.body.reply?.id).map((t: { toolName: string }) => t.toolName);
const summary = {
  custom_transaction_logged: !!custom,
  checks_after_it: events.slice(events.indexOf("transaction_simulated")).filter((ev: string) => ev.startsWith("alert_") || ev.startsWith("action_")),
  impact_note: { requested: events.includes("impact_note_requested"), completed: events.includes("impact_note_completed"), tool_calls: impactCalls },
};
console.log(JSON.stringify(summary, null, 2));
writeFileSync("docs/evidence/custom-txn-evidence.json", JSON.stringify({ generated_at: new Date().toISOString(), note: "Simulated demo account. All data is synthetic.", summary, evidence: e }, null, 2));
console.log("wrote docs/evidence/custom-txn-evidence.json");
