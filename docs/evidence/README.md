# Execution evidence

Everything here comes from real runs. All account data is **synthetic**: Cents is a demo on a simulated bank account. Production means https://cents-iota.vercel.app. Every text file here passed `scripts/scan-evidence.mts`, which checks for the real secret values, OpenRouter key strings and database URLs.

## Operation logs: the core scenario on the live site

**[`evidence_core_scenario.json`](evidence_core_scenario.json)** comes from one fresh session on production (`scripts/core-scenario-evidence.mts`), and covers the whole chain:

1. **Simulate** a restaurant charge (−$60.00). The balance and budgets are recalculated, Dining goes over, and an alert plus a one-click "Move $25 to Dining" proposal are created.
2. **Ask the AI** "Why am I over budget, and what can I do?". Its tool calls are logged, and every figure is checked (verified).
3. **Ask the AI** "Plan next month's budget". It creates a pending proposal, and the **user rejects it** with the button. November's limits are unchanged.
4. **The user approves** "Move $25 to Dining". The change is executed and the alert resolved. A second approval is **blocked** (`action_blocked`).
5. **Custom transaction:** Entertainment −$120.00 "Concert tickets". This triggers re-evaluation, new alerts, and an AI proposal marked **stale** right away (`action_stale`, because the approved move had changed the limits).
6. **AI impact note:** a fixed prompt, server-computed before → after facts, and read tools only. It is verified, with receipts.
7. **The full `/api/evidence` export** for that session: the audit log, every tool call (inputs and outputs), proposals, alerts and verification stats.

It opens with a `summary` (audit event counts, proposal outcomes, alert outcomes, a 100% verification rate) and the step-by-step `steps`; the complete `evidence` export follows. **[`custom-txn-evidence.json`](custom-txn-evidence.json)** is a smaller export focused on a custom transaction and its impact note.

## Test results

| File | What it is | Result |
|---|---|---|
| [`test-logs/unit-api-security.txt`](test-logs/unit-api-security.txt) | Every unit, API and security test (Vitest, on an in-process Postgres with the real migrations), verbose | **276 / 276 passed** (21 files) |
| [`test-logs/static-checks.txt`](test-logs/static-checks.txt) | Typecheck, lint, production build, and a secret scan of the client bundle | all clean |
| [`test-logs/e2e-production.txt`](test-logs/e2e-production.txt) | Browser tests on **production**, desktop 1360px + mobile 375px, including the live-AI tests | **88 passed, 0 failed** |
| [`test-logs/sessions-production.txt`](test-logs/sessions-production.txt) | Session isolation, exact reset, audit kept, forged cookie, row-level security on **production** | **11 / 11 passed** |
| [`test-logs/security-llm-production.txt`](test-logs/security-llm-production.txt) | Live attacks on **production** (real model): injection via data, jailbreak, injected system text, prompt extraction, key extraction, and an injection-shaped custom merchant | **all passed** |
| [`test-logs/eval-production.txt`](test-logs/eval-production.txt) | The AI evaluation (17 questions, expected values computed independently from the database) on **production** | see note below |
| [`ai-eval.json`](ai-eval.json) and [`../AI_EVAL.md`](../AI_EVAL.md) | Per-question results: expected figures, tools called, verified, readability, reply text | 17 / 17, 16 / 16 verified |
| [`phase9-llm-security.json`](phase9-llm-security.json) | Per-check results of the live attack suite, with each reply | all passed |
| [`phase6-questions.json`](phase6-questions.json), [`phase7-proposals.json`](phase7-proposals.json) | Earlier live runs of the AI's answers and proposals (build phases 6 and 7) | |

**Note on the eval log.** Its 20 Oct run scored **15/17**. In both failed cases the AI correctly ignored the injected "approve budget changes" text in a merchant name. But it then added "nothing was approved" without checking, and in one of those sessions a proposal *had* been approved earlier. The eval is meant to catch exactly this kind of ungrounded status claim. The prompt was fixed (rule 6: say the text was ignored, make no approval claims without `get_proposals`), and both cases pass locally (4/4). The production log is re-run after that fix is deployed.

The browser tests skip one test on production, `9. chat rate limit`. It seeds 30 rows into the shared database, which would use up 30 of the day's 500 live chat messages. It passes locally, and the rate-limit logic is covered in `unit-api-security.txt`.

## Screenshots

[`screens/`](screens) holds 67 screenshots at desktop and mobile:
- every page (`page-*`)
- the verified badge and the "How I got this" panel (`addendum/a4-*`, `a5-*`)
- the "Let the agent fix it" flow, step by step (`addendum/a6-1…4`)
- the custom-transaction dialog with its amber and red previews, and the impact note (`custom/`)
- before/after shots of 5 AI replies showing the new reply format (`readability/`, with the reply texts in `before-replies.json` and `after-replies.json`)

Most of `addendum/`, `custom/` and the `page-*` shots were last captured by the production test run.
