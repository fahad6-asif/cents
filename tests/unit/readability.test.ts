import { describe, expect, it } from "vitest";
import { checkReadability, countFigures, sentences } from "@/lib/agent/readability";

const kinds = (md: string) => checkReadability(md).issues.map((i) => i.kind);

describe("checkReadability", () => {
  it("passes the reference shapes from the spec", () => {
    const afford = [
      "**Yes, you can afford a $900 purchase.** You'd have **$2,361.26** left to spend freely.",
      "",
      "**How that's worked out**",
      "- Balance: $5,842.13",
      "- Bills before next income (Sat 14 Nov): $1,660.99",
      "- Essential budgets reserved: $919.88",
      "- Free to spend now: $3,261.26",
      "",
      "**Bills counted**",
      "| Bill | Amount | Due |",
      "|---|---|---|",
      "| Internet | $45.00 | Tue 20 Oct |",
      "| Phone | $30.00 | Thu 22 Oct |",
    ].join("\n");
    expect(checkReadability(afford)).toEqual({ ok: true, issues: [] });
    const subs = [
      "**You have 4 subscriptions costing $63.97/month.**",
      "",
      "- Gym membership: $35.00/mo (Health; easy to miss)",
      "- Streaming plan: $15.99/mo",
      "",
      "That's about **$767.64/year**. Want me to suggest which to cut?",
    ].join("\n");
    expect(checkReadability(subs).ok).toBe(true);
  });

  it("flags the old dense shape: no bold first line, a figure-packed sentence and paragraph", () => {
    const dense =
      "Yes, a $900 purchase is affordable.\n\nYour balance is $5,842.13, but after unpaid bills ($1,660.99 total, including Rent of $1,450.00) and essential budgets ($919.88), your disposable funds are $3,261.26. After the purchase it would be $2,361.26.";
    expect(kinds(dense)).toEqual(expect.arrayContaining(["first_line_no_bold", "sentence_figures", "paragraph_figures"]));
  });

  it("counts sentences without splitting decimals or money", () => {
    expect(sentences("You spent $1,234.56 on Dining. That's 12.5% more. Next month: $300.00.")).toHaveLength(3);
    expect(kinds("**Ok.** One. Two. Three. Four.")).toContain("paragraph_sentences");
    expect(kinds("**Ok.** One. Two.")).not.toContain("paragraph_sentences");
  });

  it("counts figures ($, −$, %, percent) and allows two per sentence", () => {
    expect(countFigures("−$60.00 and $5 and 88.3% and 12 percent")).toBe(4);
    expect(kinds("**Ok.** Spent $10.00 of $20.00.")).toEqual([]);
    expect(kinds("**Ok.** Spent $10.00 of $20.00 (50%).")).toEqual(["sentence_figures"]);
  });

  it("checks sentences inside bullets but not table rows", () => {
    expect(kinds("**Ok.**\n- Balance $1.00, bills $2.00, free $3.00")).toEqual(["sentence_figures"]);
    expect(kinds("**Ok.**\n| a | $1.00 | $2.00 | $3.00 |\n|---|---|---|---|")).toEqual([]);
  });

  it("flags a long first line, ISO dates, and long text with no list or table", () => {
    expect(kinds(`**${"x".repeat(170)}**`)).toContain("first_line_too_long");
    expect(kinds("**Due soon.** Rent is due 2026-11-01.")).toEqual(["iso_date"]);
    const wall = "**Ok.** " + "Plain words here and there. ".repeat(70);
    expect(kinds(wall)).toContain("long_without_structure");
    expect(kinds("**Ok.**\n- " + "word ".repeat(400))).not.toContain("long_without_structure");
  });
});
