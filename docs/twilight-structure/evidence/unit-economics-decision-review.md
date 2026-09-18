# Twilight decisions reviewed against unit economics

Reviewed 2026-09-08 at commit `912fad4081229357379f9ac9d3e1cd6d16b6b7fb`.
Scope: the [decision tree](grilling-decision-tree.md), its 160 answered questions
and accepted plan effects, the [product decision map](../../../.scratch/twilight-structure/map.md),
current assumptions/specs/tasks, and the [unit economics research](../research/unit-economics/README.md).
This report proposes reconsideration; it does not amend decisions or authorize implementation.

The direction makes sense as a personal delivery system. The research supports
prioritizing operator attention, reliable acceptance and attributable costs. It
does **not** establish that the proposed investment pays back, that labor falls
sixfold, or that particular model routes will deliver the forecast savings.
Several recommendations in the research also conflict with the plan they advise.

Eight findings follow. P1 means resolve before relying on the affected investment,
budget or dependency decision. P2 means qualify before adopting the recommendation.
These priorities express economic consequences, not replacements for the historical
question ranks.

| Finding | Priority | Decisions affected                           | Recommended disposition                                                              |
| ------- | -------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| F1      | P1       | Q10, Q130–131; A69                           | Add an early investment screen; retain the measured M1 continuation gate.            |
| F2      | P1       | Q11–13, Q35, Q51; A12/A46                    | Define the token unit and calibrate the hard limits before admitting real work.      |
| F3      | P1       | Q104–105, Q112, Q126; A69                    | Require comparable human-effort evidence for an economic go decision.                |
| F4      | P1       | Q14, Q27–30, Q57, Q111; Task 11.1            | Separate necessary notifications/automation from optional optimization dependencies. |
| F5      | P1       | Q2, Q7, Q64; research consensus              | Include unsuccessful outcomes before labeling a figure cost per accepted outcome.    |
| F6      | P2       | Q14–20, Q71–82; research model verdicts      | Retain local benchmarks; withdraw categorical feasibility and winner claims.         |
| F7      | P2       | Q1, Q38, Q65, Q106; research batching advice | Batch only work with demonstrated latency tolerance and net savings.                 |
| F8      | P2       | Q121, A24; Task 14; research build advice    | Preserve bounded dogfooding before customer readiness.                               |

## F1 — The economic stopping rule arrives after roughly half the investment

