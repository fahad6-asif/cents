import { expect, test, type Page } from "@playwright/test";

// B2: the reply renderer in a real browser (mocked chat turn, no LLM).
const now = () => new Date().toISOString();

async function mockReply(page: Page, content: string) {
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const message = route.request().postDataJSON().message as string;
    const base = { createdAt: now(), proposal: null, verification: null, trace: [], turnMs: null };
    await route.fulfill({
      json: {
        user: { id: crypto.randomUUID(), role: "user", kind: "chat", content: message, ...base },
        reply: { id: crypto.randomUUID(), role: "assistant", kind: "chat", content, ...base },
        proposal: null,
      },
    });
  });
}
async function ask(page: Page, text: string) {
  const box = page.getByPlaceholder("Ask anything about your money");
  await box.fill(text);
  await box.press("Enter");
}

test("XSS: an <img onerror> reply and a <script> merchant render as plain text", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (d) => (dialogs.push(d.message()), void d.dismiss()));
  await page.goto("/assistant");
  await mockReply(page, '**Heads up.** <img src=x onerror=alert(1)>\n\n- Merchant: <script>alert("xss")</script>: $9.00\n- [click me](javascript:alert(2))');
  await ask(page, "Show me my latest transaction");
  const msg = page.getByTestId("assistant-message").last();
  await expect(msg).toContainText("<img src=x onerror=alert(1)>");
  await expect(msg).toContainText('<script>alert("xss")</script>');
  expect(await msg.locator("img, script, a, iframe").count()).toBe(0);
  await page.waitForTimeout(500);
  expect(dialogs).toEqual([]);
});

test("a wide table scrolls inside its own wrapper, never the page", async ({ page, isMobile }) => {
  await page.goto("/assistant");
  const rows = ["Housing", "Utilities", "Groceries", "Dining"].map((c, i) => `| ${c} long category label | $${(i + 1) * 1111}.00 | $${(i + 2) * 999}.00 | Wednesday 28 October 2026 |`);
  await mockReply(page, ["**Here's the comparison.**", "", "| Category | August | September | Note |", "|---|---|---|---|", ...rows].join("\n"));
  await ask(page, "Compare my spending in September vs August");
  const table = page.getByTestId("reply-table").last();
  await expect(table).toBeVisible();
  // Amount cells are right-aligned with tabular digits.
  const cell = table.locator("td").nth(1);
  expect(await cell.evaluate((el) => getComputedStyle(el).textAlign)).toBe("right");
  expect(await cell.evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toContain("tabular-nums");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  if (isMobile) expect(await table.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});
