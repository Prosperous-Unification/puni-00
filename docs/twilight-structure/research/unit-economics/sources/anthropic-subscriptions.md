# Anthropic subscription (Pro/Max/Team/Enterprise) pricing vs API pricing, 2025-01 to 2026-09, and evidence on whether subscriptions converge toward API-rate pricing

## Summary

Subscription list prices have not moved since Max launched (Pro $20, Max 5x $100, Max 20x $200, Team $20-25/$100-125 per seat), but everything around the price has been re-metered: weekly caps (Aug 2025), overflow billed at standard API rates via "usage credits" on every plan, a 5-minute (not 1-hour) cache TTL once you are on credits, Fable 5/5.1 excluded from Pro except via credits, and Enterprise moved to "$20/seat + every token at API rates" with legacy seat-based plans migrating at renewal. The clearest convergence signal is the May 13, 2026 plan to carve programmatic use (Agent SDK, claude -p, GitHub Actions, ACP, third-party tools) out of the subscription pool into a monthly credit equal to the plan price, metered at API list prices; that change was paused on June 15, 2026 with a promise of advance notice, so today claude -p, the Agent SDK, ACP and subscription-OAuth GitHub Actions still draw from plan limits, while third-party harnesses (OpenClaw etc.) have been off subscriptions since April 4, 2026 and must use API keys or extra-usage bundles. The current legal page frames OAuth as for "ordinary, individual usage of Claude Code and the Agent SDK" and forbids third parties from intermediating Claude.ai credentials. Live API prices match the cached context exactly (Fable 5.1 $10/$50, cache read 0.025x; Opus 5 $5/$25; Sonnet 5 $2/$10 made permanent Aug 2026; Haiku 4.5 $1/$5; writes 1.25x/2x; batch 50%; US-only 1.1x; Opus 5 fast mode 2x). For a cost model, the implied subscription discount depends entirely on who you are: Anthropic's own API-billed enterprise average is $150-250 per developer-month (parity with Max 20x), while self-selected ccusage leaderboard users show a median $1,450 (7x) and top decile above $7,358 (37x); heavy Opus-on-Max scenarios computed by the community land near $5,800/month (29x). Every economics statement from Anthropic (2025-07 "unprecedented demand", 2026-03 "way faster than expected", 2026-04 "subscriptions weren't built for these usage patterns", 2026-08 "capacity may be tight") and OpenAI (2025-01 "losing money on Pro", 2026-08 5-hour caps to "smoothen the load") points the same direction: flat-rate pools are being fenced to interactive human use and everything automated is being pushed to API-rate metering, but so far by limits and carve-outs rather than by raising the headline subscription price.

## Facts

### 1. Claude Pro price and headline entitlement

- value: $20/month monthly or $17/month billed annually; 'at least 5x more usage per 5-hour session than Free'; rolling 5-hour windows plus weekly caps; Claude Code included; overflow via usage credits at standard API rates
- confidence: quoted
- source: https://claude.com/pricing (unknown (fetched 2026-09-08; page carries no date))
- note: Corroborated by support article 8325606 ('at least five times the usage per session compared to our free service'; 'does not include API usage through the Claude Console').

### 2. Claude Max prices and multipliers

- value: Max 5x $100/month; Max 20x $200/month; '5x' / '20x more usage per session than Pro'; monthly billing only; 5-hour session reset plus weekly cap on a fixed per-account schedule; Claude Code and Cowork included
- confidence: quoted
- source: https://support.claude.com/en/articles/11049741-what-is-the-max-plan (unknown (fetched 2026-09-08))
- note: Anthropic publishes only relative multipliers, never token or dollar ceilings. The pricing page's Max 20x card rendered as 'From $100/month' in the fetch (parsing artifact); the help center states $200.

### 3. Team plan seat prices and usage multiples

- value: Standard $20/seat/month annual ($25 monthly), '1.25x more usage per session than the Pro plan'; Premium $100 annual ($125 monthly), '6.25x more usage per session than the Pro plan'; 2-150 seats; Claude Code included on every seat; limits per member, weekly reset; usage credits at API rates with org/user spend limits
- confidence: quoted
- source: https://support.claude.com/en/articles/9266767-what-is-the-team-plan (unknown (fetched 2026-09-08))
- note: Usage-credit rate for Team/seat-based Enterprise: 'Usage credits are billed at standard API rates' (support article 12005970).

