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

/** Non-budget categories used by income and transfer rows. */
export const INCOME_CATEGORY = "Income";
export const SAVINGS_CATEGORY = "Savings";

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}
