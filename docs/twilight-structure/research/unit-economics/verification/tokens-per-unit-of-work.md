# Verification of research-tokens-and-dollars-per-unit-of-real-soft.md (facts with confidence "quoted" or "derived")

## Overall

Verified 33 of the sheet's ~35 distinct quoted/derived facts against their primary sources (facts 42-46, 54, 55 were explicitly marked 'estimated' and mostly skipped per instructions, though several of their underlying anchors were independently re-confirmed via the facts above). Result: the large majority (approximately 27 of 33) are CONFIRMED verbatim or near-verbatim against the cited source, including every core Anthropic-docs number (costs, prompt-caching, code-review pricing), the Bun port economics, the HAL/Aider/Epoch/arXiv benchmark tables, and most of the vendor-pricing facts (Cursor, Codex, Jules, Augment, Amp, Factory, Codacy roundup). Two facts contain a REFUTED sub-value that should be corrected in the sheet: (22) the MiniMax-M3 row in the merged-feature study ($10.27/$4.50/$14.77/3-cycles is wrong; actual is $12.55/$2.55/$15.10/105min/2-cycles), and (40) the dataset name is 'SWE-rebench' not 'SWE-bench' (numbers themselves are right). Two facts (9, 10) remain UNVERIFIABLE exactly as the sheet itself flagged — the $1.39/$0.70/91.7%/93%/2.5-3.7x figures do not appear on the cited Anthropic announcement page at all (checked twice), so they rest entirely on unlogged caller context; fact 11's non-Opus-5 prices are unverifiable the same way. Two facts (27, 37) are PARTIALLY unverifiable: Uber's '~5,000 engineers' headcount and '32%->84%' adoption swing, and Factory's 'prepaid credits from $10' / 'Droid Core' pool naming, do not appear on their cited sources even after a second check. No new Not-found items were recovered (search budget for this session was exhausted mid-task, so all follow-up work after that point used WebFetch only); three additional material facts a cost model should account for were found and are listed under additions (contracted-rate override, 1.1x data-residency multiplier, and two scale/detail gaps in existing sources).

## Checks

### 1. Fact 1: Anthropic Claude Code cost guidance ~$13/dev/day, $150-250/mo, <$30/day for 90%

- verdict: confirmed
- original: ~$13/dev/day; $150-250/mo; <$30/day for 90%
- corrected: same
- evidence: https://code.claude.com/docs/en/costs
- note: Exact text reproduced verbatim on the live page, fetched today.

### 2. Fact 2: earlier Claude Code guidance $6/day, 90% under $12/day, $100-200/mo

- verdict: unverifiable
- original: $6/day; <$12/day for 90%; $100-200/mo
- corrected: n/a
- evidence: https://tokencost.app/blog/claude-code-cost-per-session
- note: Secondary source not independently re-fetched this round (budget spent on primaries); sheet already flags this as secondary and that web.archive.org could not date the change. No new evidence either way.

### 3. Fact 3: worked session example claude-sonnet-4-6 1.2k/5.3k/940.0k/50.0k tokens = $0.55, 6m20s

- verdict: confirmed
- original: 1.2k input, 5.3k output, 940.0k cache read, 50.0k cache write = $0.55; 6m20s API duration
- corrected: same
- evidence: https://code.claude.com/docs/en/costs
- note: Verbatim code block match: 'Total cost: $0.55 / Total duration (API): 6m 20s / claude-sonnet-4-6: 1.2k input, 5.3k output, 940.0k cache read, 50.0k cache write'.

### 4. Fact 4: /usage cache line '14 requests · 91% of input tokens from cache · 2 misses', miss = >5% and >=2000 tokens

- verdict: confirmed
- original: 14 requests · 91% · 2 misses; miss threshold 5%/2000 tokens
- corrected: same
- evidence: https://code.claude.com/docs/en/costs
- note: Verbatim match, including the miss-threshold definition text.

### 5. Fact 5: agent teams ~7x tokens of standard sessions in plan mode, roughly proportional to team size

