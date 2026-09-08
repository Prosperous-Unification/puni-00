# harness-cost-structure

## Overall

All 68 claims confirmed against the cited files; every quoted number, model name, resource vector, cap, allowance and policy value is present at or within a few lines of the cited location (the only offsets: 'tool activities cannot carry model settings' is design.md:571-573 not 575-576; product-experience 'Exhaustion pauses new work' is 186-187 not 187-189). Nothing refuted, nothing unverifiable. The researcher's not_found list holds up on a repo-wide search: 'self-hosted' appears only for Git remotes (A31), 'OAuth' only for MCP servers, and no subscription/API-key, Browserbase pricing, populated rate card, per-attempt K3s resource numbers, human-minute rates or measured per-stage shares exist. Material misses for a cost model: the plan-review M1 aggregate (72–148 h / 1.19M–3.46M tokens + 30% reserve, a dated snapshot now below the tasks.md line-item sum of 1.68M–4.72M for Tasks 1–8), that M1 measures only balanced and economy, the dev-sweep agent's model (sonnet-5), and the deadline/agentTime clock semantics that make economy's 4h include human wait. The percentage table in the researcher summary is explicitly inferred and has no source to check.

## Checks

### 1. Ordered stage DAG of one work request

- verdict: confirmed
- original: request → discovery → specification → planning → implementation (deliverable) → knowledge → review → verification → integration (candidate) → staging → acceptance → acceptance-report → coverage → publication → handoff → release (16 stages)
- corrected: same; 16 stage entries, `after` chain exactly as listed; release also requires its separate explicit human command (line 24, 41)
- evidence: openspec/schemas/twilight-v1/execution.yaml:25-41
- note: Scopes confirmed: implementation/knowledge/review/verification scope deliverable; integration..publication scope candidate; handoff joins all required accepted outcomes (lines 21-23; design.md:121-123).

### 2. Which activities call a model (executor: agent) vs tools

- verdict: confirmed
- original: 9 agent activities (discovery.research, discovery.review, specification.critique, planning.plan, implementation.implement, review.critic, review.judge, acceptance.cloud-browser, knowledge.reconcile); 12 tool activities
- corrected: same; 21 catalog entries, 9 executor: agent, 12 executor: tool with registered:* implementations
- evidence: openspec/schemas/twilight-v1/execution.yaml:48-201
- note: 'tool activities cannot carry model settings' is at design.md:571-573, not 575-576. Dev-sweep `exercise` agent activity is at execution.yaml:568-574 (class verify, resources {agent:1, browser:1}).

### 3. Per-attempt resource vector of each model activity

- verdict: confirmed
- original: discovery.research {agent:1}; discovery.review {agent:1, reviewer:1}; specification.critique {agent:1, reviewer:1}; planning.plan {agent:1}; implementation.implement {agent:1, workspace:1}; review.critic {agent:1, reviewer:1}; review.judge {agent:1, reviewer:1}; knowledge.reconcile {agent:1, workspace:1}; acceptance.cloud-browser {agent:1, browser:1}
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:49-169
- note: Tool vectors in the note also confirmed: verification.gate {build:1, workspace:1} (114), verification.browser {browser:1, workspace:1} (122), integration.compose {build:1, workspace:1} (130), staging.deploy {build:1} (138), acceptance.evaluate {build:1, workspace:1} (192), release.production {build:1} (200). acceptance.browser-report and handoff.dev-main reserve {} (153, 184).

### 4. Per-profile activity enablement and depth (TS-27 levers)

- verdict: confirmed
- original: thorough: discovery.review on, critic 2, judge on, browser whole, rework 3, fanOut 2. balanced: discovery.review on, critic 1, judge on, browser affected, rework 2, fanOut 2. economy: discovery.review OFF, critic 1, judge OFF, browser raw false (floor forces on, affected), rework 1, fanOut 4
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:290-313,334-357,378-401
- note: tasks.md:143-148 pins the same matrix including economy's raw browser false resolved enabled with floor origin. execution.yaml:264-265 'verification.gate always runs the full repo gate'.

### 5. Floor-required activities that no profile or override can remove (factory-core)

- verdict: confirmed
- original: specification.critique, specification.scenarios, knowledge.reconcile, verification.gate, verification.browser, integration.compose, acceptance.evaluate, acceptance.coverage; hook secrets-scan; approval beforeStage.implementation
- corrected: same; also commands: [], evidence: [redaction, run-ledger], terminalStage handoff, acceptedOutcome candidate-accepted-at-handoff
- evidence: openspec/schemas/twilight-v1/execution.yaml:425-440
- note: A47 (assumptions.md:85) lists the same set in prose.

