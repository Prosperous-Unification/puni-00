# Batch 1 field data: attempts, time and what a token count is

Status: field data for the agentic planning research (work item R4), recorded 2026-09-20. It answers question E6 of `docs/superpowers/plans/2026-09-20-wbs-agentic-planning-research.md` and corrects a claim that plan made before this data existed.

## Where the numbers come from

Two records, both outside the repository, both written by tools and not by hand:

- The planner's attempt ledger: one line when an executor attempt was dispatched and one when it returned, to the second.
- The executor's own session files (Codex command-line tool, model `gpt-5.6-sol`, medium effort), which end with a cumulative usage record: `input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_output_tokens`, `total_tokens`.

31 attempts, 329 minutes of executor wall-clock in all, between 2026-09-19 21:22 UTC and 2026-09-20 08:05 UTC. Planning, the high-effort reviews and the planner's own verification are not in these figures: their sessions were not recorded in a comparable way, which is itself a finding.

## What "tokens used" meant

The executor tool prints one line at the end of a run, `tokens used`, and that line is what batch 1's results page first reported. It is **uncached input plus output**, exactly: for 010.5 the session record has 10,769,814 input tokens of which 10,623,232 were cached, and 22,149 output tokens; 10,769,814 − 10,623,232 + 22,149 = 168,731, the printed figure.

So one run has at least four honest token counts, and they differ by two orders of magnitude:

| Count                                                        | Batch 1 executors, all attempts  |
| ------------------------------------------------------------ | -------------------------------- |
| Total tokens processed (input including cached, plus output) | 193,689,956                      |
| Cached input                                                 | 188,211,328 (97.2% of the total) |
| Uncached input                                               | 4,834,448                        |
| Output, of which reasoning                                   | 644,180, 150,714                 |
| Uncached input plus output (the tool's "tokens used")        | 5,478,628                        |

An agent loop resends its whole context on every turn, and the provider's cache absorbs almost all of it. Which count matters depends on the question: cost follows the provider's price list, where cached input is billed at a fraction of uncached; quota follows whatever the provider's limits count; context pressure follows input per turn, not any of these sums.

## Per work item

Estimated tokens are the plan's `mid-level-mid-effort-implementation-tokens` for the item, written before execution without saying which count they meant.

| Item  | Size | Attempts | Minutes | Uncached input | Cached input | Output  | Total      | Tool's "tokens used" | Estimated  | Estimate ÷ total | Estimate ÷ "tokens used" |
| ----- | ---- | -------- | ------- | -------------- | ------------ | ------- | ---------- | -------------------- | ---------- | ---------------- | ------------------------ |
| 010.5 | S    | 1        | 12      | 146,582        | 10,623,232   | 22,149  | 10,791,963 | 168,731              | 2,500,000  | 0.23             | 14.8                     |
| 020.1 | S    | 1        | 14      | 149,735        | 6,393,472    | 28,985  | 6,572,192  | 178,720              | 2,500,000  | 0.38             | 14.0                     |
| 010.3 | DOC  | 2        | 23      | 304,774        | 11,222,784   | 44,199  | 11,571,757 | 348,973              | 3,000,000  | 0.26             | 8.6                      |
| 110.5 | DOC  | 4        | 34      | 580,334        | 14,828,544   | 77,456  | 15,486,334 | 657,790              | 3,000,000  | 0.19             | 4.6                      |
| 020.8 | M    | 7        | 66      | 1,058,623      | 35,279,488   | 128,016 | 36,466,127 | 1,186,639            | 9,000,000  | 0.25             | 7.6                      |
| 040.6 | M    | 5        | 57      | 853,247        | 41,527,552   | 111,211 | 42,492,010 | 964,458              | 9,000,000  | 0.21             | 9.3                      |
| 010.4 | L    | 5        | 65      | 806,548        | 38,630,400   | 107,844 | 39,544,792 | 914,392              | 22,000,000 | 0.56             | 24.1                     |
| 040.3 | L    | 5        | 41      | 479,400        | 12,525,696   | 60,052  | 13,065,148 | 539,452              | 22,000,000 | 1.68             | 40.8                     |
| 060.1 | RES  | 1        | 17      | 455,205        | 17,180,160   | 64,268  | 17,699,633 | 519,473              | —          | —                | —                        |

060.1 is its preparation slice only. 040.6 is the plan's one item for two packets (directory, then preferences).

## What this corrects

The research plan's field evidence said the estimates were "4.6 to 40.8 times" the tokens actually used. That compared the estimate with the tool's "tokens used". Against total tokens the same estimates were between 0.19 and 1.68 times the actual: the small and medium items were **under**estimated about fourfold, and only the two large ones came out near or above. Both statements are arithmetic on the same runs. The claim was wrong to present one of them as the answer without saying which count it used, and the values recorded in the plan as `token_actual` on 2026-09-20 are the "tokens used" count.

## What it means for the research

- E6 has its answer in kind: a measure called "tokens" is ambiguous until it names its count. The WBS's `token_estimate` and `token_actual` metrics need either a stated definition or to become several metrics. Candidates: total processed, uncached input plus output, output only, and cost in money, which is the one a budget actually cares about.
- Size class predicted attempts and minutes better than it predicted tokens: S items took one attempt and 12 to 14 minutes; M items five to seven attempts and about an hour; L items five attempts and 41 to 65 minutes. Tokens per minute varied threefold between items.
- Wall-clock per attempt ranged from 2 to 25 minutes, median about 10. That is the grain question E1 and the timeline question T5 have to serve.
- Two attempts died to provider capacity and were rerun, and six stopped on packet defects. A plan that records attempts (question T1) would have shown that; a plan that records one start and one end per item hides it.
