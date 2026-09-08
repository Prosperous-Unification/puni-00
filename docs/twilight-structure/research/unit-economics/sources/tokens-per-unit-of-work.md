# Tokens and dollars per unit of real software work in an agentic coding harness (as of 2026-09-08): Claude Code economics, SWE-bench $/issue, product per-task pricing, community measurements, structural multipliers, and a derived per-PR token/cost distribution

## Summary

Anthropic's current Claude Code docs put enterprise spend at ~$13 per developer per active day, $150-250/month, with 90% of users under $30/day; that is 2.2x the "$6/day, 90% under $12" figure the same page carried until at least March 2026, so the per-developer anchor has roughly doubled in a year (more Opus, more agent teams, more autonomy). The unit-economics shape is stable across every primary source: an agentic coding task is ~1000x the tokens of a chat turn, 90-95% of processed input tokens are cache reads (Anthropic's own session example, Bun's 72B cached vs 5.9B uncached, a heavy user's 10B-token log), output is 1-2% of tokens but 20-40% of dollars, and run-to-run variance on the same task reaches 30x. The cleanest benchmark anchor is Anthropic's Opus 5 run: ~$1.39 per SWE-bench Verified issue at default effort (~91.7%), ~$0.70 with a low-effort-then-rerun-failures policy (~93%); older scaffolds without caching discipline (SWE-agent on HAL, 2025) cost $9-27 per issue for lower accuracy. The only end-to-end measurement of a real feature to merge (one OAuth device-flow feature, 12 models x 3 harnesses, July 2026) lands at $2.81-$33.38 per merged feature with 1-5 review cycles, i.e. 2-24x a benchmark issue, and the LLM review gate is $1-9 of that (up to 97% when the coder is cheap); Anthropic's managed Code Review is $15-25 per PR. Bun's fleet port gives the best large-scale ratio: $165k / 6,502 commits = $25.4 per commit at ~12M processed input tokens and ~106k output tokens per commit. Structural multipliers with sources: naive context resend is Theta(n^2) in turns (a 10-step loop is 43x a single pass); caching at 80-90% hit rate cuts input cost 3.6-5.3x (Anthropic reports 2.5-3.7x realized); agents are ~4x chat, multi-agent ~15x, Claude Code agent teams ~7x a normal session; review-and-refinement consumes ~59% of tokens in a multi-agent SE pipeline while coding is ~9%; trajectory pruning recovers 21-36% of cost. Benchmark issues are small (90% of SWE-bench Verified is under an hour of human time, 5-50 LOC, ~1.9 functions) versus SWE-bench Pro's 107 lines across 4.1 files and real features that need spec, tests, docs and review. The derived distribution (processed input tokens incl. cache reads / output tokens): bug-fix p50 1.5M/25k, p90 5M/80k; feature p50 10M/150k, p90 40M/500k; epic p50 80M/1.2M, p90 400M/5M. At Opus 5 with 80% cache hits that is roughly $2.7 / $9 (bug fix), $18 / $69 (feature), $140 / $690 (epic); Sonnet 5 is 2.5x cheaper and a DeepSeek-class open-weight price is ~17x cheaper than Opus; without caching multiply input cost by 3.6x. Treat all p50/p90 figures as derived from the anchors listed, not measured.

## Facts

### 1. Anthropic's current Claude Code cost guidance: average cost per developer per active day across enterprise deployments

- value: ~$13 per developer per active day; $150-250 per developer per month; below $30 per active day for 90% of users
- confidence: quoted
- source: https://code.claude.com/docs/en/costs (fetched 2026-09-08 (page references Claude Code v2.1.260))
- note: Exact text: 'Across enterprise deployments, the average cost is around $13 per developer per active day and $150-250 per developer per month, with costs remaining below $30 per active day for 90% of users.'

### 2. Anthropic's earlier (2025 to at least March 2026) Claude Code cost guidance

- value: $6 per developer per day average; 90% of users below $12/day; $100-200/dev/month with Sonnet 4
- confidence: quoted
- source: https://tokencost.app/blog/claude-code-cost-per-session (2026-03-28 (quoting Anthropic docs retrieved that day); also still quoted by https://www.faros.ai/blog/claude-code-token-limits in Aug 2026)
- note: Secondary sources quoting the then-current docs.anthropic.com/en/docs/claude-code/costs page; the page has since been rewritten to the $13/$30 figures. web.archive.org was not reachable from this environment to date the change exactly. Ratio new/old average = 13/6 = 2.2x.

### 3. Worked Claude Code session cost example in Anthropic docs (token mix of a real session block)

- value: claude-sonnet-4-6: 1.2k input, 5.3k output, 940.0k cache read, 50.0k cache write = $0.55; API duration 6m20s
- confidence: quoted
- source: https://code.claude.com/docs/en/costs (fetched 2026-09-08)
- note: Derived shares: cache reads = 940/(1.2+940+50) = 94.8% of input tokens; output = 0.53% of all tokens. Output tokens ($0.08 at $15/M... at Sonnet 4.6 list $3/$15: 5.3k out = $0.08, 940k cache read at $0.30/M = $0.28, 50k cache write at $3.75/M = $0.19) reproduces ~$0.55.

