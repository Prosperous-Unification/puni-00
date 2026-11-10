# Delivery, change quality and agent coordination — 2026-11-10

Assessment of [scope](../../../puni-assessment.md), inspected at public revision
`7614ca5116e2b27831076f7bc7c9f9872051c388` (`docs/assessment-20261110`), refreshed from
initial inspection/test revision `d87afb94a6362d345480f665b6e3b5d20d787686`. The 23-path
website-only refresh leaves this report’s inspected delivery/swarm/test blobs unchanged.
Evidence classes: **I** documented intent; **C** pinned code/config inspection;
**T** fresh bounded automated tests below; **H** dated historical verification;
**L** current operational observations in [live evidence](live-evidence.md).
Code presence, a checked task, a historical lab and an operational service are different claims.

PUNI has mature WBS-specific release safeguards and reusable measurement primitives.
Required merge checks have been activated since the last assessment. The larger
Twilight runtime now has substantial real components, so the October statement
“none is implemented” is obsolete. Its complete safe coordinator, remaining adapter kinds,
operator commands and governed dogfood remain open. Neither present agent counts
nor merged PR counts establish an accepted-delivery speedup.

## Acceptance and applicability

The following journey/model keys apply to every DEL/SWM finding unless narrowed:
**N** launch an application; **S** scale an existing application; **A** personal OpenClaw
assistant; **SH** shared PUNI hosting/services; **DE** dedicated PUNI-operated environment;
**CO** client-owned infrastructure; **HY** shared plus client-specific deployment.
Every journey needs a requirement-linked acceptance, repository/configuration and
credential owners, a versioned deploy/update, failure recovery and handover. Every
model needs named account, release, incident and exit authority. SH/HY additionally
need shared blast-radius and contention limits; DE needs separately proved isolation;
CO needs its own registry/pipeline access, existing-stack adapter and client acceptance.
These are applicability requirements, not claims of four qualified offerings.

| Journey | Minimum delivery acceptance and inputs                                                                                                           | Current reusable surface and limit                                                                                                                                                           | Owners and effort                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| N       | Accepted requirements/workload, repo, environments, domains/auth owners; tested immutable release, operational acceptance, recovery and handover | Nx/Bun pipeline, WBS Compose/k3s machinery, portable project contract, website release work. A second product exists; independently onboarding an arbitrary client repo is not demonstrated. | Client accepts; delivery engineer configures; release operator deploys; account owner grants authority. Elapsed onboarding/hands-on minutes unmeasured here. |
| S       | Same-load performance/cost baseline, bottleneck, compatible intervention, measured improvement and recovery                                      | Deploy automation can ship a scaling change. WBS backend remains single-writer SQLite; k3s backend is one `Recreate` replica. Additional nodes do not prove application capacity gain.       | Application/performance owner measures; platform owner changes capacity; release operator rolls out. No scaling-delivery duration established.               |
| A       | Versioned assistant/tasks/connections, permissions, client approvals, bounded cost, accepted update/restore/offboard                             | WBS workflows and API executor components are reusable foundations; no inspected receipt establishes a standard OpenClaw client installation/update pipeline.                                | Client owns accounts/task acceptance; assistant operator owns updates/behavior; platform operator owns hosting. Handover/maintenance effort unmeasured.      |

Availability is a running-service property. A successful health probe or availability
chart does not prove commit-to-production lead time, accepted changes, rollback safety,
a scaling improvement or client onboarding repeatability. Conversely a green CI run
does not prove the release was deployed or remained available.

## Delivery findings

### DEL-01 — Merge checks are enforced; composed-tree and human review remain separate

