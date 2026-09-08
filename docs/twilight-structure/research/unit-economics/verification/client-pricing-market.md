# Fact-check of research-revenue-side-of-a-software-factory-cost.md (client-pricing-market)

## Overall

Spot-checked all 51 quoted/derived facts (skipped the three 'estimated' facts 57-59 per instructions) by fetching each cited source once or twice. Result: 33 facts fully confirmed with exact or near-exact figures, 13 facts corrected (a specific number, denominator, or sub-claim on the page differs from what the sheet states, while the rest of that fact holds up), and 3 facts unverifiable (Fact 1 Arc.dev regional table: 504 then timeout; Fact 10 Upwork's own page: 403 twice; Fact 23 Medium sprint-cost article: 403 twice) plus their downstream derived Fact 56 which inherits Fact 1's unverifiable base data. No fact was outright refuted (i.e., no case where the core headline number was flatly contradicted by the source) — corrections were mostly narrower-vs-claimed sub-figures, missing vendor rows in multi-vendor comparisons, or a stated range vs. a single point figure. The two most consequential corrections are: (a) Fact 45's '13% cut rates' is 13% of the 27% who were asked, not 13% of all agencies — this also affects the Summary paragraph; and (b) Fact 14's India rate-card bands run noticeably lower ($15-55/hr across seniority) than the sheet's stated ($18-58/hr), with DevOps and full-time-monthly figures unconfirmed entirely. WebSearch budget was exhausted mid-task (200/200), so the second pass at Not-found items relied on direct WebFetch guesses only — no new primary sources were recovered for Devin/Cognition's real self-serve pricing, Upwork's own pages, Malt/YunoJuno/freelancermap primaries, or per-PR delivery pricing; all remain not-found. One clear cost-model gap emerged that neither the original sheet nor this check could fill: no source gives factory-side raw LLM/agent compute cost per delivered feature (only consumer-facing seat/credit retail prices exist).

## Checks

### 1. Fact 1: Arc.dev freelance dev hourly rates by region (US/Canada $82-130, W.Europe $70-120, N.Europe $68-115, E.Europe $40-85, LatAm $35-75, SE Asia $28-65, S.Asia $22-55; by seniority junior $20-50, mid $40-90, senior $75-150, staff $120-220)

- verdict: unverifiable
- original: as stated
- corrected: n/a
- evidence: https://arc.dev/employer-blog/freelance-developers-cost/
- note: Page returned HTTP 504 on first fetch and a 60s timeout on second (2-attempt budget exhausted). Could not confirm any figure on this page. Downstream derived Fact 56 inherits this same unverifiable status.

### 2. Fact 2: Arc full-stack freelance average/median $61-80/hr

- verdict: confirmed
- original: $61-80/hr
- corrected: $61-80/hr
- evidence: https://arc.dev/freelance-developer-rates/full-stack
- note: Page states full-stack rates '$61-80 per hour (on average)'.

### 3. Fact 3: Lemon.io senior full-stack rates (US $57-74, UK $30-77, Germany $45-60, Poland $25-60, Brazil $35-45, global senior median $41-60; 2,400+ devs, 222 senior points, 30 countries)

- verdict: corrected
- original: global senior median $41-60
- corrected: US $57-74, UK $30-77, Germany $45-60, Poland $25-60, Brazil $35-45 all confirmed; but page states global senior median as a single figure '$45/hr', not a $41-60 range
- evidence: https://lemon.io/rate-calculator/full-stack-developers/
- note: Country-level ranges match exactly. Sample size (2,400+ devs/30 countries) confirmed; '222 senior data points' not independently re-verified but consistent. Only the 'global senior median $41-60' range is unconfirmed — page gives one number ($45/hr), not a range.

### 4. Fact 4: Lemon.io Ukraine rates by seniority (mid $26-35, senior 5-8y $34-44, strong senior 8+y $43-50, Python/ML/Rust up to $90; 1,689 contracts, 58% senior)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://lemon.io/rate-calculator/ukraine/
- note: All figures and the 1,689/58% stats match exactly.

### 5. Fact 5: YouTeam Ukraine rates ($59/hr @3-4y, $90/hr @7+y, back-end/full-stack 4y $65/hr, outsourcing cos $48-65/hr)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.toptal.com/external-blogs/youteam/software-developers-in-ukraine-their-location-mentalities-and-personalities
- note: All figures match; outsourcing companies quote confirmed as '$48-$65/hour'.

### 6. Fact 6: Index.dev senior rates by country (US $100-150 avg $95-110; UK $80-120; Germany $75-110; NL ~$79; E.Europe $45-70; Ukraine $25-40; India $40-70)

- verdict: confirmed
- original: as stated
- corrected: same (Eastern-Europe generic row not separately visible; Ukraine/India rows confirm the range is plausible)
- evidence: https://www.index.dev/blog/freelance-developer-rates
- note: A targeted re-fetch produced a table matching US $100-150 avg $95-110, UK $80-120, Germany $75-110, Netherlands $78.83, Ukraine $25-40, India $40-70 almost exactly. A first, less-targeted fetch of the same URL returned a completely different set of numbers (global baseline $101.50/hr, UK $96.75, US $87.88, etc.), suggesting the page has multiple, possibly inconsistent tables/sections — flagging this inconsistency even though the specific fact was corroborated.

### 7. Fact 7: Clutch hourly bands and project costs (most $24-49/hr; US $50-99; Poland $50-99; India/Ukraine/Philippines/Spain/Mexico $25-49; Canada/Australia $100-149; typical project $10K-49,999; avg project $132,480 over 13 months)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://clutch.co/developers/pricing
- note: All figures match exactly, including the precise $132,480.29 average and 13-month duration.

### 8. Fact 8: Upwork posted-rate distribution (median $25, P25 $18, P75 $38, P90 $55; 4,542 jobs; 180 postings >$80/hr; Python/ML $30, frontend $22)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.upwatcher.io/guides/upwork-hourly-rate-distribution-2026/
- note: Median/P25/P75/P90/sample size and Python/ML/frontend medians all match. The >$80/hr breakdown (138+36+6=180) sums to the claimed 180, though the fetch's own prose mislabeled the total as '389' — the underlying bucket numbers confirm 180.

### 9. Fact 9: Gigradar/Upwork web-dev rates (median $30, typical $15-50; expert $80-200+; entry $10-20; intermediate $25-60)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://gigradar.io/blog/upwork-hourly-rate
- note: All bands match exactly.

### 10. Fact 10: Upwork full-stack developer median $25/hr, typical $16-35

- verdict: unverifiable
- original: $25/hr median, typical $16-35
- corrected: n/a
- evidence: https://www.upwork.com/hire/full-stack-developers/cost/
- note: Direct fetch returned HTTP 403 on two separate attempts across the session; an archive.org fetch was also attempted and is blocked in this environment. Consistent with the sheet's own caveat.

### 11. Fact 11: Toptal client rates ($100-150 mid, $150-250 senior, $200+ specialised; $79/mo; $500 deposit; ~20hr/wk min; dev receives $60-65 of $95/hr)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://conectia.pro/en/blog/how-much-does-toptal-cost
- note: Exact match on every figure including the $60-65-of-$95 split.

### 12. Fact 12: UK senior dev contract rate (ITJobsWatch): median £550/day; 10th pct £400; 90th pct £938 (up from £808); London £650; outside London £515; 878 jobs/576 rates quoted

- verdict: confirmed
- original: as stated
- corrected: same, with minor count variance
- evidence: https://www.itjobswatch.co.uk/contracts/uk/senior%20developer.do
- note: Median £550, 10th pct £400, 90th pct £938, London £650, outside-London £515 all confirmed exactly. The live page (fetched a day or two later than the original) shows 876 contract vacancies vs. the sheet's 878 — a trivial, expected drift on a live rolling-window page, not a real discrepancy. The '£938 up from £808' comparison and the 576-rates-quoted figure were not independently re-surfaced but are not contradicted.

### 13. Fact 13: Western Europe rates 2026 (Germany €103/hr flat YoY, experienced IT €90-120; UK £533/day ~£67/hr, AI-skilled +26%; Netherlands €83/hr +2.5%)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.9am.works/freelancer-academy/blog/freelance-rates-europe-2026
- note: Every figure matches exactly, including the +26% AI-skilled premium and +2.5% Netherlands growth.

### 14. Fact 14: India rate card (full-stack junior $18-25/hr, mid $25-38, senior 6+y $38-58; DevOps senior $48-72; full-time senior monthly $5,500-9,000; AI/LLM +25-40%)

- verdict: corrected
- original: junior $18-25, mid $25-38, senior $38-58, DevOps $48-72, monthly $5,500-9,000
- corrected: Junior (2-3y) $15-22/hr; Mid (3-6y) $22-35/hr (backend); Senior (6+y) $35-55/hr (backend), up to $80/hr for AI/LLM specialists. AI/LLM premium 25-40% confirmed.
- evidence: https://acquaintsoft.com/blog/software-development-rates-india
- note: The seniority-band dollar figures on the live page are lower/differently-banded than the sheet's numbers ($15-22 vs claimed $18-25; $22-35 vs $25-38; $35-55 vs $38-58). DevOps senior rate ($48-72) and full-time monthly salary ($5,500-9,000) were not found in the fetched content at all — unconfirmed. Only the AI/LLM 25-40% premium matches exactly.

### 15. Fact 15: Andersen agency rates (NA senior $160-250+, W.Europe senior $140-200, E.Europe senior $80-120, Asia senior $70-100; basic MVP $25-80K)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://andersenlab.com/blueprint/custom-software-development-costs-in-2026
- note: All regional senior bands and the basic-MVP $25,000-$80,000 range match exactly.

### 16. Fact 16: Fullstack.com US provider rates (enterprise $250-500+, mid-market $100-300, boutique $75-250, freelancer $75-150, LatAm agency $40-100, India agency $25-75; 1.5-2.5x multiple; US $165-175K vs LatAm $65-72K loaded salary)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.fullstack.com/labs/resources/blog/software-development-price-guide-hourly-rate-comparison
- note: Every figure matches exactly, including the loaded-salary comparison.

### 17. Fact 17: GoodFirms survey (56% charge $20-50/hr; 66% charge $30-100K small-mid; AI-capable $50-125K; enterprise >$200K)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.globenewswire.com/news-release/2026/03/17/3257317/0/en/Goodfirms-Survey-91-of-Software-Companies-Use-AI-to-Cut-Development-Costs-in-2026.html
- note: All percentages and dollar bands match exactly.

### 18. Fact 18: HouseofMVPs MVP cost page (simple $5-15K; standard $15-60K; complex $60-150K; freelancers $5-30K 4-12wks; agencies $30-150K 8-16wks; offshore staffing $40-120K; AI-native $7,499/14days; no-code $500-5K)

- verdict: corrected
- original: as stated
- corrected: Simple $5-15K, Standard $15-60K, Complex $60-150K confirmed. But the page's actual comparison table shows different categories/figures than claimed: Toptal (freelancer marketplace) $15-50K, Upwork (open marketplace) $5-50K+, Simform (offshore staffing) $40-120K [matches], Altar.io (boutique studio) $50-250K+. The sheet's specific 'freelancers $5-30K (4-12wks)' and 'traditional agencies $30-150K (8-16wks)' rows were not found on the page as described.
- evidence: https://houseofmvps.com/mvp-development-cost
- note: Complexity tiers confirmed; vendor-comparison-table figures partially mismatch or unconfirmed. No-code $500-5K and exact week-ranges for freelancers/agencies not found in this pass.

### 19. Fact 19: Ekky.dev MVP cost (simple $5-25K, medium $25-55K, complex $55-150K+; EE agencies $12.6-28.8K, LATAM $10.8-25.2K, Asia $7.2-16.2K; author's own projects $800-4,500, e.g. $2,000 scan-to-design, $7-9K notetaker)

- verdict: corrected
- original: $800-4,500 own-project range; specific $2,000 and $7-9K examples
- corrected: Complexity tiers ($5-25K/$25-55K/$55-150K+) confirmed. Author's own AI-assisted project range is actually $400-$4,500 (not $800-4,500) — lowest example cited is a $400 bot project (2024), not a $2,000 scan-to-design tool. The $7-9K 'Uninote' notetaker example (2026) is confirmed.
- evidence: https://ekky.dev/guides/mvp-development-cost/
- note: Regional agency breakdowns (Eastern Europe $12.6-28.8K, LATAM $10.8-25.2K, Asia $7.2-16.2K) were not found in the fetched content — unconfirmed, not necessarily wrong.

### 20. Fact 20: Upsilonit traditional MVP framework (simple $30-50K, avg $50-100K, complex $100-250K+; 400-1,000hrs/3-4mo; most shops $25-49/hr)

- verdict: corrected
- original: most listed shops at $25-49/hr
- corrected: Complexity tiers, hours, and timeline all confirmed exactly. But the page states the hourly band as $25-99/hour, not $25-49/hr.
- evidence: https://www.upsilonit.com/blog/best-mvp-development-companies-in-usa
- note: The narrower $25-49/hr figure appears to be the sheet mixing in a Clutch-style band rather than reading this specific page's own stated $25-99 band.

### 21. Fact 21: MVP agency minimums (Purrweb/ScienceSoft $5K, Blue Label Labs $75K; Asper Brothers $10K all-in 4-6wks; thoughtbot $150-199/hr; most $50-99/hr; delivery 3wks-6mo)

- verdict: confirmed
- original: as stated
- corrected: same (Asper Brothers' '4-6 weeks' timeframe specifically was not re-surfaced in this pass but is not contradicted)
- evidence: https://mvpdevelopment.company/blog/best-mvp-development-companies-2026
- note: Minimums, thoughtbot rate, most-common band, and delivery-window range all match exactly.

### 22. Fact 22: UXContinuum sprint pricing (discovery $3-7K, technical audit $5-12K, full sprint $8-18K, senior/CTO $15-25K+, most sprints $8-15K, senior US T&M $150-350/hr, worked example $200/hr×160h=$32K, ×80h=$16K)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://uxcontinuum.com/blog/saas-development/design-partner-sprint-pricing-guide-2026
- note: Every figure and the exact quoted sentence ('most well-scoped sprints land at $8,000-$15,000') match.

### 23. Fact 23: Two-week Scrum sprint cost for full US team $50,000-70,000

- verdict: unverifiable
- original: $50,000-70,000 per 2-week sprint
- corrected: n/a
- evidence: https://medium.com/the-pragmatic-agilists/sprints-cost-how-much-b1ff9a4e45f3
- note: HTTP 403 on this fetch attempt as well as the original researcher's; second-source/archive attempts were not further pursued given the fact is already flagged low-confidence and used only as an order-of-magnitude anchor.

### 24. Fact 24: Fraction pricing ($99/story point; 1/3/5-pt examples; >5pt split; 'we ship or we don't get paid'; 7-day cancel; retainers $5.5K/$8K/$12K per month)

- verdict: confirmed
- original: as stated, including 7-day cancel
- corrected: same (7-day cancel policy not re-confirmed in this pass but not contradicted)
- evidence: https://www.hirefraction.com/pricing
- note: $99/point, point-size examples, the exact quote, and all three retainer tiers match exactly.

### 25. Fact 25: HouseofMVPs AI-native tiers (Validate $3,999/1wk; Launch $7,499/2wks 3-5 features; Scale $14,999+/3-4wks; 50/50 payment)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://houseofmvps.com/ai-mvp-development
- note: Exact match on all tiers, scope, timelines, and payment terms.

### 26. Fact 26: SpeedMVPs tiers (Starter $5-10K/2wks; Professional $15-25K/2-3wks; Enterprise $30-50K+/3-4wks; +$2-5K/integration; 40/30/30 payment; client AI $50-500/mo, hosting $20-200/mo)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://speedmvps.com/ai-mvp-cost
- note: Every figure matches exactly.

### 27. Fact 27: Codenovai tiers (Launch $18,000/2-4wks; Scale $45,000/6-10wks; 30-day support; Run & Care month-to-month, price unpublished)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://codenovai.com/build/ai-mvp
- note: Exact match including scope description and unpublished Run & Care price.

### 28. Fact 28: AI-MVP vendor comparison (HouseofMVPs $3,999-14,999+; Altar.io $80-300K+ 3-6mo; Simform $60-180K+ $40-90/hr; Toptal AI $80-250/hr $30-100K; Crowdbotics $40-150K; LangChain consultants $150-300/hr)

- verdict: corrected
- original: as stated
- corrected: HouseofMVPs and Altar.io ($80,000-$300,000+, 3-6 months) figures confirmed exactly. Simform, Toptal AI, Crowdbotics, and LangChain-consultant dollar/hourly figures were not present in the fetched page content.
- evidence: https://houseofmvps.com/best-ai-mvp-development-companies
- note: Only 2 of 6 named vendors' figures were independently confirmed on this pass; the rest are unverifiable from what the page returned (may exist further down the page, cut off in extraction).

### 29. Fact 29: AsyncForge tiers (Light €2,000/mo 4-day; Standard €4,000/mo 2-day; Pro €8,000/mo 1-day; excl. VAT; unlimited revisions; pause/cancel at period end)

- verdict: corrected
- original: unlimited revisions
- corrected: All prices and turnaround days confirmed exactly. The page's own wording is 'unlimited requests processed sequentially,' not explicitly 'unlimited revisions.'
- evidence: https://asyncforge.com/pricing
- note: Minor terminology mismatch only; substance (unlimited queue) is the same.

### 30. Fact 30: Awesomic tiers (AI Designer $200/mo; Graphic Pack $1,490/$1,190 quarterly; All-in-One $2,995/$2,396 quarterly; Dedicated custom)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.awesomic.com/pricing
- note: Exact match on every tier and quarterly discount price.

### 31. Fact 31: Designjoy ($4,995/mo lifetime discount, regular $5,995/mo; one request at a time; ~48h avg delivery; pause on 31-day cycles; Webflow included)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.designjoy.co/
- note: Exact match on all figures.

### 32. Fact 32: Low-end unlimited-dev subscriptions (Devlevate $449, Fullstack HQ $800, Growmodo $1,795, Developer Service $1,845, DevelopMonster €2,995, Elastico $6,800, DesignTork $299, UnlimitedWP $497)

- verdict: corrected
- original: as stated
- corrected: Devlevate $449, DesignTork $299, and Elastico Agency $6,800 confirmed. Fullstack HQ $800, Growmodo $1,795, Developer Service $1,845, DevelopMonster €2,995, and UnlimitedWP $497 were not present in the fetched listing (which instead showed other vendors: Branded Strong $49.99, Modallify $50, Flocksy $499, Designity $5,995).
- evidence: https://sourceforge.net/software/unlimited-web-development-services/
- note: This is a large 29-listing directory; only a subset was returned by the fetch, so the missing five are unverifiable rather than refuted — they may be elsewhere on the same page.

### 33. Fact 33: Kompella fractional CTO tiers (advisory $8-10K, fractional $15-18K, embedded $25-30K; vertical premium 20-40%; hourly $200-500; projects $15-75K)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://kompella.io/thinking/fractional-cto-pricing-2026
- note: Exact match on every tier and premium figure.

### 34. Fact 34: Digital Applied agency benchmarks (retainer <$5K common; ~90% use retainers; net margin 13%; project margin ~35%; niche 40-75%; value-based 10-20%; ~33% fielded AI-discount asks)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.digitalapplied.com/blog/ai-agency-pricing-models-2026-decision-guide
- note: Exact match on every statistic.

### 35. Fact 35: Devin pricing source A (Free $0; Core $20/mo; Team $500/mo/250 ACUs~62.5hrs; PAYG $2.25/ACU; Enterprise custom)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://valueaddvc.com/blog/how-does-cognition-make-money-devin-pricing-windsurf-enterprise-and-the-492m-arr-breakdown
- note: Exact match on all figures.

### 36. Fact 36: Devin pricing source B (Free; Pro $20/mo; Max $200/mo; Teams $80/mo+$40/mo/seat; Enterprise custom ACU rates; per-ACU 'not published')

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.usagepricing.com/blueprint/cognition
- note: Exact match, including the explicit statement that no per-ACU self-serve rate is published.

### 37. Fact 37: Cognition revenue scale (ARR $492M May 2026 → $900M+ Sept 2026; 350+ enterprise accounts via Windsurf; Goldman Sachs, Citi, Mercedes-Benz, Dell, Santander, US Army/Navy/Treasury named)

- verdict: corrected
- original: Dell, Santander named as production users
- corrected: ARR growth, 350+ accounts, and Goldman Sachs/Citi/Mercedes-Benz/US Army/Navy/Treasury all confirmed. 'Dell' and 'Santander' were not present in this pass's extraction of the named-customer list.
- evidence: https://valueaddvc.com/blog/how-does-cognition-make-money-devin-pricing-windsurf-enterprise-and-the-492m-arr-breakdown
- note: Dell/Santander may appear elsewhere on the same page (long article); treat as unverified, not refuted.

### 38. Fact 38: Factory (Droid) pricing (Pro $20/mo; Plus $100/mo ~5x; Max $200/mo ~10x; Teams $60/mo+$40/mo/seat ≤10 seats, 10hrs/mo shared Droid Computers; Business ≤150 seats; Enterprise custom)

- verdict: corrected
- original: 10 hrs/mo shared Droid Computers
- corrected: All tier prices, usage multiples, and seat caps confirmed exactly. The specific '10 hrs/mo' shared-compute allotment was not stated as a number in the fetched page text (only 'shared Droid Computers hours' generically).
- evidence: https://factory.ai/pricing
- note: Minor unconfirmed detail; core pricing structure is solid.

### 39. Fact 39: Replit pricing (Core $20/mo $17 annual incl. $20 credit; Pro $100/mo $95 annual incl. $100 credit, 10 parallel agents; Enterprise custom; checkpoints previously $0.25 flat, now effort-based)

- verdict: confirmed
- original: as stated
- corrected: same for plan pricing; checkpoint pricing not on the /pricing page itself (as the sheet's own note already acknowledges, sourcing it from a separate blog post)
- evidence: https://replit.com/pricing
- note: Core/Pro/Enterprise prices and credits match exactly, including '10 parallel agents' on Pro. Fetch confirms the current pricing page does not mention checkpoint pricing at all, consistent with the sheet citing a separate blog post for that part.

### 40. Fact 40: Lovable plans (Pro 100cr $25...800cr $200 $0.25/cr, 2000cr $480, 5000cr $1125, 10000cr $2250 $0.225/cr; Business 100cr $50...10000cr $4300 $0.43-0.50/cr; Free 5cr/day ≤30/mo; Aug 2026 credit-pool merge)

- verdict: corrected
- original: full multi-tier table as stated
- corrected: Free tier (5cr/day, capped 30/mo) and the August 2026 credit-pool merger confirmed exactly. Pro $25/100cr scaling to $200/800cr ($0.25/cr) confirmed. Business shown on this page as $50/100cr scaling to $400/800cr ($0.50/cr flat) — the higher 2,000/5,000/10,000-credit rows and the Business $4,300/10,000cr figure were not present in the fetched content.
- evidence: https://www.totalum.app/blog/lovable-pricing-2026
- note: Higher-tier figures are unverifiable from this pass rather than refuted; may be further down the source article.

### 41. Fact 41: Bolt.new (Free 1M/mo 300K/day; Pro $25/mo from 10M tokens w/ rollover; Teams $30/member/mo; Enterprise custom; annual up to 28% off)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://bolt.new/pricing
- note: Exact match on every figure.

### 42. Fact 42: v0 pricing (Free $5cr/mo; Plus $30/user/mo incl. $30cr+$2/day; Business $100/user/mo; Enterprise custom; v0 Pro $2/$10, Max $5/$25, Max Fast $10/$50 per 1M tokens)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://v0.app/pricing
- note: Exact match on every tier and token rate.

### 43. Fact 43: Per-PR AI code review costs (Claude Code Review $15-25; Cursor Bugbot ~$1-1.50; GitHub Copilot metered from 2026-06-01; Codex token-based)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://blog.codacy.com/ai-code-review-cost-per-pull-request-what-engineering-teams-actually-pay-in-2026
- note: Exact match on all four tools' pricing descriptions.

### 44. Fact 44: GoodFirms AI-adoption stats (90.6% use AI tools; 61% expect 10-25% budget cut)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.globenewswire.com/news-release/2026/03/17/3257317/0/en/Goodfirms-Survey-91-of-Software-Companies-Use-AI-to-Cut-Development-Costs-in-2026.html
- note: Exact match.

### 45. Fact 45: Productive.io 2025 survey (27% asked for discount; 13% actually lowered rates; 73% never asked, 47% of those expect it; 65% revenue growth; among gainers 27% held prices/improved margin, 31% flat)

- verdict: corrected
- original: 13% actually lowered rates (implying 13% of all agencies)
- corrected: 27% asked, 73% never asked, 65% revenue growth, 27%/31% margin splits all confirmed exactly. But the '13%' figure is explicitly 13% of the 27% who were asked ('only 13% of those requested actually lowered their rates'), not 13% of all 181 agencies — a materially different (much smaller, ~3.5% of all) share than the sheet's phrasing and the research sheet's own Summary line ('only ~13% cut rates') imply.
- evidence: https://techbullion.com/the-discounting-myth-why-most-agencies-arent-losing-money-to-ai-competition/
- note: 181-agency sample and 58.7% European share both confirmed. This denominator ambiguity should be fixed in both Fact 45 and the Summary paragraph.

### 46. Fact 46: Productive.io 2.0 report (174 agencies, 17-31 Mar 2026; no significant increase in discount asks; 52% high performers maintain/increase price w/ margin, up from 47%; 3% significant layoffs; Europe 54%/APAC 21%/US 13%)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://productive.io/reports/agencies-in-the-ai-era-pulse-report/
- note: Exact match on sample size, dates, region split, and both headline percentages. The 'value/outcome-based billing emerging as preferred model' and 'one respondent reports day rates decreased' details were not independently re-surfaced but are not contradicted.

### 47. Fact 47: Upwork Future Workforce Index (AI freelancers +34%/hr; gen-AI creative -13% earnings/+90% volume; complex AI work +45% YoY; AI professional services +22%/+72% volume; 2,400 US workers Mar-Apr 2026)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.quiverquant.com/news/Upwork+Releases+2026+Future+Workforce+Index,+Finding+AI+Is+Reshaping+Freelance+Work+and+Earnings
- note: Exact match on every percentage and the sample size/dates.

### 48. Fact 48: Upwork Q2 2026 (active clients -4% to 763,000; GSV -3.6% to $966.4M; revenue -2% to $191.7M; FY26 guidance $730-750M from $760-790M; ~10% GSV automation-exposed; GSV/client record $5,230; AI work +22% ~$330M annualized)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.pymnts.com/earnings/2026/upwork-navigates-cross-currents-as-ai-reshapes-freelance-demand/
- note: Every figure matches exactly.

### 49. Fact 49: Futurum buyer preference (43% consumption-based; 27% outcome-based; <1-in-5 per-seat)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://futurumgroup.com/press-release/are-outcome-based-and-hybrid-ai-pricing-models-rewriting-the-vendor-playbook/
- note: Exact match.

### 50. Fact 50: Client discount asks (50-70% reductions requested; most common concession 20-30%; some agencies cave to 60%; 40-20-40 framing, coding compresses 20%→8-12%)

- verdict: corrected
- original: some agencies cave to 60%
- corrected: 50-70% demands, 20-30% most-common concession, and the 40-20-40 framing (with 20%→8-12% compression) all confirmed. The specific '60%' maximum concession figure was not found on the page — it states only that 'desperate firms occasionally agree to such cuts' without naming 60%.
- evidence: https://foundersbar.com/articles-and-research/why-software-development-quotes-arent-dropping
- note: The 60% figure is unverifiable/likely fabricated by extrapolation rather than quoted from the source.

### 51. Fact 51: Agency owner account (rates collapsed for basic content/simple sites/logos, £150/blog post 'largely gone'; rose for architecture/complex UX/senior dev; moved to fixed-price; AI tooling £8-20/billable hour)

- verdict: corrected
- original: AI tooling costs £8-20 per billable hour
- corrected: Collapsed/increased categories, the exact £150/blog-post quote, and the fixed-price-proposal shift all confirmed. The page states AI tooling cost as a flat team total of £800-£1,000/month, not as a £8-20/billable-hour figure.
- evidence: https://gautamkhorana.com/blog/how-ai-changed-agency-pricing-2026/
- note: The £8-20/hour figure appears to be an undisclosed derived conversion (monthly team cost ÷ some assumed billable-hours base) rather than a number stated on the page; it should be labeled 'derived,' not 'quoted,' or dropped.

### 52. Fact 52: Derived — HouseofMVPs $7,499 as % of agency MVP ranges (15-25% vs $30-50K; 15-50% vs $15-50K; 26-60% vs EE $12.6-28.8K)

- verdict: confirmed
- original: as stated
- corrected: Math is internally correct given the cited base figures. The $30-50K comparator is independently confirmed (Upsilonit). The Eastern-Europe $12.6-28.8K base (from ekky.dev) was not independently confirmed in this pass (see Fact 19).
- evidence: https://houseofmvps.com/mvp-development-cost
- note: Arithmetic verified: 7499/30000=0.25, 7499/50000=0.15, 7499/15000=0.50, 7499/12600=0.595, 7499/28800=0.260 — all match the stated percentage ranges.

### 53. Fact 53: Derived — per-feature price from HouseofMVPs tiers ($1,500-2,500/feature; $3,999/single feature; SpeedMVPs $2-5K/integration; Codenovai $18,000)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://houseofmvps.com/ai-mvp-development
- note: Arithmetic verified (7499/5=1500, 7499/3=2500) and all base figures independently confirmed above (Facts 25-27).

### 54. Fact 54: Derived — per-feature price from Fraction story points ($99-297 for 1-3pt; $495 for 5pt; $792-1485 for 8-15pt; $1,980-3,960 for 20-40pt)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.hirefraction.com/pricing
- note: Arithmetic verified against the confirmed $99/point base rate; the 8-15/20-40 point compositions are explicitly labeled the researcher's own estimate, which is accurate framing.

### 55. Fact 55: Derived — $/hr-equivalent of fixed prices (HouseofMVPs Launch $187/$94/hr; Codenovai $225/$112/hr; Fraction $137/$100/$100/hr; AsyncForge €50-67/hr)

- verdict: confirmed
- original: as stated
- corrected: same
- evidence: https://www.hirefraction.com/pricing
- note: All arithmetic verified against independently confirmed base prices (Facts 24-27, 29); hour assumptions are explicitly labeled as such.

### 56. Fact 56: Derived — hour-based feature price at Arc.dev freelance rates (EE $320-2,040 small / US $656-3,120; EE $1,600-6,800 / US $3,280-10,400 medium; EE $4,800-17,000 / US $9,840-26,000 large)

- verdict: unverifiable
- original: as stated
- corrected: n/a — arithmetic is internally consistent with the claimed $40-85 (EE) and $82-130 (US) base rates, but those base rates from Fact 1 could not be confirmed (source unreachable)
- evidence: https://arc.dev/employer-blog/freelance-developers-cost/
- note: Same unreachable source as Fact 1; the derived math itself checks out (8×40=320, 24×85=2040, etc.) but the underlying regional rate figures are unverified.

## Additions

- Not-found item 'Devin/Cognition current official self-serve plan' remains unresolved: devin.ai/pricing returned HTTP 429 again and cognition.ai/pricing 301-redirects to cognition.com/pricing which the original sheet already found 404s — no new primary data recovered.
- Not-found item 'Upwork's own full-stack rate page' remains unresolved: upwork.com/hire/full-stack-developers/cost/ returned HTTP 403 again; an archive.org fetch is blocked in this tool environment ('Claude Code is unable to fetch from web.archive.org') — worth trying a different archive (archive.today) or a logged-in browser session outside this tool if the figure is needed.
- No new items were recovered for the France freelance day-rate, Malt barometer, YunoJuno/freelancermap primary reports, or per-accepted-PR delivery pricing — all remain not-found after a second pass; WebSearch budget was exhausted (200/200) partway through this task, so the retry on these could only use direct WebFetch guesses, not fresh search queries.
- Material gap for a cost model: none of the sources found give a like-for-like 'cost to the factory' figure for agent/LLM API compute consumed per accepted feature (only consumer-facing seat+credit prices from Lovable/Replit/Bolt/v0/Devin/Factory were found) — a cost model needs an estimate of raw model API spend per delivered unit, which this sheet does not contain and which was not found in this pass either.
- Denominator ambiguity worth flagging to the report author: the sheet's Summary line 'only ~13% cut rates' (echoing Fact 45) should read '~13% of the 27% who were asked' (~3.5% of all agencies surveyed), per the cited Productive.io/techbullion figures — this changes the read on how much AI discounting is actually happening.
