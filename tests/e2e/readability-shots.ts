/**
 * B2 before/after: asks the 5 reference questions (one live model turn each) and screenshots each
 * reply at desktop and 375px. Usage: npx tsx tests/e2e/readability-shots.ts <before|after> [baseUrl]
 * Writes docs/evidence/screens/readability/<label>-<case>-<viewport>.png and <label>-replies.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext } from "@playwright/test";

const [label = "before", base = "http://localhost:3000"] = process.argv.slice(2);
const OUT = join(process.cwd(), "docs", "evidence", "screens", "readability");
const CASES = [
  { id: "afford-900", question: "Can I afford a $900 purchase?" },
  { id: "subscriptions", question: "Find my subscriptions" },
  { id: "plan-next-month", question: "Plan next month’s budget" },
  { id: "compare-sep-aug", question: "Compare my spending in September vs August" },
  { id: "impact-note", impact: { kind: "custom", type: "expense", category: "Entertainment", amountCents: 12_000, merchant: "Concert tickets" } },
] as const;

async function lastReplyShot(context: BrowserContext, file: string) {
  const page = await context.newPage();
  await page.goto(new URL("/assistant", base).toString(), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const msg = page.getByTestId("assistant-message").last();
  await msg.scrollIntoViewIfNeeded();
  await msg.screenshot({ path: file });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.close();
  return overflow;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const replies: Record<string, { text: string; verification: unknown; overflow: Record<string, number> }> = {};
  try {
    for (const c of CASES) {
      // Desktop context creates the session and asks; the 375px context reuses its cookie.
      const desktop = await browser.newContext({ baseURL: base, viewport: { width: 1360, height: 1400 }, deviceScaleFactor: 2 });
      const page = await desktop.newPage();
      await page.goto(new URL("/", base).toString(), { waitUntil: "networkidle" });
      let reply: { content: string; verification: unknown };
      if ("impact" in c) {
        const added = await (await page.request.post("/api/simulate", { data: { ...c.impact, idempotencyKey: crypto.randomUUID() } })).json();
        reply = (await (await page.request.post("/api/chat/impact", { data: { transactionId: added.transaction.id }, timeout: 90_000 })).json()).reply;
      } else {
        reply = (await (await page.request.post("/api/chat", { data: { message: c.question }, timeout: 90_000 })).json()).reply;
      }
      await page.close();
      const overflow: Record<string, number> = {};
      overflow.desktop = await lastReplyShot(desktop, join(OUT, `${label}-${c.id}-desktop.png`));
      const mobile = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 2400 }, deviceScaleFactor: 2, storageState: await desktop.storageState() });
      overflow.mobile = await lastReplyShot(mobile, join(OUT, `${label}-${c.id}-mobile.png`));
      await mobile.close();
      await desktop.close();
      replies[c.id] = { text: reply.content, verification: reply.verification, overflow };
      console.log(`${c.id}: ${reply.content.length} chars, overflow ${JSON.stringify(overflow)}`);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(join(OUT, `${label}-replies.json`), JSON.stringify(replies, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
