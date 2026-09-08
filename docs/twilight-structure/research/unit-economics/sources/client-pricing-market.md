# Revenue side of a software-factory cost model: what clients pay for custom software delivery in 2026 (rates by region, fixed/outcome pricing, productized dev subscriptions, AI-native vendor pricing, AI price-compression evidence) and derived revenue-per-unit ranges for a solo AI-native operator selling accepted, staging-proven deliverables to SMB/startup clients.

## Summary

Hourly rate cards in 2026 are wide and bimodal: posted Upwork rates have a $25/hr median (P90 $55), while senior freelance survey data (Arc, 5,302 devs) puts US/Canada at $82-130/hr, Western Europe $70-120, Eastern Europe $40-85, South Asia $22-55, and agency rate cards (Andersen, Fullstack Labs) sit 1.5-2.5x above freelancers (US boutique $75-250/hr, EE agency senior $80-120, India agency $25-75). Western European contract rates are flat year-on-year (UK senior dev contract median £550/day, Germany freelancer average €103/hr down €1), so there is no broad hourly-rate collapse; compression shows up instead as demand loss at the low end (Upwork active clients -4%, guidance cut, ~10% of GSV "automation-exposed") and as a widening spread (AI-skilled freelancers +34%/hr, generative-AI production contracts -13%). Agency surveys agree: 27-33% of agencies have been asked for an "AI discount" but only ~13% cut rates, 61% of dev shops expect AI to cut project budgets 10-25%, and the winners are moving to fixed-fee/retainer/outcome pricing and keeping the margin. Fixed-price norms for SMB/startup work cluster at $10K-$50K per project on Clutch (66% of GoodFirms respondents quote $30K-100K for small-mid projects), with simple MVPs $5K-25K, medium $25K-55K, and 30-day single-practitioner sprints $8K-25K. AI-native studios undercut that by 4-8x on published fixed prices: HouseofMVPs $3,999 (1 feature/1 week), $7,499 (3-5 features/2 weeks), $14,999+ (3-4 weeks); SpeedMVPs $5-10K starter, $2-5K per integration; Codenovai from $18K; and Fraction sells senior-US, agent-augmented delivery at $99 per story point (1/3/5-point tasks = $99/$297/$495) plus $5.5K-12K/month part-time retainers. Productized "unlimited dev" subscriptions price a one-request-at-a-time senior queue at €2,000-8,000/month (AsyncForge, by turnaround), $2,995 (Awesomic), with the design analog Designjoy at $4,995; cheap WordPress/Webflow subs run $449-1,845/month and fractional-CTO retainers $4K-25K/month. AI vendors themselves sell to end clients at $20-200/month seats plus usage (Replit checkpoints ~$0.25 baseline, Lovable $0.225-0.50/credit with a complex feature step costing 1.2-1.7 credits, Devin ACUs ~$2-2.25 on secondary sources), which sets a client's mental anchor for "the AI part" near zero and pushes what they will pay a factory toward accountability, acceptance and speed rather than hours. For a solo factory the defensible bands are: small accepted feature $300-2,500, medium $1,500-8,000, large $4,000-20,000, retainers $2,000-8,000/client-month at SMB cadence and $8K-15K for half-time-equivalent accountability, and an implied $100-300 per operator-hour if agents carry most of the build (versus $40-85/hr Eastern-European and $75-150/hr US senior freelance rate cards).

## Facts

### 1. Freelance developer average hourly rate by region (survey of 5,302 freelance developers)

- value: US & Canada $82-130/hr; Western Europe $70-120; Northern Europe $68-115; Eastern Europe $40-85; Latin America $35-75; Southeast Asia $28-65; South Asia $22-55
- confidence: quoted
- source: https://arc.dev/employer-blog/freelance-developers-cost/ (2026-05-26)
- note: Arc.dev survey + marketplace benchmarks. By seniority (global): junior $20-50, mid $40-90, senior (7-10y) $75-150, staff/principal $120-220.

### 2. Arc full-stack freelance average/median hourly rate band

- value: $61-80/hr average and median
- confidence: quoted
- source: https://arc.dev/freelance-developer-rates/full-stack (unknown)
- note: Page shows band only; no date, sample, or regional table rendered.

### 3. Lemon.io senior full-stack contract rates by country (real contract data, 2,400+ vetted devs, 222 senior data points, 30 countries)

- value: US senior $57-74/hr; UK $30-77; Germany $45-60; Poland $25-60; Brazil $35-45; global senior median $41-60
- confidence: quoted
- source: https://lemon.io/rate-calculator/full-stack-developers/ (2026-09 (quarterly report, Sept 2026))
- note: Marketplace contract rates (what Lemon.io clients pay), senior-only network. Mid-level US $42-51.

### 4. Lemon.io Ukrainian developer hourly rates by seniority (1,689 active contracts)

