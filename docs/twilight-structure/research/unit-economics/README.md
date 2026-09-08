# Unit economics of running the factory for clients

Inspected 2026-09-08. A sourced estimate with an adversarial audit, not a measurement:
every per-unit figure rests on a per-stage token distribution and on human minutes that
nobody has measured yet, and the note says so where it matters. The live calculator that
drives these numbers is a private artifact:
<https://claude.ai/code/artifact/b7452aaf-4c45-4f2d-8f2c-f4929db5452b>.

## The question

Dany asked for the unit economics of running Twilight as a custom software-factory harness
for clients, resting on three premises:

- **P1** Soon OpenAI and Anthropic will price coding subscriptions close to API usage.
- **P2** Until then, a great custom harness that can use cheaper models is buildable.
- **P3** Open-weight models will be "ok" for coding and much cheaper than flagships.

## Method

Eight web-researched fact sheets ([`sources/`](sources/)), each fact carrying its URL, date
and a quoted / derived / estimated label. Seven independent fact-check passes
([`verification/`](verification/)) fetched every cited source: 241 of 279 checked claims
confirmed, the rest corrected at the edges, one sub-value refuted and unused. Three
independent models built the economics from the same sheets ([`models/`](models/)): a
bottom-up stage stack, a top-down business plan and an investment read on the harness; three
adversaries tried to refute each premise; an arithmetic audit ([`models/audit.md`](models/audit.md))
recomputed every headline, found fifteen non-reproducing figures and no overturned
conclusion, and produced the consensus carried below. Subagents ran on Sonnet 5 and Opus 5
after an early Fable run hit the session limit; the whole exercise cost about $813 at API
list, $724 of it the Fable runs.

Accounting convention throughout: cost = uncached input × price × 1.25 (cache write) +
cached reads × cache-read price + output × output price, at a 90% cache hit rate, over
processed tokens (input including cache reads).

## What the numbers say

- **Model tokens are about $16 per accepted medium feature** on Anthropic list prices through
  the full Twilight stage structure (band $8–50; small fix $3, epic $75). Against a $2,000
  price that is under 2%. Every one of five independent estimates lands between $8 and $45;
  the whole spread is one unmeasured quantity, the ceremony multiplier Twilight's stages put
  on a plain Claude Code run (1.25× / 1.7× / 2.5×).
- **Operator minutes are 80–96% of unit cost** at every operator rate and in every routing
  scenario. Delivery touch alone is 30 / 75 / 150 minutes per medium feature; all-in with a
  client-overhead share, 45 / 120 / 240. Both are assumptions; `design.md` requires human
  minutes to be measured explicitly and never inferred from approval waiting.
- **The harness raises model cost per unit 1.5–2× over driving Claude Code by hand**, because
  it adds discovery, critique, a judge and an acceptance pass. It lowers operator minutes
  roughly six-fold and produces evidence a client will pay for. Both directions are real; the
  first is 1–2% of the unit price and the second is most of it.
- **Cache reads are the bill, and Anthropic prices them best.** At a 90% hit rate GLM-5.3's
  effective input price ($0.409 per million processed) is within 5% of Sonnet 5's ($0.430)
  because its cache read ($0.26) is above Sonnet's ($0.20) and Fable 5.1's ($0.25); after its
  1.2× token appetite it is dearer on input. Routing the implement class to GLM-5.3 saves
  nothing (1.00×, all three models). GLM's ~2× edge per accepted outcome versus Opus 5 comes
  from pass@1 quality and inverts above a 93% hit rate.
- **The cheapest model per accepted feature in every estimate is closed.** GPT-5.6 Sol uses
  0.24× Fable's tokens on the one same-scaffold board (medium effort, promotional price to
  2026-11-21). DeepSeek V4 Pro needs ~5 attempts, MiniMax M3 burns 5.5× tokens, Kimi K3 is
  priced above Sonnet 5; the first two cannot finish inside balanced's rework bound at all.
- **Self-hosting is out.** An 8×H200 node at about $32 an hour decodes a DeepSeek-class model
  at ~2,200 tokens a second per GPU, $0.50 per million output tokens at full utilisation and
  break-even against hosted prices near 5–6 billion output tokens a month. A solo factory
  processes 0.2–1 billion, 90% of them cache reads.
- **The subscription subsidy cannot follow the business into client work.** Anthropic's Claude
  Code legal page limits plan credentials to ordinary individual use and forbids routing them
  on behalf of others; A34 requires per-repo ephemeral credentials that one person's OAuth
  token cannot be; the ledger needs a provider-billed cost per attempt that a plan never
  emits. At this factory's delivery volume a $200 Max seat is at or below break-even anyway.
  Its legitimate use is Dany's own interactive and build work, worth $1.5–24k over the build.

## Premise verdicts

