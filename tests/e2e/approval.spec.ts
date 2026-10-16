import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

async function restaurant(request: APIRequestContext) {
  const res = await request.post("/api/simulate", { data: { eventId: "restaurant", idempotencyKey: randomUUID() } });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return body.overview.worthALook.top.proposal.id as string;
}
const budgetsFor = async (request: APIRequestContext, month = "2026-10") => (await (await request.get(`/api/budgets?month=${month}`)).json()).budgets;

test.describe("Approval workflow over HTTP", () => {
  test("Worth a look: Move $25 to Dining → approve → limit $325, overrun resolved, duplicate blocked", async ({ page }) => {
    await page.goto("/");
    await restaurant(page.request);
    await page.reload();
    await expect(page.getByTestId("worth-primary")).toHaveText("Move $25 to Dining");
    await expect(page.getByRole("img", { name: "over budget" })).toBeVisible();

    await page.getByTestId("worth-primary").click();
    await expect(page.getByTestId("worth-done")).toHaveText("Done, Dining budget is now $325.00.");
    // Dashboard updates: the over-budget dot disappears, then the card shows the refreshed top alert.
    await expect(page.getByRole("img", { name: "over budget" })).toHaveCount(0);
    await expect(page.getByTestId("worth-body")).toContainText("$325.00 of your $325.00 Dining budget", { timeout: 10_000 });

    const budgets = await budgetsFor(page.request);
    const dining = budgets.find((b: { category: string }) => b.category === "Dining");
    const shopping = budgets.find((b: { category: string }) => b.category === "Shopping");
    expect(dining.limitCents).toBe(32_500);
    expect(shopping.limitCents).toBe(22_500);
    const alerts = await (await page.request.get("/api/alerts")).json();
    expect(alerts.active.some((a: { type: string }) => a.type === "budget_overrun")).toBe(false);
    expect(alerts.recent.some((a: { type: string; status: string }) => a.type === "budget_overrun" && a.status === "resolved")).toBe(true);

    // Approving the same action again: 409, nothing changes.
    const action = (await (await page.request.get("/api/alerts")).json()).recent.find((a: { type: string }) => a.type === "budget_overrun").proposalId;
    const before = JSON.stringify(await budgetsFor(page.request));
    const again = await page.request.post(`/api/actions/${action}/approve`);
    expect(again.status()).toBe(409);
    expect(JSON.stringify(await budgetsFor(page.request))).toBe(before);
  });

  test("reject leaves every budget byte-identical (both months)", async ({ page }) => {
    await page.goto("/");
    const id = await restaurant(page.request);
    const before = JSON.stringify([await budgetsFor(page.request, "2026-10"), await budgetsFor(page.request, "2026-11")]);
    const res = await page.request.post(`/api/actions/${id}/reject`);
    expect(res.status()).toBe(200);
    expect((await res.json()).proposal.status).toBe("rejected");
    expect(JSON.stringify([await budgetsFor(page.request, "2026-10"), await budgetsFor(page.request, "2026-11")])).toBe(before);
    expect((await page.request.post(`/api/actions/${id}/approve`)).status()).toBe(409);
  });

  test("another session cannot read, approve or reject the proposal (404)", async ({ page, browser }) => {
    await page.goto("/");
    const id = await restaurant(page.request);
    const other = await browser.newContext();
    const attacker = await other.newPage();
    await attacker.goto("/");
    expect((await attacker.request.get(`/api/actions/${id}`)).status()).toBe(404);
    expect((await attacker.request.post(`/api/actions/${id}/approve`)).status()).toBe(404);
    expect((await attacker.request.post(`/api/actions/${id}/reject`)).status()).toBe(404);
    expect((await page.request.get(`/api/actions/${id}`)).status()).toBe(200);
    expect((await (await page.request.get(`/api/actions/${id}`)).json()).proposal.status).toBe("pending");
    await other.close();
  });

  test("malformed ids are 404, not errors", async ({ page }) => {
    await page.goto("/");
    for (const bad of ["not-a-uuid", "1%27%20OR%201%3D1", randomUUID()]) {
      expect((await page.request.post(`/api/actions/${bad}/approve`)).status()).toBe(404);
    }
  });
});
