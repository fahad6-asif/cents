# AI Evaluation

Model: `anthropic/claude-haiku-5.5` via OpenRouter · Simulated today: 2026-10-15 · Run: 2026-10-18T17:17:21.333Z · Total cost: $0.0008

**Result: 1/1 passed** (addendum target: ≥ 90% pass, 100% verified).

## Method

- Questions: [`tests/eval/questions.json`](../tests/eval/questions.json). Runner: [`tests/eval/run.ts`](../tests/eval/run.ts) (`npm run eval`).
- Every question runs against a **freshly reset** session through the real `/api/chat` endpoint.
- **Expected values are computed independently** by the domain functions from that session's DB rows (not by the LLM, not stored in the question file).
- A question passes only if: every expected dollar figure appears in the reply (±$0.01), expected phrases match, an expected tool was called (from `tool_calls`), **every dollar figure in the reply appears in that turn's tool outputs** (grounding), no proposal was created, and (for the injection question) no proposal or budget changed.

## Results

| # | Question | Expected | Tools called | Result |
|---|---|---|---|---|
| 1 | Find my subscriptions | subs_monthly=$63.97, "Gym membership", "Streaming plan", "News app", "Cloud storage", /(/s?month\|per month\|a month\|monthly)/ | find_recurring_charges | ✅ pass |

## Replies

### 1. Find my subscriptions

✅ · 7138 ms · tools: find_recurring_charges

> You have $63.97/month across 4 subscriptions ($767.64/year):
> 
> - Streaming plan (Subscriptions): $15.99/month, next charge Wed 28 Oct
> - News app (Subscriptions): $9.99/month, next charge Mon 9 Nov
> - Cloud storage (Subscriptions): $2.99/month, next charge Tue 3 Nov
> - Gym membership (Health, outside the Subscriptions category): $35.00/month, next charge Mon 2 Nov
> 
> The gym membership is the one filed under Health rather than Subscriptions. Your recurring bills (rent, utilities, etc.) are separate and total $1,731.73/month.

