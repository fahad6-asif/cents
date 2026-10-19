import { expect, test } from "@playwright/test";

// One real model turn per viewport (the "$900" question), so it only runs with RUN_LLM_E2E=1.
test.skip(!process.env.RUN_LLM_E2E, "set RUN_LLM_E2E=1 to run tests that call the LLM");

test("receipts panel: expands, matches this message's tool_calls, carries no IDs or secrets", async ({ page, isMobile }) => {
  await page.goto("/");
  const turnResponse = page.waitForResponse((r) => r.url().endsWith("/api/chat") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Can I afford a $900 purchase?" }).click();
  const res = await turnResponse;
  const raw = await res.text();
  const body = JSON.parse(raw);

  // No secrets or identifiers in the payload.
  expect(raw).not.toMatch(/session|DATABASE_URL|OPENROUTER_API_KEY|sk-or-/i);
  expect(JSON.stringify(body.reply.trace)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);

  const answer = page.getByTestId("assistant-message").last();
  const line = answer.getByTestId("receipts");
  await expect(line).toContainText(`✦ ${body.reply.trace.length} step`);
  await expect(line.getByTestId("verification-badge")).toHaveAttribute("data-status", "verified");
  await expect(line).toContainText(/\d+\.\ds/);

  await line.getByRole("button").click();
  const steps = answer.getByTestId("trace-step");
  await expect(steps).toHaveCount(body.reply.trace.length);

  // Rows match the tool_calls logged for this message, in order, with the server's labels.
  const evidence = await (await page.request.get("/api/evidence")).json();
  const logged = evidence.tool_calls.filter((c: { messageId: string }) => c.messageId === body.reply.id).map((c: { toolName: string }) => c.toolName);
  expect(await steps.evaluateAll((els) => els.map((e) => e.getAttribute("data-tool")))).toEqual(logged);
  for (const [i, s] of body.reply.trace.entries()) await expect(steps.nth(i)).toContainText(s.label);
  await expect(answer.getByText("Ran affordability check")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await answer.scrollIntoViewIfNeeded();
  await expect(steps.last()).toBeInViewport();
  await page.waitForTimeout(400); // let the smooth scroll settle before the screenshot
  await page.screenshot({ path: `docs/evidence/screens/addendum/a5-receipts-${isMobile ? "mobile" : "desktop"}.png` });

  // Same thread, same receipts on the Assistant page after a reload.
  await page.goto("/assistant");
  const again = page.getByTestId("assistant-message").last();
  await again.getByTestId("receipts").getByRole("button").click();
  await expect(again.getByTestId("trace-step")).toHaveCount(body.reply.trace.length);
});