| Premise | Verdict                          | What survives                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1      | Holds, narrower                  | Every channel but one is already at API list: overflow credits, Enterprise seats ($20 + tokens at list), third-party harnesses since 2026-04-04, Codex credits at exactly $0.04. The Agent SDK / `claude -p` / ACP carve-out was announced 2026-05-13 and paused 2026-06-15. Headline plan prices have not moved in 17 months; interactive use stays subsidised 7–30× for heavy users, and Max still gets Fable 5.1 at half its weekly limit. |
| P2      | Wrong as stated; build it anyway | There is no window, because Twilight is API-metered by design. "Cheaper models" is a config line, not a harness property, and under the same scaffold every cheaper implement model costs as much as Sonnet 5 or more. What survives: operator minutes per accepted outcome, the acceptance oracle, and the first honest measurement of cost per accepted feature.                                                                            |
| P3      | Holds for named models           | "OK" holds on independent same-harness boards. "Much cheaper" is 2× for GLM-5.3 against Opus, not 5–10×, comes from quality rather than price, and is beaten 3–4× by GPT-5.6 Sol. False for DeepSeek V4 Pro at peak, MiniMax M3 and Kimi K3 inside a model-verified harness.                                                                                                                                                                  |

## Consensus figures

Carried from the audit; low / base / high.

| Quantity                                                        | Low                   | Base                          | High               |
| --------------------------------------------------------------- | --------------------- | ----------------------------- | ------------------ |
| Model cost, accepted medium feature, balanced on Anthropic list | $8                    | $16                           | $50                |
| Same, all classes on GLM-5.3                                    | $5                    | $11                           | $41                |
| Same, Fable 5.1 everywhere                                      | $11                   | $19                           | $34                |
| Same, GPT-5.6 Sol (no shipped profile can select it)            | $1.50                 | $3                            | $8                 |
| Processed input tokens per accepted medium feature              | 10M                   | 17M                           | 45M                |
| Human minutes per medium feature, all-in                        | 45                    | 120                           | 240                |
| Shared infrastructure per month                                 | $60                   | $100                          | $250               |
| Revenue per accepted medium feature                             | $800                  | $2,000                        | $5,000             |
| Retainer per client-month, with a published unit cadence        | $2,000                | $4,500                        | $8,000             |
| Harness build, personal delivery loop (280–560 h)               | $16,700 at $50/h      | $34,700 at $75/h              | $175,000 at $300/h |
| Payback after launch                                            | 3 months              | 7 months                      | 15 months          |
| Max 20x seat, API-equivalent value absorbable                   | $200                  | $1,450                        | $5,800             |
| Binding throughput ceiling                                      | demand at 2–3 clients | human minutes at 8–12 clients | 19 clients         |

Infrastructure prices, fetched the same day: Netcup VPS 8 vCPU / 16 GB €19.25, 16 / 64
€47.95; Browserbase Developer $20 for 100 browser hours, $0.12 an hour over; Backblaze B2
$6.95 per TB-month. The three models had assumed $220–500 a month and $2 per cloud-browser
session; the real figures are about $100 and cents.

## Subscription dollar against API dollar

The ratio depends on the user, because a plan is a capped pool rather than a quantity of
tokens. Anthropic publishes multipliers and hours, never dollars, so the API-equivalent value
of a seat has to be measured from usage logs:

| Max 20x, $200 a month             | API-equivalent a month | Ratio      | Source                                                          |
| --------------------------------- | ---------------------- | ---------- | --------------------------------------------------------------- |
| Typical enterprise developer      | $150–250               | 0.75–1.25× | Anthropic docs: $13 per developer per active day, 90% under $30 |
| Heavy Claude Code user, median    | $1,450                 | 7×         | viberank calculator, n=1,099, 2026-08-05                        |
| Heavy user, top decile            | $7,358                 | 37×        | same                                                            |
| August 2026 cohort median         | $6,085                 | 30×        | viberank monthly stats, n=215                                   |
| Community 30 h/week Opus estimate | $5,800                 | 29×        | gist, May 2026                                                  |

The published caps behind those figures: Max 20x gets 240–480 Sonnet hours plus 24–40 Opus
hours a week (the only quantities Anthropic has released, 2025-08), with five-hour windows on
top; overflow bills at API list and the prompt-cache lifetime drops from one hour to five
minutes once on credits.

OpenAI publishes the reverse: credits per message and message counts per window, no weekly
figures. Since 2026-04-02 Codex usage inside a plan is metered in credits, and the rate card
converts at $0.04 a credit to exactly API list for every model (Sol 100 / 10 / 500 credits per
million tokens is $4 / $0.40 / $20), so the plan's unit of account already is the API price.

| Plan         | Sol messages per 5 h | API-equivalent per window | Monthly bound                                           |
| ------------ | -------------------- | ------------------------- | ------------------------------------------------------- |
| Plus $20     | 10–100               | $12–20                    | weekly cap unpublished                                  |
| Pro 5x $100  | 50–500               | $60–100                   | weekly cap unpublished                                  |
| Pro 20x $200 | 200–2,000            | $240–400                  | $5,300–8,800 at one window a workday with no weekly cap |

