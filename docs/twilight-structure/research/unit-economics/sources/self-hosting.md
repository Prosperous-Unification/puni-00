# Self-hosting vs renting per-token for open-weight coding models (DeepSeek-class, GLM-class, Kimi-class, Qwen3-class, gpt-oss-120b), as of 2026-09

## Summary

At a solo-factory workload of 200M-1B tokens/month (90% cache reads), self-hosting a large MoE coding model (DeepSeek/Kimi/GLM-class, 600B-1.6T total params) on a dedicated 8-GPU H100/H200 node is not economical versus renting per token — the node's raw capacity (tens of billions of tokens/month at published decode throughput) is 50-200x larger than the target workload, so realistic utilization is under 3%, pushing effective self-hosted $/MTok into the tens of dollars. Break-even against the cheapest comparable hosted price (~$3.96-4.40/MTok out) lands around 5-6 billion output tokens/month for an 8xH200 DeepSeek-class deployment at ~$3.6-4/GPU-hr — i.e., a shop running 5-30x today's stated volume, not a solo operator. GPU rental prices fell/flattened through 2025-2026 (H100 now $1.7-6/hr depending on marketplace vs premium cloud; H200 $3.6-6.3/hr; B200 $6-8.6/hr), and published vLLM/SGLang throughput improved sharply on newer hardware (DeepSeek: 2.2k output tok/s/H200 in production wide-EP serving, Dec 2025, up from ~1.5k tok/s/GPU; ~10.1k tok/s/GPU decode on GB200 with NVFP4, Feb 2026 — a 3-5x jump). Below the break-even volume, or for smaller ~30B-A3B models where 1-2 GPU footprints are plausible on paper (weights fit in ~30GB FP8), self-hosting can only compete if utilization is pushed toward 50-80% via multi-tenant sharing, spot pricing, or a much smaller model — but I could not find a published vLLM/SGLang throughput number for a 30B-A3B model this session to complete that comparison, and quality data (Qwen3.6-35B-A3B: 24.7% SWE-rebench resolved rate, pass@5 43.2%, as of 2026-07-01) suggests small-model agentic coding quality still trails the frontier hosted models this cost model targets. Prefix-cache economics favor self-hosting more than a naive $/MTok-out comparison shows: cache-hit compute is near-free relative to decode, so a node sized for output+prefill peak serves a 90%-cache-read workload's remaining volume at near-zero marginal GPU cost — the binding constraint is KV-cache HBM headroom at 100k+ contexts, not compute, and I found no fresh, sourced number this session for MLA's specific KV-cache-per-token reduction to quantify that headroom.

## Facts

### 1. Lambda Cloud on-demand H100 80GB SXM price (8x instance)

- value: $3.99/GPU-hr (1x instance: $4.29/GPU-hr)
- confidence: quoted
- source: https://lambda.ai/service/gpu-cloud (2026-09-08 (fetched))
- note: No H200 price listed on this page; no reserved/committed pricing listed.

### 2. Lambda Cloud on-demand B200 SXM6 180GB price (8x instance)

- value: $6.69/GPU-hr (1x instance: $6.99/GPU-hr)
- confidence: quoted
- source: https://lambda.ai/service/gpu-cloud (2026-09-08 (fetched))
- note:

### 3. RunPod on-demand H100 SXM price

- value: Community Cloud $2.69/hr; Secure Cloud $3.49/hr
- confidence: quoted
- source: https://www.runpod.io/pricing (2026-09-08 (fetched))
- note: Per-second billing available.

### 4. RunPod on-demand H200 141GB price

- value: Community Cloud $3.59/hr; Secure Cloud $4.59/hr
- confidence: quoted
- source: https://www.runpod.io/pricing (2026-09-08 (fetched))
- note:

### 5. RunPod on-demand B200 180GB price

- value: Community Cloud $5.98/hr; Secure Cloud $6.79/hr
- confidence: quoted
- source: https://www.runpod.io/pricing (2026-09-08 (fetched))
- note:

### 6. RunPod MI300X pricing

- value: Not listed / not offered on RunPod's current pricing page
- confidence: quoted
- source: https://www.runpod.io/gpu-instance/pricing (2026-09-08 (fetched))
- note:

### 7. Nebius AI Cloud on-demand H100 price

- value: $3.85/GPU-hr
- confidence: quoted
- source: https://nebius.com/prices (2026-09-08 (fetched))
- note: Preemptible ~44-55% cheaper; multi-month reservation up to 35% off on-demand.

