# OpenAI API and ChatGPT subscription pricing as of 2026-09-08, Codex plan limits/credits, sign-in policy, and evidence for subscription-to-API convergence on OpenAI's side

## Summary

OpenAI's current API flagship for coding is the GPT-5.6 family (gpt-5.6-sol $4/$0.40/$20 per MTok in/cached/out under promotional pricing through at least 2026-11-21; gpt-5.6-terra $2/$0.20/$12; gpt-5.6-luna $0.20/$0.02/$1.20), with gpt-6-astra ($10/$1/$50) released 2026-09-03 and the dedicated codex model still gpt-5.3-codex ($1.75/$0.175/$14, Standard/Fast only). Cache writes are 1.25x input, Batch and Flex are 0.5x, Fast mode (ex-Priority) is 2x, and requests over ~272K input tokens bill the whole request at 2x input / 1.5x output. On the subscription side, ChatGPT plans are Free $0, Go $8, Plus $20, Pro $100 (5x Plus Codex) / $200 (20x), Business Standard $20 (annual)/$25 (monthly), Business Premium $100/$125 (5x Standard, no five-hour cap), Enterprise unpriced. Since 2026-04-02 Codex usage inside subscriptions is metered in token-aligned credits, and the published credit rate card converts at $0.04/credit (2,500 credits = $100, from OpenAI's Premium-seat promo) to exactly the API list prices for every model — i.e. the subscription's internal unit of account already IS the API price, and overage credits are sold at API rates. OpenAI publishes only per-model message ranges per rolling five-hour window (e.g. Pro 20x: 200–2,000 Sol messages) and says weekly limits "may also apply" without numbers; combining the ranges with the stated 5–30 credits/message for GPT-5.6 implies roughly 6,000–10,000 credits ($240–$400 API-equivalent) per five-hour window on Pro 20x, ~$60–$100 on Pro 5x, and ~$12–$20 on Plus, but the weekly cap makes monthly value unbounded from public data. Policy-wise, OpenAI's Codex docs steer programmatic/CI use to API keys (API rates) or enterprise access tokens, Sign-in-with-ChatGPT to interactive Codex surfaces, and maintainers have declined to bless third-party clients driving a ChatGPT plan; the ToS forbids programmatic extraction. The direction of travel is unambiguous: per-message limits replaced by token credits (Apr 2), a $100 mid-tier (Apr 9), a Business seat that removes the time cap for 5x the price (Aug 10), Codex-only pay-as-you-go seats withdrawn from new Business workspaces (Jun 24), outcome-based pricing trials for enterprise agents (reported Aug 31), and a $1B-run-rate ad business underwriting the Free/Go tiers. For a software factory cost model, treat OpenAI subscriptions as prepaid, rate-limited API credits priced at list, worth at most a few hundred dollars of tokens per five-hour window, and assume unpublished weekly caps and further tier changes.

## Facts

### 1. gpt-5.6-sol API price (Standard, short context)

- value: $4.00 input / $0.40 cached input / $5.00 cache write / $20.00 output per MTok
- confidence: quoted
- source: https://platform.openai.com/docs/pricing (fetched 2026-09-08 (promotional pricing 'available at least through November 21, 2026'))
- note: Fetched via curl. Page states 'GPT-5.6 Sol's promotional pricing is available at least through November 21, 2026.' Launch price was $5/$0.50/$30 (see separate fact).

### 2. gpt-5.6-terra API price (Standard, short context)

- value: $2.00 input / $0.20 cached / $2.50 cache write / $12.00 output per MTok
- confidence: quoted
- source: https://platform.openai.com/docs/pricing (fetched 2026-09-08)
- note: Also confirmed on https://platform.openai.com/docs/models/gpt-5.6-terra (fetched 2026-09-08).

### 3. gpt-5.6-luna API price (Standard, short context) — current budget tier

- value: $0.20 input / $0.02 cached / $0.25 cache write / $1.20 output per MTok
- confidence: quoted
- source: https://platform.openai.com/docs/pricing (fetched 2026-09-08)
- note: Luna is the current low tier; the older gpt-5.4-mini/nano still exist (see below).

### 4. gpt-6-astra API price (Standard, short context)

- value: $10.00 input / $1.00 cached / $12.50 cache write / $50.00 output per MTok
- confidence: quoted
- source: https://platform.openai.com/docs/pricing (fetched 2026-09-08)
- note: Released 2026-09-03 (see timeline). Fast mode: $20/$2/$25/$100. Long context: $20/$2/$25/$75.

