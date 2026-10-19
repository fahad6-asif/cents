import { Children, isValidElement, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Assistant replies as GFM Markdown (B2.2). Security: raw HTML is never rendered (react-markdown
 * escapes it; no rehype-raw, no dangerouslySetInnerHTML), links and images render as plain text,
 * because reply text can quote merchant names that come from data.
 */

/** Plain text of rendered children (for deciding whether a table cell is an amount). */
function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : isValidElement<{ children?: ReactNode }>(c) ? textOf(c.props.children) : ""))
    .join("");
}
const AMOUNT = /^[−–+-]?\s?\$?\s?[\d,]+(\.\d+)?\s?(%|\/mo(nth)?|\/yr|\/year)?$/i;
const isAmount = (children: ReactNode) => AMOUNT.test(textOf(children).trim());

const components: Components = {
  p: ({ children }) => <p>{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-text-muted">{children}</ul>,
  ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:text-text-muted">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  // Headings are too big in a chat card: show them as bold labels.
  h1: ({ children }) => <p className="font-semibold">{children}</p>,
  h2: ({ children }) => <p className="font-semibold">{children}</p>,
  h3: ({ children }) => <p className="font-semibold">{children}</p>,
  h4: ({ children }) => <p className="font-semibold">{children}</p>,
  h5: ({ children }) => <p className="font-semibold">{children}</p>,
  h6: ({ children }) => <p className="font-semibold">{children}</p>,
  // No navigation out of a reply: links and images become their text.
  a: ({ children }) => <span>{children}</span>,
  img: ({ alt }) => <span>{alt ?? ""}</span>,
  code: ({ children }) => <code className="rounded bg-muted-fill px-1 py-0.5 text-[14px]">{children}</code>,
  pre: ({ children }) => <div className="whitespace-pre-wrap">{children}</div>,
  hr: () => <hr className="border-line" />,
  blockquote: ({ children }) => <div className="border-l-2 border-line pl-3 text-text-secondary">{children}</div>,
  // Tables scroll inside their own wrapper on narrow screens, never the page.
  table: ({ children }) => (
    <div data-testid="reply-table" className="-mx-1 max-w-full overflow-x-auto px-1">
      <table className="w-full border-collapse text-[14px] leading-[20px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-line last:border-b-0">{children}</tr>,
  th: ({ children }) => (
    <th className={`border-b border-line px-3 py-2 text-[12px] font-medium tracking-wide whitespace-nowrap text-text-muted uppercase first:pl-0 ${isAmount(children) ? "text-right" : "text-left"}`}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className={`px-3 py-2 align-top first:pl-0 ${isAmount(children) ? "tabular text-right whitespace-nowrap" : "text-left"}`}>{children}</td>
  ),
};

export function MessageContent({ text }: { text: string }) {
  return (
    <div
      data-testid="message-content"
      className="flex flex-col gap-2 text-[16px] leading-[1.55] text-text [&>p:first-child]:text-[17px] [&>p:first-child]:leading-[1.5]"
    >
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  );
}
