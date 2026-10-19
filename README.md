# Cents

An AI personal-finance assistant for a **simulated** bank account. Built for the 2026 Shenzhen FinTechathon, Topic A.

Cents watches a demo checking account, explains where the money went, warns about budgets and bills, and **proposes** budget changes. Nothing changes until you press **Approve**. Every dollar and percent the assistant says is checked against your account data before you see it.

> **Simulated data.** Every account, transaction, bill and budget in Cents is synthetic, generated from a fixed seed. No real bank is connected, and nothing here is financial advice.

**Live URL:** not deployed yet. The link will be added here after deployment.

## Features

**Dashboard (Overview)**
- Balance, this month's cash flow (money in, money out, net), a balance chart (1W / 1M / 3M / 1Y), spending by category and recent transactions.
- **Simulate transaction** adds a realistic event (restaurant, groceries, new subscription, electricity bill, salary, large purchase) so you can watch the alerts react.
- **Worth a look** shows the most important alert. It either offers a one-click fix ("Move $25 to Dining"), or, when no single move can fix an overrun, a **"Let the agent fix it"** button.

**Assistant** (the chatbox on Overview, or the full Assistant page)
- Answers questions about spending, budgets, bills, subscriptions and whether you can afford a purchase. It uses 12 read-only tools that compute every figure from your data, plus one tool that can only create a proposal. The model never does the arithmetic.
- **Subscriptions:** "Find my subscriptions" detects recurring charges, including ones filed under other categories (for example, a gym membership under Health).
- **Bills:** "Is my electricity bill normal?" compares the upcoming bill with your usual amount and its trend.
- **Overrun fix:** "Fix my Shopping overrun for October" covers the overspend from budgets that have room now, and carries the rest to next month's limit. It arrives as one proposal for you to approve.
- **Plan next month:** suggestions are based on your last three months of spending. It never cuts essential budgets, or budgets you're keeping up with.
- **Proposals, not actions.** The assistant can only *propose* budget changes. Approval happens only through a button in the app.
- **Verified figures:** under each answer, "✓ 6 figures checked against your account", or an amber warning if a figure couldn't be matched.
- **"How I got this":** a collapsible line, for example "✦ 2 steps · ✓ 6 figures checked · 4.1s", lists every check the assistant ran and its key numbers.

**Pages**
- **Bills:** upcoming and paid bills, the total due before your next income, and "Avg $X · ↑ N% vs usual" for each upcoming bill.
- **Transactions:** filter by month and category, and search.
- **Budgets:** current and next month, a pace line under each bar ("On pace", "Ahead of pace, projected $X", "Over in 2 of last 3 months"), pending proposals and recent decisions.
- **Insights:** active alerts and the action log (every proposal, approval, rejection and execution).
- **Settings:** reset the demo, and export this session's evidence as JSON.

Every visitor gets their own private copy of the demo account, through an anonymous session cookie. Visitors can't see each other's data.

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Recharts.
- Postgres on Neon (Singapore), through Drizzle ORM. Tests use PGlite, an in-process Postgres with the same migrations.
- The LLM is called through OpenRouter (OpenAI-compatible API). The model comes from `LLM_MODEL` (default `anthropic/claude-haiku-5.5`).
- Vitest for unit and API tests, Playwright for end-to-end tests and screenshots.

More detail: [`docs/TECHNICAL.md`](docs/TECHNICAL.md) · Security: [`docs/SECURITY.md`](docs/SECURITY.md) · AI evaluation: [`docs/AI_EVAL.md`](docs/AI_EVAL.md) · Speed: [`docs/PERF.md`](docs/PERF.md) · Demo walkthrough: [`docs/DEMO.md`](docs/DEMO.md)

## Setup

Requirements: Node.js 22+ and a Postgres database (the pooled connection string).

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local` (never commit it):

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Pooled Postgres connection string, used by the app at runtime (`prepare: false`). |
| `DATABASE_URL_UNPOOLED` | Optional direct connection string, used only for migrations. Falls back to `DATABASE_URL`. |
| `OPENROUTER_API_KEY` | OpenRouter API key, server-side only. |
| `LLM_MODEL` | Model ID on OpenRouter (default `anthropic/claude-haiku-5.5`). |
| `SIM_TODAY` | The simulated "today" for all date logic (default `2026-10-15`). |
| `DEMO_USER_NAME` | Name shown for the demo persona (default `Fahad`). |
| `CHAT_RATE_LIMIT_PER_HOUR` | Chat messages per session per hour (default 30). |
| `CHAT_GLOBAL_LIMIT_PER_DAY` | Chat messages across all sessions per UTC day (default 500). Protects the LLM credit. |
| `NEW_SESSIONS_PER_HOUR` | New demo sessions per hour across all visitors (default 300). |

Create the tables:

```bash
npm run db:migrate
```

## Run

```bash
npm run dev
```

Open http://localhost:3000. The first visit creates your session and copies the demo data into it.

## Test

```bash
npm test
```

```bash
npm run e2e
```

```bash
npm run eval
```

- `npm test`: unit, API and security tests on PGlite. No network needed.
- `npm run e2e`: Playwright against a running dev server, at desktop (1360px) and mobile (375px). Tests that call the real model are skipped unless `RUN_LLM_E2E=1` is set.
- `npm run eval`: the AI evaluation set (17 questions) against a running server. It writes `docs/AI_EVAL.md`. This costs a little LLM credit (about $0.01 per run).
- Also available: `npm run security:llm` (live prompt-injection and jailbreak checks), `npm run scan:bundle` (no secrets in client bundles), and `npx tsx scripts/perf-tools.mts 5 --snapshot` (tool latency).

## Deploy (Vercel + Neon)

1. Push the repository to GitHub and import it into Vercel.
2. In the Vercel project settings, add the environment variables above. Enter the secret values yourself; they never go in the repository.
3. Set the function region to Singapore (`sin1`), next to the database.
4. Run `npm run db:migrate` against the production database, then deploy.

## Seed data

The demo account is generated in code (`src/seed/generate.ts`) from a fixed random seed, so every session starts from exactly the same data:
- 12 months of history ending on `SIM_TODAY` (15 Oct 2026): 653 transactions and 61 bills.
- A $6,400 salary on the 14th, and a $3,000 transfer to savings the same day.
- Final balance: $5,842.13.
- October budgets are set so that, at load, Dining shows a warning (88%) and two bills are due within a week.

"Reset demo" (in Settings) restores this exact state for your session.

## Simulated data disclaimer

Cents is a demo. The account is not real, the "today" date is simulated, and suggestions are rule-based budget arithmetic, not financial advice. The assistant cannot move money. It can only propose budget-limit changes, which take effect only after you approve them.
