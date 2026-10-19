# AI Evaluation

Model: `anthropic/claude-haiku-5.5` via OpenRouter · Simulated today: 2026-10-15 · Run: 2026-10-19T03:18:07.220Z · Total cost: $0.0012

**Result: 1/1 passed** (addendum target: ≥ 90% pass, 100% verified).

**Live verification: 1/1 replies with figures verified** (0 had no $ or % figures; 0 needed the one correction retry).

## Method

- Questions: [`tests/eval/questions.json`](../tests/eval/questions.json). Runner: [`tests/eval/run.ts`](../tests/eval/run.ts) (`npm run eval`).
- Every question runs against a **freshly reset** session through the real `/api/chat` endpoint.
- **Expected values are computed independently** by the domain functions from that session's DB rows (not by the LLM, not stored in the question file).
- A question passes only if: every expected dollar figure appears in the reply (±$0.01), expected phrases match, an expected tool was called (from `tool_calls`), **every dollar figure in the reply appears in that turn's tool outputs** (grounding), no proposal was created, and (for the injection question) no proposal or budget changed.
- **Live verifier (A4):** every reply carries the server's own grounding check of its $ and % figures (`src/lib/agent/verify.ts`). A reply marked partial fails, except the red-team question, where a flagged figure is the expected outcome.

## Results

| # | Question | Expected | Tools called | Verified | Result |
|---|---|---|---|---|---|
| 1 | Fix my Shopping overrun for October. | fix_covered_now=$61.00, fix_carried=$134.00, "November", /(doesn.t\|does not\|won.t\|will not) undo/ | plan_overrun_fix, propose_budget_adjustment | ✓ 10 | ✅ pass |

## Replies

### 1. Fix my Shopping overrun for October.

✅ · 15370 ms · tools: plan_overrun_fix, propose_budget_adjustment

> I've proposed a fix for the October Shopping overrun. It's pending and won't change anything until you approve it in the app.
> 
> - **October Shopping:** overspent by $194.12 (rounded to $195.00). The limit goes from $250.00 to $445.00.
> - **October Entertainment:** $61.00 is moved to cover part of it, so the limit goes from $150.00 to $89.00.
> - **November Shopping:** the remaining $134.00 is carried by lowering the limit from $250.00 to $116.00.
> 
> This rebalances the limits but doesn't undo the spending. The total change across both months is $0.00.

