import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// Each test gets a fresh browser context, so a fresh cookie and a freshly seeded session.

test.describe("POST /api/simulate", () => {
  test("rejects invalid input with 400 and changes nothing", async ({ page }) => {
    await page.goto("/");
    const before = await (await page.request.get("/api/overview")).text();
    const bad: [string, unknown][] = [
      ["unknown event", { eventId: "lottery_win", idempotencyKey: randomUUID() }],
      ["wrong types", { eventId: 7, idempotencyKey: true }],
      ["missing key", { eventId: "restaurant" }],
      ["not a uuid", { eventId: "restaurant", idempotencyKey: "abc" }],
      ["extra field", { eventId: "restaurant", idempotencyKey: randomUUID(), amountCents: -1 }],
      ["huge string", { eventId: "x".repeat(20_000), idempotencyKey: randomUUID() }],
    ];
    for (const [label, data] of bad) {
      const res = await page.request.post("/api/simulate", { data });
      expect(res.status(), label).toBe(400);
    }
    const malformed = await page.request.post("/api/simulate", { data: "{not json", headers: { "content-type": "application/json" } });
    expect(malformed.status()).toBe(400);
    expect(await (await page.request.get("/api/overview")).text()).toBe(before);
  });

  test("replaying an idempotency key returns the original without inserting again", async ({ page }) => {
    await page.goto("/");
    const key = randomUUID();
    const first = await page.request.post("/api/simulate", { data: { eventId: "groceries", idempotencyKey: key } });
    const second = await page.request.post("/api/simulate", { data: { eventId: "groceries", idempotencyKey: key } });
    expect(first.status()).toBe(201);
    expect(second.status()).toBe(200);
    const a = await first.json();
    const b = await second.json();
    expect(b.replayed).toBe(true);
    expect(b.transaction.id).toBe(a.transaction.id);
    expect(b.overview.summary.balanceCents).toBe(a.overview.summary.balanceCents);

    const third = await (await page.request.post("/api/simulate", { data: { eventId: "groceries", idempotencyKey: randomUUID() } })).json();
    expect(third.overview.summary.balanceCents).toBe(a.overview.summary.balanceCents - 8_500);
  });
});

test.describe("Simulate in the UI", () => {
  test("restaurant → overrun with 'Move $25 to Dining'; Not now dismisses; reset restores", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.getByTestId("worth-body")).toContainText("$265.00 of your $300.00 Dining budget");
    await expect(page.getByTestId("worth-primary")).toHaveText("Ask assistant");

    await page.getByRole("button", { name: "Simulate transaction" }).click();
    await page.getByRole("menuitem", { name: /Restaurant/ }).click();
    await expect(page.getByTestId("worth-primary")).toHaveText("Move $25 to Dining");
    await expect(page.getByTestId("worth-body")).toContainText("Dining is $25.00 over its $300.00 October budget");
    await expect(page.getByText("Bella Napoli").first()).toBeVisible();
    await expect(page.getByText("Simulated", { exact: true }).first()).toBeVisible();

    await page.getByTestId("worth-dismiss").click();
    await expect(page.getByTestId("worth-primary")).not.toHaveText("Move $25 to Dining");

    await page.getByRole("button", { name: "Simulate transaction" }).click();
    await page.getByRole("menuitem", { name: "Reset demo" }).click();
    await page.getByRole("button", { name: "Reset demo" }).click();
    await expect(page.getByTestId("worth-body")).toContainText("$265.00 of your $300.00 Dining budget");
    await expect(page.getByText("Bella Napoli")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

});
