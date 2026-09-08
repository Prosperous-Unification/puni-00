# Thesis: AI labs will soon price coding subscriptions close to their API usage prices — evidence for and against (analyst, investor, executive, rate-limit, unit-economics, and precedent angles)

## Summary

Convergence has already happened at the margin and has not happened at the core. Every marginal token beyond a plan is now sold at API list: Anthropic's usage credits are "billed at standard API rates" (Pro/Max, support article), Enterprise is "$20/seat + usage at API rates" (claude.com/pricing, unbundled Nov 2025–Mar 2026), third-party harnesses on Pro/Max were pushed to per-token billing on 2026-04-04, OpenAI's Codex credits map to API list at exactly $0.04/credit for all four current models (derived), Cursor sells "$20 of frontier model usage per month at API pricing" with no markup, and GitHub moved to token-metered $0.01 credits on 2026-06-01. The strongest case FOR full convergence: the newest flagship was pulled out of flat plans within two weeks of launch (Fable 5 credits-only on Pro from 2026-07-20; 50% of weekly on Max), flagship sticker prices reversed upward (Opus 4.5 $25/M out in Nov 2025 → Fable 5 $50/M in Jun 2026; GPT-5.5 $30 → GPT-6 Astra $50), task token counts keep growing (Ding: doubling every six months), the labs' own words point at metering (Altman 2026-03-13: "selling tokens ... buy it from us on a meter"; Cherny: "our subscriptions weren't built for the usage patterns of these third-party tools"), and both labs missed gross-margin plans on compute (Anthropic 50%→~40% for 2025 with inference 23% over plan; OpenAI 33% in 2025 vs 46% target), while a class action (Kahn v. Anthropic, 3:26-cv-05763) is now testing whether "5x/20x" flat marketing can survive weekly caps. The strongest case AGAINST: every tightening has been reversed or softened the moment compute landed (Claude Code 5-hour limits doubled and peak-hour throttling removed on 2026-05-06 after the 300 MW SpaceX deal; Fable 5 kept at 50% for Max after two backlash extensions; Codex limits doubled Feb 2026 and Codex given to Free/Go; ChatGPT Go at $8; Copilot Max includes $200 of nominal credits for $100), realized cost per token is far below sticker (SemiAnalysis: blended $0.99/M realized vs $5/$25 sticker, inference gross margin 38%→70%+; Anthropic's own caching cuts agent-loop cost 2.5–3.7x), consumer subscriptions are only 10–15% of Anthropic revenue so they can run as acquisition loss-leaders (OpenAI at ~60% consumer still launched cheaper tiers), and every executive framing of a restriction has been "temporary until capacity allows". The observable signal that decides it: whether the next flagship (post-Fable 5 / GPT-6 Astra class) launches credits-only on Pro from day one and stays there through a full model generation, versus being restored to full plan inclusion within weeks as in May–July 2026; secondary signals are the included-value-to-price ratio at API rates (GitHub now ~1.5–2.0x, Cursor 1.0x, Claude Max community-estimated 5–20x) drifting toward 1.0x, and the outcome of the Kahn motion to dismiss (hearing 2026-11-06). Evidence-weighted view: the industry has settled on hybrid, not convergence — a flat base sized to the median user (getdx: 90% of Claude Code users under $30/active day, $150–250/developer/month) with every token above it, every enterprise token, every third-party token, and every day-one flagship token at API list; the included allowance contracts when compute is scarce and expands when it is not, so "close to API prices" is true for the marginal token and for the 24/7 agent loop, and false for the median subscriber. For a software-factory cost model: price marginal and enterprise tokens at API list (cache reads at 0.1x, batch at 0.5x), treat subscription-included usage as a weekly-capped subsidy worth several times the plan price at median use, and assume that subsidy is not available for the newest flagship in its first weeks.

## Facts

### 1. Cursor moved Pro from request-based to compute-based limits and launched Ultra: 'at least $20 of model inference at API prices per month' on Pro; Ultra '$200 / mo plan with 20x more usage than Pro', offered because power users wanted 'more predictability than usage-based pricing would offer'

- value: Pro $20 = $20 of inference at API prices; Ultra $200 = 20x Pro
- confidence: quoted
- source: https://cursor.com/blog/new-tier (2025-06-16)
- note: Also credits 'multi-year partnerships' with OpenAI, Anthropic, Google, and SpaceXAI as what made Ultra possible; existing users could keep the old 500-request system. Both directions in one post: usage-based Pro plus a larger flat tier.

### 2. Cursor's apology post: Pro was 'limit of 500 requests per month, with Sonnet models costing two requests' and became '$20 of frontier model usage per month at API pricing'; stated reason 'New models can spend more tokens per request on longer-horizon tasks...API-based pricing is the best way to reflect that'; refunds for unexpected charges June 16–July 4

