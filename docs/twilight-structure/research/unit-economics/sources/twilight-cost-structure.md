# Cost structure of one work request through the Twilight Structure factory (per-stage model attempts, human touchpoints, escalation, infra units, budgets, client model, provider assumptions)

## Summary

The docs define a 16-stage DAG (request → discovery → specification → planning → implementation → knowledge → review → verification → integration → staging → acceptance → acceptance-report → coverage → publication → handoff → release) in which only eight catalog activities call a model: discovery.research, discovery.review, specification.critique, planning.plan, implementation.implement, review.critic (count 1–2), review.judge, knowledge.reconcile, plus acceptance.cloud-browser (personal-delivery only) and the nightly dev-sweep 'exercise' agent on its own per-occurrence budget; everything else (scenario validation, repo gate, browser gate, integration compose, staging deploy, task-acceptance oracle, coverage join, publication CAS, dev-main converge, production deploy) is a registered tool with no model. Model attempts per accepted outcome are bounded by three profile numbers, not by a fixed count: rework.maxRounds (thorough 3 / balanced 2 / economy 1, counted across epochs and across the whole dependency closure), the escalation ladder (balanced: implement sonnet→opus-high, maxSteps 1; economy: haiku→sonnet-medium, maxSteps 1; thorough: none) and opt-in speculation (maxAttemptsPerDeliverable 2, off by default); every failed, escalated, reworked or losing attempt is charged to the same run budget account and stays in the numerator of cost per accepted outcome, which is unavailable (not zero) when nothing is accepted. Shipped strict caps are the only whole-run budgets: thorough 3M tokens/$100/12h agent time, balanced 1.5M/$40/6h, economy 500k/$12/2h with a 4h deadline; discovery is a 300k/$10/2h sub-allocation with a 2-day deadline; each nightly dev sweep gets its own 200k/$8/1h account; the production release command adds a release-only $20/2h sub-allocation that must be issued within 30 days of handoff. Human touchpoints per request are: submitting the request and choosing a profile/discovery envelope, one plan approval binding the execution envelope (the only required approval in either floor), a new decision only when a proposal leaves that envelope, intervention when rework rounds or the gate pause the closure, recovery-operator resolution of unknown effects, optional finding/dissent disposition and knowledge acceptance, and a separate single-use production release command; in-envelope scheduling, model choice and fan-out changes need no human, and human minutes are recorded explicitly, never inferred from waits. Infra per run is one immutable K3s Job (sandbox) per admitted attempt on a 1-server/≥2-agent-node pool (gVisor/Kata probed), repository capacity defaults of 2 agent slots, 1 secretary, 1 reviewer reserve, 1 build slot, 1 browser slot, 2 branch-dev slots, per-client ceiling 4, 30-minute aging, a mandatory non-zero secretary provider reserve, one Browserbase cloud-browser session per staging acceptance, a 10 GiB corpus ceiling and 365-day evidence retention. The client model is decided only at the ownership level: client-owned infrastructure operated and recovered by Dany under an explicit revocable-access agreement, with support hours, recovery targets, packaging, tenancy and what is actually sold explicitly deferred to a customer-phase change gated on a named design partner (A63). Provider assumptions are ACP adapters probing Claude first, then Codex, agy unverified; all shipped profile defaults are Anthropic models (claude-opus-5, claude-sonnet-5, claude-fable-5-1, claude-haiku-4-5-20251001) priced through an organization rate card with provider-billed cost reconciled beside the estimate, which presupposes metered API billing; nothing in the docs mentions subscriptions, open-weight or self-hosted models. INFERRED TOKEN-MULTIPLIER TABLE for one accepted medium feature (assume 3 deliverables, balanced profile, factory-core floor; personal-delivery adds one cloud-browser agent pass): request 0% (0 model attempts; human/secretary text) · discovery ~12% (1 research + 1 review critic + ≤2 rework iterations ≈ 2–4 attempts, capped by the 300k discovery sub-allowance) · specification ~8% (spec authoring inside the discovery envelope + 1 critique + ≤2 rework ≈ 1–3 attempts; scenarios tool 0) · planning ~5% (1 opus attempt; replan only on changed deps/budget) · implementation ~40% (per deliverable: 1 sonnet attempt + ≤1 opus escalation + ≤2 rework rounds ≈ 1.5–2 expected, 4 max; TDD test writing is inside this attempt; integration repair returns here) · knowledge ~4% (1 haiku attempt per deliverable, consumes no rework round) · review ~18% (per deliverable per round: 1 critic + 1 judge opus, ≤3 rounds ≈ 2–6 attempts; thorough doubles the critics) · verification 0% model (tool gate + Playwright; gate failure charges a new implement attempt) · integration ~3% (tools; only conflict repair spends model tokens via implementation) · staging/acceptance-report/coverage/publication/handoff/release 0% model · acceptance ~0% under factory-core (tool oracle) and ~8% under personal-delivery (1 cloud-browser agent pass per staging candidate, repeated on each moved main) · dev-sweep: outside the run, ≤200k tokens per night per active branch dev · speculation (opt-in): +1 full implementation attempt for the chosen deliverable, loser fully charged. Implied total: roughly 12–25 model attempts for the feature at balanced defaults, with a hard ceiling of 1.5M tokens/$40 before the run pauses; the same feature under thorough carries 2 critics, 3 rework rounds and a 3M/$100 cap, under economy 1 critic, no judge, no discovery review, 1 rework round and a 500k/$12 cap. All shares are my inference from the activity catalog and bounds; the docs state no measured per-stage distribution and say M1 must measure it before any recalibration.

