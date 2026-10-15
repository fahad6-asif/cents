/**
 * Scans the client bundle (.next/static) for secrets: env var names, the OpenRouter key prefix,
 * and the actual secret values from .env.local. Prints counts only, never the values.
 * Usage: npm run build && npx tsx scripts/scan-bundle.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const secrets: Record<string, string> = {
  "OPENROUTER_API_KEY value": process.env.OPENROUTER_API_KEY ?? "",
  "DATABASE_URL value": process.env.DATABASE_URL ?? "",
  "DATABASE_URL_UNPOOLED value": process.env.DATABASE_URL_UNPOOLED ?? "",
  "database password": /:\/\/[^:]+:([^@]+)@/.exec(process.env.DATABASE_URL ?? "")?.[1] ?? "",
  "database host": /@([^/:]+)/.exec(process.env.DATABASE_URL ?? "")?.[1] ?? "",
};
const needles: Record<string, string> = {
  "name OPENROUTER_API_KEY": "OPENROUTER_API_KEY",
  "name DATABASE_URL": "DATABASE_URL",
  "OpenRouter key prefix sk-or-": "sk-or-",
  ...Object.fromEntries(Object.entries(secrets).filter(([, v]) => v.length >= 8)),
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const all = files(".next/static");
let bad = 0;
for (const [label, needle] of Object.entries(needles)) {
  const hits = all.filter((f) => readFileSync(f, "latin1").includes(needle));
  if (hits.length) bad++;
  console.log(`${hits.length ? "FOUND" : "clean"}  ${label}${hits.length ? ` in ${hits.length} file(s)` : ""}`);
}
console.log(`scanned ${all.length} files in .next/static`);
process.exitCode = bad ? 1 : 0;
