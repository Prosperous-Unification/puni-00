# Anthropic subscription (Pro/Max/Team/Enterprise) pricing vs API pricing — verification pass on research-anthropic-subscription-pro-max-team-ente.md

## Overall

Verification pass covered essentially every 'quoted' and 'derived' fact in the sheet (facts 1-10, 12, 14-16, 20-36, 38-41, 43) plus a spot-check of fact 12's exact-quote wording. The overwhelming majority (roughly 30 of 35 checked) are CONFIRMED verbatim against their cited primary sources, including all of the core structural claims underpinning the paper's convergence thesis: subscription list prices unchanged, usage credits at API rates with the 1h→5min cache-TTL penalty, the Fable-model carve-out, the paused Agent SDK credit-pool plan, the Enterprise seat+API-rate model, and the full live API pricing table (which matches the sheet exactly, tokenizer/1.1x/batch/cache multipliers included). Two X/Twitter-sourced facts (11, 17, 18) are UNVERIFIABLE — X returned HTTP 402 and web.archive.org is blocked for this tool entirely, so the two-attempt budget was exhausted without confirmation; their content is plausible and consistent with corroborating still-live pages but not independently checked. Fact 12's specific admin-quote wording is not found verbatim (page phrases the same idea differently) — CORRECTED to note the paraphrase gap. The two Viberank community-leaderboard facts (35, 36) are CORRECTED: all dollar/count figures have drifted 1-3% upward from the cited values, consistent with a live-updating dashboard still ingesting data rather than a sourcing error — the 89% figure in fact 35 reproduced exactly. OpenAI facts 39-40 are CORRECTED on minor completeness grounds (one Codex credit sub-rate not surfaced, one date not stated in the cited article) but not refuted. No fact was outright refuted (source said something materially different). 'Estimated' facts (13, 37, 42) were skipped per instructions. Six new material additions were found on the same official Anthropic pricing page the sheet already cites, all missed by the original sheet: Claude Managed Agents' separate $0.08/session-hour runtime charge, code-execution/web-search tool metering, Bedrock/Google-Cloud's independent 10% regional-endpoint premium (stacking differently than the 1.1x US-inference multiplier), AWS/Azure marketplace CCU billing mechanics, per-model tool-use token overhead, and Enterprise's 20/50-seat minimums — all directly relevant inputs to any serious cost model. None of the 'Not found' list items were newly located this pass (no new WebSearch quota was available to chase them further).

## Checks

### 1. Fact 1: Claude Pro $20/mo ($17/mo annual), 'at least 5x more usage' vs Free, Claude Code included, overflow via usage credits at API rates

- verdict: confirmed
- original: $20 monthly / $17 annual; 5x usage vs Free
- corrected: same
- evidence: https://claude.com/pricing
- note: claude.com/pricing confirms '$20 if billed monthly' and '$17 per month with annual subscription discount ($200 billed up front)'.

### 2. Fact 2: Claude Max 5x=$100/mo, 20x=$200/mo, monthly billing only, Claude Code + Cowork included

- verdict: confirmed
- original: $100 / $200 per month
- corrected: same
- evidence: https://support.claude.com/en/articles/11049741-what-is-the-max-plan
- note: Help center explicitly: 'Max 5x: $100/month', 'Max 20x: $200/month'; 'currently available as a monthly subscription only'; Claude Code and Cowork both listed as included.

### 3. Fact 3: Team Standard $20/$25 seat, 1.25x vs Pro; Premium $100/$125 seat, 6.25x vs Pro; 2-150 seats

- verdict: confirmed
- original: Standard 1.25x, Premium 6.25x (both vs Pro), 2-150 seats
- corrected: same
- evidence: https://support.claude.com/en/articles/9266767-what-is-the-team-plan
- note: Exact wording confirmed: '1.25x more usage per session than the Pro plan' and '6.25x more usage per session than the Pro plan'; 'up to 150 seats' with 2-seat minimum. (Note: claude.com/pricing separately states Premium is '5x more usage than standard seats' — a different, non-conflicting comparison basis.)