- value: Mid $26-35/hr; senior (5-8y) $34-44; strong senior (8+) $43-50; Python/ML/Rust seniors up to $90
- confidence: quoted
- source: https://lemon.io/rate-calculator/ukraine/ (2026-09)
- note: Senior contracts are 58% of Ukrainian placements on the platform.

### 5. YouTeam platform hourly rates for Ukrainian developers

- value: $59/hr at 3-4 yrs; $90/hr at 7+ yrs; back-end/full-stack with 4 yrs $65/hr; Ukrainian outsourcing companies $48-65/hr
- confidence: quoted
- source: https://www.toptal.com/external-blogs/youteam/software-developers-in-ukraine-their-location-mentalities-and-personalities (2025-05-19)
- note: Client-side price on YouTeam (agency-employed devs), higher than Lemon.io's freelance contract rates.

### 6. Index.dev compiled freelance rates by country (senior)

- value: US senior $100-150/hr (avg $95-110); UK senior $80-120; Germany $75-110; Netherlands ~$79 avg; Eastern Europe senior $45-70; Ukraine senior $25-40; India senior $40-70
- confidence: quoted
- source: https://www.index.dev/blog/freelance-developer-rates (2026-05-27)
- note: Secondary compilation from Arc, Upwork, FreelancerMap etc.; not primary contract data.

### 7. Clutch: hourly rate band most listed software development companies charge, and by country

- value: Most companies $24-49/hr; US $50-99; Poland $50-99; India, Ukraine, Philippines, Spain, Mexico $25-49; Canada/Australia $100-149
- confidence: quoted
- source: https://clutch.co/developers/pricing (2026-09-08 (page header))
- note: Directory self-reported bands. Typical reviewed project cost $10,000-$49,999; average reviewed project $132,480 over 13 months.

### 8. Upwork posted hourly-job rate distribution for developer work (4,542 hourly jobs with disclosed rates in a 30-day window)

- value: Median $25/hr; P25 $18; P75 $38; P90 $55; only 180 of 4,542 postings above $80/hr
- confidence: quoted
- source: https://www.upwatcher.io/guides/upwork-hourly-rate-distribution-2026/ (2026-05-16)
- note: Posted (client-offered) rates, which the source notes skew lower than lifetime earnings rates. Python/ML medians $30, frontend $22.

### 9. Upwork official median for web developers, and expert-tier band

- value: Web developer median $30/hr, typical band $15-50; expert/advanced $80-200+/hr; entry $10-20; intermediate $25-60
- confidence: quoted
- source: https://gigradar.io/blog/upwork-hourly-rate (2025-12-07)
- note: Secondary citing Upwork's cost-to-hire pages; Upwork's own pages returned HTTP 403 on direct fetch. Regional multipliers used: US/UK/W.Europe ~1.2x, South/SE Asia ~0.6x.

### 10. Upwork full-stack developer median hourly rate

- value: $25/hr median, typical $16-35
- confidence: quoted
- source: https://www.upwork.com/hire/full-stack-developers/cost/ (unknown)
- note: Seen only in a search-result snippet attributed to this page; direct fetch returned 403, so the current figure could not be verified.

### 11. Toptal client hourly rates (secondary; Toptal publishes no rate card)

- value: Mid-level ~$100-150/hr; senior/architect ~$150-250; specialised $200+; $79/mo subscription; $500 refundable deposit; ~20 hr/week minimum; developer receives ~$60-65 of a $95/hr engagement
- confidence: quoted
- source: https://conectia.pro/en/blog/how-much-does-toptal-cost (2026-05-27)
- note: Source states rates come from client-reported engagements, not an official list. Toptal's own /pricing page (fetched 2026-09-08) says only 'fixed price on a weekly basis, no hidden fees'. Other secondaries quote $60-200/hr.

### 12. UK senior developer contract day rate (ITJobsWatch, 878 contract jobs, 576 rates quoted)

- value: Median £550/day (flat YoY); 10th pct £400; 90th pct £938 (up from £808); London £650; outside London £515
- confidence: quoted
- source: https://www.itjobswatch.co.uk/contracts/uk/senior%20developer.do (2026-09-08 (6 months to 8 Sep 2026))
- note: £550/8h = £68.75/hr equivalent (derived).

### 13. Western Europe freelance rates 2026 (Germany, UK, Netherlands) from national rate studies

