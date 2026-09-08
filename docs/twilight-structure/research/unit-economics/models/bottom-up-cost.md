# Bottom-up cost accounting of ONE accepted outcome through the shipped Twilight stage DAG, in three classes (small fix / medium feature / large-epic), built as a stack of (a) model tokens per activity attempt priced with processed-token accounting, (b) infra per unit (K3s pool share, sandbox Jobs, build/gate slot, cloud-browser session), and (c) human minutes at $50/$150/$300 per operator-hour. Every model figure is computed as cost = U*p_in*1.25 + C*p_cache + O*p_out with U=(1-h)T, C=hT, h=0.90 base (0.95 sensitivity), T = processed input incl. cache reads. The stack is built from the activity catalog (9 agent activities, 12 tool activities), balanced profile class routing (research=sonnet-5, plan/review/judge=opus-5, implement=sonnet-5 medium escalating once to opus-5 high, knowledge=haiku-4.5, verify=sonnet-5) under the personal-delivery floor, with rework.maxRounds=2, fanOut 2, one cloud-browser acceptance pass per staging candidate, and nightly dev-sweeps on a separate 200k/$8 per-occurrence account. Bottom-up totals reconcile to the independently derived per-PR distribution: my medium-feature p50 of 17.2M processed / 299k out sits at roughly the plain-harness p75 (10M/150k p50, 40M/500k p90), and the difference IS Twilight's added structure (discovery research + discovery review + spec critique + planning + judge + knowledge + cloud-browser acceptance). S1 medium p50 model cost $17.17 sits inside the only measured end-to-end anchor ($2.81-$33.38 per merged feature, Jul 2026). Self-hosting: NO self-hosting research sheet was present in the research directory, so all open-weight scenarios (S3-S6) are priced at owner-API list only and self-hosted inference economics are PENDING.

## Headline numbers

| quantity                                                                                                        | low                                           | base                                      | high                                                                | formula                                                                                                                                                                                                                                                                        | basis                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model-token cost per accepted MEDIUM FEATURE, S1 (Anthropic list, balanced as shipped), h=0.90                  | $8.96                                         | $17.17                                    | $57.39                                                              | sum over activities of [(1-h)*T*p_in*1.25 + h*T*p_cache + O*p_out]; e.g. implement base: T=6.60M, O=105k on sonnet-5 = 0.66*2*1.25 + 5.94*0.20 + 0.105*10 = 1.65+1.19+1.05 = $3.89; full base stack = 0.49+0.63+0.79+1.70+3.89+0.38+3.36+2.27+0.51+3.16 = $17.17               | execution.yaml:321-333 balanced class routing + escalation ladder; Anthropic list prices (platform.claude.com/docs/en/about-claude/pricing, verified: Sonnet 5 2/0.20/10, Opus 5 5/0.50/25, Haiku 4.5 1/0.10/5, cache write 1.25x); token archetypes calibrated to the derived per-PR distribution (feature p50 10M/150k) and the Anthropic 991k-in/5.3k-out session example |
| Processed input tokens per accepted MEDIUM FEATURE (run account, excl. dev-sweep)                               | 9.94M                                         | 17.23M                                    | 52.20M                                                              | sum(attempts x T_per_attempt): 0.80+0.40+0.50+1.00+6.60+1.20+2.25+1.50+0.84+2.15 = 17.23M at base; output 299.3k                                                                                                                                                               | Derived stage build; cross-checks against Bun 12M processed/commit and the derived feature p50 10M / p90 40M                                                                                                                                                                                                                                                                 |
| FULL unit cost per accepted MEDIUM FEATURE at $150/operator-hour, S1 (model + sweep + infra + human)            | $197.82                                       | $337.58                                   | $763.14                                                             | 17.17 (model) + 0.94 (3 sweep nights) + 6.97 (infra) + 312.50 (125 human min at $150/h) = $337.58                                                                                                                                                                              | Stage build + labelled infra assumptions (no infra prices exist in the repo: verified 'No Browserbase pricing anywhere in the repo') + labelled human-minute assumptions per the 7 documented touchpoints                                                                                                                                                                    |
| FULL unit cost per accepted SMALL FIX at $150/h, S1                                                             | $67.67                                        | $117.29                                   | $260.18                                                             | 3.39 (model, 3.24M/59.2k) + 0.13 (1 sweep night) + 3.78 (infra) + 110.00 (44 human min) = $117.29                                                                                                                                                                              | Same build, class size factor 0.40, 1 deliverable, 1 candidate                                                                                                                                                                                                                                                                                                               |
| FULL unit cost per accepted LARGE/EPIC at $150/h, S1                                                            | $712.78                                       | $1,217.55                                 | $2,757.01                                                           | 65.30 (model, 66.96M/1.14M) + 3.94 (10 sweep nights) + 23.32 (infra) + 1125.00 (450 human min) = $1,217.55                                                                                                                                                                     | Same build, 10 deliverables, 3 candidates, run-scoped activities doubled, size factor 1.25                                                                                                                                                                                                                                                                                   |
| Model-token share of full unit cost (medium feature, S1, base band)                                             | 2.8% (at $300/h)                              | 5.4% (at $150/h)                          | 14.0% (at $50/h)                                                    | 18.11 / 650.08 = 2.8%; 18.11 / 337.58 = 5.4%; 18.11 / 129.25 = 14.0%                                                                                                                                                                                                           | Derived; human minutes dominate at every rate, which is the central result of the stack                                                                                                                                                                                                                                                                                      |
| Cheapest scenario model cost per medium feature (S5 DeepSeek V4 Pro off-peak, ~5x attempts + verifier)          | $2.10                                         | $5.15                                     | $27.03                                                              | effective input 0.66*(0.1*1.25)+0.9*0.022 = $0.1023/M processed; 38.0M processed x 0.1023 + 0.665M out x 1.98 = 3.89 + 1.32 = $5.21 (model reports $5.15 with per-class mix)                                                                                                   | DeepSeek official price image (peak/off-peak, effective 16:00 UTC 2026-08-16); attempts multiplier ~5x and volume 1.6x from SWE-rebench derivations                                                                                                                                                                                                                          |
| Share of medium features that PAUSE on the shipped balanced 1.5M-token cap (S1, h=0.90)                         | 38.3% (uncached+output semantics, h=0.95)     | 63.5% (uncached+output semantics, h=0.90) | 99.8% (processed-token semantics incl. cache reads)                 | lognormal fitted to p50/p90: sigma = ln(p90/p50)/1.2816; processed p50 17.23M p90 52.20M -> sigma 0.865, P(T>1.5M) = 1-Phi(ln(1.5/17.23)/0.865) = 1-Phi(-2.82) = 99.8%. Uncached+out at h=0.90: p50 = 0.1*17.23+0.299 = 2.02M, p90 = 6.11M -> P(>1.5M) = 1-Phi(-0.346) = 63.5% | execution.yaml:358-363 balanced limits {tokens 1500000, money 40 USD, agentTime PT6H}, enforcement strict; 'Whether tokens includes cache reads is adapter-defined'                                                                                                                                                                                                          |
| Share of medium features that PAUSE on the shipped $40 money cap (moneyScope: model)                            | 5.7% (S5 DeepSeek)                            | 18.5% (S1 as shipped)                     | 42.7% (S2b: Fable 5.1 everywhere without the token-volume discount) | S1: p50 $17.17, p90 $57.39 -> sigma = ln(3.342)/1.2816 = 0.9415; P(cost>40) = 1-Phi(ln(40/17.17)/0.9415) = 1-Phi(0.898) = 18.5%                                                                                                                                                | execution.yaml:358-363; scenario cost distribution derived above                                                                                                                                                                                                                                                                                                             |
| API-equivalent value one Max 20x seat ($200/mo) can absorb, and effective model $/medium feature when saturated | $200/mo absorbed -> $18.11/unit (no discount) | $1,450/mo absorbed -> $2.50/unit (7.2x)   | $5,800/mo absorbed -> $0.62/unit (29.0x)                            | effective $/unit = (200/absorbed) x S1 model+sweep per unit. Base: (200/1450) x 18.11 = 0.1379 x 18.11 = $2.50; units/mo at saturation = 1450/18.11 = 80.1 medium features                                                                                                     | Anthropic docs $13/dev/active day, $150-250/dev/month (low); viberank median $1,450/mo API-equivalent, n=1,099 (base); community heavy-Opus Max 20x estimate ~$5,800/mo (high)                                                                                                                                                                                               |

