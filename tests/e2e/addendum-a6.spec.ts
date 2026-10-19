import { expect, test } from "@playwright/test";

// Gate A6: large purchase → "Let the agent fix it" → one turn with a two-month proposal → approve
// → Shopping overrun resolved. One real model turn, so it only runs with RUN_LLM_E2E=1.
test.skip(!process.env.RUN_LLM_E2E, "set RUN_LLM_E2E=1 to run tests that call the LLM");
test.skip(({ isMobile }) => isMobile, "one live flow is enough (desktop)");

const SHOTS = "docs/evidence/screens/addendum";

test("the agent fixes an overrun the rule engine can't, across October and November", async ({ page }) => {
  await page.goto("/");

  // 1. Simulate the large purchase from the menu.
  await page.getByRole("button", { name: "Simulate transaction" }).click();
  const simulated = page.waitForResponse((r) => r.url().endsWith("/api/simulate") && r.request().method() === "POST");
  await page.getByRole("menuitem", { name: /^Large purchase/ }).click();
  expect((await simulated).status()).toBe(201);

  // 2. Worth a look offers the agent instead of a single move.
  const fixButton = page.getByRole("button", { name: "Let the agent fix it" });
  await expect(fixButton).toBeVisible();
  await expect(page.getByText(/Shopping is \$[\d,.]+ over its \$250\.00 October budget/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/a6-1-let-the-agent-fix-it.png` });

  // 3. One click → one assistant turn → approval card already attached.
  const turn = page.waitForResponse((r) => r.url().endsWith("/api/chat") && r.request().method() === "POST");
  await fixButton.click();
  const body = await (await turn).json();
  expect(body.user.content).toBe("Fix my Shopping overrun for October.");
  expect(body.proposal).toMatchObject({ status: "pending", kind: "reallocation", totalDeltaCents: 0 });
  expect(body.proposal.overrunFix).toMatchObject({ category: "Shopping", covered_now_cents: 6_100, carried_cents: 13_400, uncovered_cents: 0 });
  expect(body.reply.trace.map((s: { tool: string }) => s.tool)).toEqual(expect.arrayContaining(["plan_overrun_fix", "propose_budget_adjustment"]));
  expect(body.reply.verification).toMatchObject({ status: "verified", all_matched: true });
  await expect(page.getByTestId("assistant-message")).toHaveCount(1);

  const card = page.getByTestId("approval-card").last();
  await expect(card.getByTestId("approval-month")).toHaveText(["October", "November"]);
  await expect(card.getByTestId("approval-footer")).toHaveText("Rebalances limits across October and November. It doesn't undo the spending.");
  await expect(card.getByTestId("overrun-split")).toHaveText("Covers $61.00 now · carries $134.00 to November");
  await expect(card.getByTestId("overrun-uncovered")).toHaveCount(0);
  await expect(page.getByTestId("assistant-message").last().getByTestId("verification-badge")).toHaveAttribute("data-status", "verified");
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/a6-2-two-month-proposal.png` });

  // 4. Approve → applied, and the Shopping overrun alert resolves.
  await card.getByTestId("approve").click();
  await expect(card).toHaveAttribute("data-status", "executed");
  await expect(card.getByText(/Applied/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/a6-3-approved.png` });

  const evidence = await (await page.request.get("/api/evidence")).json();
  const audit = evidence.audit_log as { event: string; details: Record<string, unknown> }[];
  const fromProposal = audit.slice(audit.findIndex((e) => e.event === "action_proposed" && e.details.action_id === body.proposal.id));
  const events = fromProposal.map((e) => e.event);
  for (const e of ["action_proposed", "action_approved", "action_executed", "alert_resolved"]) expect(events).toContain(e);
  expect(events.indexOf("action_executed")).toBeLessThan(events.indexOf("alert_resolved"));
  const shoppingOverrun = evidence.alerts.find((a: { dedupeKey: string }) => a.dedupeKey === "budget_overrun:Shopping:2026-10");
  expect(shoppingOverrun.status).toBe("resolved");

  await page.goto("/budgets");
  await expect(page.getByText(/Applied/).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/a6-4-budgets-after.png`, fullPage: true });
});