**Acceptance / owner:** N/S/A × SH/DE/CO/HY; repository administrator ensures missing,
failed or cancelled required verdicts cannot merge, and states composition/review policy.
**Intent → implementation:** W04 and [merge enforcement](../../../openspec/changes/enforce-merge-checks/verify.md)
replaced advisory-only checks with Actions-produced `gate`/`pixels` ruleset 25730010.
The recorded policy has no bypass, zero required approvals, loose base freshness and no merge queue.
**Evidence / reconciliation:** H: 2026-10-23 actual main refusal/acceptance and isolated
rule/producer-removal controls, exact identities in that verify record; C: current
[CI](../../../.github/workflows/ci.yml) validates PR synthetic-merge identity and selects
whole affected projects, runs full scope on main/merge-group/dispatch, rejects unmapped events.
L: 2026-11-10 19:00 UTC [readback](live-evidence.md) confirms protected main, active ruleset
25730010, gate/pixels Actions15368, strict false and zero approvals.
The old assessment's “main unprotected” is superseded; required CI is not mandatory peer review.
**Gap / smallest action / proof:** delivery owner explicitly accepts loose freshness
or qualifies composed-tree admission before increasing merge concurrency. Close with
current policy readback and a two-PR shared-contract race that either refuses stale
composition or proves the actual composed tree before integration; retain review ownership.

### DEL-02 — CI is broad and increasingly partitioned; a terminal verdict still matters

**Acceptance / owner:** all journeys/models; build engineer retains honest complete
verdicts and measures selection, queue, execution and failure independently.
**Intent → implementation:** [change-aware CI](../../../openspec/changes/change-aware-ci/design.md),
R5 and [exact-SHA gate](../../../bin/h2puni-gate.sh) bind selection and checks to revisions.
C: CI has separate workspace/backend/remote/remote-model/frontend/checks/docs/Twilight
jobs, finite budgets, browser shards, strict aggregate reducers and selection artifacts.
It installs frozen dependencies; includes secrets/migration/OpenSpec checks. Main uses
SHA + run ID concurrency keys; PR supersession is intentional. Host gates serialize
under the host lock and checkout under it, protecting against a different lane's HEAD.
**Evidence / reconciliation:** H: workflow comments and [R5 catalogue](../checks-that-cannot-fail.md)
retain real failure controls; T below covers only named suites. L: [seven-day main-CI sample](live-evidence.md), Nov3 19:00:06→Nov10 19:00:06 UTC,
contains 50 runs: 36 successful, 13 failed, one in progress, zero cancelled; complete
window coverage. These are CI conclusions, not deployment failure or client-acceptance rates. A narrowed docs pass is legitimate
selection; an absent/cancelled/in-progress runtime verdict is not a passing runtime test.
**Gap / smallest action / proof:** W14 owner records required-run population and exact
selection/attempt outcomes, queue and gate time before tuning more partitions. Close
with recomputable per-change records including failures, cancellations and partial reads;
release only a source with its own terminal required verdict, rather than a nearby green SHA.

### DEL-03 — Release digests exist; independent provenance and reproducibility need qualification

**Acceptance / owner:** N/S and assistant image releases, all models; build/release engineer
binds the approved source and build configuration to each routed immutable artifact.
**Intent → implementation:** W03/W12, [publisher](../../../tools/tool-dagger/src/main.ts)
and [publish digest contract](../../../tools/tool-dagger/src/lib/publish.ts) emit `WBS_SHA`
labels and digest refs into `release.json`; publish wrapper pins HEAD and uses the heavy lock.
C: Bun lock and Python hash locks constrain dependencies; action commits are pinned.
Backend Bun/Python and frontend Bun/Caddy Dockerfile bases still use mutable tags;
BusyBox audit stage is digest-pinned. Build-time Vite configuration changes frontend bytes.
**Evidence / reconciliation:** C at refreshed source; L: [current prod read](live-evidence.md) still has tier state
`0afc7775…`, old running images and no `WBS_SHA`; dev reports commit=bootCommit `7614ca5…`.
The October Bun OCI revision was inherited base metadata, not proof of another PUNI commit.
A label or state-file SHA alone is not a verified source→gate→build→routed-digest chain.
**Gap / smallest action / proof:** reconcile the current running release first (W03);
then pin material build inputs/configuration and retain builder/source/digest/gate receipts.
Close with independently checked per-tier routed-container mapping, including frontend,
and two clean builds with equal outputs or explained nondeterminism. No build was run here.

### DEL-04 — k3s promotion is stronger than the Compose gate contract; operational acceptance is open