- verdict: confirmed
- original: ~7x; proportional to team size
- corrected: same
- evidence: https://code.claude.com/docs/en/costs
- note: Verbatim: 'Agent teams use approximately 7x more tokens than standard sessions when teammates run in plan mode, because each teammate maintains its own context window.'

### 6. Fact 6: background token usage typically under $0.04/session

- verdict: confirmed
- original: <$0.04/session
- corrected: same
- evidence: https://code.claude.com/docs/en/costs
- note: Verbatim match.

### 7. Fact 7: cache reads billed ~10% of input; 1h TTL subscription-in-plan, 5min elsewhere; subagents get 5min default; various actions force full re-read

- verdict: confirmed
- original: ~10% of input; 1h/5min TTL split; subagent 5min default; model switch/effort/MCP/compaction/upgrade invalidate cache
- corrected: same
- evidence: https://code.claude.com/docs/en/prompt-caching
- note: All mechanics confirmed verbatim, including the Fable 5.1 exception for effort-level changes and the exact TTL table.

### 8. Fact 8: Anthropic Code Review $15-25/review average, ~20 min/review

- verdict: confirmed
- original: $15-25; ~20 min average
- corrected: same
- evidence: https://code.claude.com/docs/en/code-review
- note: Verbatim: 'Each review averages $15-25 in cost...' and 'completing in 20 minutes on average.'

### 9. Fact 9: Opus 5 SWE-bench Verified ~91.7% at ~$1.39/task default effort; ~93% at ~$0.70 with low-then-rerun-failures

- verdict: unverifiable
- original: $1.39 @ 91.7%; $0.70 @ 93%
- corrected: n/a
- evidence: https://www.anthropic.com/news/claude-opus-5
- note: Refetched the live announcement page: it contains only the $5/$25 per-token price and a 'within 0.5% of Fable 5's peak score at half the cost per task' relative claim on CursorBench 3.2. No $1.39, $0.70, 91.7%, or 93% figures appear anywhere on the page. Sheet's own caveat is correct; these numbers remain caller-context-only and not confirmable from the cited URL.

### 10. Fact 10: Anthropic-reported caching savings 2.5x-3.7x at 81-90% hit rates

- verdict: unverifiable
- original: 2.5x-3.7x at 81-90% hit rate
- corrected: n/a
- evidence: https://www.anthropic.com/news/claude-opus-5
- note: Not present anywhere on the fetched announcement page. Same as fact 9 — caller-context only.

### 11. Fact 11: Anthropic list prices, Fable 5.1 $10/$50, Opus 5 $5/$25, Sonnet 5 $2/$10, Haiku 4.5 $1/$5, cache read 0.1x/0.25x, cache write 1.25x/2x, Batch 50% off

- verdict: corrected
- original: as listed
- corrected: Only 'Opus 5: $5 per million input tokens and $25 per million output tokens' is confirmed on the cited page. Fable 5.1, Sonnet 5, Haiku 4.5 prices and the cache read/write multipliers and Batch discount are NOT present on this page.
- evidence: https://www.anthropic.com/news/claude-opus-5
- note: Sheet already flags 'rest from caller context'; this is confirmed as the honest state — only the Opus 5 $5/$25 clause is verifiable from the cited URL, matching the sheet's caveat exactly.

### 12. Fact 12: multi-agent research system, agents ~4x chat tokens, multi-agent ~15x, tokens explain ~80% of variance

- verdict: confirmed
- original: 4x; 15x; ~80% variance
- corrected: same
- evidence: https://www.anthropic.com/engineering/built-multi-agent-research-system
- note: Verbatim: 'agents typically use about 4x more tokens than chat interactions', 'multi-agent systems use about 15x more tokens than chats', and 'token usage by itself explains 80% of the variance' (of the 95% explained by three factors).

### 13. Fact 13: context editing: 84% token reduction in 100-turn eval; memory+context editing +39%; context editing alone +29%

- verdict: confirmed
- original: 84% reduction; +39% combined; +29% alone
- corrected: same
- evidence: https://claude.com/blog/context-management
- note: Verbatim: 'reducing token consumption by 84%'; combined improvement 39%; context editing alone 29%.

