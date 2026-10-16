/**
 * HTTP-level security checks (plan Phase 9) against a running app + its database.
 * Desktop project only (these are API checks; the viewport is irrelevant).
 */
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import postgres from "postgres";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

config({ path: ".env.local", quiet: true });
test.skip(({ isMobile }) => isMobile, "API checks run once (desktop project)");
test.describe.configure({ timeout: 180_000 });

const SECRETS = (() => {
  const db = process.env.DATABASE_URL ?? "";
  const values = [
    process.env.OPENROUTER_API_KEY,
    db,
    process.env.DATABASE_URL_UNPOOLED,
    /:\/\/[^:]+:([^@]+)@/.exec(db)?.[1], // DB password
  ].filter((v): v is string => !!v && v.length >= 8);
  return [...values, "OPENROUTER_API_KEY", "DATABASE_URL", "sk-or-"];
})();
function assertNoSecrets(label: string, text: string) {
  for (const s of SECRETS) expect(text.includes(s), `${label} leaks a secret`).toBe(false);
}

async function sessionId(page: Page) {
  return (await page.context().cookies()).find((c) => c.name === "cents_session")!.value;
}
async function restaurant(request: APIRequestContext) {
  const body = await (await request.post("/api/simulate", { data: { eventId: "restaurant", idempotencyKey: randomUUID() } })).json();
  return { actionId: body.overview.worthALook.top.proposal.id as string, alertId: body.overview.worthALook.top.id as string };
}

test("1–3. approve: unknown/foreign 404, rejected 409, concurrent duplicates apply once", async ({ page }) => {
  await page.goto("/");
  expect((await page.request.post(`/api/actions/${randomUUID()}/approve`)).status()).toBe(404);

  const first = await restaurant(page.request);
  expect((await page.request.post(`/api/actions/${first.actionId}/reject`)).status()).toBe(200);
  expect((await page.request.post(`/api/actions/${first.actionId}/approve`)).status()).toBe(409);

  await page.request.post("/api/reset");
  const second = await restaurant(page.request);
  const statuses = await Promise.all([1, 2, 3, 4].map(() => page.request.post(`/api/actions/${second.actionId}/approve`).then((r) => r.status())));
  expect(statuses.filter((s) => s === 200)).toHaveLength(1);
  expect(statuses.filter((s) => s === 409)).toHaveLength(3);
  const budgets = (await (await page.request.get("/api/budgets")).json()).budgets;
  expect(budgets.find((b: { category: string }) => b.category === "Dining").limitCents).toBe(32_500);
});

test("4. invalid inputs to every write endpoint → 400/404, never 500", async ({ page }) => {
  await page.goto("/");
  const cases: [string, unknown][] = [
    ["/api/simulate", { eventId: "x".repeat(50_000), idempotencyKey: randomUUID() }],
    ["/api/simulate", { eventId: "restaurant", idempotencyKey: "1; DROP TABLE transactions" }],
    ["/api/simulate", ["restaurant"]],
    ["/api/chat", { message: "" }],
    ["/api/chat", { message: "x".repeat(2_001) }],
    ["/api/chat", { message: "hi", role: "system" }],
  ];
  for (const [url, data] of cases) expect((await page.request.post(url, { data })).status(), url).toBe(400);
  expect((await page.request.get("/api/overview?range=10Y")).status()).toBe(400);
  expect((await page.request.get("/api/transactions?month=2026-13")).status()).toBe(400);
  for (const id of ["../../etc/passwd", "%00", "1 OR 1=1"]) {
    expect((await page.request.post(`/api/actions/${encodeURIComponent(id)}/approve`)).status()).toBe(404);
    expect((await page.request.post(`/api/alerts/${encodeURIComponent(id)}/dismiss`)).status()).toBe(404);
  }
});

test("8. no secrets in API responses, error responses or page HTML", async ({ page }) => {
  await page.goto("/");
  await restaurant(page.request);
  const urls = [
    "/api/overview", "/api/overview?range=1Y", "/api/transactions", "/api/budgets", "/api/bills", "/api/alerts", "/api/chat", "/api/evidence",
    "/api/overview?range=bad", `/api/actions/${randomUUID()}`,
    "/", "/transactions", "/budgets", "/bills", "/insights", "/assistant", "/settings",
  ];
  for (const url of urls) assertNoSecrets(url, await (await page.request.get(url)).text());
  assertNoSecrets("POST bad simulate", await (await page.request.post("/api/simulate", { data: "{bad" })).text());
});

