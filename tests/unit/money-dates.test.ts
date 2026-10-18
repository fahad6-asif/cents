import { describe, expect, it } from "vitest";
import {
  dateLabel,
  formatDateLabel,
  formatLoggedAt,
  formatTimeLabel,
  addDays,
  addMonths,
  dayOf,
  daysBetween,
  formatLongDate,
  formatShortDate,
  isMonth,
  monthName,
  monthOf,
  nextIncomeDate,
  startOfMonth,
} from "@/lib/domain/dates";
import { assertCents, formatUSD, roundUpTo, sumCents } from "@/lib/domain/money";

describe("formatUSD", () => {
  it("formats cents with grouping and two decimals", () => {
    expect(formatUSD(0)).toBe("$0.00");
    expect(formatUSD(5)).toBe("$0.05");
    expect(formatUSD(123456)).toBe("$1,234.56");
    expect(formatUSD(4821560)).toBe("$48,215.60");
    expect(formatUSD(123456789)).toBe("$1,234,567.89");
  });
  it("uses a true minus sign for negatives and optional plus", () => {
    expect(formatUSD(-8640)).toBe("−$86.40");
    expect(formatUSD(640000, { plus: true })).toBe("+$6,400.00");
    expect(formatUSD(0, { plus: true })).toBe("$0.00");
    expect(formatUSD(-1, { plus: true })).toBe("−$0.01");
  });
  it("rounds half up when dropping cents", () => {
    expect(formatUSD(212449, { whole: true })).toBe("$2,124");
    expect(formatUSD(212450, { whole: true })).toBe("$2,125");
    expect(formatUSD(-212450, { whole: true, plus: true })).toBe("−$2,125");
  });
  it("rejects non-integer money", () => {
    expect(() => formatUSD(1.5)).toThrow();
    expect(() => assertCents(Number.NaN)).toThrow();
    expect(() => sumCents([1, 0.1])).toThrow();
    expect(sumCents([100, -50, 25])).toBe(75);
  });
});

describe("roundUpTo", () => {
  it("rounds up to the nearest $5", () => {
    expect(roundUpTo(2500, 500)).toBe(2500);
    expect(roundUpTo(2301, 500)).toBe(2500);
    expect(roundUpTo(2501, 500)).toBe(3000);
    expect(roundUpTo(1, 500)).toBe(500);
  });
  it("returns 0 for zero or negative amounts", () => {
    expect(roundUpTo(0, 500)).toBe(0);
    expect(roundUpTo(-700, 500)).toBe(0);
  });
});

describe("dates", () => {
  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-10-15", -90)).toBe("2026-07-17");
  });
  it("adds months across year boundaries", () => {
    expect(addMonths("2026-10", 1)).toBe("2026-11");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
  it("counts days between dates", () => {
    expect(daysBetween("2026-10-15", "2026-10-22")).toBe(7);
    expect(daysBetween("2026-10-15", "2026-10-15")).toBe(0);
    expect(daysBetween("2026-10-15", "2026-10-14")).toBe(-1);
  });
  it("extracts days and months", () => {
    expect(dayOf("2026-10-14T06:00:00.000Z")).toBe("2026-10-14");
    expect(monthOf("2026-10-14")).toBe("2026-10");
    expect(startOfMonth("2026-10")).toBe("2026-10-01");
    expect(isMonth("2026-10")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("26-10")).toBe(false);
  });
  it("finds the next salary date (14th; on the 14th itself it is next month)", () => {
    expect(nextIncomeDate("2026-10-13")).toBe("2026-10-14");
    expect(nextIncomeDate("2026-10-14")).toBe("2026-11-14");
    expect(nextIncomeDate("2026-10-15")).toBe("2026-11-14");
    expect(nextIncomeDate("2026-12-20")).toBe("2027-01-14");
  });
  it("formats display dates", () => {
    expect(formatLongDate("2026-10-15")).toBe("Thursday, 15 October");
    expect(formatShortDate("2026-10-14")).toBe("14 Oct");
    expect(monthName("2026-10")).toBe("October");
    expect(monthName("2026-09-30")).toBe("September");
  });
});

describe("shared date/time labels (no locale dependence)", () => {
  it("formats days as 'Tue 20 Oct' and pairs iso + label", () => {
    expect(formatDateLabel("2026-10-20")).toBe("Tue 20 Oct");
    expect(formatDateLabel("2026-11-14")).toBe("Sat 14 Nov");
    expect(dateLabel("2026-10-22T07:00:00.000Z")).toEqual({ iso: "2026-10-22", label: "Thu 22 Oct" });
  });
  it("formats real-clock times identically everywhere, in UTC", () => {
    expect(formatTimeLabel("2026-10-18T14:35:10.000Z")).toBe("2:35 PM UTC");
    expect(formatTimeLabel("2026-10-18T00:05:00.000Z")).toBe("12:05 AM UTC");
    expect(formatTimeLabel("2026-10-18T12:00:00.000Z")).toBe("12:00 PM UTC");
    expect(formatLoggedAt("2026-10-18T09:32:00.000Z")).toBe("18 Oct, 9:32 UTC");
  });
});