### 4. Enterprise plan is now seat fee plus usage at API rates

- value: 'Seat price + usage at API rates', '$20/seat' (annual billing); 'Every token your team uses—in Chat, Claude Code, or Cowork—is billed at standard API rates on top of your seat cost'; 'no plan or seat-level usage limits'; legacy Standard/Premium seat plans transition to usage-based at contract renewal
- confidence: quoted
- source: https://support.claude.com/en/articles/9797531-what-is-the-enterprise-plan (unknown (fetched 2026-09-08))
- note: Strongest structural evidence for the convergence thesis: the top tier already prices usage at API rates. claude.com/pricing shows the same '$20/seat. Usage cost scales with model and task.' Date of this switch not found.

### 5. Usage credits (formerly 'extra usage') terms for Pro/Max

- value: Billed at standard API rates; user-set monthly spending cap; daily redemption limit $2,000; cover Claude, Claude Code and Cowork; 'in most cases, usage credits do not expire' (Japan: 6-month expiry from 2026-09-10)
- confidence: quoted
- source: https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans (unknown (fetched 2026-09-08))
- note: Overflow on every plan is therefore exactly API list price; the subscription is a prepaid pool in front of the meter.

### 6. Prompt-cache TTL differs between subscription and credit usage

- value: Cache lifetime is 1 hour on a subscription and 'drops to five minutes once you're drawing on usage credits'; API key default is 5 minutes
- confidence: quoted
- source: https://code.claude.com/docs/en/costs (unknown (fetched 2026-09-08))
- note: Matters for a cost model: subscription usage silently enjoys the 2x-priced 1h cache write TTL; credit/API usage pays for cache misses after 5 idle minutes unless TTL is chosen explicitly.

### 7. Weekly limits introduced (announced) and their published hour ranges

- value: Announced 2025-07-28, effective 2025-08-28. Pro: 40-80 h Sonnet 4/week; Max $100: 140-280 h Sonnet 4 + 15-35 h Opus 4; Max $200: 240-480 h Sonnet 4 + 24-40 h Opus 4; 'apply to less than 5% of subscribers'; 'Max subscribers can purchase additional usage... at standard API rates'
- confidence: quoted
- source: https://techcrunch.com/2025/07/28/anthropic-unveils-new-rate-limits-to-curb-claude-code-power-users/ (2025-07-28)
- note: Rationale quoted: users 'running... continuously in the background, 24/7', account sharing/resale, 'unprecedented demand', 'partial or major outage at least seven times in the last month'. Opus-only weekly cap still exists (help center shows separate reset for 'Opus only').

### 8. Temporary +50% Claude Code weekly limits promotion

- value: '50% higher' weekly limits for Pro, Max, Team and legacy seat-based Enterprise; 'valid from May 13, 2026 through September 13, 2026 at 11:59 PM PT'; 5-hour limits unaffected; 'After September 13, 2026, weekly usage limits in Claude Code return to their standard levels'
- confidence: quoted
- source: https://support.claude.com/en/articles/15910845 (2026-09 (article 'Updated this week' as of 2026-09-08))
- note: Extension history per aicatchup (updated 2026-09-06) and apidog (2026-08-19): Jul 13 -> Jul 19 -> Aug 19 -> Aug 31 -> Sep 13. Anthropic on X 2026-08-19: 'We hope to make this a permanent change... strong demand... capacity may be tight over the coming weeks'. A secondary (explainx) claims a permanent +25% replacement announced Aug 30; not present in Anthropic's article.

### 9. Fable 5/5.1 availability on plans

- value: Max, Team Premium, Enterprise Premium: included, 'up to 50% of your weekly usage limits on Fable models at no extra cost', drawn faster from the shared pool; Pro and Team Standard: 'aren't included in your plan's usage limits. You can use them with usage credits'; free Fable 5 promo ended 2026-07-19 23:59:59 PT
- confidence: quoted
- source: https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan (unknown (fetched 2026-09-08))
- note: digitalapplied (2026-07-20) adds: Pro/Team Standard Fable via credits at $10/$50 per MTok with a one-time $100 transition credit. Frontier model on the $20 tier is thus already API-rate metered.

