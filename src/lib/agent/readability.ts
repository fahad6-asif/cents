// Deterministic readability check for assistant replies (B2.3). Used by the eval and logged in
// production (no retry: the verifier owns the one retry, and correctness beats formatting).

export type ReadabilityIssue =
  | { kind: "paragraph_sentences"; count: number; text: string }
  | { kind: "paragraph_figures"; count: number; text: string }
  | { kind: "sentence_figures"; count: number; text: string }
  | { kind: "first_line_no_bold"; text: string }
  | { kind: "first_line_too_long"; length: number }
  | { kind: "iso_date"; text: string }
  | { kind: "long_without_structure"; length: number };

export type ReadabilityResult = { ok: boolean; issues: ReadabilityIssue[] };

export const MAX_PARAGRAPH_SENTENCES = 3;
export const MAX_PARAGRAPH_FIGURES = 4;
export const MAX_SENTENCE_FIGURES = 2;
export const MAX_FIRST_LINE = 160;
export const MAX_UNSTRUCTURED_LENGTH = 1600;

const LIST_ITEM = /^\s*(?:[-*+•]|\d+[.)])\s+/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const FIGURE = /[−–-]?\$\s?\d[\d,]*(?:\.\d{1,2})?|\d+(?:\.\d+)?\s?(?:%|percent\b)/gi;

/** Markdown syntax off, words and figures kept. */
const plain = (s: string) => s.replace(LIST_ITEM, "").replace(/\*\*|__|`/g, "").trim();
export const countFigures = (s: string) => (s.match(FIGURE) ?? []).length;

/** Sentences: split after . ! ? followed by space and a capital, digit, $, quote or bold. Decimals stay intact. */
export function sentences(text: string): string[] {
  return plain(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9$"“(*])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Paragraphs = runs of non-blank lines that are neither list items nor table rows. */
function paragraphs(markdown: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  const flush = () => (current.length && out.push(current.join(" ")), (current = []));
  for (const line of markdown.split("\n")) {
    if (!line.trim() || LIST_ITEM.test(line) || TABLE_ROW.test(line)) flush();
    else current.push(line.trim());
  }
  flush();
  return out;
}

/**
 * Shape-only fix (B2.1 rule 1): when the first line has no bold, bold its first sentence. Words and
 * figures are untouched (the verifier strips Markdown, so it is unaffected).
 */
export function ensureBoldLead(markdown: string): string {
  const lines = markdown.split("\n");
  const i = lines.findIndex((l) => l.trim());
  if (i < 0 || /\*\*[^*]+\*\*/.test(lines[i]) || LIST_ITEM.test(lines[i]) || TABLE_ROW.test(lines[i])) return markdown;
  const line = lines[i].trim();
  const m = /^(.+?[.!?])(\s+.*)?$/.exec(line);
  const [lead, rest] = m ? [m[1], m[2] ?? ""] : [line, ""];
  lines[i] = `**${lead}**${rest}`;
  return lines.join("\n");
}

export function checkReadability(markdown: string): ReadabilityResult {
  const md = markdown.trim();
  const issues: ReadabilityIssue[] = [];
  const lines = md.split("\n").filter((l) => l.trim());

  for (const p of paragraphs(md)) {
    const ss = sentences(p);
    if (ss.length > MAX_PARAGRAPH_SENTENCES) issues.push({ kind: "paragraph_sentences", count: ss.length, text: p.slice(0, 80) });
    const pf = countFigures(p);
    if (pf > MAX_PARAGRAPH_FIGURES) issues.push({ kind: "paragraph_figures", count: pf, text: p.slice(0, 80) });
  }
  // Every sentence outside tables, including inside bullets.
  for (const line of lines.filter((l) => !TABLE_ROW.test(l))) {
    for (const s of sentences(line)) {
      const n = countFigures(s);
      if (n > MAX_SENTENCE_FIGURES) issues.push({ kind: "sentence_figures", count: n, text: s.slice(0, 80) });
    }
  }

  const first = lines[0] ?? "";
  if (!/\*\*[^*]+\*\*/.test(first)) issues.push({ kind: "first_line_no_bold", text: first.slice(0, 80) });
  if (plain(first).length > MAX_FIRST_LINE) issues.push({ kind: "first_line_too_long", length: plain(first).length });

  const iso = md.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (iso) issues.push({ kind: "iso_date", text: iso[0] });

  const structured = lines.some((l) => LIST_ITEM.test(l) || TABLE_ROW.test(l));
  if (md.length > MAX_UNSTRUCTURED_LENGTH && !structured) issues.push({ kind: "long_without_structure", length: md.length });

  return { ok: issues.length === 0, issues };
}