## Facts

### 1. Ordered stage DAG of one work request

- value: request → discovery → specification → planning → implementation (deliverable scope) → knowledge → review → verification → integration (candidate scope) → staging → acceptance → acceptance-report → coverage → publication → handoff → release (16 stages)
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:25-41 (2026-09-08)
- note: `stages[].after` is the single stage DAG; implementation/knowledge/review/verification expand per deliverable, integration..publication join candidate members, handoff joins all required outcomes (design.md:121-124).

### 2. Which activities call a model (executor: agent) vs tools

- value: Agent: discovery.research, discovery.review, specification.critique, planning.plan, implementation.implement, review.critic, review.judge, acceptance.cloud-browser, knowledge.reconcile (9). Tool (no model): specification.scenarios, implementation.branch-dev, verification.gate, verification.browser, integration.compose, staging.deploy, acceptance.browser-report, acceptance.coverage, publication.main, handoff.dev-main, acceptance.evaluate, release.production (12)
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:48-201 (2026-09-08)
- note: Tool activities cannot carry model settings (design.md:575-576). The dev-sweep trigger workflow adds a separate agent activity `exercise` (class verify) outside the run (execution.yaml:555-582).

### 3. Per-attempt resource vector of each model activity

- value: discovery.research {agent:1}; discovery.review {agent:1, reviewer:1}; specification.critique {agent:1, reviewer:1}; planning.plan {agent:1}; implementation.implement {agent:1, workspace:1}; review.critic {agent:1, reviewer:1}; review.judge {agent:1, reviewer:1}; knowledge.reconcile {agent:1, workspace:1}; acceptance.cloud-browser {agent:1, browser:1}
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:49-169 (2026-09-08)
- note: Tool vectors: verification.gate {build:1, workspace:1}; verification.browser {browser:1, workspace:1}; integration.compose {build:1, workspace:1}; staging.deploy {build:1}; acceptance.evaluate {build:1, workspace:1}; release.production {build:1}.

### 4. Per-profile activity enablement and depth (TS-27 levers)

- value: thorough: discovery.review on, critic count 2, judge on, browser scope whole, rework 3, fanOut 2. balanced: discovery.review on, critic 1, judge on, browser affected, rework 2, fanOut 2. economy: discovery.review OFF, critic 1, judge OFF, browser raw false (floor forces on, affected), rework 1, fanOut 4
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:278-407 (2026-09-08)
- note: tasks.md:142-148 pins this matrix as a compiler test; every profile runs the full integrated gate with no depth control (execution.yaml:264-265).

### 5. Floor-required activities that no profile or override can remove (factory-core)

- value: specification.critique, specification.scenarios, knowledge.reconcile, verification.gate, verification.browser, integration.compose, acceptance.evaluate, acceptance.coverage; hook secrets-scan; approval beforeStage.implementation
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:422-440 (2026-09-08)
- note: Optional levers therefore are: discovery.review, review.critic count, review.judge, browser scope, model per class, escalation, fanOut, rework rounds, speculation (A47 assumptions.md:85).

### 6. personal-delivery floor adds mandatory deployment activities

- value: implementation.branch-dev, staging.deploy, acceptance.cloud-browser (agent), acceptance.browser-report, publication.main, handoff.dev-main, release.production; hook notify-operator; approvals: [] (none extra); commands: [release]; terminal stage release, accepted outcome release-observed-in-production
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:441-456 (2026-09-08)
- note: Selectable only after Task 13 registers every adapter (design.md:185-187). factory-core terminates at handoff (execution.yaml:426-427).

### 7. Rework rounds bound iterations for every activity, across profile epochs

- value: onRework.*: scope affected-dependency-closure, maxRounds from profile rework.maxRounds (3/2/1), exhausted → pause
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:219-222 (2026-09-08)
- note: Counts consumed rounds across epochs including zero (execution.yaml:269); exhaustion pauses the run with finding, consumed budget and next authorized action visible (design.md:524-527; spec.md control-plane:952-956). Discovery review iterations (TS-06) have no separate count; derived: they fall under the same onRework.* bound.

### 8. Critic finding severities that block

- value: onFinding.review.critic blockingSeverities: [critical, high]
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:217-218 (2026-09-08)
- note: Lower severities do not force rework.

### 9. Cross-review structure (TS-10): critics, judge, author separation, safety critics

- value: Critic count and judge enablement come from the resolved activity plan; authors never judge their own deliverable; dissent is kept; a safety critic is a critic with a safety rubric, not a separate authority; no shipped profile configures a safety critic (Task 11 adds specialist critics)
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:519-527 (2026-09-08)
- note: Specialist/safety critics arrive in Task 11 (tasks.md:1177-1179). Derived: M1 safety-agent model cost is zero beyond the configured critic count.

### 10. Knowledge reconciliation is one model pass per deliverable and consumes no rework round

- value: knowledge.reconcile (agent, class knowledge) runs after implementation and before review; 'Knowledge reconciliation itself does not consume a rework round'
- confidence: quoted
- source: openspec/changes/twilight-control-plane/tasks.md:904-909 (2026-09-08)
- note: Its edits are reviewed as ordinary inputs (design.md:125-127). Model: haiku under balanced/economy, sonnet under thorough.

