# convergence-thesis

## Overall

44 claims checked against their cited pages: 40 confirmed, 3 corrected, 1 unverifiable, 0 refuted. The thesis survives; the corrections are at the edges. (1) claude.com/pricing does not list Max on 'Usage credits' for Fable - Max 5x/20x show '50% of weekly limits' and Team Standard/Premium show 'No', which strengthens the hybrid reading (the newest model is rationed, not sold at list, to Max) and weakens the researcher's 'Team Premium keeps 50%' from digitalapplied. (2) The Marin article carries only '$50 per million tokens' vs '$25 previous flagship' vs '$30 GPT-5.5'; the $10 input and $1 cache-read come from platform.claude.com, and 'previous flagship' cannot be Opus 5, which launched 2026-07-24. (3) Replit's cited page has neither the $0.06 figure nor the apology quote. The one derived headline - Codex credits at exactly API list ($0.04/credit) - holds for Standard mode across all five models but fails for Fast mode (2.5x credits vs 2.0x API), a 25% premium the summary should carry. Material misses for a cost model: Fable 5.1 cache reads at 0.025x (not 0.1x), the ~30% tokenizer inflation on Claude 4.7+, 1h cache writes at 2x, Sonnet 5's cancelled price increase, and Cursor's own docs billing Auto at list price. Secondary sources (groundy, explainx, digitalapplied, lowcode, yaw.sh, Luminix, Sacra, CloudZero) were fetched and say what the researcher says they say, but remain secondary; the Kahn docket, the Bessemer statistic, GitHub's changelog, and the Anthropic Max/Fable 5 launch posts stay unlocated.

## Checks

### 1. Cursor new-tier post: Pro >= $20 of inference at API prices; Ultra $200 = 20x Pro; 'predictability' rationale

- verdict: confirmed
- original: Pro $20 = $20 of inference at API prices; Ultra $200 = 20x Pro
- corrected: same
- evidence: https://cursor.com/blog/new-tier
- note: Page (Jun 16, 2025) reads 'at least $20 of model inference at API prices per month', 'Ultra, a $200 / mo plan with 20x more usage than Pro', 'more predictability than usage-based pricing would offer', 'multi-year partnerships from OpenAI, Anthropic, Google, and SpaceXAI', and 'Existing users can choose to stay with the 500 request limit method'.

### 2. Cursor apology post: 500 requests/mo (Sonnet = 2 requests) -> $20 of frontier usage at API pricing; longer-horizon rationale; refunds Jun 16-Jul 4

- verdict: confirmed
- original: 500 requests/mo -> $20/mo at API pricing; 'order of magnitude'
- corrected: same
- evidence: https://cursor.com/blog/june-2025-pricing
- note: All quoted phrases present verbatim, including 'We were not clear that unlimited usage was only for Auto and not all other models' and the pro-pricing@cursor.com refund window Jun 16-Jul 4, 2025.

### 3. Anthropic weekly rate limits (effective 2025-08-28), 24/7 users and resale; Max can buy more at standard API rates

- verdict: confirmed
- original: Pro 40-80 h/wk Sonnet 4; Max $100 140-280 h Sonnet + 15-35 h Opus 4; Max $200 240-480 h Sonnet + 24-40 h Opus 4; <5% affected
- corrected: same
- evidence: https://techcrunch.com/2025/07/28/anthropic-unveils-new-rate-limits-to-curb-claude-code-power-users/
- note: All hour ranges, 'less than 5% of subscribers', 'continuously in the background, 24/7', account sharing/reselling, and 'at standard API rates' for Max top-ups are on the page.

### 4. Max plan launched at 5x and 20x Pro

- verdict: confirmed
- original: $100/mo (5x Pro) and $200/mo (20x Pro)
- corrected: same
- evidence: https://techcrunch.com/2025/04/09/anthropic-rolls-out-a-200-per-month-claude-subscription
- note: Article (Apr 9, 2025) fetched directly this time: '$100-per-month Max tier with 5x higher rate limits than Claude Pro and a $200-per-month Max option with 20x higher rate limits'. Anthropic's own launch post still 404s at claude.com/blog/max-plan (anthropic.com/news/max-plan 308-redirects there).

### 5. Claude Code on Team/Enterprise: extra usage at standard API rates with org/user spend limits

- verdict: confirmed
- original: seat + extra usage at standard API rates
- corrected: same
- evidence: https://www.anthropic.com/news/claude-code-on-team-and-enterprise
- note: Aug 20, 2025 post: 'admins can enable extra usage for individual users at standard API rates'; 'Set spending limits at the organization and individual user level'; 'enough usage for a typical workday'. No seat prices printed.

