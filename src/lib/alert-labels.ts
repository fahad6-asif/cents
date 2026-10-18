// Human labels for alert fact chips ("88% used", "Limit $300.00", "Due Thu 22 Oct"). One place.
import { formatDateLabel } from "./domain/dates";
import { formatUSD } from "./domain/money";

type Facts = Record<string, string | number>;

/** Chips to show for an alert's stored facts, in a stable reading order. */
export function factLabels(type: string, facts: Facts): string[] {
  const usd = (k: string) => formatUSD(Number(facts[k]));
  const has = (k: string) => facts[k] !== undefined && facts[k] !== null;
  const out: string[] = [];
  switch (type) {
    case "budget_warning":
    case "budget_overrun":
      if (has("percent")) out.push(`${facts.percent}% used`);
      if (has("spent_cents")) out.push(`Spent ${usd("spent_cents")}`);
      if (has("limit_cents")) out.push(`Limit ${usd("limit_cents")}`);
      if (Number(facts.overage_cents) > 0) out.push(`Over by ${usd("overage_cents")}`);
      else if (Number(facts.remaining_cents) > 0) out.push(`${usd("remaining_cents")} left`);
      break;
    case "unusual_spending":
      if (has("amount_cents")) out.push(`Amount ${usd("amount_cents")}`);
      if (has("median_cents")) out.push(`Typical ${usd("median_cents")}`);
      if (has("multiple")) out.push(`${facts.multiple}× typical`);
      if (has("date")) out.push(`On ${formatDateLabel(String(facts.date))}`);
      break;
    case "upcoming_bill": {
      if (has("amount_cents")) out.push(usd("amount_cents"));
      if (has("due_date")) out.push(`Due ${formatDateLabel(String(facts.due_date))}`);
      const days = Number(facts.days_until_due);
      if (has("days_until_due")) out.push(days === 0 ? "Due today" : days === 1 ? "Tomorrow" : `In ${days} days`);
      break;
    }
  }
  return out;
}