The tree makes the continuation decision depend on factory-core evidence.
[A69](../assumptions.md#current-wayfinding-questions) requires a go/no-go only
after Task 8.4. Summing the current Tasks 1–8 estimates, including the separately
stated 4.4–4.5 and 7.3–7.4 allowances, gives **151–300 human hours**. The whole
personal loop is estimated at **280–560 hours**: approximately 54% of the planned
effort lies before that gate. The existing re-estimate after Tasks 1–4 is useful, but it does
not specify an economic stop condition. Sources: [phase route](../../../openspec/changes/twilight-control-plane/tasks.md#product-phases),
[Task 8](../../../openspec/changes/twilight-control-plane/tasks.md#task-8-accept-the-first-factory-core-run),
decision-tree branches A and D.

The research's 3/7/15-month payback headline is a scenario, not a reason to skip
that earlier screen. Customer revenue, pricing premium and demand capture remain
assumptions; A63 deliberately leaves the customer problem undecided. Personal
use can justify the build, including the independently valued infrastructure
deliverable, but hypothetical client receipts cannot establish personal payback.
Keep the accepted infrastructure choice and the customer implementation gate.

**Suggested decision:** before substantial construction, record an affordable
investment ceiling, a personal-work baseline, and the recurring pain or benefit
that warrants the next tranche. Give the Tasks 1–4 checkpoint an explicit
continue/reduce/pause decision. Keep A69 for measured continuation, valuing remaining
cost separately from sunk cost. If a commercial return is used to justify spending,
show demand evidence and remaining customer-readiness costs without pulling customer
machinery into Phase 1.

## F2 — A hard token limit has neither a stable unit nor a plausible calibration

The proposed [balanced profile](../../../openspec/schemas/twilight-v1/execution.yaml)
at line 382 permits 1.5M tokens, $40 of model spend and six agent-hours.
The [design](../../../openspec/changes/twilight-control-plane/design.md#pricing-and-the-ledger)
normalizes charge categories, but does not define which categories consume the
scalar `budget.limits.tokens`. A provider's reporting convention is not a portable
budget definition.

Using the research's **assumed**, not measured, 17M processed input tokens per
medium feature:

- Counting cache reads consumes **11.3 times** the token allowance.
- At 90% cache hits, excluding cache reads still leaves **1.7M input tokens before
  output**, already over the allowance.
- At 95% hits, 17M × 5% + the bottom-up model's 299k output is **1.149M**, which
  fits. Therefore “the median fails under every reading/cache assumption” is too
  strong; the undefined unit and likely frequent pauses are the defensible findings.

An avoidable pause consumes the very operator attention the business case needs
to save. The same issue reaches the 300k discovery and 200k sweep allowances.
The research's exact pause percentages and 130–160× build-token correction depend
on inferred distributions and a session-based tokens/hour extrapolation; they are
not measured forecasts.

**Suggested decision:** define the token counter once in the contract, including
cache writes, cache reads and output. Replay representative usage against the
proposed limits and report which resource would stop each run. Retain a separate
token ceiling only for an explicit resource-control purpose; a money-derived
estimate alone cannot guarantee a hard bound when model, cache mix and prices vary.
Do not raise any approved envelope automatically.

## F3 — The benefit that is supposed to repay the harness is still assumed

The research explicitly calls human minutes unmeasured, then says the harness
reduces them roughly sixfold and that both cost directions are real
([summary](../research/unit-economics/README.md#what-the-numbers-say), lines 43–50).
The underlying comparison uses **180 → 30 minutes**; its own audit says those
models count different activities and identifies 30 minutes as a steady-state
floor rather than a planning estimate
([audit](../research/unit-economics/models/audit.md#cross-model-disagreements-12), lines 36–38).
Agreement among models sharing assumptions does not independently validate that saving.

The plan already requires explicit human effort and separates it from waiting;
that is correct. The gap is the decision rule: Q104 includes effort “when measured,”
while A69 names cost and elapsed without requiring sufficient human-cost coverage.
The default money scope is model-only. A faster run with inexpensive tokens can
still require more operator review, recovery and maintenance.

**Suggested decision:** an economic go record must compare like-for-like request
shaping, review, intervention, release and ongoing operations effort at fixed
quality. Missing material effort makes the economic conclusion inconclusive.
Record personal time value separately from cash savings; count additional sales
only when demand can absorb the released capacity. Avoid counting the same saved
hours both as opportunity value and as the labor behind extra revenue.

An illustrative sensitivity, not a forecast: at the research's $34,700 build
valuation and $75/hour, twelve outcomes a month saving one human hour each yield
$900/month, or **38.6 months** to recover the build before any recurring cost.
This does not disprove the project; it shows why the seven-month headline needs
an explicit volume-and-benefit case. At that rate the entire assumed $16 model
bill equals **12.8 human minutes**.

## F4 — Optional optimization is bundled into the personal loop's critical path

[Task 13](../../../openspec/changes/twilight-control-plane/tasks.md#task-13-operate-branch-dev-staging-dev-main-and-production)
depends on **all of Task 11.1** for release notifications and scheduled sweeps.
But [Task 11](../../../openspec/changes/twilight-control-plane/tasks.md#task-11-expand-agent-roles-lifecycle-hooks-and-automation)
also includes a second provider, specialist critics, benchmark publication,
lazy tool loading and on-demand optimization analysis. Its estimate is 24–48
human hours. Some work is conditional on measured need, but the task dependency
does not isolate the small subset Task 13 actually consumes.

This sits poorly with Q10/Q111's requirement that optimization repay its build,
evaluation and rollout cost. At twelve features/month and the research's $16
model cost, even eliminating **every model charge** saves only $192/month. That
is an illustrative upper bound for token-only savings, not the value of reliability,
provider choice or reduced human effort.

**Suggested decision:** make the Task 13 prerequisite the required hook,
notification and recurring-trigger contract. Gate other expansions on their own
measured benefit and move them off that prerequisite unless a required capability
depends on them. Preserve full acceptance quality. The already-supported overlap
of Task 15 after Tasks 5–7 remains useful.

## F5 — “Cost per accepted feature” omits a cost its own definition requires

The [research summary](../research/unit-economics/README.md#consensus-figures)
labels $16 as model cost per accepted medium feature. The
[arithmetic audit](../research/unit-economics/models/audit.md#cross-model-disagreements-12)
explicitly excludes the unsuccessful-run uplift from that consensus and says to
apply yield separately (line 29). Rework within a successful run is not the same
as all abandoned or failed runs in the cohort.

That conflicts with Q2/Q7 and the
[comparable-outcomes contract](../../../openspec/changes/twilight-control-plane/design.md#comparable-outcomes):
unsuccessful runs stay in the numerator. Dropping them makes failure-prone routes
look cheaper and understates the cost of restrictive caps.

**Suggested decision:** label the current figure as modeled successful-run cost
before failed-run allocation. Compute actual cohort cost as all relevant charges
divided by accepted outcomes, keeping human/tool/model coverage separate. For
illustration only, if every run costs $16 and 80% are accepted, the cost is
$16 / 0.8 = **$20 per accepted outcome**. Unequal failed-run costs require their
actual sum, not a universal divisor. The current figure cannot support a quoted
margin without that missing yield and cost distribution.

## F6 — The research overstates what benchmarks prove about model routing

The [bottom-up model](../research/unit-economics/models/bottom-up-cost.md#t4-model-cost-per-accepted-unit-across-serving-scenarios-low--base--high-h090)
says DeepSeek and MiniMax cannot finish within balanced's rework limit “at all.”
Its own table puts MiniMax's base attempts at **2.50**, below its assumed cap of
three, and a larger expected attempt count would not establish impossibility
anyway. The [source sheet](../research/unit-economics/sources/open-weight-models.md)
explicitly lacks a directly measured Twilight attempts multiplier.

Likewise, `1 / pass@1` describes a geometric retry model only under additional
assumptions; a benchmark's pass@5 comparison does not imply exactly five attempts
per accepted task. As a mathematical counterexample, independent attempts with
20% success have an expected five attempts but a **48.8%** chance of success by
attempt three. Real repair attempts are not independent, so that percentage is
not a model forecast either.

The [benchmark methodology](https://swe-rebench.com/about) concerns repeated runs
of benchmark issues, not measured repair trajectories through Twilight's verifier.
The named winner, 93% cache crossover and “validated” escalation claims depend on
particular prices, workload transfer, cache mix and conditional recovery rates.
Coding benchmark results do not automatically price discovery, judging or browser
acceptance. The current Q14–20/Q71–82 benchmark policy is stronger than these
research verdicts and should be retained.

**Suggested decision:** use the research to shortlist candidates, then compare
bounded acceptance yield, total cost, latency and human recovery effort on each
activity. Keep current defaults provisional; do not add a provider merely because
an all-model simulation wins. Cache the actual provider counters and test cold,
warm and idle-gap conditions. Anthropic documents distinct uncached, cache-write
and cache-read counters, plus both five-minute and paid one-hour cache durations;
“API keys imply a fixed five-minute TTL” is not an API-wide constraint.
([Official caching documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), checked 2026-09-08.)

## F7 — “Batch the review stages” can worsen the objective the tree chose

The research recommends batching review at a 50% discount
([design consequences and plan](../research/unit-economics/README.md#consequences-for-twilights-own-design),
lines 225–243). Q1/Q38/Q65/Q106 prioritize accepted elapsed time at fixed quality.
A review that blocks integration is on that path even if its execution is asynchronous.

Anthropic confirms the discount, but says most batches complete within an hour,
processing can take up to 24 hours, and cache hits are best effort. Thus the same
90% cache hit assumption cannot simply be carried into every discounted route.
This is a Messages API capability, not evidence that the selected ACP adapter
already supports it.
([Official batch documentation](https://platform.claude.com/docs/en/build-with-claude/batch-processing), checked 2026-09-08.)

**Suggested decision:** evaluate batches first for offline evaluations or work with
explicit slack. A blocking review needs measured net savings, queue latency and
turnaround compatibility before batching becomes its default. Brokered compound
tool effects in Q28/Q97 are a different mechanism; retain their existing tests.

## F8 — Waiting for revenue before dogfooding creates a readiness contradiction

The research says not to run the build through the harness until revenue starts
([plan item 6](../research/unit-economics/README.md#plan)). The canonical plan
allows factory execution after M1 and requires a real self-change canary in
[Task 14](../../../openspec/changes/twilight-control-plane/tasks.md), lines 1446–1456.
Personal maturity, including that portability proof, precedes customer onboarding.
If revenue means customer delivery revenue, applying the advice to that canary
creates a cycle: readiness waits for revenue that waits for readiness.

The ratio between subscription list-equivalent usage and API cash is not the
value of the experiment. A bounded canary can expose expensive operational faults
before a client does. Conversely, the plan does not require all construction to
dogfood the incomplete factory.

**Suggested decision:** keep ordinary interactive construction where permitted
and useful; budget the required canary as verification investment before customer
readiness. Choose any wider dogfooding from its net learning, attention and cash
effects. Do not make first revenue its universal prerequisite.

## Decisions that remain sensible

| Decision family                                                                                   | Assessment after the economics review                                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accepted outcomes, fixed quality, failed-run accounting; Q1–7, Q41–50                             | Keep. They prevent faster or cheaper activity from masquerading as useful output. Apply the same standards to the research's own claims.                                       |
| Approval envelopes, one decision for in-envelope work, recovery authority; Q31–40, Q132–144, Q154 | Keep. They protect spend and reduce routine intervention. Measure exceptional recovery effort.                                                                                 |
| Complete personal assistant-to-production loop, exact staging/publication, searchable work        | Keep as the chosen product outcome. Its usefulness is coherent; its financial return remains a hypothesis.                                                                     |
| Accepted K3s choice and bounded initial topology; A49–50                                          | Keep. Infrastructure is an intended deliverable. Cheap hosting does not establish cheap operation, so include its human upkeep.                                                |
| Customer implementation after named discovery; A63/Q159                                           | Keep. Do not use unspecified customers to justify earlier spending as if revenue were established.                                                                             |
| Reject fleet-scale graphs, automatic routing and copied savings percentages                       | Keep. No local evidence gives them priority over operator time.                                                                                                                |
| API-list planning and deferring self-hosted model serving                                         | Reasonable planning baselines at the modeled volume. They do not prove subscription convergence or justify categorical claims about every permitted use of subscription tools. |

The tree is answered, but these choices are not all economically validated. Its
historical ranks need no rewrite: this report supplies the new revisit evidence.
The most valuable next observation is comparable human effort and accepted yield
on representative work, alongside correctly defined usage counters.

## Evidence and checks

- Read the current decision tree, Q1–120 answers, Q121–160 questions and their
  accepted plan-impact ledger, product map, relevant assumptions, execution
  profile, and canonical design/tasks. Reviewed the research synthesis and
  decision-relevant model/source sections. An independent research pass checked
  the major benefit, payback and benchmark inferences against their source trail.
- Recomputed the M1 effort sum, scaling-matrix size (4 capacities × 5 repetitions
  × 3 workloads = 60 workload/capacity/repetition cells), cap examples, human-time
  equivalents, illustrative payback, yield adjustment and retry counterexample
  with Bun. Sixty cells is not a claim of sixty accepted features or model calls.
- Re-fetched the cited official batch and caching contracts. Model rankings and
  monetary values quoted from the research remain dated scenario inputs; this
  review does not independently refresh every vendor price or benchmark.
- The private calculator linked by the research was not inspected. No customer
  demand, operator-time, acceptance-yield or Twilight runtime measurements were
  available to validate the modeled benefits. Ten initial ledgers could help
  calibrate them; they would not automatically establish tails, rare failures or
  mature quality comparisons.
- `bunx nx format:check --files=docs/twilight-structure/evidence/unit-economics-decision-review.md,docs/twilight-structure/README.md`
  passed. A Bun check resolved all 20 local report links and their heading anchors,
  plus the index entry. `git diff --check` passed; the new report's whitespace and
  final newline were checked separately. The first link-check attempt could not
  import the unavailable `github-slugger` package; the completed check used Bun's
  file reader and explicit heading normalization without adding a dependency.
- Runtime tests, lint, typecheck, build and browser gates were not run for this
  report-only change. OpenSpec validation was not run because no OpenSpec artifact
  changed. No product behavior or safety check was modified.