### 6. Support article: usage credits on Pro/Max 5x/Max 20x billed at standard API rates; $2,000/day

- verdict: confirmed
- original: standard API rates; $2,000/day redemption limit
- corrected: same
- evidence: https://support.claude.com/en/articles/12429409
- note: Title 'Manage usage credits for paid Claude plans'; 'Usage credits are billed at standard API rates'; 'There is a daily redemption limit of $2000'; 'Updated over a month ago'.

### 7. claude.com/pricing: Enterprise '$20/seat + usage at API rates'; Fable 5.1 via usage credits on Pro, Max and Team standard; premium = 5x standard

- verdict: corrected
- original: Pro $20 ($17 annual); Max from $100; Team standard $20-25; Team premium $100-125; Enterprise $20/seat + API-rate usage; Fable 5.1 'Usage credits' on Pro, Max, Team standard
- corrected: Prices and Enterprise text confirmed. The comparison row is labelled 'Fable' (not 'Fable 5.1'): Free 'No', Pro 'Usage credits', Max 5x '50% of weekly limits*', Max 20x '50% of weekly limits*'; Team table shows Standard 'No', Premium 'No', Enterprise 'Yes'. Fable 5.1 appears only in the API section ($10/$50, cache read $0.25); Fable 5 listed under legacy models ($10/$50, cache read $1).
- evidence: https://claude.com/pricing
- note: Two independent fetches agree: Max is NOT on usage credits for Fable, it carries 50% of weekly limits; Team Standard is 'No', not 'Usage credits'. 'Premium seats: 5x more usage than standard seats' confirmed.

### 8. Enterprise unbundling: renewals metered from Nov 2025, new Enterprise Feb 2026, legacy cutoff 2026-03-08, ~$20 seat + API-rate tokens

- verdict: confirmed
- original: $20/seat base + metered usage at public API rates (e.g. Sonnet 4.6 $3/$15)
- corrected: same
- evidence: https://groundy.com/articles/anthropic-ends-flat-fee-enterprise-claude-above-150-seats-and-forces-per-token/
- note: Page carries all three dates, '$20-per-seat monthly base plus metered API usage at standard rates' (attributed to Gizmodo), Team up to 150 seats, Enterprise 20+ seats, Sonnet 4.6 $3/$15, Opus 4.7 $5/$25, Haiku 4.5 $1/$5. Secondary source; undated.

### 9. 2026-04-04 noon PT third-party tools billed per token on Pro/Max; $100/$200 credit until 04-17; up to 30% off bundles

- verdict: confirmed
- original: Opus 4.6 $5/$25, Sonnet 4.6 $3/$15 on the subscription path
- corrected: same; the 'up to 30% off prepaid bundles' figure is NOT on the relayplane page - it is on the fusion94 page cited in the note
- evidence: https://relayplane.com/blog/anthropic-extra-usage-third-party-tools
- note: Relayplane (Apr 4, 2026) confirms noon PT, the tool list, $100/$200 credits, Apr 17 deadline, Opus 4.6 $5/$25 and Sonnet 4.6 $3/$15. Fusion94 confirms both Cherny quotes and 'Up to 30% discount on prepaid usage bundles' through Apr 17; its timeline is Feb 2024 ToS -> Feb 2026 ToS revision -> Apr 4 enforcement and does not mention a Jan 2026 OAuth block/reversal.

### 10. March 2026 peak-hour reductions (~7% of users) and 03-31 'way faster than expected' statement

- verdict: confirmed
- original: ~7% of users; off-peak 2x promo ended 2026-03-28; Max 5x exhausted in 1 hour
- corrected: same
- evidence: https://www.theregister.com/2026/03/31/anthropic_claude_code_limits/
- note: Shihipar 'affect around 7 percent of users', 'we've landed a lot of efficiency wins to offset this'; promotion ended Mar 28, 2026; the 'two independent bugs ... inflating costs by 10-20x' is a user allegation as the researcher says.

### 11. 2026-05-06: Claude Code 5-hour limits doubled, peak-hour reduction removed, Opus API limits raised; SpaceX Colossus 1

- verdict: confirmed
- original: 2x five-hour limits; '>300 megawatts (over 220,000 NVIDIA GPUs) within the month'
- corrected: same
- evidence: https://www.anthropic.com/news/higher-limits-spacex
- note: Post (May 6, 2026) says 'doubling Claude Code's five-hour rate limits' for 'Pro, Max, Team, and seat-based Enterprise', 'removing the peak hours limit reduction' for Pro/Max, and the 300 MW / 220,000 GPU figure. Weekly limits are not mentioned in the post; 'weekly caps unchanged' comes from explainx, which does say so.