- value: 500 requests/mo → $20/mo at API pricing; 'the hardest requests cost an order of magnitude more than simple ones'
- confidence: quoted
- source: https://cursor.com/blog/june-2025-pricing (2025-07-04)
- note: Admits 'We were not clear that unlimited usage was only for Auto and not all other models'. First clear lab-adjacent move from flat to API-priced pool.

### 3. Anthropic introduced weekly rate limits on Pro and Max (effective 2025-08-28) targeting users running Claude Code 'continuously in the background, 24/7' plus account sharing/resale; Max subscribers can buy more 'at standard API rates'

- value: Pro 40–80 h/wk Sonnet 4; Max $100 140–280 h Sonnet + 15–35 h Opus 4; Max $200 240–480 h Sonnet + 24–40 h Opus 4; 'less than 5% of subscribers' affected
- confidence: quoted
- source: https://techcrunch.com/2025/07/28/anthropic-unveils-new-rate-limits-to-curb-claude-code-power-users/ (2025-07-28)
- note: Announced 2025-07-28, effective 2025-08-28. The API-rate overflow path for subscriptions dates from here.

### 4. Anthropic launched the Max plan with 5x and 20x Pro usage

- value: $100/mo (5x Pro) and $200/mo (20x Pro)
- confidence: quoted
- source: https://techcrunch.com/2025/04/09/anthropic-rolls-out-a-200-per-month-claude-subscription (2025-04-09)
- note: Taken from search-result summaries of TechCrunch/GIGAZINE coverage; the article itself was not fetched. Anthropic's own launch post 404s at its redirect (claude.com/blog/max-plan).

### 5. Claude Code on Team/Enterprise (premium seats) with overflow at API rates: 'admins can enable extra usage for individual users at standard API rates' with org- and user-level spend limits

- value: seat + extra usage at standard API rates
- confidence: quoted
- source: https://www.anthropic.com/news/claude-code-on-team-and-enterprise (2025-08-20)
- note: Post does not print seat prices; framed as 'Claude seats include enough usage for a typical workday'. Seat-plus-metered hybrid begins here for business plans.

### 6. Anthropic support article: usage credits on 'Pro, Max 5x, and Max 20x' are 'billed at standard API rates'

- value: standard API rates; $2,000/day redemption limit
- confidence: quoted
- source: https://support.claude.com/en/articles/12429409 (unknown (page says 'Updated over a month ago' as of 2026-09-08))
- note: No separate overflow price exists; credits drain at the per-token API rate.

### 7. Current claude.com/pricing: Enterprise is '$20/seat. Usage cost scales with model and task' — 'Seat price + usage at API rates'; Pro and Team standard seats get Fable 5.1 only via usage credits; Team premium seat is 5x a standard seat

- value: Pro $20/mo ($17 annual); Max from $100 (5x or 20x Pro); Team standard $20–25/seat; Team premium $100–125/seat (5x standard); Enterprise $20/seat + API-rate usage
- confidence: quoted
- source: https://claude.com/pricing (2026-09-08 (fetched))
- note: Fable 5.1 listed as 'Usage credits' on Pro, Max, and Team standard in the fetched page; Max/premium carve-out is described in the Fable 5 timeline facts below.

### 8. Anthropic unbundled tokens from Enterprise seats: renewals moved to usage-based billing from Nov 2025, new Enterprise on metered billing from Feb 2026, hard cutoff for legacy bundled-token plans 2026-03-08; seat fee fell to ~$20 with all tokens at standard API rates

- value: $20/seat base + metered usage at public API rates (e.g. Sonnet 4.6 $3/$15)
- confidence: quoted
- source: https://groundy.com/articles/anthropic-ends-flat-fee-enterprise-claude-above-150-seats-and-forces-per-token/ (2026 (undated page; cites May 2026 rates))
- note: Secondary source citing Gizmodo and The Register reporting; consistent with claude.com/pricing's 'Seat price + usage at API rates'. Team plan ceiling 150 seats; Enterprise from 20 seats.

### 9. On 2026-04-04 (noon PT) Anthropic began billing third-party tools (Cline, Roo Code, aider, OpenCode, OpenClaw) on Pro/Max per token via 'extra usage' instead of the flat subscription; one-time credit ($100 Pro / $200 Max) claimable until 2026-04-17; up to 30% off prepaid bundles