### 10. Claude Max launched

- value: 2025-04-09; $100/month (5x Pro) and $200/month (20x Pro); positioned against ChatGPT Pro $200
- confidence: quoted
- source: https://techcrunch.com/2025/04/09/anthropic-rolls-out-a-200-per-month-claude-subscription/ (2025-04-09)
- note: Timeline entry 1.

### 11. Claude Code added to the Pro plan

- value: 2025-06-04 ('Claude Code is now available as part of the Pro plan')
- confidence: quoted
- source: https://x.com/AnthropicAI/status/1930307943502590255 (2025-06-04)
- note: Post title from search results; the X page itself was not fetched. Max had received full Claude Code in May 2025 (intuitionlabs citing Anthropic news).

### 12. Claude Code on Team and Enterprise with premium seats and admin-capped extra usage

- value: 2025-08-20; 'Admins have control over the maximum amount a user can spend with extra usage to ensure that users get flexibility and admins get predictable billing'
- confidence: quoted
- source: https://www.anthropic.com/news/claude-code-on-team-and-enterprise (2025-08-20)
- note: Post does not state seat prices.

### 13. Team Premium seat price was cut from $150 to $100 (annual)

- value: $150/month per premium seat (intuitionlabs snapshot, originally Dec 2025) vs $100 annual / $125 monthly today
- confidence: estimated
- source: https://intuitionlabs.ai/articles/claude-pricing-plans-api-costs (2025-12 (updated 2026-08-09))
- note: Only price decrease found in the timeline. A morphllm snippet dates the cut to Jan 2026 but the page rate-limited on fetch; date unverified.

### 14. Anthropic blocked harness spoofing / third-party OAuth use (first enforcement)

- value: 2026-01-09: 'tightened our safeguards against spoofing the Claude Code harness' (Thariq Shihipar); OpenCode affected; xAI's Cursor access cut
- confidence: quoted
- source: https://venturebeat.com/technology/anthropic-cracks-down-on-unauthorized-claude-usage-by-third-party-harnesses (2026-01-09)
- note: Article quotes developer dfabulich: 'In a month of Claude Code, it's easy to use so many LLM tokens that it would have cost you more than $1,000 if you'd paid via the API.'

### 15. Legal page updated to ban subscription OAuth in other tools (Feb 2026 wording)

- value: 'Using OAuth tokens obtained through Claude Free, Pro, or Max accounts in any other product, tool, or service — including the Agent SDK — is not permitted'; Shihipar: 'Third-party harnesses using Claude subscriptions create problems for users and are prohibited by our Terms of Service'
- confidence: quoted
- source: https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546 (2026-02-20)
- note: Legal page changed 2026-02-17/18. This wording has since been superseded (see current legal page fact).

### 16. March 2026 peak-hour throttling and 'faster than expected' admission

- value: Peak-window (six-hour) reduction of 5-hour limits affecting ~7% of users; off-peak 2x promo 2026-03-13 to 03-28; 2026-03-31 Anthropic: 'people are hitting usage limits in Claude Code way faster than expected... it's the top priority for the team'
- confidence: quoted
- source: https://www.theregister.com/2026/03/31/anthropic_claude_code_limits/ (2026-03-31)
- note: Users reported cache-breaking bugs inflating consumption 10-20x; VentureBeat (2026-05-08) later confirms 'three bugs had affected Claude Code since March 4'.

### 17. Subscriptions stopped covering third-party tools

- value: Effective 2026-04-04 12:00 PT: 'Claude subscriptions will no longer cover usage on third-party tools like OpenClaw. You can still use these tools with your Claude login via extra usage bundles (now available at a discount), or with a Claude API key.'
- confidence: quoted
- source: https://x.com/bcherny/status/2040206440556826908 (2026-04-03)
- note: Compensation: one-time credit equal to one month's subscription, discounted bundles, refunds on request (Yahoo Finance 2026-04-07; TechCrunch 2026-04-04). Bundle discount percentage not found.

### 18. Anthropic's stated rationale for the April 2026 cutoff