### 11. Test writing is inside the implementation attempt, not a separate model activity

- value: implementation = 'Isolated execution, TDD, bounded fixes and frequent runnable branch-dev publication'; slices write the production-path negative, observe failure, implement, inject fault, restore
- confidence: derived
- source: docs/twilight-structure/sdlc-stages.md:50; openspec/changes/twilight-control-plane/tasks.md:64-68 (2026-09-08)
- note: No catalog activity named test-authoring exists; verification.gate and verification.browser are tools that only run tests.

### 12. Verification and browser verification are tool activities (no model tokens); gate failure pauses and returns to implementation

- value: verification.gate = registered:repository-gate (full repo gate: format:check --all, run-many test lint typecheck build, openspec validate); verification.browser = registered:browser-gate with scope whole/affected; onFailure.verification.gate → pause, scope affected-dependency-closure
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:108-123,223-225; openspec/changes/twilight-control-plane/tasks.md:17-18 (2026-09-08)
- note: Derived: repair of a gate failure is a new implementation attempt charged to the run (escalation trigger `gateFailure`).

### 13. Integration repair is bounded owner repair while independent candidates continue

- value: 'Failed or conflicting members enter bounded owner repair while independent candidates continue'; a moved base regenerates candidate, artifact, staging deployment and evidence
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:903-908 (2026-09-08)
- note: No separate numeric bound; derived: falls under rework.maxRounds via 'Rework to the owning activity within the limit' (sdlc-stages.md:52).

### 14. Cloud-browser acceptance is one agent-driven pass per staging candidate; a moved main forces a fresh pass

- value: acceptance.cloud-browser (agent + browser slot) under personal-delivery; 'an agent or operator may drive the procedure, but its prose cannot establish a pass'; 'A moved main restarts composition, building, staging and acceptance'
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:897-900,1010-1012 (2026-09-08)
- note: Disabled under factory-core (execution.yaml:265-266). Staging is 'immediate-never-coalesce' (execution.yaml:532).

### 15. Speculative attempts are opt-in, bounded to 2 per deliverable, losers fully charged

- value: execution.speculation: { defaultEnabled: false, maxAttemptsPerDeliverable: 2 }; 'Losers are fenced and drained with all cost retained'
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:490; openspec/changes/twilight-control-plane/design.md:919-924 (2026-09-08)
- note: First passing independent evaluation selects; first response cannot (spec.md control-plane:1047-1062). Grill Q39 keeps it disabled until a fixture proves the trade-off.

### 16. Discovery Q&A does not create a human pause per question under delegated authority

- value: 'A run therefore records assumptions and continues instead of creating an unanswered inbox card at every question. That delegation cannot authorize a later production command.'
- confidence: quoted
- source: docs/twilight-structure/product-experience.md:169-173 (2026-09-08)
- note: TS-05 asks questions and records recommended answers as assumptions (spec.md:37). Number of Q&A iterations is unbounded by the docs; discovery is bounded only by its envelope allowance/deadline.

### 17. Human touchpoint 1: request submission with profile and discovery envelope

- value: Person (Dany or via OpenClaw secretary) chooses repository, describes outcome, picks delivery profile; request selects a displayed budgeted discovery envelope; null envelope = manual authoring only
- confidence: quoted
- source: docs/twilight-structure/product-experience.md:9-12; docs/twilight-structure/assumptions.md:43 (A29); openspec/changes/twilight-control-plane/design.md:268-271 (2026-09-08)
- note: Conversational wording via the assistant cannot widen an execution envelope (A62, assumptions.md:207).

### 18. Human touchpoint 2: one plan approval binding the execution envelope, before implementation

- value: policy beforeStage.implementation: approval { required: true, decidedBy: human, subject: execution-envelope }; 'One human decision approves the specified plan and bounded execution envelope'
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:210-211; docs/twilight-structure/assumptions.md:17 (A03) (2026-09-08)
- note: Only approval listed in factory-core (execution.yaml:438) and personal-delivery adds none (line 454). Decision via single-use browser-minted decision token (design.md:315-329).

### 19. Human touchpoint 3: a new decision only when a proposal leaves the envelope; in-envelope changes need none

- value: 'Increasing a hard ceiling, changing scope or quality, or leaving permitted lineage MUST require a new decision'; raising fan-out / picking a permitted model within the envelope 'is admitted without another human decision'
- confidence: quoted
- source: openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md:361-363,387-392 (2026-09-08)
- note: Stale approval after plan change is rejected and must be re-decided (assumptions.md:101-102; spec 375-379).

### 20. Human touchpoint 4: pause on rework exhaustion or gate failure requires an authorized next action

- value: Exhausting rounds 'pauses the run with the finding, consumed budget and next authorized action visible'; hard-cap exhaustion 'pauses new work rather than turning an unresolved run into success'
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:524-527; docs/twilight-structure/product-experience.md:187-189 (2026-09-08)
- note: Run view lets the person pause/resume/cancel/retry/skip a non-floor activity/change profile (product-experience.md:22).

### 21. Human touchpoint 5: unknown effect outcomes need a recovery-operator resolution