### 8. Nebius AI Cloud on-demand H200 price

- value: $4.50/GPU-hr
- confidence: quoted
- source: https://nebius.com/prices (2026-09-08 (fetched))
- note:

### 9. Nebius AI Cloud on-demand B200 price

- value: $7.15/GPU-hr
- confidence: quoted
- source: https://nebius.com/prices (2026-09-08 (fetched))
- note:

### 10. CoreWeave on-demand HGX H100 8-GPU node price

- value: $49.24/hr total = $6.155/GPU-hr
- confidence: derived
- source: https://www.coreweave.com/pricing (2026-09-08 (fetched))
- note: $49.24 / 8 GPUs = $6.155/GPU-hr; spot price for same node $19.71/hr = $2.46/GPU-hr.

### 11. CoreWeave on-demand HGX H200 8-GPU node price

- value: $50.44/hr total = $6.305/GPU-hr
- confidence: derived
- source: https://www.coreweave.com/pricing (2026-09-08 (fetched))
- note: $50.44/8; spot $20.93/hr = $2.62/GPU-hr.

### 12. CoreWeave on-demand HGX B200 8-GPU node price

- value: $68.80/hr total = $8.60/GPU-hr
- confidence: derived
- source: https://www.coreweave.com/pricing (2026-09-08 (fetched))
- note: $68.80/8; spot $34.11/hr = $4.26/GPU-hr. CoreWeave states 'up to 60% discount' for committed/reserved capacity, no published rate.

### 13. Hyperstack on-demand H100 80GB SXM price

- value: $3.20/GPU-hr
- confidence: quoted
- source: https://www.hyperstack.cloud/gpu-pricing (2026-09-08 (fetched))
- note:

### 14. Hyperstack on-demand H200 141GB SXM price

- value: $3.99/GPU-hr
- confidence: quoted
- source: https://www.hyperstack.cloud/gpu-pricing (2026-09-08 (fetched))
- note:

### 15. Hyperstack on-demand / reserved B200 192GB price

- value: $6.00/GPU-hr on-demand; reserved from $5.10/GPU-hr
- confidence: quoted
- source: https://www.hyperstack.cloud/gpu-pricing (2026-09-08 (fetched))
- note:

### 16. Verda (formerly DataCrunch) on-demand H100 SXM5 80GB price

- value: $3.25/hr on-demand, $1.63/hr spot
- confidence: quoted
- source: https://verda.com/pricing (2026-09-08 (fetched))
- note: Reserved discounts: 1mo -2%, 1yr -8%, 2yr -25%.

### 17. Verda on-demand H200 SXM5 141GB price

- value: $4.00/hr on-demand, $2.00/hr spot
- confidence: quoted
- source: https://verda.com/pricing (2026-09-08 (fetched))
- note:

### 18. Verda on-demand B200 SXM6 180GB price

- value: $6.11/hr on-demand, $3.06/hr spot (B300: $7.50/hr on-demand)
- confidence: quoted
- source: https://verda.com/pricing (2026-09-08 (fetched))
- note: MI300X not listed by Verda.

### 19. Vast.ai marketplace H100 80GB low-end price (via aggregator)

- value: ~$1.55-1.99/hr across low-cost brokers (Vast.ai listed ~$1.74/hr)
- confidence: quoted
- source: https://getdeploying.com/reference/cloud-gpu (2026-09-08 (fetched))
- note: Marketplace/spot-style pricing set by supply and demand; Vast.ai's own pricing page would not render pricing data for WebFetch (JS-rendered).

### 20. Crusoe Cloud on-demand H100/H200/MI300X prices

- value: H100 $3.90/GPU-hr; H200 $4.29/GPU-hr; MI300X $3.45/GPU-hr; B200/GB200 'contact sales'
- confidence: quoted
- source: https://crusoe.ai/cloud/pricing/ (2026-09-08 (fetched))
- note:

### 21. Hot Aisle MI300X price

- value: $2.99/GPU-hr (per aggregator)
- confidence: quoted
- source: https://getdeploying.com/reference/cloud-gpu (2026-09-08 (fetched))
- note: Hot Aisle's own site did not surface a rate table via WebFetch.

### 22. TensorWave MI300X price