### 6. personal-delivery floor adds mandatory deployment activities

- verdict: confirmed
- original: implementation.branch-dev, staging.deploy, acceptance.cloud-browser, acceptance.browser-report, publication.main, handoff.dev-main, release.production; hook notify-operator; approvals: []; commands: [release]; terminal stage release; accepted outcome release-observed-in-production
- corrected: same; extends: factory-core; evidence [served-source-identity, branch-dev-observation]
- evidence: openspec/schemas/twilight-v1/execution.yaml:441-456
- note: design.md:184-185 confirms Task 13 must register every additional adapter before selection.

### 7. Rework rounds bound iterations for every activity, across profile epochs

- verdict: confirmed
- original: onRework.*: scope affected-dependency-closure, maxRounds from profile rework.maxRounds (3/2/1), exhausted → pause
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:219-222
- note: Line 269: 'rework.maxRounds counts consumed rounds across profile epochs, including zero'. Pause-with-finding/budget/next-action at design.md:525-526 and spec.md:952-956. No separate discovery-review iteration count exists (spec.md:38 TS-06 only says 'with iterations').

### 8. Critic finding severities that block

- verdict: confirmed
- original: onFinding.review.critic blockingSeverities: [critical, high]
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:217-218
- note:

### 9. Cross-review structure (TS-10): critics, judge, author separation, safety critics

- verdict: confirmed
- original: Critic count and judge enablement from the resolved activity plan; authors never judge their own deliverable; dissent kept; safety critic is a critic with a safety rubric; no shipped profile configures a safety critic (Task 11 adds specialist critics)
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:519-526
- note: tasks.md:1177 'Add specialist critics (including safety critics)' under Task 11. No profile in execution.yaml names a safety critic; review.critic is the only critic activity.

### 10. Knowledge reconciliation is one model pass per deliverable and consumes no rework round

- verdict: confirmed
- original: knowledge.reconcile runs after implementation and before review; 'Knowledge reconciliation itself does not consume a rework round'
- corrected: same
- evidence: openspec/changes/twilight-control-plane/tasks.md:907-909
- note: design.md:125-127 confirms ordering. Models: haiku-4-5 under balanced (328) and economy (372), sonnet-5 under thorough (288).

### 11. Test writing is inside the implementation attempt, not a separate model activity

- verdict: confirmed
- original: implementation = 'Isolated execution, TDD, bounded fixes and frequent runnable branch-dev publication'; slices write the negative, observe failure, implement, inject fault, restore
- corrected: same (derived); additionally spec.md:42 TS-10 has agents 'producing thorough automated tests, test cases, and documentation' during execution
- evidence: docs/twilight-structure/sdlc-stages.md:50; openspec/changes/twilight-control-plane/tasks.md:64-68
- note: No test-authoring activity exists in the catalog (execution.yaml:48-201).

### 12. Verification and browser verification are tool activities; gate failure pauses and returns to implementation

- verdict: confirmed
- original: verification.gate = registered:repository-gate (format:check --all, run-many test lint typecheck build, openspec validate); verification.browser = registered:browser-gate scope whole/affected; onFailure.verification.gate → pause, scope affected-dependency-closure
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:108-123,223-225; openspec/changes/twilight-control-plane/tasks.md:17-18
- note: Repair-as-new-attempt is supported by spec.md:711-716 (retry after gate failure is a new attempt on the escalated model, both charged).

### 13. Integration repair is bounded owner repair while independent candidates continue

- verdict: confirmed
- original: 'Failed or conflicting members enter bounded owner repair while independent candidates continue'; a moved base regenerates candidate, artifact, staging deployment and evidence
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:903-906
- note: No numeric bound for owner repair beyond rework.maxRounds; sdlc-stages.md:52 'Rework to the owning activity within the limit'.

### 14. Cloud-browser acceptance is one agent-driven pass per staging candidate; a moved main forces a fresh pass

- verdict: confirmed
- original: acceptance.cloud-browser (agent + browser) under personal-delivery; 'an agent or operator may drive the procedure, but its prose cannot establish a pass'; 'A moved main restarts composition, building, staging and acceptance'
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:900-901,1011-1012
- note: execution.yaml:265 'Cloud acceptance is disabled under factory-core'; line 532 staging: immediate-never-coalesce; A59 (assumptions.md:204) 'immediate full manual acceptance pass on each staging candidate'.

### 15. Speculative attempts are opt-in, bounded to 2 per deliverable, losers fully charged