- value: 'our subscriptions weren't built for the usage patterns of these third-party tools. Capacity is a resource we manage thoughtfully and we are prioritizing our customers using our products and API.'; spokesperson: third-party use put 'outsized strain on our systems'; 'intentional in managing our growth to continue to serve our customers sustainably'
- confidence: quoted
- source: https://x.com/bcherny/status/2040206441756471399 (2026-04-03)
- note: Additional quotes from TechCrunch 2026-04-04 and Yahoo Finance 2026-04-07.

### 19. 5-hour limits permanently doubled and peak-hour reduction removed

- value: 2026-05-06, for Pro, Max, Team and seat-based Enterprise; tied to SpaceX Colossus capacity ('more than 300 megawatts... over 220,000 NVIDIA GPUs')
- confidence: quoted
- source: https://explainx.ai/blog/claude-usage-limits-2026-timeline-explained (2026-07-05 (updated 2026-08-17))
- note: Secondary source only; no Anthropic primary located (search budget exhausted). Weekly caps unchanged by this event.

### 20. Agent SDK credit plan announced (programmatic use carved out of subscription pool)

- value: Announced 2026-05-13 for 2026-06-15: Agent SDK, claude -p, GitHub Actions and third-party apps would stop counting against plan limits and draw from a monthly non-rollover credit metered at API list prices: Pro $20, Max 5x $100, Max 20x $200, Team Standard $20, Team Premium $100, Enterprise Premium $200; overflow to usage credits 'at standard API rates—but only if you've enabled usage credits'
- confidence: quoted
- source: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan (2026-05-13 (pause notice 2026-06-15))
- note: Anthropic's Lydia Hallie: 'You don't pay extra. It's the same subscription, same price per month' (VentureBeat 2026-05-13). This is the most direct evidence of the thesis: automated usage priced at API rates with the subscription fee converted to a dollar credit of equal size.

### 21. Agent SDK credit change paused

- value: 'As of June 15, 2026: We're pausing the changes to Claude Agent SDK usage described below. For now, nothing has changed: Claude Agent SDK, claude -p, and third-party app usage still draw from your subscription's usage limits.' 'When we have an update, we'll share it before anything takes effect.'
- confidence: quoted
- source: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan (2026-06-15)
- note: Zed's blog (2026-05-14, updated 2026-06-16) confirms the pause applies to ACP usage too.

### 22. Class action over Max multipliers vs undisclosed weekly caps

- value: Filed by Karl Kahn (WA), reported 2026-06-15; alleges 5x/20x advertising undermined by weekly caps and 5-hour windows; seeks class of all Max subscribers since April 2025; Anthropic declined comment
- confidence: quoted
- source: https://finance.yahoo.com/sectors/technology/articles/anthropic-faces-lawsuit-over-claude-150710669.html (2026-06-15)
- note: Litigation risk is a constraint on further tightening of included usage without disclosure.

### 23. Sonnet 5 introductory API price made permanent

- value: '$2/$10 per million input/output token pricing for Claude Sonnet 5, announced at launch as introductory pricing through August 31, 2026, is now the standard price. The previously scheduled increase to $3/$15... on September 1, 2026 will not occur.'
- confidence: quoted
- source: https://platform.claude.com/docs/en/about-claude/pricing (2026-08 (secondary sources date the announcement 2026-08-10/11))
- note: Only API price event in the 2026 window; it is a decrease relative to plan, not an increase.

### 24. No 2026 increase to Pro/Max/Team headline prices found

- value: Pro $20, Max $100/$200, Team $20-25/$100-125 unchanged since 2025 (Team premium decreased)
- confidence: derived
- source: https://claude.com/pricing (fetched 2026-09-08)
- note: Absence claim from searches on 'price increase' returning only limit/policy changes; Anthropic reserves 'Price and plans are subject to change at Anthropic's discretion' on the pricing page.

### 25. Live API list prices: Claude Fable 5.1

- value: $10 in / $50 out per MTok; 5m cache write $12.50 (1.25x); 1h cache write $20 (2x); cache read $0.25 (0.025x); batch $5/$25
- confidence: quoted
- source: https://platform.claude.com/docs/en/about-claude/pricing (unknown (fetched 2026-09-08))
- note: Matches cached context exactly. Note Fable 5 (non-.1) cache read is $1 (0.1x); the 0.025x rate applies only to Fable 5.1 and Mythos 5.1.

### 26. Live API list prices: Claude Opus 5

