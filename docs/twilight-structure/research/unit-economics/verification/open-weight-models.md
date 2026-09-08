# open-weight-models

## Overall

Researcher's work is largely sound: 52 of 62 claims confirmed against their cited sources, arithmetic (blends, ratios, cost-per-solve, token multipliers) all reproduces. Ten corrections, none of which flips the headline conclusions: (1) AA's $0.12 cost-to-run is the V4 Pro 0424 preview, the 0813 build is $0.67; (2) the DeepSeek pre-08-16 price is contested between the cited aipricing.guru ($0.66/$1.98 Pro, $0.22/$0.66 Flash) and contextstudios ($0.435/$0.87, $0.14/$0.28) — the new schedule itself is now confirmed from DeepSeek's own image, but the '3-4.5x rise' claim rests on the contested figure; (3) Vals' Sonnet 5 SWE-bench 75.5 and TB2.1 74.5 are unverifiable (pages render 0.0% placeholders) and V4 Pro 0813's TB2.1 rank shows #33/52 not #42/63; (4) the 0731 Flash card says 304B; (5) Mistral's own post shows May 22 2026 not April 30; (6) MiniMax M3 open weights landed on HF ~June 12, not May 31; (7) Fireworks K3 priority is $3.75/$18.75, the $4.50/$22.50 is an OpenRouter route; (8) Together's $0.15/$0.47 entry is 'Qwen3.8 Flash' and Together lists Qwen3.8-2.4T-A95B directly at $2/$6; (9) Kilo's phrasing is '1/89th of Opus 4.7' output-token cost, not '100x per quality point'; (10) llm-stats shows 53 self-reported not 51. Sub-claims not on cited pages (SWE-rebench scaffold/5 runs, Epoch's 3-month 2023-2025 lag, several rows in multi-model tables) are flagged unverified. Web search budget was exhausted mid-task, so the remaining not_found items were retried by direct fetch only.

## Checks

### 1. GLM-5.3 identity

- verdict: confirmed
- original: 753B/40B active; 1M ctx (1.31M OpenRouter), 128K out; API 2026-08-18; weights 2026-08-28; GLM-5.3 License
- corrected: 753B total (HF card, digitalapplied); 40B active (AA open-source page; HF card does not state it); 1M ctx / 128K out (digitalapplied), 1,310,720 on OpenRouter; OpenRouter listing 2026-08-18 (Z.ai announcement 2026-08-14 per digitalapplied); HF 'Initial commit 0828'; licence 'glm-5.3'; same base as GLM-5.2 confirmed on HF card
- evidence: https://www.digitalapplied.com/blog/glm-5-3-weights-bespoke-license-not-mit
- note: Also https://openrouter.ai/z-ai/glm-5.3 (Aug 18, 27 providers), https://artificialanalysis.ai/models/open-source (40B), https://huggingface.co/zai-org/GLM-5.3/commits/main

### 2. GLM-5.3 licence gate

- verdict: confirmed
- original: >$10B aggregate 12-month revenue MaaS -> Z.AI security review
- corrected: Verbatim: 'aggregate revenue of the Licensee and its affiliates exceeds 10 billion US dollars ... over any consecutive 12 months' -> 'must pass Z.AI's security review before using the Software or its derivative works for any commercial purpose'
- evidence: https://huggingface.co/zai-org/GLM-5.3/blob/main/LICENSE
- note:

### 3. GLM-5.3-Flash identity

- verdict: confirmed
- original: 320B/18B; MIT; weights 2026-08-26; TB2.1 84.3
- corrected: 320B/18B, MIT, TB2.1 84.3 and 'approaching Claude Opus 4.8 ... one-tenth the price' on HF card; date not on card but HF commit history shows initial commit 14 days before 2026-09-08 (08-25) and weights upload 13 days before (08-26); AA index 42 confirmed
- evidence: https://huggingface.co/zai-org/GLM-5.3-Flash
- note: https://huggingface.co/zai-org/GLM-5.3-Flash/commits/main; https://artificialanalysis.ai/leaderboards/models

### 4. Kimi K3 identity

- verdict: confirmed
- original: 2.8T/104B (16 of 896), 1,048,576 ctx, vision; API 2026-07-16; weights 2026-07-26/27; Kimi K3 License
- corrected: HF card: 2.8T total, 104B activated, 896 experts/16 selected, 1,048,576 ctx, MoonViT-V2 vision, 'Kimi K3 License'; OpenRouter created Jul 16 2026; VentureBeat 2026-07-27 and HF initial commit July 27. VentureBeat wording is 'world's first open 3T-class model'
- evidence: https://huggingface.co/moonshotai/Kimi-K3
- note: https://openrouter.ai/moonshotai/kimi-k3; https://venturebeat.com/technology/kimi-k3s-full-weights-are-here-but-theyre-open-with-a-caveat-what-enterprises-should-know

### 5. Kimi K3 licence gate

- verdict: confirmed
- original: >$20M aggregate 12-month revenue MaaS -> separate agreement; UI display above 100M MAU or $20M monthly revenue; internal use exempt
- corrected: All three clauses quoted verbatim on the LICENSE page
- evidence: https://huggingface.co/moonshotai/Kimi-K3/blob/main/LICENSE
- note:

### 6. Kimi K2.6 identity

- verdict: confirmed
- original: 1T/32B, 256K, released 2026-04-20, Modified MIT
- corrected: HF card: 1T/32B, 256K, 'modified-mit'; release date not on card, but Handy AI and Epoch both give April 20 2026 (HF repo created April 14)
- evidence: https://huggingface.co/moonshotai/Kimi-K2.6
- note: https://epoch.ai/data-insights/open-closed-eci-gap ('released April 20, 2026')

### 7. Kimi K2.7 Code identity + price

- verdict: confirmed
- original: 1T/32B, 256K, Modified MIT; $0.95 / $0.19 cache-hit / $4.00; HighSpeed 2x
- corrected: HF: 1T/32B/256K/Modified MIT; pricing page: $0.19 hit / $0.95 miss / $4.00 out, 262,144 ctx; highspeed $0.38/$1.90/$8.00 (~180 tok/s). HF repo created 2026-06-11 (date was 'unknown')
- evidence: https://platform.kimi.ai/docs/pricing/chat-k27-code
- note: https://huggingface.co/moonshotai/Kimi-K2.7-Code/commits/main

### 8. DeepSeek V4 Pro identity

- verdict: confirmed
- original: 1.6T/49B, 1M ctx, 384K max out, MIT; preview 2026-04-24; GA 0813 2026-08-13
- corrected: April card: 1.6T/49B/1M/MIT (arXiv date April 26; HF weights uploaded April 23). 0813 card: '1.7T', 384K max output, MIT; AA lists 0813 as 1.6T/49B; DeepSeek updates page: GA Aug 13 2026
- evidence: https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro
- note: https://api-docs.deepseek.com/updates; https://artificialanalysis.ai/models/open-source

### 9. DeepSeek V4 Flash 0731 identity

- verdict: corrected
- original: 284B/13B (April card; 0731 says ~304B), 1M, MIT, 2026-07-31
- corrected: The cited 0731 card states '304B params' and does not state active params; the April DeepSeek-V4-Flash card states 284B/13B. Treat 0731 as 304B total per its own card. MIT and July 31 2026 (API public beta per DeepSeek updates) confirmed
- evidence: https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731
- note: https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash (284B/13B)

### 10. Qwen3.8-2.4T-A95B identity

- verdict: confirmed
- original: 2.4T/95B; 262,144 native -> 1,010,000; 2026-08-12; Qwen3.8-Max License
- corrected: HF card: 2.4T/95B, 262,144 native, up to 1,010,000; licence 'qwen3.8-max'; OpenRouter Aug 12 2026. Qwen3.8-27B is apache-2.0 but its HF upload is Aug 5-6, not 08-21
- evidence: https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B
- note: https://huggingface.co/Qwen/Qwen3.8-27B/commits/main

### 11. Qwen3.8-Max licence gate

- verdict: confirmed
- original: >$50M 12-month revenue MaaS/AI Work Assistant -> separate licence; UI display above 100M MAU or $20M monthly revenue
- corrected: Verbatim on LICENSE page
- evidence: https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B/blob/main/LICENSE
- note:

### 12. MiniMax M3 identity

- verdict: corrected
- original: ~428B/~23B, 1M ctx (MSA), image+video; released 2026-05-31/06-01; MiniMax Community License
- corrected: Params/ctx/MSA/multimodal/'minimax-community' licence confirmed on HF. OpenRouter API listing May 31 2026, but the HF weights repo's initial commit is June 12 2026 (arXiv June 11) — open weights landed ~2 weeks after the API
- evidence: https://huggingface.co/MiniMaxAI/MiniMax-M3
- note: https://huggingface.co/MiniMaxAI/MiniMax-M3/commits/main; https://openrouter.ai/minimax/minimax-m3

### 13. Mistral Medium 3.5 identity

- verdict: corrected
- original: 128B dense, 256K, Modified MIT, 2026-04-30; $1.50/$7.50; SWE-bench Verified 77.6; tau3-telecom 91.4
- corrected: Mistral's own post confirms 'dense 128B model with a 256k context window', modified MIT, '$1.5 per million input tokens and $7.5 per million output tokens', 77.6%, 91.4, and 'replaces Devstral 2 in our coding agent, Vibe CLI'. Release date shown on Mistral's page is May 22 2026 (letsdatascience says April 30); Magistral retirement is only in the secondary source
- evidence: https://mistral.ai/news/vibe-remote-agents-mistral-medium-3-5
- note: Cited secondary: https://letsdatascience.com/blog/mistral-medium-3-5-128b-open-weight-merged-model

### 14. gpt-oss-120b status

- verdict: confirmed
- original: 2025-08-05, ~117B MoE, Apache 2.0; Together/Fireworks $0.15/$0.60; Aider 41.8%
- corrected: HF blog: Aug 5 2025, 117B total / 5.1B active, Apache 2.0; Together $0.15/$0.60; Fireworks $0.15/$0.015/$0.60; Aider 41.8% $0.74 (2025-08-06). Not on OpenAI pricing page
- evidence: https://huggingface.co/blog/welcome-openai-gpt-oss
- note:

### 15. Owner-API price GLM-5.3 / GLM-5.2

- verdict: confirmed
- original: $1.40 / $0.26 cached / $4.40; storage limited-time free
- corrected: GLM-5.3, 5.2, 5.1 all $1.4/$0.26/$4.4; GLM-5 $1/$0.2/$3.2; storage 'Limited-time Free'
- evidence: https://docs.z.ai/guides/overview/pricing
- note:

### 16. Owner-API price GLM-5.3-Flash

- verdict: confirmed
- original: $0.075/$0.015/$0.25 promo to 2026-09-09; list $0.15/$0.03/$0.50
- corrected: Promo 50% 'ends at 24:00 on September 9, 2026 (UTC+8)'; list corroborated by Fireworks and Together $0.15/$0.03/$0.50
- evidence: https://docs.z.ai/guides/overview/pricing
- note:

### 17. Western-provider prices GLM-5.3

- verdict: confirmed
- original: Together $1.40/$4.40; Fireworks $1.40/$0.26/$4.40 (priority $1.75/$5.50); DeepInfra $1.20/$4.00 fp4; OpenRouter floor $1.113/$3.498
- corrected: All confirmed; DeepInfra page shows fp4, $1.20/$4.00/$0.12; OpenRouter cheapest StreamLake $1.113/$3.498 among 27 providers
- evidence: https://docs.fireworks.ai/serverless/pricing
- note: https://deepinfra.com/zai-org/GLM-5.3; https://openrouter.ai/z-ai/glm-5.3; https://www.together.ai/pricing

### 18. Owner-API price Kimi K3

- verdict: confirmed
- original: $3.00 miss / $0.30 hit / $15.00; 1,048,576 ctx
- corrected: Exactly as stated
- evidence: https://platform.kimi.ai/docs/pricing/chat-k3
- note:

### 19. Western-provider prices Kimi K3

- verdict: corrected
- original: Together $3/$15; Fireworks $3/$0.30/$15 (Fast $4.50/$22.50); DeepInfra $2.85/$14.25; OpenRouter floor $2.50/$14.00 (Morph)
- corrected: Together, DeepInfra confirmed. Fireworks' own doc lists priority at $3.75/$0.375/$18.75; the $4.50/$22.50 figure is OpenRouter's 'Fireworks Fast' route. Morph $2.50 is the cheapest input, but Makora ($2.55/$12.75) and Wafer ($3.00/$12.75) have cheaper output
- evidence: https://openrouter.ai/moonshotai/kimi-k3
- note: https://docs.fireworks.ai/serverless/pricing; https://deepinfra.com/pricing

### 20. Owner-API price Kimi K2.6 and launch price

- verdict: confirmed
- original: Now $0.95/$0.16/$4.00; launch $0.60/$2.50
- corrected: Pricing page $0.16 hit/$0.95 miss/$4.00, 262,144 ctx; Handy AI: '$0.60 / $2.50 per million tokens' at April 20 launch. DeepInfra $0.75/$3.50/$0.15 and Fireworks $0.95/$0.16/$4.00 confirmed
- evidence: https://platform.kimi.ai/docs/pricing/chat-k26
- note: OpenRouter $0.58/$2.44 route not checked

### 21. Owner-API price DeepSeek V4 Pro 0813 peak/off-peak + pre-change price

- verdict: corrected
- original: Peak $1.32/$0.044/$3.96; off-peak $0.66/$0.022/$1.98; before 08-16: $0.435/~$0.004/$0.87
- corrected: New schedule confirmed by DeepSeek's own table image: peak 01:00-04:00 and 06:00-10:00 UTC, effective 16:00 UTC Aug 16 2026, V4 Pro peak $0.044/$1.32/$3.96, off-peak $0.022/$0.66/$1.98. The 'before' price is contested: the cited aipricing.guru page says pre-Aug-16 was $0.66/$0.022/$1.98 (i.e. only peak hours rose, 2x), while contextstudios says $0.435/~$0.004/$0.87 (+264% blended). DeepSeek's own pages do not state the old price; treat the 3-4.5x rise as unverified
- evidence: https://api-docs.deepseek.com/img/v4_260813_price_en.png
- note: Official news item https://api-docs.deepseek.com/news/news260813 (table is an image). Cited https://www.aipricing.guru/deepseek-pricing/ contradicts the 'before' figure

### 22. Owner-API price DeepSeek V4 Flash 0731 peak/off-peak + pre-change

- verdict: corrected
- original: Peak $0.44/$0.014/$1.32; off-peak $0.22/$0.007/$0.66; before: $0.14/$0.28
- corrected: Schedule confirmed by DeepSeek's official image. The cited page says the pre-Aug-16 price was $0.22/$0.007/$0.66 (not $0.14/$0.28); OpenRouter's June 27 report lists first-party V4 Flash at $0.14/$0.28, so there may have been two steps. Together still lists $0.14/$0.28 ($0.03 cache); DeepInfra $0.09/$0.18/$0.018; Fireworks $0.22/$0.007/$0.66 confirmed
- evidence: https://api-docs.deepseek.com/img/v4_260813_price_en.png
- note: https://www.aipricing.guru/deepseek-pricing/; https://openrouter.ai/blog/insights/the-open-weight-models-that-matter-june-2026/

### 23. Western-provider prices DeepSeek V4 Pro

- verdict: confirmed
- original: Together $1.32/$3.96 ($0.13); Fireworks $1.32/$0.044/$3.96; DeepInfra $1.30/$2.60 ($0.10); OpenRouter floor $0.87/$1.74 DigitalOcean
- corrected: All confirmed; the OpenRouter page is titled 'DeepSeek V4 Pro 0423' and its Fireworks route shows $1.20/$1.20/$0.60 (anomaly as noted); DeepSeek official route there shows $1.416/$2.832
- evidence: https://www.together.ai/pricing
- note: https://openrouter.ai/deepseek/deepseek-v4-pro; https://deepinfra.com/pricing

### 24. Owner-API price Qwen3.8-Max

- verdict: confirmed
- original: $2.00/$6.00; cache $0.20-0.25; batch 50%; not stackable
- corrected: $2.00/$6.00/$0.25 on OpenRouter Alibaba route, Fireworks and Together; DeepInfra own page $1.65/$4.951/$0.206. Correction to note: Together's own page lists Qwen3.8-2.4T-A95B at $2.00/$6.00 ($0.25 cache) directly, and its $0.15/$0.47 entry is labelled 'Qwen3.8 Flash', not the 27B. Batch/cache-stacking rules unverified (not fetched)
- evidence: https://openrouter.ai/qwen/qwen3.8-2.4t-a95b
- note: https://www.together.ai/pricing

### 25. Owner-API price MiniMax M3

- verdict: confirmed
- original: $0.30/$1.20/$0.06 <=512K; $0.60/$2.40/$0.12 above; priority 1.5x; 'Permanent 50% off'
- corrected: puter tutorial (June 19 2026) matches exactly; OpenRouter MiniMax route $0.30/$1.20/$0.06; Together same; DeepInfra $0.28/$1.10/$0.056; CoreWeave $0.23/$0.96. Official platform.minimax.io page still not retrievable (serves audio-plan page)
- evidence: https://developer.puter.com/tutorials/minimax-api-pricing/
- note: https://openrouter.ai/minimax/minimax-m3

### 26. Anthropic list prices

- verdict: confirmed
- original: Fable 5.1 $10/$50 cache $0.25 write $12.50/$20; Opus 5 $5/$25; Sonnet 5 $2/$10 permanent; Haiku 4.5 $1/$5; batch 50%; 1M standard; Opus 5 fast $10/$50
- corrected: All verbatim on page, including the Sonnet 5 note ('increase to $3/$15 ... on September 1, 2026 will not occur') and the ~30% tokenizer note for Claude 4.7+
- evidence: https://platform.claude.com/docs/en/about-claude/pricing
- note: Fable 5 (not 5.1) cache read is $1/MTok

### 27. OpenAI list prices

- verdict: confirmed
- original: gpt-6-astra $10/$1/$50; gpt-5.6-sol $4/$0.40/$20 (was $5/$30); terra $2/$0.20/$12; luna $0.20/$0.02/$1.20; gpt-5.5 $5/$0.50/$30
- corrected: All confirmed; long-context 2x, fast 2x, batch/flex 50%; launch prices Sol $5/$30, Terra $2.50/$15, Luna $1/$6 per marktechpost; GPT-6 Astra release Sep 3 2026 per Vals
- evidence: https://developers.openai.com/api/docs/pricing
- note: https://www.vals.ai/models/openai_gpt-6-astra

### 28. Google list prices

- verdict: confirmed
- original: Gemini 3.8 Flash $0.75/$3.75/$0.075 to 2026-12-31 then $1.50/$7.50; 3.5 Flash $1.50/$9; 3.1 Pro $2/$12 and $4/$18; Gemini 3.5 Pro absent
- corrected: All confirmed; page last updated 2026-09-08 (not 09-04); no Gemini 3.5 Pro row
- evidence: https://ai.google.dev/gemini-api/docs/pricing
- note:

### 29. Blended 3:1 list prices

- verdict: confirmed
- original: Fable 5.1 $20; Astra $20; Opus 5 $10; Sol $8; K3 $6; Gemini 3.1 Pro $4.50; Sonnet 5 $4; Qwen $3; Mistral $3; GLM-5.3 $2.15; V4 Pro $1.98/$0.99; K2.6 $1.71; V4 Flash $0.66/$0.33; M3 $0.525; gpt-oss $0.26; Flash $0.24
- corrected: Recomputed from the confirmed owner prices; all match to 2 dp
- evidence: https://platform.claude.com/docs/en/about-claude/pricing
- note: Arithmetic only

### 30. Price ratios flagship/open

- verdict: confirmed
- original: vs Opus 5: GLM-5.3 4.65x, K3 1.67x, K2.6 5.8x, V4 Pro 5.1x/10.1x, V4 Flash 15x/30x, Qwen 3.3x, M3 19x, Flash 42x; vs Fable/Astra double; vs Sonnet 5: GLM 1.9x, Qwen 1.3x, V4 Pro 2.0x, M3 7.6x, K3 0.67x
- corrected: Recomputed; all match
- evidence: https://platform.claude.com/docs/en/about-claude/pricing
- note: Cache-read parity note holds: Fable 5.1 $0.25 vs GLM-5.3 $0.26, K3 $0.30, Qwen $0.25

### 31. AA cost to run Intelligence Index

- verdict: corrected
- original: Fable 5.1 max $7.63 / xhigh $5.98; Opus 5 $5.86; Astra $3.26/$2.31; Qwen3.8 Max $2.67; GLM-5.3 $2.01; K3 $2.00; Sol $1.99; Terra $1.40; M3 $0.51; Flash $0.25; V4 Flash $0.22; V4 Pro $0.12
- corrected: All confirmed except DeepSeek V4 Pro: $0.12 is 'DeepSeek V4 Pro 0424 (max)'; 'DeepSeek V4 Pro 0813 (max)' costs $0.67. Also present: Claude Fable 5 (with fallback) $8.75
- evidence: https://artificialanalysis.ai/leaderboards/models
- note: Derived ratios (Opus 5/GLM-5.3 2.9x, Fable 5.1 max/GLM-5.3 3.8x) hold

### 32. AA Intelligence Index v4.3 scores

- verdict: confirmed
- original: Fable 5.1 53; Astra 53; Opus 5 51; Fable 5 50; Sol 47; GLM-5.3 45; K3 44; Flash 42; Terra 42; Gemini 3.8 Flash 41; Qwen 40; V4 Flash 35; V4 Pro 31-36; M3 30
- corrected: All match; V4 Pro 0813 = 36, V4 Pro 0424 = 31. AA's Sep 7 X post says GLM-5.3 and K3 'lead open weights models at 44' (page shows GLM-5.3 max at 45). Index composition ('10 evals incl. TB 4.0, SciCode, AutomationBench') and AA Coding Index figures were not verifiable (coding-index page 404)
- evidence: https://artificialanalysis.ai/leaderboards/models
- note: https://247wallst.com/cards/xpost-01m1yj852p230gg5tksfn4q7bh

### 33. Epoch open-weight lag

- verdict: confirmed
- original: ~4 months / 8 ECI points (GPT-5 to GPT-5.5 gap), since 2026-01-01; K2.6 151.6 vs GPT-5.5 Pro 159.35; 2026-05-29
- corrected: Verbatim confirmed; the '3-month lag for 2023-2025' comparison was not in the fetched text (unverified)
- evidence: https://epoch.ai/data-insights/open-closed-eci-gap
- note:

### 34. SWE-bench Verified, Vals bash-only harness

- verdict: corrected
- original: Opus 5 97.0; V4 Pro 0813 96.4 #2; Sol 96.2; K3 93.4; Opus 4.8 88.6; Grok 4.5 86.6; Sonnet 5 75.5 +-1.8; 7 of 86 >=95; GLM-5.3 #6/88; Qwen3.8 #17/88
- corrected: Opus 5 97.00 (#1/88), V4 Pro 0813 96.40 (#2 of 82), Sol 96.20, K3 93.40, Opus 4.8 88.60, Grok 4.5 86.60, 86 models / 7 at >=95%, updated 9/1/2026, GLM-5.3 6/88, Qwen3.8 Max 17/88 all confirmed. Sonnet 5's score is NOT visible: its page renders '0.0% ± 1.80' rank 27/88 — the 75.5 figure is unverifiable from Vals
- evidence: https://www.vals.ai/benchmarks/swebench
- note: https://www.vals.ai/models/anthropic_claude-sonnet-5 shows placeholder scores; Vals lists Sonnet 5 at $3/$15 as noted

### 35. SWE-bench Verified vendor-reported

- verdict: confirmed
- original: Opus 5 96.0 (5-trial); Fable 5 ~95; Opus 4.6 80.8; V4 Pro 80.6; Gemini 3.1 Pro 80.6; M3 80.5; K2.6 80.2; V4 Flash 79.0; Mistral 77.6; Qwen3-Coder-Next 70.6-71.3
- corrected: V4 Pro Max 80.6, Opus 4.6 80.8, Gemini 80.6, K2.6 80.2 (DeepSeek/Kimi cards); M3 80.5 (HF); V4 Flash 79 (HF); Mistral 77.6 (Mistral post); Opus 5 96.0 (datanorth — '5-trial avg' not stated there); Fable 5 95.0 (emergent). K3/GLM-5.3/Qwen3.8 cards indeed omit SWE-bench Verified. Qwen3-Coder-Next figure not checked
- evidence: https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro
- note: https://datanorth.ai/news/claude-opus-5-by-anthropic; https://emergent.sh/learn/claude-fable-5-1-benchmarks

### 36. SWE-bench Pro vendor-reported

- verdict: confirmed
- original: Fable 5 80.0; Opus 5 79.2; Opus 4.8 69.2; Qwen3.8 67.7; Sol 64.6/Terra 63.4/Luna 62.7; Sonnet 5 63.2; GLM-5.2 62.1; GPT-5.5 58.6-59.4; M3 59.0; K2.6 58.6; V4 Pro 55.4; Gemini 3.1 Pro 54.2; ...
- corrected: Confirmed: Fable 5 80.0, Opus 4.8 69.2, Sol 64.6, Terra 63.4, Luna 62.7, GPT-5.5 59.4, Gemini 54.2 (marktechpost); Opus 5 79.2 (datanorth); Qwen3.8 67.7 (HF); GLM-5.2 62.1 and GPT-5.5 58.6 (VentureBeat); M3 59 (HF); K2.6 58.6 (HF); V4 Pro 55.4 (HF). Not checked: Mythos 5 80.3, Sonnet 5 63.2, Sonnet 4.6 58.1, Gemini 3.5 Flash 55.1, Qwen3-Coder rows. Note Opus 4.6 is 57.3 on DeepSeek's table vs 53.4 on Kimi's — vendor tables disagree by 4 pts on the same closed model
- evidence: https://www.marktechpost.com/2026/07/09/openai-releases-gpt-5-6-a-three-tier-model-family-with-programmatic-tool-calling/
- note: Scale's standardised leaderboard still 403 at labs.scale.com

### 37. Terminal-Bench 2.1 vendor-reported

- verdict: confirmed
- original: Sol 88.8 (Ultra 91.9); K3 88.3; GLM-5.3 88.2; Fable 5 88.0/84.6/83.1; V4 Pro 0813 87.9; Qwen3.8 86.6; Gemini 3.7 Flash 85.8; Opus 4.8 85.0/84.6/78.9; Flash 84.3; V4 Flash 0731 82.7; GLM-5.2 81.0-82.7; Sonnet 5 80.4; Gemini 3.5 Flash 76.2; Qwen3.8-27B 73.0; V4 Pro preview 72.1
- corrected: 0813 card: 87.9 (DeepSeek Harness minimal, max), V4 Flash 0731 82.7, V4 Pro preview 72.1, V4 Flash preview 61.8, GLM-5.2 81.0, K3 88.3, Opus 4.8 85.0, Fable 5 (w/ fallback) 88.0. GLM-5.3 88.2 measured in Claude Code 2.1.207 (HF). Qwen: 86.6 avg@10 Claude Code, Opus 4.8 84.6, Fable 5 84.6, Sol 88.8. OpenAI table: Sol 88.8, Terra 87.4, Luna 84.7, Sol Ultra 91.9, GPT-5.5 85.6, Fable 5 83.1, Opus 4.8 78.9. Flash 84.3, Qwen3.8-27B 73.0 confirmed. Gemini 3.7 Flash, Sonnet 5 80.4 (TB2.1), Gemini 3.5 Flash not checked
- evidence: https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813
- note: Same closed model varies up to 6 pts across vendor tables (Opus 4.8 78.9-85.0)

### 38. Terminal-Bench 2.1 independent reproductions

- verdict: corrected
- original: AA: Fable 5.1 91.4/91.0/89.9. Vals: Sol 85.8, Opus 5 84.6, Sonnet 5 74.5, V4 Pro 0813 54.7 (#42/63); Astra #1/63; GLM-5.3 #19/63; Qwen3.8 #27/63; V4 Flash #28/63
- corrected: AA confirmed (Terminus 2, e2b, pass@1 over 3 repeats): 91.4/91.0/89.9. Vals confirmed: Sol 85.77, Opus 5 84.64 (#4/63), V4 Pro 0813 54.68 — but its page shows rank '#33 of 52', not #42/63; Astra #1/63, GLM-5.3 19/63, Qwen3.8 27/63, V4 Flash 28/63 confirmed. Sonnet 5 74.5 is unverifiable (page renders '0.0% ± 2.08', rank 14/63)
- evidence: https://artificialanalysis.ai/evaluations/terminalbench-v2-1
- note: https://www.vals.ai/models/deepseek_deepseek-v4-pro-0813; Vals' TB2.1 benchmark page URL not found (/benchmarks/terminal-bench is the archived TB1.0 page)

### 39. Terminal-Bench 2.0 vendor (llm-stats)

- verdict: confirmed
- original: GPT-5.5 82.7; Sonnet 5 80.4; GLM-5.1 69.0; Gemini 3.1 Pro 68.5; V4 Pro 67.9; K2.6 66.7; Opus 4.6 65.4; M2.7 57.0; V4 Flash 56.9; '0 verified, 51 self-reported'
- corrected: All scores confirmed; page says 'Verified 0 / Self-reported 53' (not 51), updated Sep 8 2026
- evidence: https://llm-stats.com/benchmarks/terminal-bench-2
- note:

### 40. Terminal-Bench 4.0 and 3.0

- verdict: confirmed
- original: TB4.0: Fable 5.1 55.8, Mythos 5.1 60.9, Opus 5 52.3, Fable 5 42.0, Sol 37.3. TB3.0 (Z.ai): Sol 34.6, GLM-5.3 28.3, Opus 4.8 21.1, K3 17.4
- corrected: Anthropic page: Mythos 5.1 60.9, Fable 5.1 55.8, Sol 37.3, and 52.3/42.0 for Opus 5/Fable 5 (extraction swaps the labels; emergent.sh table gives Opus 5 52.3, Fable 5 42.0). Anthropic also states Fable 5.1 = Mythos 5.1 same model, gap is cyber safeguards. TB3.0 GLM-5.3 28.3 confirmed on HF (Claude Code harness, max, 400K ctx, avg@3); the Sol/Opus 4.8/K3 TB3.0 rows were not in the extraction (unverified)
- evidence: https://www.anthropic.com/claude-fable-and-mythos-5-1
- note: https://emergent.sh/learn/claude-fable-5-1-benchmarks; https://huggingface.co/zai-org/GLM-5.3

### 41. DeepSWE v1.1

- verdict: confirmed
- original: Sol 72.7-73.0; Fable 5 69.7-70.0; K3 67.5; GLM-5.3 66.9; V4 Pro 0813 62.7; Opus 4.8 58.0-59.0; Qwen3.8 56.6; V4 Flash 0731 54.4; GLM-5.2 46.2; Gemini 3.1 Pro 11.8; Gemini 3.8 Flash >70
- corrected: K3 67.5 (HF), GLM-5.3 66.9 (mini-swe-agent harness), V4 Pro 0813 62.7, V4 Flash 0731 54.4, Qwen3.8 56.6 / Opus 4.8 59.0 / Fable 5 70.0 / Sol 73.0 (Qwen table), Sol 72.7 / Fable 5 69.7 / Opus 4.8 59 / GPT-5.5 67 / Gemini 11.8 (OpenAI table). GLM-5.2 46.2 and Gemini 3.8 Flash not checked
- evidence: https://huggingface.co/moonshotai/Kimi-K3
- note:

### 42. LiveCodeBench vendor + Vals

- verdict: confirmed
- original: V4 Pro 93.5; Gemini 91.7; K2.6 89.6; Opus 4.6 88.8; Vals Opus 5 89.0 #4/143; GLM-5.3 #68; Qwen3.8 #10; V4 Flash #17
- corrected: All confirmed; add V4 Pro 0813 rank 13/143 on Vals. 'V4 Pro high 89.8' not checked
- evidence: https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro
- note: https://www.vals.ai/models/anthropic_claude-opus-5

### 43. Aider polyglot stale

- verdict: confirmed
- original: V3.2 Reasoner 74.2% $1.30 (2025-10-03); R1-0528 71.4; Kimi K2 59.1; gpt-oss-120b 41.8; gpt-5 high 88.0% $29.08; no 2026 models
- corrected: All confirmed; latest entry 2025-10-03
- evidence: https://aider.chat/docs/leaderboards/
- note:

### 44. OpenRouter TAU-Bench panels

- verdict: confirmed
- original: Opus 5 80.5; GLM-5.3 80.0; Sonnet 5 79.5; V4 Pro 79.3; Qwen3.8 79.0 (72.9-79.0); V4 Flash 75.8-79.5; Sol 76.0; K2.6 74.0-76.1; M3 70.9-76.5
- corrected: Confirmed from fetched pages: GLM-5.3 80.0 (auto-routing), Qwen3.8 72.9-79.0 (DeepInfra 79.0, Venice 72.9), M3 70.9-76.5, V4 Pro 79.3 (NextBit) / 77.3 (CoreWeave). Opus 5, Sonnet 5, Sol, V4 Flash, K2.6 panels were not fetched (unverified)
- evidence: https://openrouter.ai/z-ai/glm-5.3
- note: Panels are per-provider-route; spread of 6 pts for Qwen confirmed

### 45. taubench.com leaderboard

- verdict: confirmed
- original: tau2: Qwen3.5-397B-A17B 87.9, Gemini 3.0 Pro 85.4, Opus 4.5 85.3; tau3-Banking: Qwen 3.8 Max 55.2, Opus 5 48.7, Grok 4.5 47.9; no K3/GLM-5.3/V4 rows
- corrected: Exactly as stated
- evidence: https://taubench.com
- note:

### 46. Toolathlon-Verified

- verdict: confirmed
- original: Fable 5 77.9; K3 76.5; Opus 4.8 76.2; Sol 74.9; V4 Pro 0813 74.1; GPT-5.5 73.5; V4 Flash 0731 70.3; GLM-5.2 59.9
- corrected: K3 76.5 (HF), V4 Pro 0813 74.1, V4 Flash 0731 70.3 confirmed. Missing from the researcher's list: GLM-5.3 scores 73.0 on its own card (pass@1 avg of 3). Fable 5/Opus 4.8/Sol/GPT-5.5 rows not extracted from the 0813 card (unverified)
- evidence: https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813
- note: https://huggingface.co/zai-org/GLM-5.3

### 47. SWE-rebench leaderboard

- verdict: confirmed
- original: 111 problems/65 repos, 2026-05-15 to 07-01; Fable 5 64.5/78.4/$4.40/2.52M; Grok 4.5 63.8/77.5/$1.47/2.43M; Opus 5 63.4/74.8/$3.47/4.32M; GLM-5.2 62.9/81.1/$1.40/5.52M; Sol 62.3/79.3/$0.85/0.61M; Sonnet 5 56.8/74.8/$1.43/4.65M; M3 47.2/69.4/$0.95/13.87M; V4 Pro 40.2/64.0/$0.15/3.96M; Qwen3.6-27B 31.2/57.7/$0.62/3.08M; Qwen3.6-35B-A3B 24.7/43.2/$0.27
- corrected: Every number confirmed (tokens: 2,518,308 / 2,429,424 / 4,322,143 / 5,524,892 / 605,340 / 4,645,617 / 13,869,459 / 3,955,414 / 3,078,970 / 3,726,061; cached 76.8-97.0%). 'Fixed ReAct scaffold, 5 runs/problem' is not on the page (methodology lives in the linked paper arXiv 2505.20411) — unverified. Which DeepSeek price the $0.15 used is not stated
- evidence: https://swe-rebench.com/
- note: No K3/GLM-5.3/Qwen3.8 rows

### 48. Cost per solved task (derived)

- verdict: confirmed
- original: Fable 5 $6.82; Opus 5 $5.47; Sonnet 5 $2.52; GLM-5.2 $2.23; M3 $2.01; Qwen3.6-27B $1.99; Sol $1.36; V4 Pro $0.37
- corrected: Recomputed from confirmed inputs; all match. The V4 Pro '$1.1-3.7 post-rise' range inherits the contested pre-change price (see DeepSeek pricing check)
- evidence: https://swe-rebench.com/
- note:

### 49. Token-volume multiplier (derived)

- verdict: confirmed
- original: M3 5.5x; GLM-5.2 2.2x; Sonnet 5 1.8x; Opus 5 1.7x; V4 Pro 1.6x; Qwen3.6-27B 1.2x; Sol 0.24x
- corrected: Recomputed: 5.51, 2.19, 1.85, 1.72, 1.57, 1.22, 0.24
- evidence: https://swe-rebench.com/
- note: OpenRouter's actual GLM 5.2 wording is 'It is token hungry and can burn money on high thinking models'

### 50. Attempts multiplier (derived)

- verdict: confirmed
- original: GLM-5.2 ~1x; M3 ~2-5x; V4 Pro ~5x; Sonnet 5 ~1.5-2x; independent-trial k=1.6, predicted pass@5 95.9
- corrected: ln(0.355)/ln(0.528)=1.62; 1-0.528^5=0.959; pass@1/pass@5 inputs confirmed
- evidence: https://swe-rebench.com/
- note: Derivation only; no measured attempts multiplier exists

### 51. akitaonrails 24-model Rails build

- verdict: confirmed
- original: Opus 4.7 97 ~$1.10; GPT-5.4 xHigh 97 ~$16; GPT-5.5 xHigh 96 ~$10; V4 Pro 89 ~$3.14 (DeepClaude); K2.6 87 ~$0.30; Gemini 3.1 Pro 82 ~$0.40; V4 Flash 78 ~$0.01; Qwen 3.6 Plus 71 ~$0.15; GLM 5 64; GLM 5.1 46; V3.2 43; M2.7 41; Qwen3 Coder Next 32; GPT-OSS 20B 11; tiers; failure modes; 0/7 delegation
- corrected: All scores, costs, tiers, reasoning_content note, Gemma 4/Qwen 2.5 Coder/Llama 4 Scout/Ollama failures and 0-of-7 delegation confirmed. GLM 5 cost ~$0.11. Task is a ChatGPT-style Rails chat app; URL date 2026-04-24
- evidence: https://akitaonrails.com/en/2026/04/24/llm-benchmarks-parte-3-deepseek-kimi-mimo/
- note:

### 52. Kilo Code backend build

- verdict: corrected
- original: Opus 4.7 91; V4 Pro 77; K2.6 68; V4 Flash 60; $0.02 run '100x cheaper than Opus per quality point'; 'held up surprisingly well'
- corrected: Scores 91/77/68/60, task shape, lease bugs, and $0.02 V4 Flash run confirmed. The page's phrasing is 'roughly 1/89th of Claude Opus 4.7' in output-token cost — not '100x per quality point'. The quote found on tool calling is 'The agent loop ran cleanly even when the code it produced had gaps'; 'held up surprisingly well' was not found. Correctness-gap quote confirmed
- evidence: https://blog.kilo.ai/p/we-tested-deepseek-v4-pro-and-flash
- note:

### 53. arXiv 2604.17187 GH200 study

- verdict: confirmed
- original: Kimi-K2.5 Q3 most complete; three failure modes; 10-15B-active ~1/7 hardware cost of 32-40B-active
- corrected: Abstract confirms UD-Q3_K_XL Kimi-K2.5 'most complete and specification-compliant', the three issues, and '1/7th the hardware cost'. Models: Kimi-K2.5 Q3/Q4, GLM-5.1, Qwen3-Coder-480B, DeepSeek-V3.2; submitted Apr 19 2026
- evidence: https://arxiv.org/abs/2604.17187
- note: 'despite lower SWE-bench Pro' not in abstract

### 54. Kimi K2.6 long-horizon reports (Handy AI)

- verdict: confirmed
- original: 13-hour refactor 4,000+ lines / 1,000+ tool calls; 12-hour Zig port; 300 sub-agents / 4,000 steps; hallucination tendency; no system card
- corrected: All confirmed; launch price $0.60/$2.50 also on this page
- evidence: https://handyai.substack.com/p/model-drop-kimi-k26
- note:

### 55. Kimi K3 harness sensitivity

- verdict: confirmed
- original: preserved thinking history; 'if a harness does not send earlier reasoning back correctly ... quality may become unstable'; Kimi Code recommended; 'excessively proactive'; effort=max, temp 1.0
- corrected: Quotes confirmed on nxcode (2026-07-17); HF card confirms 'preserved thinking history mode', requires reasoning_content passed back as-is, and all evals at effort max / temperature 1.0
- evidence: https://www.nxcode.io/resources/news/kimi-k3-benchmarks-coding-agent-evaluation-guide-2026
- note: https://huggingface.co/moonshotai/Kimi-K3

### 56. OpenRouter June 2026 operator observations

- verdict: confirmed
- original: V4 Flash 'first open-weight model teams immediately dropped into real agentic pipelines'; GLM 5.2 'closest drop-in replacement', 'consumes tokens quickly', ~78 tok/s; M3 'not optimal for pure text coding; can be verbose'; prices V4 Flash $0.054/$0.242, GLM 5.2 $0.447/$3.31, M3 $0.098/$1.21, Nemotron $0.423/$2.61
- corrected: Verbatim: 'The first open-weight model that teams immediately dropped into real agentic pipelines as a plausible substitute'; 'Flash performs better with very specific instructions than when relying on its own judgement'; GLM 5.2 'Closest drop-in replacement for agentic planning and coding', 'It is token hungry and can burn money on high thinking models', ~78 tok/s; M3 'can be verbose, and reasoning-heavy', 'for text-only agentic coding, GLM 5.2 is likely a better default'. Prices confirmed (V4 Flash first-party then $0.14/$0.28; $0.054/$0.242 OpenRouter weighted avg). Date 6/27/2026
- evidence: https://openrouter.ai/blog/insights/the-open-weight-models-that-matter-june-2026/
- note:

### 57. modelfit local-model tool-call tier list

- verdict: confirmed
- original: Qwen3.6/3.5-35B-A3B SS; Gemma 4 31B AA; Mistral Small 22B format errors; R1 distills drop tool calls; 'format errors and dropped tool calls break the agentic loop'
- corrected: Tiers and notes confirmed; the page's wording is 'models that drop or mangle tool_calls break the loop no matter how good their prose is'
- evidence: https://modelfit.io/tools/claude-code/
- note:

### 58. MindStudio V4 Pro 0813 8-task probe

- verdict: confirmed
- original: 61/80 (76%); long-horizon 10/10; overthinks, overengineering, rewrites whole files
- corrected: 61/80 = 76.25%, 8 tasks, 10/10 long-horizon, quotes confirmed, Aug 13 2026
- evidence: https://www.mindstudio.ai/blog/deepseek-v4-pro-0813-benchmark-review
- note:

### 59. Vals per-test cost and Index

- verdict: confirmed
- original: Opus 5 $18.81; Astra $19.09; Sonnet 5 $17.61; Sol $13.79; GLM-5.3 $6.73; Qwen3.8 $4.00; V4 Pro 0813 $3.38; V4 Flash 0731 $0.87; Index Opus 5 67.2, Astra 66.6, Sonnet 5 59.6, GLM-5.3 57.0, V4 Flash 53.6, V4 Pro 52.4
- corrected: $18.81 / $19.09 / $17.61 / $13.79 / $6.732 / $3.997 / $3.376 / $0.866 confirmed; Index 67.21 / 66.61 / 59.61 / 56.97 / 53.57 / 52.37 confirmed; add Sol 63.71 and Qwen3.8 Max 51.84. Vals prices V4 Pro at $1.32/$3.96 and V4 Flash at $0.44/$1.32 (peak)
- evidence: https://www.vals.ai/models/anthropic_claude-opus-5
- note: https://www.vals.ai/models/alibaba_qwen3.8-max; https://www.vals.ai/models/deepseek_deepseek-v4-flash-0731

### 60. Faros/Fireworks 211-task study

- verdict: confirmed
- original: 211 tasks, 7 setups, 'closed models still lead on the most complex, multi-step agentic work'; table repeats vendor numbers
- corrected: 211 tasks, 7 model+harness setups, quote verbatim, dated July 9 2026; table columns extracted were SWE-bench Pro / Terminal-Bench 2.1 / GPQA (GLM-5.2 62.1/81.0; V4 Pro 55.4/64.0*; M3 59.0/66.0; K2.6 58.6/66.7*; Qwen3-Coder 80B 44.3/36.2*). Per-setup acceptance/cost still not on page
- evidence: https://www.faros.ai/blog/open-weight-models
- note: Faros labels V4 Pro/K2.6 TB numbers as vendor-reported TB2.0-era figures

### 61. GLM-5.2 VentureBeat vendor table

- verdict: confirmed
- original: SWE-bench Pro 62.1 (GPT-5.5 58.6); TB2.1 81.0 (GPT-5.5 84.0, Opus 4.8 85.0); FrontierSWE 74.4 (75.1); MCP-Atlas 77.0 (77.8); SWE-Marathon 13.0; 2026-06-16; $1.40/$4.40; one-sixth of $35
- corrected: All confirmed; MIT licence; one-sixth = $5.80 vs $35.00 combined per-MTok
- evidence: https://venturebeat.com/technology/z-ais-open-weights-glm-5-2-beats-gpt-5-5-on-multiple-long-horizon-coding-benchmarks-for-1-6th-the-cost
- note:

### 62. Reproduction gap warning V4 Pro 0813 TB2.1

- verdict: confirmed
- original: vendor 87.9 vs independent 78.7 vs Vals 54.7
- corrected: orcarouter (Aug 16 2026): 87.9 vendor, 'separately-sourced ... run of 78.7', AA Index 53 (v4.1 scale), Coding 68.8; Vals 54.68 confirmed; contextstudios carries the NIST CAISI quote ('performs similarly to GPT-5, which was released about 8 months ago')
- evidence: https://www.orcarouter.ai/blog/deepseek-v4-pro-benchmark
- note: https://www.contextstudios.ai/blog/deepseek-v4-pro-0813-ga-open-weight-frontier-beats-opus-4-8-on-terminal

## Additions

- DeepSeek's official price table (not_found item resolved) is an image on the Aug 13 news post: V4 Flash off-peak $0.007 hit/$0.22 miss/$0.66 out, peak $0.014/$0.44/$1.32; V4 Pro off-peak $0.022/$0.66/$1.98, peak $0.044/$1.32/$3.96; peak 01:00-04:00 and 06:00-10:00 UTC; effective 16:00 UTC Aug 16 2026 — https://api-docs.deepseek.com/img/v4_260813_price_en.png (text at https://api-docs.deepseek.com/news/news260813). Pre-change price still unconfirmed by any primary source.
- AA cost-to-run for DeepSeek V4 Pro 0813 (max) is $0.67 (index 36); the $0.12 figure is the 0424 preview (index 31). A cost model should use $0.67 — https://artificialanalysis.ai/leaderboards/models
- AA effort configs matter more than model choice for cost: Fable 5.1 high 51/$3.91, medium 49/$2.98, low 47/$2.37 (vs max 53/$7.63); GPT-6 Astra high 51/$1.72, medium 50/$1.54, low 46/$0.82 (vs max 53/$3.26); Claude Fable 5 (with fallback) 50/$8.75 — https://artificialanalysis.ai/leaderboards/models
- Anthropic states Fable 5.1 costs 'an estimated 25% less than Fable 5 for typical workloads' and 'approximately 45%' less for highly agentic work at identical list price (cache read $0.25 vs Fable 5's $1.00) — https://www.anthropic.com/claude-fable-and-mythos-5-1 and https://platform.claude.com/docs/en/about-claude/pricing
- AA lists DeepSeek V4 Pro 0813 at 1.6T total / 49B active (not_found item on 0813 active params) — https://artificialanalysis.ai/models/open-source
- GLM-5.3 Toolathlon-Verified 73.0 and SWE-Marathon v1.1 42.5 on its card (researcher's Toolathlon list stops at GLM-5.2 59.9) — https://huggingface.co/zai-org/GLM-5.3
- DeepSeek V4 Flash (0423) SWE-bench Pro 52.6 (Max mode) — https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash; Qwen3.8-27B (Apache 2.0) SWE-bench Pro 61.7, TB2.1 73.0 — https://huggingface.co/Qwen/Qwen3.8-27B
- Fireworks priority-tier prices for the open tier: GLM-5.3 $1.75/$0.325/$5.50; Kimi K3 $3.75/$0.375/$18.75; K2.6 $1.50/$0.22/$6.00; V4 Pro 0813 $1.65/$0.055/$4.95; V4 Flash 0731 $0.275/$0.00875/$0.825; Qwen3.8 Max $3.00/$0.375/$9.00; M3 $0.45/$0.09/$1.80 — https://docs.fireworks.ai/serverless/pricing
- Vals AI: GPT-5.6 Sol index 63.71 ($13.79/test); Qwen3.8 Max index 51.84 ($3.997/test, SWE-bench rank 17/88, TB2.1 rank 27/63); DeepSeek V4 Pro 0813 LiveCodeBench rank 13/143 — https://www.vals.ai/models/openai_gpt-5.6-sol, https://www.vals.ai/models/alibaba_qwen3.8-max
- Kimi K2.7 Code HF repo created 2026-06-11 (release date was 'unknown') — https://huggingface.co/moonshotai/Kimi-K2.7-Code/commits/main; MiniMax M3 weights repo created 2026-06-12, ~12 days after the May 31 API listing — https://huggingface.co/MiniMaxAI/MiniMax-M3/commits/main
- OpenAI's DeepSWE/TB2.1 table also gives GPT-5.6 Terra 87.4 / Luna 84.7 (TB2.1) and 69.6 / 67.2 (DeepSWE) and GPT-5.5 85.6 TB2.1 / 67 DeepSWE — relevant because Terra ($2/$12) is a closed mid-tier priced below Kimi K3 — https://www.marktechpost.com/2026/07/09/openai-releases-gpt-5-6-a-three-tier-model-family-with-programmatic-tool-calling/
- Vendor tables disagree on the same closed model: Opus 4.6 SWE-bench Pro 57.3 (DeepSeek card) vs 53.4 (Kimi card); Opus 4.8 TB2.1 78.9-85.0; Fable 5 TB2.1 83.1-88.0 — supports treating sub-5-pt vendor gaps as noise — https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro and https://huggingface.co/moonshotai/Kimi-K2.6
- Claude Managed Agents adds $0.08 per session-hour runtime on top of tokens; tool definitions add fixed input overhead per call (e.g. bash tool 325 tokens on Opus 5, computer toolset ~4,500) — relevant for per-task cost modelling on Anthropic — https://platform.claude.com/docs/en/about-claude/pricing
- Still unreachable after retry: Scale SWE-bench Pro leaderboard (labs.scale.com 403), BFCL v4 (renders no rows), OpenAI GPT-6 Astra announcement (403), OpenRouter programming rankings (no data), AA Coding Index page (404), Cerebras/Groq pricing pages (no per-model table), Vals TB2.1 benchmark page (URL unknown; /benchmarks/terminal-bench is archived TB1.0).