**Acceptance / owner:** N/S and packaged A releases, all models; platform release operator
promotes exactly the staged candidate under protected deployment authority.
**Intent → implementation:** [k3s workflow](../../../.github/workflows/deploy-k3s.yml),
[descriptor](../../../tools/tool-deploy/src/k8s/descriptor.ts) and
[promotion](../../../tools/tool-deploy/src/k8s/promotion.ts) bind source, four tier digests,
main-push gate/pixels evidence and independently owned admission; production requires
identical descriptor/digests and bounded-age staging proof. Plan is the default.
Compose [deployment](../../../tools/tool-deploy/src/deploy.ts) checks clean/stale release
and executor/configuration state but does not consume the same CI acceptance receipt.
**Evidence / reconciliation:** T: descriptor/promotion fresh refusal cases pass below.
H/C: [k3s tasks](../../../openspec/changes/k3s-wbs-delivery/tasks.md) retain open protected
Actions, staging/rollback and attended production acceptance; F11.1d has implemented
first-start state/receipts but still owes independent review and live lab/staging/prod proof.
These explicitly supersede any inference that a checked subtask activates cutover.
**Gap / smallest action / proof:** W12 owner first verifies environments, target identity,
runner and admission installation, then performs authorized staging plan/apply/rollback.
Close with immutable receipts for identical promotion, refused mismatches and post-deploy
acceptance; production cutover remains separately authorized. Do not sell k3s readiness from unit tests.

### DEL-05 — Rollback protects migration identity; recovery has workload-specific limits

**Acceptance / owner:** N/S and stateful A, all models; application architect/release
operator states write interruption, compatibility and recovery budgets before release.
**Intent → implementation:** [ADR 0041](../../adr/0041-deployment-rollback-restores-a-captured-migration-set.md)
and deploy callers capture complete name/hash sets, reverse exactly new additions,
require `down.sql`, and reject edited migrations. Compose stops writers, fences migration
and exposure; final smoke runs after selected tiers commit and fails loudly without automatic undo.
C: k3s [executor](../../../tools/tool-deploy/src/k8s/execute.ts) journals phases, uses Lease/
heartbeat/write fencing/Flux coordination, distinguishes rollback failure and `recovery-required`.
**Evidence / reconciliation:** H: [k3s verification](../../../openspec/changes/k3s-wbs-delivery/verify.md)
records crash-per-phase and local cluster exercises; open tasks distinguish release-path
solver/PVC/CSI/OIDC proofs. Neither blue/green naming nor health-gating proves percentage
canary analysis, horizontal stateful scaling or zero downtime. No migration/deploy drill ran here.
**Gap / smallest action / proof:** retain an application-specific release/recovery contract
and rehearse one additive migration failure plus interrupted recovery on its real storage.
Close with exact full-ledger restoration, single-writer evidence, postdeploy authenticated
smoke, preserved failure/manual command and measured outage/recovery time.

### DEL-06 — Deployment permissions are separated in YAML; runner isolation is not proved by that

