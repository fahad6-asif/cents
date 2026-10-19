# Performance (addendum A8)

Production numbers are in the "Production" section below. The before/after tables were measured **locally** on 19 Oct 2026: a dev server (`next dev`) in Pakistan talking to Neon Postgres in Singapore (`ap-southeast-1`, about 100 ms per round trip) and to OpenRouter (`anthropic/claude-haiku-5.5`). The addendum asks for the final numbers on production. The app has not been redeployed yet, so these are local numbers. Production should be faster on the database side, because Vercel's function region can sit next to the database (see "Region" below).

How to reproduce:

- Tool latency: `npx tsx scripts/perf-tools.mts 5 --snapshot` (5 runs per tool on a fresh demo session, through the same `executeTool` path the chat route uses).
- Turn latency: `npm run eval`. Every question writes its wall-clock `ms` to `docs/evidence/ai-eval.json`.

## What changed

1. **One DB client.** This was already a module-level singleton (`src/lib/db/client.ts`, `max: 5`, `prepare: false` for the pooler), so no change was needed.
2. **Session data loads in parallel.** `loadSessionData` used to run its 4 reads (account, transactions, budgets, bills) one after another. They now go out together with `Promise.all`.
3. **One data snapshot per chat turn, prefetched.** The chat turn starts loading the session's rows as soon as it begins, while the first model call is still thinking. Every read tool in that turn computes from that snapshot in memory. Writes (`propose_budget_adjustment`) and the live proposal status (`get_proposals`) still read the database.
4. **Parallel tool calls.** When one model response asks for several read tools, they run together. Proposal tools then run one at a time, after the reads. Results are logged and fed back to the model in the order it asked for them (covered by a test).
5. **One history call, not ten.** "Plan next month" made the model call `get_category_history` once per category (10 calls). The tool description and prompt now say to call it once, with no category.
6. **`get_proposals` makes one query.** The list and the counts now come from the same rows.
7. **Not done: perceived-speed hint** ("Working… step 2"). Chat is a single request and response with no streaming, so adding it isn't cheap. Skipped, as the addendum allows.

## Tool latency (ms)

| Measure | Before p50 | Before p95 | After p50 | After p95 | After, inside a chat turn (snapshot) p50 |
|---|---:|---:|---:|---:|---:|
| DB round trip (`select 1`) | 107 | 192 | 111 | 156 | n/a |
| `loadSessionData` | 982 | 1,124 | 514 | 1,395 | loaded once, behind the model call |
| get_account_summary | 1,039 | 1,169 | 339 | 594 | 0 |
| get_transactions | 1,124 | 1,229 | 232 | 241 | 0 |
| get_spending_by_category | 998 | 1,133 | 231 | 233 | 0 |
| get_budget_status | 963 | 1,128 | 232 | 245 | 0 |
| get_upcoming_bills | 1,014 | 1,031 | 234 | 236 | 0 |
| compare_monthly_spending | 1,024 | 1,090 | 234 | 238 | 0 |
| check_affordability | 917 | 1,005 | 240 | 242 | 0 |
| find_recurring_charges | 1,016 | 1,067 | 239 | 256 | 4 |
| analyze_bills | 1,136 | 1,200 | 234 | 235 | 0 |
| plan_overrun_fix | 942 | 1,219 | 238 | 250 | 0 |
| get_category_history | 971 | 1,036 | 238 | 240 | 1 |
| get_proposals | 584 | 616 | 208 | 219 | 218 (live DB read, on purpose) |
| **All read tools** | **1,005** | **1,200** | **234** | **339** | **0** |

**Target: read-tool p50 < 300 ms. Met** (234 ms standalone, about 0 ms inside a chat turn).

## Turn latency: full eval set, 17 questions (ms, wall clock per `/api/chat` turn)

| Group | Before p50 | Before p95 | After p50 | After p95 | Target |
|---|---:|---:|---:|---:|---|
| Single-tool questions (13) | 7,309 | 9,231 | 6,404 | 7,266 | < 6 s: **not met locally** (p50 6.4 s) |
| Multi-tool questions (3) | 8,649 / 10,272 / 27,048 | n/a | 9,298 / 9,526 / 11,370 | n/a | < 10 s: **met for 2 of 3** |
| All questions | 7,689 | 27,048 | 6,597 | 11,370 | n/a |

The biggest single win was "Plan next month's budget": **27.0 s → 11.4 s** (11 tool calls → 2).

**Where the rest of the time goes:** a typical turn is two model calls (one picks the tool, one writes the answer), at roughly 2.5–3 s each from here. Database time is now mostly hidden behind the first call. The remaining 6.4 s is almost entirely model time, so it can only come down further with streaming or a faster model. Neither is in scope.

## Production (20 Oct 2026)

Measured at https://cents-iota.vercel.app with the full eval set (`npm run eval -- https://cents-iota.vercel.app`): 17/17 passed, 16/16 verified, 17/17 readable, $0.0077 in total. The functions run in `sin1`, next to the database (confirmed by the `x-vercel-id: sin1::sin1` response header). The times below are wall-clock per `/api/chat` turn, measured from Pakistan.

| Group | p50 | p95 / values | Target |
|---|---:|---:|---|
| Single-tool questions (12) | 3,127 | 3,623 | < 6 s: **met** |
| Multi-tool questions (4) | n/a | 2,647 / 4,575 / 4,918 / 4,970 | < 10 s: **met** (plan next month 4.97 s) |
| All questions | 3,127 | 4,970 | n/a |

Compared with local, a single-tool turn is about 2× faster (6.4 s → 3.1 s), because the database is now a few milliseconds away instead of about 100 ms. That makes the snapshot prefetch nearly free. The production E2E suites also ran in 1.3 minutes, against about 9 minutes locally.

## Region

- Database: Neon, Singapore (`ap-southeast-1`).
- Functions: Vercel `sin1` (`vercel.json` `regions`).

## Correctness checks

- vitest: all tests pass, including two new A8 tests:
  - read tools take their figures from the turn snapshot, not the DB
  - a mixed batch (reads in parallel, the proposal after) keeps the model's order
- The full eval after the change is 17/17, with 16/16 replies verified.