test("9. chat rate limit returns 429 without calling the model", async ({ page }) => {
  await page.goto("/");
  const id = await sessionId(page);
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  try {
    const limit = Number(process.env.CHAT_RATE_LIMIT_PER_HOUR ?? 30);
    await sql`insert into audit_log (session_id, epoch, event, details) select ${id}, 0, 'chat_message', '{"seeded_by":"rate-limit test"}'::jsonb from generate_series(1, ${limit})`;
    const res = await page.request.post("/api/chat", { data: { message: "How much did I spend?" } });
    expect(res.status()).toBe(429);
    expect((await res.json()).error).toMatch(/limit/);
    const [n] = await sql`select count(*)::int n from chat_messages where session_id = ${id}`;
    expect(n.n).toBe(0); // the model was never called, nothing stored
  } finally {
    await sql.end();
  }
});

test("10. session B cannot read or change session A's data through any endpoint", async ({ page, browser }) => {
  await page.goto("/");
  const a = await restaurant(page.request);
  const aId = await sessionId(page);

  const ctx = await browser.newContext();
  const b = await ctx.newPage();
  await b.goto("/");
  const bId = await sessionId(b);
  expect(bId).not.toBe(aId);

  // Reads first: nothing of A's is visible to B. (After B's write attempts below, B's own audit
  // log records the ids B itself sent, which is expected and not a leak.)
  for (const url of ["/api/overview", "/api/transactions", "/api/alerts", "/api/evidence", "/api/budgets", "/api/chat"]) {
    const text = await (await b.request.get(url)).text();
    expect(text.includes(aId), `${url} exposes A's session id`).toBe(false);
    expect(text.includes(a.actionId), `${url} exposes A's proposal`).toBe(false);
    expect(text.includes(a.alertId), `${url} exposes A's alert`).toBe(false);
  }
  expect((await b.request.get(`/api/actions/${a.actionId}`)).status()).toBe(404);
  expect((await b.request.post(`/api/actions/${a.actionId}/approve`)).status()).toBe(404);
  expect((await b.request.post(`/api/actions/${a.actionId}/reject`)).status()).toBe(404);
  expect((await b.request.post(`/api/alerts/${a.alertId}/dismiss`)).status()).toBe(404);
  expect((await (await b.request.get("/api/transactions")).json()).rows.some((r: { simulated: boolean }) => r.simulated)).toBe(false);

  // A is untouched by everything B did.
  expect((await (await page.request.get(`/api/actions/${a.actionId}`)).json()).proposal.status).toBe("pending");
  await ctx.close();
});

test("cross-site POSTs are blocked (CSRF defense on top of SameSite=Lax)", async ({ page }) => {
  await page.goto("/");
  const before = await (await page.request.get("/api/overview")).text();
  const evil = await page.request.post("/api/simulate", {
    headers: { origin: "https://evil.example" },
    data: { eventId: "large_purchase", idempotencyKey: randomUUID() },
  });
  expect(evil.status()).toBe(403);
  expect((await page.request.post("/api/reset", { headers: { "sec-fetch-site": "cross-site" } })).status()).toBe(403);
  expect(await (await page.request.get("/api/overview")).text()).toBe(before);
  // Same-origin requests still work.
  const ok = await page.request.post("/api/simulate", { headers: { origin: new URL(page.url()).origin }, data: { eventId: "groceries", idempotencyKey: randomUUID() } });
  expect(ok.status()).toBe(201);
});

test("security headers and cookie flags", async ({ page }) => {
  const res = await page.goto("/settings");
  const h = res!.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-powered-by"]).toBeUndefined();
  const fresh = await page.request.get("/", { headers: { cookie: "" } });
  const setCookie = fresh.headers()["set-cookie"] ?? "";
  expect(setCookie).toMatch(/HttpOnly/i);
  expect(setCookie).toMatch(/SameSite=lax/i);
  expect((await page.request.get("/robots.txt")).status()).toBe(200);
  expect(await (await page.request.get("/robots.txt")).text()).toContain("Disallow: /");
});