### 12. Temporary 2x off-peak/weekend promotion 2026-03-13 to 03-28 for Free/Pro/Max/Team

- verdict: confirmed
- original: 2x off-peak, 2026-03-13 to 2026-03-28
- corrected: same
- evidence: https://explainx.ai/blog/claude-usage-limits-2026-timeline-explained
- note: Timeline entry present; adds that the bonus 'did not count against weekly caps'. Secondary; The Register independently confirms the Mar 28 end.

### 13. Redeploying Fable 5 post: 50% of weekly limits through July 7 then usage credits; Enterprise standard none, premium through July 7

- verdict: confirmed
- original: 50% of weekly limits through 2026-07-07, then usage credits; global availability from 2026-07-01
- corrected: same
- evidence: https://www.anthropic.com/news/redeploying-fable-5
- note: Quote present verbatim. Post is dated Jun 30, 2026 with a Jul 1 update; suspension on Jun 12 under export controls confirmed. The only 'restoration' language is about AWS/Google Cloud/Foundry, not subscriptions - consistent with the researcher's reading.

### 14. Fable 5 extensions to 07-12 and 07-19; permanent split from 07-20 (Max/Team Premium 50% weekly; Pro/Team Standard credits + $100); Claude Code +50% weekly through 08-19

- verdict: confirmed
- original: Max/premium: 50% of weekly permanently; Pro/standard: credits + $100 one-time; Claude Code +50% weekly through 2026-08-19
- corrected: same, with one caveat: claude.com/pricing today shows Team Premium 'No' for Fable, which conflicts with 'Team Premium keeps 50%'
- evidence: https://www.digitalapplied.com/blog/anthropic-fable-5-access-extended-july-12-2026
- note: Digitalapplied carries every date and the @trq212 'as soon as capacity allows' quote. Android Authority (Jul 7, 2026) confirms extension to Jul 12 11:59:59 PM PT, 'Just hours before', and 'hopes to eventually restore Fable 5 as a standard benefit ... once capacity allows'. Max 50% is corroborated by claude.com/pricing; Team Premium is not.

### 15. Marin: Fable 5 out of paid subscriptions from 2026-06-23, $50/M vs $25 previous flagship vs $30 GPT-5.5

- verdict: corrected
- original: $10/$50 per MTok in/out (cache read $1/M) vs Opus 5 $5/$25; GPT-5.5 $5/$30
- corrected: Article states only '$50 per million tokens, compared with $25 for its previous flagship model and $30 for OpenAI's GPT-5.5' and the Jun 23 removal. It gives no input price, no cache-read price, and does not name Opus 5; Opus 5 launched 2026-07-24 (anthropic.com/news/claude-opus-5), after this article, so the 'previous flagship' at $25 was an Opus 4.x. The $10/$50 and $1 cache read are confirmed on platform.claude.com pricing (Fable 5); Fable 5.1's cache read is $0.25.
- evidence: https://cafetechinenglish.substack.com/p/anthropic-shakes-up-its-pricing-strategy
- note: 'aims to bring Fable 5 back ... as quickly as [it] can' and the capacity/agents rationale confirmed. Article date Jun 11, 2026.

### 16. Kahn v. Anthropic: Max 5x ~3.5x, Max 20x 6-8x; 15% of weekly in one session; MTD 08-19; hearing 11-06

- verdict: confirmed
- original: 3:26-cv-05763 (N.D. Cal.), filed 2026-06-14; motion to dismiss 2026-08-19; hearing 2026-11-06
- corrected: same; filing date has a one-day ambiguity
- evidence: https://www.explainx.ai/blog/anthropic-claude-max-lawsuit-usage-limits-2026
- note: Explainx carries case number, Jun 14 filing, the 3.5x and 6-8x allegations, Aug 19 MTD and Nov 6 hearing. Engadget (Jun 15, 2026) confirms plaintiff Karl Kahn (DC), class of US Max buyers since Apr 2025, 15%-in-one-session, 'declined to comment' - but describes the filing as 'Monday' and Jun 14, 2026 is a Sunday. Docket itself not reachable (CourtListener/Justia 403). Both explainx and Engadget are secondary.

### 17. OpenAI $100 Pro 5x tier; Altman 'by very popular demand'; Plus Codex 'rebalancing'; 2x boost ending 05-31

