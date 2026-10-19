import { expect, test } from "@playwright/test";

test("Budgets page shows a pace / history line under each current-month bar (no LLM)", async ({ page, isMobile }) => {
  await page.goto("/budgets");
  const row = (category: string) => page.locator(`li[data-category="${category}"]`);
  await expect(row("Dining").getByTestId("pace-line")).toHaveText("Ahead of pace, projected $547.67");
  await expect(row("Shopping").getByTestId("pace-line")).toHaveText("Over in 2 of last 3 months");
  await expect(row("Housing").getByTestId("pace-line")).toHaveText("On pace");
  await expect(row("Transport").getByTestId("pace-line")).toHaveText("On pace");
  await expect(page.getByTestId("pace-line")).toHaveCount(9);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `docs/evidence/screens/addendum/a7-budgets-${isMobile ? "mobile" : "desktop"}.png`, fullPage: true });

  // Next month has no pace yet.
  await page.goto("/budgets?month=next");
  await expect(page.getByTestId("budget-list")).toBeVisible();
  await expect(page.getByTestId("pace-line")).toHaveCount(0);
});
