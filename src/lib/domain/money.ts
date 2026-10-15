// Money is always integer cents. These helpers only format at the display edge.

const MINUS = "−";

type FormatOptions = {
  /** Prefix positive values with "+". */
  plus?: boolean;
  /** Drop the cents part ("$2,124"). */
  whole?: boolean;
};

function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) throw new Error(`Money must be integer cents, got ${cents}`);
}

/** 123456 → "$1,234.56"; −8640 → "−$86.40". */
export function formatUSD(cents: number, opts: FormatOptions = {}): string {
  assertCents(cents);
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = opts.whole
    ? `$${(rest >= 50 ? dollars + 1 : dollars).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
    : `$${grouped}.${rest.toString().padStart(2, "0")}`;
  if (cents < 0) return `${MINUS}${body}`;
  if (opts.plus && cents > 0) return `+${body}`;
  return body;
}