- value: $5 / $25 per MTok; cache write $6.25 (5m) / $10 (1h); cache read $0.50; batch $2.50/$12.50; fast mode $10/$50 (2x, research preview, first-party only)
- confidence: quoted
- source: https://platform.claude.com/docs/en/about-claude/pricing (unknown (fetched 2026-09-08))
- note: Matches cached context.

### 27. Live API list prices: Claude Sonnet 5 and Haiku 4.5

- value: Sonnet 5 $2/$10, writes $2.50/$4, read $0.20, batch $1/$5; Haiku 4.5 $1/$5, writes $1.25/$2, read $0.10, batch $0.50/$2.50
- confidence: quoted
- source: https://platform.claude.com/docs/en/about-claude/pricing (unknown (fetched 2026-09-08))
- note: Matches cached context. Sonnet 4.6/4.5 remain $3/$15.

### 28. API pricing multipliers and modifiers

- value: 5-min cache write 1.25x, 1-hour 2x, cache read 0.1x (0.025x on Fable 5.1/Mythos 5.1); Batch API 50% off input and output; US-only inference (inference_geo='us') 1.1x on all token categories for 4.6+ models; 1M context at standard per-token price for 4.6+ models; multipliers stack
- confidence: quoted
- source: https://platform.claude.com/docs/en/about-claude/pricing (unknown (fetched 2026-09-08))
- note: Also: 'Claude 4.7 and later models... use a newer tokenizer... approximately 30% more tokens for the same text' — a hidden ~30% effective price increase per character for 4.7+ models vs 4.6 and earlier.

### 29. Current official policy on subscription OAuth (Claude Code legal page)

- value: 'OAuth authentication is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications.' Developers building products 'including those using the Agent SDK, should use API key authentication'. 'Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users... developers may not collect, store, or intermediate Claude.ai credentials or session tokens'. 'Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK.'
- confidence: quoted
- source: https://code.claude.com/docs/en/legal-and-compliance (unknown (fetched 2026-09-08))
- note: Softer than the Feb 2026 wording: individual Agent SDK use on a subscription is now implicitly acknowledged; the prohibition targets third-party intermediation and offering Claude.ai login/rate limits in someone else's product. 'Anthropic reserves the right to take measures to enforce these restrictions... without prior notice.'

### 30. Agent SDK docs note on third-party subscription use

- value: 'Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods... instead.'
- confidence: quoted
- source: https://code.claude.com/docs/en/agent-sdk/overview (unknown (fetched 2026-09-08))
- note: Agent SDK governed by Commercial Terms.

### 31. claude -p (headless) with a subscription is supported by the CLI today

- value: 'claude -p' uses the stored subscription login by default; '--bare' 'never reads OAuth credentials or the system keychain' and requires ANTHROPIC_API_KEY; '--bare is the recommended mode for scripted and SDK calls, and will become the default for -p in a future release'
- confidence: quoted
- source: https://code.claude.com/docs/en/headless (unknown (fetched 2026-09-08))
- note: Combined with the support article, -p/SDK usage currently consumes plan limits. The planned --bare default is a technical nudge toward API keys for automation.

### 32. Long-lived subscription OAuth token for CI is officially provided

- value: 'claude setup-token' issues a one-year OAuth token; 'This token authenticates with your Claude subscription and requires a Pro, Max, Team, or Enterprise plan'; can only make model requests; bare mode does not read it
- confidence: quoted
- source: https://code.claude.com/docs/en/authentication (unknown (fetched 2026-09-08))
- note: GitHub Actions doc: CLAUDE_CODE_OAUTH_TOKEN accepted; 'If you authenticate with an OAuth token, runs use your Claude subscription instead of API billing'; for org-shared secrets use an API key since a token 'is tied to the subscription of the person who ran claude setup-token'.

### 33. ACP (Zed and other harnesses) classification

- value: Zed: Anthropic's planned split put 'anything running through ACP, claude -p, or other third-party tools' into the Agent SDK credit pool; after the June pause 'ACP usage, claude -p, the Claude Agent SDK, and third-party apps built on the Agent SDK continue to work with Claude subscriptions exactly as they did before'; 'There is no separate Agent SDK credit to claim, and subscription limits are unchanged'
- confidence: quoted
- source: https://zed.dev/blog/anthropic-subscription-changes (2026-05-14 (updated 2026-06-16))
- note: Anthropic's own docs have no ACP page; Zed's 'Use an Existing Subscription' page lists Claude Pro/Max as usable via Claude Code in Zed. Anthropic explicitly intends ACP to be 'third-party agent and SDK usage' when the credit scheme returns.

