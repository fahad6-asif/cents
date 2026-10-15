// Money is always integer cents. These helpers only format at the display edge.

const MINUS = "−";

type FormatOptions = {
  /** Prefix positive values with "+". */
  plus?: boolean;
  /** Drop the cents part, rounding half up ("$2,124"). */
  whole?: boolean;
};

export function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) throw new Error(`Money must be integer cents, got ${cents}`);
}

export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  return total;
}

/** Rounds a non-negative amount up to the next multiple of `stepCents` (e.g. $5 = 500). */
export function roundUpTo(cents: number, stepCents: number): number {
  assertCents(cents);
  if (cents <= 0) return 0;
  return Math.ceil(cents / stepCents) * stepCents;
}

const group = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** 123456 → "$1,234.56"; −8640 → "−$86.40". */
export function formatUSD(cents: number, opts: FormatOptions = {}): string {
  assertCents(cents);
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const body = opts.whole
    ? `$${group(rest >= 50 ? dollars + 1 : dollars)}`
    : `$${group(dollars)}.${rest.toString().padStart(2, "0")}`;
  if (cents < 0) return `${MINUS}${body}`;
  if (opts.plus && cents > 0) return `+${body}`;
  return body;
}
