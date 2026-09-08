# Open-weight models for agentic coding (2026-09): current leaders, hosted prices, and gap to closed flagships (Claude Fable 5.1 / Opus 5 / Sonnet 5, GPT-6 Astra / GPT-5.6 Sol, Gemini 3.8 Flash / 3.1 Pro)

## Summary

As of 2026-09-08 the open-weight tier for agentic coding is GLM-5.3 (Z.ai, 753B/40B-active, weights 2026-08-28, custom licence), Kimi K3 (Moonshot, 2.8T/104B, weights 2026-07-26/27, custom licence), DeepSeek V4 Pro 0813 (1.6T/49B, MIT, GA 2026-08-13), Qwen3.8-Max / Qwen3.8-2.4T-A95B (2.4T/95B, custom licence, 2026-08-12), plus cheaper tiers GLM-5.3-Flash (320B/18B, MIT), DeepSeek V4 Flash 0731 (284B/13B, MIT), Kimi K2.6 (1T/32B, modified MIT) and MiniMax M3 (428B/23B). gpt-oss-120b (Aug 2025) and Llama are no longer in the conversation; Mistral's open coding line is now Mistral Medium 3.5 (128B dense, 77.6 SWE-bench Verified). On a 3:1 input:output blend the owner-API prices are GLM-5.3 $2.15/MTok, Kimi K3 $6.00, DeepSeek V4 Pro $1.98 peak / $0.99 off-peak (raised ~3-4.5x on 2026-08-16), Qwen3.8-Max $3.00, MiniMax M3 $0.525, GLM-5.3-Flash $0.24, versus Opus 5 $10.00, Fable 5.1 $20.00, Sonnet 5 $4.00, GPT-6 Astra $20.00 and GPT-5.6 Sol $8.00 - i.e. the best open model is ~4.7x cheaper than Opus 5 and ~9x cheaper than Fable 5.1 on list price, but only ~2.9x/3.8x cheaper on Artificial Analysis' measured cost-to-run-the-index because it burns more tokens, and Kimi K3 is 1.5x MORE expensive than Sonnet 5. SWE-bench Verified is saturated and no longer separates the tiers: on Vals AI's independent bash-only harness Opus 5 97.0, DeepSeek V4 Pro 0813 96.4, GPT-5.6 Sol 96.2, Kimi K3 93.4, while vendor cards for the April-generation open models sit at 80.2-80.6 vs Opus 5's 96.0 (a ~15-16 point vendor-to-vendor gap that is mostly harness). The gap is real on harder suites: SWE-bench Pro Fable 5 80.0 / Opus 5 79.2 vs Qwen3.8-Max 67.7, GLM-5.2 62.1, MiniMax M3 59.0, Kimi K2.6 58.6, DeepSeek V4 Pro 55.4 (12-25 points); Terminal-Bench 2.1 vendor numbers are within 1 point (K3 88.3, GLM-5.3 88.2, V4 Pro 87.9 vs GPT-5.6 Sol 88.8, Fable 5 88.0) but Artificial Analysis measures Fable 5.1 at 91.4 and Vals reproduces DeepSeek V4 Pro 0813 at only 54.7 (vendor 87.9) - a 33-point reproduction gap; the AA Intelligence Index puts the top open models (44) 9 points behind Fable 5.1 / GPT-6 Astra (53), and Epoch estimates open weights trail by ~4 months / 8 ECI points. The only same-scaffold cost-per-task data found (SWE-rebench, 111 tasks, fixed ReAct, May-Jul 2026) gives cost per solved task of Fable 5 $6.82, Opus 5 $5.47, Sonnet 5 $2.52, GLM-5.2 $2.23, MiniMax M3 $2.01, GPT-5.6 Sol (medium) $1.36, DeepSeek V4 Pro (old price) $0.37, with GLM-5.2 matching Opus 5's solve rate (62.9 vs 63.4) at 2.5x fewer dollars but 1.3x more tokens, and MiniMax M3 consuming 5.5x Fable 5's tokens per problem. Practical reports consistently say the second-tier open models need a harness, retries and a verifier: DeepSeek V4 Pro reaches Opus-class output only inside a Claude-Code-style harness, its pass@5 (64.0) roughly equals Fable 5's pass@1 (64.5) so an un-verified single attempt is ~5x less likely to land, local/small models fail on tool-call parsing and infinite loops rather than on code, and Kimi K3 degrades if the harness does not replay its reasoning history. For a software-factory model: budget open-weight tokens at 1.3-5.5x flagship token volume and 1-5 attempts with a verifier, and treat vendor Terminal-Bench numbers as upper bounds until reproduced.

## Facts

### 1. GLM-5.3 (Z.ai) identity: total/active params, context, API release, weights release, licence