### 4. Claude Code /usage prompt-cache line example (what a normal main-conversation hit rate looks like)

- value: '14 requests · 91% of input tokens from cache · 2 misses'; a miss is counted when >5% and >=2,000 tokens were re-processed
- confidence: quoted
- source: https://code.claude.com/docs/en/costs (fetched 2026-09-08 (feature requires v2.1.251+))
- note: Anthropic does not publish a fleet-wide hit rate; the 2026-04-30 engineering post only says they alert and declare SEVs on low hit rate.

### 5. Claude Code agent teams token multiplier

- value: ~7x more tokens than standard sessions when teammates run in plan mode; token usage roughly proportional to team size
- confidence: quoted
- source: https://code.claude.com/docs/en/costs (fetched 2026-09-08)
- note: 'Agent teams use approximately 7x more tokens than standard sessions when teammates run in plan mode, because each teammate maintains its own context window.'

### 6. Claude Code background token usage per session

- value: typically under $0.04 per session
- confidence: quoted
- source: https://code.claude.com/docs/en/costs (fetched 2026-09-08)
- note: Summarization for --resume and command status checks.

### 7. Claude Code prompt-cache pricing and TTL mechanics

- value: cache reads billed at ~10% of standard input rate; 1-hour TTL on subscription within plan, 5-minute TTL on API key / usage credits / cloud providers; subagents get 5-minute TTL by default
- confidence: quoted
- source: https://code.claude.com/docs/en/prompt-caching (fetched 2026-09-08 (references v2.1.260))
- note: Model switch, effort change (except Fable 5.1), MCP tool-set change, compaction, and Claude Code upgrade each force a full uncached re-read of the conversation.

### 8. Anthropic Code Review (managed PR review) cost per review

- value: $15-25 per review average; ~20 minutes per review; multiplied by number of pushes in after-every-push mode
- confidence: quoted
- source: https://code.claude.com/docs/en/code-review (fetched 2026-09-08)
- note: 'Each review averages $15-25 in cost, scaling with PR size, codebase complexity, and how many issues require verification.' Billed via usage credits, Team/Enterprise only.

### 9. Anthropic Opus 5 SWE-bench Verified cost per task at default effort