- value: resolve_effect needs recovery-operator capability and one of confirm_succeeded / confirm_not_applied / abandon_unknown; ordinary resume cannot bypass it
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:491-496 (2026-09-08)
- note: Recovery inbox surface (design.md:302).

### 22. Human touchpoint 6: findings disposition and disagreement resolution (optional, review inbox)

- value: Review inbox: 'Decide an approval, assign/dispose findings, inspect disagreements'; critic disagreement → record both, judge against rubric, retain unresolved mandatory findings, stop on the review limit
- confidence: quoted
- source: docs/twilight-structure/product-experience.md:27; docs/twilight-structure/assumptions.md:106-108 (2026-09-08)
- note: Majority voting cannot override a denied capability; judges hold no decision authority (CONTEXT.md:174-177).

### 23. Human touchpoint 7: production release is a separate explicit single-use command with its own envelope and 30-day window

- value: releaseEnvelope: decidedBy human, activity release.production, same-run account, chargeScope release-delivery-only, limits money $20, deadline PT2H, decisionDeadlineAfterHandoff P30D
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:546-553 (2026-09-08)
- note: Without a command within 30 days the coordinator records a terminal `release-window-expired` non-accepted outcome (design.md:625-627; A68). Publication to main is automatic after staging acceptance (design.md:1010-1011).

### 24. Human touchpoints outside the run: trigger-envelope and evaluation publication

- value: dev-sweep trigger envelope decidedBy human (once, recurring authority); changing `quality` needs evaluation-publisher capability plus a subject-bound human decision
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:536-542; openspec/changes/twilight-control-plane/design.md:761-763 (2026-09-08)
- note: Knowledge workspace also lets a person accept a knowledge proposal / resolve a contradiction (product-experience.md:26), optional.

### 25. Human effort is an explicit ledger quantity, never inferred from approval waiting

- value: 'Human minutes: Explicit measured effort, never inferred from approval waiting'; queue/human wait are interval unions never summed into wall elapsed
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:645-655 (2026-09-08)
- note: Under moneyScope delivery, human costs need defensible bounds and per-human-minute rates (design.md:727-729).

### 26. Escalation ladder definition and triggers

- value: 'The bounded sequence of models an activity class moves through when an attempt ends in refusal, gate failure or a blocking finding'; balanced: implement → claude-opus-5 effort high on [refusal, gateFailure, blockingFinding], maxSteps 1; economy: implement → claude-sonnet-5 effort medium on [refusal, gateFailure], maxSteps 1; thorough: none
- confidence: quoted
- source: docs/twilight-structure/CONTEXT.md:272-275; openspec/schemas/twilight-v1/execution.yaml:289,329-333,373-377 (2026-09-08)
- note: Only the implement class has a ladder in shipped profiles; 'Escalation is the selected bounded ladder, never an implicit provider fallback' (design.md:562-563). Task 11 adds multi-step ladders and per-activity routing (tasks.md:1179-1180).

### 27. Class-level model routing per profile (which classes use cheaper models)

- value: thorough: research/plan/implement opus-5 (implement effort high), review/judge fable-5-1, verify/knowledge sonnet-5. balanced: research sonnet-5, plan opus-5, implement sonnet-5 medium, review/judge opus-5, verify sonnet-5, knowledge haiku-4-5. economy: research haiku, plan sonnet, implement haiku low, review/judge/verify sonnet, knowledge haiku
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:281-288,321-328,365-372 (2026-09-08)
- note: 'better' and 'cheaper' are observed outcomes, not a built-in ordering of model names (spec.md:83-86; design.md:561-562).

### 28. Failed attempts are charged to the accepted outcome (no erasure on escalation)

- value: 'Attempt cost follows its epoch; a economy implementation recovered under thorough is a mixed outcome… Request cost includes unsuccessful runs. Cost per accepted outcome includes their cost in the numerator; no accepted outcome gives an unavailable ratio, not zero.'
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:744-748 (2026-09-08)
- note: Grill Q20: 'Does escalation erase the cost of the failed cheaper attempt? No.' (uber-efficiency-grill.md:152-155). Each retry is a new attempt with its own measured usage on the same account (tasks.md:769-773).

### 29. One budget account per run shared by discovery, retries, escalations, children, rework, drain

- value: available = hard cap − settled consumption − outstanding holds; unknown consumption retains its hold; admission holds a conservative per-attempt allowance
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:600-616 (2026-09-08)
- note: Worked example: cap $12→$40 with $10 settled, $1 held → $29 available; cap below $11 refused (design.md:610-612).

### 30. Shipped strict run budgets per profile

- value: thorough: 3,000,000 tokens / $100 USD / agentTime PT12H, deadline null. balanced: 1,500,000 / $40 / PT6H, deadline null. economy: 500,000 / $12 / PT2H, deadline PT4H. All scope run, moneyScope model, enforcement strict
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:314-319,358-363,402-407 (2026-09-08)
- note: 'Proposed starting values, not measurements (A45)' (execution.yaml:260). moneyScope model excludes tool/service/human charges.

### 31. Discovery envelope allowance (pre-plan spend)

