import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const PAGES = [
  { path: "/", nav: "Overview", slug: "overview", expectText: "Total balance" },
  { path: "/transactions", nav: "Transactions", slug: "transactions", expectText: "Bella Napoli" },
  { path: "/budgets", nav: "Budgets", slug: "budgets", expectText: "Pending proposals" },
  { path: "/budgets?month=next", nav: "Budgets", slug: "budgets-next", expectText: "planning next month" },
  { path: "/bills", nav: "Bills", slug: "bills", expectText: "Due before your next income" },
  { path: "/insights", nav: "Insights", slug: "insights", expectText: "Action log" },
  { path: "/assistant", nav: "Assistant", slug: "assistant", expectText: "Ask about your simulated account" },
  { path: "/settings", nav: "Settings", slug: "settings", expectText: "All data is synthetic." },
];

for (const p of PAGES) {
  test(`${p.slug}: real data, active nav, no console errors, no horizontal scroll`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    for (const eventId of ["restaurant", "large_purchase"]) {
      const res = await page.request.post("/api/simulate", { data: { eventId, idempotencyKey: randomUUID() } });
      expect(res.status()).toBe(201);
    }
    await page.goto(p.path);
    await expect(page.getByText(p.expectText).first()).toBeVisible();

    const mobile = info.project.name === "mobile";
    if (mobile) await page.getByRole("button", { name: "Open menu" }).click();
    const current = page.locator('a[aria-current="page"]:visible');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(p.nav);
    if (mobile) await page.keyboard.press("Escape");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `docs/evidence/screens/page-${p.slug}-${info.project.name}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test("transactions filters: month, category and search narrow the list", async ({ page }) => {
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { name: /October 2026 · \d+ transactions/ })).toBeVisible();
  await page.getByLabel("Category").selectOption("Dining");
  await expect(page).toHaveURL(/category=Dining/);
  await expect(page.getByTestId("tx-list").locator("li").first()).toContainText("Dining");
  await page.getByLabel("Month").selectOption("2026-09");
  await expect(page.getByRole("heading", { name: /September 2026/ })).toBeVisible();
  await page.getByPlaceholder("Search merchant or category").fill("SYSTEM NOTE");
  await expect(page).toHaveURL(/q=SYSTEM/);
  await expect(page.getByTestId("tx-list").locator("li")).toHaveCount(1);
  await page.getByLabel("Month").selectOption("all");
  await expect(page.getByRole("heading", { name: /All months/ })).toBeVisible();
});

test("budgets page: approving the pending proposal updates the list", async ({ page }) => {
  await page.goto("/");
  await page.request.post("/api/simulate", { data: { eventId: "restaurant", idempotencyKey: randomUUID() } });
  await page.goto("/budgets");
  await expect(page.locator('[data-category="Dining"]')).toContainText("Over by $25.00");
  await page.getByTestId("approve").click();
  await expect(page.locator('[data-category="Dining"]')).toContainText("$325.00 / $325.00", { timeout: 15_000 });
  await expect(page.getByText("Nothing waiting for approval")).toBeVisible();
  await expect(page.getByText("Applied").first()).toBeVisible();
});

test("evidence export downloads this session's JSON", async ({ page }) => {
  await page.goto("/settings");
  const res = await page.request.get("/api/evidence");
  expect(res.headers()["content-disposition"]).toMatch(/attachment; filename="cents-evidence-/);
  const body = await res.json();
  expect(body.audit_log.map((e: { event: string }) => e.event)).toContain("session_created");
  expect(Object.keys(body)).toEqual(["exported_at", "note", "session", "audit_log", "tool_calls", "agent_actions", "alerts"]);
});