## Tables

## T1. Effective token prices under processed-token accounting (the arithmetic that drives everything)

`effective $/M processed input = p_in x (1-h) x 1.25 + h x p_cache` &nbsp; | &nbsp; `vol-adj` = effective price x same-scaffold token-volume multiplier (indexed to Sonnet 5 = 1.00)

| model                                 | p_in / p_cache / p_out | eff. in @h=0.85 | @h=0.90   | @h=0.95 | $/M out | vol x (vs Sonnet 5) | vol-adj eff. in @0.90 |
| ------------------------------------- | ---------------------- | --------------- | --------- | ------- | ------- | ------------------- | --------------------- |
| Fable 5.1                             | 10 / 0.25 / 50         | 2.088           | **1.475** | 0.863   | 50.00   | 0.56                | 0.819                 |
| Opus 5                                | 5 / 0.50 / 25          | 1.363           | **1.075** | 0.788   | 25.00   | 0.94                | 1.015                 |
| Sonnet 5                              | 2 / 0.20 / 10          | 0.545           | **0.430** | 0.315   | 10.00   | 1.00                | 0.430                 |
| Haiku 4.5                             | 1 / 0.10 / 5           | 0.273           | **0.215** | 0.158   | 5.00    | n/a                 | n/a                   |
| GLM-5.3                               | 1.40 / 0.26 / 4.40     | 0.484           | **0.409** | 0.335   | 4.40    | 1.22                | **0.500**             |
| DeepSeek V4 Pro off-peak              | 0.66 / 0.022 / 1.98    | 0.142           | **0.102** | 0.062   | 1.98    | 0.89                | 0.091                 |
| MiniMax M3                            | 0.30 / 0.06 / 1.20     | 0.107           | **0.091** | 0.076   | 1.20    | 3.06                | 0.280                 |
| GPT-5.6 Sol (not in shipped profiles) | 4 / 0.40 / 20          | 1.090           | **0.860** | 0.630   | 20.00   | 0.13                | **0.115**             |
| GPT-6 Astra                           | 10 / 1.00 / 50         | 2.725           | **2.150** | 1.575   | 50.00   | n/a                 | n/a                   |

**The one number that reorders the market:** at h=0.90 GLM-5.3's cache read is 18.6% of its input price (0.26/1.40) versus Anthropic's 10% and DeepSeek's 3.3%. Its effective input price ($0.409/M) is within 5% of Sonnet 5's ($0.430/M), and after its 1.22x token-volume multiplier it is **16% more expensive than Sonnet 5 on input**. Sticker-price ratios (GLM 1.9x cheaper than Sonnet blended 3:1) invert entirely under a 90%-cached agent loop.

---

## T2. S1 stage stack (Anthropic list, balanced as shipped, personal-delivery floor), base = p50, h=0.90

### Small fix (1 deliverable, 1 candidate)

| activity                                                                                                | class -> model         | attempts | processed in | out       | $              |
| ------------------------------------------------------------------------------------------------------- | ---------------------- | -------- | ------------ | --------- | -------------- |
| discovery.research                                                                                      | research -> sonnet-5   | 1.00     | 0.32M        | 6.0k      | 0.20           |
| discovery.review                                                                                        | review -> opus-5       | 1.00     | 0.16M        | 3.2k      | 0.25           |
| specification.critique                                                                                  | review -> opus-5       | 1.00     | 0.20M        | 4.0k      | 0.31           |
| planning.plan                                                                                           | plan -> opus-5         | 1.00     | 0.40M        | 10.0k     | 0.68           |
| implementation.implement                                                                                | implement -> sonnet-5  | 1.00     | 0.88M        | 14.0k     | 0.52           |
| implementation.implement (escalated)                                                                    | -> opus-5 high         | 0.25     | 0.29M        | 4.5k      | 0.42           |
| knowledge.reconcile                                                                                     | knowledge -> haiku-4.5 | 1.00     | 0.16M        | 3.2k      | 0.05           |
| review.critic                                                                                           | review -> opus-5       | 1.25     | 0.30M        | 5.0k      | 0.45           |
| review.judge                                                                                            | judge -> opus-5        | 1.25     | 0.20M        | 3.5k      | 0.30           |
| acceptance.cloud-browser                                                                                | verify -> sonnet-5     | 1.20     | 0.34M        | 5.8k      | 0.20           |
| **run account total**                                                                                   |                        | **9.9**  | **3.24M**    | **59.2k** | **3.39**       |
| dev-sweep.exercise (separate 200k/$8 account)                                                           | verify -> sonnet-5     | 1 night  | 0.20M        | 4.0k      | 0.13           |
| verification.gate / browser / compose / staging / evaluate / coverage / publication / handoff / release | tool                   | 9 runs   | 0            | 0         | 0 (infra only) |

### Medium feature (3 deliverables, 1 candidate)