### 34. Anthropic's own per-developer API spend figure (Claude Code, enterprise API deployments)

- value: 'average cost is around $13 per developer per active day and $150-250 per developer per month, with costs remaining below $30 per active day for 90% of users'
- confidence: quoted
- source: https://code.claude.com/docs/en/costs (unknown (fetched 2026-09-08))
- note: API-billed populations. Implies a typical enterprise developer's API spend is roughly the Max 20x price: $200 / $150-250 = 0.8x-1.3x, i.e. near parity, not a deep discount.

### 35. Community leaderboard: API-equivalent spend distribution of Claude Code users

- value: '89% of developers on viberank burn more than $200/month in API-equivalent cost'; median $1,450/month; top 10% over $7,358; n=1,099 developers; plan prices checked 2026-08-05
- confidence: quoted
- source: https://www.viberank.app/calculator (2026-08-05)
- note: ccusage computes at model list prices; self-selected 'tokenmaxxing' population, so heavily biased upward vs Anthropic's $150-250 figure. Implied Max 20x discount: median 1450/200 = 7.3x; top decile 7358/200 = 36.8x (derived).

### 36. Community leaderboard: August 2026 monthly aggregate

- value: $3,251,825 API-equivalent across 215 devs; 4.2T tokens; '97% cache reads'; median $6,085; top 10% above $33,894; Claude: 189 devs, $2,905,208
- confidence: quoted
- source: https://www.viberank.app/stats/monthly/2026-08 (2026-08-31)
- note: 'API-equivalent values computed by ccusage from model list prices; developers on flat-rate subscriptions pay less.' The 97% cache-read share means dollar figures are dominated by cache-read pricing; on Fable 5.1 (0.025x) the same tokens would cost far less than on 0.1x models.

### 37. Community estimate of heavy Max 20x API-equivalent value

- value: Max 20x user using ~30 h/week of Opus ≈ $5,800/month API-equivalent, i.e. the $200 Agent SDK credit would be a ~~29x effective price increase; one documented case of '$15,000 in API-equivalent value across eight months on a $100/month Max plan' (~~$1,875/month, 18.75x)
- confidence: estimated
- source: https://gist.github.com/MagnaCapax/d9177e35b355853f03c730dfcaa693ef (2026-05 (gist written before 2026-06-15))
- note: Community analysis at June 2026 API rates (Opus 4.7 $5/$25). Gist notes $200 buys ~13.3M Opus tokens or ~22M Sonnet 4.6 tokens at blended rates. Not an Anthropic figure.

### 38. OpenAI: losing money on ChatGPT Pro

- value: Sam Altman, 2025-01-05: 'I personally chose the price, and thought we would make some money'; losing money on $200 Pro because 'people use it much more than we expected'
- confidence: quoted
- source: https://techcrunch.com/2025/01/05/openai-is-losing-money-on-its-pricey-chatgpt-pro-plan-ceo-sam-altman-says/ (2025-01-05)
- note: Earliest public admission that a flat $200 tier is underwater on power users.

### 39. OpenAI Codex plan structure and credit metering (2026)

- value: Codex included in Free/Go $8/Plus $20/Pro $100 (5x) and $200 (20x)/Business $20-25; local-message caps per 5-hour window plus weekly limits; Plus/Pro can 'purchase additional credits'; per-model credit rates e.g. GPT-6 Astra 250 credits per 1M input / 1,250 per 1M output, GPT-5.6 Sol 100/10 cached/500, Terra 50/5/300
- confidence: quoted
- source: https://learn.chatgpt.com/docs/pricing (unknown (fetched 2026-09-08))
- note: Dollar price per credit not on the page; secondary (morphllm) says $0.04/credit, which would make Astra credits $10/$50 per MTok — i.e. overflow at API-style rates, mirroring Anthropic's usage credits.

### 40. OpenAI restores 5-hour Codex cap, rationale

