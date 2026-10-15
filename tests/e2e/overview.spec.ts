import { expect, test } from "@playwright/test";

const MINUS = "−";
/** "$918" / "+$918.28" / "−$60" → integer dollars (sign kept). */
function dollars(text: string): number {
  const negative = text.includes(MINUS) || text.includes("-") || /behind/.test(text);
  const value = Math.round(Number(text.replace(/[^0-9.]/g, "")));
  return negative ? -value : value;
}

test.describe("Overview", () => {
  test("renders real data with one consistent net figure and no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    const api = await (await page.request.get("/api/overview")).json();

    await expect(page.getByTestId("balance")).toHaveText(`$${(api.summary.balanceCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    const net = Math.round(api.summary.netCents / 100);
    expect(dollars(await page.getByTestId("ahead-amount").innerText())).toBe(net);
    expect(dollars((await page.getByTestId("balance-delta").innerText()).split("(")[0])).toBe(net);
    expect(dollars(await page.getByTestId("cashflow-net").innerText())).toBe(net);
    await expect(page.getByTestId("balance-delta")).toContainText(`(${api.summary.changePct.toFixed(1)}%)`);

    await expect(page.getByText("Simulated account").first()).toBeAttached();
    await expect(page.getByText("Spending by category")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("range tabs switch the balance series", async ({ page }) => {
    await page.goto("/");
    for (const [range, points] of [["1Y", 366], ["1W", 8], ["3M", 91]] as const) {
      const response = page.waitForResponse((r) => r.url().includes(`/api/overview?range=${range}`));
      await page.getByRole("tab", { name: range }).click();
      const body = await (await response).json();
      expect(body.series.points).toHaveLength(points);
      await expect(page.getByRole("tab", { name: range })).toHaveAttribute("aria-selected", "true");
    }
    // Cached ranges switch without another request.
    await page.getByRole("tab", { name: "1M" }).click();
    await expect(page.getByRole("tab", { name: "1M" })).toHaveAttribute("aria-selected", "true");
  });

  test("has no horizontal page scroll", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
});