- verdict: confirmed
- original: execution.speculation: { defaultEnabled: false, maxAttemptsPerDeliverable: 2 }; 'Losers are fenced and drained with all cost retained'
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:490; openspec/changes/twilight-control-plane/design.md:919-924
- note: Grill Q39 (uber-efficiency-grill.md:275-280) 'Keep disabled by default until a fixture demonstrates that trade-off'. spec.md:1047-1062 confirms independent evaluator selects, both attempts charged.

### 16. Discovery Q&A does not create a human pause per question under delegated authority

- verdict: confirmed
- original: 'A run therefore records assumptions and continues instead of creating an unanswered inbox card at every question. That delegation cannot authorize a later production command.'
- corrected: same
- evidence: docs/twilight-structure/product-experience.md:169-172
- note: Quote is preceded by 'For this planning request the operator delegated answers to the agent' — i.e., delegation is per-request, not a standing default. TS-05 at spec.md:37.

### 17. Human touchpoint 1: request submission with profile and discovery envelope

- verdict: confirmed
- original: Person chooses repository, describes outcome, picks delivery profile; request selects a displayed budgeted discovery envelope; null envelope = manual authoring only
- corrected: same
- evidence: docs/twilight-structure/product-experience.md:9-12; docs/twilight-structure/assumptions.md:43; openspec/changes/twilight-control-plane/design.md:268-271
- note: A62 (assumptions.md:207) 'Conversational wording cannot widen an execution envelope'.

### 18. Human touchpoint 2: one plan approval binding the execution envelope, before implementation

- verdict: confirmed
- original: beforeStage.implementation: approval { required: true, decidedBy: human, subject: execution-envelope }; A03 'One human decision approves the specified plan and bounded execution envelope'
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:210-211; docs/twilight-structure/assumptions.md:17
- note: factory-core approvals [beforeStage.implementation] (438); personal-delivery approvals [] (454). Decision-token mechanism at design.md:315-329.

### 19. Human touchpoint 3: a new decision only when a proposal leaves the envelope

- verdict: confirmed
- original: 'Increasing a hard ceiling, changing scope or quality, or leaving permitted lineage MUST require a new decision'; in-envelope fan-out/model selection 'is admitted without another human decision'
- corrected: same
- evidence: openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md:361-363,387-392
- note: Stale approval refused: spec.md:375-379; assumptions.md:101-102.

### 20. Human touchpoint 4: pause on rework exhaustion or gate failure requires an authorized next action

- verdict: confirmed
- original: Exhausting rounds 'pauses the run with the finding, consumed budget and next authorized action visible'; hard-cap exhaustion 'pauses new work rather than turning an unresolved run into success'
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:525-526; docs/twilight-structure/product-experience.md:186-187
- note: Second quote is at product-experience.md:186-187 (cited 187-189). Run-view actions at product-experience.md:22.

### 21. Human touchpoint 5: unknown effect outcomes need a recovery-operator resolution

- verdict: confirmed
- original: resolve_effect needs recovery-operator capability and one of confirm_succeeded / confirm_not_applied / abandon_unknown; ordinary resume cannot bypass it
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:491-496
- note: Recovery inbox route at design.md:302.

### 22. Human touchpoint 6: findings disposition and disagreement resolution (optional, review inbox)

- verdict: confirmed
- original: Review inbox: 'Decide an approval, assign/dispose findings, inspect disagreements'; critic disagreement → record both, judge against rubric, retain unresolved mandatory findings, stop on the review limit
- corrected: same
- evidence: docs/twilight-structure/product-experience.md:27; docs/twilight-structure/assumptions.md:106-108
- note: CONTEXT.md:174-176 judge 'holds no decision authority'; 'Majority voting cannot override a denied capability' is at assumptions.md:108.

### 23. Human touchpoint 7: production release is a separate explicit single-use command with its own envelope and 30-day window

- verdict: confirmed
- original: releaseEnvelope: decidedBy human, activity release.production, account same-run, chargeScope release-delivery-only, money $20, deadline PT2H, decisionDeadlineAfterHandoff P30D
- corrected: same; note the release envelope carries a money limit only (no token/agentTime limit)
- evidence: openspec/schemas/twilight-v1/execution.yaml:546-553
- note: design.md:625-627 release-window-expired terminal non-accepted outcome; design.md:1010-1011 publication CAS after staging acceptance.

### 24. Human touchpoints outside the run: trigger-envelope and evaluation publication

