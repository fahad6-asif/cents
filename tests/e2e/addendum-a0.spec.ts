import { expect, test } from "@playwright/test";

const ROWS = [/^Restaurant/, /^Groceries/, /^New subscription/, /^Electricity bill/, /^Salary/, /^Large purchase/];

test("every Simulate menu row is a menuitem and one click fires exactly one POST /api/simulate", async ({ page }) => {
  await page.goto("/");
  const posts: string[] = [];
  page.on("request", (r) => r.method() === "POST" && r.url().endsWith("/api/simulate") && posts.push(r.url()));
  for (const [i, name] of ROWS.entries()) {
    await page.getByRole("button", { name: "Simulate transaction" }).click();
    const done = page.waitForResponse((r) => r.url().endsWith("/api/simulate") && r.request().method() === "POST");
    await page.getByRole("menuitem", { name }).click();
    expect((await done).status()).toBe(201);
    await expect(page.getByRole("button", { name: "Simulate transaction" })).toBeEnabled();
    expect(posts).toHaveLength(i + 1);
  }
});

test("no hydration or console errors after approving a proposal and reloading", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => (m.type() === "error" || /hydrat/i.test(m.text())) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const sim = await (await page.request.post("/api/simulate", { data: { eventId: "restaurant", idempotencyKey: crypto.randomUUID() } })).json();
  const id = sim.overview.worthALook.top.proposal.id;
  expect((await page.request.post(`/api/actions/${id}/approve`)).status()).toBe(200);
  for (const path of ["/", "/budgets", "/insights", "/assistant", "/transactions", "/bills", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  await page.goto("/budgets");
  await expect(page.getByText(/Applied/).first()).toBeVisible();
  await page.screenshot({ path: "docs/evidence/screens/addendum/a0-budgets-after-approve.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("Insights fact chips are human labels and real-clock times are labelled", async ({ page }) => {
  await page.goto("/insights");
  const chips = page.getByTestId("active-alerts");
  await expect(chips.getByText("88% used")).toBeVisible();
  await expect(chips.getByText("Limit $300.00")).toBeVisible();
  await expect(chips.getByText(/^Due (Tue|Thu) 2\d Oct$/).first()).toBeVisible();
  await expect(chips.getByText(/^In \d days$/).first()).toBeVisible();
  await expect(chips.getByText(/percent:|days until due:|due date:/)).toHaveCount(0);
  await expect(chips.getByText(/^Logged \d+ \w{3}, \d+:\d{2} UTC$/).first()).toBeVisible();
});
