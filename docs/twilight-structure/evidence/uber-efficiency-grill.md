# Twilight efficiency grill

Reviewed 2026-09-08 at commit `c6b0c98a`. This is a design review of the
proposed Twilight plan, not runtime evidence or approval. It applies the methods
in Uber Engineering's 2026-08-28 article,
[Running a Software Factory Efficiently at Uber Scale](https://x.com/UberEng/article/2093444169037762840),
where they fit a personal-first factory. Uber's reported fleet measurements are
context, not performance claims for Twilight.

The review has three bounded passes. The first stopped after questions 1–60; after a
request for 60 more, the second stopped after questions 61–120. A feasibility pass
then asked questions 121–160. Claude Fable 5.1 answered them from a hash-pinned
packet and a separate fresh Fable session ranked every pair. The full third-pass
questions, receipts and per-answer plan effects live beside this file. Each answer
distinguishes what the current plan already proves on paper from what it still
needs to measure in implementation. `Keep` means no plan change is recommended,
`Strengthen` means the current contract needs a sharper acceptance obligation,
`Add later` means the idea belongs after the first useful loop, and `Reject` means
the Uber mechanism should not be copied into this scope.

## Outcome and scope

### 1. Is Twilight optimizing the right thing?

**Answer:** Yes. The proposal optimizes elapsed time to accepted, integrated
outcomes within fixed quality and authorized spending, which is stronger than
optimizing tokens or session throughput alone. **Resolution: Keep.**

### 2. Is “cost per accepted outcome” defined rather than used as a slogan?

**Answer:** Yes. The outcome contract includes failed runs and retries in the
numerator, refuses a zero denominator, pins evaluation cohorts, and excludes
incomparable or immature evidence from rankings. **Resolution: Keep.**

### 3. Does the plan confuse adoption with efficiency?

**Answer:** No. The personal phase has one operator, so adoption has no useful
denominator yet. Request count remains a nested cost driver, not an adoption
claim. **Resolution: Add later.** Define adoption metrics in the customer-phase
OpenSpec change after the A63 discovery gate, when a named design partner makes
them meaningful.

### 4. Does the personal phase have an independently assessable exit?

**Answer:** Yes. The complete assistant-to-production route terminates only after
the human release command and observed production outcome; factory-core is
explicitly a technical milestone, not the personal-phase exit. **Resolution:
Keep.**

### 5. Is the first milestone too broad to yield useful evidence early?

**Answer:** It is broad but deliberately executable in slices. Tasks 1–7 establish
the core and Task 8 runs two end-to-end profiles before later environment and
assistant work. The risk is long time-to-first-feedback, not a missing boundary.
**Resolution: Keep, but publish intermediate measurements per task.**

### 6. Should the plan promise Uber-like savings?

**Answer:** No. Uber's 34% cost-per-1,000-request and 52% cost-per-session changes
come from its own workload and fixed-model comparison. Twilight must establish
its own baselines before setting numerical savings targets. **Resolution: Reject.**

### 7. Are accepted outcomes protected from denominator gaming?

**Answer:** Yes. Subdividing tasks cannot increase the accepted-outcome count,
mixed-profile recoveries are not credited to one profile, and failed runs remain
in cost. **Resolution: Keep.**

### 8. Does the plan distinguish product value from factory activity?

**Answer:** Mostly. Work requests, deliverables, attempts, and outcomes are
separate, but activity volume could still become a vanity metric in dashboards.
**Resolution: Strengthen:** label session, request, token, and tool-call counts as
drivers, never outcomes.

### 9. Is customer-scale machinery being pulled into personal acceptance?

**Answer:** Some scale-ready boundaries are intentional infrastructure, but
customer-specific tenancy, support, packaging, and promises are deferred until a
named design partner exists. **Resolution: Keep.**

### 10. Is there a stopping rule when optimization work stops paying back?

**Answer:** Not explicitly. Fixed-quality comparisons can identify a winner, but
there is no rule for declining an optimization whose expected savings cannot
repay implementation and evaluation cost. **Resolution: Strengthen:** require an
estimated payback or recurring pain threshold before an efficiency change enters
the plan.

## Cost equation and model routing

### 11. Can Twilight explain why model spend changed?

**Answer:** Only partially. It records token categories, rates, model revision,
attempts, epochs, waits, and outcomes, but does not define a stable factorization
like users × requests/user × turns/request × tokens/turn × price/token.
**Resolution: Strengthen:** add a diagnostic decomposition without making its
factors budget authority.

### 12. Should Twilight copy Uber's exact cost equation?

**Answer:** No. **Resolution: Strengthen, as question 11's accepted breakdown
already does.** Reconcile outcome cost through request and run counts, activity
attempts, model turns, input/output/cache-read/cache-write tokens, tool-definition
overhead, failed lookups, polling cycles, and pinned rates. Active users are not a
factor until the customer phase.

### 13. Are input, output, cache-read, and cache-write costs kept distinct?

**Answer:** Yes, including provider reporting gaps and double-counting policy.
This directly supports diagnosing prompt-cache economics. **Resolution: Keep.**

### 14. Is model selection benchmark-driven per workload?

**Answer:** Not yet. M1 compares two whole delivery profiles on fixed fixtures;
Task 11 expands routing, but no task requires a benchmark for each activity class
before changing its default model. **Resolution: Strengthen Task 11.**

### 15. Is “best model” defined on quality, reliability, latency, and cost?

**Answer:** The plan has all four observations but does not name Pareto dominance
as the selection rule. A single weighted score would hide unacceptable trade-offs.
**Resolution: Strengthen:** retain the non-dominated activity/model candidates and
make the chosen trade-off explicit.

### 16. Are benchmarks built from real work rather than synthetic prompts alone?

**Answer:** The scaling matrix uses versioned fixtures and a clean client, which
is necessary but insufficient for routing. **Resolution: Strengthen:** seed each
activity-class benchmark with retained, redacted real attempts after enough exist,
while keeping authored adversarial fixtures.

### 17. Can a model upgrade silently invalidate historical comparisons?

**Answer:** No. Provider/model revision, evaluation revision, cohort, environment,
and profile epoch are pinned. This matches Uber's need to hold the model fixed
when isolating other optimization gains. **Resolution: Keep.**

### 18. Is the primary-versus-worker model split deliberate?

**Answer:** Yes in mechanism: class defaults and per-activity overrides exist.
**Resolution: Strengthen:** benchmark each declared activity class separately—
research, plan, implement, review, judge, verify, and knowledge—rather than
inheriting one fleet default. The coordinator is a process with no model, and the
secretary uses OpenClaw's separate capacity pool; neither is an activity class
unless Task 15 registers one.

### 19. Can routing change automatically when the frontier moves?

**Answer:** Correctly, no. M1 forbids automatic recalibration from two samples;
evaluation changes need publication authority and profile changes are revisioned.
**Resolution: Keep human publication; add scheduled recommendation generation
later, not autonomous default mutation.**

### 20. Does escalation erase the cost of the failed cheaper attempt?

**Answer:** No. Both attempts stay charged to their profile epochs and a mixed
outcome is not credited wholly to either profile. **Resolution: Keep.**

## Context, tools, and request efficiency

### 21. Does the plan treat grounding as an efficiency lever?

**Answer:** Indirectly. Repository orientation, the wiki, planning revisions, and
source-bound artifacts reduce search, but no metric attributes wasted turns to
missing or stale context. **Resolution: Strengthen:** record discovery/search
turns, failed lookups, and context-source hits per activity when the adapter can.

### 22. Should Twilight build an Uber-scale context graph now?

**Answer:** No. The repo wiki and explicit links are a much cheaper starting
point, and a graph with no demonstrated query need would violate the plan's own
first-loop priority. **Resolution: Reject for the personal phase.**

### 23. Is context freshness visible?

**Answer:** Yes for source, plans, compiled workflow, receipts, and environment
observations. Knowledge claims also carry provenance and status. **Resolution:
Keep.**

### 24. Can missing grounding fail slowly and expensively?

**Answer:** Yes. Unknown required inputs fail at boundaries, but an agent can
still spend many turns searching before it discovers that a source is absent.
**Resolution: Strengthen:** let activity adapters declare required context and
preflight its availability before reserving the full attempt allowance.

### 25. Are all tool schemas loaded into every agent session?

**Answer:** The plan does not say. At the intended number of MCP and provider
integrations, eager schema injection could become a repeated token tax.
**Resolution: Strengthen:** require adapters to report tool-definition tokens or
bytes and support activity-scoped tool exposure before broad connector growth.

### 26. Should every MCP server be projected as a shell CLI?

**Answer:** No. Twilight's brokered effect boundary needs typed identity,
authority, intent, and reconciliation; an unrestricted shell projection could
bypass it. **Resolution: Reject the universal CLI pattern.**

### 27. Can lazy tool discovery coexist with the effect boundary?

**Answer:** Yes. A catalog/search operation can reveal only authorized tool
descriptors, then load a selected schema while dispatch still passes through the
same effect executor. **Resolution: Add later:** use catalog-backed lazy loading,
not direct provider access.

### 28. Can chatty tool protocols be batched safely?

**Answer:** Yes if one durable effect owns the batch plan, sub-effect identities,
limits, checkpoints, and partial outcome. Hiding polling is useful; hiding
authority or partial failure is not. **Resolution: Add later:** define bounded
compound effects for proven high-volume workflows.

### 29. Should polling happen in model turns?

**Answer:** Usually no. The coordinator or registered adapter should poll with a
bounded policy and return state changes, keeping repetitive protocol chatter out
of model context. **Resolution: Strengthen adapter guidance now.**

### 30. Are compaction and prompt-cache settings part of the plan?

**Answer:** Partly. Session-context compaction and prompt-cache TTL are not in the
plan; reasoning effort already is. **Resolution: Add later** for compaction and
TTL as measured adapter capabilities. **Keep** the current per-class effort pins
and test effort as a separate Task 11 treatment, as question 88 requires. Do not
import Uber's 400k-token or one-hour settings.

## Authority, durability, and resource control

### 31. Does cost optimization ever bypass authority?

**Answer:** No. Profile changes, model choices, speculation, and new attempts are
bounded by the same approved envelope and current authority at dispatch.
**Resolution: Keep.**

### 32. Can a cheap model approve its own work?

**Answer:** No model can approve. Human decisions require an interactive,
short-lived, single-use capability; critics and judges have no decision authority.
**Resolution: Keep.**

### 33. Can a worker call tools outside the accounting path?

**Answer:** The design denies external access except through brokered effects and
Task 6 requires live canaries for bypass attempts. **Resolution: Keep; this is the
non-negotiable constraint on every tool-efficiency idea.**

### 34. Does batching create an exactly-once illusion?

**Answer:** It would unless each external action retained a stable identity and
query/reconciliation state. The existing effect contract already refuses to infer
success from process exit. **Resolution: Keep that contract for compound effects.**

### 35. Are unknown usage signals treated as free capacity?

**Answer:** No. Unknown consumption retains its hold, and strict admission fails
without a defensible bound and stopping mechanism. **Resolution: Keep.**

### 36. Can cost telemetry failure stop essential recovery?

**Answer:** The ordinary contract can pause new dispatch while retaining holds;
production release has a separately authorized same-account suballocation. The
plan should also ensure cancellation and reconciliation reserves cannot be spent
by optional analysis. **Resolution: Strengthen resource priority tests.**

### 37. Is interactive assistant capacity protected from worker saturation?

**Answer:** Yes. The secretary has a separate pool and provider reserve, and a
substantial request delegates then releases the turn. **Resolution: Keep.**

### 38. Does the scheduler optimize token cost at the expense of elapsed time?

**Answer:** No. It prioritizes feasible aged and critical-chain work within
approved resource vectors; price is a constraint and outcome dimension, not the
only ordering signal. **Resolution: Keep.**

### 39. Is speculative execution justified by a measurable outcome?

**Answer:** Yes in contract: it is opt-in, bounded, independently evaluated, fully
charged, and cannot publish from a loser. It still needs evidence that saved
elapsed time exceeds extra cost. **Resolution: Keep disabled by default until a
fixture demonstrates that trade-off.**

### 40. Could optimization analysis itself become unbounded factory work?

**Answer:** Yes. Dashboards, benchmarks, and trace analysis all consume resources.
**Resolution: Strengthen:** make each optimization evaluation an ordinary bounded
activity with its own cost and stop condition.

## Evaluation, delivery, and quality

### 41. Is quality held fixed when comparing efficiency changes?

**Answer:** Yes. The evaluation definition, rubric, observation set, cohort,
fixture, model/effort where appropriate, and environment are pinned.
**Resolution: Keep.**

### 42. Does the benchmark cover real integration bottlenecks?

**Answer:** Yes. The matrix includes independent work, a decomposable feature,
and contended recovery, and reports integration and browser constraints rather
than crediting idle workers. **Resolution: Keep.**

### 43. Does it measure reliability rather than only average latency?

**Answer:** It reports p50/p95, failures, exhaustion, defects, rework, and raw
samples. **Resolution: Keep; add timeout rate to model-routing benchmarks because
Uber found it materially affected model choice.**

### 44. Can a benchmark teach to its own test?

**Answer:** The independent evaluator and authored assertions reduce this risk,
but fixtures can still become familiar to repeated routing experiments.
**Resolution: Strengthen:** maintain a sealed holdout slice and rotate real-work
samples without exposing expected answers to workers.

### 45. Are browser observations trusted merely because an agent says they pass?

**Answer:** No. The driver produces captured steps; a registered verifier derives
the report, and coverage joins reports only afterward. **Resolution: Keep.**

### 46. Can branch-local greens substitute for integration acceptance?

**Answer:** No. The exact branch is composed with current main, built once, tested
in production-like staging, published by compare-and-swap, and the same artifact
is promoted. **Resolution: Keep.**

### 47. Is continuous optimization allowed to move the acceptance floor?

**Answer:** No. Floors are immutable revisions and evaluator publication requires
separate authority. Current runs remain pinned while tighter live constraints can
still apply. **Resolution: Keep.**

### 48. Does every new efficiency guard require a breakable proof?

**Answer:** The repository-wide R5 rule applies, but this review's proposed
metrics are not yet assigned production-path negatives. **Resolution: Strengthen:**
each implemented metric must inject omission, misattribution, or double-counting
and observe the named consumer fail.

### 49. Can “no escaped defects” be reported before the window matures?

**Answer:** No. Immature or incomplete exposure is excluded rather than recorded
as zero. **Resolution: Keep.**

### 50. Is there enough evidence to choose a default profile after M1?

**Answer:** No, and the plan says so. Two runs prove plumbing, not superiority.
**Resolution: Keep:** require a declared minimum sample and exposure maturity in
the later routing/default-publication task.

## Visibility, feedback, and evolution

### 51. Is live spend visible while a run is still controllable?

**Answer:** Ledger and FE/MCP visibility are planned, but the product experience
does not promise a persistent live counter or warning thresholds. **Resolution:
Strengthen the personal phase:** show settled spend, outstanding holds, hard-cap
headroom, and coverage without claiming unavailable total cost.

### 52. Should Twilight copy Uber's 50/80/100 percent nudges?

**Answer:** Not as fixed values. **Resolution: Strengthen.** Warning thresholds
are versioned same-unit values below the hard vector, configured per budget
account, and emit one deduplicated event when crossed. No starting profile ships
intermediate thresholds before measured operator need, so 50/80/100 remains an
operator choice rather than a default.

### 53. Can the operator see the driver of a cost increase?

**Answer:** Raw ledger dimensions and the driver view are M1 work, not later.
**Resolution: Strengthen.** Task 5 owns `efficiency.tsx`, Task 7.2 exposes each
outcome's reconciled breakdown through FE and MCP, and Task 8.1 requires the
two-profile comparison to attribute differences to requests, attempts, model
turns, token categories, tool context, failed lookups, polling, and rates.

### 54. Should session analysis inspect every trace automatically?

**Answer:** Eventually, within the existing access and retention boundaries. For
one operator, on-demand analysis is sufficient until trace volume makes periodic
analysis cheaper. **Resolution: Add later.** Start on demand; schedule only after
measured need.

### 55. Which anti-patterns deserve first-class detection first?

**Answer:** Only locally actionable ones: expensive model on a repeatedly passing
bounded activity, oversized repeated tool/context payloads, cache misses after
idle gaps, polling turns, repeated failed lookups, and retries with unchanged
inputs. **Resolution: Add later with per-rule evidence and estimated impact.**

### 56. Can recommendations mutate settings automatically?

**Answer:** No. They are findings with evidence, expected impact, confidence, and
an explicit publication route. Automatic mutation would collapse measurement,
judgment, and authority. **Resolution: Keep recommendations advisory.**

### 57. Does the plan learn from skill papercuts?

**Answer:** It records session/tool content and has knowledge-reconciliation work,
but no loop turns recurring skill failures into proposed skill changes.
**Resolution: Strengthen Task 11 or 12:** cluster attributed papercuts, propose a
versioned skill edit, and evaluate it through the normal factory workflow.

### 58. Can a skill improve itself under the policy it proposes to change?

**Answer:** Not directly. Factory self-improvement remains judged by the pinned
external policy and needs controlled promotion. **Resolution: Keep.**

### 59. Is the system trying to optimize before observability is trustworthy?

**Answer:** The ordering mostly avoids this: ledger, outcomes, and independent
evaluation precede later routing expansion. The missing factorization and tool
overhead measurements would leave early recommendations under-explained.
**Resolution: Strengthen Tasks 4, 7, and 8 before Task 11 optimization.**

### 60. What is the smallest coherent change to the plan after this grill?

**Answer:** Do not add a context graph, universal CLI layer, automatic router, or
fleet dashboard to M1. Add breakable observations for the cost/request/turn/token
tree and tool/context overhead to the existing ledger; show live cap headroom;
then make Task 11 own per-activity real-work benchmarks, Pareto recommendations,
lazy authorized tool loading, bounded compound effects, and skill-papercut
proposals. **Resolution: Strengthen.** Apply this smallest coherent plan
correction.

## Attribution and measurement validity

### 61. Can the efficiency breakdown double-count nested work?

**Answer:** The corrected design distinguishes nested request, run, attempt, and
turn identities from monetary subtotals, but implementation could still sum a
parent and its children. **Resolution: Strengthen:** every roll-up must declare
whether children partition, overlap, or merely annotate the parent total.

### 62. Can shared prompt-cache reads be attributed to two activities?

**Answer:** Provider usage may report one charge against a session spanning
activities. Splitting it by guess would create false precision. **Resolution:
Strengthen:** retain the provider charge identity once and mark activity allocation
unavailable until a defensible allocation receipt exists.

### 63. Can bytes of tool schema be mistaken for billed tokens?

**Answer:** The corrected plan now says no: byte-only observations remain unpriced
and attributed schema tokens stay inside input tokens. **Resolution: Keep and test
both provider-reporting modes.**

### 64. Does a lower cost per request necessarily mean improvement?

**Answer:** No. It can result from more failed requests, smaller tasks, or quality
loss. **Resolution: Keep cost per accepted outcome primary and present request
economics only as a diagnostic breakdown.**

### 65. Can a lower cost per accepted outcome hide slower delivery?

**Answer:** Yes. The existing comparable outcome record carries elapsed p50/p95,
queue and human wait beside cost. **Resolution: Keep both dimensions and never
collapse them into one score.**

### 66. Can measurement overhead materially change the workload it measures?

**Answer:** Yes, especially full trace capture and synchronous metric writes.
**Resolution: Strengthen:** measure instrumentation bytes, tool time, latency and
failure separately, and require it to stay within a versioned overhead budget.

### 67. May telemetry be sampled to control that overhead?

**Answer:** Diagnostic traces may be sampled, but budget enforcement, effect
identity, accepted outcomes and safety evidence cannot. **Resolution: Strengthen:**
declare each observation complete, sampled, or unavailable and prohibit sampled
records from satisfying mandatory evidence.

### 68. Can late provider invoices rewrite historical outcomes?

**Answer:** Settled estimates must remain distinguishable from later billed cost.
The outcome record is revisioned, so a receipt can append a correction without
rewriting its original observation. **Resolution: Keep; require the comparison's
as-of revision to be visible.**

### 69. What happens when estimated and billed cost diverge materially?

**Answer:** The current plan stores both but does not define an operational
threshold. **Resolution: Strengthen:** emit an attributed pricing-drift finding;
do not mutate the rate card or clear a hold automatically.

### 70. Can currency conversion manufacture an apparent model win?

**Answer:** Yes if conversions use different dates or opaque rates. **Resolution:
Strengthen:** compare money only in the charged currency or under one pinned
conversion revision; otherwise leave the cross-currency ranking unavailable.

## Benchmark integrity and model defaults

### 71. Is a positive real-work sample minimum enough for a benchmark?

**Answer:** No. One repeated easy case meets a count without representing the
activity. **Resolution: Strengthen:** the benchmark must declare strata for task
difficulty, repository/context shape, failure mode, and warm/cold conditions.

### 72. How large must the real-work minimum be?

**Answer:** There is no defensible universal number before observing variance.
**Resolution: Strengthen:** publish the chosen minimum, confidence/uncertainty and
why the sample supports only that activity and cohort.

### 73. Can benchmark cases leak through retained session transcripts?

**Answer:** Yes. A sealed holdout is ineffective if its expected answer is
searchable by the worker. **Resolution: Strengthen:** isolate holdout assertions
from worker-visible storage and prove retrieval cannot return them.

### 74. Can repeated benchmarking overfit the holdout anyway?

**Answer:** Yes, through repeated accept/reject feedback. **Resolution: Add later:**
rotate a quarantined holdout and limit how often one revision can drive a default
decision; preserve old results for audit.

### 75. Should benchmark selection be randomized?

**Answer:** Random order helps control warm caches, provider load and learning
effects, while reproducible seeds preserve diagnosis. **Resolution: Strengthen:**
randomize treatment order with a recorded seed and report order-sensitive results.

### 76. Can a benchmark compare models under different provider quotas?

**Answer:** It may observe them, but cannot attribute the difference solely to the
model. **Resolution: Strengthen:** pin or report quota, region, harness and load;
rank only compatible environments.

### 77. Does Pareto membership prove a model should become default?

**Answer:** No. It only proves the candidate is not dominated on measured
dimensions. **Resolution: Keep human selection and require the publication to name
which trade-off and risk it accepts.**

### 78. Can a default be promoted directly from offline benchmark results?

**Answer:** That is risky because production routing and context differ.
**Resolution: Strengthen:** require a bounded canary or shadow observation before
broad publication when the adapter can run it without duplicating external
effects.

### 79. How is a bad model default rolled back?

**Answer:** Existing profile publication is revisioned, but the benchmark contract
does not explicitly require a rollback trigger. **Resolution: Strengthen:** pin the
prior default and define quality, timeout, cost and reliability thresholds that
propose rollback through the same authority path.

### 80. May a model default change affect already-admitted work?

**Answer:** No. Existing epoch rules keep admitted attempts on their pinned model
and apply changes only to future admission. **Resolution: Keep.**

## Context, caching, and compaction

### 81. Should the plan adopt Uber's one-hour prompt-cache TTL?

**Answer:** No. Idle patterns, provider pricing and privacy boundaries differ.
**Resolution: Keep TTL unselected until Twilight measures gap distribution,
cache-write premium, read savings and provider behavior.**

### 82. What observation is needed before changing cache TTL?

**Answer:** Per activity: inter-turn gap distribution, cache hit/miss status,
write/read tokens, attributable cost, latency and correctness under one provider
revision. **Resolution: Strengthen the activity benchmark input.**

### 83. Can prompt caching cross client boundaries?

**Answer:** It must not. A shared prefix may contain repository instructions,
tool descriptors or source content. **Resolution: Strengthen:** cache identity must
include client/repository and security-domain revisions, with a cross-client
canary proving no content reuse.

### 84. Can a cache hit preserve revoked instructions or tools?

**Answer:** Yes if the cache key omits policy and catalog revision. **Resolution:
Strengthen:** bind cached prefixes to effective policy, prompt, skill and tool
catalog digests; a revocation must miss or invalidate the old prefix.

### 85. Should Twilight compact every long session at a fixed token count?

**Answer:** No. A universal threshold ignores task structure and provider context
limits. **Resolution: Add later:** benchmark compaction per activity against cost,
retrieval effort and independent correctness, then publish a bounded setting.

### 86. What must compaction never discard?

**Answer:** Authority, unresolved findings, effect identities, current task state,
source/evaluation revisions and evidence links. **Resolution: Strengthen:** treat
that set as a retained closure and make missing members a compaction refusal.

### 87. Can a summary be trusted as equivalent to its source context?

**Answer:** No. It is a derived knowledge claim with provenance and coverage.
**Resolution: Strengthen:** preserve source references and make uncertain or
omitted content visible; never let a summary replace an approval or receipt.

### 88. Is reasoning effort a measurable delivery lever?

**Answer:** Yes, and profiles already pin it where specified. The plan does not
yet benchmark effort independently from model choice. **Resolution: Strengthen:**
include effort as a separate treatment within activity benchmarks.

### 89. Can reducing context increase requests enough to cost more overall?

**Answer:** Yes. Tokens per turn may fall while turns, retries and failed lookups
rise. **Resolution: Keep the whole efficiency breakdown and compare at accepted
outcome level, not one term.**

### 90. Should grounding quality be measured by retrieved document count?

**Answer:** No. More documents can increase cost and distract the model.
**Resolution: Strengthen only for irrelevant-context load.** The knowledge
benchmark already measures correctness, source traceability, and retrieval effort;
Task 12 runs the same question set before and after compaction. Add irrelevant
context as a measured factor in that benchmark rather than a new metric family.

## Tool catalog and compound effects

### 91. Can a malicious tool descriptor inject instructions?

**Answer:** Yes. Catalog metadata is external data, not policy. **Resolution:
Strengthen:** validate descriptor shape, preserve provenance, render its text as
untrusted content and prove it cannot alter authority or the system prompt.

### 92. Must a run pin the tool-catalog revision it searched?

**Answer:** Yes. Otherwise a later descriptor can change what the same activity
appears to have selected. **Resolution: Strengthen:** pin catalog and selected
schema digests in the profile epoch and effect intent.

### 93. What if a selected tool disappears before dispatch?

**Answer:** Dispatch must fail with an unavailable capability, not silently select
a replacement. **Resolution: Keep the current no-fallback policy and add the
catalog-specific negative.**

### 94. May tool search reveal capabilities the caller cannot use?

**Answer:** No. Even names and descriptions can disclose integrations.
**Resolution: Keep authorized catalog filtering and test both descriptor and count
leakage.**

### 95. Does loading a schema grant permission to invoke the tool?

**Answer:** No. Selection and dispatch remain separate; dispatch rechecks current
authority and fencing. **Resolution: Keep.**

### 96. How is tool-search accuracy evaluated?

**Answer:** The first correction did not specify it. **Resolution: Strengthen:**
benchmark known tool intents for selection precision/recall, refusal of forbidden
tools, schema-token overhead and end-to-end task success.

### 97. When is a compound effect preferable to separate effects?

**Answer:** Only when a measured chatty workflow saves material turns or latency
and has a bounded, recoverable batch contract. **Resolution: Keep it opt-in and
require a before/after accepted-outcome comparison.**

### 98. Can one compound effect hide partial success?

**Answer:** Not under the corrected plan: sub-effects retain identity and partial
outcome. **Resolution: Keep; require the parent to remain non-terminal until every
member is reconciled or explicitly abandoned.**

### 99. Can a compound effect reorder non-commutative actions?

**Answer:** It must not. **Resolution: Strengthen:** the batch plan pins dependency
order; only declared independent members may run concurrently, and retries reuse
the same member identities.

### 100. Should local shell commands bypass tool accounting because they are cheap?

**Answer:** No. Cheap is not unaudited, and shell commands can create effects.
**Resolution: Strengthen:** classify read-only local computation separately, but
route externally visible shell actions through effect identity and policy.

## Operator experience and resource economics

### 101. Can live cost warnings become alert noise?

**Answer:** Yes. Repeated reconnects or oscillating estimates could spam the
operator. **Resolution: Keep deduplicated threshold-crossing events and show
current state persistently rather than repeatedly notifying it.**

### 102. What happens when a late refund moves spend below a crossed threshold?

**Answer:** History should retain the crossing and correction rather than re-arm
silently. **Resolution: Strengthen:** another warning requires an explicit new
threshold epoch or policy, not downward oscillation.

### 103. Should the status view show estimated or billed cost first?

**Answer:** It should show settled, held and billed/estimated coverage together.
Choosing one headline can hide uncertainty. **Resolution: Keep no single “true
cost” when provider billing is incomplete.**

### 104. Can an optimization reduce model spend while increasing human effort?

**Answer:** Yes. Human minutes and charges already remain separate.
**Resolution: Strengthen:** activity benchmarks and payback analyses must include
human review/recovery effort when measured.

### 105. Can reviewer capacity erase savings from cheaper worker models?

**Answer:** Yes if lower-quality outputs create more review or rework.
**Resolution: Keep reviewer utilization, findings and rework in the outcome
comparison rather than pricing the worker in isolation.**

### 106. Should the scheduler always select the cheapest feasible model?

**Answer:** No. It minimizes accepted elapsed time within quality and spending
bounds; benchmarked model choice is a profile input, not a per-dispatch auction.
**Resolution: Keep.**

### 107. Can a cost dashboard expose sensitive prompts or client names?

**Answer:** Yes. Driver analysis should use identities and redacted references,
with content opened only through its existing access check. **Resolution:
Strengthen:** aggregated economics grants no new transcript access.

### 108. Does the focus brief need every efficiency metric?

**Answer:** No. That would defeat its purpose. **Resolution: Keep only current
bottleneck, spend/hold/headroom state and one actionable finding; link the full
breakdown.**

### 109. Should optimization recommendations interrupt active delivery?

**Answer:** No. **Resolution: Keep.** Recommendations remain findings routed
through ordinary evaluated publication. Existing interrupt conditions—hard-cap
exhaustion pausing ordinary dispatch and a mandatory hook denying—are enforcement
events, not recommendations, so optimization needs no new interrupt path.

### 110. Is a terminal dashboard enough for the always-available secretary?

**Answer:** No. The secretary needs the same durable MCP reading so it can explain
cost and blockers without owning policy. **Resolution: Keep FE/MCP parity and add
no separate assistant accounting source.**

## Improvement governance and stopping rules

### 111. What makes an efficiency optimization worth planning?

**Answer:** A recurring measured cost/latency driver or operational pain whose
expected benefit plausibly repays implementation, evaluation and rollout cost.
**Resolution: Strengthen:** require an optimization proposal to state baseline,
target driver, expected payback, quality floor and stop condition.

### 112. Can expected payback be treated as a guaranteed saving?

**Answer:** No. It is an assumption with an owner and reopen condition until the
accepted-outcome comparison matures. **Resolution: Keep forecast and observation
separate.**

### 113. Who may publish an optimization?

**Answer:** The existing workflow publication operation. **Resolution: Keep.**
Quality changes require the organization's evaluation-publisher capability and a
subject-bound human decision; default changes follow ordinary evaluated profile
publication. Dashboards, benchmarks, and agents only propose.

### 114. Can the factory evaluate a change to its own evaluator fairly?

**Answer:** Only under the previously pinned evaluator and safety floor, with the
new evaluator treated as candidate material. **Resolution: Keep the existing
self-improvement boundary.**

### 115. Can papercut clustering create false consensus?

**Answer:** Yes. Repeated symptoms may come from one duplicated trace or shared
root cause. **Resolution: Strengthen:** cluster by stable session/effect identities,
show sample counts and dissent, and do not convert frequency directly into priority.

### 116. May a generated skill patch contain private trace content?

**Answer:** It must not. **Resolution: Strengthen:** proposals carry redacted
examples or evidence references, and export uses the same content-access and
secret-scanning boundary as other artifacts.

### 117. When should on-demand analysis become scheduled analysis?

**Answer:** Task 11 already fixes on-demand papercut analysis as a bounded charged
activity. **Resolution: Add later, restating question 54.** Scheduling and dynamic
routing require later evidence and a separate change; no additional criterion is
needed here.

### 118. When should dynamic routing be reconsidered?

**Answer:** After the benchmark contract has mature cohorts, effect-safe canary
and rollback thresholds, and complete diagnostic coverage. **Resolution: Add later.**
Reconsider it in its own change. Design and Task 11 already place periodic
recommendation generation and dynamic routing outside M1.

### 119. What Uber idea remains deliberately out of scope after 120 questions?

**Answer:** The already-rejected fleet mechanisms in questions 6, 22, 26, and 60.
**Resolution: Reject.** M1 measures tool and context costs but does not require
lazy tool loading, a universal CLI projection, or automatic prompt tuning; Task
11 keeps universal shell projection and direct provider access forbidden.

### 120. What is the second pass's smallest coherent correction?

**Answer:** Preserve the architecture and add validity around the first pass:
typed attribution/allocation coverage, instrumentation-overhead classification,
benchmark strata and uncertainty, cache/catalog security digests, canary/rollback
for defaults, and an optimization proposal with payback and stop conditions.
**Resolution: Strengthen.** Apply this second-pass plan correction and stop the
grill here.

## Consolidated findings

| Priority | Finding                                                                                                                                                                   | Recommended owner     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| P1       | The ledger is category-complete but cannot yet reconcile a change in cost per accepted outcome into request, attempt, turn, token, cache, tool-context, and rate drivers. | Tasks 4, 7, and 8     |
| P1       | Model routing expansion is not explicitly gated by per-activity, real-work, fixed-quality benchmarks or a Pareto selection record.                                        | Task 11               |
| P1       | Personal-phase controls do not require live settled/held/headroom visibility while the operator can still intervene.                                                      | Tasks 5 and 8         |
| P2       | Tool schemas, failed lookups, and polling turns can consume repeated context without an attributed overhead observation.                                                  | Tasks 5, 6, and 7     |
| P2       | Lazy tool loading and batched compound effects have no planned broker-preserving route.                                                                                   | Task 11               |
| P2       | Session analysis and recurring skill-papercut improvement have no versioned proposal/evaluation loop.                                                                     | Tasks 11 and 12       |
| Defer    | Active-user adoption metrics, scheduled trace analysis, and dynamic routing are premature for one operator.                                                               | Before customer phase |
| Reject   | Uber's numerical savings, fixed cache/compaction defaults, universal shell projection, and large context graph are not portable requirements.                             | None                  |

### Second-pass findings

| Priority | Finding                                                                                                                                                               | Recommended owner |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| P1       | Nested attribution, shared charges and sampled diagnostics need explicit allocation/coverage semantics; instrumentation overhead must be measured rather than hidden. | Tasks 4, 7–8      |
| P1       | Activity benchmarks need representative strata, uncertainty, randomized treatment order, isolated holdouts and compatible quota/harness conditions.                   | Task 11           |
| P1       | A benchmark win is insufficient for broad publication without an effect-safe canary or shadow observation and a revision-bound rollback route.                        | Task 11           |
| P1       | Prompt caches and lazy tool catalogs must pin client, policy, prompt/skill and catalog/schema digests; descriptor content remains untrusted.                          | Tasks 1, 6, 11    |
| P2       | Delayed bills, shared allocations, pricing drift and cross-currency comparisons need revision/as-of semantics rather than historical rewriting or guessed conversion. | Tasks 4, 7        |
| P2       | Efficiency work needs a bounded optimization proposal stating baseline, target driver, expected payback, quality floor, analysis cost and stop condition.             | Tasks 11–12       |
| Defer    | Fixed cache TTLs, automatic compaction, scheduled trace analysis and dynamic routing still lack local evidence.                                                       | Later changes     |
| Reject   | Driver counts, retrieval volume, Pareto membership or benchmark pass status must not become an opaque composite score or autonomous publication authority.            | None              |

### Feasibility-pass findings

The independent ranker accepted all forty answers: four ranked 5, twelve ranked 4,
nineteen ranked 3, four ranked 2 and one ranked 1. Seven overreaches were corrected
before plan application. The decisive questions were Q123, Q132, Q142 and Q160:
move live provider/runtime evidence before Task 2; rehearse fresh-host restore
before production registration; let an audited operator release one permanently
held resource without falsifying an unknown effect; and bound the scaling matrix's
approval, spend, elapsed time and regression subset.

The [plan-impact ledger](claude-feasibility-plan-impact.md) records an explicit
change, preservation, deferral or no-change result for every answer. The raw
[answer receipt](claude-feasibility-answer-receipt.json) and independent
[ranking receipt](claude-feasibility-ranking-receipt.json) retain the full
reasoning and corrected accepted text. These are design evidence, not runtime
proof or approval.

## Plan disposition

The P1/P2 findings and the ranked feasibility corrections were accepted into the
canonical plan after the grill:

- the glossary and control-plane design distinguish an efficiency breakdown from
  an activity benchmark;
- the ledger/spec/tasks require a reconciled cost-driver breakdown, required-context
  preflight and bounded polling outside model turns;
- the product and FE/MCP contracts expose live settled spend, holds, thresholds,
  headroom and coverage;
- Task 11 owns fixed-quality per-activity benchmarks, explicit non-dominated
  choices, authorized lazy tool loading, bounded compound effects and versioned
  papercut proposals; and
- `verify.md` records the planned production-path faults. None is an observed R5
  proof until implementation watches the named failure.

The second-pass P1/P2 findings were then accepted into the same boundaries:
diagnostics now distinguish complete/sampled/unavailable coverage and their own
overhead; shared charges, late bills, pricing drift and currencies keep explicit
allocation/as-of semantics; activity benchmarks carry strata, uncertainty,
randomized treatment order and worker-inaccessible holdouts; defaults require an
effect-safe canary or shadow route plus rollback thresholds; cached prefixes and
tool catalogs pin security-relevant digests; and optimization proposals carry
payback, quality, cost and stopping assumptions without publication authority.

## Independent review status

After explicit authorization, the Claude CLI reviewed both passes and their
hash-pinned canonical sources with `claude-fable-5-1` at `xhigh` effort. It ranked
all 120 questions from least to most useful. The 12 answers ranked 1 or 2 were
refined; the other 108 answers and all question text were left unchanged. The
[ranking and dispositions](claude-efficiency-question-ranking.md) record the
complete result and the review's digest-verification caveat.

## Review verdict

The current plan remains coherent and stronger than the article on authority,
durability, evidence provenance, and unknown-state handling. It is **not yet
runtime-verified**: the plan now explains outcome-cost drivers and requires
evidence-backed activity defaults, but none of those proposed mechanisms exists
yet. The corrections do not widen M1 into Uber-scale infrastructure.