- value: tokens 300,000 / $10 USD / agentTime PT2H, deadline P2D; writePaths openspec/changes/**, docs/**; readOnlyCode true; providers [anthropic]
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:459-466 (2026-09-08)
- note: A sub-allocation of the run account, never a second allowance (design.md:600-603); covers research and artifact (intent/spec) authoring per A29.

### 32. Nightly dev-sweep per-occurrence budget

- value: profile balanced, moneyScope model, allowance 200,000 tokens / $8 USD / PT1H, deadline PT2H; cadence P1D on dev-main and every active branch dev; unchanged revisions coalesce
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:526-542 (2026-09-08)
- note: Each occurrence charges a fresh per-occurrence account outside the delivery run (design.md:155-157). Derived: a feature living N nights on a branch dev adds up to N×200k tokens of sweep spend not on its run account.

### 33. Advisory budgets still require finite hard caps; warning thresholds are operator choice

- value: 'an $8 advisory money target inside a $12 hard cap warns after $8 and stops new spend at $12'; no starting profile ships intermediate thresholds
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:629-639; docs/twilight-structure/evidence/uber-efficiency-grill.md:359-365 (2026-09-08)
- note: Grill Q52 rejects Uber's fixed 50/80/100% nudges as defaults.

### 34. Planning stage must output estimates in ledger units and stop limits (TS-09)

- value: planning output: 'Ordered testable slices, interfaces, proof oracles, estimates in ledger units and stop limits'; TS-09: plan agent token usage and elapsed time, including where parallel work adds more cost than value
- confidence: quoted
- source: docs/twilight-structure/sdlc-stages.md:49; docs/twilight-structure/spec.md:41 (2026-09-08)
- note: Ledger units (A12): human minutes, additive agent time, run elapsed, queue/human-wait intervals, input/output tokens, currency, slots, provider rates, build/browser slots (assumptions.md:26). No implicit token↔workday conversion (design.md:953-957).

### 35. Plan-level token/time estimates for building the factory itself (tasks.md, not per work request)

- value: T1 120k–360k tokens, 8–16 human h, 2–5 agent h; T2 90k–220k; T3 220k–560k; T4 200k–560k (+4.4–4.5 200k–500k); T5 280k–860k; T6 320k–900k + live provider/VPS spend; T7 150k–420k (+7.3–7.4 300k–800k); T8 300k–840k excl. benchmark spend; T11 0.4M–1.0M; T12 0.25M–0.65M; T13 48–96 human h; T15 0.4M–1.0M; T16 0.5M–1.2M
- confidence: quoted
- source: openspec/changes/twilight-control-plane/tasks.md:193,256,384,519,543,645,778,880,913,1005,1251,1275,1351,1423,1451 (2026-09-08)
- note: 'All numerical effort/capacity values below are planning estimates, not measured performance or spending authority' (tasks.md:12-13). Useful as the only order-of-magnitude token figures per slice in the repo.

### 36. Coordinator load acceptance budget

- value: sessions 64, effectsPerSecond 100, duration PT10M, p95DispatchMs 100
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:502 (2026-09-08)
- note: Proved by Task 4.5 through dispatchEffect on an identified host (tasks.md:547-555).

### 37. Fixed-quality scaling acceptance matrix

- value: workers [1,2,4,8], repetitions 5, workloads [independent, decomposable, contended-recovery]; minimumIndependentSpeedup at4: 2, at8: 3; minimumDecomposableSpeedup at4: 1.5; authorizedControls fanOut 8, perClientCeiling 8, agentSlotsCeiling 8
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:492-501 (2026-09-08)
- note: Speedup = median accepted throughput / one-worker median; total attributed cost incl. losers reported (tasks.md:1024-1047). Proposed budgets, not performance claims.

### 38. Planning-storage p95 acceptance budgets (Task 9)

- value: p95 command-to-accepted-ref ≤1 s single edits, ≤3 s batches; complete-plan read ≤500 ms warm / ≤2 s cold; typed conflict p95 ≤1 s; visibility to WBS clients ≤2 s p95; restart reconciliation ≤30 s; ≥2 accepted commands/s; ≥95% within 3 s p95 at 8 writers; scale 20 plans / 10,000 active / 10,000 archived tasks / 100,000 records
- confidence: quoted
- source: docs/twilight-structure/client-repositories.md:182-217 (2026-09-06)
- note: 'Proposed acceptance budgets, not measurements'. Relevant to planning-backend cost, not per-request model cost.

### 39. Knowledge benchmark targets

- value: 20 questions, correctness 0.9, traceability 1.0, effort recorded; retrieval provider indexes-and-rg
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:585-588 (2026-09-08)
- note: Full-text/embeddings only if the measured baseline misses targets (tasks.md:1271-1273).

### 40. Scheduled trigger retry bound

- value: onTrigger.*: retries { max: 2, backoff: PT5M }, overlap skip, missed skip
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:228-233 (2026-09-08)
- note: Applies to schedule-kind triggers (dev sweeps).

### 41. Repository capacity defaults (infra units per run)

- value: agentSlots 2, secretarySlots 1, branchDevEnvironmentSlots 2, secretaryProviderReserve required (non-zero), workspaceWritersPerLineage 1, reviewerReserve 1, buildSlots 1, browserSlots 1; queue priority critical-path, selection feasible-ready, aging PT30M, perClientCeiling 4
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:469-481 (2026-09-08)
- note: Organization pools sit above and may bind lower; repository cannot create capacity authority (design.md:144-147).

### 42. Organization capacity pools declared in the snapshot

- value: agent, secretary, workspace, reviewer, build, browser, branchDevEnvironment (7 pools); repository gate reserves build+workspace, browser verification reserves browser+workspace, cloud-browser agent additionally reserves an agent slot
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:139-147 (2026-09-08)
- note: Admission reserves the whole vector atomically before launch; starting counts as occupied (design.md:533-536).

### 43. Secretary/interactive provider reserve

- value: OpenClaw secretary admitted through a dedicated `secretary` pool and a provider-specific interactive reserve; worker admission consumes only provider capacity above that reserve; zero reserve makes the availability claim unavailable
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:842-849 (2026-09-08)
- note: A53: no latency SLO until measured under saturation (assumptions.md:198).

### 44. K3s worker pool topology for M1

- value: One dedicated K3s server that schedules no attempt Pods + at least two K3s agent nodes; h3mon outside as monitoring; h4claw runs OpenClaw, control services and app deployment (not a worker); manual join/drain; VPS auto-provisioning is later Terragrunt scope
- confidence: quoted
- source: docs/adr/0016-k3s-schedules-the-expandable-worker-pool.md:5-9; docs/twilight-structure/assumptions.md:96-97 (A49-A50) (2026-09-06)
- note: Costs named: operating a control plane, Pod security, networking, image distribution, storage, telemetry, upgrades, cleanup (worker-pools.md:47-51).

### 45. One sandbox (Kubernetes Job) per admitted attempt with resource bounds and no privileges

- value: 'The K3s adapter creates one immutable-digest Job per admitted attempt'; request carries CPU, memory, ephemeral-storage and deadline bounds, workspace identity, network profile, credential-mount reference; no K8s API token, Docker socket, host path, privileged mode
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:378-389 (2026-09-08)
- note: Runtime class: probe gVisor first, Kata second; default runc alone does not satisfy the hostile-code claim (tasks.md:728-731). Build goes to a separately registered Dagger executor (design.md:387-388).

### 46. Cloud browser provider and slot usage

- value: Browserbase is the first Task 13 cloud-browser candidate (remote CDP sessions; docs warn about Playwright inside Bun); local-browser success cannot satisfy the cloud stage; browserSlots 1 per repo
- confidence: quoted
- source: docs/twilight-structure/assumptions.md:53 (A32); openspec/schemas/twilight-v1/execution.yaml:480 (2026-09-08)
- note: Session ID, served source identity, recording/export retention and teardown must be recorded (tasks.md:1311-1315). Cloud-browser costs are service charges outside moneyScope model.

### 47. Environments per repository in the personal phase

- value: One dev-main, one production, one serialized staging, one branch dev per active branch within capacity (A57); two branch-dev slots requested (A67); branch devs sleep/resume explicitly, no auto-delete (A58)
- confidence: quoted
- source: docs/twilight-structure/assumptions.md:202-204,212 (2026-09-08)
- note: Staging shares production's immutable image, deploy/migration/recovery path, topology class, routing/auth and health checks (A60).

### 48. Storage/retention ceilings

- value: searchableCorpusBytes 10 GiB (10737418240) with no age expiry; operational evidence retained P365D after terminal transition; organizationPolicy null until published
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:517-522; docs/twilight-structure/assumptions.md:31,211 (A17, A66) (2026-09-08)
- note: Warn and offer export before any deletion.

### 49. Non-model cost categories and units the ledger must price

- value: Organization snapshots supply non-model rates as {category, service, unit, price, effectiveFrom}; supported units: per request, service minute, human minute; or a binding maximum quote with expiry
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:724-731 (2026-09-08)
- note: Under moneyScope delivery every category needs a defensible bound; missing categories keep total cost unavailable, never zero (A46).

### 50. Efficiency breakdown drivers the ledger must reconcile (per accepted outcome)

- value: request count, run count, activity attempts, model turns, input/output/cache-read/cache-write tokens, activity-scoped tool-definition tokens/bytes, failed context lookups, adapter polling cycles, pinned rates
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:675-687 (2026-09-08)
- note: Counts are cost drivers, never accepted outcomes. Grill P1 finding accepted (uber-efficiency-grill.md:816,840-846). Tool-definition tokens are a subset of input tokens.

### 51. Agent time vs wall-clock accounting example

- value: 'Four concurrent 30-minute agent sessions consume 120 agent-minutes and about 30 wall-minutes'
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:653-655 (2026-09-08)
- note: agentTime includes provider/tool wait while occupied; excludes pre-launch queue and human-only pauses (design.md:647).

### 52. Client installation model (TS-29)

- value: First iteration operated and primarily used by Dany; future installations run on client-owned infrastructure maintained by Dany under an explicit agreement with revocable access and defined support and recovery terms
- confidence: quoted
- source: docs/twilight-structure/spec.md:61 (2026-09-08)
- note: CONTEXT.md:356-359 names the 'Installation operator' as the party maintaining/restoring an installation on the owner's behalf.

### 53. Support hours and recovery targets are undecided

- value: 'Support access is revocable and support hours must be defined before offering the service; no hours or recovery targets have been selected yet.'
- confidence: quoted
- source: docs/twilight-structure/discovery.md:41-47 (2026-09-06)
- note: Accepted in the 2026-09-06 infrastructure interview.

### 54. Distribution topology: central or dedicated per-client installation

- value: 'A central Twilight installation can coordinate several authorized repos; source, planning, credentials, and context permissions remain scoped to each client. A dedicated per-client installation uses the same contracts.'
- confidence: quoted
- source: docs/twilight-structure/client-repositories.md:10-13 (2026-09-06)
- note: Each client gets an Nx monorepo (TS-23); puni-00 is the first consumer (TS-25).

### 55. What is sold, tenancy, packaging and service commitments are explicitly deferred to the customer phase

- value: A63 (importance 95): 'Do not invent one. Phase 2 begins with a named design partner/problem and an explicit discovery decision before customer-specific packaging, tenancy, support or recovery work is accepted'; Customer phase 'determine[s] tenancy, packaging, support, recovery and service commitments. This plan does not invent them.'
- confidence: quoted
- source: docs/twilight-structure/assumptions.md:208; openspec/changes/twilight-control-plane/tasks.md:29 (2026-09-08)
- note: A02: v1 is one operator + invited collaborators, not a public multi-tenant platform. The docs never state whether accepted outcomes, capacity or a subscription is the sales unit.

### 56. Rate card is the organization's internal price list for provider usage, not a client price list

- value: 'The organization's versioned prices for measured provider usage, with effective dates and explicit charge categories'; 'the repository publishes no prices'
- confidence: quoted
- source: docs/twilight-structure/CONTEXT.md:277-280; docs/twilight-structure/assumptions.md:84 (A46) (2026-09-08)
- note: Levers view lets a privileged user 'publish the rate card' (product-experience.md:25).

### 57. Providers and adapters assumed (TS-03, A09, Task 6)

- value: ACP first for Codex, Claude and agy sessions; ACP adapter for one verified provider first; 'Probe Claude first, then Codex if its required capabilities fail; if both fail, stop'; agy unavailable until its own adapter passes; Gemini CLI is not a substitute for agy
- confidence: quoted
- source: docs/twilight-structure/spec.md:35; docs/twilight-structure/assumptions.md:23; openspec/changes/twilight-control-plane/tasks.md:678-682; docs/twilight-structure/research/initial-inspection.md:15-19 (2026-09-08)
- note: ACP capabilities are per adapter (session load/resume, cancellation, permission interception, usage signals) (design.md:528-531).

### 58. All shipped profile model defaults are Anthropic

- value: claude-opus-5, claude-sonnet-5, claude-fable-5-1, claude-haiku-4-5-20251001; discoveryEnvelopes.default.providers: [anthropic]
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:281-288,321-328,365-372,463 (2026-09-08)
- note: Model names are capability-checked choices; enabled models need rate-card prices for hard money caps (execution.yaml:260-262).

### 59. Billing model presupposed: provider-metered usage priced by rate card with provider-billed cost reconciled

- value: 'estimatedCost is tokens times the rate-card entry pinned at admission… billedCost is the provider's reported figure'; UsageObservation carries input/output/cacheRead/cacheWrite tokens
- confidence: derived
- source: openspec/changes/twilight-control-plane/design.md:257-276 (2026-09-08)
- note: Docs never say 'API key' or 'subscription'. A34 mentions not copying 'Claude/Codex login state' into client repos (assumptions.md:55), so CLI-style credentials exist, but their commercial form is unstated.

### 60. Worker credentials are scoped, ephemeral, per repo/provider

- value: 'Worker provider credentials are repo/provider-scoped integration secrets resolved by the trusted launcher into an ephemeral read-only credential mount; never use a shared operator home. Destroy the mount after observed exit'
- confidence: quoted
- source: docs/twilight-structure/assumptions.md:55 (A34) (2026-09-08)
- note: Implies one credential identity per client repo × provider; unsupported scoped credentials require dedicated integration identities or refusal.

### 61. Open-weight or self-hosted models

- value: Not mentioned anywhere
- confidence: not_found
- source: docs/twilight-structure/, docs/adr/, openspec/changes/twilight-control-plane/, openspec/schemas/twilight-v1/execution.yaml (grep for ollama|llama|mistral|open-weight|self-host|gemini|openai|gpt) (2026-09-08)
- note: 'self-hosted' occurs only for the bare Git planning remote (client-repositories.md:54,152). Gemini appears only as an ACP directory entry not to be substituted for agy.

### 62. Prompt-cache TTL and compaction settings are deliberately unselected

- value: Grill Q30/Q81/Q85: do not import Uber's 400k-token or one-hour settings; keep TTL unselected until Twilight measures gap distribution, cache-write premium and read savings; compaction benchmarked per activity later
- confidence: quoted
- source: docs/twilight-structure/evidence/uber-efficiency-grill.md:219-224,555-559,580-584 (2026-09-08)
- note: Cache-read/cache-write are distinct ledger categories (design.md:257-265), so a cost model should carry them as separate multipliers with no default values.

### 63. Tool-schema, polling and failed-lookup overhead must be measured but not optimized in M1

- value: 'M1 measures these costs but does not require lazy tool loading, a universal CLI projection or automatic prompt tuning'; adapters keep polling outside model turns
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:700-706 (2026-09-08)
- note: Grill P2 finding (uber-efficiency-grill.md:819); Task 11 later adds lazy tool loading and compound effects (tasks.md:1202-1213).

### 64. No numerical savings targets or default profile may be set from M1 evidence

- value: 'Twilight must establish its own baselines before setting numerical savings targets' (Reject Uber's 34%/52%); 'Two runs prove plumbing, not superiority'; Task 8's two profile runs 'do not select a default profile'
- confidence: quoted
- source: docs/twilight-structure/evidence/uber-efficiency-grill.md:54-58,344-348; openspec/changes/twilight-control-plane/tasks.md:977-978 (2026-09-08)
- note: Activity benchmarks (Task 11) need declared strata, positive real-work sample minimum, sealed holdout and Pareto record before any default change.

### 65. Optimization work itself is a bounded charged activity with a payback statement

- value: Optimization proposal names baseline, target driver, expected payback, quality floor, analysis/rollout cost and stop condition; analysis consumes a bounded charged allowance
- confidence: quoted
- source: openspec/changes/twilight-control-plane/design.md:804-810; docs/twilight-structure/evidence/uber-efficiency-grill.md:744-749 (2026-09-08)
- note: Grill Q10/Q40/Q111 strengthen findings; relevant if the cost model includes factory self-improvement overhead.

### 66. Mandatory hooks per run (non-model cost)

- value: secrets-scan: registered:tool-secrets at afterActivity.implementation.implement and afterActivity.verification.gate, mandatory, 60 s timeout, deny on timeout; notify-operator: optional, 10 s, degrade
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:240-258 (2026-09-08)
- note: Both are registered implementations, not model calls.

### 67. Independent task-acceptance oracle is mandatory and charged to the run

- value: acceptance.evaluate (registered:task-acceptance) and acceptance.coverage 'charge the run account before candidate acceptance completes'; disabling is refused; missing assertions block as unavailable
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:594-597; docs/twilight-structure/product-experience.md:223-227 (2026-09-08)
- note: Tool activity with build+workspace slots; consumes visible tool resources, not model tokens.

### 68. Escaped-defect window that keeps outcome quality immature

- value: escapedDefectWindow P30D; 'Defect quality stays immature until its window closes'
- confidence: quoted
- source: openspec/schemas/twilight-v1/execution.yaml:608; docs/twilight-structure/product-experience.md:216-217 (2026-09-08)
- note: A cost-per-accepted-outcome comparison is rankable only after the 30-day window matures.

### 69. Personal-phase delivery route and acceptance path per candidate

- value: integration composition → staging deployment → automated and interactively driven tool-verified acceptance → compare-and-swap main publication → dev-main convergence → explicit production promotion; main movement restarts composition, build, staging and evidence
- confidence: quoted
- source: openspec/changes/twilight-control-plane/tasks.md:1317-1322 (2026-09-08)
- note: Staging is serialized (one environment), so candidates queue; A57 revisit condition is measured staging contention.

### 70. Inferred stage-by-stage token multiplier for one accepted medium feature (balanced, 3 deliverables)

- value: request 0% (0 attempts) · discovery ~12% (2–4) · specification ~8% (1–3) · planning ~5% (1) · implementation ~40% (1.5–2 expected, 4 max per deliverable) · knowledge ~4% (1 per deliverable) · review ~18% (2–6 per deliverable) · verification 0% model · integration ~3% (repair only) · staging/report/coverage/publication/handoff/release 0% · acceptance 0% factory-core / ~8% personal-delivery (1 cloud-browser agent pass per candidate) · dev-sweep ≤200k tokens/night outside the run · speculation +1 implementation attempt if enabled; total ≈12–25 attempts under a 1.5M-token/$40 cap
- confidence: estimated
- source: openspec/schemas/twilight-v1/execution.yaml:48-201,320-363; openspec/changes/twilight-control-plane/design.md:519-527,919-924 (2026-09-08)
- note: My inference from the activity catalog, rework/escalation/speculation bounds and model classes; the docs contain no measured per-stage token distribution and require M1 ledgers before any calibration (tasks.md:1046-1047).

## Not found

- Whether client access to the factory is sold per accepted outcome, per capacity/seat, or as a subscription — the docs define cost per accepted outcome as a measurement, never as a billing unit, and defer packaging to the A63-gated customer phase
- Support hours, recovery targets (RTO/RPO) or maintenance fees for client installations — explicitly 'not selected yet' (discovery.md:41-47)
- Whether provider access uses API keys or consumer/CLI subscriptions — docs only mention 'Claude/Codex login state' (A34) and provider-billed cost reconciliation; no commercial form is stated
- Any mention of open-weight, local or self-hosted LLMs (Ollama, Llama, Mistral, etc.)
- Actual per-token prices or a populated organization rate card — the repository publishes no prices (A46)
- A numeric bound on discovery Q&A iterations or on the number of discovery-review rounds beyond the generic rework.maxRounds
- A numeric bound on integration owner-repair rounds separate from rework.maxRounds
- Measured per-stage token shares, attempts per stage, or any measured cost per accepted outcome — all figures in the repo are proposed budgets or planning estimates; tasks.md says M1 duration and costs remain unmeasured until ledgers exist
- Per-attempt CPU/memory/ephemeral-storage/deadline numbers for K3s Jobs — the design names the bounds but no values
- Cloud-browser (Browserbase) session pricing or number of sessions per acceptance beyond the single browser slot
- Human-minute rates or an example of a delivery-scope (tool+service+human) budget with concrete non-model prices
- Prompt-cache TTL, compaction thresholds, or cache hit-rate assumptions — deliberately unselected per the efficiency grill
