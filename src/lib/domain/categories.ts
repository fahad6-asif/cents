export const CATEGORIES = [
  "Housing",
  "Utilities",
  "Groceries",
  "Dining",
  "Transport",
  "Shopping",
  "Entertainment",
  "Subscriptions",
  "Health",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Categories whose remaining budget is reserved when computing disposable funds. */
export const ESSENTIAL_CATEGORIES: readonly Category[] = ["Housing", "Utilities", "Groceries", "Transport", "Health"];

/**
 * The only categories any automatic plan may cut or use as a source (addendum §3). Housing,
 * Utilities, Groceries and Health are never cut; Transport is neither essential-for-cuts nor
 * discretionary, so it is never cut automatically either.
 */
export const DISCRETIONARY_CATEGORIES: readonly Category[] = ["Dining", "Shopping", "Entertainment", "Subscriptions"];

/** Categories whose limits track fixed bills/subscriptions (planning keeps them, addendum §4.4). */
export const FIXED_CATEGORIES: readonly Category[] = ["Housing", "Utilities", "Subscriptions"];

/** Non-budget categories used by income and transfer rows. */
export const INCOME_CATEGORY = "Income";
export const SAVINGS_CATEGORY = "Savings";

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}