- value: 2026-08-25: five-hour cap returns for Plus on Codex/ChatGPT Work; Thibault Sottiaux: it 'allows us to smoothen the load on our compute, allowing to keep the plan generous in terms of weekly usage'; Pro $100/$200 exempt 'for the upcoming months'
- confidence: quoted
- source: https://9to5mac.com/2026/08/24/openai-restores-5-hour-codex-and-work-limits-for-chatgpt-plus-users/ (2026-08-24)
- note: Cap had been lifted 2026-07-12 (per search summary). Same compute-smoothing logic as Anthropic's session windows.

### 41. Anthropic growth vs capacity (CEO)

- value: Dario Amodei: 'We tried to plan very well for a world of 10x growth per year. And yet we saw 80x.'; $30B annualized run rate as of April 2026; Claude Code >$2.5B run-rate by Feb 2026, $1B within six months of launch
- confidence: quoted
- source: https://venturebeat.com/technology/anthropic-says-it-hit-a-30-billion-revenue-run-rate-after-crazy-80x-growth (2026-05-08)
- note: Article cites emergency compute deals with SpaceX, Amazon, Google and 'inevitable strain on our infrastructure'.

### 42. Anthropic revenue mix (analyst estimate)

- value: API ~70-75% of revenue; consumer subscriptions 10-15%; $47B ARR May 2026, $65B July 2026; enterprise >half of Claude Code revenue
- confidence: estimated
- source: https://sacra.com/c/anthropic/ (unknown (page undated; figures through 2026-07))
- note: Sacra estimates, not disclosures. Subscriptions are a minority of revenue, which is consistent with Anthropic being willing to fence them tightly.

### 43. Analyst view on direction of subscription pricing for agents

- value: Sanchit Vir Gogia (Greyhound Research): 'Over the next 12 to 24 months, enterprises should expect more vendors to create separate consumption pools for agents'
- confidence: quoted
- source: https://www.infoworld.com/article/4171274/anthropic-puts-claude-agents-on-a-meter-across-its-subscriptions.html (2026-05-14)
- note: Same article: the line 'heavy agentic users were consuming far more compute than a $20 or $100 subscription could support' is from Advait Patel (Broadcom SRE), not Anthropic; 'compute capacity restraints' is InfoWorld's paraphrase of Anthropic's April X post.

### 44. Off-peak doubling promo, March 2026

- value: 2026-03-13 to 03-28: 2x Claude Code 5-hour limits outside 8 AM-2 PM ET weekdays and all weekend; ended on schedule
- confidence: quoted
- source: https://explainx.ai/blog/claude-usage-limits-2026-timeline-explained (2026-07-05 (updated 2026-08-17))
- note: Secondary; Register 2026-03-31 independently mentions the promo ending March 28.

## Not found

- Exact launch dates of 'extra usage' (now 'usage credits') for Max (mid/late 2025) and for Pro (late 2025) — only confirmed that Max could buy additional usage at API rates by 2025-07-28 and that Pro can today
- A primary Anthropic source for the 2026-05-06 permanent doubling of 5-hour limits and removal of peak-hour throttling (only the explainx timeline)
- The date and announcement of the Enterprise plan's switch from seat-based usage to '$20/seat + all usage at API rates' (only the current help-center wording and 'transition at renewal')
- Primary confirmation and date of the Team Premium seat price cut from $150 to $100 annual (secondary sources put it around Jan 2026)
- The discount percentage on the April 2026 'extra usage bundles' offered to displaced third-party-tool users
- Any Anthropic statement quantifying how much API-equivalent compute a heavy Max user consumes, or subscription gross margin / loss on power users
- Any Anthropic or OpenAI 2026 statement literally saying they lose money on subscriptions (only the Jan 2025 Altman statement and capacity/strain language)
- The dollar price per OpenAI Codex credit on an OpenAI page (only the secondary figure $0.04/credit)
- The reported 'permanent 25% weekly increase replacing the 50% promo' (explainx, Aug 30 2026) — absent from Anthropic's promotion article, which says limits return to standard after 2026-09-13
- Axios 2026-05-14 'Anthropic tightens Claude limits as OpenAI courts agent users' — returned HTTP 403, so its OpenAI-side claims are unverified
- Token- or dollar-denominated definitions of Pro/Max session and weekly limits (Anthropic publishes only multipliers and 2025-era hour ranges)