- value: Opus 4.6 $5/$25 per MTok, Sonnet 4.6 $3/$15 per MTok on the subscription path
- confidence: quoted
- source: https://relayplane.com/blog/anthropic-extra-usage-third-party-tools (2026-04 (post-2026-04-04))
- note: Sequence per fusion94.org: Jan 2026 OAuth block reversed within days; Feb 2026 ToS restricts OAuth to Claude Code and claude.ai; Apr 4 enforcement. Boris Cherny: 'our subscriptions weren't built for the usage patterns of these third-party tools' and 'Capacity is a resource we manage thoughtfully and we are prioritizing our customers using our products and API' (https://fusion94.org/blog/2026-04-04-anthropic-kills-claude-subscriptions-for-third-party-tools/).

### 10. Anthropic reduced Claude Code 5-hour quotas during weekday peak hours in March 2026 (engineer Thariq Shihipar: ~7% of users affected) and on 2026-03-31 said 'people are hitting usage limits in Claude Code way faster than expected. We're actively investigating... it's the top priority for the team'

- value: peak-hours reduction ~7% of users; off-peak 2x promo ended 2026-03-28; user reports of Max 5x exhausted in 1 hour
- confidence: quoted
- source: https://www.theregister.com/2026/03/31/anthropic_claude_code_limits/ (2026-03-31)
- note: A developer claimed two prompt-caching bugs inflated costs 10–20x; unverified. Tightening event driven by capacity, framed as a bug/priority rather than pricing.

### 11. Anthropic doubled Claude Code five-hour rate limits for Pro, Max, Team and seat-based Enterprise, removed the peak-hours reduction for Pro/Max, and raised Opus API rate limits, tied to a SpaceX Colossus 1 compute deal

- value: 2x five-hour limits; '>300 megawatts of new capacity (over 220,000 NVIDIA GPUs) within the month'
- confidence: quoted
- source: https://www.anthropic.com/news/higher-limits-spacex (2026-05-06)
- note: Weekly caps unchanged per explainx timeline. Strongest loosening event; explicitly compute-driven.

### 12. Anthropic ran a temporary promotion doubling 5-hour limits off-peak and on weekends for Free, Pro, Max, Team

- value: 2x off-peak, 2026-03-13 to 2026-03-28
- confidence: quoted
- source: https://explainx.ai/blog/claude-usage-limits-2026-timeline-explained (2026 (timeline page))
- note: Secondary timeline; corroborated by The Register 2026-03-31 ('promotion ending March 28').

### 13. Anthropic's own Fable 5 redeployment post: 'Fable 5 will be included for up to 50% of weekly usage limits through July 7, after which it will be available via usage credits'; standard Enterprise seats get no included allowance, premium seats included through July 7 then credits

- value: 50% of weekly limits through 2026-07-07, then usage credits; global availability from 2026-07-01
- confidence: quoted
- source: https://www.anthropic.com/news/redeploying-fable-5 (2026-06-30)
- note: Post gives no reason for the transition and no restoration promise. Context: Fable 5 launched 2026-06-09 included on all paid plans; access suspended 2026-06-12 under a US export-control directive; complimentary window originally closed 2026-06-23 (per claudefa.st timeline, secondary).

### 14. Fable 5 included access was extended twice after backlash (to 2026-07-12, then 2026-07-19); on 2026-07-18 Anthropic set the permanent split from 2026-07-20: Max and Team Premium keep Fable 5 at 50% of weekly limits, Pro and Team Standard move to usage credits with a one-time $100 credit; Claude Code 50% higher weekly limits through 2026-08-19

