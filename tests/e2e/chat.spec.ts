import { expect, test } from "@playwright/test";

// Calls the real model (costs credit), so it only runs with RUN_LLM_E2E=1.
test.skip(!process.env.RUN_LLM_E2E, "set RUN_LLM_E2E=1 to run tests that call the LLM");

test("chip sends a question; the grounded answer renders in the centered chatbox and persists", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Can I afford a $900 purchase?" }).click();
  await expect(page.getByTestId("typing")).toBeVisible();
  const answer = page.getByTestId("assistant-message").last();
  await expect(answer).toContainText("$3,261.26", { timeout: 45_000 });
  await expect(page.getByRole("link", { name: "Open full view" })).toBeVisible();

  // Shared thread: the Assistant page shows the same conversation.
  await page.getByRole("link", { name: "Open full view" }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await expect(page.getByTestId("assistant-message").last()).toContainText("$3,261.26");

  // Clear empties it.
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByTestId("assistant-message")).toHaveCount(0);
});

test("Enter sends, Shift+Enter adds a newline", async ({ page }) => {
  await page.goto("/");
  const box = page.getByPlaceholder("Ask anything about your money");
  await box.fill("What bills are due soon?");
  await box.press("Shift+Enter");
  await expect(box).toHaveValue("What bills are due soon?\n");
  await box.press("Enter");
  await expect(page.getByTestId("assistant-message").last()).toContainText("Internet", { timeout: 45_000 });
});

test("Ask assistant on the Worth a look card sends a question about the alert", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("worth-primary").click();
  await expect(page.getByText(/Why is my Dining budget at 88%/)).toBeVisible();
  await expect(page.getByTestId("assistant-message").last()).toContainText("$265.00", { timeout: 45_000 });
});