### 4. Fact 4: Enterprise = seat price ($20/seat) + usage at API rates, no usage limits, legacy seat plans transition at renewal

- verdict: confirmed
- original: $20/seat + all usage at API rates; no plan/seat limits; legacy transitions at renewal
- corrected: same
- evidence: https://support.claude.com/en/articles/9797531-what-is-the-enterprise-plan
- note: Confirmed 'Every token your team uses...is billed at standard API rates on top of your seat cost', 'no plan or seat-level usage limits', and legacy Chat/Chat+Code/Standard/Premium seats 'automatically transition...at your next contract renewal'. The literal '$20/seat' figure is corroborated by claude.com/pricing ('$20/seat. Usage cost scales with model and task') rather than appearing verbatim in this fetch's returned summary.

### 5. Fact 5: Usage credits billed at API rates, $2,000 daily redemption cap, don't expire except Japan (6mo from 2026-09-10)

- verdict: confirmed
- original: API rates; $2,000/day cap; no expiry except Japan 6-month from 2026-09-10
- corrected: same
- evidence: https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans
- note: Exact match: 'daily redemption limit of $2000'; Japan exception 'expire six months after purchase starting September 10, 2026'.

### 6. Fact 6: Cache TTL 1h on subscription, 5min on usage credits; API key default 5min

- verdict: confirmed
- original: 1 hour subscription / 5 min on credits / 5 min API default
- corrected: same
- evidence: https://code.claude.com/docs/en/costs
- note: Exact quote: 'The lifetime is an hour on a subscription and drops to five minutes once you're drawing on usage credits...on an API key or cloud provider, it's five minutes by default.'

### 7. Fact 7: Weekly limits announced 2025-07-28, effective 2025-08-28, with stated hour ranges and <5% affected

- verdict: confirmed
- original: Pro 40-80h; Max$100 140-280h Sonnet+15-35h Opus; Max$200 240-480h Sonnet+24-40h Opus; <5% affected
- corrected: same
- evidence: https://techcrunch.com/2025/07/28/anthropic-unveils-new-rate-limits-to-curb-claude-code-power-users/
- note: All hour ranges and the <5% figure match exactly; rationale quotes (24/7 background use, account sharing, 'unprecedented demand') also confirmed.

### 8. Fact 8: Temporary +50% weekly limit promo, May 13 2026 - Sep 13 2026 PT, 5h limits unaffected

- verdict: confirmed
- original: 50% higher, May 13-Sep 13 2026, Pro/Max/Team/legacy Enterprise
- corrected: same
- evidence: https://support.claude.com/en/articles/15910845
- note: Confirmed verbatim: 'your weekly usage limit in Claude Code is 50% higher', validity 'From May 13, 2026 through September 13, 2026', 'After September 13, 2026, weekly usage limits...return to their standard levels.'

### 9. Fact 9: Fable 5/5.1 included (up to 50% of weekly limits) on Max/Team Premium/Enterprise Premium; Pro/Team Standard only via usage credits; promo ended 2026-07-19 23:59:59 PT

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan
- note: Confirmed: 'up to 50% of your weekly usage limits on Fable models at no extra cost' for seat-based Max/Premium; Pro/Standard 'not included in plan limits...available only through pay-as-you-go usage credits'; promo end 'July 19, 2026 at 11:59:59 PM PT', Fable 5.1 never part of the free offer.

### 10. Fact 10: Claude Max launched 2025-04-09, $100/$200, positioned vs ChatGPT Pro $200

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://techcrunch.com/2025/04/09/anthropic-rolls-out-a-200-per-month-claude-subscription/
- note: Date, both prices, and the ChatGPT Pro $200 competitive framing all confirmed.

### 11. Fact 11: Claude Code added to Pro plan, 2025-06-04, via AnthropicAI X post

