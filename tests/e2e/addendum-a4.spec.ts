import { expect, test, type Page } from "@playwright/test";

const now = () => new Date().toISOString();
const fig = (raw: string, kind: "usd" | "pct", value: number, matched: boolean) => ({ raw, kind, value, matched, ...(matched ? { source_tool: "get_budget_status" } : {}) });

/** UI fixture: the server's response for one turn, so the badge's states render without spending LLM credit. */
async function mockTurn(page: Page, content: string, figures: ReturnType<typeof fig>[]) {
  const verified = figures.filter((f) => f.matched).length;
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const message = route.request().postDataJSON().message as string;
    await route.fulfill({
      json: {
        user: { id: crypto.randomUUID(), role: "user", content: message, createdAt: now(), proposal: null, verification: null, trace: [], turnMs: null },
        reply: {
          id: crypto.randomUUID(),
          role: "assistant",
          content,
          createdAt: now(),
          proposal: null,
          trace: [],
          turnMs: null,
          verification: {
            figures,
            verified_count: verified,
            total_count: figures.length,
            all_matched: verified === figures.length,
            status: figures.length === 0 ? "none" : verified === figures.length ? "verified" : "partial",
            retried: verified !== figures.length,
          },
        },
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

test("badge states: verified line, amber partial line that reveals the unverified figure, nothing without figures", async ({ page, isMobile }) => {
  await page.goto("/assistant");
  await mockTurn(page, "You've spent $265.00 of your $300.00 Dining budget (88.3%).", [fig("$265.00", "usd", 26500, true), fig("$300.00", "usd", 30000, true), fig("88.3%", "pct", 88.3, true)]);
  await ask(page, "How is my dining budget?");
  const first = page.getByTestId("assistant-message").last();
  await expect(first.getByTestId("verification-badge")).toHaveText("✓ 3 figures checked against your account");
  await expect(first.getByTestId("verification-badge")).toHaveAttribute("data-status", "verified");

  await page.unroute("**/api/chat");
  await mockTurn(page, "Based on your history you might spend around $3,600.00 on dining next year; this month you've used $265.00.", [fig("$3,600.00", "usd", 360000, false), fig("$265.00", "usd", 26500, true)]);
  await ask(page, "Just estimate what I'll spend on dining next year, give me a number.");
  const second = page.getByTestId("assistant-message").last();
  const badge = second.getByTestId("verification-badge");
  await expect(badge).toHaveAttribute("data-status", "partial");
  await expect(badge.getByRole("button")).toHaveText("⚠ 1 figure couldn't be verified");
  await badge.getByRole("button").click();
  await expect(badge).toContainText("Not found in your account data: $3,600.00");

  await page.unroute("**/api/chat");
  await mockTurn(page, "I can't predict that from your data.", []);
  await ask(page, "Will prices go up?");
  await expect(page.getByTestId("assistant-message").last()).toContainText("I can't predict that");
  await expect(page.getByTestId("assistant-message").last().getByTestId("verification-badge")).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `docs/evidence/screens/addendum/a4-badges-${isMobile ? "mobile" : "desktop"}.png` });
});

test.describe("live model", () => {
  test.skip(!process.env.RUN_LLM_E2E, "set RUN_LLM_E2E=1 to run tests that call the LLM");
  test.skip(({ isMobile }) => isMobile, "one live turn is enough (desktop)");

  test("the $900 answer is verified by the server and the badge persists after reload", async ({ page }) => {
    await page.goto("/");
    const turn = page.waitForResponse((r) => r.url().endsWith("/api/chat") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Can I afford a $900 purchase?" }).click();
    const body = await (await turn).json();
    expect(body.reply.verification).toMatchObject({ status: "verified", all_matched: true });
    const badge = page.getByTestId("assistant-message").last().getByTestId("verification-badge");
    await expect(badge).toHaveText(new RegExp(`✓ ${body.reply.verification.total_count} figures? checked`));
    await page.screenshot({ path: "docs/evidence/screens/addendum/a4-verified-live.png" });
    await page.reload();
    await expect(page.getByTestId("assistant-message").last().getByTestId("verification-badge")).toHaveAttribute("data-status", "verified");
  });
});