### 5. Long-context pricing for flagship models

- value: 2x input, 2x cached input, 2x cache write, 1.5x output for the whole request (Sol long-context: $8/$0.80/$10/$30; Terra $4/$0.40/$5/$18; Luna $0.40/$0.04/$0.50/$1.80)
- confidence: quoted
- source: https://platform.openai.com/docs/pricing (fetched 2026-09-08)
- note: Multipliers are from the primary table's short vs long columns. The threshold figure (~272K input tokens, applied to the entire request) was not in the parsed text and comes from https://cellcog.ai/blog/gpt-5-6-pricing/ (2026-08-24, updated 2026-09-08) and https://winbuzzer.com/2026/08/23/... — treat the 272K number as secondary.

### 6. Batch API and Flex tier discount

- value: 0.5x Standard on input, cached, cache write, and output (e.g. Sol batch/flex $2.00/$0.20/$2.50/$10.00)
- confidence: quoted
- source: https://platform.openai.com/docs/pricing (fetched 2026-09-08)
- note: Both Batch and Flex tables list identical 50% prices for gpt-6-astra, gpt-5.6-sol/terra/luna. Neither table lists gpt-5.3-codex (Codex is shown only under Standard and Fast mode).

### 7. Fast mode (formerly Priority processing) multiplier

- value: 2x Standard on all token types (Sol fast: $8/$0.80/$10/$40); 'Priority processing was renamed Fast mode on July 30, 2026'
- confidence: quoted
- source: https://platform.openai.com/docs/pricing (fetched 2026-09-08)
- note: service_tier: 'priority' or 'fast' both accepted. OpenAI's GPT-5.6 price post describes Fast mode as 'up to 2.5x faster speeds than Standard processing at twice the price'. The ChatGPT credits page separately says fast mode applies 'a 2.5x multiplier' to Astra's credit rate — a discrepancy between the API (2x) and the credits page (2.5x) that I could not reconcile.

### 8. Prompt cache write and read rules for GPT-5.6+

- value: Cache writes billed at 1.25x uncached input; cache reads 90% discount; 30-minute minimum cache life; explicit cache breakpoints supported
- confidence: quoted
- source: https://openai.com/index/gpt-5-6/ (page updated 2026-08-21 (launch 2026-07-09))
- note: Fetched via r.jina.ai proxy because openai.com 403s direct fetches. Consistent with the pricing table (Sol $5.00 write vs $4.00 input = 1.25x).

### 9. Regional data residency surcharge

- value: +10% on regional processing endpoints for models released on or after 2026-03-05
- confidence: quoted
- source: https://platform.openai.com/docs/pricing (fetched 2026-09-08)
- note: Relevant if EU-resident processing is required.

### 10. Dedicated Codex API model and price