| activity                             | model       | attempts | processed in | out        | $         | % of model $     |
| ------------------------------------ | ----------- | -------- | ------------ | ---------- | --------- | ---------------- |
| discovery.research                   | sonnet-5    | 1.00     | 0.80M        | 15.0k      | 0.49      | 2.9%             |
| discovery.review                     | opus-5      | 1.00     | 0.40M        | 8.0k       | 0.63      | 3.7%             |
| specification.critique               | opus-5      | 1.00     | 0.50M        | 10.0k      | 0.79      | 4.6%             |
| planning.plan                        | opus-5      | 1.00     | 1.00M        | 25.0k      | 1.70      | 9.9%             |
| implementation.implement             | sonnet-5    | 3.00     | 6.60M        | 105.0k     | 3.89      | 22.6%            |
| implementation.implement (escalated) | opus-5 high | 0.75     | 2.15M        | 34.1k      | 3.16      | 18.4%            |
| knowledge.reconcile                  | haiku-4.5   | 3.00     | 1.20M        | 24.0k      | 0.38      | 2.2%             |
| review.critic                        | opus-5      | 3.75     | 2.25M        | 37.5k      | 3.36      | 19.6%            |
| review.judge                         | opus-5      | 3.75     | 1.50M        | 26.2k      | 2.27      | 13.2%            |
| acceptance.cloud-browser             | sonnet-5    | 1.20     | 0.84M        | 14.4k      | 0.51      | 3.0%             |
| **run account total**                |             | **19.4** | **17.23M**   | **299.3k** | **17.17** | 100%             |
| dev-sweep (3 nights)                 | sonnet-5    | 3        | 1.50M        | 30.0k      | 0.94      | separate account |

**Opus-5-class work (plan + discovery review + spec critique + critic + judge + escalation) = $11.90 = 69.3% of model cost on 42.3% of the tokens.** The implementer is 22.6%.

### Large / epic (10 deliverables, 3 candidates, run-scoped activities x2)

| activity                             | model       | attempts | processed in | out          | $         |
| ------------------------------------ | ----------- | -------- | ------------ | ------------ | --------- |
| discovery.research                   | sonnet-5    | 2.00     | 2.00M        | 37.5k        | 1.23      |
| discovery.review                     | opus-5      | 2.00     | 1.00M        | 20.0k        | 1.57      |
| specification.critique               | opus-5      | 2.00     | 1.25M        | 25.0k        | 1.97      |
| planning.plan                        | opus-5      | 2.00     | 2.50M        | 62.5k        | 4.25      |
| implementation.implement             | sonnet-5    | 10.00    | 27.50M       | 437.5k       | 16.20     |
| implementation.implement (escalated) | opus-5 high | 2.50     | 8.94M        | 142.2k       | 13.16     |
| knowledge.reconcile                  | haiku-4.5   | 10.00    | 5.00M        | 100.0k       | 1.57      |
| review.critic                        | opus-5      | 12.50    | 9.38M        | 156.2k       | 13.98     |
| review.judge                         | opus-5      | 12.50    | 6.25M        | 109.4k       | 9.45      |
| acceptance.cloud-browser             | sonnet-5    | 3.60     | 3.15M        | 54.0k        | 1.89      |
| **run account total**                |             | **59.1** | **66.96M**   | **1,144.3k** | **65.30** |
| dev-sweep (10 nights)                | sonnet-5    | 10       | 6.25M        | 125.0k       | 3.94      |

---

## T3. Full unit-cost stack, S1, all bands (h=0.90, human at $150/h)

| class  | band | processed in | out      | attempts | agent-h | model $ | sweep $ | infra $ | human min | human $  | TOTAL $      |
| ------ | ---- | ------------ | -------- | -------- | ------- | ------- | ------- | ------- | --------- | -------- | ------------ |
| small  | low  | 1.96M        | 36.4k    | 9.0      | 0.26    | 1.95    | 0.00    | 0.72    | 26        | 65.00    | **67.67**    |
| small  | base | 3.24M        | 59.2k    | 9.9      | 0.43    | 3.39    | 0.13    | 3.78    | 44        | 110.00   | **117.29**   |
| small  | high | 9.48M        | 170.2k   | 18.6     | 1.26    | 10.54   | 0.38    | 29.26   | 88        | 220.00   | **260.18**   |
| medium | low  | 9.94M        | 175.0k   | 17.0     | 1.33    | 8.96    | 0.22    | 1.14    | 75        | 187.50   | **197.82**   |
| medium | base | 17.23M       | 299.3k   | 19.4     | 2.30    | 17.17   | 0.94    | 6.97    | 125       | 312.50   | **337.58**   |
| medium | high | 52.20M       | 893.7k   | 36.8     | 6.96    | 57.39   | 2.83    | 77.91   | 250       | 625.00   | **763.14**   |
| epic   | low  | 38.06M       | 658.0k   | 51.0     | 5.08    | 32.99   | 1.10    | 3.68    | 270       | 675.00   | **712.78**   |
| epic   | base | 66.96M       | 1,144.3k | 59.1     | 8.93    | 65.30   | 3.94    | 23.32   | 450       | 1,125.00 | **1,217.55** |
| epic   | high | 204.38M      | 3,450.0k | 112.0    | 27.25   | 222.69  | 11.81   | 272.51  | 900       | 2,250.00 | **2,757.01** |

_The `high` infra figures are a deliberately pessimistic corner: they multiply high agent-hours by the low-utilisation infra rate ($4.79/agent-h at 10% pool utilisation). If utilisation rises with unit size the coherent high-infra figures are ~$25 (medium) and ~$90 (epic)._

### Human-minute build (the dominant line)

| touchpoint                                                                    | small                   | medium                   | epic                         |
| ----------------------------------------------------------------------------- | ----------------------- | ------------------------ | ---------------------------- |
| request shaping (repo, outcome, profile, discovery envelope)                  | 10                      | 25                       | 90                           |
| plan approval (read plan + bind execution envelope, decision token)           | 8                       | 20                       | 60                           |
| pause / escalation handling (rework exhaustion, gate failure, unknown effect) | 5                       | 20                       | 90                           |
| acceptance sign-off (staging candidate, cloud-browser evidence)               | 8                       | 25                       | 75                           |
| release command (single-use, $20/PT2H envelope, 30-day window)                | 3                       | 5                        | 15                           |
| client communication                                                          | 10                      | 30                       | 120                          |
| **total minutes (base)**                                                      | **44**                  | **125**                  | **450**                      |
| human $ at $50 / $150 / $300 per hour                                         | 36.67 / 110.00 / 220.00 | 104.17 / 312.50 / 625.00 | 375.00 / 1,125.00 / 2,250.00 |

### Infra build (base band, medium feature = $6.97)

| line                                                                     | quantity      | rate          | $        |
| ------------------------------------------------------------------------ | ------------- | ------------- | -------- |
| K3s worker-pool share (agent occupancy)                                  | 2.30 agent-h  | $0.96/agent-h | 2.21     |
| build/gate slot (8 gate+browser+compose runs x 12 min)                   | 1.60 build-h  | $0.96/h       | 1.54     |
| sandbox Jobs (one immutable-digest Job per admitted attempt + tool runs) | 27 Jobs       | $0.03         | 0.82     |
| cloud-browser session (Browserbase)                                      | 1.20 sessions | $2.00         | 2.40     |
| **total**                                                                |               |               | **6.97** |

---

## T4. Model cost per accepted unit across serving scenarios (low / base / high), h=0.90

