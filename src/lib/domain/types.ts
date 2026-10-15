// Plain data shapes the pure domain functions work on (decoupled from the DB layer).
// Dates are ISO strings in UTC: days "YYYY-MM-DD", months "YYYY-MM", timestamps full ISO.

export type TxType = "income" | "expense" | "transfer";

export type DomainTx = {
  id?: string;
  amountCents: number; // signed: income positive, expenses/transfers out negative
  category: string;
  merchant: string;
  occurredAt: string;
  type: TxType;
  source?: "seed" | "simulated";
};

export type DomainBudget = { category: string; month: string; limitCents: number };

export type DomainBill = {
  id?: string;
  name: string;
  amountCents: number;
  category: string;
  dueDate: string;
  status: "paid" | "unpaid";
};