**Acceptance / owner:** all journeys/models; security/platform owners constrain the
credential reachable by each runner and recover interrupted work without exposure.
**Intent → implementation:** C: CI is contents-read on hosted runners; k3s dispatch resolves/
admits on hosted runners, deploys trusted main code on `[self-hosted,puni-deploy]`, disables
persisted checkout credentials, installs without scripts in deploy, uses environment secrets,
0700 state, known-host pinning, temporary credential files and `always()` removal.
**Evidence / reconciliation:** C in [workflow](../../../.github/workflows/deploy-k3s.yml);
L: actual runner/environment inventory is [separate](live-evidence.md). GitHub explicitly
states self-hosted runs are not isolated merely by environment approvals ([secure use](https://docs.github.com/en/actions/reference/security/secure-use)).
A cleanup step can be interrupted; labels do not prove an ephemeral machine or isolated trust zone.
**Gap / smallest action / proof:** qualify one deploy runner's lifecycle, principal permissions,
residual-file/host access and kill recovery before using client credentials. Close with
synthetic cross-job/foreign-target denials, no residual test credentials after interruption,
and retained journals; SH/HY additionally prove cross-client isolation, CO hands control to the client.

### DEL-07 — Host/job concurrency has real code; admission and dispatch durability need separate proofs

**Acceptance / owner:** all journeys/models; delivery/platform owner bounds host load and
retains an explicit disposition for queued, killed, partial and uncertain jobs.
**Intent → implementation:** C/H: [host-job tasks](../../../openspec/changes/dash-host-jobs/tasks.md)
implement vector capacity/exclusive-unit admission, process/container evidence, durable
settlement, limits and calibration. Host enrollment/acceptance remains distinct from code.
Legacy heavy lock remains the documented gate entrypoint on unenrolled hosts. k3s has
per-environment workflow concurrency with `cancel-in-progress:false` plus its runtime Lease.
**Evidence / reconciliation:** C: no `queue:max` in deploy-k3s; GitHub's current default can
replace a pending dispatch; [larger queues](https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues/)
are available explicitly. Mutual exclusion does not prove every dispatch is retained.
A deploy journal protects started transactions, not an evicted GitHub pending run.
**Gap / smallest action / proof:** operator records/enforces which queue owns requested
releases and checks actual host enrollment. Close with three queued requests plus killed
launcher/surviving child and a repeat after restart; every request has a retained final or
explicitly superseded disposition and no premature release of occupied resources.

### DEL-08 — Reuse exists; a repeatable client pipeline and modularity benefit are unqualified

**Acceptance / owner:** all journeys/models; developer-experience/architecture owners
onboard an independent repo without copying WBS assumptions, and quantify change/review burden.
**Intent → implementation:** W12/W19/W20, [portable project contract](../../workspace/portability.md)
and [public website ownership](../../website/README.md) provide genuine second-product work.
WBS image names, tier lists, health/auth, SQLite migration and target layouts still need
adaptation; no generic assistant installer follows from the WBS release workflow.
C: ports/adapters, directional ESLint constraints and the refactoring ledger implement real
boundaries; [Burokrat policy](../../code-organization/rule-policy.json) still marks all 15 rules
`observe`; [test axes](../../../openspec/changes/test-axes/tasks.md) retains open acceptance.
**Evidence / reconciliation:** C/H, not a measured client onboarding or modularity experiment.
Observe-only Burokrat findings do not become blockers because the admission command runs.
R4 intent/spec/tasks/verify and R5 production-path negatives are valuable controls, not proof
that every recent change has complete artifacts or that smaller modules speed delivery.
**Gap / smallest action / proof:** W20 selects a supported client profile/hotspot, enforces
its actual required rules with owned exceptions, then W19 independently onboards one repo.
Close with forbidden-import/missing-evidence negatives at actual admission and measured
onboarding/manual effort, upgrade and recovery receipts; keep custom integration cost visible.

### DEL-09 — Provider-neutral observations and cost accounting exist; outcome economics still need collection

**Acceptance / owner:** all journeys/models; delivery operations/finance owners measure
accepted production outcomes, rework, recovery, inference/infrastructure cost and operator minutes.
**Intent → implementation:** W14/W21; [shared delivery](../../../libs/shared/domain/delivery/README.md)
models change/check/run/attempt/performed-carried-unknown executions with provenance.
[GitHub reader](../../../libs/shared/adapters/delivery-github/README.md) is anonymous bounded
public-PR GETs; WBS `DeliveryGate` adds quota/cache/in-flight limits and a scoped UI view.
C/H: [work delivery verification](../../../openspec/changes/track-work-delivery/verify.md)
records real reader/local WBS composition and implementation publication, not production activation.
[Trial accounting](../../../apps/twilight-structure/twilight-burokrat/cli/src/experiments/accounting.ts)
and export retain source/acceptance/integration identities, failed/censored work, human/gate/
waiting phases, raw usage, priced allocation and independently recomputable currency charges.
**Evidence / reconciliation:** T: 36 tests below cover delivery timing/validation and cost/export.
“Waiting” is attempt-start→execution-start, not runner queue; sum of parallel work is not
elapsed time; unknown/partial is not zero. Fixed corpus and a `heldOut` field do not prove
blind acceptance was operated. Dated [unit economics](../../twilight-structure/research/unit-economics/README.md)
explicitly lacks measured stage tokens/human minutes; its prices are not refreshed here.
**Gap / smallest action / proof:** join existing receipts to one bounded real client/change
population and reconcile billed inference plus shared/dedicated allocation; do not invent another ledger.
Close with recomputable request→acceptance→production identities, definition/window/denominator,
all failed/reworked/censored outcomes, unpriced usage and hands-on effort. DORA's
[current five metrics](https://dora.dev/guides/dora-metrics/) distinguish delivery throughput/
instability, including failed-deployment recovery and deployment rework; application health and PR rate cannot substitute.

## Swarm findings — all eleven criteria

Applies to the agents building/operating N/S/A across SH/DE/CO/HY. The decision owners
below are accountable roles, not evidence that those roles are staffed. Prior intent is
[Twilight A1–A11](../../../openspec/changes/twilight-agentic-workflows/design.md),
[ADR 0057](../../adr/0057-activities-run-on-the-ai-sdk-and-an-interpreter-coordinates.md),
W21/W28 in the [2026-10-21 roadmap](../../superpowers/plans/2026-10-21-puni-readiness/work-packages.md).
Current source/evidence date is 2026-11-10/7614ca5 unless a historical date is stated.

| ID / criterion / acceptance and owner                                                                                                                                                       | Current implementation, evidence and reconciliation                                                                                                                                                                                                                                                                                                                         | Gap/consequence; smallest action and closure proof                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SWM-01 Architecture fit.** Delivery architect chooses shape per work type and records baseline/decision.                                                                                  | C/I: A6 keeps plan→implement→review→verify→integrate sequential and decomposes across work. [Local coordinator](../../../apps/twilight-structure/twilight-dash/cli/src/coordination/run-coordinator.ts) now consumes actual CTT external work sessions and accepted WBS facts; T covers its memory composition. Complete runtime and W21 remain open.                       | No paired single-agent control or accepted-throughput comparison found. Select independent-module and shared-contract tasks; close with paired repeated trials, noise floor and per-shape accepted outcomes/cost, including a legitimate no-gain result.                                                                    |
| **SWM-02 Delegation/handoffs.** Dash owner records every transfer, returned artifact and revision/back-edge.                                                                                | C: immutable binding manifests, execution intents, exact authority/claim/turn helpers, artifacts and receipts now exist. A local CTT ticket is not remote work launch. [Parent tasks](../../../openspec/changes/twilight-agentic-workflows/tasks.md) leave exact outcome/write/release and end-to-end composition open.                                                     | No complete recorded agent transfer chain/dogfood. Connect one bounded work item through all five classes with explicit revision semantics; close with original prompts/artifacts/messages and exact accepted-return/revision correlation, not a success summary.                                                           |
| **SWM-03 Locus of control.** Dash owner puts sequencing in code, fences competing coordinators and contains errors.                                                                         | C/H: RunStore owner epochs/revisions, WBS receiver generations and retained execution facts are implemented foundations; [ADR 0061](../../adr/0061-execution-facts-survive-coordinator-restart.md), accepted 2026-10-25, supersedes WBS-only history. ADR 0057 remains proposed; SDK/runtime acceptance is not implied.                                                     | No operational complete coordinator/central verification path established. Finish S7a composition/recovery before deployment; prove two coordinators, surviving worker and uncertain external effect without duplicate replacement or freeing capacity.                                                                     |
| **SWM-04 Sequential/parallel.** Delivery/platform owner declares dependencies/fan-in and admits all resource users; gains need paired seeds/control/noise floor.                            | C/T: local coordinator rejects premature successors and races admissions atomically; host-job admission and heavy-lock protocols exist. WBS claim/resource limits are distinct from local reservations and nested processes. W21 remains unmeasured.                                                                                                                        | Host locks bound gates, not every agent process. Complete I2.10 host accounting and W21; prove nested over-cap denial and safe join under concurrency, then report accepted throughput, rework, money and operator effort.                                                                                                  |
| **SWM-05 Harness identity.** Runtime owner pins model–harness version/settings/context with tokens/latency/cost per accepted outcome.                                                       | C: ActivityExecutor has explicit version/capabilities; accepted binding pins model/executor/settings; API adapter uses real pinned SDK with injected provider/tools. CLI-harness/ACP/tool/human adapters are open; no production provider factory enabled by API component acceptance.                                                                                      | No current operating attempt population with complete harness identities/cost. Record identity and settings on one real pilot, retain unknown ACP usage explicitly; compare proposed harness changes against the same acceptance corpus before adoption.                                                                    |
| **SWM-06 Context policy.** Runtime owner defines class budgets, elision/summarization, first/retry/review input and original-record retention.                                              | C/I: binding validation and retained prompt bytes/digests exist; no repository `.twilight` defaults. API conversation/retry lifecycle is implemented; that is not per-class retry/context governance. **I1.05 remains unclosed at source acceptance**; fresh WBS row status is unknown (below).                                                                             | Context inherited/compacted by external harnesses cannot be assumed isolated. Implement accepted per-class first/retry/reviewer policy; prove each receives permitted originals and budgeted context, summaries never overwrite originals, and no unintended transcript inheritance.                                        |
| **SWM-07 Identity/authority.** Security owner scopes WBS/GitHub/host capabilities and audits delegation under an injected agent.                                                            | C: WBS machine principals, typed runtime authority/claims and narrow injected tool maps exist. **I3.05 remains unclosed**: no complete coordinator-only credential/isolated-worker composition or attack proof. [Trailer hook](../../../ops/agent-trailer/prepare-commit-msg) explicitly never fails, cites absent old note and supplies attribution rather than authority. | Do not infer present workers' credentials from old prose or from sandbox names; current credential reach was not audited. Broker coordinator-only credentials and deny worker push/merge/foreign WBS/host access. Close with reserved-action attack set, auditable identity chain and observed unauthorized-action rate.    |
| **SWM-08 Completion/budgets.** Delivery/runtime owner decides acceptance; agent finish alone authorizes nothing; cap tokens/money/time/revisions and checkpoint work.                       | C/T: local coordinator requires accepted WBS progress, has `maxAttempts` retry filtering; API adapter enforces actual SDK step/output limits; WBS budget holds/claim limits are implemented separately. **S7a.06 remains unclosed:** no composed work-item revision/token ceiling tied to `token_estimate`.                                                                 | Existing limits refute “no budget code” but do not prove work-item termination. Implement durable total budget/revision decision across retries/nesting, keep unknown usage explicit; close with cap exhaustion/restart/no-extra-dispatch negatives and an operator resolution path.                                        |
| **SWM-09 Verification/held-out.** Acceptance owner separates implementation, verification and human release authority; hidden acceptance stays hidden, model review is supporting evidence. | C/H: R5 requires production-path fault proofs; extensive actual omission/integrity controls are retained. T rechecks selected positive/negative cases. Gate/pixels are merge requirements; second-model review and exact-SHA host gating are additional procedures, not required human approvals.                                                                           | No operated held-out acceptance unseen by implementer or demonstrated shortcut detection found. W28 creates one inaccessible acceptance suite/known shortcut and retains independent verdict; model review complements deterministic/spec checks rather than certifying correctness alone.                                  |
| **SWM-10 Review capacity/understanding.** Delivery/review owner measures ready→review→merge, revisions, revert rate, reviewer load and retained comprehension as concurrency grows.         | H: October PR/merge counts and large-PR distribution were flow observations. C: W14/W21 explicitly require review queues, operator minutes and failures. L: the complete seven-day sample has 62 merged PRs, median open→merge 3.3803h, nearest-rank p90 81.8486h. It does not measure ready→review, reviewer attention or understanding.                                   | No concurrency-linked review-capacity/comprehension series established. Use a bounded 1/2/4-agent pilot with actual reviewer minutes, change sizes, revision/revert outcomes and explanation/handover check; cap concurrency at demonstrated review capacity.                                                               |
| **SWM-11 Trace attribution.** Observability/runtime owner traces each agent step/tool/transfer/WBS effect to identity and proves attribution under injected failure.                        | C/H: immutable executor/session/operation/owner records, execution history, exact original receipts and correlated dispatch errors now support component attribution. [API recovery verification](../../../openspec/changes/twilight-agentic-workflows/api-recovery-verify.md) retains uncertainty; unsupported recovery is not fabricated success.                         | Component history does not establish end-to-end agent/tool/message traces or an operational diagnostic path. Connect correlation through one synthetic work item and inject a tool failure/coordinator loss; close when an independent operator identifies agent, step, cause and unresolved effect from retained evidence. |

Fresh parent-assessor MCP read at **2026-11-10 19:02 UTC**, project `eeb8e50a…`,
returned all 140 rows with no next cursor ([live evidence](live-evidence.md)):
**I1.05** `130.5` unknown/rev2; **I2.10** `140.10` unknown/rev2; **I3.05** `150.5`
unknown/rev2; **S7a.06** `100.6` unknown/rev7; parent **S7a** `100` in_progress/rev14.
Unknown is not not-started, failed or complete. I2.10 has host admission/usage foundations
but no demonstrated nested-harness bounding/attribution; the other behavior gaps are above.
Parent S7a tasks
6a.3–6a.8 remain open; neither accepted component packets nor the archived local CTT
integration closes safe dispatch/outcome/release, physical recovery, full adapters or dogfood.

## Research reconciliation and priorities

The [October research note](../puni-assessment-2026-10-21/swarm-criteria-research.md)
is a dated lead, not fresh PUNI evidence. Fresh primary-source reads on 2026-11-10:
[scaling study v3](https://arxiv.org/abs/2512.08296) reports strongly task-dependent
coordination gains/losses under controlled configurations; its benchmarks do not certify
PUNI. [Anthropic's research system](https://www.anthropic.com/research/multi-agent-research-system)
reports independent context and breadth-search benefits alongside substantial token
and coordination cost; it explicitly limits applicability to tightly dependent coding.
Inference: qualify work structure and total accepted-outcome cost before adding agents.
No external benchmark, provider-priced trial or new research statistic was reproduced here.

1. **Release/build owner — W03/W12:** close live artifact provenance and finish authorized
   staging/recovery acceptance before claiming standard production delivery; retain immutable source/gate/digest/routing proof.
2. **Dash/security owners — W28/S7a:** finish bounded safe coordinator plus context, nested
   capacity, authority and work-item termination before real governed dogfood; retain production-path negatives and identity/effect history.
3. **Delivery/finance/review owners — W14/W21:** adopt existing delivery/cost receipts in one
   bounded real pilot; include all attempts and operator/reviewer time before any concurrency or margin promise.
4. **Developer-experience/architecture owners — W19/W20/W26:** qualify one independent repo
   and supported rule profile, then repeat by another operator and each offered ownership model.

## Fresh checks and limits

All commands ran locally at initial pin **d87afb94…** with Bun **1.4.4**; their relevant
source/test blobs are unchanged by refresh to **7614ca5…**. No production
behavior, infrastructure, provider account or secret was changed. Each command used
`bun test --preload ./tools/test/scratch/preload.ts … --timeout=10000`:

- `libs/shared/domain/delivery/src/{observation,timing}.test.ts` plus Burokrat
  `src/experiments/{accounting,export}.test.ts`: exit 0, **36 pass, 0 fail, 107 assertions**, 478 ms.
- `tools/tool-deploy/src/k8s/{descriptor,promotion}.test.ts` plus Dash
  `src/coordination/run-coordinator.test.ts`: exit 0, **72 pass, 0 fail, 192 assertions**, 3.94 s.

These tests exercise selected implemented refusals; no guard was removed during this
assessment. R5 causal fault evidence cited above is historical, not a fresh mutation run.
No full Nx/host gate, image build/rebuild, browser, provider/agent run, live deployment,
rollback/kill drill, live credential-reach audit, client onboarding, independent retained-
understanding test, 1/2/4-agent trial or billing reconciliation was performed. Fresh GitHub/
host reads are consolidated by the parent assessor in [live evidence](live-evidence.md).
Private companion was read only as repository metadata at `1226f76e91f213eece7e348b2e6e24b872e59d9d`;
no private configuration/credentials or operational readiness is inferred or published.
