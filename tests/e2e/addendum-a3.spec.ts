import { expect, test } from "@playwright/test";

test("Bills page shows the usual-amount line for each upcoming bill", async ({ page, isMobile }) => {
  await page.goto("/bills");
  const lines = page.getByTestId("bill-usual");
  await expect(lines.first()).toBeVisible();
  await expect(page.getByText("Avg $112.22 · ↑ 6.9% vs usual")).toBeVisible();
  await expect(page.getByText(/Avg \$[\d,]+\.\d{2} · same as usual/).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `docs/evidence/screens/addendum/a3-bills-${isMobile ? "mobile" : "desktop"}.png`, fullPage: true });
});

test("Analyze my bills chip is on the dashboard", async ({ page, isMobile }) => {
  await page.goto("/");
  const chip = page.getByRole("button", { name: "Analyze my bills" });
  await expect(chip).toBeAttached();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await chip.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `docs/evidence/screens/addendum/a3-chips-${isMobile ? "mobile" : "desktop"}.png` });
});