- value: gpt-5.3-codex: $1.75 input / $0.175 cached / $14.00 output per MTok (Standard); Fast mode $3.50 / $0.35 / $28.00
- confidence: quoted
- source: https://platform.openai.com/docs/pricing (fetched 2026-09-08)
- note: Listed under 'Specialized models > Codex'. No Batch/Flex column shown for it. Predecessors on model pages: gpt-5.2-codex $1.75/$0.175/$14; gpt-5-codex $1.25/$0.125/$10 (https://platform.openai.com/docs/models/gpt-5-codex, fetched 2026-09-08). No GPT-5.5/5.6-codex model exists on the pricing page.

### 11. chat-latest (ChatGPT-tuned API alias) price

- value: $5.00 / $0.50 / $30.00 per MTok
- confidence: quoted
- source: https://platform.openai.com/docs/pricing (fetched 2026-09-08)
- note: Same as GPT-5.5 list price.

### 12. gpt-5.5 API price

- value: $5.00 input / $0.50 cached / $30.00 output per MTok
- confidence: quoted
- source: https://platform.openai.com/docs/models/gpt-5.5 (fetched 2026-09-08; model released 2026-04-23, API 2026-04-24)
- note: Release dates from https://en.wikipedia.org/wiki/GPT-5.5. GPT-5.5 was 2x GPT-5.4's price.

### 13. gpt-5.4 API price

- value: $2.50 / $0.25 / $15.00 per MTok
- confidence: quoted
- source: https://platform.openai.com/docs/models/gpt-5.4 (fetched 2026-09-08; released 2026-03-05)
- note: Release date from https://en.wikipedia.org/wiki/GPT-5.4.

### 14. gpt-5.4-mini API price (mini tier)

- value: $0.75 / $0.075 / $4.50 per MTok
- confidence: quoted
- source: https://platform.openai.com/docs/models/gpt-5.4-mini (fetched 2026-09-08; released 2026-03-17)
- note: 400K context per third-party pages. Wikipedia (GPT-5.4) notes mini/nano are 4x the price of their GPT-5 equivalents.

### 15. gpt-5.4-nano API price (nano tier)

- value: $0.20 / $0.02 / $1.25 per MTok
- confidence: quoted
- source: https://platform.openai.com/docs/models/gpt-5.4-nano (fetched 2026-09-08; released 2026-03-17)
- note: API-only model. Note gpt-5.6-luna is now the same input price with cheaper output ($1.20).

### 16. gpt-5.6-cyber (Daybreak Red) API price

- value: $12.50 / $1.25 / $15.625 cache write / $75.00 per MTok; no long-context tier
- confidence: quoted
- source: https://platform.openai.com/docs/pricing (fetched 2026-09-08)
- note: Trusted-access only; gpt-daybreak-red-latest alias. Included because the credits rate card lists it (312.5/31.25/1,875 credits) which cross-checks the $0.04/credit derivation.

### 17. API rate limits by usage tier for gpt-5.6-sol

- value: Tier 1: 500 RPM / 500K TPM / 1.5M batch queue; Tier 2: 5,000 / 1M / 3M; Tier 3: 5,000 / 2M / 100M; Tier 4: 10,000 / 4M / 200M; Tier 5: 15,000 / 40M / 15B; Free tier: not supported
- confidence: quoted
- source: https://platform.openai.com/docs/models/gpt-5.6-sol (fetched 2026-09-08)
- note: TPM = tokens per minute. Tier is by cumulative API spend.

### 18. ChatGPT individual plan prices

- value: Free $0; Go $8/mo; Plus $20/mo; Pro from $100/mo (5x Plus limits) or $200/mo (20x Plus limits, unlimited Voice)
- confidence: quoted
- source: https://learn.chatgpt.com/docs/pricing (fetched 2026-09-08)
- note: OpenAI's Codex/ChatGPT developer docs (developers.openai.com/codex/pricing 308-redirects here). openai.com/chatgpt/pricing hides dollar amounts behind region detection; it labels Codex access as Free 'Limited', Go 'Limited' ('This plan may include ads'), Plus 'Yes', Pro 'Expanded'.

### 19. ChatGPT Business Standard seat price

- value: $20/user/mo billed annually; $25/user/mo billed monthly; 2-user minimum
- confidence: quoted
- source: https://learn.chatgpt.com/docs/pricing (fetched 2026-09-08)
- note: Cut by $5 on 2026-04-02 from $25/$30 per https://www.cloudzero.com/blog/how-much-does-chatgpt-cost/ (2026-04-30, updated 2026-09-04).

### 20. ChatGPT Business Premium seat price and entitlement

- value: $125/user/mo monthly or $100/user/mo annual; '5x more usage than Standard'; 'no five-hour usage limit'; mixable with Standard seats in one workspace
- confidence: quoted
- source: https://openai.com/index/premium-seats-chatgpt-business/ (announced 2026-08-10/11; GA 2026-08-25)
- note: Fetched via r.jina.ai proxy. Dates: appwrite.io post dated 2026-08-11 says promo ends 2026-08-20; dev.to post dated 2026-08-25 says promo ended and seats are GA.

### 21. ChatGPT Enterprise price

- value: Not published ('Contact sales'); third-party procurement reports cluster at ~$60/user/mo within $45–$75, ~150-seat minimum, annual commitment (~$108K/yr floor), $40–$60 at scale
- confidence: estimated
- source: https://www.beam.cloud/blog/chatgpt-enterprise-pricing (2026-06-25)
- note: The article itself says 'None are OpenAI list prices.' Use only as a planning range.

### 22. Codex is included in every ChatGPT tier, and usage is a shared pool across Codex surfaces and ChatGPT Work

- value: Free, Go, Plus, Pro, Business, Edu, Enterprise all include Codex; 'Codex, ChatGPT Work, ChatGPT for Excel, and Workspace Agents use a shared allowance and credit pool'; CLI, IDE extension, desktop and cloud tasks share one allowance
- confidence: quoted
- source: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan ('last updated 9 days ago' as of 2026-09-08 (≈2026-08-30))
- note: Fetched via r.jina.ai proxy. Also: 'OpenAI Support does not reset ChatGPT or Codex usage limits'; one-time resets are occasionally granted and 'Future resets are not guaranteed'. Free & Go get GPT-5.6 Terra in Codex; Plus and up get Sol (openai.com/index/gpt-5-6/).

### 23. Per-plan Codex usage estimates per rolling five-hour window (local messages; cloud chats share it) — GPT-5.6 Sol

- value: Plus 10–100; Pro 5x 50–500; Pro 20x 200–2,000; Business Standard 10–100; API key: usage-based
- confidence: quoted
- source: https://learn.chatgpt.com/docs/pricing (fetched 2026-09-08)
- note: Same table gives GPT-6 Astra: Plus 5–45 / Pro5x 25–225 / Pro20x 100–900; Terra: 25–200 / 125–1,000 / 500–4,000; Luna: 250–2,000 / 1,250–10,000 / 5,000–40,000; GPT-5.5: 15–80 / 75–400 / 300–1,600; GPT-5.4: 20–100 / 100–500 / 400–2,000; GPT-5.4 mini: 60–350 / 300–1,750 / 1,200–7,000. Page: 'Weekly limits may also apply' — no weekly numbers are published. Image generation consumes limits '3-5x faster on average'.

### 24. Credits are the subscription unit of account for Codex since April 2026; per-message credit cost for GPT-5.6

- value: 'GPT-5.6 usage averages 5-30 credits per message'; a GPT-5.5 Codex task 'may use roughly 5-45 credits'
- confidence: quoted
- source: https://learn.chatgpt.com/docs/pricing (fetched 2026-09-08)
- note: The 5.5 figure is from https://simplemetrics.xyz/chatgpt-codex-limits-2026/ (2026-06-02, updated 2026-07-12) quoting OpenAI's page at the time. The page does not say which GPT-5.6 size the 5–30 range refers to.

### 25. Codex/ChatGPT credit rate card (credits per 1M tokens: input / cached input / output)

- value: GPT-6 Astra 250 / 25 / 1,250; GPT-5.6 Sol 100 / 10 / 500; Terra 50 / 5 / 300; Luna 5 / 0.5 / 30; GPT-5.5 125 / 12.5 / 750; GPT-5.4 62.5 / 6.25 / 375; GPT-5.4 mini 18.75 / 1.875 / 113; GPT-5.3-Codex 43.75 / 4.375 / 350; Daybreak Red 312.5 / 31.25 / 1,875
- confidence: quoted
- source: https://help.openai.com/en/articles/20001106-codex-rate-card (fetched 2026-09-08 via proxy (page notes Sol promo through 2026-11-21))
- note: Same table on https://learn.chatgpt.com/docs/pricing. 'These rates apply to supported ChatGPT Work and Codex activity' on credit-based plans; the rate card itself does not state a dollar price per credit.

### 26. Dollar value of one ChatGPT/Codex credit

- value: $0.04 per credit (25 credits per $1)
- confidence: derived
- source: https://openai.com/index/premium-seats-chatgpt-business/ (2026-08-10)
- note: OpenAI's promo: '$100 in workspace credits (2,500 credits)' per Premium seat → $100 / 2,500 = $0.04. cloudzero (https://www.cloudzero.com/blog/openai-codex-pricing/, updated 2026-09-04) independently states 'approximately $0.04 per credit'.

### 27. Subscription credits are priced exactly at API list rates (convergence evidence)

- value: At $0.04/credit: Sol 100/10/500 → $4.00/$0.40/$20.00; Terra → $2.00/$0.20/$12.00; Luna → $0.20/$0.02/$1.20; Astra → $10/$1/$50; GPT-5.5 → $5/$0.50/$30; GPT-5.4 → $2.50/$0.25/$15; GPT-5.3-Codex → $1.75/$0.175/$14; GPT-5.4 mini → $0.75/$0.075/$4.52 (API $4.50, rounding)
- confidence: derived
- source: https://help.openai.com/en/articles/20001106-codex-rate-card (fetched 2026-09-08)
- note: Credits × $0.04 reproduces every current API list price on https://platform.openai.com/docs/pricing. The Aug 21 Sol cut was explicitly applied to both the API and 'ChatGPT Work and Codex credit purchases on eligible plans' (winbuzzer 2026-08-23), so the two ladders move together. Overage credits are therefore pay-as-you-go at API rates inside the subscription.

### 28. Implied API-equivalent value of one five-hour Codex window, by plan (GPT-5.6, assuming the message ranges and 5–30 credits/message are consistent)

- value: Plus ≈ 300–500 credits ≈ $12–$20 per 5h; Pro 5x ≈ 1,500–2,500 credits ≈ $60–$100 per 5h; Pro 20x ≈ 6,000–10,000 credits ≈ $240–$400 per 5h; Business Standard same as Plus
- confidence: estimated
- source: https://learn.chatgpt.com/docs/pricing (fetched 2026-09-08)
- note: Arithmetic: window budget ≈ (low message count × 30 credits) to (high message count × 5 credits), i.e. heavy messages at the low end and light ones at the high end, then × $0.04. Pro 20x: 200×30=6,000 to 2,000×5=10,000 credits. This only bounds a single window; unpublished weekly caps ('Weekly limits may also apply') mean monthly value cannot be computed from public data. If a user fully drained one window per workday for 22 days with no weekly cap, Pro 20x would be $5,280–$8,800 API-equivalent/month — an upper bound, not an expectation.

### 29. Third-party break-even analysis: subscription vs API for Codex

- value: <2M tokens/mo: API; 2M–20M: Plus $20 ('often 5x to 15x cheaper than the equivalent API bill'); 20M–80M: Pro $200; >80M: API or multi-seat Pro. Pro $200 at 60M–80M tokens ≈ $300–$800 API cost
- confidence: quoted
- source: https://officeclaws.com/en/blog/codex-subscription-vs-api-cost (2026-04-19)
- note: Assumes $5–$15 input / $30–$60 output per MTok (pre-GPT-5.6, pre-cuts); a heavy day was 5M–20M+ tokens. cloudzero (updated 2026-09-04) says API 'tend[s] to beat Plus below roughly 10 to 40 sessions a month, and can beat Pro 5x below 50 to 200 sessions'. No official OpenAI statement of Pro's API-equivalent value exists (community thread https://community.openai.com/t/.../1370942, 2026-01-05, has no staff answer).

### 30. Anecdotal Pro-plan saturation

- value: 'I'm on the $200 max plan for Codex and I hit the 5 hour limit near daily at work. I typically am having it work on about 5 tasks an hour.'
- confidence: quoted
- source: https://news.ycombinator.com/item?id=48495217 (≈2026-06 (88 days before fetch; parent story 'OpenAI mulls slashing prices as it competes with Anthropic for users', HN item 48486486))
- note: Single user; no token counts.

### 31. Codex weekly active users

- value: 'Over 3 million people globally use Codex weekly', 5x in three months, 70% month-over-month growth
- confidence: quoted
- source: https://techcrunch.com/2026/04/09/chatgpt-pro-plan-100-month-codex/ (2026-04-09)
- note: OpenAI figure reported at the $100 Pro launch.

### 32. Timeline: ChatGPT Go launched globally

- value: 2026-01-16 at $8/mo (US price)
- confidence: quoted
- source: https://www.cloudzero.com/blog/how-much-does-chatgpt-cost/ (2026-04-30 (updated 2026-09-04))
- note: Corroborated by the ads timeline at https://www.contexthints.com/guide/chatgpt-ads-news.html (updated 2026-09-04): ads officially announced 2026-01-16.

### 33. Timeline: ads launched in ChatGPT Free and Go (US)

- value: 2026-02-09 US pilot; self-serve US 2026-05-05; UK 2026-06-06; 31 European markets 2026-08-24; Europe/India/MENA self-serve 2026-08-31; paid tiers Plus and up remain ad-free
- confidence: quoted
- source: https://www.contexthints.com/guide/chatgpt-ads-news.html (updated 2026-09-04)
- note: EU date also from https://www.pinmeto.com/news/chatgpt-ads-31-european-markets-2026/ (search snippet only). Free can be switched to an ad-free mode without upgrading per search snippets — not verified on a primary page.

### 34. Timeline: GPT-5.4 (2026-03-05) and GPT-5.4 mini/nano (2026-03-17) released

- value: GPT-5.4 $2.50/$15; mini $0.75/$4.50; nano $0.20/$1.25
- confidence: quoted
- source: https://en.wikipedia.org/wiki/GPT-5.4 (fetched 2026-09-08)
- note: Prices from platform.openai.com model pages.

### 35. Timeline: Codex subscription usage moved from per-message limits to token-aligned credits

- value: 2026-04-02 for Plus, Pro, Business and new Enterprise; 2026-04-23 for all existing Enterprise/Edu/Health/Gov/Teachers plans
- confidence: quoted
- source: https://uibakery.io/blog/openai-codex-pricing (updated 2026-06-21)
- note: Quotes OpenAI help-center wording: 'OpenAI updated Codex pricing to align with API token usage, instead of per-message pricing.' Same dates in cloudzero and verdent (2026-05-14). The OpenAI help page itself 403s direct fetch.

### 36. Timeline: ChatGPT Business seat price cut $5

- value: 2026-04-02: from $25 annual / $30 monthly to $20 / $25
- confidence: quoted
- source: https://www.cloudzero.com/blog/how-much-does-chatgpt-cost/ (2026-04-30 (updated 2026-09-04))
- note: Verdent's 2026-05-14 guide still shows $30/user/month, consistent with the prior monthly price.

### 37. Timeline: $100 ChatGPT Pro tier launched

- value: 2026-04-09; 5x Plus Codex usage (promo 10x through 2026-05-31); $200 tier keeps 20x; positioned against Claude Max $100
- confidence: quoted
- source: https://techcrunch.com/2026/04/09/chatgpt-pro-plan-100-month-codex/ (2026-04-09)
- note: OpenAI quote: 'designed to give developers more practical coding capacity for the money, especially during high-intensity work sessions where limits matter most.' A '$100 Pro Lite' had been spotted in code earlier (tldv.io, 2026-03-24).

### 38. Timeline: GPT-5.5 released

- value: 2026-04-23 (API 2026-04-24) at $5/$30, double GPT-5.4
- confidence: quoted
- source: https://en.wikipedia.org/wiki/GPT-5.5 (fetched 2026-09-08)
- note: GPT-5.5-Cyber limited preview 2026-05-07.

### 39. Timeline: one-off Codex rate-limit reset for all paid plans

- value: 2026-04-28; reset the replenishment windows, no new allowance; 'we don't have a timeline to share' on recurring resets
- confidence: quoted
- source: https://community.openai.com/t/codex-rate-limits-reset-for-all-paid-plans-april-28-2026/1379921 (2026-04-28)
- note: learn.chatgpt.com/docs/pricing.md adds that 'banked rate-limit resets' are usable for 30 days after grant.

### 40. Timeline: Codex pay-as-you-go seats withdrawn from new ChatGPT Business workspaces

- value: 2026-06-24; existing/pending Codex seats grandfathered; Standard and Premium seats still include Codex
- confidence: quoted
- source: https://www.sayfeai.com/blog/chatgpt-business-codex-seats-cutoff-june-2026 (2026-06-24)
- note: Corroborated by cloudzero (updated 2026-09-04): 'OpenAI stopped offering new pay-as-you-go Codex-only seats to new Business signups.' OpenAI help article 20001492 ('Managing legacy Codex seats') exists but 403s.

### 41. Timeline: GPT-5.6 Sol/Terra/Luna released

- value: Limited preview 2026-06-26; public 2026-07-09; launch API prices Sol $5/$0.50/$30, Terra $2.50/$15, Luna $1/$6
- confidence: quoted
- source: https://en.wikipedia.org/wiki/GPT-5.6 (fetched 2026-09-08)
- note: Launch prices from https://openai.com/index/gpt-5-6/ (via proxy). One aggregator (aipricing.guru) gives GA as 2026-07-29 — conflicts with Wikipedia, winbuzzer and cellcog (all 2026-07-09); I use 07-09. Sam Altman: Sol is '54% more token-efficient for AI coding tasks' than predecessors.

### 42. Timeline: Terra and Luna price cuts; Priority renamed Fast mode

- value: Effective 2026-07-30: Terra -20% to $2/$12; Luna -80% to $0.20/$1.20; Sol unchanged; Fast mode 'up to 2.5x faster ... at twice the price'; subscription prices unchanged but 'token consumption adjusts downward' in credits
- confidence: quoted
- source: https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/ (2026-07-29/30)
- note: Fetched via proxy; the summarizer mis-guessed the year as 2025 — the post is 2026 (GPT-5.6 launched 2026-07-09). Rename date confirmed on platform.openai.com/docs/pricing.

### 43. Timeline: Sol promotional price cut

- value: Effective 2026-08-21 through at least 2026-11-21: input $5→$4 (-20%), cached $0.50→$0.40, cache write $6.25→$5.00, output $30→$20 (-33%); long-context $10→$8 input, $45→$30 output; applies to API and to Codex/ChatGPT Work credit purchases; included subscription allowances unchanged
- confidence: quoted
- source: https://winbuzzer.com/2026/08/23/openai-cuts-gpt-5-6-sol-api-prices-by-up-to-33-percent-through-november-21-xcxwbn/ (2026-08-23)
- note: Primary confirmation of the current price and the Nov 21 date on platform.openai.com/docs/pricing. This is the only announced late-2026 pricing event found: Sol may revert to $5/$30 after 2026-11-21.

### 44. Timeline: ChatGPT Business Premium seats

- value: Announced 2026-08-10; GA 2026-08-25; $100 annual / $125 monthly; 5x Standard; no five-hour cap
- confidence: quoted
- source: https://dev.to/alifar/openai-launches-chatgpt-business-premium-seats-with-5x-more-usage-capacity-2gbg (2026-08-25)
- note: Primary post via proxy: https://openai.com/index/premium-seats-chatgpt-business/.

### 45. Timeline: Codex CLI 0.152.0 earlier low-allowance warning

- value: 2026-09-01: 'Plus and Team users receive an earlier warning when less than half of their allowance remains in an approximately five-hour usage window'
- confidence: quoted
- source: https://learn.chatgpt.com/docs/changelog (2026-09-01)
- note: Only pricing/limit-related entry in the changelog since 2025-01.

### 46. Timeline: GPT-6 Astra released

- value: 2026-09-03 to Trusted Access (Daybreak) enterprises; ChatGPT Plus/Pro/Business/Enterprise, API and AWS 'in the coming days'; $10/$1/$50; 1,050,000-token context (922K input / 128K output); in Codex it rolls to Pro/Business/Enterprise, not Plus
- confidence: quoted
- source: https://cellcog.ai/blog/openai-astra-release-date/ (2026-08-29, reviewed 2026-09-08)
- note: Price confirmed primary on platform.openai.com/docs/pricing; learn.chatgpt.com/docs/pricing already lists Astra allowances for Plus (5–45 per 5h).

### 47. Policy: which auth to use for programmatic Codex use

- value: 'Use API key authentication for programmatic Codex CLI workflows, such as CI/CD jobs.' 'When you sign in with an API key, Codex uses standard API pricing instead of included ChatGPT plan credits.' Enterprise 'Access tokens are intended for trusted scripts, schedulers, and private CI runners.' Device-code auth (beta) for headless.
- confidence: quoted
- source: https://learn.chatgpt.com/docs/auth.md (fetched 2026-09-08)
- note: Sign in with ChatGPT is documented for the desktop app, CLI, IDE extension, Codex cloud and workspace-managed environments; API-key mode loses cloud features and OAuth plugins. No numeric rate limits are given for ChatGPT sign-in beyond the plan allowance.

### 48. Policy: OpenAI's stance on forks/third-party harnesses using Sign in with ChatGPT

- value: Maintainer (etraut-openai): 'The codex CLI sources are licensed under a permissive Apache license, and you're welcome to fork the repo and make modifications' (2025-12-19); 'I'm an engineer, not a lawyer ... our terms of use and code license are quite permissive' (2026-02-09). No written confirmation of bring-your-own-subscription for third-party clients through follow-ups May–Aug 2026.
- confidence: quoted
- source: https://github.com/openai/codex/discussions/8338 (2025-12-19 to 2026-08)
- note: Terms of Use (https://openai.com/policies/row-terms-of-use/, via proxy) prohibit 'Automatically or programmatically extract data or Output' and say nothing specific about ChatGPT credentials in third-party software. The separate 'Sign in with ChatGPT' identity feature for third-party apps (help article 20001410, updated ~2026-08) shares only name/email/picture and does not grant plan usage.

### 49. Policy: workspace controls on Sign in with ChatGPT

- value: Enabled by default; enterprise global admins can disable it org-wide or restrict to an approved list of partner applications
- confidence: quoted
- source: https://help.openai.com/en/articles/20001410-sign-in-with-chatgpt (updated ~2026-08)
- note: From search snippet plus proxy fetch; applies to the identity feature, not to Codex plan usage.

### 50. ChatGPT ads revenue run-rate and targets

- value: $1B annualized ad run-rate ~200 days after first ad (2026-08-31); $2.5B ad revenue targeted for 2026 (announced April); total company run-rate >$40B (≈2x end-2025); $100B by end of decade; 'tens of thousands of advertisers'
- confidence: quoted
- source: https://www.pymnts.com/news/artificial-intelligence/2026/openai-says-ad-business-reaches-1-billion-run-rate/ (2026-08-31)
- note: Also reported by Forbes/Quartz the same day (Quartz 403'd).

### 51. OpenAI testing outcome-based pricing for enterprise agents

- value: Select major accounts pay only when the agent completes the task (example: customer-support interaction handled end-to-end); terms, prices and success criteria undisclosed; not announced by OpenAI; tied to the Astra agent launch
- confidence: quoted
- source: https://thenextweb.com/news/openai-outcome-based-pricing-enterprise (2026-08-31 (reporting The Information, McLaughlin & Efrati))
- note: TNW 'has not independently verified the report'. No mention of Codex or coding agents; it is enterprise agents, not developer subscriptions.

### 52. OpenAI projects the $8 tier drives consumer subscribers to 122M this year and expects migration from $20 Plus

- value: 122 million consumer subscribers projected for 2026; 'expecting a cheaper, ad-supported tier will both draw new users and cause tens of millions to migrate' from $20 subscriptions
- confidence: quoted
- source: https://www.theinformation.com/articles/openai-sees-8-chatgpt-driving-consumer-subscribers-122-million-year (2026 (exact date not visible; paywalled))
- note: Seen only in the article title and a search snippet; the article 403s. Treat the migration wording as reported, not verified.

### 53. OpenAI ChatGPT head on flat pricing

- value: Nick Turley: 'There's no world in which pricing doesn't significantly evolve when the technology is changing this quickly.' and 'It's possible that in the current era, having an unlimited plan is like having an unlimited electricity plan. It just doesn't make sense.'
- confidence: quoted
- source: https://tldv.io/blog/chatgpt-pricing/ (2026-03-24 (updated 2026-08-03))
- note: Secondary source that does not cite the original interview or date; could not locate the primary.

### 54. Pro plan credits purchase

- value: 'Eligible Plus and Pro users can buy credits without changing plans'; credits are spent after included allowance at the rate card
- confidence: quoted
- source: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan (≈2026-08-30)
- note: No dollar pack price is shown on any fetched OpenAI page; the only dollar↔credit anchor is the $100 = 2,500 credits promo (Business).

### 55. Education promo announced for late 2026 and beyond

- value: ChatGPT for Teachers free for verified US K-12 educators through June 2027; nonprofits up to 75% off Business/Enterprise
- confidence: quoted
- source: https://openai.com/chatgpt/pricing/ (fetched 2026-09-08 via proxy)
- note: Included as the only other forward-dated pricing commitment on the plans page.

## Not found

- Published weekly (as opposed to five-hour) Codex limits for any ChatGPT plan — OpenAI states only 'Weekly limits may also apply'.
- Dollar list price of purchasable Codex credit packs for Plus/Pro (only the $100 = 2,500 credits Business promo anchors $0.04/credit).
- Any official OpenAI statement of the API-equivalent dollar value of Pro ($100 or $200) Codex usage, or measured token-per-week figures for Pro 20x.
- An explicit written OpenAI policy permitting or forbidding third-party harnesses/ACP clients/forks from driving a ChatGPT subscription via Sign in with ChatGPT (maintainers declined to answer; issue #10974 is 404).
- ChatGPT Enterprise list price (only third-party procurement estimates exist).
- Any announced Plus/Go/Pro/Business price change for late 2026 (only the Sol API promo end date, 2026-11-21, is forward-dated).
- Whether Batch or Flex tiers exist for gpt-5.3-codex (pricing page shows Standard and Fast only; no explicit statement).
- Primary source and date for the Nick Turley quotes.
- The Information's 122M-subscriber article body (paywalled; title/snippet only).
- Any OpenAI statement about usage-based or outcome-based pricing specifically for Codex/coding agents beyond the April 2026 token-credit metering; the outcome-based trials reported are for enterprise agents.
- The exact long-context threshold token count on OpenAI's own pricing page (columns present; the ~272K figure comes from secondary sources).