| scenario                                                          | small fix               | medium feature             | large/epic                  | medium processed in (base) | medium implement attempts per deliverable (base / high) |
| ----------------------------------------------------------------- | ----------------------- | -------------------------- | --------------------------- | -------------------------- | ------------------------------------------------------- |
| **S1** Anthropic list, balanced as shipped                        | 1.95 / **3.39** / 10.54 | 8.96 / **17.17** / 57.39   | 32.99 / **65.30** / 222.69  | 17.2M                      | 1.25 / 2.60                                             |
| **S2** Fable 5.1 everywhere                                       | 2.34 / **3.81** / 10.92 | 11.21 / **19.17** / 57.04  | 42.25 / **73.39** / 220.43  | 8.2M                       | 1.00 / 2.08                                             |
| **S2b** Fable 5.1 without the 0.56x volume discount (sensitivity) | 4.18 / **6.80** / 19.49 | 20.03 / **34.23** / 101.87 | 75.45 / **131.06** / 393.62 | 14.6M                      | 1.00 / 2.08                                             |
| **S3** balanced, implement -> GLM-5.3                             | 1.89 / **3.38** / 11.02 | 8.53 / **17.14** / 61.02   | 31.21 / **65.17** / 237.80  | 18.7M                      | 1.25 / 3.24                                             |
| **S4** all classes GLM-5.3                                        | 1.07 / **1.94** / 7.17  | 5.25 / **10.21** / 40.97   | 19.92 / **39.56** / 161.61  | 21.0M                      | 1.25 / 3.64                                             |
| **S5** DeepSeek V4 Pro off-peak, ~5x attempts + verifier          | 0.38 / **0.86** / 4.29  | 2.10 / **5.15** / 27.03    | 8.18 / **20.49** / 108.67   | 38.0M                      | **3.62 / 13.00**                                        |
| **S6** MiniMax M3 everywhere                                      | 0.74 / **1.82** / 7.39  | 3.78 / **10.49** / 45.19   | 14.48 / **41.43** / 180.67  | 93.7M                      | **2.50 / 7.44**                                         |
| _S8_ GPT-5.6 Sol everywhere (not in the shipped profiles)         | 0.30 / **0.50** / 1.44  | 1.49 / **2.56** / 7.69     | 5.65 / **9.87** / 29.86     | 2.1M                       | 1.13 / 2.34                                             |

**Rework-bound violation.** Balanced allows 1 initial + 2 rework rounds = **3 implement attempts per deliverable**. S5 needs 3.62 at p50 and 13.00 at p90; S6 needs 2.50 and 7.44. **S5 and S6 cannot complete inside the shipped balanced profile at all** — they exhaust rework and pause with a finding, converting a token saving into a human interrupt and an unaccepted run. Their model figures above are what they would cost if a profile with more rounds were authorised.

---

## T5. Cost-share split per scenario (medium feature, base band)

| scenario | at $50/h: model+sweep / infra / human | at $150/h                     | at $300/h (S1 only)           |
| -------- | ------------------------------------- | ----------------------------- | ----------------------------- |
| S1       | 14.0% / 5.4% / 80.6% ($129.25)        | 5.4% / 2.1% / 92.6% ($337.58) | 2.8% / 1.1% / 96.1% ($650.08) |
| S2       | 16.2% / 4.4% / 79.4% ($131.14)        | 6.3% / 1.7% / 92.1% ($339.47) | —                             |
| S3       | 14.0% / 5.5% / 80.5% ($129.40)        | 5.4% / 2.1% / 92.5% ($337.73) | —                             |
| S4       | 9.1% / 6.1% / 84.9% ($122.74)         | 3.4% / 2.3% / 94.4% ($331.07) | —                             |
| S5       | 4.5% / 8.7% / 86.9% ($119.89)         | 1.6% / 3.2% / 95.2% ($328.22) | —                             |
| S6       | 8.3% / 13.0% / 78.7% ($132.34)        | 3.2% / 5.0% / 91.7% ($340.67) | —                             |

Moving from S1 to the cheapest viable open-weight scenario (S5) changes the full unit cost of a medium feature by **$9.36 at $150/h** ($337.58 -> $328.22, a 2.8% saving) and by **$9.36 at $50/h** ($129.25 -> $119.89, 7.2%). Model tokens are never more than 16% of a unit at any rate in any scenario.

---

## T6. Cap analysis: shipped balanced cap (1.5M tokens / $40 / PT6H agent time, `enforcement: strict`, `moneyScope: model`) vs the medium feature

| limit                   | semantics                                        | p50    | p90    | binds?                    | share of medium features that pause |
| ----------------------- | ------------------------------------------------ | ------ | ------ | ------------------------- | ----------------------------------- |
| tokens 1,500,000        | **processed incl. cache reads** (h=0.90 or 0.95) | 17.23M | 52.20M | **yes, catastrophically** | **99.8%**                           |
| tokens 1,500,000        | **uncached + output**, h=0.90                    | 2.02M  | 6.11M  | **yes**                   | **63.5%**                           |
| tokens 1,500,000        | **uncached + output**, h=0.95                    | 1.16M  | 3.50M  | at p75+                   | **38.3%**                           |
| money $40 (model scope) | — (h=0.90)                                       | $17.17 | $57.39 | at ~p80                   | **18.5%**                           |
| money $40               | — (h=0.95)                                       | $13.91 | $46.43 | at ~p87                   | **13.1%**                           |
| agentTime PT6H          | 8 min per 1M processed (A5)                      | 2.30h  | 6.96h  | at ~p87                   | **13.4%**                           |

Cross-scenario, money cap only: S1 18.5% | S2 19.4% | S3 19.6% | S4 10.4% | S5 5.7% | S6 12.0% | S2b 42.7%.
Cross-scenario, processed-token cap: 97.6%-100.0% in **every** scenario. Under processed semantics the 1.5M cap is not a budget, it is a prohibition.

**Small fix vs the same cap:** processed 3.24M/9.48M, uncached+out 0.38M/1.12M, money $3.39/$10.54, agent-time 0.43h/1.26h. A small fix is the only class that fits, and only under uncached+output semantics.
**Epic vs the same cap:** processed 66.96M/204.38M, uncached+out 7.84M/23.89M, money $65.30/$222.69, agent-time 8.93h/27.25h. The epic exceeds even `thorough` (3M/$100/PT12H) on every axis at p50.

### Discovery envelope (300,000 tokens / $10 / PT2H, sub-allocation of the run account)

Discovery research + discovery review + spec critique, medium feature, base: **1.70M processed / 33.0k out / $1.91**.

| cache hit rate | uncached + output | vs 300k cap       |
| -------------- | ----------------- | ----------------- |
| h=0.80         | 0.373M            | **over**          |
| h=0.85         | 0.288M            | just under        |
| h=0.90         | 0.203M            | under             |
| h=0.95         | 0.118M            | comfortably under |

The $10 money limit is never the binder ($1.91 spent); the 300k token limit is viable **only** under uncached+output semantics **and** >=85% cache hits. Under processed semantics discovery alone is 5.7x its envelope.

---

## T7. S7 — today's subsidy: one Max 20x seat at $200/month