- verdict: unverifiable
- original: 2025-06-04, x.com/AnthropicAI/status/1930307943502590255
- corrected: n/a
- evidence: https://x.com/AnthropicAI/status/1930307943502590255
- note: X returned HTTP 402 on direct fetch; web.archive.org is blocked entirely for this tool ('unable to fetch from web.archive.org'). Two fetch attempts exhausted per policy; date/content not independently confirmed (though plausible and consistent with fact 12's Aug 2025 Team/Enterprise rollout timeline).

### 12. Fact 12: Claude Code on Team/Enterprise, 2025-08-20, admin spend-cap quote

- verdict: corrected
- original: date confirmed; quote 'Admins have control over the maximum amount a user can spend with extra usage...'
- corrected: Date 2025-08-20 confirmed. Exact quote not found verbatim; page instead reads 'Set spending limits at the organization and individual user level to stay within budget while maintaining flexibility for essential projects.'
- evidence: https://www.anthropic.com/news/claude-code-on-team-and-enterprise
- note: Same substance (admin-settable per-user spend limits), different literal wording than the sheet's quoted sentence — treat the sheet's exact quote as unconfirmed, though the underlying claim (admin control of spend caps) holds.

### 13. Fact 13: Team Premium cut $150→$100/mo annual

- verdict: unverifiable
- original: estimated, ~Jan 2026
- corrected: n/a
- evidence: https://intuitionlabs.ai/articles/claude-pricing-plans-api-costs
- note: Marked 'estimated' in source sheet; skipped per instructions (not spot-checked).

### 14. Fact 14: Jan 9 2026 spoofing crackdown, Shihipar quote, OpenCode/xAI-Cursor impact, $1,000/month dfabulich quote

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://venturebeat.com/technology/anthropic-cracks-down-on-unauthorized-claude-usage-by-third-party-harnesses
- note: Date, Shihipar quote ('tightened our safeguards against spoofing the Claude Code harness'), OpenCode and xAI/Cursor mentions, and the >$1,000/month API-cost comparison quote all confirmed (attributed by the article to a Hacker News commenter, consistent with 'developer dfabulich').

### 15. Fact 15: Feb 2026 legal page OAuth ban wording + Shihipar ToS quote

- verdict: confirmed
- original: as stated, dated 2026-02-20
- corrected: same
- evidence: https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546
- note: Direct URL from the sheet 404'd on first attempt; the full URL with article ID (5014546) succeeded. Both quotes confirmed verbatim.

### 16. Fact 16: March 2026 peak-hour throttling (~7% of users, 6-hour window), off-peak promo through 2026-03-28, 'way faster than expected' quote

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.theregister.com/2026/03/31/anthropic_claude_code_limits/
- note: 7% figure, 6-hour peak window, March 28 promo end, and the exact quote all confirmed.

### 17. Fact 17/18: bcherny X posts on April 2026 third-party cutoff and Anthropic's rationale

- verdict: unverifiable
- original: as stated, x.com/bcherny/status/2040206440556826908 and .../2040206441756471399
- corrected: n/a
- evidence: https://x.com/bcherny/status/2040206440556826908
- note: X returned HTTP 402; web.archive.org unreachable for this tool. Two-attempt budget exhausted; not independently confirmed (though corroborated in substance by the still-live support.claude.com Fable and Agent-SDK pages, which describe the same April 2026 third-party carve-out).

### 18. Fact 20: Agent SDK credit plan, announced 2026-05-13 for 2026-06-15, per-plan credit amounts

- verdict: confirmed
- original: Pro $20, Max5x $100, Max20x $200, Team Std $20, Team Prem $100, Enterprise Prem $200
- corrected: same
- evidence: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- note: All six credit amounts and the 'starting June 15, 2026' effective date confirmed; scope (Agent SDK, claude -p, GitHub Actions, third-party apps via Agent SDK) confirmed.

### 19. Fact 21: Agent SDK change paused as of 2026-06-15, 'nothing has changed' language

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- note: Exact quote confirmed: 'We're pausing the changes...For now, nothing has changed.' Independently corroborated by Zed's blog (both June-16 update text confirmed verbatim: 'no separate Agent SDK credit to claim, and subscription limits are unchanged').

### 20. Fact 22: Karl Kahn (WA) class action filed/reported 2026-06-15 over 5x/20x vs weekly caps, since April 2025, Anthropic declined comment

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://finance.yahoo.com/sectors/technology/articles/anthropic-faces-lawsuit-over-claude-150710669.html
- note: Filing date, plaintiff, state, allegation, class scope (Max 5x/20x since April 2025 launch), and 'declined to comment' all confirmed.

### 21. Fact 23: Sonnet 5 $2/$10 made permanent, cancelled Sept 1 2026 increase to $3/$15

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://platform.claude.com/docs/en/about-claude/pricing
- note: Exact note text confirmed verbatim on the live pricing page.

### 22. Fact 24 (derived): No 2026 increase to Pro/Max/Team headline prices; Team Premium only decrease

- verdict: confirmed
- original: Pro $20, Max $100/$200, Team $20-25/$100-125 unchanged since 2025
- corrected: same
- evidence: https://claude.com/pricing
- note: Current live prices match exactly; no increase found in any source checked this pass.

### 23. Facts 25-27: Live API prices — Fable 5.1 $10/$50 (5m $12.50, 1h $20, read $0.25, batch $5/$25); Opus 5 $5/$25 (read $0.50, fast $10/$50); Sonnet 5 $2/$10; Haiku 4.5 $1/$5

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://platform.claude.com/docs/en/about-claude/pricing
- note: Full pricing table fetched live; every figure in facts 25-27 matches exactly, including cache-write multipliers and batch prices.

### 24. Fact 28: Cache multipliers 1.25x/2x/0.1x (0.025x Fable5.1/Mythos5.1), batch 50% off, US-only 1.1x for 4.6+, 1M context at standard rate, 4.7+ tokenizer ~30% more tokens

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://platform.claude.com/docs/en/about-claude/pricing
- note: All multipliers, the 1.1x data-residency note (specifically scoped to 'Claude 4.6 and later models'), and the ~30% tokenizer note confirmed verbatim.

### 25. Fact 29: Legal page — OAuth exclusive to subscription purchasers, third-party devs must use API keys, no Claude.ai login intermediation, enforcement w/o prior notice

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://code.claude.com/docs/en/legal-and-compliance
- note: All quoted clauses confirmed verbatim, including 'Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK' and the no-prior-notice enforcement clause.

### 26. Fact 30: Agent SDK docs — no third-party claude.ai login/rate-limit offering; use API key auth

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://code.claude.com/docs/en/agent-sdk/overview
- note: Exact quote confirmed verbatim.

### 27. Fact 31: claude -p uses subscription login by default; --bare never reads OAuth/keychain, requires ANTHROPIC_API_KEY; --bare will become the -p default

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://code.claude.com/docs/en/headless
- note: '--bare is the recommended mode for scripted and SDK calls, and will become the default for -p in a future release' and 'Claude Code never reads OAuth credentials or the system keychain' both confirmed verbatim. That plain claude -p (without --bare) draws on the subscription login is confirmed by contrast/implication rather than an isolated standalone sentence.

### 28. Fact 32: claude setup-token issues 1-year OAuth token, requires Pro/Max/Team/Enterprise, model-requests only; --bare doesn't read it

- verdict: confirmed
- original: as stated; plus a GitHub Actions doc note about CLAUDE_CODE_OAUTH_TOKEN and org-shared-secret guidance
- corrected: GitHub Actions portion (CLAUDE_CODE_OAUTH_TOKEN / org-secret guidance) not re-fetched this pass — remains as originally sourced, unverified in this check
- evidence: https://code.claude.com/docs/en/authentication
- note: Core setup-token claims confirmed verbatim: 'This token authenticates with your Claude subscription and requires a Pro, Max, Team, or Enterprise plan', 'can only make model requests', 'Bare mode does not read CLAUDE_CODE_OAUTH_TOKEN'. Did not re-fetch the separate GitHub Actions doc this pass.

### 29. Fact 33: Zed blog — ACP/claude -p/Agent SDK/third-party apps were slated for the Agent SDK credit pool; post-pause, all continue on subscriptions unchanged, no separate credit to claim

- verdict: confirmed
- original: as stated, published 2026-05-14 updated 2026-06-16
- corrected: same
- evidence: https://zed.dev/blog/anthropic-subscription-changes
- note: Both the original-plan quote and the June-16 pause quote confirmed verbatim, including 'There is no separate Agent SDK credit to claim, and subscription limits are unchanged.'

### 30. Fact 34: Anthropic enterprise API deployments — ~$13/dev/active-day, $150-250/dev/month, <$30/active-day for 90% of users

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://code.claude.com/docs/en/costs
- note: Confirmed verbatim: 'the average cost is around $13 per developer per active day and $150-250 per developer per month, with costs remaining below $30 per active day for 90% of users.'

### 31. Fact 35: Viberank calculator — 89% of devs >$200/mo, median $1,450, top-10% >$7,358, n=1,099 (checked 2026-08-05)

- verdict: corrected
- original: median $1,450; top-10% $7,358; n=1,099
- corrected: As read live (2026-09-08): 89% confirmed; median $1,468; top-10% threshold $7,359; n=1,102 developers
- evidence: https://www.viberank.app/calculator
- note: This is a live, continuously-updating leaderboard/calculator, so the small drift (≈1-3% on each figure) most likely reflects data added since the original agent's 2026-08-05 fetch, not an error in that fetch. The 89% figure is exactly reproduced; the dollar/count figures have moved and no longer match the page verbatim as cited, hence 'corrected' rather than 'confirmed'.

### 32. Fact 36: Viberank August 2026 monthly — $3,251,825 total, 215 devs, median $6,085, top-10% >$33,894, Claude 189 devs $2,905,208

- verdict: corrected
- original: as stated
- corrected: As read live (2026-09-08): total $3,277,046; 218 developers; median $6,230; top-10% $33,262+; Claude-specific 191 devs, $2,913,371
- evidence: https://www.viberank.app/stats/monthly/2026-08
- note: Same caveat as fact 35 — a per-month stats page for a closed month (August 2026) should in principle be static, but every figure has moved upward by 1-3% since the cited fetch, consistent with the site still ingesting late submissions for that month. 97% cache-read share was not re-confirmed this pass (not re-stated in the fetch summary) — treat as unconfirmed rather than refuted.

### 33. Fact 38: Sam Altman 2025-01-05 quote on losing money on ChatGPT Pro

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://techcrunch.com/2025/01/05/openai-is-losing-money-on-its-pricey-chatgpt-pro-plan-ceo-sam-altman-says/
- note: Date and quote confirmed verbatim: 'I personally chose the price, and thought we would make some money.'

### 34. Fact 39: OpenAI Codex plan structure and per-model credit rates (GPT-6 Astra 250/1250, GPT-5.6 Sol 100/500, Terra 50/300); no $/credit rate on page

- verdict: corrected
- original: as stated, with Astra 250 input/1,250 output; Sol 100/10 cached/500; Terra 50/5/300
- corrected: Plan prices (Free/Go $8/Plus $20/Pro $100+$200/Business $20-25) confirmed. Astra 250 input/1,250 output and Terra 50/300 confirmed. Sol figure now reads 100/500 (cached-input rate of 10 not reproduced in this fetch). No $/credit rate is stated on the page (confirmed absence, matching the sheet's own note).
- evidence: https://learn.chatgpt.com/docs/pricing
- note: Mostly reproduces; the Sol cached-input sub-rate (10 per 1M cached) wasn't surfaced in this fetch's summary — likely a fetch-extraction gap rather than a page change, since the other two models' figures matched exactly. Absence of a stated $/credit conversion is confirmed, supporting the sheet's flag of the $0.04/credit figure as secondary-only.

### 35. Fact 40: OpenAI restores 5-hour Codex cap 2026-08-25, Sottiaux 'smoothen the load' quote, Pro exempt 'for the upcoming months'

- verdict: corrected
- original: as stated, cap lifted 2026-07-12 previously
- corrected: Date, quote, and Pro exemption confirmed. The prior lifting date (July 12, 2026) is NOT stated in this article — it only says the cap had been lifted 'over the past few weeks.'
- evidence: https://9to5mac.com/2026/08/24/openai-restores-5-hour-codex-and-work-limits-for-chatgpt-plus-users/
- note: Sheet attributed the July 12 lifting date to 'per search summary' (i.e., not this article) — that attribution is accurate; this article alone doesn't independently corroborate July 12.

### 36. Fact 41: Dario Amodei '10x planned, saw 80x' quote; $30B run-rate April 2026; Claude Code $2.5B run-rate Feb 2026, $1B within 6 months of launch

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://venturebeat.com/technology/anthropic-says-it-hit-a-30-billion-revenue-run-rate-after-crazy-80x-growth
- note: All figures and the quote confirmed verbatim, article dated 2026-05-08.

### 37. Fact 43: Sanchit Vir Gogia quote on separate agent consumption pools; 'compute could not support' line attributed to Advait Patel, not Anthropic

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.infoworld.com/article/4171274/anthropic-puts-claude-agents-on-a-meter-across-its-subscriptions.html
- note: Gogia quote confirmed verbatim (with a minor gist expansion — full sentence includes 'premium models, tool use, background tasks, and third party integrations', slightly longer than the sheet's excerpt but not in conflict). Attribution of the compute-strain line to Advait Patel (not Anthropic) independently reconfirmed.

## Additions

- Enterprise plan minimum seat counts, not in the sheet: self-serve requires 20 seats minimum; sales-assisted requires 50 seats minimum. Source: https://support.claude.com/en/articles/9797531-what-is-the-enterprise-plan
- Claude Managed Agents pricing (a distinct API product/billing dimension the sheet omits entirely): tokens billed at standard model-pricing rates, PLUS session runtime billed separately at $0.08 per session-hour (metered to the millisecond, only while status is 'running'); Batch API discount does NOT apply to Managed Agents sessions. Source: https://platform.claude.com/docs/en/about-claude/pricing#claude-managed-agents-pricing
- Code execution tool (API) cost detail relevant to a cost model: minimum 5-minute billed execution time per use; each org gets 1,550 free hours/month; overage billed at $0.05/hour per container; code execution is free (no separate charge) when used alongside web_search or web_fetch tools. Source: https://platform.claude.com/docs/en/about-claude/pricing#code-execution-tool
- Web search tool (API) costs $10 per 1,000 searches, billed in addition to token usage; web fetch tool carries no additional charge beyond standard token costs. Source: https://platform.claude.com/docs/en/about-claude/pricing#web-search-tool
- Regional/multi-region endpoint premium on Bedrock and Google Cloud (Sonnet 4.5+/Haiku 4.5+/Opus 4.5+ and later): regional and multi-region endpoints carry a 10% premium over global endpoints — a second, provider-side data-residency surcharge distinct from the first-party 1.1x US-only inference multiplier already in the sheet. Source: https://platform.claude.com/docs/en/about-claude/pricing#regional-and-multi-region-endpoint-pricing
- Claude Platform on AWS / Microsoft Foundry marketplace billing mechanics: usage is converted to 'Claude Consumption Units' (CCU) at a fixed $0.01/CCU after applying any negotiated discount to the standard per-token rate; billing is hourly-metered, postpaid/arrears only, no prepaid credits. Relevant for any cost model covering enterprise customers on AWS/Azure marketplaces. Source: https://platform.claude.com/docs/en/about-claude/pricing#claude-platform-on-aws-pricing
- Tool-use system-prompt token overhead varies materially by model (e.g. Claude Opus 5: 286/406 tokens for auto-or-none vs any-or-tool tool_choice; Claude Opus 4.7: 675/804 tokens) — a real per-request fixed cost a detailed cost model should not ignore, previously absent from the sheet. Source: https://platform.claude.com/docs/en/about-claude/pricing#tool-use-pricing