- value: 753B total / 40B active MoE; 1M context (1.31M on OpenRouter), 128K max output; API 2026-08-18; weights on Hugging Face 2026-08-28; 'GLM-5.3 License' (not MIT)
- confidence: quoted
- source: https://www.digitalapplied.com/blog/glm-5-3-weights-bespoke-license-not-mit (2026-08-28)
- note: Active-param count (40B) from Artificial Analysis open-source page (https://artificialanalysis.ai/models/open-source); API date from https://openrouter.ai/z-ai/glm-5.3. GLM-5.3 uses the same base model as GLM-5.2 (post-training only) per the HF card https://huggingface.co/zai-org/GLM-5.3.

### 2. GLM-5.3 licence gate

- value: Licensee (with affiliates) running a Model-as-a-Service business with >$10B aggregate revenue over any 12 months must pass Z.AI security review before commercial use; no restriction below that
- confidence: quoted
- source: https://huggingface.co/zai-org/GLM-5.3/blob/main/LICENSE (2026-08-28)
- note: Quoted from the LICENSE file. GLM-5.3-Flash shipped 2 days earlier under plain MIT.

### 3. GLM-5.3-Flash identity

- value: 320B total / 18B active; MIT licence; weights 2026-08-26; Terminal-Bench 2.1 84.3 (vendor)
- confidence: quoted
- source: https://huggingface.co/zai-org/GLM-5.3-Flash (2026-08-26)
- note: Z.ai says it approaches Claude Opus 4.8 on coding/agentic benchmarks at one-tenth the price; AA Intelligence Index 42.

### 4. Kimi K3 (Moonshot) identity

- value: 2.8T total / 104B active (16 of 896 experts), 1,048,576 context, native vision; API 2026-07-16 (OpenRouter), weights public 2026-07-26/27; 'Kimi K3 License'
- confidence: quoted
- source: https://huggingface.co/moonshotai/Kimi-K3 (2026-07-27)
- note: Weights date from VentureBeat (https://venturebeat.com/technology/kimi-k3s-full-weights-are-here-but-theyre-open-with-a-caveat-what-enterprises-should-know, 2026-07-27); API date from https://openrouter.ai/moonshotai/kimi-k3. Largest open-weight model released to date.

### 5. Kimi K3 licence gate

- value: Separate commercial agreement required if licensee+affiliates run Model-as-a-Service and aggregate revenue >$20M over any 12 months; 'Kimi K3' must be shown in UI above 100M MAU or $20M monthly revenue; internal use exempt
- confidence: quoted
- source: https://huggingface.co/moonshotai/Kimi-K3/blob/main/LICENSE (2026-07-27)
- note: Threshold is aggregate revenue of the licensee, not K3-derived revenue.

### 6. Kimi K2.6 identity

- value: 1T total / 32B active MoE, 256K context, released 2026-04-20, Modified MIT licence
- confidence: quoted
- source: https://huggingface.co/moonshotai/Kimi-K2.6 (2026-04-20)
- note: Still the most-cited open model in hands-on coding reports through May 2026; superseded by K3 for capability but 6x cheaper.

### 7. Kimi K2.7 Code identity

- value: 1T / 32B active, 256K context, Modified MIT, weights downloadable; Moonshot price $0.95 in / $0.19 cache-hit / $4.00 out per MTok (HighSpeed variant 2x)
- confidence: quoted
- source: https://huggingface.co/moonshotai/Kimi-K2.7-Code (unknown)
- note: Coding-specialised K2 line; card reports Kimi Code Bench v2 62.0 vs GPT-5.5 69.0 and Opus 4.8 67.4; no SWE-bench/Terminal-Bench figures. Pricing from https://platform.kimi.ai/docs/pricing/chat-k27-code.

### 8. DeepSeek V4 Pro identity

- value: 1.6T total / 49B active MoE, 1M context, 384K max output at high/max effort, MIT; preview 2026-04-24, GA build '0813' 2026-08-13
- confidence: quoted
- source: https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro (2026-08-13)
- note: Params from the April card and Artificial Analysis; the 0813 card extraction returned '1.7T' - treat total as 1.6-1.7T. GA date from https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813 and https://www.contextstudios.ai/blog/deepseek-v4-pro-0813-ga-open-weight-frontier-beats-opus-4-8-on-terminal.

### 9. DeepSeek V4 Flash 0731 identity

- value: 284B total / 13B active (April card; 0731 card extraction says ~304B), 1M context, MIT, released 2026-07-31
- confidence: quoted
- source: https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731 (2026-07-31)
- note: Efficiency-optimised sibling; OpenRouter June report called V4 Flash 'the first open-weight model teams immediately dropped into real agentic pipelines'.

### 10. Qwen3.8-2.4T-A95B (open checkpoint of Qwen3.8-Max) identity

- value: 2.4T total / 95B active MoE; 262,144 native context extensible to 1,010,000; released 2026-08-12; 'Qwen3.8-Max License' (not Apache 2.0)
- confidence: quoted
- source: https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B (2026-08-12)
- note: Release date from https://openrouter.ai/qwen/qwen3.8-2.4t-a95b. Smaller Qwen3.8-27B (2026-08-21) is Apache 2.0.

### 11. Qwen3.8-Max licence gate

- value: Separate licence from Qwen required for Model-as-a-Service / AI Work Assistant businesses above $50M aggregate 12-month revenue; model name must be displayed in UI above 100M MAU or $20M monthly revenue
- confidence: quoted
- source: https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B/blob/main/LICENSE (2026-08-12)
- note: Same shape as Kimi K3 and GLM-5.3 licences: MIT-like below a revenue threshold.

### 12. MiniMax M3 identity

- value: ~428B total / ~23B active, 1M context (MiniMax Sparse Attention), native image+video input; released 2026-05-31/06-01; 'MiniMax Community License' (commercial use requires authorisation)
- confidence: quoted
- source: https://huggingface.co/MiniMaxAI/MiniMax-M3 (2026-06-01)
- note: Licence characterisation from OpenRouter June 2026 report (https://openrouter.ai/blog/insights/the-open-weight-models-that-matter-june-2026/).

### 13. Mistral Medium 3.5 identity (Mistral's current open coding model; Devstral 2 and Magistral retired into it)

- value: 128B dense, 256K context, Modified MIT, released 2026-04-30; API $1.50 in / $7.50 out per MTok; SWE-bench Verified 77.6%; tau3-telecom 91.4
- confidence: quoted
- source: https://letsdatascience.com/blog/mistral-medium-3-5-128b-open-weight-merged-model (2026-04-30)
- note: Secondary source citing Mistral's post https://mistral.ai/news/vibe-remote-agents-mistral-medium-3-5 (not fetched directly). Not listed on Together/Fireworks/DeepInfra serverless pricing pages fetched 2026-09-08.

### 14. gpt-oss-120b (OpenAI) status

- value: Released 2025-08-05, ~117B total MoE, Apache 2.0; hosted at $0.15 in / $0.60 out on Together and Fireworks; Aider polyglot 41.8% (high)
- confidence: quoted
- source: https://huggingface.co/blog/welcome-openai-gpt-oss (2025-08-05)
- note: No newer OpenAI open-weight model found in OpenAI's pricing page (fetched 2026-09-08) or searches; a year old and not competitive with the 2026 open tier. Hosted prices from https://www.together.ai/pricing and https://docs.fireworks.ai/serverless/pricing; Aider figure from https://aider.chat/docs/leaderboards/.

### 15. Meta Llama status for agentic coding in 2026

- value: No first-party 2026 Llama flagship verified; Meta's 2026 open-weight release referenced by third parties is 'Muse Glimmer' 30B (2026-08-21) at Terminal-Bench 2.1 51.7; Llama 4 Maverick scored 15.6% on Aider polyglot (2025-04)
- confidence: estimated
- source: https://codingfleet.com/blog/terminal-bench-leaderboard-2026/ (2026-09-03)
- note: llama.com redirected to developer.meta.com/ai (not fetched). One search result explicitly warned that 'Llama 5' spec claims have not appeared on any first-party Meta channel and should be treated as fabricated. Aider figure from https://aider.chat/docs/leaderboards/.

### 16. Owner-API price: GLM-5.3 and GLM-5.2 (Z.ai)

- value: $1.40 in / $0.26 cached in / $4.40 out per MTok; cached-input storage 'limited-time free'
- confidence: quoted
- source: https://docs.z.ai/guides/overview/pricing (fetched 2026-09-08)
- note: Same price as GLM-5.1; GLM-5 is $1.00/$3.20.

### 17. Owner-API price: GLM-5.3-Flash (Z.ai)

- value: $0.075 in / $0.015 cached / $0.25 out per MTok at a 50% promotion ending 2026-09-09 (UTC+8); list price $0.15 / $0.03 / $0.50
- confidence: quoted
- source: https://docs.z.ai/guides/overview/pricing (fetched 2026-09-08)
- note: List price corroborated by Together ($0.15/$0.50/$0.03 cache) and Fireworks ($0.15/$0.03/$0.50).

### 18. Western-provider prices: GLM-5.3

- value: Together $1.40/$4.40 (cache $0.26); Fireworks $1.40/$0.26 cached/$4.40 (priority $1.75/$5.50); DeepInfra $1.20/$4.00 (cache $0.12, fp4); cheapest OpenRouter route $1.113/$3.498
- confidence: quoted
- source: https://docs.fireworks.ai/serverless/pricing (fetched 2026-09-08)
- note: Together from https://www.together.ai/pricing; DeepInfra from https://deepinfra.com/zai-org/GLM-5.3 (note fp4 quantisation); OpenRouter routes from https://openrouter.ai/z-ai/glm-5.3 (27 providers listed).

### 19. Owner-API price: Kimi K3 (Moonshot)

- value: $3.00 in (cache miss) / $0.30 in (cache hit) / $15.00 out per MTok; 1,048,576 context
- confidence: quoted
- source: https://platform.kimi.ai/docs/pricing/chat-k3 (fetched 2026-09-08)
- note: Same as Claude Sonnet 4.6's old $3/$15; 1.5x Sonnet 5's current $2/$10.

### 20. Western-provider prices: Kimi K3

- value: Together $3.00/$15.00; Fireworks $3.00/$0.30 cached/$15.00 (Fast tier $4.50/$22.50); DeepInfra $2.85/$14.25 (cache $0.285); OpenRouter floor $2.50/$14.00 (Morph)
- confidence: quoted
- source: https://openrouter.ai/moonshotai/kimi-k3 (fetched 2026-09-08)
- note: Together from https://www.together.ai/pricing; Fireworks from https://docs.fireworks.ai/serverless/pricing; DeepInfra from https://deepinfra.com/pricing.

### 21. Owner-API price: Kimi K2.6 (Moonshot) - and note the price rose since launch

- value: Now $0.95 in / $0.16 cache-hit / $4.00 out per MTok; at launch (2026-04-20) $0.60 / $2.50
- confidence: quoted
- source: https://platform.kimi.ai/docs/pricing/chat-k26 (fetched 2026-09-08)
- note: Launch price from Handy AI (https://handyai.substack.com/p/model-drop-kimi-k26, Apr 2026) and codersera; a ~1.6x increase. DeepInfra $0.75/$3.50 (cache $0.15); Fireworks $0.95/$4.00; cheapest OpenRouter route $0.58/$2.44 (https://openrouter.ai/moonshotai/kimi-k2.6).

### 22. Owner-API price: DeepSeek V4 Pro 0813 - peak/off-peak schedule effective 2026-08-16/17

- value: Peak (01:00-04:00 and 06:00-10:00 UTC): $1.32 in / $0.044 cache-hit / $3.96 out per MTok; off-peak (all other hours) 50% off: $0.66 / $0.022 / $1.98. Before 2026-08-16: $0.435 / ~$0.004 / $0.87
- confidence: quoted
- source: https://www.aipricing.guru/deepseek-pricing/ (2026-09-08)
- note: DeepSeek's own pricing page (platform.deepseek.com/api-docs/pricing, api-docs.deepseek.com/quick_start/pricing) returned 403/wrong page; the schedule is corroborated by Fireworks' listing ($1.32/$0.044/$3.96, https://docs.fireworks.ai/serverless/pricing), Vals AI ($1.32/$3.96), kdpisda.in (2026-08-14) and contextstudios (2026-08-13, 'blended increase ~264%'). Verdent (2026-04-29) recorded the April list at $1.74/$3.48 before an interim cut to $0.435/$0.87.

### 23. Owner-API price: DeepSeek V4 Flash 0731 - peak/off-peak

- value: Peak $0.44 in / $0.014 cache-hit / $1.32 out per MTok; off-peak $0.22 / $0.007 / $0.66. Before 2026-08-16: $0.14 / $0.28
- confidence: quoted
- source: https://www.aipricing.guru/deepseek-pricing/ (2026-09-08)
- note: Fireworks lists $0.22/$0.007/$0.66; Together still lists $0.14/$0.28 (cache $0.03); DeepInfra $0.09/$0.18 (cache $0.018); OpenRouter floor $0.0679/$0.168 (DigitalOcean). Some Western hosts undercut the owner's new peak price by 3-6x.

### 24. Western-provider prices: DeepSeek V4 Pro

- value: Together $1.32/$3.96 (cache $0.13); Fireworks $1.32/$0.044 cached/$3.96; DeepInfra $1.30/$2.60 (cache $0.10); OpenRouter floor $0.87/$1.74 (DigitalOcean)
- confidence: quoted
- source: https://www.together.ai/pricing (fetched 2026-09-08)
- note: DeepInfra from https://deepinfra.com/pricing; OpenRouter from https://openrouter.ai/deepseek/deepseek-v4-pro (Fireworks route there shows $1.20/$1.20, likely a stale/anomalous listing).

### 25. Owner-API price: Qwen3.8-Max (Alibaba Cloud Model Studio)

- value: $2.00 in / $6.00 out per MTok; cache read $0.20-0.25 (90% off); batch 50% off ($1.00/$3.00); cache and batch discounts not stackable
- confidence: quoted
- source: https://openrouter.ai/qwen/qwen3.8-2.4t-a95b (fetched 2026-09-08)
- note: Alibaba Cloud Int. route on OpenRouter lists $2.00/$6.00/$0.25 cache; batch/cache rules from TechRepublic/aipricing.guru search summaries (not fetched). Fireworks $2.00/$0.25/$6.00; Together (via OpenRouter) $2.00/$6.00; DeepInfra $1.65/$4.951 (cache $0.206). Together's own pricing page lists a 'Qwen3.8' at $0.15/$0.47 which is almost certainly the 27B, not Max.

### 26. Owner-API price: MiniMax M3

- value: $0.30 in / $1.20 out / $0.06 cache-read per MTok for <=512K input; $0.60 / $2.40 / $0.12 above 512K; priority tier 1.5x; shown as 'Permanent 50% off' a $0.60/$2.40 list price
- confidence: quoted
- source: https://developer.puter.com/tutorials/minimax-api-pricing/ (2026-06-19)
- note: platform.minimax.io pricing page could not be fetched (returned audio-plan page); the MiniMax route on OpenRouter (https://openrouter.ai/minimax/minimax-m3) confirms $0.30/$1.20/$0.06. Together $0.30/$1.20; DeepInfra $0.28/$1.10; CoreWeave $0.23/$0.96.

### 27. Closed flagship list prices (Anthropic, current)

- value: Fable 5.1 $10/$50, cache read $0.25 (0.025x), cache write $12.50 (5m) / $20 (1h); Opus 5 $5/$25, cache read $0.50; Sonnet 5 $2/$10 (introductory price made permanent; the 2026-09-01 rise to $3/$15 'will not occur'), cache read $0.20; Haiku 4.5 $1/$5; Batch 50% off; 1M context at standard price; Opus 5 fast mode $10/$50
- confidence: quoted
- source: https://platform.claude.com/docs/en/about-claude/pricing (fetched 2026-09-08)
- note: Matches the cached first-party list supplied in the task; the Sonnet 5 note resolves the conflicting third-party claims that it would go to $3/$15 in September. Claude 4.7+ tokenizer yields ~30% more tokens for the same text than Sonnet 4.6-era models.

### 28. Closed flagship list prices (OpenAI, current) - GPT-6 Astra is now OpenAI's top model and GPT-5.6 Sol was cut

- value: gpt-6-astra $10 in / $1 cached / $50 out (long-context 2x, fast 2x, batch/flex 50%); gpt-5.6-sol $4 / $0.40 / $20 (was $5/$30 at 2026-07-09 launch); gpt-5.6-terra $2 / $0.20 / $12; gpt-5.6-luna $0.20 / $0.02 / $1.20; gpt-5.5 $5 / $0.50 / $30
- confidence: quoted
- source: https://developers.openai.com/api/docs/pricing (fetched 2026-09-08)
- note: GPT-6 Astra: 1,050,000 context, 128K output, release 2026-09-03 per Vals AI (https://www.vals.ai/models/openai_gpt-6-astra); OpenAI's announcement page returned 403 so no first-party coding benchmarks were obtained. Launch prices for GPT-5.6 from https://artificialanalysis.ai/articles/gpt-5-6-has-landed (2026-07-09).

### 29. Closed flagship list prices (Google, current) - Gemini 3.5 Pro never appeared; newest is Gemini 3.8 Flash

- value: Gemini 3.8 Flash $0.75 in / $3.75 out / $0.075 cache through 2026-12-31 (then $1.50/$7.50); Gemini 3.5 Flash $1.50/$9.00; Gemini 3.1 Pro Preview $2/$12 (<=200K), $4/$18 (>200K); batch/flex 50% off
- confidence: quoted
- source: https://ai.google.dev/gemini-api/docs/pricing (2026-09-04)
- note: Gemini 3.5 Pro was promised for 'next month' at I/O (2026-05-19) and had not shipped as of 2026-07-15 (https://aitoolsreview.co.uk/insights/gemini-3-5-pro); it is absent from the 2026-09-04 pricing page. Gemini 3.8 Flash's model page cites DeepSWE v1.1 >70% but no SWE-bench/Terminal-Bench figures.

### 30. Blended 3:1 input:output list price per MTok, owner/first-party API

- value: Fable 5.1 $20.00; GPT-6 Astra $20.00; Opus 5 $10.00; GPT-5.6 Sol $8.00; Kimi K3 $6.00; Gemini 3.1 Pro $4.50; Sonnet 5 $4.00; Qwen3.8-Max $3.00; Mistral Medium 3.5 $3.00; GLM-5.3 $2.15; DeepSeek V4 Pro $1.98 peak / $0.99 off-peak; Kimi K2.6 $1.71; DeepSeek V4 Flash $0.66 peak / $0.33 off-peak; MiniMax M3 $0.525; gpt-oss-120b $0.26; GLM-5.3-Flash $0.24 list ($0.12 promo)
- confidence: derived
- source: https://platform.claude.com/docs/en/about-claude/pricing (fetched 2026-09-08)
- note: blended = (3*input + output)/4 using the owner-API prices in the facts above (no caching). Example: GLM-5.3 = (3*1.40 + 4.40)/4 = 2.15; Kimi K3 = (9 + 15)/4 = 6.00; V4 Pro peak = (3.96 + 3.96)/4 = 1.98.

### 31. Price ratio (flagship blended / open blended), list prices, no cache

- value: vs Opus 5 ($10): GLM-5.3 4.65x, Kimi K3 1.67x, Kimi K2.6 5.8x, DeepSeek V4 Pro 5.1x peak / 10.1x off-peak, V4 Flash 15x / 30x, Qwen3.8-Max 3.3x, MiniMax M3 19x, GLM-5.3-Flash 42x. vs Fable 5.1 or GPT-6 Astra ($20): double those (GLM-5.3 9.3x, K3 3.3x, V4 Pro 10x peak). vs Sonnet 5 ($4): GLM-5.3 1.9x, Qwen3.8 1.3x, V4 Pro 2.0x peak, M3 7.6x, Kimi K3 0.67x (K3 is 1.5x dearer than Sonnet 5)
- confidence: derived
- source: https://platform.claude.com/docs/en/about-claude/pricing (fetched 2026-09-08)
- note: Ratios of the blended figures in the previous fact. Cache-read prices are near parity at the top: Fable 5.1 $0.25 vs GLM-5.3 $0.26, Kimi K3 $0.30, Qwen $0.20-0.25 - so at 80-90% cache hit rates the input-side advantage of open models largely disappears and the gap is driven by output price ($50 vs $4.40-$15).

### 32. Measured cost to run the Artificial Analysis Intelligence Index (token-efficiency-adjusted cost), v4.3

- value: Fable 5.1 (max) $7.63; Fable 5.1 (xhigh) $5.98; Opus 5 (max) $5.86; GPT-6 Astra (max) $3.26 / (xhigh) $2.31; Qwen3.8 Max $2.67; GLM-5.3 (max) $2.01; Kimi K3 $2.00; GPT-5.6 Sol (max) $1.99; GPT-5.6 Terra $1.40; MiniMax M3 $0.51; GLM-5.3-Flash $0.25; DeepSeek V4 Flash $0.22; DeepSeek V4 Pro $0.12
- confidence: quoted
- source: https://artificialanalysis.ai/leaderboards/models (fetched 2026-09-08)
- note: Derived ratio: GLM-5.3 costs 1/2.9 of Opus 5 and 1/3.8 of Fable 5.1-max on the index vs 1/4.65 and 1/9.3 on list price - open models spend more tokens per task. DeepSeek V4 Pro's $0.12 predates the 2026-08-16 price rise (AA 'cost/task' uses list prices at evaluation time).

### 33. Artificial Analysis Intelligence Index v4.3 (10 evals incl. Terminal-Bench 4.0, SciCode, AutomationBench) - open vs closed

- value: Fable 5.1 53; GPT-6 Astra 53; Opus 5 51; Fable 5 50; GPT-5.6 Sol 47; GLM-5.3 45 (top open); Kimi K3 44; GLM-5.3-Flash 42; GPT-5.6 Terra 42; Gemini 3.8 Flash 41; Qwen3.8 Max 40; DeepSeek V4 Flash 35; DeepSeek V4 Pro 31-36; MiniMax M3 30
- confidence: quoted
- source: https://artificialanalysis.ai/leaderboards/models (fetched 2026-09-08)
- note: AA's own X post (2026-09-07, via https://247wallst.com/cards/xpost-01m1yj852p230gg5tksfn4q7bh) states 'GLM-5.3 and Kimi K3 continue to lead open weights models at 44 ... 9 points behind Claude Fable 5.1 and GPT-6 Astra, which both score 53'. AA Coding Index (search summary, not fetched): GLM-5.3 44, Kimi K3 44, GLM-5.3-Flash 42, Qwen3.8 40, DeepSeek V4 Pro 0813 36.

### 34. Epoch AI: open-weight lag behind closed frontier

- value: ~4 months, or 8 ECI points (comparable to the GPT-5 to GPT-5.5 gap), averaged since 2026-01-01; open frontier at time of analysis Kimi K2.6 151.6 ECI vs closed GPT-5.5 Pro 159.35
- confidence: quoted
- source: https://epoch.ai/data-insights/open-closed-eci-gap (2026-05-29)
- note: Slightly larger than the 3-month lag Epoch measured for 2023-2025. Predates GLM-5.3/Kimi K3/GPT-6.

### 35. SWE-bench Verified - independent, one harness (Vals AI, minimal bash-tool-only agent)

- value: Claude Opus 5 97.0%; DeepSeek V4 Pro 0813 96.4% (#2/82-88, top open); GPT-5.6 Sol 96.2%; Kimi K3 93.4%; Claude Opus 4.8 88.6%; Grok 4.5 86.6%; Claude Sonnet 5 75.5% (+-1.8); 7 of 86 models >=95% ('saturated'); GLM-5.3 ranked #6/88 and Qwen3.8 Max #17/88 (scores not rendered)
- confidence: quoted
- source: https://www.vals.ai/benchmarks/swebench (2026-09-01)
- note: Per-model pages: https://www.vals.ai/models/deepseek_deepseek-v4-pro-0813, .../anthropic_claude-opus-5, .../openai_gpt-5.6-sol, .../anthropic_claude-sonnet-5 (Vals lists Sonnet 5 at $3/$15, not the actual $2/$10). Capability gap on this harness: V4 Pro 0813 -0.6 pts, K3 -3.6 pts vs Opus 5; both open flagships beat Sonnet 5 by 18-21 pts.

### 36. SWE-bench Verified - vendor-reported (mixed scaffolds)

- value: Claude Opus 5 96.0% (5-trial avg); Claude Fable 5 ~95% (June launch figure; Anthropic published none for Fable 5.1 or Sonnet 5); Claude Opus 4.6 80.8; DeepSeek V4 Pro (0423, max effort) 80.6; Gemini 3.1 Pro 80.6; MiniMax M3 80.5; Kimi K2.6 80.2; DeepSeek V4 Flash (0423) 79.0; Mistral Medium 3.5 77.6; Qwen3-Coder-Next 80B-A3B 70.6-71.3 (SWE-Agent/mini-SWE-agent/OpenHands)
- confidence: quoted
- source: https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro (2026-04-26)
- note: Opus 5 96.0 from Anthropic's announcement as reported by https://datanorth.ai/news/claude-opus-5-by-anthropic (2026-07-27) - the Anthropic page itself renders scores as images. Fable 5 ~95 per https://emergent.sh/learn/claude-fable-5-1-benchmarks. K2.6 from https://huggingface.co/moonshotai/Kimi-K2.6; M3 from https://huggingface.co/MiniMaxAI/MiniMax-M3; Qwen3-Coder-Next from https://arxiv.org/html/2603.00729v1. GLM-5.3, Kimi K3 and Qwen3.8-Max cards no longer report SWE-bench Verified. Derived vendor-to-vendor gap: ~15-16 pts (96.0 vs 80.2-80.6) - mostly harness, per the Vals numbers above.

### 37. SWE-bench Pro - vendor-reported

- value: Claude Fable 5 80.0 (Mythos 5 80.3); Claude Opus 5 79.2; Opus 4.8 69.2; Qwen3.8-Max 67.7; GPT-5.6 Sol 64.6 / Terra 63.4 / Luna 62.7; Claude Sonnet 5 63.2; GLM-5.2 62.1; GPT-5.5 58.6-59.4; MiniMax M3 59.0; Kimi K2.6 58.6; Sonnet 4.6 58.1; DeepSeek V4 Pro (0423 max) 55.4; Gemini 3.5 Flash 55.1; Gemini 3.1 Pro 54.2; Qwen3-Coder-Next 44.3; Qwen3-Coder-480B 38.7 on Scale's standardised scaffold
- confidence: quoted
- source: https://www.marktechpost.com/2026/07/09/openai-releases-gpt-5-6-a-three-tier-model-family-with-programmatic-tool-calling/ (2026-07-09)
- note: Opus 5 79.2 via datanorth (Anthropic announcement); Sonnet 5 63.2 from Anthropic system card via https://www.vellum.ai/blog/claude-sonnet-5-benchmarks-explained; Qwen3.8 67.7 from its HF card; GLM-5.2 62.1 from VentureBeat 2026-06-16; K2.6 58.6, M3 59.0, V4 Pro 55.4 from HF cards. No GLM-5.3 or Kimi K3 SWE-bench Pro figure found. Derived gap vs Fable 5 (80.0): Qwen3.8 -12.3, GLM-5.2 -17.9, M3 -21.0, K2.6 -21.4, V4 Pro -24.6. Scale's standardised leaderboard (labs.scale.com) returned 403.

### 38. Terminal-Bench 2.1 - vendor-reported, mixed harnesses (Kimi Code, Claude Code, DeepSeek Harness, Codex)

- value: GPT-5.6 Sol 88.8 (Sol Ultra 91.9); Kimi K3 88.3 (Kimi Code harness); GLM-5.3 88.2; Claude Fable 5 88.0 (84.6 in Qwen's table, 83.1 in OpenAI's); DeepSeek V4 Pro 0813 87.9 (DeepSeek Harness minimal mode, max effort); Qwen3.8-Max 86.6 (Claude Code, avg@10); Gemini 3.7 Flash 85.8; Claude Opus 4.8 85.0 (84.6/78.9 elsewhere); GLM-5.3-Flash 84.3; DeepSeek V4 Flash 0731 82.7; GLM-5.2 81.0-82.7; Claude Sonnet 5 80.4; Gemini 3.5 Flash 76.2; Qwen3.8-27B 73.0; DeepSeek V4 Pro preview (0423) 72.1
- confidence: quoted
- source: https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813 (2026-08-13)
- note: Cross-checked against https://huggingface.co/moonshotai/Kimi-K3, https://huggingface.co/zai-org/GLM-5.3, https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B, the OpenAI GPT-5.6 table, and https://codingfleet.com/blog/terminal-bench-leaderboard-2026/ (2026-09-03). The same closed model's score varies by up to 5 pts between vendor tables, so treat sub-3-pt differences as noise. Opus 5 TB2.1 89.1 appears only in third-party roundups.

### 39. Terminal-Bench 2.1 - independent reproductions

- value: Artificial Analysis (Terminus 2 harness, e2b sandbox, pass@1 over 3 repeats): Claude Fable 5.1 91.4% (max effort), 91.0 / 89.9 for other Fable 5.1 configs - top of board. Vals AI: GPT-5.6 Sol 85.8%, Claude Opus 5 84.6%, Claude Sonnet 5 74.5%, DeepSeek V4 Pro 0813 54.7% (#42/63) vs vendor 87.9; GPT-6 Astra ranked #1/63 (score not rendered); GLM-5.3 #19/63; Qwen3.8 Max #27/63; DeepSeek V4 Flash 0731 #28/63
- confidence: quoted
- source: https://artificialanalysis.ai/evaluations/terminalbench-v2-1 (fetched 2026-09-08)
- note: Vals figures from https://www.vals.ai/models/openai_gpt-5.6-sol, .../anthropic_claude-opus-5, .../anthropic_claude-sonnet-5, .../deepseek_deepseek-v4-pro-0813. The 33-pt vendor-vs-Vals gap for V4 Pro 0813 (and a 9-pt gap to another independent run of 78.7 cited by https://www.orcarouter.ai/blog/deepseek-v4-pro-benchmark, 2026-08-16) is the key caveat on open-model Terminal-Bench claims: they are harness-tuned upper bounds.

### 40. Terminal-Bench 2.0 (older) - vendor-reported

- value: GPT-5.5 82.7; Claude Sonnet 5 80.4; GLM-5.1 69.0; Gemini 3.1 Pro 68.5; DeepSeek V4 Pro (0423 max) 67.9; Kimi K2.6 66.7; Claude Opus 4.6 65.4; MiniMax M2.7 57.0; DeepSeek V4 Flash (0423 max) 56.9
- confidence: quoted
- source: https://llm-stats.com/benchmarks/terminal-bench-2 (2026-09-08)
- note: llm-stats notes '0 verified, 51 self-reported'. K2.6 and V4 Pro from HF cards. Terminal-Bench 4.0 is the current release and not comparable.

### 41. Terminal-Bench 4.0 and 3.0 (Anthropic-run and Z.ai-run)

- value: TB 4.0 (Anthropic, safeguards on): Fable 5.1 55.8, Mythos 5.1 60.9, Opus 5 52.3, Fable 5 42.0, GPT-5.6 Sol 37.3. TB 3.0 (Z.ai, Claude Code 2.1.207 harness, max effort, 400K ctx): GPT-5.6 Sol 34.6, GLM-5.3 28.3, Claude Opus (4.8) 21.1, Kimi K3 17.4
- confidence: quoted
- source: https://www.anthropic.com/claude-fable-and-mythos-5-1 (2026-09-01)
- note: Opus 5 / Fable 5 TB4.0 split per https://www.datacamp.com/blog/claude-fable-5-1 and https://emergent.sh/learn/claude-fable-5-1-benchmarks (the Anthropic page extraction mislabelled the 42.0 column; Anthropic's X post says 42.0 is Fable 5). TB3.0 from https://huggingface.co/zai-org/GLM-5.3. Fable 5.1 defaults to High effort in Claude Code.

### 42. DeepSWE v1.1 (agentic SWE benchmark reported by every vendor, closest thing to a common yardstick)

- value: GPT-5.6 Sol 72.7-73.0; Claude Fable 5 69.7-70.0; Kimi K3 67.5 (Kimi Code; 67.3 on mini-SWE-agent); GLM-5.3 66.9; DeepSeek V4 Pro 0813 62.7; Claude Opus 4.8 58.0-59.0; Qwen3.8-Max 56.6; DeepSeek V4 Flash 0731 54.4; GLM-5.2 46.2; Gemini 3.1 Pro 11.8; Gemini 3.8 Flash '>70' (Google)
- confidence: quoted
- source: https://huggingface.co/moonshotai/Kimi-K3 (2026-07-27)
- note: Also in https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813, https://huggingface.co/zai-org/GLM-5.3, https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B, the OpenAI GPT-5.6 table and https://deepmind.google/models/gemini/flash/. Kimi notes 'all remaining scores are from the official DeepSWE leaderboard'. Gap top-open to top-closed: ~5 pts.

### 43. LiveCodeBench - vendor and independent

- value: Vendor (v6): DeepSeek V4 Pro (0423 max) 93.5; Gemini 3.1 Pro 91.7; Kimi K2.6 89.6; Claude Opus 4.6 88.8; V4 Pro high 89.8. Independent (Vals): Claude Opus 5 89.0 (#4/143); GLM-5.3 ranked #68/143; Qwen3.8 Max #10/143; DeepSeek V4 Flash 0731 #17/143
- confidence: quoted
- source: https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro (2026-04-26)
- note: Vals from https://www.vals.ai/models/anthropic_claude-opus-5 and per-model pages. LiveCodeBench's own leaderboard page is JS-rendered and did not load.

### 44. Aider polyglot - stale for this question

- value: Aider's own board: top open entry DeepSeek-V3.2 Reasoner 74.2% at $1.30/run (2025-10-03), DeepSeek R1-0528 71.4%, Kimi K2 59.1%, gpt-oss-120b 41.8%; top overall gpt-5 (high) 88.0% at $29.08 (2025-08-23). No 2026-generation model (GLM-5.x, Kimi K2.6/K3, DeepSeek V4, Qwen3.8, Claude 5-series, GPT-5.6) has an entry
- confidence: quoted
- source: https://aider.chat/docs/leaderboards/ (2025-10-03)
- note: llm-stats' Aider-Polyglot page (updated 2026-09-08) mirrors the same 22 self-reported 2025 results. Do not use Aider polyglot for 2026 open-vs-closed gaps.

### 45. Agentic tool-use: OpenRouter's own TAU-Bench runs (same evaluator across models, varies by provider route)

- value: Claude Opus 5 80.5 (77.1-80.5); GLM-5.3 80.0; Claude Sonnet 5 79.5 best route (75.1-79.5); DeepSeek V4 Pro 79.3; Qwen3.8 79.0 (72.9-79.0); DeepSeek V4 Flash 75.8-79.5; GPT-5.6 Sol 76.0; Kimi K2.6 74.0-76.1; MiniMax M3 70.9-76.5
- confidence: quoted
- source: https://openrouter.ai/z-ai/glm-5.3 (fetched 2026-09-08)
- note: From the 'Benchmark' panels on https://openrouter.ai/anthropic/claude-opus-5, .../anthropic/claude-sonnet-5, .../openai/gpt-5.6-sol, .../deepseek/deepseek-v4-pro, .../deepseek/deepseek-v4-flash, .../qwen/qwen3.8-2.4t-a95b, .../moonshotai/kimi-k2.6, .../minimax/minimax-m3. Provider-route spread of up to 6 pts for the same open model is itself a finding: quantised/cheap routes degrade tool use.

### 46. tau-bench official leaderboard (taubench.com) - open models at or above closed on tool-use

- value: tau2-bench (retail/airline/telecom) top: Qwen3.5-397B-A17B 87.9 pass^1 (open), Gemini 3.0 Pro 85.4, Claude Opus 4.5 85.3. tau3-Banking (knowledge retrieval): Qwen 3.8 Max 55.2 (open), Claude Opus 5 48.7, Grok 4.5 47.9. Mistral Medium 3.5 reports tau3-telecom 91.4 (vendor)
- confidence: quoted
- source: https://taubench.com (fetched 2026-09-08)
- note: tau2 leaders are older entries; no Kimi K3 / GLM-5.3 / DeepSeek V4 rows were visible. Mistral figure via letsdatascience.

### 47. Toolathlon-Verified (long-horizon tool use, cross-vendor)

- value: Claude Fable 5 77.9; Kimi K3 76.5; Claude Opus 4.8 76.2; GPT-5.6 Sol 74.9; DeepSeek V4 Pro 0813 74.1; GPT-5.5 73.5; DeepSeek V4 Flash 0731 70.3; GLM-5.2 59.9
- confidence: quoted
- source: https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813 (2026-08-13)
- note: Also in Kimi K3 card. Gap top-open to top-closed ~1.4 pts.

### 48. Same-scaffold real-issue benchmark with cost: SWE-rebench (111 fresh GitHub issues from 65 repos, fixed ReAct scaffold, 5 runs/problem, window 2026-05-15 to 2026-07-01)

- value: Resolved rate (pass@1 avg) | pass@5 | cost/problem | tokens/problem: Claude Fable 5 [high] 64.5% | 78.4 | $4.40 | 2.52M; Grok 4.5 63.8 | 77.5 | $1.47 | 2.43M; Claude Opus 5 [high] 63.4 | 74.8 | $3.47 | 4.32M; GLM-5.2 [high] (open) 62.9 | 81.1 | $1.40 | 5.52M; GPT-5.6 Sol [medium] 62.3 | 79.3 | $0.85 | 0.61M; Claude Sonnet 5 [high] 56.8 | 74.8 | $1.43 | 4.65M; MiniMax M3 (open) 47.2 | 69.4 | $0.95 | 13.87M; DeepSeek V4 Pro [high] (open) 40.2 | 64.0 | $0.15 | 3.96M; Qwen3.6-27B (open) 31.2 | 57.7 | $0.62 | 3.08M; Qwen3.6-35B-A3B 24.7 | 43.2 | $0.27
- confidence: quoted
- source: https://swe-rebench.com/ (2026-07-01)
- note: Cached-token share 76.8-97.0%. DeepSeek cost is at the pre-2026-08-16 price ($0.435/$0.87). Kimi K3, GLM-5.3, Qwen3.8-Max not yet on the board. GLM-5.2 has the highest pass@5 of any model (81.1) - it is strong with retries.

### 49. Cost per solved task (SWE-rebench, derived)

- value: Fable 5 $6.82; Opus 5 $5.47; Sonnet 5 $2.52; GLM-5.2 $2.23; MiniMax M3 $2.01; Qwen3.6-27B $1.99; GPT-5.6 Sol (medium) $1.36; DeepSeek V4 Pro (old price) $0.37 - at the post-08-16 peak price roughly $1.1-3.7
- confidence: derived
- source: https://swe-rebench.com/ (2026-07-01)
- note: cost per solved = cost/problem / resolved rate, e.g. Fable 5 4.40/0.645 = 6.82; GLM-5.2 1.40/0.629 = 2.23; V4 Pro 0.15/0.402 = 0.37. The V4 Pro post-price-rise range is an estimate: input x3.03, output x4.55, cache-hit x~10 versus the price used, applied to a ~80-97% cached mix gives ~3-10x. Best open model (GLM-5.2) is 2.5x cheaper per solved task than Opus 5 and 3.1x cheaper than Fable 5 at ~1 pt lower solve rate; GPT-5.6 Sol medium is cheaper per solve than every open model at this harness because it uses 4-23x fewer tokens.

### 50. Token-volume multiplier per task, open vs flagship (SWE-rebench, same scaffold)

- value: Relative to Fable 5 (2.52M tokens/problem): MiniMax M3 5.5x, GLM-5.2 2.2x, Sonnet 5 1.8x, Opus 5 1.7x, DeepSeek V4 Pro 1.6x, Qwen3.6-27B 1.2x, GPT-5.6 Sol (medium) 0.24x
- confidence: derived
- source: https://swe-rebench.com/ (2026-07-01)
- note: 13.87/2.52 = 5.5; 5.52/2.52 = 2.2; 3.96/2.52 = 1.6; 0.605/2.52 = 0.24. For a cost model, multiply open-model per-token prices by 1.3-5.5x token volume before comparing to flagships; OpenRouter's June report independently notes GLM 5.2 'consumes tokens quickly' (~78 tok/s) and M3 'can be verbose'.

### 51. Attempts multiplier vs flagship (derived from pass@1 vs pass@5 on SWE-rebench; requires an external verifier to pick the passing attempt)

- value: GLM-5.2 ~1x (pass@1 62.9 vs Fable 5 64.5); MiniMax M3 ~2-5x (pass@1 47.2; pass@5 69.4 exceeds Fable's pass@1); DeepSeek V4 Pro [high] ~5x (pass@5 64.0 = Fable pass@1 64.5); Sonnet 5 ~1.5-2x (56.8 -> 74.8)
- confidence: derived
- source: https://swe-rebench.com/ (2026-07-01)
- note: Lower bound for M3 from independent-trial arithmetic: k >= ln(1-0.645)/ln(1-0.472) = 1.6; actual pass@5 (69.4) is far below the independent-trial prediction (95.9), so attempts are correlated and the real multiplier is nearer the upper end. No source publishes a directly measured attempts multiplier for real agent loops.

### 52. Hands-on multi-model agentic build (24 models, one-shot Rails app with 15 requirements, 8-dimension rubric, Claude Code / opencode / Codex harnesses)

- value: Claude Opus 4.7 97/100 ~$1.10/run; GPT-5.4 xHigh 97 ~$16; GPT-5.5 xHigh 96 ~$10; DeepSeek V4 Pro 89 ~$3.14 but only via a Claude Code harness swap ('DeepClaude') - in opencode it fell back after a reasoning_content protocol incompatibility on turn 2; Kimi K2.6 87 ~$0.30 (cheapest Tier A, 3.6x cheaper than Opus); Gemini 3.1 Pro 82 ~$0.40; DeepSeek V4 Flash 78 ~$0.01; Qwen 3.6 Plus 71 ~$0.15; GLM 5 64; GLM 5.1 46; DeepSeek V3.2 43; MiniMax M2.7 41; Qwen3 Coder Next (local) 32; GPT-OSS 20B 11. Tier B (60-79) = 1-2 hours of human patching; local Tier C models need 1-3 corrections per run
- confidence: quoted
- source: https://akitaonrails.com/en/2026/04/24/llm-benchmarks-parte-3-deepseek-kimi-mimo/ (2026-05-06)
- note: Failure modes recorded: Gemma 4 31B infinite tool-call loop after ~11 steps (llama.cpp bug #21375); Qwen 2.5 Coder 32B reasoning loop with zero tool calls for 90 min; Llama 4 Scout emitted tool calls as plain text (no parser); Ollama failed 6/8 local attempts. Multi-model orchestration: 0 of 7 runs voluntarily delegated to a cheaper subagent. Predates GLM-5.2/5.3, Kimi K3, V4 Pro 0813.

### 53. Hands-on backend build (Kilo Code, 20-endpoint workflow-orchestration backend with leases/retries/event streaming)

- value: Claude Opus 4.7 91/100 (1 reproducible bug); DeepSeek V4 Pro 77 (tests passed, TypeScript build failed, lease-handling gaps); Kimi K2.6 68 (same failure pattern as V4 Pro); DeepSeek V4 Flash 60 (route-mounting error prevented API access; $0.02 total run - '100x cheaper than Opus' per quality point). V4 Flash tool calling 'held up surprisingly well'; correctness gap 'inside hard code paths ... still there but also narrowing'
- confidence: quoted
- source: https://blog.kilo.ai/p/we-tested-deepseek-v4-pro-and-flash (2026-05-13)
- note: Both V4 models let expired worker leases still complete steps - a concurrency-correctness class of bug, not a tool-call failure.

### 54. Deployment failure modes of open coding models in a real multi-file build (arXiv, five open models on one GH200)

- value: Kimi-K2.5 at 3-bit quantisation produced the most complete output despite lower SWE-bench Pro; three novel failure modes: default temperature caused sampling hangs on reasoning models, thinking traces leaked through file-path parsers, all models mis-adapted native-mobile APIs for web. 10-15B-active models matched 32-40B-active at ~1/7 the hardware cost
- confidence: quoted
- source: https://arxiv.org/abs/2604.17187 (2026-04-19)
- note: Single task, qualitative; models were Kimi-K2.5 (Q3/Q4), GLM-5.1, Qwen3-Coder-480B, DeepSeek-V3.2.

### 55. Long-horizon reliability reports for Kimi K2.6

- value: 13-hour autonomous refactor of exchange-core: 4,000+ lines changed, 1,000+ tool calls (Moonshot demo); 12-hour Zig port; 'Agent Swarm' 300 concurrent sub-agents / 4,000 steps; community reports a hallucination tendency inherited from K2.5 and no system card at launch
- confidence: quoted
- source: https://handyai.substack.com/p/model-drop-kimi-k26 (2026-04)
- note: Vendor-demonstrated, not independently reproduced. A May 2026 dev.to roundup repeats '12+ hour autonomous run with 4,000+ tool calls' as a community report.

### 56. Kimi K3 harness sensitivity (instruction following over long loops)

- value: Moonshot: K3 was trained with preserved thinking history; 'if a harness does not send earlier reasoning back correctly ... quality may become unstable'; recommends verified harnesses (Kimi Code) and warns K3 'can be excessively proactive on ambiguous tasks'. All K3 card results use reasoning effort=max, temperature 1.0
- confidence: quoted
- source: https://www.nxcode.io/resources/news/kimi-k3-benchmarks-coding-agent-evaluation-guide-2026 (2026-07-17)
- note: Practical consequence: K3 in Claude Code / OpenHands / Aider without reasoning-replay is a different, weaker model than the one benchmarked.

### 57. OpenRouter operator observations on open models in agentic pipelines (June 2026)

- value: DeepSeek V4 Flash: 'first open-weight model teams immediately dropped into real agentic pipelines'; performs better 'with very specific instructions than when relying on its own judgement'. GLM 5.2: 'closest drop-in replacement for agentic planning and coding' but 'consumes tokens quickly on reasoning tasks', ~78 tok/s. MiniMax M3: 'not optimal for pure text coding; can be verbose'
- confidence: quoted
- source: https://openrouter.ai/blog/insights/the-open-weight-models-that-matter-june-2026/ (2026-06-27)
- note: OpenRouter prices at the time: V4 Flash $0.054/$0.242, GLM 5.2 $0.447/$3.31, M3 $0.098/$1.21, Nemotron 3 Ultra $0.423/$2.61.

### 58. Local/small open models in Claude Code: the binding constraint is tool-call format reliability, not code quality

- value: Tier list: Qwen3.6-35B-A3B and Qwen3.5-35B-A3B 'strongest open-weight tool-calling' (SS); Gemma 4 31B low tool-call error rate (AA); Mistral Small 22B 'long tool sequences can hit format errors'; DeepSeek-R1 distills 'drop tool calls into content instead of the tool_calls array' (not recommended); 'format errors and dropped tool calls break the agentic loop'
- confidence: quoted
- source: https://modelfit.io/tools/claude-code/ (2026)
- note: Qualitative tier list; no measured pass rates. Consistent with akitaonrails' local-model failures.

### 59. Vendor-reported DeepSeek V4 Pro 0813 hands-on (8-task independent probe)

- value: 61/80 (76%); long-horizon agentic task 10/10 'completed without intervention'; weaknesses: 'overthinks simple problems', 'tendency toward overengineering', rewrites whole files for one-line fixes
- confidence: quoted
- source: https://www.mindstudio.ai/blog/deepseek-v4-pro-0813-benchmark-review (2026-08-13)
- note: Small probe; no cost/token data. Over-engineering inflates output tokens, which is where DeepSeek's new $3.96/MTok peak output price bites.

### 60. Independent per-test cost on the Vals AI suite (avg across all Vals benchmarks, useful as a token-volume proxy)

- value: Claude Opus 5 $18.81; GPT-6 Astra $19.09; Claude Sonnet 5 $17.61 (at $3/$15); GPT-5.6 Sol $13.79; GLM-5.3 $6.73; Qwen3.8 Max $4.00; DeepSeek V4 Pro 0813 $3.38; DeepSeek V4 Flash 0731 $0.87
- confidence: quoted
- source: https://www.vals.ai/models/anthropic_claude-opus-5 (2026-07-23)
- note: Per-model pages under https://www.vals.ai/models/. GLM-5.3 costs 1/2.8 of Opus 5 per Vals test versus 1/4.65 on list price - same token-volume penalty AA measures. Vals Index accuracy: Opus 5 67.2%, GPT-6 Astra 66.6%, Sonnet 5 59.6%, GLM-5.3 57.0%, DeepSeek V4 Flash 53.6%, V4 Pro 0813 52.4%.

### 61. Faros/Fireworks real-task study (open vs closed) exists but results were not retrievable

- value: 211 real engineering tasks from Faros' own repos run through seven model+harness setups; conclusion text: closed models 'still lead on the most complex, multi-step agentic work'
- confidence: quoted
- source: https://www.faros.ai/blog/open-weight-models (2026-07)
- note: Per-setup acceptance rates and cost were behind a link not fetched. The page's own summary table repeats vendor numbers (GLM-5.2 SWE-bench Pro 62.1 / TB2.1 81.0; V4 Pro 55.4 / 80.6 / 64.0; M3 59.0 / 80.5 / 66.0; K2.6 58.6 / 80.2 / 66.7; Qwen3-Coder 80B 44.3 / 70.6 / 36.2).

### 62. GLM-5.2 (predecessor, MIT, same base weights as GLM-5.3) vendor table used by most 'open vs closed' comparisons

- value: SWE-bench Pro 62.1 (GPT-5.5 58.6); Terminal-Bench 2.1 81.0 (GPT-5.5 84.0, Opus 4.8 85.0); FrontierSWE 74.4 (Opus 4.8 75.1); MCP-Atlas 77.0 (Opus 4.8 77.8); SWE-Marathon 13.0; released 2026-06-16, $1.40/$4.40; 'one-sixth' of GPT-5.5's $35 combined per-MTok price
- confidence: quoted
- source: https://venturebeat.com/technology/z-ais-open-weights-glm-5-2-beats-gpt-5-5-on-multiple-long-horizon-coding-benchmarks-for-1-6th-the-cost (2026-06-16)
- note: GLM-5.3 improved TB2.1 to 88.2 and TB3.0 by +4.6 to 28.3 via post-training on the same 753B base; GLM-5.2 remains the MIT-licensed option for organisations that will not accept the GLM-5.3 licence.

### 63. Reproduction gap warning: vendor Terminal-Bench 2.1 vs independent for the same open model

- value: DeepSeek V4 Pro 0813: vendor 87.9 vs independent 78.7 (unspecified harness) vs Vals 54.7 (bash-only style harness) - 9 to 33 points
- confidence: quoted
- source: https://www.orcarouter.ai/blog/deepseek-v4-pro-benchmark (2026-08-16)
- note: orcarouter also lists AA Intelligence Index 53 (v4.1 scale) and 'Coding 68.8' for V4 Pro. Independently, NIST CAISI judged the April V4 preview 'similar to GPT-5 released 8 months prior' (via contextstudios).

## Not found

- Scale AI's standardised-scaffold SWE-bench Pro public leaderboard (labs.scale.com returned 403; morphllm mirror rate-limited) - no single-scaffold SWE-bench Pro comparison of GLM-5.3 / Kimi K3 / DeepSeek V4 Pro 0813 / Qwen3.8 vs Opus 5 / Fable 5.1 / GPT-6 Astra
- BFCL v4 leaderboard scores for any 2026-generation model (gorilla.cs.berkeley.edu leaderboard is JS-rendered)
- Anthropic-published SWE-bench Verified for Claude Fable 5.1 and Claude Sonnet 5 (Anthropic did not publish either)
- Any first-party coding benchmark (SWE-bench, Terminal-Bench) for GPT-6 Astra - OpenAI announcement pages returned 403; only OpenAI pricing ($10/$50), Vals rank #1/63 on TB2.1 and AA index 53 were obtained
- DeepSeek's own pricing page (403 / SPA) - official cache-hit prices for V4 Pro/Flash are known only via Fireworks' listing and secondary trackers
- Vendor SWE-bench Verified scores for GLM-5.3, Kimi K3 and Qwen3.8-Max (model cards no longer report it)
- Independent same-harness Terminal-Bench 2.1 scores for GLM-5.3, Kimi K3 and Qwen3.8-Max (Vals pages rendered ranks but 0.0% placeholders; AA page truncated)
- Per-setup results (acceptance rate, cost) of the Faros x Fireworks 211-task open-vs-closed study
- OpenRouter token-share by model for the Programming category (rankings page did not render data)
- Groq or Cerebras hosting and pricing for GLM-5.3, Kimi K3, Qwen3.8 or DeepSeek V4
- A verified first-party Meta Llama 2026 release (llama.com redirects; only third-party mention of 'Muse Glimmer 30B')
- Aider polyglot results for any 2026 flagship (board frozen at Oct 2025 entries)
- LiveCodeBench live leaderboard snapshot (page did not load)
- A directly measured 'attempts multiplier' (retries per accepted change) for open vs flagship in a real agent loop - only derivable from SWE-rebench pass@1/pass@5
- Kimi K3, GLM-5.3 and Qwen3.8-Max rows on SWE-rebench (window ended 2026-07-01, before their releases) - no same-scaffold cost-per-solved-task for the current open flagships
- tau2-bench official-leaderboard rows for Kimi K3, GLM-5.3 or DeepSeek V4 Pro
- Active-parameter count for the DeepSeek V4 Pro 0813 build if it differs from the April 1.6T/49B card (0813 card extraction said '1.7T')
- Official MiniMax pricing page content (only third-party transcription and OpenRouter's MiniMax route confirm $0.30/$1.20/$0.06)
