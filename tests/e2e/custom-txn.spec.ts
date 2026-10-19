import { expect, test, type Page } from "@playwright/test";

// B1: custom transactions. The LLM impact-note test only runs with RUN_LLM_E2E=1; the rest is deterministic.
const SHOTS = "docs/evidence/screens/custom";
const vp = (isMobile: boolean) => (isMobile ? "mobile" : "desktop");

async function openDialog(page: Page) {
  await page.getByRole("button", { name: "Simulate transaction" }).click();
  await page.getByRole("menuitem", { name: "Custom transaction…" }).click();
  const dialog = page.getByTestId("custom-txn-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}
async function fill(page: Page, opts: { category?: string; amount: string; merchant?: string; ai?: boolean }) {
  const dialog = page.getByTestId("custom-txn-dialog");
  if (opts.category) await dialog.getByLabel("Category").selectOption(opts.category);
  await dialog.getByLabel("Amount").fill(opts.amount);
  if (opts.merchant) await dialog.getByLabel(/Merchant/).fill(opts.merchant);
  if (opts.ai === false) await dialog.getByRole("switch", { name: "Re-evaluate with AI" }).click();
}

test("the menu keeps the 6 presets on top and adds Custom transaction… above Reset demo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Simulate transaction" }).click();
  const items = await page.getByRole("menuitem").allInnerTexts();
  expect(items.map((t) => t.split("\n")[0].trim())).toEqual(["Restaurant", "Groceries", "New subscription", "Electricity bill", "Salary", "Large purchase", "Custom transaction…", "Reset demo"]);
});

test("dialog: validation, live preview tones, Esc closes and focus returns to Simulate", async ({ page, isMobile }) => {
  await page.goto("/");
  const dialog = await openDialog(page);
  const submit = dialog.getByTestId("custom-submit");
  await expect(submit).toBeDisabled();
  await expect(dialog.getByRole("radio", { name: "Expense" })).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByRole("switch", { name: "Re-evaluate with AI" })).toHaveAttribute("aria-checked", "true");
  // Inputs are ≥ 16px (no iOS zoom).
  for (const label of ["Category", "Amount"]) expect(await dialog.getByLabel(label).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);

  await dialog.getByLabel("Amount").fill("abc");
  await dialog.getByLabel("Amount").blur();
  await expect(dialog.getByText("Use a number with up to 2 decimals")).toBeVisible();
  await expect(dialog.getByLabel("Amount")).toHaveAttribute("aria-invalid", "true");
  await dialog.getByLabel("Amount").fill("10000.01");
  await expect(dialog.getByText("Amount must be between $0.01 and $10,000.00")).toBeVisible();
  await expect(submit).toBeDisabled();

  // Amber at ≥ 80%: Entertainment $73.50 + $50.00 = $123.50 of $150.00 (82%).
  await fill(page, { category: "Entertainment", amount: "50" });
  const preview = dialog.getByTestId("custom-preview");
  await expect(preview).toHaveText("Entertainment: $73.50 → $123.50 of $150.00 (82%)");
  await expect(preview).toHaveAttribute("data-tone", "warn");
  await page.screenshot({ path: `${SHOTS}/dialog-amber-${vp(isMobile)}.png` });
  // Red above 100%.
  await fill(page, { amount: "120", merchant: "Concert tickets" });
  await expect(preview).toHaveText("Entertainment: $73.50 → $193.50 of $150.00 (129%)");
  await expect(preview).toHaveAttribute("data-tone", "over");
  await expect(dialog.getByText("15/40")).toBeVisible();
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/dialog-red-${vp(isMobile)}.png` });

  if (isMobile) {
    // Bottom sheet, no page-level horizontal scroll.
    const box = (await dialog.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual((page.viewportSize()!.height ?? 0) - 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Simulate transaction" })).toBeFocused();
});

test("adding a custom expense with AI off updates the dashboard and makes no impact call", async ({ page }) => {
  await page.goto("/");
  let impactCalls = 0;
  page.on("request", (r) => r.url().endsWith("/api/chat/impact") && impactCalls++);
  await openDialog(page);
  await fill(page, { category: "Entertainment", amount: "120", merchant: "Concert tickets", ai: false });
  const done = page.waitForResponse((r) => r.url().endsWith("/api/simulate") && r.request().method() === "POST");
  await page.getByTestId("custom-submit").click();
  const res = await done;
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.transaction).toMatchObject({ merchant: "Concert tickets", amountCents: -12_000, category: "Entertainment", origin: "custom" });
  expect(body.alerts.created.length).toBeGreaterThan(0);
  expect(body.proposals).toEqual({ stale: [] });
  await expect(page.getByText("Transaction added")).toBeVisible();
  await expect(page.getByTestId("custom-txn-dialog")).toBeHidden();
  // Dashboard re-evaluated without a reload: the transaction is listed and the overrun shows in Worth a look.
  await expect(page.getByText("Concert tickets").first()).toBeVisible();
  await expect(page.getByText(/Entertainment is \$43\.50 over its \$150\.00 October budget/)).toBeVisible();
  await page.waitForTimeout(3_500);
  expect(impactCalls).toBe(0);
});

test("if the impact note fails, the dashboard still updates and a muted line explains it", async ({ page }) => {
  await page.route("**/api/chat/impact", (route) => route.fulfill({ status: 502, json: { error: "upstream" } }));
  await page.goto("/");
  await openDialog(page);
  await fill(page, { category: "Dining", amount: "12.40" });
  await page.getByTestId("custom-submit").click();
  await expect(page.getByTestId("impact-pending")).toBeVisible();
  await expect(page.getByTestId("chat-notice")).toHaveText("AI impact note unavailable. Your dashboard is up to date.", { timeout: 10_000 });
  await expect(page.getByTestId("chat-notice")).toHaveClass(/text-text-muted/);
  await expect(page.getByText("Custom: Dining").first()).toBeVisible();
});

test.describe("live impact note", () => {
  test.skip(!process.env.RUN_LLM_E2E, "set RUN_LLM_E2E=1 to run tests that call the LLM");

  test("custom expense → dashboard update → one impact note with the chip, verified, with receipts", async ({ page, isMobile }) => {
    await page.goto("/");
    await openDialog(page);
    await fill(page, { category: "Entertainment", amount: "120", merchant: "Concert tickets" });
    const impact = page.waitForResponse((r) => r.url().endsWith("/api/chat/impact"), { timeout: 60_000 });
    await page.getByTestId("custom-submit").click();
    await expect(page.getByText("Concert tickets").first()).toBeVisible();
    await expect(page.getByTestId("impact-pending")).toBeVisible();
    const res = await impact;
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.reply).toMatchObject({ kind: "impact", verification: { status: "verified" } });
    expect(body.reply.trace.length).toBeGreaterThan(0);
    const note = page.getByTestId("assistant-message").last();
    await expect(note.getByTestId("impact-chip")).toHaveText("Impact of new transaction");
    await expect(note.getByTestId("receipts")).toBeVisible();
    // The hidden fixed prompt is not shown as a user bubble.
    await expect(page.getByText("[Impact of new transaction]")).toHaveCount(0);
    await note.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/impact-note-${vp(isMobile)}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
