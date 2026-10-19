// Custom-transaction rules shared by the API schema, the engine and the dialog (client-safe: no DB).

export const CUSTOM_MERCHANT_MAX = 40;
export const CUSTOM_MAX_CENTS = 1_000_000; // $10,000.00
/** Custom transactions per session per rolling hour (B1.1). */
export const MAX_CUSTOM_PER_HOUR = 30;

/**
 * Custom merchant text: control characters stripped, whitespace collapsed, trimmed. Instruction-like
 * text is deliberately kept as-is: it is data, wrapped under `data` in every tool output.
 */
export function normalizeMerchant(raw: string | undefined): string {
  return (raw ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
}

/** "$12.50" / "12.5" / "1,200" → integer cents, or null when it isn't a valid amount (max 2 decimals). */
export function parseAmountToCents(input: string): number | null {
  const s = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