- verdict: confirmed
- original: dev-sweep trigger envelope decidedBy human (recurring authority); changing `quality` needs evaluation-publisher capability plus a subject-bound human decision
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:536-542; openspec/changes/twilight-control-plane/design.md:761-763
- note: Knowledge workspace optional actions at product-experience.md:26.

### 25. Human effort is an explicit ledger quantity, never inferred from approval waiting

- verdict: confirmed
- original: 'Human minutes: Explicit measured effort, never inferred from approval waiting'; queue/human wait are interval unions never summed into wall elapsed
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:650-651
- note: Normative form at spec.md:599-601. Human-minute rate unit at design.md:727-728 and spec.md:638-639.

### 26. Escalation ladder definition and triggers

- verdict: confirmed
- original: CONTEXT definition; balanced: implement → claude-opus-5 effort high on [refusal, gateFailure, blockingFinding], maxSteps 1; economy: implement → claude-sonnet-5 effort medium on [refusal, gateFailure], maxSteps 1; thorough: none
- corrected: same
- evidence: docs/twilight-structure/CONTEXT.md:272-275; openspec/schemas/twilight-v1/execution.yaml:289,329-333,373-377
- note: design.md:562-563 'Escalation is the selected bounded ladder, never an implicit provider fallback'; tasks.md:1178-1179 multi-step ladders in Task 11.

### 27. Class-level model routing per profile

- verdict: confirmed
- original: thorough: research/plan/implement opus-5 (implement high), review/judge fable-5-1, verify/knowledge sonnet-5. balanced: research sonnet-5, plan opus-5, implement sonnet-5 medium, review/judge opus-5, verify sonnet-5, knowledge haiku-4-5. economy: research haiku, plan sonnet, implement haiku low, review/judge/verify sonnet, knowledge haiku
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:281-288,321-328,365-372
- note: spec.md:83-86 and design.md:561-562 confirm models are capability-checked choices, not an ordered scale.

### 28. Failed attempts are charged to the accepted outcome (no erasure on escalation)

- verdict: confirmed
- original: 'Attempt cost follows its epoch… Request cost includes unsuccessful runs. Cost per accepted outcome includes their cost in the numerator; no accepted outcome gives an unavailable ratio, not zero.'
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:745-748
- note: Grill Q20 at uber-efficiency-grill.md:152-155; retry-as-new-attempt fixture at tasks.md:769-772.

### 29. One budget account per run shared by discovery, retries, escalations, children, rework, drain

- verdict: confirmed
- original: available = hard cap − settled consumption − outstanding holds; unknown consumption retains its hold; admission holds a conservative per-attempt allowance
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:600-616
- note: Worked example $12→$40, $10 settled, $1 held → $29 available; cap below $11 refused (610-611).

### 30. Shipped strict run budgets per profile

- verdict: confirmed
- original: thorough 3,000,000 / $100 / PT12H, deadline null; balanced 1,500,000 / $40 / PT6H, deadline null; economy 500,000 / $12 / PT2H, deadline PT4H; scope run, moneyScope model, strict
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:314-319,358-363,402-407
- note: Line 260 'Proposed starting values, not measurements (A45)'. Lines 276-277: deadline runs from ORIGINAL run creation including all waiting and pauses.

### 31. Discovery envelope allowance (pre-plan spend)