- value: Max/premium: 50% of weekly included permanently; Pro/standard: credits + $100 one-time; Claude Code +50% weekly through 2026-08-19
- confidence: quoted
- source: https://www.digitalapplied.com/blog/anthropic-fable-5-access-extended-july-12-2026 (2026-07 (post-2026-07-18))
- note: Secondary, attributing to @claudeai X posts and support docs; Android Authority (2026-07-07, https://www.androidauthority.com/claude-fable-5-free-extension-3685103/) confirms the first extension 'just hours before' cutoff and that Anthropic 'hopes to eventually restore Fable 5 as a standard benefit once capacity permits'. Claude Code lead engineer (@trq212): 'we aim to restore Fable as a standard part of our subscriptions as soon as capacity allows'.

### 15. Fable 5 API price is double Opus 5 and above OpenAI's GPT-5.5: Jérôme Marin reported the model 'removed from paid subscriptions (including $200/month plan) effective June 23, 2026' with usage billed at $50/M output vs $25 for the previous model and $30 for GPT-5.5; Anthropic 'aims to bring Fable 5 back into subscription plans as quickly as [it] can'

- value: $10/$50 per MTok in/out (cache read $1/M) vs Opus 5 $5/$25; GPT-5.5 $5/$30
- confidence: quoted
- source: https://cafetechinenglish.substack.com/p/anthropic-shakes-up-its-pricing-strategy (2026-06-11)
- note: Marin attributes the change to 'infrastructure constraints and unpredictable demand from autonomous AI agents, particularly in coding'. Fable 5.1 list prices ($10/$50, cache read $0.25) match the provided context.

### 16. Class action Kahn v. Anthropic alleges Max 5x delivers ~3.5x Pro and Max 20x delivers 6–8x Pro because multipliers apply to the 5-hour window while weekly caps gate sustained coding; plaintiff used 15% of weekly quota in one 5-hour session on Max 20x

- value: Case 3:26-cv-05763 (N.D. Cal.), filed 2026-06-14; motion to dismiss 2026-08-19; hearing 2026-11-06
- confidence: quoted
- source: https://www.explainx.ai/blog/anthropic-claude-max-lawsuit-usage-limits-2026 (2026-09 (updated))
- note: Engadget (2026-06-15, https://www.engadget.com/2194626/anthropic-hit-with-lawsuit-over-its-claude-max-usage-limits/) confirms filing, DC plaintiff, class of US Max buyers since April 2025, 'Anthropic declined to comment'. Multiples are allegations in a complaint, not findings.

### 17. OpenAI added a $100 ChatGPT Pro 5x tier alongside $200 Pro 20x, with Altman: 'We are launching a $100 ChatGPT Pro tier by very popular demand', and said it was 'rebalancing Codex usage in [ChatGPT] Plus to support more sessions throughout the week, rather than longer sessions in a single day'; Pro 5x carried a temporary 2x boost ending 2026-05-31

- value: Plus $20; Pro 5x $100; Pro 20x $200
- confidence: quoted
- source: https://venturebeat.com/orchestration/openai-introduces-chatgpt-pro-usd100-tier-with-5x-usage-limits-for-codex (2026-04-09)
- note: The Plus 'rebalancing' is a tightening of long single-day agent sessions inside a flat plan; the $100 tier and 2x boost are loosening.

### 18. OpenAI moved Codex on Plus, Pro and Business from per-message to token-based credit billing on 2026-04-02 ('credits are just tokens wearing a costume'); one credit works out to roughly $0.04 by cross-referencing GPT-5.3-Codex credits against its API price

- value: ~$0.04/credit (derived by CloudZero); GPT-5.3-Codex 43.75 credits/M input ≈ $1.75/M = API price
- confidence: quoted
- source: https://www.cloudzero.com/blog/openai-codex-pricing/ (2026-07-27 (updated 2026-09-04))
- note: OpenAI's own page states 'Credit purchase prices and applicable discounts depend on your plan or agreement' and publishes no dollar price per credit (https://learn.chatgpt.com/docs/pricing). Legacy Enterprise/Edu followed 2026-04-23 per search summaries (not primary-verified).

### 19. OpenAI's Codex rate card (credits per 1M tokens) and API list prices imply credits are priced at exactly API list for every current model at $0.04/credit

- value: GPT-5.6 Sol 100/10/500 credits vs API $4.00/$0.40/$20.00 (→ $0.04 each); GPT-6 Astra 250/25/1,250 vs $10/$1/$50 (→ $0.04); GPT-5.6 Luna 5/0.5/30 vs $0.20/$0.02/$1.20 (→ $0.04); GPT-5.5 125/12.5/750 vs $5/$0.50/$30 (→ $0.04)
- confidence: derived
- source: https://learn.chatgpt.com/docs/pricing (2026-09-08 (fetched))
- note: Arithmetic: API $/M ÷ credits/M = $0.04 in all twelve cells (e.g. $20/500 = $0.04; $50/1,250 = $0.04; $1.20/30 = $0.04). API prices from https://developers.openai.com/api/docs/pricing (fetched 2026-09-08; batch/flex 50% off). Overflow on ChatGPT plans therefore equals API list, with 'Fast mode' at 2.5x Astra's standard rate.

### 20. Codex included usage on ChatGPT plans is quoted as message ranges per 5-hour window plus a separate weekly cap

- value: GPT-5.6 Sol: Plus 10–100, Pro 5x 50–500, Pro 20x 200–2,000 msgs/5h; Go $8; Business $20–25/user; 'GPT-5.6 usage averages 5-30 credits per message'
- confidence: quoted
- source: https://learn.chatgpt.com/docs/pricing (2026-09-08 (fetched))
- note: At $0.04/credit, 5–30 credits/message = $0.20–$1.20/message; Plus's 10–100 Sol messages/5h is roughly $2–$120 of API-equivalent per window (derived, range too wide to price precisely).

### 21. With the Codex app launch OpenAI doubled Codex rate limits on Plus, Pro, Business, Enterprise and Edu and included Codex with ChatGPT Free and Go 'for a limited time'; Codex usage doubled since GPT-5.2-Codex (mid-Dec 2025) and >1M developers used it in the prior month

- value: 2x rate limits on all paid plans; Free/Go inclusion (limited time)
- confidence: quoted
- source: https://openai.com/index/introducing-the-codex-app/ (2026-02 (Windows update 2026-03-04))
- note: From search-result summary; the OpenAI page returned 403 on fetch. Loosening event. CloudZero (2026-09-04) says Free/Go users still get GPT-5.6 Terra in Codex 'per OpenAI's July announcement'.

### 22. OpenAI launched ChatGPT Go globally at $8/month and cut ChatGPT Business by $5

- value: Go $8/mo from 2026-01-16; Business $20 annual / $25 monthly per seat from 2026-04-02 (down from $25/$30)
- confidence: quoted
- source: https://www.cloudzero.com/blog/how-much-does-chatgpt-cost/ (2026-09-04 (updated))
- note: Secondary compilation; both are moves toward cheaper flat plans.

### 23. Sam Altman said OpenAI was losing money on the $200 ChatGPT Pro plan: 'people use it much more than we expected'; he personally chose the price

- value: $200/mo Pro unprofitable (Jan 2025)
- confidence: quoted
- source: https://finance.yahoo.com/news/sam-altman-says-losing-money-080700756.html (2025-01-06)
- note: Earliest lab-CEO admission that a flat power-user tier is underwater.

### 24. Sam Altman at the BlackRock Infrastructure Summit: 'Fundamentally our business and I think the business of every other model provider is going to look like selling tokens' and 'We see a future where intelligence is a utility like electricity or water and people buy it from us on a meter'

- value: metered-token vision, stated 2026-03-13
- confidence: quoted
- source: https://www.aol.com/news/sam-altman-says-ai-eventually-152157395.html (2026-03-13)
- note: Yahoo Finance's write-up (2026-03-15, https://finance.yahoo.com/news/ai-utility-bill-sam-altman-180219388.html) adds his 'too cheap to meter' aspiration. Neither piece contains a statement about ending subscriptions.

### 25. GitHub Copilot began enforcing premium requests on 2025-06 with per-request overage; multipliers by model

- value: Pro 300 premium requests/mo, Pro+ 1,500; overage $0.04/request; GPT-4.5 50x, Opus 4 10x, Gemini 2.0 Flash 0.25x multipliers
- confidence: quoted
- source: https://docs.github.com/en/copilot/concepts/billing/copilot-requests (2026 (page now marked legacy; enforcement covered by The Register 2025-06-20))
- note: Page 'only applies to ... subscribers on an existing annual plan who remained on legacy premium request-based billing after June 1, 2026' — which dates the replacement. The Register: https://www.theregister.com/2025/06/20/github_begins_enforcing_premium_request/

### 26. GitHub replaced premium requests with token-metered 'AI Credits' priced per model and per token; extra credits at a fixed rate

- value: 1 AI credit = $0.01; Copilot Pro $10 → 1,000 base + 500 flex = 1,500 credits; Pro+ $39 → 3,900 + 3,100 = 7,000; Copilot Max $100 → 10,000 + 10,000 = 20,000
- confidence: quoted
- source: https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-individuals (2026-09-08 (fetched; effective 2026-06-01 per getdx))
- note: Derived ratio of included nominal credit value to plan price: Pro $15/$10 = 1.5x, Pro+ $70/$39 = 1.8x, Max $200/$100 = 2.0x. Flex credits are described as designed to 'adapt as the economics of AI evolve' — an explicit dial for shrinking the subsidy. Plan prices from https://docs.github.com/en/copilot/concepts/billing/individual-plans.

### 27. After GitHub's token billing switch some bills rose sharply; Claude Code enterprise deployments cluster well below API-equivalent of a Max plan

- value: GitHub: 'from $29 to $750 a month', 'from $50 to $3,000'; Claude Code '$13/developer/active day and $150–250/developer/month', '90% of users below $30/active day'; blended $200–$600/month per engineer across tools
- confidence: quoted
- source: https://getdx.com/blog/ai-coding-assistant-pricing/ (2026-06-12)
- note: Secondary industry compilation citing Pylon CEO and DX staff; promotional credits ($30/user Business, $70/user Enterprise through Aug 2026) mask GitHub's true cost. The $13/active-day median is the key number for why a $100–200 flat plan is gross-margin positive on typical users.

### 28. Replit replaced its flat $0.25-per-checkpoint Agent pricing with effort-based pricing (rolled to existing subscribers 2025-07-01); simple edits fell to ~$0.06 while large-context tasks rose to dollars per checkpoint; Replit: 'This model best serves users long-term, but our launch fell short of standards'

- value: $0.25 flat/checkpoint → $0.06 to several $ per checkpoint
- confidence: quoted
- source: https://blog.replit.com/effort-based-pricing (2025-06 (recap post 2025-07))
- note: From search summaries of Replit's two posts plus The Register 2025-09-18 on Agent 3 overruns; posts not fetched directly. Same shape as Cursor: flat → cost-aligned, with a public apology.

### 29. Epoch AI: inference price to reach a fixed benchmark level fell 9x–900x per year depending on task; GPT-4-level on GPQA Diamond fell ~40x/yr

- value: MMLU GPT-3 level $60/M (Nov 2021) → $0.07/M (Oct 2024); GPQA GPT-4-Turbo level $15 (Nov 2023) → $0.18 (Feb 2025); HumanEval $37.50 (Mar 2023) → $0.10 (Jul 2024)
- confidence: quoted
- source: https://epoch.ai/data-insights/llm-inference-price-trends (2025-03-12)
- note: Caveat in source: 'The fastest price drops in that range have occurred in the past year, so it's less clear that those will persist.'

### 30. a16z 'LLMflation': for equivalent performance, LLM cost falls ~10x per year

- value: 1,000x over 3 years at GPT-3/MMLU-42 level ($60/M Nov 2021 → $0.06/M Nov 2024); ~62x since GPT-4 launch at MMLU-83 level
- confidence: quoted
- source: https://a16z.com/llmflation-llm-inference-cost/ (2024-11-12)
- note: Faster than Moore's-law-era compute cost decline per the source.

### 31. Stanford AI Index 2025: cost of GPT-3.5-level MMLU performance fell >280x

- value: $20.00/M (Nov 2022) → $0.07/M (Oct 2024, Gemini-1.5-Flash-8B)
- confidence: quoted
- source: https://hai.stanford.edu/ai-index/2025-ai-index-report (2025-04)
- note: From search summary of the report; chapter PDF not fetched.

### 32. Frontier (top-tier) output sticker price is not monotonic: it fell 3x in late 2025 and then doubled in mid-2026

- value: GPT-4 $60/M out (Mar 2023) → Opus 4/4.1 $75 → Opus 4.5 $25 (Nov 2025) → Opus 5 $25 → GPT-5.5 $30 → Fable 5/5.1 $50 (Jun 2026) → GPT-6 Astra $50
- confidence: derived
- source: https://developers.openai.com/api/docs/pricing (2026-09-08 (fetched))
- note: Series assembled from: a16z/Ethan Ding (GPT-4 $60), claudefa.st Opus 4.5 guide (Opus 4/4.1 $15/$75 → 4.5 $5/$25, Nov 2025), provided context (Opus 5 $5/$25; Fable 5.1 $10/$50), Marin 2026-06-11 (Fable 5 $50; GPT-5.5 $30), OpenAI pricing page (Astra $10/$50). Fixed-capability prices fall 10–40x/yr while the price of 'the best model' has roughly returned to 2023 levels.

### 33. Ethan Ding ('tokens are getting more expensive'): frontier prices stay near the top tier while users always migrate to the newest model; task token length 'doubling every six months'; 'there is no flat subscription price that works in this new world'; usage-based pricing is a prisoner's dilemma because a VC-funded rival offers unlimited for $20

- value: Claude Code unlimited-tier user consumed 'ten. billion. tokens' in a month; projected 2027 deep-research cost '~$72 run. per day. per user'
- confidence: quoted
- source: https://ethanding.substack.com/p/ai-subscriptions-get-short-squeezed (2025-07-31)
- note: Most-cited analyst framing of the FOR case; predates the 2026 events that partly confirmed it (third-party harness billing, Fable 5 credits-only).

### 34. Anthropic gross margin: -94% in 2024; 2025 projected at 50% (Nov 2025) then revised to ~40% (Jan 2026) because inference costs on Google/Amazon cloud ran ~23% above plan; 2028 target 77%

- value: 2024 -94%; 2025 50% → ~40%; 2028 77%
- confidence: quoted
- source: https://www.investing.com/news/stock-market-news/anthropic-trims-profit-margin-outlook-as-ai-operating-costs-rise--the-information-4459316 (2026-01-22)
- note: Both figures originate with The Information (paywalled, 403 on fetch); 2024/2025/2028 figures via TechCrunch 2025-11-04 (https://techcrunch.com/2025/11/04/anthropic-expects-b2b-demand-to-boost-revenue-to-70b-in-2028-report/), which also reported Claude Code 'close to generating $1 billion in annualized revenue' vs ~$400M in July 2025 and 2028 revenue up to $70B.

### 35. SemiAnalysis: Anthropic's inference-infrastructure gross margin rose from 38% to over 70% while ARR went from $9B to $44B+; realized blended price far below sticker

- value: inference GM 38% → 70%+; blended ~$0.99/MTok realized on Opus 4.7 vs $5/$25 sticker (cached input $0.50/M); ~5B tokens/month per SemiAnalysis employee, $10.95M annual spend rate
- confidence: quoted
- source: https://newsletter.semianalysis.com/p/ai-value-capture-the-shift-to-model (2026-05-01)
- note: 'The AI labs are capturing all the value now, from almost none last year.' The $0.99 blended figure is SemiAnalysis's own workload; it shows that heavy cache hit rates make the lab's realized price ~5x below input list and ~25x below output list, which is the mechanism that lets a flat plan be cheap to serve.

### 36. Anthropic projected its first operating profit in Q2 2026 (WSJ, 2026-05-20); critics attribute part of it to a SpaceX compute ramp discount

- value: Q2 2026 revenue $10.9B (vs Q1 $4.8B), operating profit $559M; SpaceX deal $1.25B/month (~$15B/yr) 'when it'll have a reduced fee as it ramps up'
- confidence: quoted
- source: https://finance.yahoo.com/markets/stocks/articles/anthropic-track-first-profitable-quarter-124217577.html (2026-05-21)
- note: Zitron (2026-05-21, https://www.wheresyoured.at/anthropics-profitability-swindle/) estimates ~$45B/yr annualized compute and calls the profit non-GAAP; both are investor-reporting angles on whether cost-to-serve is falling structurally or temporarily.

### 37. OpenAI gross margin fell in 2025 and is recovering; 'compute margin' on paying segments is far higher; inference spend keeps rising

- value: GM 40% (2024) → 33% (2025, vs 46% internal target) → ~39% (Q1 2026), target 52% end-2026; compute margin ~35% (Jan 2024) → 70% (Oct 2025); inference $8.4B (2025) → $14.1B (2026 proj.)
- confidence: quoted
- source: https://www.useluminix.com/reports/company-overviews/openai-financial-fact-sheet-june-2026 (2026-06)
- note: Secondary compilation citing Fortune/FT (leaked audited 2025 financials, June 2026), The Information via Reuters (2026-03-05, 2026-05-22), and SaaStr (2025-12-22, https://www.saastr.com/have-ai-gross-margins-really-turned-the-corner-...). Zitron's document-based figures put inference at $3.77B (CY2024) and $8.67B (through Q3 2025) (https://www.wheresyoured.at/oai_docs/).

### 38. Revenue mix: Anthropic is API-dominant, OpenAI is consumer-dominant

- value: Anthropic: API 70–75%, subscriptions 10–15%, rest reserved capacity; run-rate $65B (Jul 2026) vs $47B (May 2026). OpenAI: consumer ~60% early 2026 (from ~75% in 2024), API 15–20%
- confidence: quoted
- source: https://sacra.com/c/anthropic/ (2026-07)
- note: Sacra estimates; OpenAI mix from Luminix citing Bloomberg/CFO and Sacra. Sacra notes Anthropic books cloud-reseller revenue gross, inflating top line vs peers. Implication: Anthropic can treat subscriptions as a 10–15% acquisition channel; OpenAI cannot.

### 39. Claude Code run-rate revenue trajectory; enterprise is over half of it

- value: ~$1B annualized (Nov 2025) → $2.5B (Feb 2026); 'more than doubled since beginning of 2026'; enterprise > half of Claude Code revenue
- confidence: quoted
- source: https://sacra.com/c/anthropic/ (2026-07)
- note: Nov 2025 figure corroborated by TechCrunch/The Information 2025-11-04. Search summaries also cite >$500M run-rate in Sep 2025 (Anthropic statement not fetched).

### 40. Community subsidy anecdote: one developer used ~10B tokens over eight months on a $100/month Max plan, ~$15,000 at API rates for $800 paid

- value: ~18.75x API-equivalent value to price (derived: $15,000 / $800)
- confidence: estimated
- source: https://blog.kilo.ai/p/anthropic-doesnt-want-your-subscription (2026-04-14)
- note: Unverifiable single-user anecdote repeated across blogs; useful only as an upper-bound illustration of how far the included allowance can sit above plan price for a 24/7 user. Kilo's post also frames the 2026-04-04 change as 'Claude subscriptions are now only available for use in Claude Code'.

### 41. Cursor current terms: overages not marked up; Teams/Enterprise carry a per-token platform fee; June 2026 Teams update added a Premium seat

- value: Pro $20 = $20 credits; Pro+ $60; Ultra $200; Teams $40/user; 'Cursor does not mark up overages'; '$0.25 per million tokens' Cursor Token Rate on third-party models for Teams/Enterprise; Premium seat '5 times the usage of Standard at 3 times the price'; Auto mode unlimited on paid plans
- confidence: quoted
- source: https://www.lowcode.agency/blog/cursor-ai-pricing (2026-09-03)
- note: Secondary; Cursor's own June 2026 Teams post (and its reported 'lower costs for 90% of teams' claim) was not fetched. Cursor is the cleanest 1.0x case: included value equals price at API rates, with the subsidy confined to Auto.

### 42. Google discontinued Gemini CLI's free tier (1,000 requests/day, 60/min with a personal Google account) and its Pro/Ultra tiers, moving users to a closed-source Antigravity CLI

- value: free tier ended 2026-06-18
- confidence: quoted
- source: https://yaw.sh/blog/gemini-cli-not-free-alternatives/ (2026-06)
- note: Secondary blog from search summary; Google primary not fetched. Removal of the most generous free coding-agent tier is a tightening event outside Anthropic/OpenAI.

### 43. Stripe survey cited by Lago: most AI companies already run hybrid pricing and nearly all have repriced

- value: 56% hybrid, 38% pure usage-based; hybrid reports 21% higher median growth; 92% of AI companies that charged for usage later adjusted pricing
- confidence: quoted
- source: https://getlago.com/blog/ai-pricing-models (2026-06-01 (updated 2026-07))
- note: Lago is a billing vendor; the underlying Stripe survey was not fetched. Argument: seat pricing 'breaks' when 'An engineer running 50,000 inference calls a day consumes vastly more infrastructure than a manager who logs in weekly, at the same seat price.'

### 44. Anthropic's own published economics for agentic coding (provided context): caching cuts agent-loop cost 2.5–3.7x at 81–90% hit rates; Opus 5 default effort ~91.7% pass at ~$1.39/task; low-then-rerun ~93% at ~$0.70

- value: 2.5–3.7x cost reduction from caching; $0.70–$1.39 per benchmark task
- confidence: quoted
- source: provided context (Anthropic first-party, cached 2026-06-24) (2026-06-24)
- note: Not re-fetched per task instructions. Relevant because a lab's cost to serve a subscription token is closer to cache-read ($0.25–$1/M) than to list output ($25–$50/M), which is why flat plans can be priced far below API-equivalent and still clear gross margin on median use.

## Not found

- Bessemer 2026 'AI Pricing Playbook' statistic (41% of AI vendors on hybrid pricing, up from 27% in 2025): appears only in search-result summaries; bvp.com URL guess returned 404 and the search budget was exhausted before a primary could be located.
- A published dollar price per OpenAI Codex credit: OpenAI's pricing page says 'Credit purchase prices and applicable discounts depend on your plan or agreement'; only a derived ~$0.04/credit exists (CloudZero and my own arithmetic).
- Any lab-disclosed or analyst-quantified gross margin on subscriptions specifically (as opposed to blended or API/inference margin): none found; only community anecdotes (e.g. Kilo's $15,000-for-$800 case).
- Sell-side analyst notes (Morgan Stanley, Goldman, Bernstein, Jefferies) explicitly on coding-subscription-to-usage convergence: none surfaced; Goldman/Morgan Stanley were cited only on Anthropic's revenue growth rate.
- A primary GitHub changelog/blog entry for the 2026-06-01 switch from premium requests to AI Credits: docs pages confirm the model and the 'after June 1, 2026' legacy cutoff, but the announcement itself was not located.
- OpenAI's primary text for the 2026-04-02 per-message-to-token change and the reported 2026-06-11 Codex 'rate-limit reset banking': help-center rate card returned 403 and the Codex CLI changelog at learn.chatgpt.com does not contain pricing entries.
- Anthropic's original Max plan launch post (stated rationale for offering a flat power-user tier): anthropic.com/news/max-plan redirects to claude.com/blog/max-plan which returns 404.
- Anthropic Head of Growth interview (Lenny's Newsletter, 2026-04-05) statements on subscriptions as acquisition: content is paywalled.
- NPR Planet Money (2026-07-28) 'tokens as the kilowatt-hour' piece: fetch timed out twice; Altman quotes were taken from AOL/Yahoo coverage instead.
- Cursor's own June 2026 Teams announcement and its reported claim that the update 'will lower costs for 90% of teams': not fetched; only a secondary mention.
- The Kahn v. Anthropic complaint text itself and Anthropic's motion-to-dismiss arguments: only news and blog summaries were reachable (Quartz and TechBriefly returned 403).