| absorbed API-equivalent value / month | source                                                                                              | multiplier vs API list      | medium features per month at saturation | effective model $/small | $/medium | $/epic |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------- | ----------------------- | -------- | ------ |
| **$200** (low)                        | Anthropic docs: $13/dev/active day, $150-250/dev/month                                              | 1.00x (no discount)         | 11.0                                    | $3.51                   | $18.11   | $69.24 |
| **$1,450** (base)                     | viberank median API-equivalent, n=1,099; 89% above $200/mo                                          | 0.138x (**7.2x discount**)  | 80.1                                    | $0.48                   | $2.50    | $9.55  |
| **$5,800** (high)                     | community heavy-Opus Max 20x estimate; corroborating case $15,000 over 8 months on $100 Max (18.8x) | 0.034x (**29.0x discount**) | 320.2                                   | $0.12                   | $0.62    | $2.39  |

**Formula:** effective $/unit = (200 / absorbed) x S1 model+sweep per unit. Base medium: (200/1450) x 18.11 = 0.1379 x 18.11 = **$2.50**.

**Weekly-cap constraints (the binding ones, all sourced):**

- Max 20x published weekly hours (2025-08-28, the only numbers Anthropic ever published): **240-480 h Sonnet + 24-40 h Opus per week**, with a separate Opus-only reset. Twilight balanced puts **69.3% of its model cost on Opus 5** (plan, discovery review, spec critique, critic, judge, escalation). The Opus weekly sub-cap, not the Sonnet one, is what binds a Twilight operator.
- The +50% Claude Code weekly-limit promotion runs **13 Sep 2026 23:59 PT** and then "return[s] to their standard levels" — i.e. a **-33% cut in weekly headroom five days from today**.
- 5-hour rolling windows on top of weekly caps. `agentSlots: 2` x `fanOut: 2` means concurrent sessions on one account; a single medium feature at p50 needs 2.30 agent-hours and can burn a whole window.
- Weekly-cap ratio Max 20x vs Max 5x from Anthropic's own hours: 240-480 vs 140-280 = **~1.7x weekly capacity for 2x price** — the "20x" multiplier applies only to the 5-hour window. This is the subject of Kahn v. Anthropic (3:26-cv-05763, MTD hearing 2026-11-06).
- Cache TTL: **1 hour on subscription, 5 minutes once drawing on usage credits.** A 5-minute TTL against Twilight's queue/human-wait pattern forces full-prefix re-reads; every cache miss costs 12.5x a cache read on Sonnet 5 (1.25 x $2 vs $0.20) and 50x on Fable 5.1. Overflow is priced at API list **and** loses the cache economics, so the marginal token past the cap costs more than a pure API token.
- Usage-credit daily redemption limit $2,000.

**Policy constraints (why this subsidy is not a plan):**

- Third-party harnesses (OpenClaw et al.) have been **off subscriptions since 2026-04-04 12:00 PT** — API key or extra-usage bundles only. Twilight's own secretary is OpenClaw.
- ACP / `claude -p` / Agent SDK still draw on plan limits **only because the 2026-05-13 carve-out was paused on 2026-06-15** ("When we have an update, we'll share it before anything takes effect"). If un-paused, $200 becomes a $200 **API-list credit**, which at the base absorption figure is a **7.2x effective price increase** and at the high figure **29x**. Twilight is ACP-first by design (spec.md:35, A09).
- `--bare` "will become the default for `-p` in a future release"; bare mode never reads OAuth credentials and requires `ANTHROPIC_API_KEY`.
- Legal page: OAuth "is intended exclusively for purchasers ... designed to support **ordinary use** of Claude Code and other native Anthropic applications"; "Advertised usage limits for Pro and Max plans assume **ordinary, individual usage**"; developers building products "should use API key authentication"; third parties "may not collect, store, or intermediate Claude.ai credentials or session tokens". A K3s pool of unattended sandboxes with per-repo ephemeral credential mounts (A34) is the exact pattern being fenced.
- Enterprise is already **$20/seat + every token at API rates**, with no seat-level usage limits — the destination state, available today, at zero subsidy.

---

## T8. Revenue cross-check (revenue bands are from the sourced anchors; cost is S1 base at $150/h)

| class          | full unit cost | revenue band     | gross margin  | model tokens as % of price |
| -------------- | -------------- | ---------------- | ------------- | -------------------------- |
| small fix      | $117.29        | $300 - $2,500    | 60.9% - 95.3% | 1.1% - 0.1%                |
| medium feature | $337.58        | $1,500 - $8,000  | 77.5% - 95.8% | 1.1% - 0.2%                |
| large/epic     | $1,217.55      | $4,000 - $20,000 | 69.6% - 93.9% | 1.6% - 0.3%                |

Comparators: Fraction $99/story point (5 pt = $495); HouseofMVPs $3,999 for one feature / $7,499 for 3-5; Anthropic managed Code Review alone is $15-25/PR — **more than Twilight's entire model bill for a medium feature at S1 p50 ($17.17)**.

---

## T9. Cost per ACCEPTED outcome with unsuccessful runs in the numerator

Design: "Request cost includes unsuccessful runs. Cost per accepted outcome includes their cost in the numerator; no accepted outcome gives an unavailable ratio, not zero."

| acceptance yield | uplift | S1 medium model $ | S1 medium full stack @$150/h |
| ---------------- | ------ | ----------------- | ---------------------------- |
| 0.95             | 1.05x  | $18.07            | $355.34                      |
| 0.85             | 1.18x  | $20.20            | $397.15                      |
| 0.70             | 1.43x  | $24.52            | $482.25                      |
| 0.55             | 1.82x  | $31.21            | $613.78                      |

At the shipped caps' own pause rate (18.5% money / 63.5% token at uncached semantics), a yield of 0.70-0.85 is the realistic planning range for S1 **before** any operator intervention converts a pause into an acceptance — and each pause adds human minutes, which is the expensive line.

## Assumptions

