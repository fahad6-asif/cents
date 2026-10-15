/**
 * Captures pages at the reference desktop viewport (1360×1400 CSS px, @2x like the mockup)
 * and at 375px mobile width. Usage: npm run screens -- [baseUrl] [path ...]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const OUT_DIR = join(process.cwd(), "docs", "evidence", "screens");
const VIEWPORTS = [
  { name: "desktop", width: 1360, height: 1400, deviceScaleFactor: 2, fullPage: false },
  { name: "mobile", width: 375, height: 812, deviceScaleFactor: 2, fullPage: true },
] as const;

async function main() {
  const [baseUrl = "http://localhost:3000", ...paths] = process.argv.slice(2);
  const routes = paths.length ? paths : ["/"];
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.deviceScaleFactor,
      });
      for (const route of routes) {
        await page.goto(new URL(route, baseUrl).toString(), { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        const slug = route === "/" ? "overview" : route.replace(/^\//, "").replace(/\//g, "-");
        const file = join(OUT_DIR, `${slug}-${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: vp.fullPage });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        console.log(`${file}  horizontal-overflow=${overflow}px`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