- value: Germany/DACH average €103/hr (down from €104; first year without growth in the study's history), experienced IT €90-120; UK software engineering £533/day (~£67/hr), AI-skilled engineers +26%; Netherlands average €83/hr (+2.5%)
- confidence: quoted
- source: https://www.9am.works/freelancer-academy/blog/freelance-rates-europe-2026 (2026-08-23)
- note: Secondary summarising freelancermap Freelancer-Kompass 2026, YunoJuno Rates Report 2026 (182,000+ bookings), Knab zzp-onderzoek 2026. Primary report pages returned 404 on the URLs tried. Germany figure is all freelancers, not dev-only.

### 14. India vendor-sourced developer rate card by seniority (employed devs at agencies)

- value: Full-stack: junior $18-25/hr, mid $25-38, senior (6+y) $38-58; DevOps senior $48-72; full-time senior monthly $5,500-9,000; AI/LLM integration +25-40%
- confidence: quoted
- source: https://acquaintsoft.com/blog/software-development-rates-india (2026-04-06)
- note: Vendor's own rate card (Ahmedabad-based agency); Bangalore/Mumbai quote higher.

### 15. Agency (not freelance) hourly rates by region and seniority

- value: North America senior $160-250+/hr; Western Europe senior $140-200; Eastern Europe senior $80-120; Asia senior $70-100; basic MVP $25-80K
- confidence: quoted
- source: https://andersenlab.com/blueprint/custom-software-development-costs-in-2026 (2026-04-02)
- note: Large outsourcing vendor's own guide; represents agency price, not developer pay.

### 16. US provider-type hourly rates and agency-vs-freelancer multiple

- value: US enterprise consultancy $250-500+/hr; mid-market firm $100-300; boutique $75-250; established freelancer $75-150; LatAm nearshore agency $40-100; India agency $25-75; agencies cost 1.5-2.5x freelancers
- confidence: quoted
- source: https://www.fullstack.com/labs/resources/blog/software-development-price-guide-hourly-rate-comparison (2026-08-27)
- note: Nearshore vendor's guide. Fully loaded US engineer ~$165-175K/yr vs LatAm ~$65-72K.

### 17. GoodFirms 2026 survey of 100+ software development companies: rate and project-size distribution

- value: 56% charge $20-50/hr; 66% charge $30,000-100,000 for small-to-mid projects; AI-capable projects $50-125K; enterprise often >$200K
- confidence: quoted
- source: https://www.globenewswire.com/news-release/2026/03/17/3257317/0/en/Goodfirms-Survey-91-of-Software-Companies-Use-AI-to-Cut-Development-Costs-in-2026.html (2026-03-17)
- note: Respondents are mostly offshore/outsourcing firms listed on GoodFirms.

### 18. MVP price ranges by complexity and by provider type (agency rate cards, Clutch listings, founder reports)

- value: Simple $5-15K; standard $15-60K; complex $60-150K; freelancers $5-30K (4-12 wks); traditional agencies $30-150K (8-16 wks); offshore staffing $40-120K; AI-native studio $7,499 fixed (14 days); no-code $500-5K
- confidence: quoted
- source: https://houseofmvps.com/mvp-development-cost (2026-04)
- note: Published by an AI-native studio that sells the $7,499 tier; treat the agency ranges as directional, the own-price as quoted.

### 19. MVP cost by complexity and by agency region, plus solo AI-assisted developer's real project prices

- value: Simple $5-25K (4-6 wks); medium $25-55K; complex $55-150K+; Eastern Europe agencies $12.6-28.8K (at $35-80/hr); LATAM $10.8-25.2K; Asia $7.2-16.2K; author's own AI-assisted fixed-scope MVPs $800-4,500 (e.g., 4-week AI scan-to-design tool $2,000; 3-month notetaker $7-9K)
- confidence: quoted
- source: https://ekky.dev/guides/mvp-development-cost/ (2026)
- note: Solo-developer guide; the $800-9K real-project prices are the closest public data point to solo AI-assisted pricing at the very low end.

### 20. Traditional MVP agency framework (US-listed MVP shops)

- value: Simple MVP $30-50K; average $50-100K; complex $100-250K+; 400-1,000 hours over 3-4 months; most listed shops at $25-49/hr
- confidence: quoted
- source: https://www.upsilonit.com/blog/best-mvp-development-companies-in-usa (2026-04-28)
- note: Agency-published; hourly bands are Clutch profile bands.

### 21. MVP agency minimum project sizes and published rate bands (15 firms)

- value: Minimums $5,000 (Purrweb, ScienceSoft) to $75,000 (Blue Label Labs); Asper Brothers '$10,000 all-in' in 4-6 weeks; thoughtbot $150-199/hr; most $50-99/hr; committed delivery windows 3 weeks to 6 months
- confidence: quoted
- source: https://mvpdevelopment.company/blog/best-mvp-development-companies-2026 (2026-09-07)
- note: Compiled by a competing MVP shop.

### 22. Fixed-fee 30-day sprint prices for a senior practitioner (design-partner / technical sprints)

- value: Discovery $3-7K; technical audit $5-12K; full design-partner sprint $8-18K; senior/CTO-level $15-25K+; 'most well-scoped sprints land at $8,000-15,000'; senior US T&M $150-350/hr
- confidence: quoted
- source: https://uxcontinuum.com/blog/saas-development/design-partner-sprint-pricing-guide-2026 (2026-03-16)
- note: Worked example: $200/hr x 160h = $32,000 full-time month; 80h = $16,000.

### 23. Cost of a two-week Scrum sprint for a full US team

- value: $50,000-70,000 per 2-week sprint for ~8 developers + PO + SM
- confidence: quoted
- source: https://medium.com/the-pragmatic-agilists/sprints-cost-how-much-b1ff9a4e45f3 (unknown)
- note: Seen only in a search snippet; direct fetch returned 403 and the publication year is unverified (likely pre-2026). Use as an order-of-magnitude anchor only.

### 24. Fraction (hirefraction.com): outcome-based price per story point with senior US engineers directing AI agents

- value: $99 per story point, all-in; 1 pt = trivial (copy change, expose existing field); 3 pt = form validation, CSV export; 5 pt = new REST API, webhook with retry; >5 pt is split; 'we ship or we don't get paid'; 7-day cancel
- confidence: quoted
- source: https://www.hirefraction.com/pricing (unknown (live page fetched 2026-09-08))
- note: The only published per-accepted-unit delivery price found. Also sells AI-engineer retainers: quarter-time $5.5K/mo, half-time $8K/mo, 3/4-time $12K/mo (off-hours). Claims '10x faster, 80% less than traditional teams'.

### 25. HouseofMVPs AI-native fixed-price tiers

- value: Validate $3,999 / 1 core AI feature / 1 week; Launch $7,499 / 3-5 features incl. auth, payments, custom UI / 2 weeks / 30-day support; Scale from $14,999 / 3-4 weeks / 60-day support; 50% upfront 50% on delivery; written scope with acceptance criteria; AI API usage billed separately
- confidence: quoted
- source: https://houseofmvps.com/ai-mvp-development (unknown (live page fetched 2026-09-08))
- note: Vendor's own page; 'if the date slips, that is our cost'.

### 26. SpeedMVPs AI MVP fixed-price plans and per-integration add-on

- value: Starter $5-10K (2 wks, single AI feature, auth, deploy); Professional $15-25K (2-3 wks, payments, integrations, CI/CD); Enterprise $30-50K+ (3-4 wks); each major integration +$2,000-5,000; 40/30/30 payment over $10K
- confidence: quoted
- source: https://speedmvps.com/ai-mvp-cost (2026 (undated page))
- note: Vendor's own page. Suggests client budgets $50-500/mo AI API and $20-200/mo hosting.

### 27. Codenovai agent-native studio fixed prices

- value: Launch from $18,000 (one core flow + one AI feature + auth + payments, 2-4 weeks, 30-day support); Scale from $45,000 (6-10 weeks); optional month-to-month 'Run & Care' subscription (price not published)
- confidence: quoted
- source: https://codenovai.com/build/ai-mvp (unknown (live page fetched 2026-09-08))
- note: Ships golden test sets, offline evals, and cost caps per AI feature; full IP transfer.

### 28. Comparison of AI-native vs traditional AI-MVP vendors' published prices

- value: HouseofMVPs $3,999-14,999+ (1-4 wks, fixed); Altar.io $80-300K+ (3-6 mo); Simform $60-180K+ at $40-90/hr; Toptal AI $80-250/hr ($30-100K typical); Crowdbotics $40-150K; LangChain consultants $150-300/hr
- confidence: quoted
- source: https://houseofmvps.com/best-ai-mvp-development-companies (2026)
- note: Compiled by HouseofMVPs, which ranks itself first; competitor figures are their reading of public rate cards.

### 29. AsyncForge productized 'DesignJoy for code' subscription tiers (senior engineers, one request at a time)

- value: Light €2,000/mo (4 business days per task); Standard €4,000/mo (2 business days); Pro €8,000/mo (1 business day); all excl. VAT, unlimited revisions, pause/cancel end of period, custom tier for concurrent tasks
- confidence: quoted
- source: https://asyncforge.com/pricing (unknown (live page fetched 2026-09-08; comparison page last updated 2026-05-26))
- note: Price scales with turnaround, not with hours — a useful template for accountability-priced retainers.

### 30. Awesomic subscription tiers (design + no-code/Webflow dev + QA)

- value: AI Designer $200/mo; Graphic Pack $1,490/mo ($1,190 quarterly); All-in-One $2,995/mo ($2,396 quarterly), 1 active task adjustable, part-time talents, unlimited revisions; Dedicated full-time talent custom
- confidence: quoted
- source: https://www.awesomic.com/pricing (unknown (live page fetched 2026-09-08))
- note: Blog (2026-03-05) claims 'up to 70% savings vs freelancers/agencies' and cites reserved-hours competitors at $1,600-3,000/mo for 2-50 hours.

### 31. Designjoy (reference productized design subscription) price

- value: $4,995/mo 'lifetime discount' (regular $5,995/mo); one request at a time; ~48h average delivery; pause anytime on 31-day cycles; Webflow development included
- confidence: quoted
- source: https://www.designjoy.co/ (unknown (live page fetched 2026-09-08))
- note: Digital Applied (2026-06-05) cites the same $4,995 as the canonical productized-retainer example.

### 32. Low-end 'unlimited web development' subscriptions (directory listing)

- value: Devlevate $449/mo (Laravel/Next.js, <24h simple tasks); Fullstack HQ $800; Growmodo $1,795; Developer Service $1,845; DevelopMonster €2,995; Elastico (Webflow) $6,800; DesignTork $299; UnlimitedWP $497
- confidence: quoted
- source: https://sourceforge.net/software/unlimited-web-development-services/ (2026 (directory, undated))
- note: Mostly WordPress/Webflow/Shopify maintenance shops; Devlevate's and DevelopMonster's own sites were unreachable at fetch time, so inclusions are per the directory only.

### 33. Fractional CTO retainer tiers (US)

- value: Advisory 1 day/wk $8-10K/mo; Fractional 2 days/wk $15-18K; Embedded 3+ days $25-30K; vertical premium 20-40% (health/fintech/AI); hourly $200-500; projects $15-75K
- confidence: quoted
- source: https://kompella.io/thinking/fractional-cto-pricing-2026 (2026-04-30 (updated 2026-08-25))
- note: Practitioner's own pricing guide. Cross-check: Tristella (2026-07-01) $4-8K for 10-15h, $8-15K for 20-40h, $15-25K+ for 40-60h, day rate $2-4K, hourly $200-400 (https://www.tristellaadvisors.com/blog/how-much-does-a-fractional-cto-cost-and-when-does-the-math-make-sense).

### 34. Agency retainer and margin benchmarks (AI-era pricing guide)

- value: Most common agency retainer <$5,000/mo; ~90% of agencies use retainers; average digital agency net margin 13%, project margin ~35% (Promethean Research 2025); niche specialists 40-75%; value-based price target 10-20% of client value; ~33% of agencies have fielded 'AI discount' requests
- confidence: quoted
- source: https://www.digitalapplied.com/blog/ai-agency-pricing-models-2026-decision-guide (2026-06-05)
- note: Secondary compilation; the 33% figure matches Productive.io's 2025 survey.

### 35. Devin (Cognition) self-serve pricing per secondary source A

- value: Free $0; Core $20/mo; Team $500/mo incl. 250 ACUs (~62.5 hrs); pay-as-you-go $2.25/ACU; Enterprise custom (VPC, SSO, custom Devins)
- confidence: quoted
- source: https://valueaddvc.com/blog/how-does-cognition-make-money-devin-pricing-windsurf-enterprise-and-the-492m-arr-breakdown (2026-07-31 (updated 2026-09-04))
- note: CONFLICTS with source B below. Primary devin.ai/pricing returned HTTP 429 twice and cognition.com/pricing 404 on 2026-09-08. One ACU ≈ 15 min of agent work per other secondaries ($2.25/ACU ≈ $9/agent-hour, derived).

### 36. Devin (Cognition) self-serve pricing per secondary source B

- value: Free; Pro $20/mo; Max $200/mo; Teams $80/mo minimum + $40/mo per full dev seat; Enterprise custom ACU rates in order form; per-ACU rates 'not published for self-serve'
- confidence: quoted
- source: https://www.usagepricing.com/blueprint/cognition (facts checked 2026-08-27)
- note: Likely reflects a plan restructure after the Core/Team lineup; unverifiable against the primary. Treat Devin self-serve at $20-200/seat/mo plus metered ACUs, enterprise negotiated.

### 37. Cognition revenue scale (context for enterprise pricing power)

- value: ARR $492M (May 2026) rising to $900M+ (reported Sept 2026); 350+ enterprise accounts via Windsurf; Goldman Sachs, Citi, Mercedes-Benz, Dell, Santander, US Army/Navy/Treasury named as production users; no contract sizes disclosed
- confidence: quoted
- source: https://valueaddvc.com/blog/how-does-cognition-make-money-devin-pricing-windsurf-enterprise-and-the-492m-arr-breakdown (2026-09-04)
- note: Enterprise deal sizes are not public; 'six or seven figures annually' is speculation in secondaries and is not counted as a fact here.

### 38. Factory (Droid) pricing

- value: Pro $20/mo; Plus $100/mo (~5x Pro usage); Max $200/mo (~10x); Teams $60/mo per team + $40/mo per seat (≤10 seats, 10 hrs/mo shared Droid Computers); Business (≤150 seats) and Enterprise custom
- confidence: quoted
- source: https://factory.ai/pricing (unknown (live page fetched 2026-09-08))
- note: Primary vendor page.

### 39. Replit pricing and Agent effort-based checkpoint pricing

- value: Core $20/mo ($17 annual) incl. $20 model credit; Pro $100/mo ($95 annual) incl. $100 credit, 10 parallel agents; Enterprise custom. Agent checkpoints: previously flat $0.25; now effort-based ('simple tasks may cost less than $0.25, more complex tasks more'), one bundled checkpoint per task
- confidence: quoted
- source: https://replit.com/pricing (pricing page fetched 2026-09-08; effort-based pricing post 2025-06-18 (updated 2025-07-02, https://replit.com/blog/effort-based-pricing))
- note: Secondaries report real checkpoints from ~$0.06 to 'multiple dollars' and billing on failed runs; Replit's post gives no examples.

### 40. Lovable plan prices and per-credit cost (all tiers)

- value: Pro: 100 credits $25 ... 800 credits $200 ($0.25/credit), 2,000 $480, 5,000 $1,125, 10,000 $2,250 ($0.225/credit); Business: 100 credits $50 ... 10,000 credits $4,300 ($0.43-0.50/credit); Free 5 build credits/day (≤30/mo); August 2026 merged Cloud/AI dollar balances into one credit pool
- confidence: quoted
- source: https://www.totalum.app/blog/lovable-pricing-2026 (2026-08-23)
- note: Lovable's own pricing page (fetched 2026-09-08) confirms the credit model and states simple tasks cost 0.50-0.90 credits and complex features 1.20-1.70 credits, i.e. a complex feature step ≈ $0.30-0.43 on Pro (derived: 1.2-1.7 x $0.25).

### 41. Bolt.new pricing

- value: Free (1M tokens/mo, 300K/day); Pro $25/mo from 10M tokens with rollover; Teams $30/member/mo; Enterprise custom; annual up to 28% off
- confidence: quoted
- source: https://bolt.new/pricing (unknown (live page fetched 2026-09-08))
- note: Primary vendor page.

### 42. v0 (Vercel) pricing

- value: Free $5 credits/mo; Plus $30/user/mo incl. $30 credits + $2/day login credit; Business $100/user/mo; Enterprise custom; model rates per 1M tokens: v0 Pro $2 in/$10 out, v0 Max $5/$25, v0 Max Fast $10/$50
- confidence: quoted
- source: https://v0.app/pricing (unknown (live page fetched 2026-09-08))
- note: Primary vendor page. v0 Max token prices equal Anthropic's Opus-class list prices, i.e. resold at ~1x.

### 43. Per-PR cost of AI code review tools (the only 'per PR' pricing found; review, not delivery)

- value: Claude Code Review $15-25 per review; Cursor Bugbot ~$1-1.50 per run; GitHub Copilot review metered in AI credits + Actions minutes from 2026-06-01; Codex token-based
- confidence: quoted
- source: https://blog.codacy.com/ai-code-review-cost-per-pull-request-what-engineering-teams-actually-pay-in-2026 (2026-08-28)
- note: Sets a client anchor: automated review of a PR is worth $1-25; no vendor found publishing a price per accepted/merged PR for delivery.

### 44. Share of software development companies using AI and expecting budget cuts (GoodFirms survey, 100+ firms)

- value: 90.6% use AI tools; 61% expect AI to reduce project budgets by 10-25%
- confidence: quoted
- source: https://www.globenewswire.com/news-release/2026/03/17/3257317/0/en/Goodfirms-Survey-91-of-Software-Companies-Use-AI-to-Cut-Development-Costs-in-2026.html (2026-03-17)
- note: Expectation of vendors, not measured price change.

### 45. Productive.io 2025 agency survey (181 agencies): AI discount requests and responses

- value: 27% faced client discount demands; 13% actually lowered rates; 73% never asked, of whom 47% expect it; 65% reported revenue growth; among AI-revenue-gainers 27% held prices and improved margins, 31% kept pricing flat
- confidence: quoted
- source: https://techbullion.com/the-discounting-myth-why-most-agencies-arent-losing-money-to-ai-competition/ (2026-06-27)
- note: Secondary reporting the 2025 Productive.io report (58.7% European respondents).

### 46. Productive.io 'Agencies in the AI Era 2.0' (174 agencies, 17-31 March 2026)

- value: No significant increase in AI-discount requests vs six months earlier; 52% of high-performing AI adopters maintained or increased pricing with improved margins (up from 47%); only 3% report significant layoffs; value/outcome-based billing emerging as preferred model; one respondent reports employee day rates decreased due to AI automation
- confidence: quoted
- source: https://productive.io/reports/agencies-in-the-ai-era-pulse-report/ (2026-03 (survey window 2026-03-17 to 03-31))
- note: Primary report page. Europe 54%, APAC 21%, US 13% of respondents.

### 47. Upwork Future Workforce Index 2026: AI effect on freelance earnings

- value: Freelancers using AI earn 34% more per hour; generative-AI/creative production per-contract earnings -13% while volume +90%; complex AI-augmented work earnings +45% YoY; AI-augmented professional services +22% with +72% volume
- confidence: quoted
- source: https://www.quiverquant.com/news/Upwork+Releases+2026+Future+Workforce+Index,+Finding+AI+Is+Reshaping+Freelance+Work+and+Earnings (2026-07-14)
- note: Republication of Upwork's press release (survey of 2,400 US skilled workers, Mar-Apr 2026, plus platform data); Upwork's investor page timed out on fetch.

### 48. Upwork Q2 2026 demand contraction attributed to AI automating low-complexity work

- value: Active clients -4% YoY to 763,000; GSV -3.6% to $966.4M; revenue -2% to $191.7M; FY2026 revenue guidance cut to $730-750M from $760-790M; ~10% of GSV identified as automation-exposed and eroding faster than expected; GSV per client record $5,230; AI-related work +22% (~$330M annualised)
- confidence: quoted
- source: https://www.pymnts.com/earnings/2026/upwork-navigates-cross-currents-as-ai-reshapes-freelance-demand/ (2026-08-10)
- note: Compression appears as volume loss at the low end, not as falling posted rates.

### 49. Enterprise software buyer pricing-model preference (Futurum 1H 2026 decision-maker survey)

- value: 43% prefer consumption-based; 27% outcome-based; fewer than 1 in 5 prefer classic per-seat
- confidence: quoted
- source: https://futurumgroup.com/press-release/are-outcome-based-and-hybrid-ai-pricing-models-rewriting-the-vendor-playbook/ (2026-05-12)
- note: Sample size not disclosed; about software buyers, indicative of appetite for paying per result.

### 50. Client discount asks vs agency concessions (practitioner article, unsourced)

- value: Clients requesting 50-70% price reductions citing AI; most common concession 20-30%; some agencies cave to 60%; article's '40-20-40' framing: coding is ~20% of effort and compresses to 8-12% with AI
- confidence: quoted
- source: https://foundersbar.com/articles-and-research/why-software-development-quotes-arent-dropping (2026-04-21)
- note: Anecdotal; not a survey. Included because it is the only source quantifying the size of discount asks.

### 51. Which rates collapsed vs rose under AI (agency owner account)

- value: Rates collapsed for basic content, simple sites, logos, explainer copy (e.g., £150/blog post market 'largely gone'); rates increased for technical architecture, complex UX, senior-level development; agency moved to mostly fixed-price proposals; AI tooling costs £8-20 per billable hour
- confidence: quoted
- source: https://gautamkhorana.com/blog/how-ai-changed-agency-pricing-2026/ (2026-05-04 (updated 2026-07-20))
- note: Single-agency testimony; direction consistent with survey data.

### 52. AI-native fixed MVP price as a fraction of traditional agency MVP quotes

- value: $7,499 vs $30,000-50,000 simple-MVP agency range = 15-25%; vs $15,000-50,000 mid-tier quote = 15-50%; vs Eastern-European agency MVP $12,600-28,800 = 26-60%
- confidence: derived
- source: https://houseofmvps.com/ai-mvp-development (2026)
- note: 7,499/30,000 = 0.25; 7,499/50,000 = 0.15; 7,499/15,000 = 0.50; 7,499/12,600 = 0.60; 7,499/28,800 = 0.26. Agency ranges from Upsilon (2026-04-28), HouseofMVPs cost page (2026-04), ekky.dev (2026). Scope equivalence is approximate (3-5 features vs '400-1,000 hours').

### 53. Per-feature price implied by AI-native fixed tiers

- value: $1,500-2,500 per feature (Launch $7,499 / 3-5 features); $3,999 for one end-to-end AI feature (Validate); $2,000-5,000 per major integration (SpeedMVPs); $18,000 for one core flow + AI feature + auth + payments (Codenovai)
- confidence: derived
- source: https://houseofmvps.com/ai-mvp-development (2026)
- note: 7,499/5 = 1,500; 7,499/3 = 2,500. Includes auth/payments/UI plumbing amortised across the features; a standalone follow-on feature would price lower.

### 54. Per-feature price implied by Fraction's story-point rate

- value: Small task 1-3 pts = $99-297; feature with unknowns 5 pts = $495; medium feature 8-15 pts = $792-1,485; large feature 20-40 pts = $1,980-3,960
- confidence: derived
- source: https://www.hirefraction.com/pricing (2026 (live page))
- note: $99 x points. The 1/3/5-point examples are quoted; the 8-15 and 20-40 point compositions for medium/large features are my estimate of how such work decomposes under their '>5 points gets split' rule.

### 55. $/hour-equivalent of AI-native fixed prices under stated operator-hour assumptions

- value: HouseofMVPs Launch $7,499: $187/hr at 40 operator-hours, $94/hr at 80; Codenovai Launch $18,000: $225/hr at 80h, $112/hr at 160h; Fraction retainers: quarter-time $5.5K/~40h = $137/hr, half-time $8K/~80h = $100/hr, 3/4-time $12K/~120h = $100/hr; AsyncForge Standard €4,000 for ~60-80 senior-hours = €50-67/hr
- confidence: derived
- source: https://www.hirefraction.com/pricing (2026)
- note: Prices quoted; hours are assumptions (a 40-hour week = 'full time'; one-request-at-a-time queue assumed to consume 60-80 engineer-hours/month). Compare to rate cards: EE senior freelance $40-85, US senior freelance $75-150, US boutique agency $75-250.

### 56. Hour-based price of a feature at prevailing senior freelance rates (for comparison with AI-native pricing)

- value: Small feature 8-24h: Eastern Europe $320-2,040, US $656-3,120; medium 40-80h: EE $1,600-6,800, US $3,280-10,400; large 120-200h: EE $4,800-17,000, US $9,840-26,000
- confidence: derived
- source: https://arc.dev/employer-blog/freelance-developers-cost/ (2026-05-26)
- note: Hours per feature size are my assumption (conventional hand-built effort); rates are Arc's Eastern Europe $40-85/hr and US/Canada $82-130/hr. Multiply endpoints: 8x40=320, 24x85=2,040, 8x82=656, 24x130=3,120, etc.

### 57. Recommended revenue-per-accepted-feature bands for a solo AI-native factory selling to SMB/startups

- value: Small (copy/field/validation/export-class, 1-5 pts): $300-2,500; Medium (new endpoint + UI + tests, integration): $1,500-8,000; Large (full flow with auth/payments or multi-service integration): $4,000-20,000
- confidence: estimated
- source: https://www.hirefraction.com/pricing (2026)
- note: Floors from Fraction ($99-495 per 1-5 pts) and Lovable/Replit self-serve anchors (a client can attempt a small change for <$1 of credits); mids from HouseofMVPs ($1.5-2.5K/feature, $3,999 single feature) and SpeedMVPs ($2-5K/integration); ceilings from EE/US hour-based equivalents and Codenovai ($18K launch scope). Staging-proven acceptance justifies the upper half of each band per the 'accountability not hours' evidence (Futurum 27% outcome preference; Productive 2.0 value-billing shift).

### 58. Recommended per-client-month retainer bands for a solo factory

- value: SMB one-request-at-a-time queue: $2,000-8,000/mo (AsyncForge €2-8K by turnaround; Awesomic $2,995; most agency retainers <$5K); half-time-equivalent accountable engineering: $8,000-15,000/mo (Fraction $8K half-time, $12K 3/4; fractional CTO 20-40h $8-15K); floor for maintenance-only: $450-1,850/mo (WordPress/Next.js unlimited subs)
- confidence: derived
- source: https://asyncforge.com/pricing (2026)
- note: Bands are the union of quoted vendor prices above; the pricing lever that vendors actually use is turnaround (1/2/4 business days = €8K/€4K/€2K), not hours.

### 59. Implied revenue per operator-hour for the solo factory at those bands

- value: $100-300 per operator-hour if agents carry the build (e.g., $7,499 per 2-week MVP at 25-75 operator-hours = $100-300/hr; $4,000/mo retainer at 15-40 operator-hours = $100-267/hr)
- confidence: estimated
- source: https://houseofmvps.com/ai-mvp-development (2026)
- note: Operator-hour assumptions are mine (Anthropic's published agent-loop cost of ~$0.70-1.39 per benchmark task implies compute is a small fraction of these prices). Sits at or above US senior freelance rate cards ($75-150) while the client pays 15-50% of a traditional agency quote.

## Not found

- Devin/Cognition current official self-serve plan and ACU prices from the primary page (devin.ai/pricing returned HTTP 429 twice; cognition.com/pricing 404); two secondaries conflict (Core $20/Team $500/250 ACUs/$2.25 per ACU vs Pro $20/Max $200/Teams $80+$40 per seat).
- Cognition enterprise contract sizes or per-ACU enterprise rates (only logos and ARR are public).
- Any vendor publishing a price per accepted/merged pull request for software delivery (only per-PR code-review pricing exists: $1-25 per review).
- Toptal's official rate card (Toptal publishes none; all figures are client-reported secondaries).
- Upwork's own current full-stack rate page and freelancing-stats page (HTTP 403 on direct fetch; one median seen only via search snippet).
- Malt (France) 2026 freelance developer daily-rate barometer (search budget exhausted before a source was located).
- YunoJuno Rates Report 2026 and freelancermap Freelancer-Kompass 2026 primary pages (only reachable via the 9am.works summary; guessed URLs returned 404).
- A rate survey giving Western Europe senior full-stack freelance rates for France specifically.
- Per-feature price lists published by traditional agencies (every agency source prices by project complexity or hourly band, not per feature).
- A survey measuring the actual percentage change in software-agency hourly rates 2025 to 2026 (only flat national freelance averages and self-reported 'held/cut' shares exist).
- Published case studies from AI-native dev shops giving the client's actual invoice for a delivered feature or app beyond vendors' own price lists (Fraction's case studies omit dollar amounts).
- Replit's current effort-based checkpoint price examples in dollars from Replit itself (only the $0.25 former baseline is primary; $0.06-'multiple dollars' comes from user reports).
- Lovable's plan prices rendered from lovable.dev/pricing itself (credit mechanics were readable; tier prices came from a 2026-08-23 secondary).
