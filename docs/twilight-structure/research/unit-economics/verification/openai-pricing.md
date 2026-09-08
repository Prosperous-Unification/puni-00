# openai-pricing

## Overall

The research sheet is highly accurate: of the ~40 'quoted'/'derived' facts checked against primary or credible secondary sources this pass, essentially all were confirmed verbatim or by exact-matching arithmetic, with only one clear inaccuracy found (fact 51's claim that the outcome-based-pricing report is 'tied to the Astra agent launch' is not supported by the cited TheNextWeb article, which makes no such connection) and a handful (facts 35, 48, 49) left unverified this pass purely due to fetch-budget/403 constraints rather than any evidence of error. Notably, one item the sheet flagged as unverifiable/secondary-only (the ~272K long-context token threshold) turned out to be directly stated on OpenAI's own model pages, and the credit rate card includes two extra models (Daybreak Blue, GPT-5.2) not captured in the sheet. No new items from the 'Not found' list were located beyond the 272K threshold (which lives on a model page rather than the /docs/pricing page as originally sought) -- weekly Codex limits, purchasable credit-pack dollar prices, official Pro API-equivalent value, ChatGPT Enterprise list price, and a primary source for the Turley quotes all remain genuinely absent from public OpenAI sources after this additional pass.

## Checks

### 1. Fact 1: gpt-5.6-sol API price Standard $4.00/$0.40/$5.00/$20.00

- verdict: confirmed
- original: $4.00 input / $0.40 cached / $5.00 cache write / $20.00 output per MTok
- corrected: same
- evidence: https://developers.openai.com/api/docs/pricing
- note: Confirmed on live pricing page (platform.openai.com/docs/pricing 301-redirects here).

### 2. Fact 2: gpt-5.6-terra API price $2.00/$0.20/$2.50/$12.00

- verdict: confirmed
- original: $2.00/$0.20/$2.50/$12.00
- corrected: same
- evidence: https://developers.openai.com/api/docs/pricing
- note: Exact match.

### 3. Fact 3: gpt-5.6-luna API price $0.20/$0.02/$0.25/$1.20

- verdict: confirmed
- original: $0.20/$0.02/$0.25/$1.20
- corrected: same
- evidence: https://developers.openai.com/api/docs/pricing
- note: Exact match.

### 4. Fact 4: gpt-6-astra API price $10/$1/$12.50/$50

- verdict: confirmed
- original: $10/$1/$12.50/$50; Fast $20/$2/$25/$100; Long context $20/$2/$25/$75
- corrected: same
- evidence: https://developers.openai.com/api/docs/pricing
- note: All sub-figures confirmed; also confirmed via cellcog.ai and developers.openai.com model page. Additional detail found: Fast mode is unavailable for GPT-6 Astra with EU data residency.

### 5. Fact 5: Long-context multipliers 2x/2x/2x/1.5x for Sol/Terra/Luna

- verdict: confirmed
- original: Sol $8/$0.80/$10/$30; Terra $4/$0.40/$5/$18; Luna $0.40/$0.04/$0.50/$1.80
- corrected: same, plus the ~272K threshold is in fact stated on OpenAI's own model pages (not just secondary sources)
- evidence: https://developers.openai.com/api/docs/models/gpt-5.6-sol
- note: Long-context figures match exactly. The 272K threshold, which the sheet flagged as only from secondary sources, IS stated primarily: developers.openai.com/api/docs/models/gpt-5.6-sol says 'Additional surcharges apply for requests exceeding 272K input tokens and for cache write operations,' and the Astra model summary states the same 272K threshold with 2x input/1.5x output. Upgrade this from secondary-only to primary-confirmed.

### 6. Fact 6: Batch/Flex = 0.5x Standard

- verdict: confirmed
- original: e.g. Sol batch/flex $2.00/$0.20/$2.50/$10.00
- corrected: same
- evidence: https://developers.openai.com/api/docs/pricing
- note: Confirmed for Sol, Terra, Luna, Astra.

### 7. Fact 7: Fast mode = 2x Standard

- verdict: confirmed
- original: Sol fast $8/$0.80/$10/$40
- corrected: same
- evidence: https://developers.openai.com/api/docs/pricing
- note: Confirmed exactly.

### 8. Fact 8: Cache write 1.25x, 90% cache read discount, 30-min min cache life

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://openai.com/index/gpt-5-6/
- note: Confirmed via r.jina.ai proxy (direct fetch still 403s): quote matches almost verbatim.

### 9. Fact 9: +10% regional data residency surcharge for models released on/after 2026-03-05

- verdict: confirmed
- original: +10%
- corrected: same
- evidence: https://developers.openai.com/api/docs/pricing
- note: Page states a '10% uplift' for regional endpoints on such models.

### 10. Fact 10: gpt-5.3-codex API price $1.75/$0.175/$14 Standard, $3.50/$0.35/$28 Fast

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://developers.openai.com/api/docs/pricing
- note: Exact match; no Batch/Flex row shown for this model, consistent with sheet.

### 11. Fact 11: chat-latest price $5.00/$0.50/$30.00

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://developers.openai.com/api/docs/pricing
- note: Exact match.

### 12. Fact 12: gpt-5.5 API price $5/$0.50/$30, released 2026-04-23/24

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://developers.openai.com/api/docs/models/gpt-5.5
- note: Price confirmed on model page; snapshot id gpt-5.5-2026-04-23 corroborates the release date (page itself gives no explicit prose release date, only the snapshot).

### 13. Fact 13: gpt-5.4 API price $2.50/$0.25/$15

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://developers.openai.com/api/docs/models/gpt-5.4
- note: Exact match; snapshot gpt-5.4-2026-03-05.

### 14. Fact 14: gpt-5.4-mini API price $0.75/$0.075/$4.50, released 2026-03-17

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://developers.openai.com/api/docs/models/gpt-5.4-mini
- note: Exact match. Also confirms context window: 400K total (272K max input / 128K max output).

### 15. Fact 15: gpt-5.4-nano API price $0.20/$0.02/$1.25, released 2026-03-17

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://developers.openai.com/api/docs/models/gpt-5.4-nano
- note: Exact match.

### 16. Fact 16: gpt-5.6-cyber (Daybreak Red) $12.50/$1.25/$15.625/$75

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://developers.openai.com/api/docs/pricing
- note: Exact match; also matches the credit rate card figures (312.5/31.25/1,875) on help.openai.com/en/articles/20001106-codex-rate-card.

### 17. Fact 17: gpt-5.6-sol rate limits by usage tier

- verdict: confirmed
- original: Tier1 500/500K/1.5M ... Tier5 15,000/40M/15B
- corrected: same
- evidence: https://developers.openai.com/api/docs/models/gpt-5.6-sol
- note: Exact match across all 5 tiers.

### 18. Fact 18: ChatGPT individual plan prices (Free/Go/Plus/Pro)

- verdict: confirmed
- original: Free $0; Go $8; Plus $20; Pro $100(5x)/$200(20x)
- corrected: same
- evidence: https://learn.chatgpt.com/docs/pricing
- note: Confirmed exactly.

### 19. Fact 19: ChatGPT Business Standard $20/$25, 2-user minimum

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://learn.chatgpt.com/docs/pricing
- note: Confirmed; the $5 cut from $25/$30 on 2026-04-02 independently confirmed via cloudzero.com.

### 20. Fact 20: ChatGPT Business Premium $125/mo monthly, $100/mo annual, 5x Standard, no 5-hour cap

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://dev.to/alifar/openai-launches-chatgpt-business-premium-seats-with-5x-more-usage-capacity-2gbg
- note: openai.com/index/premium-seats-chatgpt-business/ still 403s direct WebFetch (tried twice); dev.to secondary source (used by original sheet too) confirms verbatim. NOTE: learn.chatgpt.com/docs/pricing, fetched fresh today, does NOT mention a Business Premium tier at all -- worth flagging that the primary pricing overview page may not yet list Premium seats.

### 21. Fact 22: Codex in every ChatGPT tier; shared credit pool across Codex/ChatGPT Work/Excel/Workspace Agents

- verdict: confirmed
- original: as stated, incl. 'OpenAI Support does not reset...' quote
- corrected: same
- evidence: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- note: Confirmed via r.jina.ai proxy (direct 403s): 'Codex is included across ChatGPT plans, including Free and Go,' shared-pool quote matches verbatim, and the Support-reset quote matches verbatim.

### 22. Fact 23: Per-plan Codex message ranges per 5h window for GPT-5.6 Sol/Terra/Luna, GPT-6 Astra, GPT-5.5, GPT-5.4, GPT-5.4-mini

- verdict: confirmed
- original: as stated in full table
- corrected: same
- evidence: https://learn.chatgpt.com/docs/pricing
- note: All rows match exactly, including 'Weekly limits may also apply.'

### 23. Fact 24: 'GPT-5.6 usage averages 5-30 credits per message'

- verdict: confirmed
- original: quoted verbatim
- corrected: same
- evidence: https://learn.chatgpt.com/docs/pricing
- note: Confirmed verbatim on page. The GPT-5.5 '5-45 credits' companion figure (attributed to simplemetrics.xyz, a secondary source) was not independently re-verified; treat that sub-clause as still resting on a secondary source only.

### 24. Fact 25: Credit rate card (credits per 1M tokens) for all models

- verdict: confirmed
- original: Astra 250/25/1250; Sol 100/10/500; Terra 50/5/300; Luna 5/0.5/30; 5.5 125/12.5/750; 5.4 62.5/6.25/375; 5.4-mini 18.75/1.875/113; 5.3-Codex 43.75/4.375/350; Daybreak Red 312.5/31.25/1875
- corrected: same
- evidence: https://help.openai.com/en/articles/20001106-codex-rate-card
- note: Confirmed via r.jina.ai proxy (direct 403s) and independently cross-matches learn.chatgpt.com/docs/pricing for the models it lists. The rate-card page also lists two models not in the sheet: 'Daybreak Blue' (100/10/500, same as Sol) and GPT-5.2 (43.75/4.375/350, same as 5.3-Codex) -- see additions.

### 25. Fact 26: $0.04 per credit (25 credits/$1)

- verdict: confirmed
- original: derived from $100=2500 credits promo
- corrected: same
- evidence: https://dev.to/alifar/openai-launches-chatgpt-business-premium-seats-with-5x-more-usage-capacity-2gbg
- note: Confirmed: '$100 in workspace credits, or 2,500 credits, per Premium seat added, capped at $500 for five seats' -- $100/2500=$0.04. Also confirmed the promo has since ended (as of 2026-08-25).

### 26. Fact 27: Credits x $0.04 reproduces every API list price

- verdict: confirmed
- original: derived arithmetic
- corrected: same
- evidence: https://help.openai.com/en/articles/20001106-codex-rate-card
- note: Checked arithmetic directly against the now-confirmed rate card and confirmed API prices: Sol 100x$0.04=$4 (matches), Terra 50x$0.04=$2 (matches), Luna 5x$0.04=$0.20 (matches), Astra 250x$0.04=$10 (matches), 5.5 125x$0.04=$5 (matches), 5.4 62.5x$0.04=$2.50 (matches), 5.3-Codex 43.75x$0.04=$1.75 (matches). Derivation holds.

### 27. Fact 34: GPT-5.4 (2026-03-05) and mini/nano (2026-03-17) release dates and prices

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://en.wikipedia.org/wiki/GPT-5.4
- note: Wikipedia confirms both dates and the '4x more expensive than GPT-5 equivalents' claim for mini/nano.

### 28. Fact 35: Codex moved to token-aligned credits 2026-04-02 (most plans) / 2026-04-23 (legacy Enterprise etc.)

- verdict: unverifiable
- original: as stated
- corrected: n/a
- evidence: https://uibakery.io/blog/openai-codex-pricing
- note: Not independently re-fetched this round (fetch budget spent on higher-priority primary sources); sheet already notes the OpenAI help page 403s. No new evidence gathered either way -- carry forward as previously sourced (secondary only), unverified against a primary page.

### 29. Fact 36: ChatGPT Business seat price cut 2026-04-02, $25/$30 -> $20/$25

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.cloudzero.com/blog/how-much-does-chatgpt-cost/
- note: Confirmed directly: 'Before the reduction, pricing was $25/$30... became $20/seat/month billed annually ($25 monthly)'.

### 30. Fact 37: $100 ChatGPT Pro tier launched 2026-04-09, 5x Plus, promo 10x through 2026-05-31, $200 tier 20x

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://techcrunch.com/2026/04/09/chatgpt-pro-plan-100-month-codex/
- note: All figures confirmed verbatim, including 'anyone who tries the new tier...should be advised that such a situation likely won't last' referring to the promo window.

### 31. Fact 38: GPT-5.5 released 2026-04-23 (API 2026-04-24) at $5/$30, double GPT-5.4; Cyber preview 2026-05-07

- verdict: confirmed
- original: as stated
- corrected: same, with one nuance
- evidence: https://en.wikipedia.org/wiki/GPT-5.5
- note: Dates confirmed exactly, including Cyber preview 2026-05-07. However Wikipedia itself does NOT state the '2x GPT-5.4' pricing comparison -- that is arithmetic derivable from the independently-confirmed facts 12/13 ($5 vs $2.50, $30 vs $15 = exactly 2x), so the claim holds but is a derived fact, not a quoted one from this source.

### 32. Fact 39: One-off Codex rate-limit reset 2026-04-28, no new allowance, 'no timeline to share' for recurring resets

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://community.openai.com/t/codex-rate-limits-reset-for-all-paid-plans-april-28-2026/1379921
- note: Confirmed: reset was to the reset-timer only ('all users have a new maximum usage they can obtain within 5 days', not a new allowance), and OpenAI staff stated 'We don't have a timeline to share' on predictable replenishment.

### 33. Fact 40: Codex pay-as-you-go seats withdrawn from new Business workspaces 2026-06-24, existing seats grandfathered

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.sayfeai.com/blog/chatgpt-business-codex-seats-cutoff-june-2026
- note: Confirmed: date and grandfathering language match closely ('Workspaces that added a Codex seat before that date... are grandfathered'). Note the article is specifically about the metered Codex-only seat add-on, not about whether ordinary Standard/Premium seats include Codex (that part is sourced elsewhere in the sheet, fact 22).

### 34. Fact 41: GPT-5.6 Sol/Terra/Luna preview 2026-06-26, public 2026-07-09, launch prices Sol $5/$30, Terra $2.50/$15, Luna $1/$6

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://openai.com/index/gpt-5-6/
- note: Launch prices confirmed verbatim via r.jina.ai proxy fetch of the primary announcement (direct fetch 403s). Preview/GA dates not re-checked against Wikipedia this round but launch prices corroborate the sheet's account.

### 35. Fact 42: Terra -20% to $2/$12, Luna -80% to $0.20/$1.20 effective 2026-07-30; Fast mode (renamed from Priority) 2.5x speed/2x price

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/
- note: Confirmed via r.jina.ai proxy: 'Luna...will cost 80% less, while...Terra...will cost 20% less' and Fast mode 'up to 2.5x faster speeds than Standard processing at twice the price'. Also confirms 'Terra and Luna usage now consumes fewer credits' while dollar subscription prices stay flat.

### 36. Fact 43: Sol promo cut 2026-08-21 through 2026-11-21, $5->$4 input (-20%), $30->$20 output (-33%)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://developers.openai.com/api/docs/models/gpt-5.6-sol
- note: Confirmed on OpenAI's own model page (primary, not just winbuzzer secondary): 'GPT-5.6 Sol costs $4 per million input tokens and $20 per million output tokens, a 20% reduction in input pricing and a 33% reduction in output pricing,' with promo through Nov 21, 2026.

### 37. Fact 44: ChatGPT Business Premium seats announced 2026-08-10, GA 2026-08-25, $100 annual/$125 monthly, 5x Standard, no 5h cap

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://dev.to/alifar/openai-launches-chatgpt-business-premium-seats-with-5x-more-usage-capacity-2gbg
- note: Confirmed (same source re-fetched for fact 20 above).

### 38. Fact 45: Codex CLI 0.152.0 (2026-09-01) earlier low-allowance warning for Plus/Team

- verdict: confirmed
- original: quoted verbatim
- corrected: same
- evidence: https://learn.chatgpt.com/docs/changelog
- note: Confirmed verbatim, listed under 'New Features' for that release.

### 39. Fact 46: GPT-6 Astra released 2026-09-03; Trusted Access first; $10/$1/$50; 1,050,000 token context (922K in/128K out); Codex rollout to Pro/Business/Enterprise not Plus

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://cellcog.ai/blog/openai-astra-release-date/
- note: All figures confirmed, including the 272K long-context threshold detail for Astra (2x input/1.5x output above that), which corroborates fact 5's upgrade.

### 40. Fact 47: API-key auth for programmatic Codex CI/CD vs Sign-in-with-ChatGPT; API-key mode uses standard API pricing not plan credits; Enterprise access tokens for scripts/schedulers/CI runners

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://learn.chatgpt.com/docs/auth
- note: Core pricing-relevant quote confirmed verbatim: 'When you sign in with an API key, Codex uses standard API pricing instead of included ChatGPT plan credits.' Access-token guidance for CI runners also confirmed, phrased slightly differently than the sheet's exact quote but materially identical.

### 41. Fact 48: Maintainer statements on forks/third-party harnesses (Apache license permissive; 'I'm an engineer not a lawyer'); no written confirmation of BYO-subscription

- verdict: unverifiable
- original: as stated
- corrected: n/a
- evidence: https://github.com/openai/codex/discussions/8338
- note: Not re-fetched this round due to fetch-budget prioritization of primary pricing sources; GitHub discussions are generally fetchable but this one was deprioritized. Carry forward unverified this pass.

### 42. Fact 49: Sign-in-with-ChatGPT workspace controls, enabled by default, admins can disable/restrict

- verdict: unverifiable
- original: as stated
- corrected: n/a
- evidence: https://help.openai.com/en/articles/20001410-sign-in-with-chatgpt
- note: Not re-fetched this round (help.openai.com articles were 403ing on direct fetch in this session; budget was spent on the two Codex help articles that were higher-priority for the cost model). Carry forward unverified this pass.

### 43. Fact 50: $1B ad run-rate ~200 days after first ad; $2.5B 2026 target; >$40B total company run-rate; $100B by end of decade; tens of thousands of advertisers

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.pymnts.com/news/artificial-intelligence/2026/openai-says-ad-business-reaches-1-billion-run-rate/
- note: All figures confirmed, including 'approximately 200 days' and 'tens of thousands of advertisers' plus a new detail: 'more than 50 technology and measurement partners.'

### 44. Fact 51: OpenAI testing outcome-based pricing for enterprise agents, tied to the Astra agent launch, not about Codex

- verdict: corrected
- original: 'tied to the Astra agent launch'
- corrected: The article does NOT tie the outcome-based pricing report to the Astra launch at all -- it discusses enterprise agent pricing (e.g. customer support) generally, with no mention of Astra, Codex, or coding agents.
- evidence: https://thenextweb.com/news/openai-outcome-based-pricing-enterprise
- note: The 'undisclosed terms, not announced by OpenAI, TNW has not independently verified' parts are all confirmed verbatim. But the sheet's framing 'tied to the Astra agent launch' is not supported by this source -- correct that clause to 'no stated connection to Astra' per this article.

### 45. Fact 53: Nick Turley quotes on flat/unlimited pricing not making sense as tech evolves

- verdict: confirmed
- original: quoted, primary source not locatable
- corrected: same (both quotes verbatim present on tldv.io, still no primary source locatable)
- evidence: https://tldv.io/blog/chatgpt-pricing/
- note: Both quotes confirmed verbatim on tldv.io. Re-confirmed the sheet's own caveat: the secondary source itself attributes them only to 'said recently' with no interview link, byline, or date -- so the quotes are confirmed to exist on this secondary page but remain unattributable to a primary source.

### 46. Fact 54: 'Eligible Plus and Pro users can buy credits without changing plans'

- verdict: confirmed
- original: quoted verbatim
- corrected: same
- evidence: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- note: Confirmed verbatim via r.jina.ai proxy.

### 47. Fact 55: ChatGPT for Teachers free for verified US K-12 educators through June 2027; up to 75% nonprofit discount on Business/Enterprise

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://openai.com/chatgpt/pricing/
- note: Confirmed via r.jina.ai proxy (direct fetch 403s): 'a free plan for verified U.S. K-12 educators through June 2027' and 'access up to a 75% discount on ChatGPT Business or ChatGPT Enterprise.'

### 48. Fact 21 (estimated, spot-checked per instructions): ChatGPT Enterprise ~$60/user/mo, $45-75 range, ~150-seat min

- verdict: unverifiable
- original: as stated, 'estimated' confidence
- corrected: n/a
- evidence: https://www.beam.cloud/blog/chatgpt-enterprise-pricing
- note: Marked 'estimated' in the sheet, out of scope per task instructions (only check estimated facts if free/quick); not rechecked. No official price is published anywhere located in this pass either.

## Additions

- Credit rate card (help.openai.com/en/articles/20001106-codex-rate-card, confirmed live) lists two models the sheet's fact 25 omitted: 'Daybreak Blue' at 100/10/500 credits per 1M tokens (input/cached/output, identical to Sol's rate) and 'GPT-5.2' at 43.75/4.375/350 (identical to GPT-5.3-Codex's rate) -- useful additional data points for a cost model spanning the credit system.
- The ~272K long-context billing threshold, which the original sheet treated as coming only from secondary sources (cellcog.ai, winbuzzer.com), is in fact stated directly on OpenAI's own model pages: developers.openai.com/api/docs/models/gpt-5.6-sol says 'Additional surcharges apply for requests exceeding 272K input tokens and for cache write operations,' and cellcog.ai's Astra summary (itself citing developers.openai.com) states the same 272K threshold with a 2x input / 1.5x output multiplier above it. This resolves one of the sheet's 'Not found' items -- the threshold IS on a primary OpenAI page (a model page, not the top-level /docs/pricing page).
- GPT-5.4-mini and GPT-5.4-nano context windows, useful for a cost model: 400,000 total context window, split as 272,000 max input tokens / 128,000 max output tokens (developers.openai.com/api/docs/models/gpt-5.4-mini). GPT-6 Astra's split is 1,050,000 total = 922,000 max input / 128,000 max output (cellcog.ai/blog/openai-astra-release-date/, corroborated by platform pricing).
- Fast mode has a documented exception relevant to EU deployments: 'Fast mode is unavailable for GPT-6 Astra with EU data residency' (developers.openai.com/api/docs/pricing) -- worth noting alongside the sheet's existing +10% EU/regional-residency surcharge fact (fact 9), since it means EU Astra users cannot pay for the 2x-speed tier at all, not just that it costs more.
- The ChatGPT Business Premium seat credit promo ('$100 in workspace credits, or 2,500 credits, per Premium seat, capped at $500 for five seats') formally ended 2026-08-25 per dev.to -- worth noting in the cost model as a promo that is no longer active, consistent with fact 44's GA date.