- verdict: confirmed
- original: tokens 300,000 / $10 / PT2H, deadline P2D; writePaths openspec/changes/**, docs/**; readOnlyCode true; providers [anthropic]
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:459-466
- note: design.md:600-602 suballocation, expiry relative to original run creation.

### 32. Nightly dev-sweep per-occurrence budget

- verdict: confirmed
- original: profile balanced, moneyScope model, allowance 200,000 / $8 / PT1H, deadline PT2H; cadence P1D on dev-main and active branch devs; unchanged revisions coalesce
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:526-542
- note: design.md:155-157 fresh per-occurrence account. Whether an onTrigger retry (max 2) opens another per-occurrence account is not stated (see additions).

### 33. Advisory budgets still require finite hard caps; warning thresholds are operator choice

- verdict: confirmed
- original: 'an $8 advisory money target inside a $12 hard cap warns after $8 and stops new spend at $12'; no starting profile ships intermediate thresholds
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:629-639; docs/twilight-structure/evidence/uber-efficiency-grill.md:359-365
- note: Also execution.yaml:270-273.

### 34. Planning stage must output estimates in ledger units and stop limits (TS-09)

- verdict: confirmed
- original: planning output: 'Ordered testable slices, interfaces, proof oracles, estimates in ledger units and stop limits'; TS-09 plan agent token usage and elapsed time
- corrected: same
- evidence: docs/twilight-structure/sdlc-stages.md:49; docs/twilight-structure/spec.md:41
- note: A12 units at assumptions.md:26; no implicit unit conversion at design.md:953-957; schema.yaml:83,88-89 require tasks.md to separate estimated/measured tokens, currency, human effort, agent elapsed time and slots.

### 35. Plan-level token/time estimates for building the factory itself

- verdict: confirmed
- original: T1 120k–360k tokens, 8–16 h, 2–5 agent h; T2 90k–220k; T3 220k–560k; T4 200k–560k (+4.4–4.5 200k–500k); T5 280k–860k; T6 320k–900k + live spend; T7 150k–420k (+7.3–7.4 300k–800k); T8 300k–840k excl. benchmark; T11 0.4M–1.0M; T12 0.25M–0.65M; T13 48–96 h; T15 0.4M–1.0M; T16 0.5M–1.2M
- corrected: same; T1 line continues onto 194 ('120k–360k tokens, one execution slot'), T8 onto 1006, T15 onto 1424
- evidence: openspec/changes/twilight-control-plane/tasks.md:193-194,256,384,519,543-544,645,778-779,880,913-914,1005-1006,1251,1275,1351,1423-1424,1451
- note: Tasks 9, 10, 14 carry human-hour-only estimates (16–32 h each) at 1123, 1155, 1389 — omitted by the researcher but they hold no token figures.

### 36. Coordinator load acceptance budget

- verdict: confirmed
- original: sessions 64, effectsPerSecond 100, duration PT10M, p95DispatchMs 100
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:502
- note: tasks.md:547-555 Task 4.5 proof via dispatchEffect.

### 37. Fixed-quality scaling acceptance matrix

- verdict: confirmed
- original: workers [1,2,4,8], repetitions 5, workloads [independent, decomposable, contended-recovery]; minimumIndependentSpeedup at4 2 / at8 3; minimumDecomposableSpeedup at4 1.5; authorizedControls fanOut 8, perClientCeiling 8, agentSlotsCeiling 8
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:492-501
- note: Speedup definitions and loser-cost reconciliation at tasks.md:1034-1042.

### 38. Planning-storage p95 acceptance budgets (Task 9)

- verdict: confirmed
- original: p95 command-to-accepted-ref ≤1 s single / ≤3 s batches; complete-plan read ≤500 ms warm / ≤2 s cold; typed conflict p95 ≤1 s; WBS visibility ≤2 s p95; restart reconciliation ≤30 s; ≥2 accepted commands/s; ≥95% within 3 s p95 at 8 writers; 20 plans / 10,000 active / 10,000 archived / 100,000 records
- corrected: same
- evidence: docs/twilight-structure/client-repositories.md:182-217
- note: 'Proposed acceptance budgets, not measurements' (192); profile name storage-acceptance/default (172).

### 39. Knowledge benchmark targets

- verdict: confirmed
- original: 20 questions, correctness 0.9, traceability 1.0, effort recorded; retrievalProvider indexes-and-rg
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:586-587
- note: tasks.md:1271-1273 full-text/embeddings only if baseline misses targets.

### 40. Scheduled trigger retry bound

- verdict: confirmed
- original: onTrigger.*: retries { max: 2, backoff: PT5M }, overlap skip, missed skip
- corrected: same; also triggerKinds: [schedule], timezone: required
- evidence: openspec/schemas/twilight-v1/execution.yaml:228-233
- note:

### 41. Repository capacity defaults (infra units per run)

- verdict: confirmed
- original: agentSlots 2, secretarySlots 1, branchDevEnvironmentSlots 2, secretaryProviderReserve required, workspaceWritersPerLineage 1, reviewerReserve 1, buildSlots 1, browserSlots 1; queue priority critical-path, selection feasible-ready, aging PT30M, perClientCeiling 4
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:469-481
- note: design.md:144-146 organization pools sit above; repository cannot create capacity authority.

### 42. Organization capacity pools declared in the snapshot

- verdict: confirmed
- original: agent, secretary, workspace, reviewer, build, browser, branchDevEnvironment (7 pools); gate reserves build+workspace, browser verification reserves browser+workspace, cloud-browser agent additionally reserves an agent slot
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:142-146
- note: Atomic vector reservation and 'Starting counts as occupied' at design.md:533-536.

### 43. Secretary/interactive provider reserve

- verdict: confirmed
- original: OpenClaw secretary admitted through a dedicated `secretary` pool and provider-specific interactive reserve; worker admission consumes only capacity above the reserve; zero reserve makes availability unavailable
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:842-845
- note: A53 (assumptions.md:198) no latency SLO until measured under saturation.

### 44. K3s worker pool topology for M1

- verdict: confirmed
- original: One dedicated K3s server scheduling no attempt Pods + at least two agent nodes; h3mon monitoring outside; h4claw runs OpenClaw/control services/app deployment; manual join/drain; VPS provisioning later Terragrunt scope
- corrected: same
- evidence: docs/adr/0016-k3s-schedules-the-expandable-worker-pool.md:5-9; docs/twilight-structure/assumptions.md:96-97
- note: worker-pools.md:47-51 names the operating costs (control plane, Pod security, networking, image distribution, storage, telemetry, upgrades, cleanup) as stated.

### 45. One sandbox (Kubernetes Job) per admitted attempt with resource bounds and no privileges

- verdict: confirmed
- original: 'The K3s adapter creates one immutable-digest Job per admitted attempt'; CPU, memory, ephemeral-storage and deadline bounds; no K8s API token, Docker socket, host path, privileged mode
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:378-388
- note: Runtime class probe order gVisor then Kata, runc alone insufficient: tasks.md:728-732. No numeric CPU/memory values anywhere.

### 46. Cloud browser provider and slot usage

- verdict: confirmed
- original: Browserbase first Task 13 cloud-browser candidate (remote CDP; Bun/Playwright warning); local-browser success cannot satisfy the cloud stage; browserSlots 1
- corrected: same
- evidence: docs/twilight-structure/assumptions.md:53; openspec/schemas/twilight-v1/execution.yaml:480
- note: tasks.md:1310-1315 session ID, served identity, retention, teardown. No Browserbase pricing anywhere in the repo.

### 47. Environments per repository in the personal phase

- verdict: confirmed
- original: One dev-main, one production, one serialized staging, one branch dev per active branch within capacity (A57); two branch-dev slots (A67); branch devs sleep/resume explicitly, no auto-delete (A58)
- corrected: same
- evidence: docs/twilight-structure/assumptions.md:202-203,212
- note:

### 48. Storage/retention ceilings

- verdict: confirmed
- original: searchableCorpusBytes 10 GiB (10737418240) no age expiry; operational evidence P365D after terminal; organizationPolicy null
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:517-522; docs/twilight-structure/assumptions.md:31,211
- note:

### 49. Non-model cost categories and units the ledger must price

- verdict: confirmed
- original: Organization snapshots supply non-model rates as {category, service, unit, price, effectiveFrom}; units per request, service minute, human minute; or a binding maximum quote with expiry
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:724-729
- note: Normative at spec.md:636-641. A46 (assumptions.md:84) missing categories keep total cost unavailable.

### 50. Efficiency breakdown drivers the ledger must reconcile

- verdict: confirmed
- original: request count, run count, activity attempts, model turns, input/output/cache-read/cache-write tokens, tool-definition tokens/bytes, failed context lookups, adapter polling cycles, pinned rates
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:675-687
- note: Grill P1 finding at uber-efficiency-grill.md:816; plan disposition 840-846.

### 51. Agent time vs wall-clock accounting example

- verdict: confirmed
- original: 'Four concurrent 30-minute agent sessions consume 120 agent-minutes and about 30 wall-minutes'
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:653-654
- note: agentTime clock definition at design.md:647.

### 52. Client installation model (TS-29)

- verdict: confirmed
- original: First iteration operated and primarily used by Dany; future installations on client-owned infrastructure maintained by Dany under an explicit agreement with revocable access and defined support and recovery terms
- corrected: same
- evidence: docs/twilight-structure/spec.md:61
- note: CONTEXT.md:356-359 'Installation operator'.

### 53. Support hours and recovery targets are undecided

- verdict: confirmed
- original: 'Support access is revocable and support hours must be defined before offering the service; no hours or recovery targets have been selected yet.'
- corrected: same
- evidence: docs/twilight-structure/discovery.md:41-45
- note:

### 54. Distribution topology: central or dedicated per-client installation

- verdict: confirmed
- original: 'A central Twilight installation can coordinate several authorized repos; source, planning, credentials, and context permissions remain scoped to each client. A dedicated per-client installation uses the same contracts.'
- corrected: same
- evidence: docs/twilight-structure/client-repositories.md:10-13
- note:

### 55. What is sold, tenancy, packaging and service commitments are deferred to the customer phase

- verdict: confirmed
- original: A63 (importance 95): 'Do not invent one. Phase 2 begins with a named design partner/problem…'; customer phase determines tenancy, packaging, support, recovery and service commitments
- corrected: same
- evidence: docs/twilight-structure/assumptions.md:208; openspec/changes/twilight-control-plane/tasks.md:29
- note:

### 56. Rate card is the organization's internal price list for provider usage

- verdict: confirmed
- original: 'The organization's versioned prices for measured provider usage, with effective dates and explicit charge categories'; 'the repository publishes no prices'
- corrected: same
- evidence: docs/twilight-structure/CONTEXT.md:277-280; docs/twilight-structure/assumptions.md:84
- note: product-experience.md:25 'publish the rate card (privileged)'.

### 57. Providers and adapters assumed (TS-03, A09, Task 6)

- verdict: confirmed
- original: ACP first for Codex, Claude and agy; ACP adapter for one verified provider first; 'Probe Claude first, then Codex…; if both fail, stop'; agy unavailable until its own adapter passes; Gemini CLI not a substitute
- corrected: same
- evidence: docs/twilight-structure/spec.md:35; docs/twilight-structure/assumptions.md:23; openspec/changes/twilight-control-plane/tasks.md:678-682; docs/twilight-structure/research/initial-inspection.md:15-19
- note:

### 58. All shipped profile model defaults are Anthropic

- verdict: confirmed
- original: claude-opus-5, claude-sonnet-5, claude-fable-5-1, claude-haiku-4-5-20251001; discoveryEnvelopes.default.providers [anthropic]
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:281-288,321-328,365-372,463
- note: Every `provider:` key in all three profiles and both escalation targets is `anthropic`.

### 59. Billing model presupposed: provider-metered usage priced by rate card with provider-billed cost reconciled

- verdict: confirmed
- original: 'estimatedCost is tokens times the rate-card entry pinned at admission… billedCost is the provider's reported figure'; UsageObservation carries input/output/cacheRead/cacheWrite tokens
- corrected: same (derived)
- evidence: openspec/changes/twilight-control-plane/design.md:257-276
- note: Repo-wide search: 'subscription', 'API key' and consumer-plan terms do not appear in the Twilight docs; 'OAuth' appears only for MCP servers (research/runtime-patterns.md:126,158); 'self-hosted' only for Git remotes (A31).

### 60. Worker credentials are scoped, ephemeral, per repo/provider

- verdict: confirmed
- original: 'Worker provider credentials are repo/provider-scoped integration secrets resolved by the trusted launcher into an ephemeral read-only credential mount; never use a shared operator home. Destroy the mount after observed exit'
- corrected: same
- evidence: docs/twilight-structure/assumptions.md:55
- note:

### 61. Prompt-cache TTL and compaction settings are deliberately unselected

- verdict: confirmed
- original: Grill Q30/Q81/Q85: do not import Uber's 400k-token or one-hour settings; keep TTL unselected until measured; compaction benchmarked per activity later
- corrected: same
- evidence: docs/twilight-structure/evidence/uber-efficiency-grill.md:218-224,555-559,580-584
- note:

### 62. Tool-schema, polling and failed-lookup overhead must be measured but not optimized in M1

- verdict: confirmed
- original: 'M1 measures these costs but does not require lazy tool loading, a universal CLI projection or automatic prompt tuning'; adapters keep polling outside model turns
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:700-706
- note: Task 11 lazy tool loading at tasks.md:1202-1213.

### 63. No numerical savings targets or default profile may be set from M1 evidence

- verdict: confirmed
- original: 'Twilight must establish its own baselines before setting numerical savings targets'; 'Two runs prove plumbing, not superiority'; Task 8 runs 'do not select a default profile'
- corrected: same
- evidence: docs/twilight-structure/evidence/uber-efficiency-grill.md:54-58,344-348; openspec/changes/twilight-control-plane/tasks.md:977-978
- note:

### 64. Optimization work itself is a bounded charged activity with a payback statement

- verdict: confirmed
- original: Optimization proposal names baseline, target driver, expected payback, quality floor, analysis/rollout cost and stop condition; analysis consumes a bounded charged allowance
- corrected: same
- evidence: openspec/changes/twilight-control-plane/design.md:804-810; docs/twilight-structure/evidence/uber-efficiency-grill.md:744-749
- note: Q10 at grill line 79, Q40 at 282-286.

### 65. Mandatory hooks per run (non-model cost)

- verdict: confirmed
- original: secrets-scan: registered:tool-secrets at afterActivity.implementation.implement and afterActivity.verification.gate, mandatory, 60 s, deny on timeout; notify-operator optional, 10 s, degrade
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:240-258
- note:

### 66. Independent task-acceptance oracle is mandatory and charged to the run

- verdict: confirmed
- original: acceptance.evaluate and acceptance.coverage 'charge the run account before candidate acceptance completes'; disabling refused; missing assertions block as unavailable
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:594-597; docs/twilight-structure/product-experience.md:224-227
- note:

### 67. Escaped-defect window that keeps outcome quality immature

- verdict: confirmed
- original: escapedDefectWindow P30D; 'Defect quality stays immature until its window closes'
- corrected: same
- evidence: openspec/schemas/twilight-v1/execution.yaml:608; docs/twilight-structure/product-experience.md:216-217
- note:

### 68. Personal-phase delivery route and acceptance path per candidate

- verdict: confirmed
- original: integration composition → staging deployment → automated and interactively driven tool-verified acceptance → CAS main publication → dev-main convergence → explicit production promotion; main movement restarts composition, build, staging and evidence
- corrected: same
- evidence: openspec/changes/twilight-control-plane/tasks.md:1317-1322
- note:

## Additions

- M1 aggregate build estimate exists and was not cited: the plan review record states 'M1 estimates increased to 72–148 human hours / 1.19M–3.46M tokens, plus 30% reserve' (docs/twilight-structure/evidence/plan-review.md:74, dated 2026-09-06 snapshot). The current tasks.md line items for Tasks 1–8 sum higher: 111–220 human hours and 1.68M–4.72M tokens, before the 4.4–4.5 and 7.3–7.4 allowances (+40–80 h, +0.5M–1.3M tokens) and excluding benchmark, live-provider and VPS spend (openspec/changes/twilight-control-plane/tasks.md:193-194,256,384,519,543-544,645,778-779,880,913-914,1005-1006).
- The two profiles M1 actually measures are `balanced` and `economy`, not thorough: 'once under `balanced` and once under `economy`' (openspec/changes/twilight-control-plane/tasks.md:946-951). The first measured per-stage distribution therefore covers only those two; thorough (2 critics, fable-5-1 review) stays unmeasured through M1.
- The nightly dev-sweep `exercise` agent resolves its model from the pinned `balanced` profile's `verify` class, i.e. claude-sonnet-5, and reserves {agent:1, browser:1} per occurrence (openspec/schemas/twilight-v1/execution.yaml:539,327,568-574).
- `deadline` is a duration from the ORIGINAL run creation 'including all waiting and pauses' (openspec/schemas/twilight-v1/execution.yaml:276-277; design.md:648-649): economy's PT4H and the discovery envelope's P2D consume human approval wait; expiry pauses ordinary dispatch but the separately authorized release.production suballocation stays usable.
- `agentTime` sums occupied agent-session time across attempts including provider/tool wait, and excludes pre-launch queue, human-only pauses and tool-only activity duration (openspec/schemas/twilight-v1/execution.yaml:276; openspec/changes/twilight-control-plane/design.md:647). With fanOut 2, balanced's PT6H is at most ~3 wall hours of fully parallel model occupancy.
- Admission holds a conservative per-attempt allowance, never the whole run cap, and no numeric per-attempt allowance is defined anywhere (openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md:454-456; design.md:605-606) — a cost model needs an assumed hold size to model admission refusals near a cap.
- Per-attempt ledger grain a cost model should mirror: planned, held, settled and unavailable consumption; pricing categories; agent time; tool time; queue wait; human wait; human minutes; serving provider/model revision; escalation step; profile epoch; aggregates roll up failed attempts and runs (openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md:673-677).
- Per-task estimate-vs-measured calibration is planned output: `quality.estimateCalibration: per-task` (openspec/schemas/twilight-v1/execution.yaml:610) and the tasks artifact must 'Separate estimated/measured tokens, currency, human effort, agent elapsed time and scarce slots' (openspec/schemas/twilight-v1/schema.yaml:83,88-89).
- Human-hour-only estimates for Tasks 9, 10 and 14 (16–32 h each; Task 10 also reserves one exclusive cutover window) are omitted from the researcher's table (openspec/changes/twilight-control-plane/tasks.md:1123,1155,1389).
- Dev-sweep retry accounting is unstated: onTrigger retries max 2 with PT5M backoff (openspec/schemas/twilight-v1/execution.yaml:233) while 'Every occurrence copies the allowance into a new budget account' (line 535); whether a retried occurrence draws a fresh 200k/$8 account is not defined, so a worst-case night could be up to 3 × the per-occurrence allowance per target.
- Speculation is part of the approved execution envelope ('speculation allowance', openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md:359), so enabling it mid-run is an envelope change requiring a new human decision, not an in-envelope scheduling choice.