That upper bound is 26–44× and almost certainly unreachable; third-party break-even guides put
Pro at 60–80M tokens a month, worth $300–800 at pre-cut prices, so 1.5–4× for a realistic heavy
user. Resellers show where this lands once the subsidy is gone: Cursor Pro is $20 of inference
at API prices for $20 (1.0×), Copilot Max $200 of credits for $100 (2×). Anthropic's flat pool
is the most generous in the market for a heavy interactive user, and that is exactly the usage
it fences with caps rather than price. At this factory's own delivery volume, $110–250 a month
of tokens, a $200 seat is at or below break-even before policy enters.

## Consequences for Twilight's own design

These are findings against the shipped `execution.yaml` and the plan, not measurements.

- **The token limb of every budget cap is the outlier.** Balanced's 1,500,000 tokens is about
  30× tighter than what its own $40 buys and 40× tighter than its six agent-hours; money and
  time agree with each other. At the consensus 17M processed tokens per medium feature the
  cap is breached at the median under both readings of "tokens": nearly every feature pauses
  if cache reads count, 30–55% if only uncached input and output count, against about 15% for
  the money cap. Whether cache reads count is adapter-defined today. Pin the convention in the
  schema, derive tokens as money ÷ the pinned blended rate, or drop the limb.
- **The plan's token estimates are roughly 130–160× below consumption**, using the plan's own
  agent hours and the ~9M processed tokens an hour a Claude Code session shows. Harmless in
  dollars ($0.6–11k for the build); the same unit sits in the run budgets, where it binds.
- **The dev-sweep cap ($8 a night) is about 59× the computed spend** of a 200k-token Sonnet
  sweep ($0.14). Whether a retried occurrence opens a fresh account is unstated.
- **The balanced escalation ladder is validated.** Sonnet 5 then Opus 5, both attempts charged,
  beats Opus-first while Sonnet fails under 57% of attempts; measured failure is 43%.
- **The next adapter should be Codex, not an open-weight one.** Sol on implement saves about
  1.45× more per feature than GLM-5.3 for the same adapter cost and is already the plan's
  second ACP probe. Batching the asynchronous review stages at 50% off is worth more than the
  whole open-weight substitution. Every `provider:` in the shipped profiles is `anthropic`.
- **If an open-weight implement class is added, verify it with tools and give it its own
  escalation target.** A model needing four attempts under an Opus judge is the worst of both.
  Decision rule for GLM-5.3 on Twilight's own fixture: adopt only if the measured cache hit rate
  is under 93%, the token multiplier under 2.2 and attempts to accept at or below 1.2.
- **Measure human minutes per touchpoint from the first run.** They are the cost, and the plan
  measures them least precisely.

## Plan

1. Price the model line at API list from day one; treat plan-included usage as a windfall for
   interactive work.
2. Settle the token semantic and re-derive the caps from the first ledgers.
3. Build the acceptance oracle and the ledger before anything that saves tokens.
4. Sweep effort before switching model (Fable 5.1 at high costs half of max for two points);
   then route by class; Codex adapter next; batch the review stages.
5. Do not self-host.
6. Build interactively on the subscription; do not run the build through the harness until
   revenue starts (dogfooding converts subsidised tokens to metered at 7–17×).
7. Sell turnaround and acceptance, not hours. Price per unit moves margin ±50%; every model
   lever together about one point.
8. Protect the operator bottleneck; relieve the pool at €20–50 a node when it binds at ~3
   concurrent clients.

## Unmeasured, and the signals that settle them

Unmeasured: human minutes per touchpoint; the per-stage token distribution; the realised
cache hit rate under per-activity model switching (every class switch invalidates the prefix,
and the TTL is 5 minutes on API keys). The first ten accepted-outcome ledgers, split model /
tool / human, close all three.

Dated external signals: 2026-09-13, when the +50% Claude Code weekly limits are due to revert
or be extended a sixth time; the pause banner on Anthropic's Agent SDK plan article gaining an
effective date; 2026-11-06, the Kahn v. Anthropic motion-to-dismiss hearing; 2026-11-21, when
GPT-5.6 Sol's promotional price reverts or is made permanent; the day-one plan status of the
next flagship on Max.

## Files

| Path            | Holds                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sources/`      | Nine fact sheets: Anthropic subscriptions, OpenAI pricing, the convergence thesis, open-weight models, tokens per unit of work, client pricing, Twilight's own cost structure, self-hosting, infrastructure prices. |
| `verification/` | Seven fact-check passes over the sheets, each claim confirmed, corrected, unverifiable or refuted against its cited source.                                                                                         |
| `models/`       | The three models, the three premise refutations and the arithmetic audit with its consensus table.                                                                                                                  |

Every review receipt under `evidence/` and every sheet here is a snapshot of 2026-09-08; prices
and limits in this market move on a 3–33 day notice cycle.