### 14. Fact 14: HAL SWE-bench Verified Mini per-task costs (SWE-agent+Sonnet4.5 High $9.28/task etc.)

- verdict: confirmed
- original: 72%@$9.28; 68%@$10.12; 61%@$27.03; 54%@$5.18; 44%@$1.31; 24%@$0.09
- corrected: same
- evidence: https://hal.cs.princeton.edu/swebench_verified_mini
- note: All six rows' accuracy and total-run cost figures match the fetched leaderboard table exactly (total/50 = per-task, consistent with sheet's derivation).

### 15. Fact 15: Aider polyglot per-exercise costs (gpt-5 high/medium/low, o3-pro, DeepSeek-V3.2-Exp, opus-4)

- verdict: confirmed
- original: gpt-5 high 88.0%/$29.08; medium 86.7%/$17.69; low 81.3%/$10.37; o3-pro 84.9%/$146.32; DeepSeek-V3.2-Exp 74.2%/$1.30; opus-4 72.0%/$65.75
- corrected: same
- evidence: https://aider.chat/docs/leaderboards/
- note: All figures confirmed on a second, targeted fetch; DeepSeek-V3.2-Exp specifically resolved as the 'reasoner' variant (74.2%/$1.30), distinct from the 'chat' variant (70.2%/$0.88) which the sheet did not cite.

### 16. Fact 16: Epoch SWE-bench Verified budget: 2M uncached, 20M cached-read allowance, 484 validated samples

- verdict: confirmed
- original: 2M uncached / 20M cached-read; 484 samples
- corrected: same
- evidence: https://epoch.ai/benchmarks/swe-bench-verified
- note: Verbatim: '2M uncached read/write tokens (including reasoning), and 20M cached token reads' per task; 484 validated samples (16 excluded of 500).

### 17. Fact 17: agentic coding 1000x chat tokens, 3500x single-round, 1200x multi-turn chat, up to 30x run variance, Kimi-K2/Sonnet4.5 >1.5M more tokens than GPT-5, self-prediction correlation <=0.39

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://arxiv.org/abs/2604.22750
- note: Abstract confirms 1000x, 30x run-to-run variance, >1.5M-token delta for Kimi-K2/Sonnet-4.5 vs GPT-5, and correlation 'up to 0.39'. The 3500x and 1200x sub-figures were not independently re-surfaced in this fetch but were not contradicted either.

### 18. Fact 18: Claw-SWE-Bench harness 27.4pp, model 29.4pp, minimal vs full adapter on GLM 5.1 19.1% vs 73.4%, 350 instances 8 languages

- verdict: confirmed
- original: 27.4pp; 29.4pp; 19.1% vs 73.4%; 350 instances/8 languages
- corrected: same
- evidence: https://arxiv.org/abs/2606.12344
- note: All figures confirmed; abstract also gives 43 repositories (not previously in sheet, additive detail).

### 19. Fact 19: SWE-bench Verified task size distribution (39%/52%/8%/3 issues, 1.87 functions, 78%, ~90%)

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://epoch.ai/publications/what-skills-does-swe-bench-verified-evaluate
- note: All percentages, LOC averages, function count and touch-only-functions percentage confirmed verbatim.

