// Simulated bank events the presenter can trigger (plan Section 6). Shared by UI and API.

export const SIM_EVENTS = [
  { id: "restaurant", label: "Restaurant", merchant: "Bella Napoli", amountCents: -6000, category: "Dining" },
  { id: "groceries", label: "Groceries", merchant: "Grocery Mart", amountCents: -8500, category: "Groceries" },
  { id: "subscription", label: "New subscription", merchant: "Music plan", amountCents: -1800, category: "Subscriptions" },
  { id: "electricity", label: "Electricity bill", merchant: "Electric bill", amountCents: -12000, category: "Utilities" },
  { id: "salary", label: "Salary", merchant: "Monthly salary", amountCents: 640000, category: "Income" },
  { id: "large_purchase", label: "Large purchase", merchant: "TechStore", amountCents: -78000, category: "Shopping" },
] as const;

export type SimEventId = (typeof SIM_EVENTS)[number]["id"];
