/**
 * B3 demo walk on a fresh session: custom $120 Entertainment "Concert tickets" → dashboard update →
 * impact note → approve the one-click fix → overrun resolved. Prints PASS/FAIL per step (one LLM call).
 * Usage: npx tsx scripts/demo-custom-walk.mts [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:3000";
const r0 = await fetch(base + "/", { redirect: "manual" });
const cookie = `cents_session=${/cents_session=([0-9a-f-]{36})/.exec(r0.headers.get("set-cookie") ?? "")![1]}`;
const call = async (path: string, init?: RequestInit) => {
  const res = await fetch(base + path, { ...init, headers: { cookie, "content-type": "application/json" } });
  return { status: res.status, body: await res.json() };
};
let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

const added = await call("/api/simulate", {
  method: "POST",
  body: JSON.stringify({ kind: "custom", type: "expense", category: "Entertainment", amountCents: 12_000, merchant: "Concert tickets", idempotencyKey: crypto.randomUUID() }),
});
check("custom transaction stored (201, origin custom, −$120.00)", added.status === 201 && added.body.transaction.origin === "custom" && added.body.transaction.amountCents === -12_000);
const ov = added.body.overview;
check("dashboard re-evaluated: balance $5,722.13", ov.summary.balanceCents === 572_213, String(ov.summary.balanceCents));
const top = ov.worthALook?.top;
check("Worth a look offers the one-click fix for Entertainment", top?.type === "budget_overrun" && !!top?.proposal, top?.title);

const impact = await call("/api/chat/impact", { method: "POST", body: JSON.stringify({ transactionId: added.body.transaction.id }) });
const reply = impact.body.reply;
check("impact note returned (kind impact)", impact.status === 200 && reply?.kind === "impact");
check("impact note verified", reply?.verification?.status === "verified", `${reply?.verification?.verified_count}/${reply?.verification?.total_count}`);
check("receipts start with the server fact check", reply?.trace?.[0]?.tool === "impact_facts");
check("impact note created no proposal (rule engine already has the fix)", impact.body.proposal === null);
console.log(`\n${reply?.content}\n`);

const approved = await call(`/api/actions/${top.proposal.id}/approve`, { method: "POST" });
check("approve the fix → executed", approved.status === 200 && approved.body.proposal?.status === "executed");
const evidence = (await call("/api/evidence")).body;
const overrun = evidence.alerts.find((a: { dedupeKey: string }) => a.dedupeKey === "budget_overrun:Entertainment:2026-10");
check("Entertainment overrun alert resolved", overrun?.status === "resolved");
const events: string[] = evidence.audit_log.map((a: { event: string }) => a.event);
for (const e of ["transaction_simulated", "alert_created", "action_proposed", "impact_note_requested", "chat_message", "reply_verified", "impact_note_completed", "action_approved", "action_executed", "alert_resolved"]) {
  check(`audit has ${e}`, events.includes(e));
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exitCode = failures ? 1 : 0;