- verdict: confirmed
- original: Plus $20; Pro 5x $100; Pro 20x $200
- corrected: same
- evidence: https://venturebeat.com/orchestration/openai-introduces-chatgpt-pro-usd100-tier-with-5x-usage-limits-for-codex
- note: Apr 9, 2026 article; both quotes present; 'temporary 2x usage increase that concludes on May 31, 2026' present.

### 18. Codex moved to token-based credits 2026-04-02; ~$0.04/credit derived from GPT-5.3-Codex

- verdict: confirmed
- original: ~$0.04/credit; GPT-5.3-Codex 43.75 credits/M input vs $1.75/M API
- corrected: same
- evidence: https://www.cloudzero.com/blog/openai-codex-pricing/
- note: Apr 2 (Plus/Pro/Business) and Apr 23 (legacy Enterprise/Edu/Health/Gov) dates, 'credits are just tokens wearing a costume', and the $1.75/43.75 derivation are on the page (published Jul 27, updated Sep 4, 2026). The page does NOT mention Free/Go getting GPT-5.6 Terra 'per July announcement' (cited in claim 21's note).

### 19. Codex credits = API list at $0.04/credit for every current model (derived)

- verdict: confirmed
- original: Sol 100/10/500 vs $4/$0.40/$20; Astra 250/25/1,250 vs $10/$1/$50; Luna 5/0.5/30 vs $0.20/$0.02/$1.20; GPT-5.5 125/12.5/750 vs $5/$0.50/$30
- corrected: same for Standard mode; NOT true for Fast mode - credits page applies 2.5x to Astra while the API page prices Fast at exactly 2x Standard, so Fast via credits = $0.05/credit-equivalent, 25% above API list
- evidence: https://learn.chatgpt.com/docs/pricing
- note: All twelve cells re-derived from both pages. Also GPT-5.6 Terra: 50/5/300 credits vs $2/$0.20/$12 = $0.04. API page: Astra Fast $20/$2/$100 (short context), $40/$4/$150 (long context); Batch/Flex = 50% of Standard confirmed.

### 20. Codex included usage quoted as message ranges per 5h window plus weekly cap

- verdict: confirmed
- original: Sol: Plus 10-100, Pro 5x 50-500, Pro 20x 200-2,000; Go $8; Business $20-25; '5-30 credits per message'
- corrected: same
- evidence: https://learn.chatgpt.com/docs/pricing
- note: Page also gives Astra Plus 5-45 / Pro 5x 25-225 / Pro 20x 100-900; Terra 25-200 / 125-1,000 / 500-4,000; Luna 250-2,000 / 1,250-10,000 / 5,000-40,000; Business = Plus ranges. 'Weekly limits may also apply.' No dollar price per purchased credit is published.

### 21. Codex app launch doubled rate limits on paid plans; Free/Go 'for a limited time'; usage doubled since GPT-5.2-Codex; >1M developers

- verdict: confirmed
- original: 2x rate limits on all paid plans; Free/Go inclusion (limited time)
- corrected: same
- evidence: https://openai.com/index/introducing-the-codex-app/
- note: Direct fetch 403s; read via r.jina.ai reader proxy. Text: 'doubling the rate limits on Plus, Pro, Business, Enterprise, and Edu plans'; 'For a limited time we're including Codex with ChatGPT Free and Go'; 'Since the launch of GPT-5.2-Codex in mid-December, overall Codex usage has doubled'; 'more than a million developers'. Page displays Mar 4, 2026 as its date.

### 22. ChatGPT Go $8 globally; Business cut $5

- verdict: confirmed
- original: Go $8/mo from 2026-01-16; Business $20 annual / $25 monthly from 2026-04-02 (from $25/$30)
- corrected: same
- evidence: https://www.cloudzero.com/blog/how-much-does-chatgpt-cost/
- note: Secondary compilation (published Apr 30, updated Sep 4, 2026); learn.chatgpt.com independently shows Go $8 and Business $20/$25.

### 23. Altman: losing money on $200 Pro; he chose the price

- verdict: confirmed
- original: $200/mo Pro unprofitable (Jan 2025)
- corrected: same; article dated Jan 7, 2025 (not Jan 6)
- evidence: https://finance.yahoo.com/news/sam-altman-says-losing-money-080700756.html
- note: 'we are currently losing money on openai pro subscriptions! people use it much more than we expected'; personally chose the price confirmed.

### 24. Altman BlackRock summit: 'selling tokens', 'buy it from us on a meter'

- verdict: confirmed
- original: metered-token vision, stated 2026-03-13
- corrected: quotes confirmed; the remarks were made Wednesday Mar 11, 2026 (article dated Mar 13)
- evidence: https://www.aol.com/news/sam-altman-says-ai-eventually-152157395.html
- note: Yahoo (Mar 15) adds 'Too cheap to meter'. Neither piece mentions subscriptions or ending them.

### 25. GitHub premium requests enforced Jun 2025; $0.04 overage; model multipliers

- verdict: confirmed
- original: Pro 300, Pro+ 1,500; $0.04/request; GPT-4.5 50x, Opus 4 10x, Gemini 2.0 Flash 0.25x
- corrected: same
- evidence: https://docs.github.com/en/copilot/concepts/billing/copilot-requests
- note: Docs page confirms 300/1,500, $0.04, and the 'after June 1, 2026' legacy notice; the multipliers are not on that page (linked out) but The Register (Jun 20, 2025) states them and adds Business 300/user, Enterprise 1,000/user, Free 50, enforcement from Jun 18, 2025.

### 26. GitHub AI Credits: $0.01/credit; base+flex per plan

- verdict: confirmed
- original: Pro $10 -> 1,000+500; Pro+ $39 -> 3,900+3,100; Max $100 -> 10,000+10,000
- corrected: same
- evidence: https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-individuals
- note: '1 AI credit = $0.01 USD' and all six credit figures on the page; flex credits 'designed to adapt as the economics of AI evolve, including model pricing, new models, and improvements in efficiency'; metered on input/output/cached tokens per model. Prices $10/$39/$100 on the individual-plans page. No effective date on either docs page; Jun 1, 2026 comes from getdx. GitHub changelog entry still not located (label page lists no May-Jun 2026 items).

### 27. getdx: GitHub bill spikes; Claude Code $13/dev/active day, $150-250/dev/month, 90% under $30/day; blended $200-600

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://getdx.com/blog/ai-coding-assistant-pricing/
- note: Jun 12, 2026 article; all figures present, including Jun 1, 2026 token-billing date, $30/$70 promotional credits through Aug 2026, Pylon CEO attribution.

### 28. Replit: $0.25/checkpoint -> effort-based; simple edits ~$0.06; rollout to existing subs 2025-07-01; apology quote

- verdict: corrected
- original: $0.25 flat/checkpoint -> $0.06 to several $ per checkpoint
- corrected: $0.25 per checkpoint -> effort-based (post Jun 18, 2025, updated Jul 2): simple changes 'typically costing less than $0.25', complex tasks 'may cost more than $0.25'; existing Core/Teams subscribers 'starting July 1st'. The $0.06 figure and the 'fell short of standards' quote are not on the cited page.
- evidence: https://replit.com/blog/effort-based-pricing
- note: blog.replit.com 301-redirects to replit.com/blog. The apology/recap post was not located; treat $0.06 and the quote as unverified.

### 29. Epoch: 9x-900x/yr; GPQA GPT-4 level ~40x/yr; series endpoints

- verdict: confirmed
- original: MMLU $60 (Nov 2021) -> $0.07 (Oct 2024); GPQA GPT-4-Turbo $15 (Nov 2023) -> $0.18 (Feb 2025); HumanEval $37.50 (Mar 2023) -> $0.10 (Jul 2024)
- corrected: same
- evidence: https://epoch.ai/data-insights/llm-inference-price-trends
- note: 'ranging from 9x to 900x per year' and 'fell by 40x per year' both verbatim; the 40x series starts at GPT-4-0314 $37.50 (Mar 14, 2023); the GPT-4-Turbo $15 series is separate; caveat sentence present. Mar 12, 2025.

### 30. a16z LLMflation ~10x/yr; 1,000x over 3 years; 62x since GPT-4

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://a16z.com/llmflation-llm-inference-cost/
- note: 'cost is decreasing by 10x every year'; GPT-3 $60 (Nov 2021) -> Llama 3.2 3B $0.06 (Nov 2024); ~62x at MMLU 83. Nov 12, 2024.

### 31. Stanford AI Index 2025: GPT-3.5-level MMLU cost fell >280x

- verdict: confirmed
- original: $20.00/M (Nov 2022) -> $0.07/M (Oct 2024, Gemini-1.5-Flash-8B)
- corrected: 'dropped over 280-fold between November 2022 and October 2024' is on the landing page; the $20 -> $0.07 endpoints and the Gemini-1.5-Flash-8B attribution are not (they live in the report chapter, not fetched)
- evidence: https://hai.stanford.edu/ai-index/2025-ai-index-report
- note: Publication month not stated on the landing page.

### 32. Frontier output sticker not monotonic: fell 3x late 2025, doubled mid-2026

- verdict: confirmed
- original: GPT-4 $60 -> Opus 4/4.1 $75 -> Opus 4.5 $25 (Nov 2025) -> Opus 5 $25 -> GPT-5.5 $30 -> Fable 5/5.1 $50 (Jun 2026) -> GPT-6 Astra $50
- corrected: same prices; chronology note: Opus 5 ($5/$25) launched 2026-07-24, AFTER Fable 5 (Jun 2026), so the series is price-ordered, not date-ordered
- evidence: https://platform.claude.com/docs/en/about-claude/pricing
- note: Primary confirmations: Opus 4 and 4.1 $15/$75 (platform pricing; Opus 4.1 post says 'Pricing is the same as Opus 4'); Opus 4.5 'Pricing is now $5/$25' (anthropic.com/news/claude-opus-4-5, Nov 24, 2025); Opus 5 $5/$25 (anthropic.com/news/claude-opus-5, Jul 24, 2026); Fable 5/5.1 $10/$50; GPT-5.5 $5/$30 and Astra $10/$50 (developers.openai.com). GPT-4 $60 from Ding/a16z only.

### 33. Ethan Ding: token lengths doubling every six months; no flat price works; prisoner's dilemma; 10B tokens; $72/day

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://ethanding.substack.com/p/ai-subscriptions-get-short-squeezed
- note: Jul 31, 2025; all quoted phrases present ('doubling every six months', 'there is no flat subscription price that works in this new world', 'ten. billion. tokens', '$72 run. per day. per user', GPT-4 launched at $60).

### 34. Anthropic GM -94% (2024); 2025 50% -> ~40% on inference 23% over plan; 2028 77%

- verdict: confirmed
- original: 2024 -94%; 2025 50% -> ~40%; 2028 77%
- corrected: same
- evidence: https://www.investing.com/news/stock-market-news/anthropic-trims-profit-margin-outlook-as-ai-operating-costs-rise--the-information-4459316
- note: Investing.com (Jan 22, 2026): 'roughly a 40% gross profit margin in 2025, 10 percentage points below its previous internal estimate'; 'climbed about 23% more than anticipated'. TechCrunch (Nov 4, 2025) carries -94%, 50%, 77%, $70B/$17B 2028, and Claude Code ~$1B vs ~$400M in July. Both cite The Information (paywalled).

### 35. SemiAnalysis: inference GM 38% -> 70%+; ARR $9B -> $44B+; $0.99/M blended realized vs $5/$25

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://newsletter.semianalysis.com/p/ai-value-capture-the-shift-to-model
- note: May 1, 2026; all figures present. The $0.99 rests on ~300:1 input:output and >90% cache hit rate at $0.50 cached input - the two parameters a model needs to reproduce it.

### 36. Anthropic first operating profit Q2 2026; SpaceX ramp discount critique

- verdict: confirmed
- original: Q2 2026 revenue $10.9B (vs Q1 $4.8B), operating profit $559M; SpaceX $1.25B/month (~$15B/yr) reduced fee as it ramps
- corrected: same
- evidence: https://finance.yahoo.com/markets/stocks/articles/anthropic-track-first-profitable-quarter-124217577.html
- note: Yahoo (May 21, 2026; GuruFocus syndication citing FT) has $10.9B/$4.8B/$559M and '$15 billion a year' SpaceX. The $1.25B/month, 'as it ramps up' S-1 language, ~$45B/yr compute estimate and 'EBITDA profitable for a single quarter, on a non-GAAP basis' are in Zitron (May 21, 2026).

### 37. OpenAI GM 40% -> 33% -> ~39%, target 52%; compute margin 35% -> 70%; inference $8.4B -> $14.1B

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.useluminix.com/reports/company-overviews/openai-financial-fact-sheet-june-2026
- note: Secondary compilation; all figures present. Adds FY2025 revenue $13.07B, ~$34B expenses, ~$20.9B operating loss, ARR ~$25B by Feb 2026, Q1 2026 revenue $5.7B.

### 38. Revenue mix: Anthropic API 70-75%, subs 10-15%; run-rate $65B (Jul) vs $47B (May); OpenAI consumer ~60%, API 15-20%

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://sacra.com/c/anthropic/
- note: Sacra figures present, including gross-basis reseller accounting caveat. OpenAI mix confirmed on Luminix (~60% consumer, >40% enterprise, API 15-20%).

### 39. Claude Code run-rate ~$1B (Nov 2025) -> $2.5B (Feb 2026); enterprise > half

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://sacra.com/c/anthropic/
- note: 'more than doubled since the beginning of 2026' and 'over half of Claude Code revenue' present; Nov 2025 ~$1B corroborated by TechCrunch.

### 40. Cursor current terms: no markup on overages; $0.25/M Cursor Token Rate; Premium seat 5x usage at 3x price; Auto unlimited on paid plans

- verdict: confirmed
- original: Pro $20; Pro+ $60; Ultra $200; Teams $40/user; '$0.25 per million tokens'; Premium '5 times the usage of Standard at 3 times the price'; Auto unlimited
- corrected: same, except 'Auto mode unlimited' is contradicted by Cursor's own docs: 'All Auto modes bill at the list price of the model each request is routed to'
- evidence: https://www.lowcode.agency/blog/cursor-ai-pricing
- note: Cursor primary corroborates the rest: cursor.com/pricing shows Pro $20, Pro+ $60 ('3x Pro limits'), Ultra $200 ('20x Pro limits'); cursor.com/docs/account/pricing shows Standard $40/user/mo, Premium $120/user/mo with '5x the Standard limits', 'Cursor Token Rate of $0.25 per million tokens' on third-party models for Teams/Enterprise (first-party Grok/Composer exempt), and on-demand usage 'billed monthly at the same rates' as API. June 2026 Teams post and the '90% of teams' claim not located.

### 41. Google ended Gemini CLI free tier (1,000 req/day, 60/min) and Pro/Ultra access; moved to closed-source Antigravity CLI

- verdict: confirmed
- original: free tier ended 2026-06-18
- corrected: same; blog post is dated Jul 25, 2026 (not June)
- evidence: https://yaw.sh/blog/gemini-cli-not-free-alternatives/
- note: Page: '1,000 model requests per user per day and 60 per minute', ended Jun 18, 2026, removed 'free-of-charge use, Google AI Pro, Google AI Ultra, and Gemini Code Assist for individuals', replacement 'agy' 'prebuilt binary with no published source'. Secondary; Google primary not fetched.

### 42. Stripe survey via Lago: 56% hybrid, 38% usage; 21% higher growth; 92% repriced

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://getlago.com/blog/ai-pricing-models
- note: All four statistics and the 50,000-inference-calls sentence present verbatim; Lago is a billing vendor and the Stripe survey itself was not fetched.

### 43. Anthropic agentic-coding economics from provided context: caching 2.5-3.7x; Opus 5 ~$1.39/task default, ~$0.70 low-then-rerun

- verdict: unverifiable
- original: 2.5-3.7x from caching; $0.70-$1.39 per benchmark task
- corrected: n/a - the 'provided context' was not available to this checker and no public URL was cited; the cache multipliers underlying it are verifiable (cache read 0.1x, 0.025x on Fable 5.1; 5m write 1.25x; 1h write 2x)
- evidence: https://platform.claude.com/docs/en/about-claude/pricing
- note: Guessed Anthropic engineering URLs were not attempted because no URL was given; treat the 2.5-3.7x and per-task dollar figures as unverified.

## Additions

- Fable 5.1 cache reads are 0.025x base input ($0.25/MTok), not the 0.1x the researcher's modelling advice assumes; Fable 5 stays at 0.1x ($1/MTok). A cost model that prices Fable 5.1 cache hits at 0.1x overstates them 4x. https://platform.claude.com/docs/en/about-claude/pricing
- Claude 4.7 and later (and Mythos) use a newer tokenizer that 'produces approximately 30% more tokens for the same text' - any per-token comparison Opus 4.6 -> 4.7/4.8/5/Fable must inflate token counts ~1.3x before applying list prices. https://platform.claude.com/docs/en/about-claude/pricing
- Cache write multipliers: 5-minute 1.25x, 1-hour 2x base input; caching pays off after one read (5m) or two reads (1h). Agent loops using 1h caches pay 2x on every write. https://platform.claude.com/docs/en/about-claude/pricing
- Sonnet 5 is $2/$10 per MTok and its scheduled Sept 1, 2026 increase to $3/$15 was cancelled ('is now the standard price') - a mid-tier price cut that runs against the flagship-price-doubling narrative. https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic Fast mode (research preview) prices Opus 5 / Opus 4.8 at $10/$50 (2x standard), first-party API only, not with Batch; caching and data-residency multipliers stack on top. https://platform.claude.com/docs/en/about-claude/pricing
- US-only inference (inference_geo: 'us') on Claude 4.6+ is a 1.1x multiplier on all token categories; global routing is standard price. Marketplace channels (Claude Platform on AWS, Microsoft Foundry) bill in CCUs at $0.01 = usage rated at standard API rates, i.e. also at list. https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic 4.6+ models charge the full 1M context at standard rates (no long-context premium); OpenAI's API page carries a separate long-context tier for GPT-6 Astra (Fast long-context $40 in / $150 out vs $20 / $100 short-context Fast). https://developers.openai.com/api/docs/pricing
- OpenAI Fast mode is the one place ChatGPT credits are NOT at API list: credits apply 2.5x to Astra's standard rate while the API prices Fast at 2.0x, so Fast via subscription credits costs 25% more than API list at $0.04/credit. https://learn.chatgpt.com/docs/pricing and https://developers.openai.com/api/docs/pricing
- Codex per-5h message ranges for every model, not just Sol: Astra Plus 5-45 / Pro 5x 25-225 / Pro 20x 100-900; Terra 25-200 / 125-1,000 / 500-4,000; Luna 250-2,000 / 1,250-10,000 / 5,000-40,000; Business = Plus. GPT-5.6 Terra API $2/$0.20/$12 = 50/5/300 credits (also $0.04). https://learn.chatgpt.com/docs/pricing
- Cursor's own docs contradict 'Auto is unlimited on paid plans': 'All Auto modes bill at the list price of the model each request is routed to', and Teams/Enterprise third-party requests add a $0.25/MTok Cursor Token Rate (first-party Grok/Composer exempt). Premium seat is $120/user/mo vs Standard $40 with 5x limits. https://cursor.com/docs/account/pricing
- Opus 5 launched 2026-07-24 at $5/$25 as 'the new default model on Claude Max, and the strongest model on Claude Pro' - a second-tier flagship at half Fable's price arrived six weeks after Fable 5 went credits-only, which is the mechanism by which plans stay 'included' without the newest model. https://www.anthropic.com/news/claude-opus-5
- Weekly-cap ratio Max 20x vs Max 5x from Anthropic's own published hours: 240-480 vs 140-280 Sonnet hours = ~1.7x weekly capacity for 2x price; the 5x/20x multiples apply to the 5-hour window only. This is the included-value ratio the Kahn complaint turns on. https://techcrunch.com/2025/07/28/anthropic-unveils-new-rate-limits-to-curb-claude-code-power-users/
- Claude Managed Agents add a non-token line: $0.08 per session-hour of 'running' time on top of standard token rates; Batch discount does not apply to sessions. Web search $10/1,000 searches; code execution 1,550 free container-hours/month then $0.05/container-hour. https://platform.claude.com/docs/en/about-claude/pricing
- GitHub legacy premium-request enforcement began Jun 18, 2025 with Business 300/user and Enterprise 1,000/user (Free 50) - needed to compute business-seat included value before and after the Jun 1, 2026 AI-credit switch. https://www.theregister.com/2025/06/20/github_begins_enforcing_premium_request/
- getdx also reports Pylon's Anthropic bill rising from $400K to $1.4M/yr 'due to tier changes rather than usage growth alone', and a median 7.76% PR-throughput gain across 400+ organisations - the denominator for any ROI-per-token figure. https://getdx.com/blog/ai-coding-assistant-pricing/
- SemiAnalysis's $0.99/MTok blended realized price assumes ~300:1 input:output tokens and >90% cache hit rate at $0.50 cached input on Opus 4.7 - the two parameters to expose in the model rather than the $0.99 itself. https://newsletter.semianalysis.com/p/ai-value-capture-the-shift-to-model
- OpenAI FY2025 audited: revenue $13.07B, expenses ~$34B, operating loss ~$20.9B; ARR ~$25B by Feb 2026; Q1 2026 recognized revenue $5.7B. https://www.useluminix.com/reports/company-overviews/openai-financial-fact-sheet-june-2026
- claude.com/pricing currently shows Team Standard and Team Premium 'No' for Fable and Enterprise 'Yes' (sales-assisted and self-serve) - the Team Premium '50% of weekly' from digitalapplied is not reflected on Anthropic's own page today. https://claude.com/pricing
- Not found after one more attempt each: Bessemer AI Pricing Playbook (bvp.com/atlas/the-ai-pricing-playbook and /ai-pricing-playbook both 404), GitHub changelog entry for AI credits (label page lists no May-Jun 2026 items), Anthropic Max launch post (claude.com/blog/max-plan 404), Anthropic Fable 5 launch post (anthropic.com/news/claude-fable-5, /fable-5, /introducing-claude-fable-5 all 404), Cursor Teams June 2026 post (cursor.com/blog/teams-pricing 404), Kahn docket (CourtListener and Justia 403), OpenAI help-center credit price (article defers to learn.chatgpt.com, which publishes none). WebSearch budget was exhausted for this session, so these were URL guesses only.
