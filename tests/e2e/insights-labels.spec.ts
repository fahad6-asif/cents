import { expect, test } from "@playwright/test";

test("the Insights action log shows human labels only (custom transactions included)", async ({ page }) => {
  await page.goto("/");
  const res = await page.request.post("/api/simulate", {
    data: { kind: "custom", type: "expense", category: "Entertainment", amountCents: 12_000, merchant: "Concert tickets", idempotencyKey: crypto.randomUUID() },
  });
  expect(res.status()).toBe(201);
  await page.goto("/insights");
  const log = page.getByTestId("action-log");
  await expect(log.getByText("Custom −$120.00 (Entertainment)")).toBeVisible();
  const text = await log.innerText();
  expect(text).not.toContain("undefined");
  // No raw event names like reply_verified or action_stale.
  expect(text).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
});

test.describe("with a live AI answer", () => {
  test.skip(!process.env.RUN_LLM_E2E, "set RUN_LLM_E2E=1 to run tests that call the LLM");
  test.skip(({ isMobile }) => isMobile, "one live turn is enough (desktop)");

  test("verification and tool names read as plain words", async ({ page }) => {
    await page.goto("/");
    const turn = await page.request.post("/api/chat", { data: { message: "Can I afford a $900 purchase?" }, timeout: 90_000 });
    expect(turn.status()).toBe(200);
    await page.goto("/insights");
    const log = page.getByTestId("action-log");
    await expect(log.getByText("Answer verified").first()).toBeVisible();
    await expect(log.getByText(/Used: affordability check/).first()).toBeVisible();
    expect(await log.innerText()).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
  });
});
