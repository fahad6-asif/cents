import { describe, expect, it } from "vitest";
import { correctionMessage, extractFigures, toVerification, verifyReply } from "@/lib/agent/verify";

const usd = (cents: number) => ({ cents, usd: `$${(cents / 100).toFixed(2)}` });

describe("extractFigures", () => {
  it("handles commas, no decimals, $0.00, unicode and ascii minus, and percentages", () => {
    const f = extractFigures("Spent $1,234.56, then $900 and $0.00. Over by −$60 or -$60.00 ($-5). Used 88%, 88.3% and −14%.");
    expect(f.filter((x) => x.kind === "usd").map((x) => x.value)).toEqual([123456, 90000, 0, -6000, -500]);
    expect(f.filter((x) => x.kind === "pct").map((x) => x.value)).toEqual([88, 88.3, -14]);
    expect(f.find((x) => x.value === -6000)?.raw).toBe("−$60");
  });

  it("counts a figure once however often it is mentioned", () => {
    expect(extractFigures("$120.00 now, $120.00 again, $120 once more.")).toHaveLength(1);
  });

  it("reads '12 percent' and ignores plain numbers and dates", () => {
    const f = extractFigures("Due in 7 days on 25 Oct, 12 percent higher.");
    expect(f).toEqual([{ raw: "12 percent", kind: "pct", value: 12 }]);
  });
});

describe("verifyReply", () => {
  const outputs = [
    { tool: "get_budget_status", output: { rows: [{ category: "Dining", limit: usd(30000), spent: usd(26500), utilization_pct: 88.3 }] } },
    { tool: "analyze_bills", output: { bills: [{ vs_average: { delta: usd(778), pct: 6.9 }, note: "unusual at 15% or more" }] } },
    { tool: "raw", output: { overage_cents: -6000, utilization: 0.42 } },
  ];

  it("matches figures from nested outputs (cents keys, usd strings, pct keys) and names the tool", () => {
    const r = verifyReply("You've spent $265.00 of $300.00 (88.3%). Electricity is up $7.78, about 7%.", outputs, "How am I doing?");
    expect(r.all_matched).toBe(true);
    expect(r.total_count).toBe(5);
    expect(r.figures.find((f) => f.raw === "$265.00")?.source_tool).toBe("get_budget_status");
    expect(r.figures.find((f) => f.raw === "7%")?.source_tool).toBe("analyze_bills");
  });

  it("is sign-insensitive, accepts ±$0.01 and ±0.1 percentage points, and reads raw ratios", () => {
    const r = verifyReply("You're $60 over. Within a cent: $264.99. 88.2% used. 42% of the limit. Threshold 15%.", outputs, "");
    expect(r.figures.map((f) => [f.raw, f.matched])).toEqual([
      ["$60", true],
      ["$264.99", true],
      ["88.2%", true],
      ["42%", true],
      ["15%", true],
    ]);
  });

  it("allows figures from the user's own message, with or without a $ sign", () => {
    expect(verifyReply("Yes, you can afford $900.", [], "Can I afford a $900 purchase?").all_matched).toBe(true);
    expect(verifyReply("Yes, you can afford $900.", [], "Can I afford 900?").all_matched).toBe(true);
    expect(verifyReply("A 10% cut is fine.", [], "cut dining by 10 percent").all_matched).toBe(true);
  });

  it("flags an invented figure and an off-by-more-than-rounding percent", () => {
    const r = verifyReply("You'll spend about $3,600.00 on dining next year, 6.5% more.", outputs, "Estimate next year's dining");
    expect(r.all_matched).toBe(false);
    expect(r.figures.filter((f) => !f.matched).map((f) => f.raw)).toEqual(["$3,600.00", "6.5%"]);
    expect(toVerification(r, true)).toMatchObject({ status: "partial", retried: true, verified_count: 0, total_count: 2 });
    expect(correctionMessage(r)).toContain("$3,600.00, 6.5%");
  });

  it("a whole-number percent matches its rounded source, a decimal one must be within 0.1", () => {
    expect(verifyReply("88%", outputs, "").all_matched).toBe(true);
    expect(verifyReply("88.5%", outputs, "").all_matched).toBe(false);
  });

  it("a reply with no figures has status none", () => {
    const r = verifyReply("I can't predict that.", outputs, "");
    expect(toVerification(r, false)).toMatchObject({ status: "none", total_count: 0, all_matched: true });
  });
});
