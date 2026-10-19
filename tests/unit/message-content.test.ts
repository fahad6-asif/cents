import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageContent } from "@/components/chat/message-content";

const html = (text: string) => renderToStaticMarkup(createElement(MessageContent, { text }));

describe("MessageContent (B2.2)", () => {
  it("never renders raw HTML: an img/onerror payload and a <script> merchant come out as text", () => {
    const out = html('**Heads up.** <img src=x onerror=alert(1)>\n\n- Merchant: <script>alert("x")</script>: $9.00');
    expect(out).not.toMatch(/<img|<script/i);
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(out).toContain("&lt;script&gt;");
  });

  it("renders links and images as plain text (no navigation)", () => {
    const out = html("**See** [this](https://evil.example) and ![pic](https://evil.example/a.png) and www.evil.example");
    expect(out).not.toMatch(/<a\b|<img\b|href=/i);
    expect(out).toContain("this");
    expect(out).toContain("pic");
  });

  it("renders GFM tables in a scroll wrapper, amounts right-aligned in tabular digits", () => {
    const out = html("**Bills counted**\n\n| Bill | Amount | Due |\n|---|---|---|\n| Internet | $45.00 | Tue 20 Oct |\n| Rent | $1,450.00 | Sun 1 Nov |");
    expect(out).toContain('data-testid="reply-table"');
    expect(out).toMatch(/overflow-x-auto/);
    expect(out).toMatch(/<td class="[^"]*tabular[^"]*text-right[^"]*">\$1,450\.00<\/td>/);
    expect(out).toMatch(/<td class="[^"]*text-left[^"]*">Tue 20 Oct<\/td>/);
  });

  it("renders bold, lists (including a label line directly above a list) and headings as bold labels", () => {
    const out = html("**Yes.** You can.\n\n**Other updates:**\n- Net: $798.28\n- Alerts: Dining 88.3%\n\n## Big heading");
    expect(out).toContain("<strong");
    expect(out.match(/<li/g)).toHaveLength(2);
    expect(out).not.toMatch(/<h2/);
    expect(out).toContain("Big heading");
  });
});
