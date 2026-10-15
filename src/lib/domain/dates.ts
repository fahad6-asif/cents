// Pure date helpers. Days are ISO strings (YYYY-MM-DD), months "YYYY-MM", all in UTC.
// Business logic passes simToday() in explicitly; nothing here reads the clock.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Salary recurs monthly on this day (plan Section 2). */
export const SALARY_DAY = 14;

function parse(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Calendar day of a day or timestamp string. */
export function dayOf(isoOrTimestamp: string): string {
  return isoOrTimestamp.slice(0, 10);
}

/** "2026-10-15" → "2026-10" */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toDay(d);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

export function startOfMonth(month: string): string {
  return `${month}-01`;
}

/** "2026-10" → "2026-11", "2026-12" → "2027-01" */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function isMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/**
 * Next expected salary date. On the salary day itself the salary is treated as already received,
 * so the next one is a month later.
 */
export function nextIncomeDate(today: string): string {
  const day = Number(today.slice(8, 10));
  const month = day < SALARY_DAY ? monthOf(today) : addMonths(monthOf(today), 1);
  return `${month}-${String(SALARY_DAY).padStart(2, "0")}`;
}

/** "Thursday, 15 October" */
export function formatLongDate(iso: string): string {
  const d = parse(iso);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "14 Oct" */
export function formatShortDate(iso: string): string {
  const d = parse(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}

/** "October" (accepts a day or a month) */
export function monthName(isoOrMonth: string): string {
  return MONTHS[Number(isoOrMonth.slice(5, 7)) - 1];
}
