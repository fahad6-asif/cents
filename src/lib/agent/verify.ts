// Live grounding verifier (addendum A4). Pure: every $ and % in a reply must appear in this
// turn's tool outputs (or in the user's own message). Deterministic, no model involved.

export type FigureKind = "usd" | "pct";
export type CheckedFigure = {
  raw: string;
  kind: FigureKind;
  /** Cents for usd, the number for pct; signed as written. */
  value: number;
  matched: boolean;
  source_tool?: string;
};
export type VerifyResult = { figures: CheckedFigure[]; verified_count: number; total_count: number; all_matched: boolean };
export type Verification = VerifyResult & { status: "verified" | "partial" | "none"; retried: boolean };
export type ToolOutput = { tool: string; output: unknown };

const MINUS = /[−–-]/;
const USD = /([−–-]\s?)?\$\s?([−–-])?(\d[\d,]*(?:\.\d{1,2})?)/g;
const PCT = /([−–+-]\s?)?(\d+(?:\.\d+)?)\s?(?:%|percent\b)/gi;
const BARE = /\d[\d,]*(?:\.\d+)?/g;
const PCT_KEY = /pct|percent|utilization/i;

function extract(text: string): Omit<CheckedFigure, "matched" | "source_tool">[] {
  const out: Omit<CheckedFigure, "matched" | "source_tool">[] = [];
  for (const m of text.matchAll(USD)) {
    const cents = Math.round(Number(m[3].replace(/,/g, "")) * 100);
    out.push({ raw: m[0].trim(), kind: "usd", value: m[1] || m[2] ? -cents : cents });
  }
  for (const m of text.matchAll(PCT)) {
    const n = Number(m[2]);
    out.push({ raw: m[0].trim(), kind: "pct", value: m[1] && MINUS.test(m[1]) ? -n : n });
  }
  return out;
}

/** Dollar amounts and percentages in a reply, deduplicated by kind and size (the badge counts figures, not mentions). */
export function extractFigures(text: string): Omit<CheckedFigure, "matched" | "source_tool">[] {
  const seen = new Set<string>();
  return extract(text).filter((f) => {
    const key = `${f.kind}:${Math.abs(f.value)}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

type Allowed = { usd: { cents: number; source: string }[]; pct: { n: number; source: string }[] };

function collect(node: unknown, key: string, source: string, into: Allowed): void {
  if (typeof node === "number" && Number.isFinite(node)) {
    if (/cents$/i.test(key)) into.usd.push({ cents: Math.abs(Math.round(node)), source });
    if (PCT_KEY.test(key)) {
      into.pct.push({ n: Math.abs(node), source });
      // A raw ratio (0.883) also stands for its percentage (88.3).
      if (/utilization/i.test(key) && Math.abs(node) < 10) into.pct.push({ n: Math.abs(node) * 100, source });
    }
  } else if (typeof node === "string") {
    for (const f of extract(node)) {
      if (f.kind === "usd") into.usd.push({ cents: Math.abs(f.value), source });
      else into.pct.push({ n: Math.abs(f.value), source });
    }
  } else if (Array.isArray(node)) {
    for (const item of node) collect(item, key, source, into);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) collect(v, k, source, into);
  }
}

/**
 * Markdown syntax off, words and figures kept (B2): bullets ("- $45.00" must not read as −$45),
 * bold, code ticks, table pipes and separator rows. Figures inside bold or cells then match normally.
 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, " ")
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\|/g, " ");
}

export function verifyReply(replyText: string, toolOutputs: readonly ToolOutput[], userMessage: string): VerifyResult {
  replyText = stripMarkdown(replyText);
  const allowed: Allowed = { usd: [], pct: [] };
  for (const t of toolOutputs) collect(t.output, "", t.tool, allowed);
  // Figures the user stated themselves ("Can I afford $900?", "cut 10%"), with or without symbols.
  collect(userMessage, "", "user_message", allowed);
  for (const m of userMessage.matchAll(BARE)) {
    const n = Number(m[0].replace(/,/g, ""));
    allowed.usd.push({ cents: Math.round(n * 100), source: "user_message" });
    allowed.pct.push({ n, source: "user_message" });
  }

  const figures = extractFigures(replyText).map((f): CheckedFigure => {
    const v = Math.abs(f.value);
    const hit =
      f.kind === "usd"
        ? allowed.usd.find((a) => Math.abs(a.cents - v) <= 1)
        : allowed.pct.find((a) => Math.abs(a.n - v) <= 0.1 + 1e-9 || (Number.isInteger(v) && Math.round(a.n) === v));
    return hit ? { ...f, matched: true, source_tool: hit.source } : { ...f, matched: false };
  });
  const verified = figures.filter((f) => f.matched).length;
  return { figures, verified_count: verified, total_count: figures.length, all_matched: verified === figures.length };
}

export function toVerification(r: VerifyResult, retried: boolean): Verification {
  return { ...r, status: r.total_count === 0 ? "none" : r.all_matched ? "verified" : "partial", retried };
}

/** The one correction turn sent when a reply has figures the tools did not return. */
export function correctionMessage(r: VerifyResult): string {
  const list = r.figures.filter((f) => !f.matched).map((f) => f.raw).join(", ");
  return `[internal check] These figures do not appear in your tool results: ${list}. Rewrite the answer using only figures from tool results, or call a tool that returns them. The user never saw your draft: reply to their question directly, without mentioning this check or the removed figures.`;
}