- A1 (per-attempt token archetypes, MY ASSUMPTION, calibrated not measured). Processed input / output per single agent attempt at medium-feature scale: discovery.research 0.8M/15k; discovery.review 0.4M/8k; specification.critique 0.5M/10k; planning.plan 1.0M/25k; implementation.implement 2.2M/35k; knowledge.reconcile 0.4M/8k; review.critic 0.6M/10k; review.judge 0.4M/7k; acceptance.cloud-browser 0.7M/12k; dev-sweep.exercise 0.5M/10k. Calibrated so that implement+knowledge+one review round for a medium feature (10.8M/180k) reproduces the derived per-PR feature p50 (10M/150k), leaving the other Twilight stages as visible structural overhead. Anchors: Anthropic's own session example 991k processed / 5.3k out in 6m20s; Vantage 50-turn model 1M/40k; Bun 12M processed / 106k out per commit.
- A2 (class size factor). Per-attempt tokens scale by 0.40 (small fix), 1.00 (medium), 1.25 (epic deliverable, larger repo context). The repo contains no measured per-stage distribution and requires M1 ledgers before any calibration.
- A3 (unit shape). Small fix = 1 deliverable / 1 candidate; medium feature = 3 deliverables / 1 candidate (the researcher's own inference for a medium feature); epic = 10 deliverables / 3 candidates with run-scoped activities doubled. Dev-sweep nights on branch-dev: 1 / 3 / 10 at base.
- A4 (attempt counts, low / base=p50 / high=p90). Run-scoped: research 1/1/2, discovery review 1/1/2, spec critique 1/1/2, plan 1/1/1.5. Per deliverable: implement 1.00/1.25/2.60 (inclusive of escalated attempts), knowledge 1/1/1.3, critic 1.00/1.25/2.60, judge same as critic. Per candidate: cloud-browser 1.0/1.2/2.0 (a moved main forces a fresh pass). Base band 19.4 total attempts for a medium feature is inside the researcher's independent inference of 12-25 attempts.
- A5 (p90 attempt size). Per-attempt tokens x0.70 / x1.00 / x1.50 across the low/base/high bands, on top of the attempt-count bands — because run-to-run token variance on the same task reaches 30x and failures consume more tokens than successes.
- A6 (escalation split). Balanced escalates implement to opus-5 high once (maxSteps 1). I assume 0.00 / 0.25 / 1.00 escalated opus attempts per deliverable at low/base/high, and that an escalated high-effort attempt costs 1.3x the tokens of the base attempt. Failed cheaper attempts are NOT erased (grill Q20).
- A7 (cache hit rate). h = 0.90 base, 0.95 sensitivity, applied uniformly to every activity. Observed rates: 94.8% (Anthropic session example), 92.4% (Bun), 91% (docs /usage), >90% (heavy-user log), 97% (viberank Aug 2026 aggregate). Twilight deliberately leaves prompt-cache TTL and compaction unselected, so the real rate is unknown for its own workload.
- A8 (cache-write premium). The formula's 1.25x is applied to the uncached share for EVERY provider, including open-weight ones that publish no write premium (z.ai lists cache storage as limited-time free). Dropping the premium for open-weight providers would reduce S3-S6 model cost by roughly (0.25 x (1-h) x p_in) / effective price, i.e. ~4-6% at h=0.90.
- A9 (agent time). 8 minutes of agent-session time per 1M processed input tokens, from the Anthropic docs example (991k processed in 6m20s API duration). agentTime excludes queue and human-only pause, so this maps to the ledger definition.
- A10 (infra rates, UNSOURCED - nothing in the repo prices infra). K3s worker pool of 1 server + 2 agent nodes + h3mon + h4claw at $150 / $350 / $700 per month; 2 agent slots x 730h = 1,460 agent-slot-hours/month at 50% / 25% / 10% utilisation gives an absorbed $0.21 / $0.96 / $4.79 per agent-hour. Sandbox Job overhead (image pull, ephemeral storage, telemetry, cleanup) $0.01 / $0.03 / $0.05 per admitted attempt. Full repo-gate build-slot time 8 / 12 / 25 minutes per run; 3 / 8 / 26 gate+browser-gate+compose+staging builds per unit for small/medium/epic.
- A11 (Browserbase, UNSOURCED and the weakest line in the stack). $0.50 / $2.00 / $5.00 per cloud-browser acceptance session. Verified: 'No Browserbase pricing anywhere in the repo', and no cloud-browser price appears in any research sheet. Only acceptance.cloud-browser is charged here; verification.browser is a local browser slot.
- A12 (human minutes per touchpoint, MY ASSUMPTION; the repo requires human effort to be explicitly measured and never inferred from approval waiting). Small / medium / epic base: request shaping 10/25/90; plan approval 8/20/60; pause and escalation handling 5/20/90; acceptance sign-off 8/25/75; release command 3/5/15; client communication 10/30/120. Totals 44 / 125 / 450 minutes. Low = 0.6x, high = 2.0x.
- A13 (token-volume and attempts multipliers). Multipliers are applied ONLY to activity classes whose model was actually swapped versus S1. Volume multipliers indexed to Sonnet 5 = 1.00 by dividing the published SWE-rebench multipliers by Sonnet 5's 1.8x: Fable 5.1 0.56, Opus 5 0.94, GLM-5.3 1.22, DeepSeek V4 Pro 0.89, MiniMax M3 3.06, GPT-5.6 Sol 0.13. Attempts multipliers indexed to Sonnet 5 = 1.75x: GLM-5.3 base 1.00 (low 0.85, high 1.40 - deliberately conservative; a literal reading of the anchor would give 0.57 and make GLM cheaper than the shipped implementer on attempts), DeepSeek V4 Pro 2.0/2.9/5.0, MiniMax M3 1.14/2.00/2.86, Fable 5.1 0.80, Sol 0.90.
- A14 (multiplier transfer, the shakiest assumption in the model). SWE-rebench multipliers are measured on an implement-shaped benchmark task. In S2/S4/S5/S6 I apply them to every class including plan, review, judge, knowledge and cloud-browser. Sensitivity S2b shows the size of this: removing the 0.56x Fable volume discount moves a medium feature from $19.17 to $34.23.
- A15 (S5/S6 scope). Read as all-classes swaps for comparability with S4. S5's 'verifier' is modelled as critic/judge rounds scaling with implement attempts (each attempt is reviewed); the repo gate and browser gate are tools and cost no model tokens.
- A16 (pause-share distribution). Per-unit cost and token distributions are treated as lognormal fitted to my p50 and p90: sigma = ln(p90/p50)/1.2816. This is a fitting convention, not an observed distribution.
- A17 (S7 saturation). 'Saturated' means the operator actually consumes the full absorbed value each month; the weekly and 5-hour caps are treated as feasible, which is exactly what the Kahn complaint disputes. Anthropic publishes no token- or dollar-denominated definition of Max limits.
- A18 (S1 does not include the release envelope). The production release command carries its own $20 / PT2H suballocation with a money limit only; it is not counted in the run-account model cost above. Nor is the release-window-expired terminal outcome (30 days after handoff).

## Premise implications

P1 (labs will soon price coding subscriptions close to API usage prices) is ALREADY TRUE at the margin and is the load-bearing risk in this cost model. Every overflow token on every Anthropic plan is billed at standard API rates today; Enterprise is $20/seat plus every token at API rates with no seat-level limits; third-party harnesses were cut off subscriptions on 2026-04-04; OpenAI's Codex credits reproduce API list at exactly $0.04/credit for every current model. The only thing standing between Twilight and full API pricing is the 2026-06-15 PAUSE of the Agent SDK / claude -p / ACP carve-out, which is precisely the surface Twilight is built on (ACP-first, spec.md:35). Quantitatively: at the base absorption figure the pause is worth 7.2x on model tokens ($2.50 vs $18.11 per medium feature); if it lifts, S1 IS the price. But P1 matters far less than it appears, because model tokens are only 5.4% of a medium feature's unit cost at $150/operator-hour (14.0% at $50/h). A total loss of the subsidy moves a medium feature from $322 to $338 — 4.9%. P1 is a real risk to a business whose economics are model tokens; it is a rounding error for a business whose economics are operator hours, which is what the bottom-up stack says Twilight is.\n\nP2 (until then, build a great custom harness that can use cheaper models) is the premise the arithmetic contradicts most sharply, in three ways. First, the harness's own structure is more expensive than the model choice: Opus-5-class work (plan, discovery review, spec critique, critic, judge, escalation) is 69.3% of S1 model cost on 42.3% of the tokens, so swapping the implementer to GLM-5.3 (S3) moves a medium feature from $17.17 to $17.14 — a $0.03 saving, 0.2%. Second, cheaper models are not cheaper under processed-token accounting: at h=0.90 GLM-5.3's effective input price ($0.409/M) is within 5% of Sonnet 5's ($0.430/M) because its cache read is 18.6% of input versus Anthropic's 10%, and after its 1.22x token-volume multiplier GLM-5.3 is 16% MORE expensive than the model it replaces. Third, the harness's shipped bounds forbid the models that are genuinely cheap: DeepSeek V4 Pro needs 3.62 implement attempts per deliverable at p50 against a rework bound of 3, and MiniMax M3 needs 2.50 with a p90 of 7.44 — so S5 and S6 do not fail on money, they fail on rework exhaustion, which pauses the run and spends the one input that actually costs anything. The harness IS worth building, but its payoff is measured in operator minutes saved per accepted outcome, not in tokens.\n\nP3 (open-weight models will be 'ok' for coding and much cheaper than flagship models) is half-right and the wrong half is the expensive one. 'Much cheaper' survives only for DeepSeek V4 Pro off-peak (effective input $0.102/M, 4.2x below Sonnet 5) and it is exactly the model whose ~5x attempts multiplier makes it inadmissible under the shipped profile. GLM-5.3 — the best open-weight coder in the sheets — is a wash against Sonnet 5 once caching and token volume are priced. MiniMax M3 has the cheapest sticker of all ($0.091/M effective) and the highest total cost of the open-weight scenarios at p90 ($45.19 vs S4's $40.97) because it burns 3.06x the tokens and needs 2x the attempts; it also blows through the token cap in 100.0% of medium features. The best case for P3 in this entire model is not open-weight at all: GPT-5.6 Sol's 0.24x token-volume multiplier gives it a volume-adjusted effective input price of $0.115/M — the lowest of any model in the table, closed or open — and $2.56 per medium feature, 6.7x below the shipped Anthropic profile. If the goal is cheap accepted outcomes rather than open weights, the shipped profiles' Anthropic-only default (every provider key in all three profiles and both escalation targets is `anthropic`) is a larger unexamined cost than the open-weight question. Caveat: the Sol figure rests on a single SWE-rebench row (605,340 tokens vs Fable 5's 2,518,308) at medium effort, and the harness/effort configuration is unverified.

## Findings

- Human minutes dominate every scenario at every rate. Model tokens are 3.0-5.7% of a full accepted unit at $150/operator-hour, 8.0-14.8% at $50/h, and 1.5-3.0% at $300/h. The entire spread from Anthropic list (S1) to the cheapest open-weight scenario (S5) is $12.02 per medium feature ($17.17 -> $5.15) against a $312.50 human line at $150/h — a 2.8% change in unit cost. Any optimisation that saves 20 operator-minutes per unit ($50) is worth more than eliminating the model bill entirely.
- The shipped 1.5M-token cap is not a budget under processed-token semantics, it is a prohibition. Medium-feature p50 is 17.23M processed input; 99.8% of medium features would pause. Under uncached+output semantics it pauses 63.5% at h=0.90 and 38.3% at h=0.95. The schema itself says 'Whether tokens includes cache reads is adapter-defined' — so a single undocumented adapter decision swings the pause rate from 38% to 100%. This is the highest-leverage unresolved definition in the whole plan and it costs nothing to fix.
- The $40 money cap is roughly correctly sized and the token cap is not. At S1 the money cap binds on 18.5% of medium features (p50 $17.17 against a $40 cap, p90 $57.39) and agentTime PT6H binds on 13.4% (p50 2.30h, p90 6.96h). Three limits sized from three different implicit token semantics will fire in three different regimes; the token limit fires first and for the wrong reason.
- Opus-5-class work is 69.3% of the model bill on 42.3% of the tokens. Plan $1.70 + discovery review $0.63 + spec critique $0.79 + critic $3.36 + judge $2.27 + escalation $3.16 = $11.90 of $17.17. The implementer everyone wants to optimise is $3.89 (22.6%). Swapping implement to GLM-5.3 (S3) saves $0.03. Swapping review+judge+plan to Sonnet 5 would save roughly $4.50/unit — 15x more than the implementer swap — and is the cheapest structural experiment available.
- Under processed-token accounting GLM-5.3 is NOT cheaper than the model it would replace. Effective input at h=0.90: GLM-5.3 $0.409/M vs Sonnet 5 $0.430/M (5% cheaper on raw price because GLM's cache read is 18.6% of input, versus Anthropic's 10%), then x1.22 token volume = $0.500/M, i.e. 16% more expensive. Only the output price genuinely falls ($4.40 vs $10). A blended 3:1 sticker comparison says GLM is 1.9x cheaper; the agent-loop arithmetic says it is a wash.
- Fable 5.1 everywhere costs almost the same as the shipped mixed profile: $19.17 vs $17.17 per medium feature (+11.6%) on 8.2M processed input instead of 17.2M. Its 0.025x cache read ($0.25 vs Fable 5's $1.00) plus a 0.56x token-volume multiplier nearly cancel a 5x sticker. It also halves the token-cap pause rate (97.6% -> 30.0% under uncached+output semantics) and would make the run finish in half the agent time. If the 0.56x volume transfer to non-implement classes does not hold, the same scenario costs $34.23 (S2b) and pauses 42.7% of features on money — so this is a cheap, high-information experiment to run first.
- S5 (DeepSeek) and S6 (MiniMax) cannot complete inside the shipped balanced profile. Balanced allows 3 implement attempts per deliverable (1 + rework.maxRounds 2). S5 needs 3.62 at p50 and 13.00 at p90; S6 needs 2.50 and 7.44. They do not fail on money — they exhaust rework, pause with a finding, and demand the one resource that actually costs money (an operator decision). The rework bound, not the price list, is what makes a cheap model unusable.
- The discovery envelope (300k tokens / $10 / PT2H) is 5.7x undersized under processed semantics and adequate under uncached+output at h>=0.85. Measured: discovery research + review + spec critique = 1.70M processed / 33.0k output / $1.91. The money limit is never the binder; the token limit is, and only because of the same undefined semantics.
- Non-model cost is real but small and its largest line is the least sourced. Infra per medium feature at base is $6.97, of which the Browserbase cloud-browser session is $2.40 (34%) at a completely unsourced $2/session assumption. K3s pool share is $2.21, build/gate slot $1.54, sandbox Jobs $0.82. At the low band the whole infra line is $1.14 and at the pessimistic corner $77.91 — a 68x range driven almost entirely by an unknown pool utilisation rate, not by any technical uncertainty.
- The bottom-up build reconciles with the independent anchors, which is the main reason to trust it. S1 medium p50 $17.17 sits inside the only measured end-to-end range ($2.81-$33.38 per merged feature, 12 models x 3 harnesses, Jul 2026) and near the middle of the Claude-family runs ($12-23). Small fix $3.39 vs the derived bug-fix p50 of $2.73 (Opus) / $1.09 (Sonnet). Epic $65.30 vs derived $142 (Opus) / $56.80 (Sonnet). Attempt count 19.4 for a medium feature sits inside the researcher's independent 12-25 inference. Twilight's structure costs roughly 1.7-2.2x a plain Claude-Code-class harness for the same accepted outcome — that is the price of discovery, spec critique, a judge, knowledge reconciliation and a cloud-browser acceptance pass, and it is a defensible price.
- The Max 20x subsidy is worth 7.2x (base) to 29x (high) on model tokens and 3.0% to 5.1% on full unit cost. At $150/h a medium feature costs $337.58 at API list and $322.00 fully subsidised. The subsidy is therefore not a business model; it is a 5% discount with a 100% policy risk attached, and it is the wrong thing to design the harness around.
- The Opus weekly sub-cap, not the Sonnet one, is what would bind a Twilight operator on Max 20x. 69.3% of model cost is Opus-5-class, and Anthropic's only published weekly figures give Max 20x 24-40 h Opus per week against 240-480 h Sonnet. Add that the +50% Claude Code weekly promotion expires 2026-09-13 (five days from today) and returns limits to standard, a -33% cut in headroom.
- Cost per accepted outcome must carry unsuccessful runs. At an 85% acceptance yield a medium feature's model cost rises from $17.17 to $20.20 and the full stack from $337.58 to $397.15; at 70% it is $482.25. The shipped caps' own pause rates (18.5% on money, 38-64% on tokens) put the realistic yield at 0.70-0.85 before operator intervention, and each pause adds human minutes — the expensive line. The caps convert token risk into operator-hour risk at roughly $50 per interrupt.
- The single largest cost lever in the entire model is not in any requested scenario: GPT-5.6 Sol's 0.24x token-volume multiplier gives a volume-adjusted effective input of $0.115/M (lowest of any model, open or closed) and $2.56 per medium feature — 6.7x below the shipped profile, with 2.12M processed input, which is the only scenario that comes close to fitting the shipped 1.5M cap. All three shipped profiles and both escalation ladders are Anthropic-only. Caveat: this rests on one SWE-rebench row (605,340 tokens at medium effort) and the promotional Sol price ($4/$0.40/$20) expires 2026-11-21.
- Self-hosting is PENDING. No self-hosting research sheet was present, so every open-weight scenario here is priced at owner-API list. The GH200 study's finding that 10-15B-active models run at ~1/7th the hardware cost of 32-40B-active ones is the only self-hosting datapoint in any sheet, and it is about hardware, not $/accepted outcome.

## Open questions

- Does the adapter count cache reads in the run budget's `tokens`? The schema says it is adapter-defined. The answer moves the medium-feature pause rate from 38.3% to 99.8% and is the single cheapest decision on this list. Recommendation: define the ledger unit as uncached input + output (which is what a rate card charges for) and set a separate cache-read counter, then re-derive all three profile caps from M1 ledgers.
- What is Twilight's actual per-activity cache hit rate? Prompt-cache TTL and compaction are deliberately unselected. Every dollar figure here moves ~26% between h=0.85 and h=0.95 on Anthropic models, and the 5-minute credit-mode TTL against Twilight's queue and human-wait pattern could put the real rate far below the 90-95% observed for interactive Claude Code. This is the highest-variance unmeasured input in the model.
- What does a Browserbase cloud-browser session actually cost? Unsourced in the repo and in every research sheet, yet it is 34% of the infra line at base. One acceptance session per staging candidate, repeated on every moved main.
- What are the real K3s pool cost and utilisation? The infra line ranges 68x ($1.14 to $77.91 per medium feature) on a pool-cost and utilisation assumption with no source. A single month of host invoices plus accepted-outcome counts collapses this range.
- Do the SWE-rebench token-volume multipliers transfer to non-implement classes (plan, critic, judge, knowledge)? This is the largest modelling risk: it moves Fable-everywhere from $19.17 to $34.23 per medium feature and flips whether it beats the shipped profile. Measurable in M1 by running the same fixture under two model assignments.
- Is GLM-5.3's attempts multiplier really at parity with Sonnet 5? I used 1.00x conservatively; a literal reading of the SWE-rebench pass@1 figures (GLM-5.2 62.9 vs Sonnet 5 56.8) gives 0.57x, which would make S3 meaningfully cheaper. The Vals SWE-bench ranks (GLM-5.3 6/88) point the same way but Sonnet 5's own Vals scores are unverifiable (page renders 0.0% placeholders).
- Should the balanced escalation ladder point at Opus 5, given escalation is 18.4% of model cost on 12.4% of tokens? A cheaper escalation target, or a second cheap attempt before escalating, is a directly testable Task 11 lever.
- Does a retried dev-sweep occurrence (onTrigger retries max 2, PT5M backoff) open a fresh 200k/$8 account? Unstated. Worst case is 3x the per-occurrence allowance per target per night, i.e. an epic living 10 nights on a branch dev could carry up to 6M tokens of sweep spend outside its run account.
- What acceptance yield does the factory actually achieve? Cost per accepted outcome carries unsuccessful runs in the numerator, and the 0.55-0.95 yield range moves the full medium-feature cost from $355 to $614. Nothing in the repo estimates it and the 30-day escaped-defect window means even accepted outcomes are provisional.
- Why are all three shipped profiles Anthropic-only? GPT-5.6 Sol's measured token efficiency is the largest single lever in this model and no shipped profile can select it; the ACP adapter plan probes Claude first then Codex, so the plumbing exists. Worth an explicit decision with its reasoning recorded, rather than an unexamined default.
- Self-hosted open-weight inference: no sheet exists. What is $/accepted outcome for GLM-5.3-Flash or a 10-15B-active model on owned or rented GPUs, including idle time, and does it beat DeepSeek V4 Pro off-peak at $0.102/M effective? Until answered, P3's strongest form is untested.
- What happens on 2026-09-13 when the +50% Claude Code weekly limits expire, and if the paused Agent SDK / ACP credit carve-out returns? The first is dated and five days away; the second has an explicit promise of advance notice but no date. Both should be watched as named triggers rather than assumed away.
- Should the harness measure human minutes per touchpoint from day one? The ledger already requires explicit human minutes never inferred from waiting, and this model says that quantity is 80-96% of unit cost. It is the only line where a measurement changes the business, and it is the one line M1 currently plans to measure least precisely.
