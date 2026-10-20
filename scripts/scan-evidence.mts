/**
 * Secret scan of everything in docs/evidence (text files): the real values from .env.local, an
 * OpenRouter key prefix, and any Postgres connection string. Prints findings only, never values.
 * Usage: npx tsx scripts/scan-evidence.mts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const ROOT = "docs/evidence";
const TEXT = /\.(json|txt|md)$/i;
const secrets = ["OPENROUTER_API_KEY", "DATABASE_URL", "DATABASE_URL_UNPOOLED"]
  .map((k) => [k, process.env[k]] as const)
  .filter((e): e is readonly [string, string] => !!e[1]);
const parts = secrets.flatMap(([k, v]) => {
  const m = /\/\/([^:]+):([^@]+)@([^/?]+)/.exec(v);
  return m ? [[`${k} password`, m[2]] as const, [`${k} host`, m[3]] as const] : [];
});
const patterns: [string, RegExp][] = [
  ["OpenRouter key prefix", /sk-or-v1-[A-Za-z0-9]{8,}/],
  ["Postgres URL with credentials", /postgres(ql)?:\/\/[^\s"']+:[^\s"'@]+@/],
];

const files: string[] = [];
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (TEXT.test(f)) files.push(p);
  }
};
walk(ROOT);

let findings = 0;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (const [label, value] of [...secrets, ...parts]) if (value.length >= 8 && text.includes(value)) (findings++, console.log(`FOUND ${label} in ${f}`));
  for (const [label, re] of patterns) if (re.test(text)) (findings++, console.log(`FOUND ${label} in ${f}`));
}
console.log(`scanned ${files.length} text files in ${ROOT}: ${findings ? `${findings} FINDINGS` : "clean"}`);
process.exitCode = findings ? 1 : 0;