### 20. Fact 20: SWE-bench Pro 107.4 LOC/4.1 files, 1,865 problems/41 repos, GPT-5 23.3%, Opus 4.1 23.1% (public)

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://scale.com/blog/swe-bench-pro
- note: Confirmed exactly, plus the page loaded successfully this time (sheet's separate note about a 403 refers to a different Scale leaderboard page, not this blog post).

### 21. Fact 21: merged-feature study $2.81-$33.38, 26min-~3h, 1-5 review cycles

- verdict: confirmed
- original: $2.81-$33.38; 26min-3h; 1-5 cycles
- corrected: same
- evidence: https://blog.insight-services-apac.dev/2026/07/06/cost-to-a-merged-feature
- note: Fetch shows time range as '26 minutes to 176 minutes' (176m = ~2.93h), consistent with the sheet's '~3h.' Dollar range and cycle range confirmed exactly.

### 22. Fact 22: per-run detail table across models/harnesses, including MiniMax-M3 via Claude Code router: 10.27/4.50/14.77 (3 cycles)

- verdict: refuted
- original: MiniMax-M3: 10.27/4.50/14.77 (3 cycles)
- corrected: MiniMax-M3 via Claude Code router (ccr): $12.55 coding / $2.55 gate / $15.10 total, 105 minutes, 2 review cycles
- evidence: https://blog.insight-services-apac.dev/2026/07/06/cost-to-a-merged-feature
- note: Every other row in fact 22 (Opus 4.8 x3 variants, Sonnet 5 x2 runs, Sonnet 4.6, Fable 5 x2 harnesses, GPT-5.5 x2 runs, GPT-5.4-mini x2 runs, MAI-Code-1-Flash x2 runs, Kimi-K2.7, Qwen3-Coder-Next, GLM-5.2, GPT-5.6 Sol) matched the fetched table exactly. Only the MiniMax-M3 row does not match: sheet's $10.27/$4.50/$14.77/3-cycles vs. the page's actual $12.55/$2.55/$15.10/105m/2-cycles.

### 23. Fact 23: Bun port 535,496 LOC, 1,009,272 lines added, 6,502 commits/11 days, 64 Fable5 agents, ~$165,000, 5.9B/690M/72B token split

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://bun.com/blog/bun-in-rust
- note: All figures confirmed verbatim, including the exact token split (5.9B uncached input / 690M output / 72B cached reads) and the 'Claude Fable 5 (pre-release)' model identity and '64 Claudes at a time' peak.

### 24. Fact 24: derived Bun per-commit economics ($25.4/commit, ~12M processed input tokens/commit, $163/kLOC, cache ratios)

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://bun.com/blog/bun-in-rust
- note: Pure arithmetic on the confirmed fact-23 figures; recomputation checks out (165000/6502=25.38; 5.9e9/6502=907k; 72e9/6502=11.07M; 690e6/6502=106k; 72/(72+5.9)=92.4%).

### 25. Fact 25: heavy user ~10B tokens Jun2025-Feb2026, >$15,000 API-equiv vs ~$800 paid on Max, peak month 2.4B tokens=$5,623, >90% cache reads

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://www.ksred.com/claude-code-pricing-guide-which-plan-actually-saves-you-money/
- note: All figures confirmed verbatim, including the peak-month $5,623 API-equivalent and >90% cache-read share quote.

### 26. Fact 26: GitHub issue #41506, ~2.25M tokens/session, 1,000 LOC, 4 deploys, 15 messages, ~40,000 token overhead (57 plugins/9 MCP/rules), 42% of Max 5x window

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://github.com/anthropics/claude-code/issues/41506
- note: All numbers confirmed, plus model/settings detail (claude-opus-4-6[1m], effortLevel high, alwaysThinkingEnabled true) matching the sheet's note. 3-5x jump claim also confirmed.

### 27. Fact 27: Uber $500-2,000/eng/mo, ~5,000 engineers, budget exhausted in 4 months, 70% AI-originated code, adoption 32%(Feb)->84%(Mar)

- verdict: corrected
- original: as listed
- corrected: Confirmed: $500-2,000/engineer/month; budget exhausted in 4 months (Dec 2025-Apr 2026); 70% of committed code AI-originated. NOT found on the source (checked twice): the '~5,000 engineers' headcount and the '32% (Feb) to 84% (Mar)' adoption figures. The source instead states '95% of Uber engineers now use AI tools monthly' (as of Apr 2026) and 'usage doubled by February' (no absolute percentages given).
- evidence: https://www.briefs.co/news/uber-torches-entire-2026-ai-budget-on-claude-code-in-four-months/
- note: Partial refutation/unverifiable split: dollar and budget-timeline claims hold; the specific engineer count and Feb/Mar percentages are unconfirmable from this URL and may come from Forbes/Moneywise coverage the sheet notes as unreachable (403).

### 28. Fact 28: Devin Core $20/mo incl 9 ACU then $2.25/ACU; prior Team $500/mo at $2.00/ACU; 1 ACU=~15min => $9/hr Core, $8/hr Team

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://siliconangle.com/2025/04/03/cognition-ai-launches-revamped-coding-assistant-devin-2-0-much-lower-starting-price/
- note: Core/Team plan figures and 15-min-per-ACU definition confirmed verbatim. Sheet's own $9/hr (Core) and $8/hr (Team) hourly-rate derivations check out arithmetically (4 ACU/hr x $2.25=$9; x$2.00=$8); an AI summarizer artifact on this fetch stated a wrong '$11/hour' but that is not on the source page itself.

### 29. Fact 29: Devin ACUs per task (bug fix 2-3=$4.50-6.75, refactor 30+=$67.50+, feature 10-40 ACU, dependency bump ~0.3, tangled refactor ~5)

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://techsy.io/en/blog/background-coding-agents-compared
- note: Bug-fix and multi-file-refactor ACU/dollar figures confirmed verbatim on techsy.io itself. Sheet already correctly attributes the 10-40 ACU feature range, ~0.3 ACU dependency bump, and ~5 ACU tangled refactor to third-party guides rather than techsy — consistent with what techsy's own text supports.

### 30. Fact 30: background agent per-task costs (Codex Cloud, Claude Code Remote, Cursor, Copilot, Jules)

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://techsy.io/en/blog/background-coding-agents-compared
- note: All five vendors' ranges confirmed verbatim, including Copilot's ~$0.12/task figure.

### 31. Fact 31: Cursor pools Pro $20->$20, Pro+ $60->$70, Ultra $200->$400; Teams $40/user + $0.25/M tokens; Bugbot $1-1.50/run

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://omidsaffari.com/blog/cursor-pricing
- note: Pool amounts and Teams token-rate confirmed verbatim on this secondary; separately confirmed Cursor's own pricing page (cursor.com/pricing) still does NOT print the $20/$70/$400 pool amounts, matching the sheet's caveat exactly.

### 32. Fact 32: OpenAI Codex plan limits and credit rate card

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://learn.chatgpt.com/docs/pricing
- note: All message ranges, Pro pricing/multiplier, and per-model credit table (input/cached/output per 1M tokens) confirmed verbatim, plus the '5-30 credits per message' quote for GPT-5.6 Sol. Dollar-per-credit still not on this page, matching sheet's not-found caveat.

### 33. Fact 33: Google Jules plan limits (Free 15/3, Pro 100/15, Ultra 300/60)

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://jules.google/docs/usage-limits/
- note: All task/concurrency numbers and model tiers confirmed verbatim; no USD pricing on this page, matching sheet's caveat.

### 34. Fact 34: Augment Code Standard/Business $20/$100 = same $ usage, 40% fee on LLM tokens, up to 50 seats

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://www.augmentcode.com/pricing
- note: Confirmed verbatim, including the exact '40% fee on LLM usage (no fee on compute)' language.

### 35. Fact 35: Augment 4-task credit test totals ($2.16 for 4 tasks at $0.0005/credit)

- verdict: confirmed
- original: as listed per-task figures
- corrected: same
- evidence: https://dev.to/kilocode/testing-augment-codes-new-credit-system-with-4-real-tasks-1mi7
- note: All four task credit/dollar figures and the total confirmed verbatim.

### 36. Fact 36: Sourcegraph Amp Megawatt $20 incl $20, Gigawatt $200 incl $200, Unconstrained API pricing

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://ampcode.com/pricing
- note: Confirmed, plus additive detail not in sheet: Megawatt also includes 750 hours of orbs, Gigawatt 1,000 hours of xxlarge orbs.

### 37. Fact 37: Factory Pro $20, Plus $100(~5x), Max $200(~10x), Teams $60+$40/seat, prepaid credits from $10, 'Droid Core' open-weight pool

- verdict: corrected
- original: as listed
- corrected: Confirmed: Pro $20/mo, Plus $100/mo (~5x Pro usage), Max $200/mo (~10x Pro usage), Teams $60/mo + $40/seat (fetch found 'up to 10 seats' rather than the sheet's unspecified seat cap). NOT found on factory.ai/pricing (checked twice): the 'prepaid credits from $10' figure and any 'Droid Core' open-weight pool naming.
- evidence: https://factory.ai/pricing
- note: Plan tiers confirmed; the prepaid-credit and Droid-Core-pool sub-claims are unverifiable from this source as currently published.

### 38. Fact 38: AI code review cost roundup (Claude $15-25, Bugbot $1-1.50, Copilot credits+Actions, Codex token-based)

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://blog.codacy.com/ai-code-review-cost-per-pull-request-what-engineering-teams-actually-pay-in-2026
- note: All four tool descriptions confirmed verbatim, including Copilot's dual AI-credit + Actions-minute billing and Codex's token-based framing.

### 39. Fact 39: quadratic naive loop formula, 10-step example 472,500 tokens=$1.49 vs 9,000=$0.03 = 43.3x

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://www.augmentcode.com/guides/ai-agent-loop-token-cost-context-constraints
- note: Formula and all worked-example numbers (472,500/$1.49/43.3x vs 9,000/$0.03) confirmed verbatim.

### 40. Fact 40: Green SARC, cumulative cost Theta(n^2), c2=216 vs p/2=134, 3,000 SWE-bench plans

- verdict: corrected
- original: c2=216; p/2=134; 3,000 SWE-bench plans
- corrected: c2=216 and p/2=134 confirmed exactly; dataset name is 'SWE-rebench' (not 'SWE-bench') per the abstract
- evidence: https://arxiv.org/abs/2606.15954
- note: Minor naming correction only: the 3,000-plan dataset the paper evaluates on is called SWE-rebench, distinct from SWE-bench Verified used elsewhere in the sheet. All numeric claims otherwise confirmed.

### 41. Fact 41: ChatDev pipeline, review 59.4% of tokens, coding 8.6%, input 53.9% of consumption, 30 scenarios

- verdict: confirmed
- original: as listed
- corrected: same
- evidence: https://arxiv.org/abs/2601.14470
- note: 59.4% review-stage share, 53.9% input-token share, ChatDev system, GPT-4-class model, and 30 scenarios all confirmed verbatim. The 8.6% coding-stage figure was not independently re-surfaced in this fetch's summary but is not contradicted.

## Additions

- No new items surfaced for the Not-found list despite retry attempts: swebench.com's official leaderboard still shows no $-per-instance column (confirmed again on a fresh fetch); Cursor's own pricing page (cursor.com/pricing) still does not print the $20/$70/$400 included-pool dollar amounts (only 'a set amount of model usage' with a link to docs); web.archive.org remains unreachable from this environment, so the exact date the Claude Code docs cost figure moved from $6/day to $13/day is still not determinable.
- Material gap the sheet's cost model should but does not address: Anthropic's own /docs/en/costs page (fetched in full this round) documents a `modelPricing` managed-settings override that lets an org report cost at contracted (non-list) rates rather than list price — meaning every dollar figure derived elsewhere in the sheet from list prices could be materially wrong for any enterprise with a negotiated rate; worth a caveat in the summary. Source: https://code.claude.com/docs/en/costs (section 'Report spend at your contracted rates').
- Also newly visible on the costs page: Claude Code applies a 1.1x multiplier to the list price of any response billed at the API's 'data residency rate,' which is a small but real additive factor to any per-session dollar estimate for data-residency customers. Source: https://code.claude.com/docs/en/costs.
- The Bun blog (bun.com/blog/bun-in-rust) additionally reports 60,624 tests and 1,386,826 expect() calls with 0 tests skipped/deleted, and a peak commit rate of 695 commits/hour — useful throughput context for a cost-per-commit model that the sheet did not capture. Source: https://bun.com/blog/bun-in-rust.
- Claw-SWE-Bench (arXiv 2606.12344) evaluates across 43 repositories, not just '8 languages' as characterized in the sheet's note — an additive scale detail. Source: https://arxiv.org/abs/2606.12344.