- value: ~91.7% pass at ~$1.39 per benchmark task (default effort); ~93% at ~$0.70 with run-everything-at-low-then-rerun-failures; low effort alone gives up ~8 points for a quarter of the cost
- confidence: quoted
- source: https://www.anthropic.com/news/claude-opus-5 (2026-07-24 (figures supplied in task context, cached 2026-06-24))
- note: Figures come from the caller-provided context; the announcement page fetched today surfaced only relative cost-per-task claims (e.g. 'within 0.5% of Fable 5's peak score at half the cost per task' on CursorBench 3.2), not the $1.39/$0.70 numbers, so treat the exact dollars as quoted-from-caller and not re-verified here.

### 10. Anthropic-reported prompt-caching savings in agent loops

- value: 2.5x-3.7x cost reduction at 81-90% cache hit rates
- confidence: quoted
- source: https://www.anthropic.com/news/claude-opus-5 (2026-07-24 (caller-provided context))
- note: Caller-provided; consistent with arithmetic: at 0.1x cache-read price, effective input multiplier = (1-h)+0.1h = 0.28 at h=0.8 (3.6x) and 0.19 at h=0.9 (5.3x) before cache-write premiums; realized 2.5-3.7x implies writes and misses eat part of it.

### 11. Anthropic first-party list prices used for the cost model

- value: Fable 5.1 $10/$50 (cache read $0.25); Opus 5 $5/$25; Sonnet 5 $2/$10; Haiku 4.5 $1/$5 per MTok in/out; cache read 0.1x input on non-Fable, cache write 1.25x (5-min) or 2x (1-hour); Batch 50% off
- confidence: quoted
- source: https://www.anthropic.com/news/claude-opus-5 (2026-07-24 (Opus 5 $5/$25 confirmed on page); rest from caller context cached 2026-06-24)
- note: Opus 5 '$5 per million input tokens and $25 per million output tokens' quoted from the announcement; the other rows are caller-provided.

### 12. Anthropic multi-agent research system token multipliers

- value: agents ~4x chat tokens; multi-agent systems ~15x chat tokens; token usage explains ~80% of performance variance
- confidence: quoted
- source: https://www.anthropic.com/engineering/built-multi-agent-research-system (2025-06-13)
- note: 'agents typically use about 4x more tokens than chat interactions' and 'multi-agent systems use about 15x more tokens than chats'. Research-agent context, not coding, but the only first-party multi-agent multiplier.

### 13. Anthropic context-editing token reduction over a long agent run

- value: 84% token reduction in a 100-turn web-search evaluation; memory tool + context editing +39% performance vs baseline; context editing alone +29%
- confidence: quoted
- source: https://claude.com/blog/context-management (2025-09-29)
- note: Shows how much of a long-run token bill is stale tool results that compaction/editing can drop.

### 14. HAL SWE-bench Verified Mini (50 tasks) cost per run and derived cost per task, SWE-agent scaffold

- value: SWE-agent + Claude Sonnet 4.5 High: 72% at $463.90/run = $9.28/task; Sonnet 4.5: 68% at $505.92 = $10.12/task; Opus 4.1: 61% at $1,351.35 = $27.03/task; o4-mini low: 54% at $259.20 = $5.18/task; HAL Generalist + Haiku 4.5 High: 44% at $65.31 = $1.31/task; Gemini 2.0 Flash: 24% at $4.72 = $0.09/task
- confidence: derived
- source: https://hal.cs.princeton.edu/swebench_verified_mini (runs Feb-Oct 2025, fetched 2026-09-08)
- note: Page states cost is 'Total API cost for running the agent on all tasks' on '50 Verified Tasks'; per-task = total/50. 2025 model prices ($3/$15 Sonnet 4.5, $15/$75 Opus 4.1) and a scaffold without Claude-Code-style caching discipline; compare Anthropic's $1.39/task on Opus 5 in 2026.

### 15. Aider polyglot benchmark cost per run (225 exercises) and derived cost per exercise

- value: gpt-5 (high) 88.0% at $29.08/run = $0.129/exercise; gpt-5 (medium) 86.7% $17.69 = $0.079; gpt-5 (low) 81.3% $10.37 = $0.046; o3-pro (high) 84.9% $146.32 = $0.65; DeepSeek-V3.2-Exp 74.2% $1.30 = $0.0058; claude-opus-4 (32k thinking) 72.0% $65.75 = $0.29
- confidence: derived
- source: https://aider.chat/docs/leaderboards/ (entries dated 2025-04 to 2025-10, fetched 2026-09-08)
- note: Per-exercise = run cost / 225. Exercism exercises are far smaller than SWE-bench issues; useful for effort-level economics: gpt-5 high vs low = 2.8x cost for +6.7 points.

### 16. Epoch AI SWE-bench Verified evaluation token budget per task

- value: 2M uncached tokens per task limit, 20M cached-read allowance; 484 validated samples
- confidence: quoted
- source: https://epoch.ai/benchmarks/swe-bench-verified (infrastructure v2.0.x, Feb 2026; fetched 2026-09-08)
- note: Indicates the ceiling a serious evaluator budgets per issue: ~10:1 cached-to-uncached.

### 17. Agentic coding token multiplier vs chat, and run-to-run variance (8 frontier models on SWE-bench Verified)

- value: 1000x tokens of code reasoning/code chat; 3500x a single-round reasoning task; 1200x a multi-turn chat; same task can differ up to 30x in tokens across runs; Kimi-K2 and Claude Sonnet 4.5 consume >1.5M more tokens per task on average than GPT-5; self-prediction of token cost correlation <=0.39
- confidence: quoted
- source: https://arxiv.org/abs/2604.22750 (2026-04-24 (v1), 2026-04-29 (v2))
- note: Stanford Digital Economy Lab + Microsoft Research. Input tokens drive cost; accuracy 'peaks at intermediate cost and saturates'; failures consume more tokens than successes (Kimi-K2 ~2M more on failure subsets). Per-model absolute token tables not extractable from the HTML/abstract.

### 18. Harness vs model contribution to coding-agent outcome and cost

- value: harness choice moves Pass@1 by 27.4 pp; model choice by 29.4 pp; minimal vs full adapter on same GLM 5.1: 19.1% vs 73.4%
- confidence: quoted
- source: https://arxiv.org/abs/2606.12344 (2026-06)
- note: Claw-SWE-Bench (350 instances, 8 languages). States 'systems with similar accuracy can differ substantially in total API cost' without publishing the numbers.

### 19. SWE-bench Verified task size distribution (what a 'benchmark issue' is)

- value: 39% rated <15 min (avg 5 changed LOC); 52% 15 min-1 h (avg 14 LOC); 8% 1-4 h (avg 50 LOC); 3 issues >4 h; ~1.87 functions changed on average; 78% touch only functions; ~90% completable by an experienced engineer in under an hour
- confidence: quoted
- source: https://epoch.ai/publications/what-skills-does-swe-bench-verified-evaluate (fetched 2026-09-08 (publication date not shown))
- note: Half of the issues are from 2020 or earlier.

### 20. SWE-bench Pro task size (closer to a real feature)

- value: averages 107.4 lines of code across 4.1 files per task; 'hours to days for a professional software engineer'; 1,865 problems / 41 repos; launch scores GPT-5 23.3%, Claude Opus 4.1 23.1% (public set)
- confidence: quoted
- source: https://scale.com/blog/swe-bench-pro (2025-09 (paper v1 2025-09-21, v2 2025-11-14))
- note: Pro tasks are ~7-20x the LOC of a Verified task; the Scale leaderboard pages returned 403 so no current cost column could be read.

### 21. Measured cost to merge one real feature across models and harnesses (RFC 8628 OAuth device-authorization flow on a frozen Nuxt 4 + Drizzle repo, with security requirements and an Opus review gate)

- value: $2.81 to $33.38 per merged feature; 26 min to ~3 h; 1-5 external review cycles
- confidence: quoted
- source: https://blog.insight-services-apac.dev/2026/07/06/cost-to-a-merged-feature (2026-07-06)
- note: Cost computed 'harness-agnostically from tokens x published rates (cache-aware: input, cached-read and output priced separately)'. Split into coding $ (implementer incl. internal review and fixes) and gate $ (external Opus review cycles).

### 22. Per-run detail from the same merged-feature study (coding $ / gate $ / total $ / minutes)

- value: Opus 4.8 + Claude Code reflect: 9.01/0.96/9.98/26m (1 cycle); Opus 4.8 CC off: 9.46/1.38/10.83/28m; Opus 4.8 CC skill: 20.31/3.01/23.32/51m (2 cycles); Sonnet 5 CC skill: 19.05/3.99/23.04/72m and 18.71/4.58/23.29/71m; Sonnet 4.6 CC reflect: 7.02/4.78/11.80/43m; Fable 5 CC skill: 32.08/1.30/33.38/48m; Fable 5 Copilot: 18.90/1.64/20.54/38m; GPT-5.5 Copilot: 7.98/1.47/9.46/83m and 4.94/2.70/7.64/58m; GPT-5.4-mini Copilot: 1.34/1.87/3.21 and 1.11/1.48/2.59; MAI-Code-1-Flash: 0.05/2.76/2.81 and 0.08/5.65/5.73 (gate = 97% of cost); MiniMax-M3 via Claude Code router: 10.27/4.50/14.77 (3 cycles); Kimi-K2.7: 18.08/3.65/21.73 (3 cycles); Qwen3-Coder-Next: 8.22/4.46/12.69; GLM-5.2: 13.34/1.61/14.95/176m; GPT-5.6 Sol: 30.84/3.98/34.82/123m
- confidence: quoted
- source: https://blog.insight-services-apac.dev/2026/07/06/cost-to-a-merged-feature (2026-07-06)
- note: Same model across harnesses varied 2.5x. 'Merged is not the same as correct': gate-approved implementations passed 12-38 of 38 deterministic tests (Opus 30/38, GPT-5.5 18/38, Sonnet 16/38 on the second challenge).

### 23. Bun Zig-to-Rust port: fleet-scale tokens and dollars per commit

- value: 535,496 LOC Zig ported; 1,009,272 lines added; 6,502 commits in 11 days (May 3-14); 64 Claude Fable 5 (pre-release) agents at peak; ~$165,000 at API pricing; 5.9B uncached input, 690M output, 72B cached input reads
- confidence: quoted
- source: https://bun.com/blog/bun-in-rust (2026-07-08)
- note: Zig's creator publicly called parts 'unreviewed slop' (The Register 2026-07-14); 128 bugs fixed and 19 regressions in v1.4.0, so 'commit' is not 'accepted PR'.

### 24. Derived per-commit and per-line unit economics from the Bun port

- value: $25.4 per commit; ~907k uncached input + ~11.1M cached-read input + ~106k output tokens per commit (~12M processed input tokens per commit); $163 per 1,000 lines added; cached:uncached input = 12.2:1; cached reads:output = 104:1; 92.4% of input tokens served from cache
- confidence: derived
- source: https://bun.com/blog/bun-in-rust (2026-07-08)
- note: 165,000/6,502 = 25.38; 5.9B/6,502 = 907k; 72B/6,502 = 11.07M; 690M/6,502 = 106k; 165,000/1,009.272k lines = $163.5/kLOC; 72/(72+5.9) = 92.4%. Cost check: 5.9B x $10 + 690M x $50 + 72B x $1.00 = $59k + $34.5k + $72k = $165.5k, i.e. consistent with $10/$50 and a $1.00/M (0.1x) cache-read price for pre-release Fable 5; at Fable 5.1's $0.25 cache read it would be $111.5k.

### 25. Heavy individual Claude Code user, measured with ccusage-style logs

- value: ~10 billion tokens over Jun 2025-Feb 2026; >$15,000 API-equivalent vs ~$800 paid on Max; peak month 2.4B tokens = $5,623 API-equivalent; >90% of tokens are cache reads
- confidence: quoted
- source: https://www.ksred.com/claude-code-pricing-guide-which-plan-actually-saves-you-money/ (2026-02-23)
- note: Derived: ~1.1B tokens/month average; peak month blended $2.34 per 1M tokens (5,623/2,400) which is what a >90%-cached Opus/Sonnet mix costs. Author's own ~110M tokens/day figure assumes ~90 active days.

### 26. Single interactive Claude Code session token footprint (community report)

- value: ~2.25M tokens for one session building ~1,000 lines of code with 4 deploys and 15 messages; ~40,000 tokens of per-request overhead (57 plugins, 9 MCP servers, project rules); consumed ~42% of a Max 5x 5-hour window
- confidence: quoted
- source: https://github.com/anthropics/claude-code/issues/41506 (2026-03 (issue reports change since ~2026-03-28))
- note: Opus 4.6 1M-context, effortLevel high, thinking on. Reporter alleged a 3-5x jump in consumption without config change; no Anthropic response captured.

### 27. Uber enterprise rollout of Claude Code: per-engineer spend

- value: $500 to $2,000 per engineer per month; ~5,000 engineers; annual 2026 AI budget exhausted by April (4 months); 70% of committed code AI-originated; adoption 32% (Feb) to 84% (Mar)
- confidence: quoted
- source: https://www.briefs.co/news/uber-torches-entire-2026-ai-budget-on-claude-code-in-four-months/ (2026-04-17 (Forbes 2026-05-17 coverage returned 403))
- note: Secondary news coverage; Forbes and Moneywise versions (which add a '$1,200 two-hour session' anecdote) could not be fetched. Note Uber's COO said it is hard to justify token cost without evidence of more shipped features.

### 28. Devin pricing and ACU definition

- value: Core $20/month includes 9 ACUs, then $2.25 per ACU; previous Team plan $500/month at $2.00 per ACU; 1 ACU = ~15 minutes of active work (=> $9/hour Core, $8/hour Team)
- confidence: quoted
- source: https://siliconangle.com/2025/04/03/cognition-ai-launches-revamped-coding-assistant-devin-2-0-much-lower-starting-price/ (2025-04-03 (Cognition's own Devin 2.0 post of the same date says only 'starting at $20'))
- note: devin.ai/pricing returned 429. Devin docs (docs.devin.ai/admin/billing/usage) add: idle session ~0.1 ACU before sleep, Windows sessions +9% vs Linux, consumption is non-linear in iteration loops.

### 29. Devin ACUs per task, measured/observed

- value: typical bug fix 2-3 ACU = $4.50-$6.75; multi-file refactor 30+ ACU = $67.50+; third-party guides: 'write, test, and PR a feature' 10-40 ACUs (= $22.50-$90 at $2.25), dependency bump ~0.3 ACU, tangled multi-file refactor ~5 ACU
- confidence: quoted
- source: https://techsy.io/en/blog/background-coding-agents-compared (2026-05-12)
- note: Techsy says these are amounts 'we actually paid' on internal tooling work. The 10-40 ACU feature range is from third-party guides (fast.io, usagebar) surfaced in search, not from Cognition.

### 30. Measured per-task cost of background coding agents on real internal work (one team's bill)

- value: Codex Cloud $0.20-1 per typical fix, $2-10 multi-file; Claude Code Remote $0.50-2 per bug fix, $5-20 per refactor; Cursor Background Agents $0.30-1.50 per bug fix, $3-15 per refactor; Copilot coding agent ~$0.12/task (~$0.04 per premium request); Jules $0 marginal within 15/day free tier
- confidence: quoted
- source: https://techsy.io/en/blog/background-coding-agents-compared (2026-05-12)
- note: Secondary, single team, mixed subscription and pay-per-use accounting; ranges not distributions.

### 31. Cursor plan included usage (third-party 'Other Models' pool at API rates)

- value: Pro $20 -> $20 pool; Pro+ $60 -> $70 pool; Ultra $200 -> $400 pool; overage billed in arrears at the same listed API rates; Teams $40/user plus $0.25 per million token 'Cursor Token Rate' on eligible third-party requests; Bugbot $1-1.50 per run
- confidence: quoted
- source: https://omidsaffari.com/blog/cursor-pricing (2026-08-02 (verified against Cursor docs that day); Bugbot from https://blog.codacy.com/ai-code-review-cost-per-pull-request-what-engineering-teams-actually-pay-in-2026 (2026-08-28))
- note: Cursor's own pricing and docs pages fetched 2026-09-08 state plans and 'same API rates' for overage but do not print the pool dollar amounts; the $20/$70/$400 are from a dated secondary that cites Cursor docs. Ultra therefore implies $400 of API-rate work for $200.

### 32. OpenAI Codex plan limits and credit rate card

- value: Plus $20: 5-45 messages/5h on GPT-6 Astra, 10-100 on GPT-5.6 Sol, 25-200 on Terra, 250-2,000 on Luna; Pro from $100 with 5x limits; credits per 1M tokens (input/cached/output): Astra 250/25/1,250; Sol 100/10/500; Terra 50/5/300; Luna 5/0.5/30; 'GPT-5.6 usage averages 5-30 credits per message'
- confidence: quoted
- source: https://learn.chatgpt.com/docs/pricing (fetched 2026-09-08 (redirect target of developers.openai.com/codex/pricing))
- note: Dollar price per credit was not on the page and the help-center rate card returned 403, so credits cannot be converted to dollars from a primary here. Secondary guides put a typical GPT-5.5 Codex task at 5-45 credits (small-file fix 5, cross-service refactor 45).

### 33. Google Jules plan limits

- value: Free: 15 tasks/day, 3 concurrent (Gemini 2.5 Pro); Pro: 100 tasks/day, 15 concurrent; Ultra: 300 tasks/day, 60 concurrent (Gemini 3 Pro); no per-task price or token rate published
- confidence: quoted
- source: https://jules.google/docs/usage-limits/ (fetched 2026-09-08)
- note: USD prices not obtained (Google plan pages served localized UAH prices: Pro 909.99 UAH, Ultra from 4,599 UAH); secondaries quote Pro $19.99 and Ultra $124.99. Effective ceiling at full Pro use = $19.99/3,000 tasks = $0.007/task, which says nothing about tokens.

### 34. Augment Code pricing model

- value: Standard $20/mo = $20 of usage; Business $100/mo = $100 of usage; LLM tokens billed at provider public list price plus a flat 40% service fee (no fee on compute); up to 50 seats pooled
- confidence: quoted
- source: https://www.augmentcode.com/pricing (fetched 2026-09-08)
- note: A 40% markup over API list is the explicit vendor-margin figure for the cost model.

### 35. Augment credit consumption on four small tasks (older credit model)

- value: validation middleware 519 credits = $0.26; repository-pattern refactor 1,218 = $0.61; priority/due-date feature 1,248 = $0.62; Jest tests + docs 1,337 = $0.67; total $2.16 for 4 tasks at $0.0005/credit
- confidence: quoted
- source: https://dev.to/kilocode/testing-augment-codes-new-credit-system-with-4-real-tasks-1mi7 (2025-11-12)
- note: Toy Express/TypeScript repo; 2025 credit scheme since replaced; shows the floor for trivial tasks (~$0.25-0.70).

### 36. Sourcegraph Amp pricing

- value: Megawatt $20/mo with $20 included agent usage; Gigawatt $200/mo with $200 included; 'Unconstrained' pay-as-you-go at API pricing for tokens and orbs (sandboxes)
- confidence: quoted
- source: https://ampcode.com/pricing (fetched 2026-09-08)
- note: No per-thread cost published on pricing or news pages.

### 37. Factory (Droid) pricing

- value: Pro $20/mo; Plus $100/mo (~5x Pro usage); Max $200/mo (~10x Pro usage); Teams $60 + $40/seat; prepaid credits from $10; open-weight 'Droid Core' pool consumed after standard usage
- confidence: quoted
- source: https://factory.ai/pricing (fetched 2026-09-08)
- note: Per-million-token overage ($2.70/M standard, cached 90% off per a secondary) not found on Factory's own pages.

### 38. AI code review cost per PR by tool (secondary roundup)

- value: Claude Code Review $15-25/review; Cursor Bugbot ~$1-1.50/run; Copilot code review consumes AI credits plus Actions minutes; Codex review token-based (no figure)
- confidence: quoted
- source: https://blog.codacy.com/ai-code-review-cost-per-pull-request-what-engineering-teams-actually-pay-in-2026 (2026-08-28)
- note: Claude figure matches Anthropic's own docs.

### 39. Quadratic token growth of naive agent loops (formula and worked example)

- value: Total_naive = N*S + u*N(N+1)/2 + r*N(N-1)/2; 10-step file-reading agent: 472,500 input tokens ($1.49 at Sonnet 4.6) vs 9,000 single-pass ($0.03) = 43.3x cost; caching only reduces the N*S term
- confidence: quoted
- source: https://www.augmentcode.com/guides/ai-agent-loop-token-cost-context-constraints (2026-04-06 (updated 2026-06-18))
- note: Vendor guide, but the arithmetic is standard; note that in practice prefix caching also covers the growing history (Claude Code caches the whole prefix), so the quadratic term is paid mostly at cache-read price.

### 40. Empirical curvature of cumulative token cost in SWE-bench agent runs

- value: unconstrained cumulative cost is Theta(n^2) in loop depth; observed curvature coefficient c2 = 216 vs linear-accretion prediction p/2 = 134 on 3,000 SWE-bench plans
- confidence: quoted
- source: https://arxiv.org/abs/2606.15954 (2026-06-14)
- note: Green SARC paper; real plans accumulate context ~1.6x faster than a constant-per-step model.

### 41. Share of tokens spent on review-and-refinement vs coding in a multi-agent SE pipeline

- value: iterative code-review stage 59.4% of tokens; coding 8.6%; input tokens 53.9% of consumption
- confidence: quoted
- source: https://arxiv.org/abs/2601.14470 (2026-01-20)
- note: ChatDev with a GPT-4-class reasoning model on 30 scenarios; small toy projects, but the direction (refinement dominates) matches the merged-feature study where the gate reached 97% for cheap coders.

### 42. Trajectory pruning savings (retry/expired-context waste)

- value: AgentDiet cuts input tokens 39.9%-59.7% and total cost 21.1%-35.9% while preserving performance
- confidence: quoted
- source: https://arxiv.org/abs/2509.23586 (2025-09-28 (v2 2026-03-15, FSE 2026))
- note: Upper bound on how much of a naive harness's input bill is dead weight.

### 43. Modeled token profile of a 50-turn agentic coding session (Vantage)

- value: ~1M input tokens, ~40k output, 25:1; exploration turns 1-10 ~5k in/600 out per turn, implementation 11-30 ~20k/1k, test-iterate 31-50 ~35k/800; ~$6.00 per session on Opus 4.6
- confidence: estimated
- source: https://www.vantage.sh/blog/agentic-coding-costs (2026-04-15)
- note: Illustrative model, not telemetry; useful only for the turn-phase shape.

### 44. Modeled Claude Code cost by task size (TokenCost)

- value: bug fix 20-30 min ~18k in/3k out ~$0.10 ($0.07 cached); feature 1-2 h ~120k/20k ~$0.66 ($0.45); half-day refactor ~500k/80k ~$2.70 ($1.20); 2h+ agent-team run ~1.5M/200k ~$7.50 ($3.00)
- confidence: estimated
- source: https://tokencost.app/blog/claude-code-cost-per-session (2026-03-28)
- note: Token counts look like unique tokens, not processed-per-request totals, so these understate real bills by roughly the turn-count multiplier; included as the optimistic floor.

### 45. Real-world vs benchmark per-task multiplier and per-request overhead (secondary estimate)

- value: real-world per-task cost 3-5x benchmark; system prompt + repo context 1,500-8,000 tokens per session; code generation 5-15% of tokens; ~120k+ tokens accumulated by turn 10 of a debugging session
- confidence: estimated
- source: https://www.kunalganglani.com/blog/ai-agent-cost-per-task-2026 (2026-07-14 (updated 2026-08-14))
- note: Author's judgement; the measured merged-feature study implies 2-24x vs SWE-bench, so 3-5x is the low end.

### 46. API-equivalent monthly spend bands for Claude Code users (secondary)

- value: 'daily developer' ~$80-200/month; 'heavy + agentic' ~$250-700+/month API-equivalent
- confidence: estimated
- source: https://www.cloudzero.com/blog/claude-code-pricing/ (2026-05-18 (updated 2026-09-04))
- note: Vendor blog estimate; bracketed by Anthropic's $150-250 average and Uber's $500-2,000.

### 47. Derived cache-hit cost multiplier on input tokens

- value: effective input price factor = (1-h) + 0.1h: h=0 -> 1.00; h=0.8 -> 0.28 (3.6x cheaper); h=0.9 -> 0.19 (5.3x); h=0.95 -> 0.145 (6.9x); add ~+0.25x on the uncached share for 5-min cache writes
- confidence: derived
- source: https://code.claude.com/docs/en/prompt-caching (fetched 2026-09-08)
- note: Uses the 0.1x cache-read ratio stated in Claude Code docs (0.025x on Fable 5.1). Observed hit rates: 94.8% (Anthropic example), 92.4% (Bun), >90% (ksred), 91% (docs /usage example).

### 48. Derived: cost of a real merged feature vs a benchmark issue

- value: $2.81-$33.38 per merged feature (measured) vs ~$1.39 per SWE-bench Verified issue (Opus 5) = 2x to 24x; median of the Claude-family runs (~$12-23) = ~9-17x
- confidence: derived
- source: https://blog.insight-services-apac.dev/2026/07/06/cost-to-a-merged-feature (2026-07-06 vs 2026-07-24)
- note: Different models and dates; the point is the order of magnitude: a spec'd, tested, reviewed feature is ~10x a benchmark issue.

### 49. Derived token distribution per accepted PR, class (a) small bug-fix (1-3 files, tests exist or one test added, gate passes)

- value: p50: 1.5M processed input tokens (incl. cache reads) / 25k output; p90: 5M / 80k. Benchmark-issue sub-case p50: ~0.8M / 15k
- confidence: derived
- source: https://arxiv.org/abs/2604.22750 (2026-04 (anchor); other anchors 2026-03 to 2026-07)
- note: Anchors: Anthropic $1.39/issue at Opus 5 reproduces with ~0.8M processed input at 80-90% cache + 15k output ($1.12-1.50); Vantage 50-turn model 1M/40k; GitHub #41506 2.25M for a 1,000-LOC session; arXiv 30x run variance sets p90 at ~3.3x p50. 'Processed input' = sum of input tokens over all API calls; ~90% are cache reads in a Claude-Code-class harness.

### 50. Derived token distribution per accepted PR, class (b) feature (spec, several files, tests written, docs, one LLM review pass, 1-2 fix cycles)

- value: p50: 10M processed input / 150k output; p90: 40M / 500k; plus review gate $1-9 (self-hosted Opus gate) or $15-25 (Anthropic Code Review)
- confidence: derived
- source: https://bun.com/blog/bun-in-rust (2026-07-08 (anchor); merged-feature study 2026-07-06)
- note: Anchors: Bun per commit ~12M processed input / 106k output / $25.4; merged-feature study: Opus 4.8 coding $9-20 implies ~5-13M processed input at $5 in, 80% cache, 100k out; Sonnet 5 coding $19 implies ~30M at $2 in (sits near p75-p90); Fable 5 $32 implies ~9M at $10 in. p90 = 4x p50 reflects 3-5 review cycles observed.

### 51. Derived token distribution per epic (multi-day, 3-10 feature-class PRs, planning + integration + multi-agent review)

- value: p50: 80M processed input / 1.2M output; p90: 400M / 5M
- confidence: derived
- source: https://www.ksred.com/claude-code-pricing-guide-which-plan-actually-saves-you-money/ (2026-02-23 (anchor); Anthropic docs 2026-09; Uber 2026-04)
- note: p50 = 5 features x 10M x 1.3 integration/rework + 15M planning/review; p90 = a heavy user's measured 2.4B tokens/month (~110M/day) over 3-5 days, i.e. an agent-team-style run. Cross-check: Anthropic $13/dev/day average and $30 p90 at ~90% cache correspond to ~10-25M processed tokens/day; an epic of 3-5 dev-days at p50 is 30-125M.

### 52. Derived dollars per PR at Opus 5 ($5/$25, cache read $0.50)

- value: bug-fix p50/p90: $2.73/$9.00 with 80% cache, $8.13/$27.00 uncached; feature p50/p90: $17.75/$68.50 cached, $53.75/$212.50 uncached; epic p50/p90: $142/$685 cached, $430/$2,125 uncached
- confidence: derived
- source: https://www.anthropic.com/news/claude-opus-5 (2026-07-24 prices; distribution derived 2026-09-08)
- note: Cost = T_in x $5 x f + O x $25, f = 0.28 at 80% hit, 1.0 uncached; e.g. feature p50 cached = 10M x 5 x 0.28 + 0.15M x 25 = 14.0 + 3.75 = $17.75. Review gate not included. At 90% hit (typical Claude Code) input cost falls a further 32%.

### 53. Derived dollars per PR at Sonnet 5 ($2/$10, cache read $0.20)

- value: bug-fix p50/p90: $1.09/$3.60 with 80% cache, $3.25/$10.80 uncached; feature p50/p90: $7.10/$27.40 cached, $21.50/$85.00 uncached; epic p50/p90: $56.80/$274 cached, $172/$850 uncached
- confidence: derived
- source: https://code.claude.com/docs/en/costs (prices from caller context 2026-06-24; derived 2026-09-08)
- note: Same token distribution as Opus; Sonnet 5 is 2.5x cheaper per token. The merged-feature study measured Sonnet 5 at $23/feature on Claude Code, which sits between this p50 and p90 (its runs had an internal review skill and 71-72 min of work).

### 54. Derived dollars per PR at a representative open-weight price (DeepSeek V3.2-class, ~$0.30 in / $1.20 out, cache read assumed 0.1x)

- value: bug-fix p50/p90: $0.16/$0.52 with 80% cache, $0.48/$1.60 uncached; feature p50/p90: $1.02/$3.96 cached, $3.18/$12.60 uncached; epic p50/p90: $8.16/$39.60 cached, $25.40/$126 uncached
- confidence: estimated
- source: https://www.codesota.com/tasks/swe-bench (2026-04 (price is from a secondary comparison page))
- note: Open-weight $/M is a secondary figure, not a vendor page; the merged-feature study found open-weight models on Claude Code via router (MiniMax-M3, Kimi-K2.7, Qwen3-Coder-Next) cost $11-22 per merged feature because they needed 2-3 review cycles and more tokens, so the per-token discount is partly eaten by lower success per attempt. Aider shows DeepSeek V3.2 at 4% of gpt-5's run cost for 84% of its score.

### 55. Derived: effort-level trade-off for the factory (cost vs pass rate)

- value: Opus 5 low effort: ~1/4 the cost for ~-8 points; low-then-rerun-failures: $0.70 vs $1.39 (-50%) for +1.3 points; Aider gpt-5 low vs high: 36% of the cost for -6.7 points
- confidence: derived
- source: https://www.anthropic.com/news/claude-opus-5 (2026-07-24 (caller context) and https://aider.chat/docs/leaderboards/ 2025-08)
- note: A two-tier policy (cheap first pass, expensive retry on failure) roughly halves per-task cost at equal or better pass rate on benchmark issues; expect a smaller gain on real features where failures are detected by review, not by a given test.

## Not found

- swebench.com official Verified/Pro leaderboard $-per-instance column values (page is dynamically rendered; the leaderboards.json path returned 404)
- OpenHands Index per-model average cost per task (index.openhands.dev content truncated; blog posts contain no dollar figures)
- Scale SWE-bench Pro leaderboard cost/token columns (labs.scale.com returned 403; morphllm mirror returned 429 three times)
- Per-model absolute tokens-per-task table from arXiv 2604.22750 (only the >1.5M-token delta vs GPT-5 and the 1000x/30x multipliers were extractable)
- Anthropic's published fleet-wide Claude Code cache hit rate (the 2026-04-30 post says they alert/SEV on it but gives no number; only per-session examples of 91% and 94.8% exist)
- Anthropic's published tokens-per-session or turns-per-session for Claude Code (Economic Index June 2026 uses geometric-mean token counts but reports no Claude Code figure)
- Exact date the Claude Code docs moved from $6/day to $13/day (web.archive.org not reachable from this environment)
- The $1.39 / $0.70 per-task and 2.5-3.7x caching figures on a fetched Anthropic page (present in caller context; the Opus 5 announcement fetched today shows only relative cost-per-task claims)
- Cognition's own ACUs-per-task guidance (docs.devin.ai gives drivers of consumption, idle 0.1 ACU, Windows +9%, but no per-task ACU examples; devin.ai/pricing returned 429)
- OpenAI dollar price per Codex credit and any OpenAI statement of cost per PR (learn.chatgpt.com lists credits per MTok and 5-30 credits per message but not $/credit; help-center rate card returned 403)
- Google statement of Jules cost per task or tokens per task; USD prices of Google AI Pro/Ultra from a Google page (served localized UAH prices)
- Sourcegraph Amp average cost per thread (pricing and news pages have no such statement; web search budget exhausted before a third angle)
- Factory's own per-million-token overage rate and cached-token discount (only on secondary sites)
- Any enterprise case study quoting dollars per merged PR from the company itself (Uber coverage gives $/engineer/month only)
- A measured retry/rework rate for real features beyond the single merged-feature study's 1-5 review cycles
- Cursor's own docs page printing the $20/$70/$400 included-pool amounts (confirmed only via a dated secondary that cites Cursor docs)