- value: ~$1.71/GPU-hr custom/committed (per aggregator, not independently confirmed on TensorWave's own site)
- confidence: estimated
- source: https://getdeploying.com/reference/cloud-gpu (2026-09-08 (fetched))
- note: TensorWave's own pricing page returned a 404 for this session; treat as low-confidence.

### 23. GPU rental price trend since 2025

- value: On-demand H100 has compressed toward $2-4/GPU-hr on most non-hyperscaler clouds (from a common ~$8/hr in 2023-2024 that this session did not re-verify), while H200/B200 sit at a roughly proportional premium ($3.6-7.2/hr and $6-8.6/hr respectively); large integrated clouds (CoreWeave) price 40-70% above independent/neocloud providers (Lambda, RunPod, Nebius, Hyperstack, Verda) for the same on-demand SKU, and spot/marketplace pricing (Vast.ai, CoreWeave spot, Verda spot) runs 40-60% below on-demand.
- confidence: derived
- source: https://www.coreweave.com/pricing; https://www.hyperstack.cloud/gpu-pricing; https://verda.com/pricing; https://getdeploying.com/reference/cloud-gpu (2026-09-08 (fetched))
- note: Cross-provider comparison of the on-demand figures gathered above; the 2023-2024 ~$8/hr H100 baseline is from prior general knowledge, not re-verified this session, so treat the 'compression' framing as directional only.

### 24. DeepSeek (V3/R1-class, 671B total/37B active) sustained production decode throughput on H200 with wide expert-parallelism (vLLM)

- value: 2.2k output tokens/s per H200 GPU, sustained, in production-like multi-node deployment
- confidence: quoted
- source: https://vllm.ai/blog/2025-12-17-large-scale-serving (2025-12-17)
- note: Up from ~1.5k tok/s/GPU in earlier benchmarks per the same post, attributed to kernel improvements and Dual Batch Overlap for decode. Quantization and exact context length not specified in fetched content.

### 25. DeepSeek-style MoE (R1/V3/V3.1) decode throughput on GB200 with NVFP4 quantization and wide EP+DP

- value: 10.1K decode tokens/GPU/s (TPGS) on an 8-GPU GB200 decode instance; prefill 26.2K tokens/GPU/s across 4x 2-GPU prefill instances
- confidence: quoted
- source: https://vllm.ai/blog/2026-02-03-dsr1-gb200-part1 (2026-02-03)
- note: Workload: 2K input / 2K output tokens. Quantization: NVFP4 for MoE expert weights + output projection, FP8 for MLA query projections. Reported as '3-5x improvement over H200' for the same workload.

### 26. Qwen3-class large MoE (Qwen3.5-397B-A17B, NVFP4) aggregate decode throughput on GB200

- value: 25,000 total output tokens/s per GPU (peak, aggregate across a DEP8 decode + DEP2 prefill topology, 16 GPUs total)
- confidence: quoted
- source: https://vllm.ai/blog/2026-08-06-qwen35-25k-tps (2026-08-06)
- note: ISL/OSL 8192/1024, concurrency 64-5120. This is a different (larger, newer) Qwen3-series checkpoint than Qwen3-235B-A22B named in the brief — no dedicated Qwen3-235B-A22B vLLM/SGLang throughput post was found this session (see not_found). Post notes per-user Gen-TPS was not optimized for in this config (DEP favors aggregate throughput over per-user latency).

### 27. gpt-oss-120b throughput on NVIDIA Blackwell (B200) vs Hopper

- value: Up to 4.3x more throughput at 1k/1k input/output sequence length vs Hopper (H100/H200); no absolute tokens/s figure given
- confidence: quoted
- source: https://vllm.ai/blog/2025-10-09-blackwell-inferencemax (2025-10-09)
- note: Relative (multiplier) figure only; SemiAnalysis InferenceMAX dashboard (inferencemax.ai) was cited as the source of absolute numbers but was not itself fetched successfully this session.

### 28. gpt-oss-120b further Blackwell optimization gains (vLLM, Feb 2026)

- value: +38% max throughput, +13% min latency improvement across the Pareto curve vs the Aug 2025 gpt-oss launch baseline on Blackwell
- confidence: quoted
- source: https://vllm.ai/blog/2026-02-01-gpt-oss-optimizations (2026-02-01)
- note: Percentage deltas only, no absolute tok/s; MXFP4 quantization, 8K context mentioned in an image filename only.

### 29. gpt-oss-120b output throughput, median across hosted API providers

- value: 220.7 tokens/s median output throughput (vs 92.7 t/s median for similarly-sized open models)
- confidence: quoted
- source: https://artificialanalysis.ai/models/gpt-oss-120b (2026-09-08 (fetched))
- note: This is a hosted-API benchmark (per-user speed across providers), not a raw vLLM/SGLang self-hosted per-GPU throughput figure — included as the closest available proxy since no self-hosted number was found.

### 30. MI300X measured throughput (vLLM best-practices post) is reported in requests/s, not tokens/s, for Llama 3.1 models

- value: Llama-3.1-405B: 5.76 requests/s at 1000 QPS offered load on ShareGPT dataset, optimized vLLM config, 8x MI300X (most experiments used 4-GPU TP), BF16
- confidence: quoted
- source: https://vllm.ai/blog/2024-10-23-vllm-serving-amd (2024-10-23)
- note: Not one of the six target model classes (Llama, not DeepSeek/Qwen3/Kimi/GLM/gpt-oss) and not converted to tokens/s in the source; included only as the best available MI300X vLLM data point found this session.

### 31. SGLang large-scale expert-parallelism DeepSeek decode throughput (H100, real-world early large-scale-EP deployment)

- value: 22,282 output tokens/s per 8xH100 node (~2,785 tok/s/GPU); 52.3k input tok/s per node prefill
- confidence: quoted
- source: https://lmsys.org/blog/2025-05-05-large-scale-ep/ (2025-05-05)
- note: 96 H100 GPUs total (12 nodes x 8), tested at 2000-token input (prefill up to 57,674 tok/s per node at 4 nodes for 1K prompts). Predates the Dec-2025 2.2k tok/s/GPU vLLM figure above; quantization not specified in fetched content (DeepSeek natively ships FP8).

### 32. Qwen3.6-35B-A3B score on SWE-rebench

- value: 24.7% resolved rate, 43.2% pass@5, ranked #16 overall
- confidence: quoted
- source: https://swe-rebench.com/ (leaderboard updated 2026-07-01 (model added))
- note: Matches the figure given in the task brief exactly; confirms it against the live leaderboard rather than assuming it.

### 33. vLLM automatic prefix caching (APC) mechanism and limits

- value: APC caches KV of prior queries and reuses it for new queries sharing a prefix; it only speeds up the prefill phase, not decode/generation; benefits are largest for long shared documents and multi-turn chat/agent histories with repeated prefixes; minimal benefit when answers are long relative to the shared prefix or prefixes don't overlap
- confidence: quoted
- source: https://docs.vllm.ai/en/latest/features/automatic_prefix_caching.html (2026-09-08 (fetched))
- note: The fetched page did not contain hit-rate figures or KV-memory-at-100k-context numbers — those are marked not_found below.

### 34. GLM-5.3 hosted API pricing (verified directly from vendor)

- value: $1.40/MTok input, $0.26/MTok cached input, $4.40/MTok output
- confidence: quoted
- source: https://docs.z.ai/guides/overview/pricing (2026-09-08 (fetched))
- note: Matches the task brief exactly; 'Cached Input Storage' listed as limited-time free.

### 35. DeepSeek V4 Pro hosted API pricing, peak and off-peak (verified directly from vendor)

- value: Peak: $1.32 input (cache miss) / $0.044 cache hit / $3.96 output per MTok. Off-peak (all figures exactly half): $0.66 / $0.022 / $1.98. Peak hours = 01:00-04:00 and 06:00-10:00 UTC, Mon-Fri; all other times off-peak.
- confidence: quoted
- source: https://api-docs.deepseek.com/quick_start/pricing/ (2026-09-08 (fetched))
- note: Matches the task brief exactly, and clarifies 'half off-peak' applies uniformly to all three price tiers, not just output.

### 36. Kimi K2.6 hosted API pricing (verified directly from vendor)

- value: $0.95/MTok input (cache miss), $0.16/MTok cache hit, $4.00/MTok output
- confidence: quoted
- source: https://platform.kimi.ai/docs/pricing/chat-k26.md (2026-09-08 (fetched))
- note: Matches the task brief exactly. Model has a 256k context window.

### 37. Fireworks AI on-demand dedicated deployment pricing (per-GPU-hour, not per-token)

- value: H100 80GB $7.00/hr (rising to $8.00/hr from Sep 1); H200 141GB $7.00/hr→$8.00/hr; B200 180GB $10.00/hr→$13.00/hr; B300 288GB $12.00/hr→$15.00/hr; GB300 $18.00/hr→$20.00/hr
- confidence: quoted
- source: https://fireworks.ai/pricing (2026-09-08 (fetched))
- note: Billed per GPU-second, no start-up surcharge; +50% premium for regional restriction. Roughly 1.5-2x the raw neocloud on-demand rate for the same chip — the premium buys managed serving (autoscaling, model-serving stack, SLAs), not raw compute.

### 38. Together AI on-demand dedicated GPU endpoint pricing

- value: HGX H100 $3.99/GPU-hr; HGX B200 $8.99/GPU-hr; H200/B300/GB200/GB300 'contact for pricing'
- confidence: quoted
- source: https://www.together.ai/pricing (2026-09-08 (fetched))
- note: Single-tenant, guaranteed performance, autoscaling. Notably close to raw neocloud on-demand H100 pricing (vs Fireworks' ~2x premium).

### 39. Apple Mac Studio (current lineup, M5 generation) maximum configuration

- value: M5 Ultra chip, up to 512GB unified memory (36-core CPU / 80-core GPU config per spec sheet); pre-orders for the initial M5 Max/M5 Ultra SKUs open 2026-09-22
- confidence: quoted
- source: https://www.apple.com/mac-studio/specs/; https://www.apple.com/shop/buy-mac/mac-studio/m5-ultra (2026-09-08 (fetched))
- note: Exact USD price for the 512GB configuration was not present on the pages fetched (only a 96GB/1TB SKU was itemized without a price); see not_found.

## Not found

- Published vLLM/SGLang throughput benchmark (tokens/s aggregate or per-GPU, per-user at concurrency 32-128) specifically for Qwen3-235B-A22B on 8xH100/H200/B200 — only a larger, newer Qwen3.5-397B-A17B figure was found.
- Published vLLM/SGLang throughput benchmark for Kimi K2 (the actual ~1T/32B-active model) — vLLM's Kimi K2 blog post covered tool-calling accuracy debugging only, with no tokens/s figures; no Moonshot/SGLang throughput post was located.
- Published vLLM/SGLang throughput benchmark for GLM-4.5 or GLM-5.x on 8xH100/H200/B200 — vLLM's GLM-4.5 launch post and the GLM-4.5 GitHub README both describe deployment requirements qualitatively but include no tokens/s numbers in the content retrieved.
- Published vLLM/SGLang throughput benchmark for a ~30B-A3B small MoE model (e.g. Qwen3-30B-A3B) on 1-2 GPUs — needed to complete the section-5 viability comparison; not located this session.
- Absolute (non-relative) tokens/s figure for gpt-oss-120b on B200 from a vLLM/SGLang source — only percentage/multiplier improvements were found; the SemiAnalysis InferenceMAX dashboard (inferencemax.ai) that vLLM cites as the primary source was not successfully fetched.
- MI300X or MI355X throughput for any of the six named large-MoE model classes on vLLM or SGLang — only a Llama-3.1 request/s figure for MI300X was found, and no MI355X model-serving throughput at all.
- Per-user tokens/s at controlled concurrency levels (32/64/128) for any of the six model classes — every throughput figure located was an aggregate/per-GPU or median-across-providers number, not a per-user figure at a stated concurrency.
- Multi-head Latent Attention (MLA) KV-cache-per-token size or its reduction factor vs standard GQA/MHA, sourced from a document fetched this session (DeepSeek-V3's own README does not state it; the linked arXiv paper was not fetched).
- KV-cache memory footprint or vLLM/SGLang prefix-cache hit-rate figures specifically at 100k+ token context lengths for agentic coding workloads.
- Cold-start / model-load time for a large MoE model (600B-1.6T class) under vLLM or SGLang — the only cold-start numbers found (vLLM Sleep Mode blog) were for a 0.6B and a Phi-3-vision model, not representative of the target model sizes.
- H200 and MI300X/MI355X on-demand pricing from Lambda Cloud (not listed on its pricing page).
- A rate-table price for MI300X from Hot Aisle's or TensorWave's own site (only aggregator-reported figures were obtainable; TensorWave's pricing page 404'd).
- Vast.ai's own real-time marketplace price table for H100/H200/B200 (the page is JS-rendered and returned no price data to WebFetch; only a third-party aggregator's snapshot was used).
- CoreWeave's actual reserved/committed hourly rate (only the qualitative 'up to 60% off on-demand' claim was found, no rate table).
- Exact USD price for Apple's Mac Studio M5 Ultra at its maximum 512GB memory configuration.
- A 2025-baseline on-demand H100 price from a source fetched this session, needed to quantitatively state the 2025→2026 GPU price trend (the qualitative direction is described in the derived note above but not backed by a same-session historical price point).
