# Twilight delivery plan

Start with **Task 1.0: make the inherited scenarios explicitly exhaustive**, then
prove the compiler and durable-runtime boundary. This is
the single authored product plan. Every checkbox is intentionally unchecked:
the current request delivered planning and a repository workflow trial, not the
factory implementation. Execute against the [design](design.md) and the
[capability specs](specs/twilight/). Design is required for this architecture.
Each task's `Proves` line is a short orientation summary. The
[traceability table](#requirement-coverage) at the end is the complete requirement mapping.

All numerical effort/capacity values below are **planning estimates**, not measured
performance or spending authority. The actor executing an increment receives an
explicit delivery profile and run budget account. Record pinned organization rates,
model tokens, known tool/service cost, agent time, run elapsed and human effort as
their distinct quantities. No automatic spending when budget authority is missing.
The repository gate (`bunx nx format:check --all`, `bunx nx run-many -t test lint typecheck build`,
`openspec validate --all`; `bin/h2puni-gate.sh` on h2puni) and R5 failure proofs apply.

## Product phases

The audience phases own the useful delivery boundary. The numbered milestones
below remain technical dependency landmarks and do not define a releasable product.

| Phase             | Required route                                                                                                                                                                                                                                                                           | Exit                                                                                                                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal loop     | Tasks 1–8 → 11.1 → 13, with Task 15 after Tasks 5–7 and Task 16 joining Tasks 13 and 15. Planning range: about 280–560 human hours and 3.5–9.2M tokens, excluding benchmark, infrastructure and provider spend; re-estimate after Tasks 1–4. This estimate grants no spending authority. | Dany asks the secretary for a change, follows delegated work and searchable evidence, observes frequent branch-dev updates, accepts the current-main composition in production-like staging, publishes that exact candidate, observes dev-main, and explicitly promotes the same artifact to healthy production. |
| Personal maturity | Tasks 9–10 and 12; Task 11.2 after Task 10; Task 14 after the complete operational dependencies                                                                                                                                                                                          | Backlog-backed WBS becomes the planning authority, knowledge operations mature, and a clean/self-growing client fixture proves portability before customer onboarding.                                                                                                                                           |
| Customer phase    | A new OpenSpec change after the A63 discovery gate                                                                                                                                                                                                                                       | A named design partner and concrete problem determine tenancy, packaging, support, recovery and service commitments. This plan does not invent them.                                                                                                                                                             |

Tasks on separate dependency paths may overlap. Phase 1 is incomplete until every
personal-loop exit is observed in production, even if personal-maturity work has
already started.

## Technical milestones and ordering

| Milestone                               | Tasks                                          | Observable exit                                                                                                                                                                                                                                                              | Dependency                              |
| --------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| M0 — repository SDLC trial              | [Pilot tasks](../twilight-sdlc-pilot/tasks.md) | Canonical docs, real CLI counterexamples and attributed plan review; delivered by this request                                                                                                                                                                               | None                                    |
| M1 — usable factory core                | 1–8                                            | Operator starts in FE or MCP under a delivery profile, approves a revision with its budget, executes through a real multi-host K3s worker pool, restarts the service, pipelines deliverables through integration, proves fixed-quality scaling, inspects evidence and ledger | M0; tasks below specify internal edges  |
| M2 — client planning backend            | 9–10                                           | WBS reads/writes complete plans through per-repo Backlog.md with atomic batches, undo and lossless migration                                                                                                                                                                 | WBS refactor closure + M1 planning port |
| M3 — full workflow operations           | 11–12                                          | Multiple agent roles, hooks, capacity, schedules, escalation ladders and wiki operations are configurable and inspectable through all clients                                                                                                                                | M1; M2 for accepting WBS-origin plans   |
| M4 — personal operation and portability | 13–16                                          | Assistant entry, visible/searchable work, branch-dev and staging acceptance, controlled release, tested client upgrades, and factory self-change use the same workflow                                                                                                       | Per-task edges below                    |

M1 and the WBS refactor can proceed independently. M2 must not alter WBS storage
before its entry criteria hold. Tasks 9–16 are bounded follow-on increments: create
their own OpenSpec deltas from the contracts recorded in the design and the
[client repository document](../../../docs/twilight-structure/client-repositories.md)
when their dependencies land, so post-refactor file paths and provider facts are
verified at the correct revision. They are not permission to begin a migration now.

## Common execution contract

One implementation owner per slice and an independent review at its end. Use
separate worktrees for concurrent slices and isolate ports, databases, caches and
credentials. Slices use the `balanced` quality settings and an explicitly approved execution
envelope. The [execution profile](../../../openspec/schemas/twilight-v1/execution.yaml)
owns defaults and acceptance budgets; provision supporting pools within grants
when increasing fan-out. One writer owns each workspace lineage. Exhausted rework
pauses affected unresolved work with evidence; verdicts never average into a pass.
Use deliverable contracts to overlap independent work and feed the integration queue.
No implementation slice starts merely because this proposed plan names a budget.
Tasks 1–8 execute through the M0 repository workflow, with the selected profile,
envelope and budget recorded manually in the ledger-shaped acceptance receipt.
After M1 acceptance a later slice may use the factory; Task 14's canary is the
first slice required to do so.

For each behavior: write the production-path negative, observe failure, implement
the minimal contract, observe the positive, inject the named realistic fault and
observe that assertion fail, restore and run affected/full gates as appropriate.
Record the actual failure before the adjacent `Proof:` comment. Unit tests for
pure predicates do not replace request, restart, race or browser tests below.

## Task 1: Compile a workflow and prove durable restart

Proves: Versioned inspectable workflow configuration; Lifecycle points are the
one key space; Executable restore compatibility (A39, A47).

- [ ] 1.0 Convert inherited delta scenarios to explicit non-vacuous Given/When/Then and establish the coverage ledger/validator.
- [ ] 1.1 Prove the pinned Bun/LangGraph/checkpointer interrupt/restart contract and record a go/no-go decision.
- [ ] 1.2 After 1.1 passes, deliver the compiler, contracts and non-vacuous Nx targets.
- [ ] 1.3 Before Task 2, record go/no-go evidence from a bounded authenticated ACP capability/usage probe and one manual gVisor runtime-class smoke on an identified candidate host.

**Owns:** new `tools/tool-twilight/project.json`, `tools/tool-twilight/src/compile.ts`,
`tools/tool-twilight/src/validate-scenarios.ts`,
`tools/tool-twilight/src/validate-scenarios.test.ts`, the
`tool-twilight:scenario-check` Nx target, its required CI invocation,
`registered:repository-gate`, `registered:browser-gate` and
`registered:scenario-coverage`,
`tools/tool-twilight/src/testing/fixture-registry.ts`,
`libs/twilight-contracts/src/workflow.ts`, `libs/twilight-contracts/src/profile.ts`,
`libs/twilight-runtime/src/workflow/compile.ts`,
`libs/twilight-runtime/src/workflow/compile.test.ts`,
`libs/twilight-runtime/src/workflow/checkpoint.db.test.ts`,
`libs/twilight-runtime/src/workflow/restore.ts`, `restore.db.test.ts`, and the
shipped `openspec/schemas/twilight-v1/execution.yaml`, which this task turns from a
proposed document into a validated input. Fold Nx/tsconfig setup into this task.

**Depends on:** M0. **Produces:**
`compileWorkflow(inputs: WorkflowInputs): CompiledWorkflow`, whose inputs include an
explicit immutable organization snapshot, `CheckpointPort` with
persisted run/thread/revision identity, selected package pins and a compatibility
record including each capability pool's worker-image digest, and
`WorkflowRestore.restoreRun(runId)` as the only checkpoint-loading
entry, owning executable resolution, compatibility and revision reconciliation.
The runtime-validated input schema is canonical.

Task 1 also supplies a test-only complete implementation registry whose fakes have
independent call counters and cannot be loaded by a production bootstrap. Tasks
3–6 inject it when exercising run persistence, admission and live low-risk worker
fixtures before Task 7 registers the production factory-core implementations.
Production run creation continues to refuse the incomplete registry. Deleting the
test-only bootstrap guard and loading a fake in production must fail its boundary
test; no pre-Task-7 test may claim an end-to-end factory run.

1.3 probes the first provider's session load/resume, cancellation, permission
interception and usage reporting without building the adapter, and proves that
the live ACP/Bun/Git/filesystem fixture can start inside gVisor on one candidate
host. Failure stops before Task 2. Task 6 still owns `k3s-preflight`, the three-node
cluster and the complete containment suite.

**Acceptance:** the same Git inputs and organization snapshot yield the same digest,
forms, resolved activity plan and effective policies with origin scope; changing
either changes the digest. The compiled stage DAG follows `stages[].after`, retains
scoped ordering boundaries for disabled stages and cannot auto-start the release command;
expand implementation/review/verification per deliverable, join only declared
candidate members at integration, and join required outcomes at handoff;
artifact readiness edges never become stage edges. Profiles resolve a total activity
map: agent activities have an allowed class/per-activity model, tool activities have
a registered implementation and no model. Every run pins an immutable floor
revision; inherited floor obligations resolve enabled, while unavailable required
implementations refuse selection. Unknown fields,
cycles, incomplete maps and inconsistent activity settings are errors. Package
selection uses current primary release/API docs, respects the LangGraph JS floor
that node timeouts and cooperative drain require (research recorded `>= 1.4.0`;
verify against the release at
selection time) and records actual lockfile pins. Start with synchronous
checkpointing and change only on the driver's crash-test evidence. Prove the
selected pair runs under Bun, persists before interrupt, and resumes after process
termination. If the selected adapter fails, test a supported external checkpoint
store before changing runtime language; record that decision before Task 3.

**Tests:** `compile rejects unreadable required template`, `compile rejects
unsupported beforeTool policy`, `compile rejects a hook point naming an undeclared
activity`, `compile rejects an override below a floor`, `compile rejects an enabled
money-capped model without an organization rate`, and `checkpoint resumes the same
pending decision after SIGKILL`. The CLI requires `--organization-snapshot`; missing,
unreadable, wrong-organization and digest-mismatched snapshots fail with no embedded
fallback. Replace `onTrigger.*` with undeclared `onTrigger.schedule` and require the
compiler error to name that point. Remove one `after` edge and separately derive
stage order from artifact requirements: the compiled edge-set or
cycle/missing-order assertion must fail.
Delete an activity entry, attach a model to a fixed tool gate, and disable an
activity required by the selected floor; each must fail the profile-completeness
oracle. Pin the built-in matrix: thorough browser scope is whole, balanced is
affected, economy browser/judge/discovery review are disabled, the critic and
specification critique remain enabled, and every profile runs the fixed integrated
gate with no depth control. Assert that economy's raw browser default is false and
its factory-core resolved browser activity is enabled with floor origin; an explicit
disable override must fail. M1 selects `factory-core`, under which branch dev,
the `dev-sweep` trigger workflow, staging, cloud acceptance, publication and
dev-main are disabled. Selecting
`personal-delivery` before every Task 13 adapter is registered must fail; after Task
13 publishes it, its inherited obligations resolve enabled. Delete the required input/make
it unreadable in separate probes; replace the durable saver with memory and observe
the restart test fail; bypass the floor/rate checks separately and observe their
negatives fail. This does not yet prove external-effect deduplication.

Before 1.1, 1.0 inventories every current requirement's normal, failure, boundary
and recovery cases in a machine-readable `Coverage:` block within that requirement,
adding an explicit inapplicable reason for each category that does not apply. The
validator rejects a missing Given/When/Then and a clause that merely repeats the
scenario heading. `specification.scenarios` runs the validator in every profile;
CI runs the same Nx target. Inject each structural/coverage fault and watch that
target and `adopt_plan` fail. The floor's independent specification critique reviews
semantic exhaustiveness; unresolved findings also block `adopt_plan`. OpenSpec CLI
parse success alone cannot satisfy 1.0.

Resolve `quality` through the same workflow publication: hash its definition,
rubric and observation set, require evaluation-publisher capability plus a human
decision on changes, and pin those hashes at request creation. Mutate a rubric
without changing its digest and bypass publication authority separately; the digest
and denied-publication assertions must fail. Task 7 supplies its registered observer.

Retain controller/graph, compiler, runtime/lock, serializer/saver, application schema
and hook/adapter digests. Exercise an old pending-approval checkpoint on a compatible
new controller and assert the same subject/transition and pinned hook behavior.
Separately remove a pinned executable, make it unreadable, substitute the latest
hook under the same name, and present an unsupported serializer/schema. Each must
refuse before a fixture worker/effect counter increments; a compatible positive
must increment it after approval. Bypass compatibility to prove those assertions
can fail. Task 8 adds the uncertain-effect upgrade/rollback fixture once Task 4 exists.

**Commands established by this task:**
`bunx nx run tool-twilight:compile -- --repository <fixture>
--organization-snapshot <snapshot> --json` and
`bunx nx run tool-twilight:scenario-check -- --change <name>` and
`bunx nx test twilight-runtime`. CI invokes `tool-twilight:scenario-check` for all
active changes. Add lint and source/spec typechecks that compile
actual files; inject a deliberate type error to prove those targets see them.

Record separate evidence for each checkbox: 1.1 uses a minimal graph independent
of the compiler; 1.2 proves compilation against that selected runtime boundary.

**Estimate:** 8–16 human engineering hours (4–8 per deliverable); 2–5 agent elapsed
hours; 120k–360k tokens, one execution slot. Stop on unresolved checkpoint
durability or compiler authority.

## Task 2: Define client repository identity and the planning port

Proves: The factory uses the client repository contract; A planning revision has
one owner; Plan resource units are carried without conversion (A43).

- [ ] 2.1 Validate a clean client fixture and read one revision-bound plan without copying puni content.
- [ ] 2.2 Carry per-task resource units through the planning port and prove no unit is converted.

**Owns:** `libs/twilight-contracts/src/repository.ts`,
`libs/twilight-runtime/src/repository/manifest.ts`,
`libs/twilight-runtime/src/planning/openspec-plan.ts`,
`libs/twilight-runtime/src/planning/units.ts`,
`tools/tool-twilight/src/repository.test.ts`, and
`tools/tool-twilight/fixtures/client-minimal/`.

**Depends on:** Task 1 contract. **Produces:**
`readRepository(root: string): RepositoryManifest` and
`PlanningPort.readPlan(reference: PlanRef): Promise<WorkPlan>` using the design's
repository/plan/change/source identity tuple. `WorkPlan` contains stable task IDs,
dependencies, requirements, owner, resource units in the ledger vocabulary beside
WBS workdays, source revision, interface outputs, write scope, acceptance oracles,
and estimated agent-duration provenance. Explicitly model unknown duration without
workday conversion. Distinguish real predecessor contracts from resource conflicts;
validate missing/duplicate predecessors and cycles before scheduling. A future Backlog implementation satisfies that port.

Validate stable repository ID/version/context roots, the manifest's planning,
profile and policy references, and reject required paths outside the authorized
repository. Build task briefs from actual `Task N` headings and stable deliverable
IDs such as `1.1`/`1.2`; preserve multiple deliverables per group and compare
extracted task IDs/count/order to a pinned fixture, including two changes with
identically named `tasks.md`. No shared `.superpowers/sdd/tasks` directory can
collapse their identity.

**Tests:** `fresh fixture needs no home skills`, `two repositories cannot resolve
each other's plans`, `task briefs preserve dependency and proof fields`,
`malformed task artifact refuses execution`, `a workday-only task reports agent
units absent`, `no unit is converted into another`. Inject a cross-repo path,
missing skill package, duplicate task ID and old parser format; each must fail
before run admission. Inject a workday-to-token conversion in the port and watch
the units test fail. Test symlink escape at the actual read boundary.

Use a versioned change-keyed plan-lock fixture with two changes and immutable input
receipt snapshots, including an explicit empty snapshot. Reject missing/unreadable
snapshots separately, mismatched map key/change/export path, and a lock that tries
to consume its candidate's own output receipt. Adding a later output receipt must
leave the earlier candidate's lock and its exported `tasks.md` byte-identical.

Run the clean-client fixture in a disposable container with empty home and XDG
directories, passed through the container runtime's supported options. Do not
repurpose the shell's `HOME`/`CODEX_HOME` variables. It must succeed using packaged
repo skills; injecting a required reference to an absent home skill must fail at
the same resolver. Record both controls before claiming independence from home setup.

Bootstrap binds repository/organization/policy/integration references through a
trusted operator command before first use, and `get_effective_policy` returns those
bindings. The manifest distinguishes initial `openspec` planning from later
`wbs-backlog`; untrusted content cannot grant its own server access. Test a missing
binding and a second repo claiming the first's ID.

**Estimate:** 5–10 human hours; 1–3 agent hours; 90k–220k tokens, one slot.
Can overlap Task 3 after shared Task 1 contracts are frozen.

## Task 3: Persist authorized runs and revision-bound approvals

Proves: Bounded request-to-plan authoring; One authorized command surface;
Revision-bound human decisions; Caller identity and human-decision provenance;
Current authority constrains pinned runs; Profile overrides and epochs are explicit
(A30, A36, A38, A40, A42).

- [ ] 3.1 Extract be-01's migration runner into a shared library and write the first Twilight migration through it.
- [ ] 3.2 Implement and verify OIDC caller identity and interactive decision-token issuance.
- [ ] 3.3 Implement `authorizeAction` as the single authority boundary.
- [ ] 3.4 Expose submit/revise/adopt/read/command/decision operations with atomic transition and outbox records.

**Owns:** `libs/migrations/` (extracted runner, `down.sql` rule and lint),
`apps/twilight-be/src/app.ts`, `runs.ts`, `artifacts.ts`, `approvals.ts`,
`decision-tokens.ts`, `auth.ts`, `auth.integration.test.ts`,
`libs/twilight-contracts/src/operations.ts`,
`libs/twilight-domain/src/run.ts`, `approval.ts`,
`libs/twilight-runtime/src/authority/authorize.ts`, `authorize.test.ts`,
`libs/twilight-runtime/src/repository/run-store.ts`, migrations plus `down.sql`,
`apps/twilight-be/src/run-lifecycle.db.test.ts`.

**Depends on:** Task 1; Task 2 to bind real repo/plan identity. **Consumes:** the
command contracts in design. **Produces:** the shared operation contracts every
client uses, `submitRequest`, `reviseArtifact`, `adoptPlan`, `commandRun`,
`decideApproval`, `mintDecisionToken`, and event/outbox interfaces used by worker
and clients.

3.1: extract `apps/be-01/src/repository/migrate.ts`, `migrate-down.ts` and the
connection-opening pragma assertions into the shared library that both apps and
the checkpointer call, keeping the `down.sql` rule, migration lint and the
`bun:sqlite` import lint; its existing `.db.test.ts` cases run unchanged against
the extracted module.
If extraction would change be-01 behavior, stop and record an ADR before any
Twilight migration is written.

3.2: reuse `JwksTokenVerifier` and `browserOidcClientFromEnv` from `libs/auth`
after reading their tests and the existing be-01 auth/boot callers. Configure a
separate Twilight OIDC client/audience and durable server-side browser session; no
copied WBS identity database or auto-provisioned organization membership. Implement
the browser-session-only decision-token endpoint. Test wrong audience/issuer,
callback replay, missing CSRF/origin binding, revocation, single-use expiry and
wrong intended consumer; a real local OIDC/JWKS test issuer plus the browser flow
supplies the positive control. Prove that a Twilight-MCP-audience token is refused
by BE directly and that the service credential cannot act without a verified actor.
Extend the protected local-operator command class with an interactive decision path
for `resolve_effect` and `release`: it requires local installation-operator
authentication, explicit subject confirmation, single use and the same audit and
revision binding as the browser flow. Agents and ordinary service/MCP tokens cannot
invoke it.

3.3: `authorizeAction` intersects pinned requested/approved scope with current
grants, floors, approval validity and integration grants. BE routes and Task 4's
dispatch use that module; callers cannot construct their own ordering or treat an
earlier decision response as an enduring grant. Hold approved work queued, then
independently revoke membership, repository grant, approval or integration grant
and tighten a safety floor: each admission refuses with its reason and no launch.
Relax a floor and ask for a capability outside the original approval: still refused.
Remove the current/pinned intersection and observe each negative fail.

3.4: derive actor from verified auth; validate the request boundary once. A request
names its delivery profile, revision and keyed overrides with a reason. Overrides
replace named scalar/map fields, replace arrays wholesale and inherit unspecified
fields; unknown keys and inconsistent activity controls are refused. They may move
in either direction within allowed provider/model/effort capabilities, current
grants, immutable floors and approved spending; categorical models have no inferred
cheaper/better order, and profile defaults are not authority limits. The approval
subject digest covers the execution envelope defined by the spec. Derive a schema
for its pinned scope/quality/lineage, permitted model and capacity ranges, spending
ceilings, capabilities and expiry; omitted ranges allow only the selected value.
Expose envelope revision/digest on every decision and attempt. Persist decision attempts, subject
revision/digest, expiry, policy revision and effect scope. Return 409 for stale
revision, 403 for insufficient scope, 422 for invalid workflow or profile
combination. All writes deduplicate command IDs with parameter digests. Exercise
every decision-token scenario in the spec against the actual BE endpoint:
lost response then exact retry after expiry returns one receipt and one admission;
consumed token with another key, changed parameters or wrong consumer is refused;
an expired unconsumed token is refused. Inject consumed-token checking before
exact-retry lookup and observe the lost-response test fail; bypass token-to-command
binding and observe the different-command test fail.

An accepted profile change creates an immutable profile epoch for work not yet
admitted. In-envelope choices retain the approved subject; only proposed envelope
expansions await another decision. Running/draining
attempts retain their epoch and reservations; usage, holds, rework and the original
run clock never reset. Ordinary profile publication affects new runs only. Reduced
fan-out queues surplus new attempts. `skipActivity`
is the same audited activity-enable override, cannot target running/completed work,
and cannot erase findings or stale evidence. Hold one attempt running and one queued
across a change, then assert their different epoch digests and one cumulative budget
account. Inject an in-place mutation of the running attempt, a rework reset and a
second skip-state field; each must fail its persisted-transition oracle.

Record an epoch-A effect intent, propose an out-of-envelope epoch B awaiting approval,
then dispatch A under its unchanged decision: A reaches the receiver once, B never
starts. Repeat with A's decision revoked before dispatch: no request arrives.
Inject run-wide approval invalidation and out-of-envelope authority reuse separately;
the positive-A and denied-B receiver counts must detect each fault. Also raise fan-out
and choose a permitted model inside A's envelope through the real API: a new epoch
starts with no second human decision. Restore unconditional epoch reapproval and
watch the new-worker launch assertion fail. Exceed each range independently and
remove its boundary check to observe an unauthorized launch before writing Proof.

Implement `revise_artifact` and `adopt_plan` with expected revisions, coverage and
resource validation. A new request uses its selected discovery envelope for
research/artifact work; it cannot edit product code or launch implementation
until plan approval. Test an empty request through real API artifact creation and
adoption, malformed/incomplete plan refusal, and a discovery agent attempting a
product-code write. No fixture-only file write may supply the missing plan. With a
null envelope, manual authoring succeeds and automated discovery and model spend
stay refused.

**Representative production-path test contract:**

```ts
const pending = await fixture.submitPlan('revision-a');
await fixture.replacePlan(pending.runId, 'revision-b');
const decision = await fixture.approve(pending.approvalId, 'revision-a');
expect(decision.status).toBe(409);
expect(await fixture.admittedActivityCount(pending.runId)).toBe(0);
const current = await fixture.currentApproval(pending.runId);
expect((await fixture.approve(current.approvalId, 'revision-b')).status).toBe(200);
expect(await fixture.admittedActivityCount(pending.runId)).toBe(1);
```

Build the fixture against the actual Elysia app/store, not copied policy logic.
Count committed admission/outbox records at this stage; Task 6 repeats the
stale/refreshed approval test against an actual worker launch counter. Additional
tests cover duplicate FE/MCP start, A→B→A subject revisions, expired or revoked
decisions, agent-provided `approved:true`, and client-B evidence present while
client-A reads it. Kill between store transaction and graph checkpoint and prove
outbox reconciliation preserves one transition.

**Estimate:** 14–28 human hours; 3–8 agent hours; 220k–560k tokens, one writer slot.

## Task 4: Admit resources, keep the ledger and recover uncertain effects

Proves: Capacity and budget admission; Durable stage and activity lifecycle;
K3s provides an expandable worker substrate (port half); Levers are configurable
and their effects are measured (ledger and rate card halves); Run clocks preserve
distinct time quantities; Model pricing is revision-bound and category-complete
(A41, A46, A49–A50).

- [ ] 4.1 Reserve resource vectors before launch and fence owners.
- [ ] 4.2 Persist effect intent, dispatch through the fence, reconcile and settle.
- [ ] 4.3 Write the run ledger, price it from the rate card and expose capacity and rate-card operations.
- [ ] 4.4 Schedule feasible ready deliverables and request constrained capacity within existing grants.
- [ ] 4.5 Prove dispatch latency and isolation under the coordinator acceptance load.

**Owns:** `libs/twilight-domain/src/admission.ts`, `ledger.ts`,
`libs/twilight-runtime/src/execution/admit.ts`, `lease.ts`, `effects.ts`,
`worker-provisioner.ts`,
`libs/twilight-runtime/src/ledger/ledger.ts`, `rate-card.ts`,
`apps/twilight-be/src/effects.ts`, `capacity.ts`, `rate-card.ts`, `ledger.ts`,
`apps/twilight-be/src/admission-race.db.test.ts`,
`libs/twilight-runtime/src/execution/effects.db.test.ts`,
`libs/twilight-runtime/src/ledger/ledger.db.test.ts`.

**Depends on:** Task 3. **Produces:**
`admitActivity(command: AdmissionRequest): Promise<AdmissionDecision>`,
`dispatchEffect(request: EffectRequest): Promise<EffectOutcome>`,
`reconcileEffect(effectId: string): Promise<EffectOutcome>`, `settleAttempt`,
`WorkerProvisionerPort` with `launchAttempt`, `observeAttempt`, `stopAttempt` and
`readWorkerCapacity`, one run-scoped `BudgetAccount`, `recordLedgerEntry`, and the `get_capacity`,
`set_capacity`, `publish_rate_card`,
`read_ledger` and `resolve_effect` operations. Intent persistence, provider
transport, fence/authority validation and resource release are private to effect
execution. Admission outcomes are `queued`, `admitted`, `denied`; effect outcomes
`succeeded`, `failed`, `unknown`; every reason is visible.

The M1 organization-snapshot schema includes `agent`, `secretary`, `workspace`,
`reviewer`, `build`, `browser` and `branchDevEnvironment` pools even when a selected
floor does not yet request the later pools. Unknown pool kinds still fail.

**Tests (4.1):** barrier-synchronized concurrent requests for one remaining slot;
two pools with one unavailable (no partial reservation); expired owner tries to
publish/free a replacement lease; fan-out beyond the active profile epoch holds the
surplus as `queued` naming that epoch; queue aging/client ceilings, reviewer
reservation and hold-free waiting on a human decision. Reducing fan-out below the
occupied count starts no replacement until occupancy falls; erase occupied slots on
the profile change and watch the launch-count oracle fail.

Occupy every agent slot and admit the tool-only repository gate with a free build
slot: it starts without an agent lease. Compete two browser gates for one browser
slot and admit only one. Inject the old agent wildcard and remove the browser
resource demand separately; launch counters must observe both errors.

**Tests (4.2):** SIGKILL after an external fixture server records success but
before acknowledgment; cancellation while the worker ignores its first signal. The
fixture effect server exposes an independent request counter and receipt query.
Assert that counter remains one after restart, then remove reconciliation and watch
it become two. A cancelled worker's slot remains occupied until its exit is
observed; mutation releases it early while the process is alive and must fail a
launch-count assertion. Add these distinct production-path experiments; none is
covered by deduplicating a repeated key:

| Proposed fault                             | Scenario and independent oracle                                                                                                                                                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skip attempt-fence validation on dispatch  | Keep expired attempt A alive, grant replacement B an isolated workspace/fence, then have A submit a new effect key. Receiver request count stays zero for A and increments for authorized B; removing the fence must increment A's counter.                                      |
| Check authority only at admission          | Hold a recorded tool/hook intent before dispatch, revoke its grant or tighten the floor, then release the barrier. External receiver sees zero requests; removing dispatch revalidation must produce one.                                                                        |
| Reuse a writable workspace on lease expiry | Keep an old writer modifying a sentinel after expiry. Replacement cannot mount that workspace until the writer/mount is verifiably detached; remove that condition and observe conflicting writes.                                                                               |
| Release remote resource on local PID exit  | Worker exits while fixture provider/browser job remains active. Replacement stays queued; only independently queried terminal state releases it. Missing/unreadable remote state retains the hold. Remove remote terminal validation and observe a second concurrent remote job. |

Exercise cancellation/revocation on both sides of dispatch admission: before commit
must prevent the request; after dispatch must reconcile/stop it without claiming it
was unsent. Unknown spend remains unresolved in accounting; abandoning an unknown
effect outcome does not release a still-active remote reservation. Add
`resolve_effect` with scoped decision authority, expected effect/run revisions,
evidence references and the three dispositions; exercise acknowledgment loss with
a provider lacking a receipt query, refuse a second resolution as stale, and prove
confirming non-application grants no new dispatch.
An `abandon_unknown` resolution may separately name a held resource and an
out-of-band recovery reference, such as a provider console or invoice, to release
only that reservation. The recovery-operator disposition is audited and
revision-checked and does not change the effect's `unknown` outcome. With the
evidence store or telemetry sink unavailable, cancel, fence, drain and
`abandon_unknown` must still commit the unavailable reference and keep the run
`reconciling`; inject each unavailable sink on the production path.

**Tests (4.3):** exercise the run-account, hard/advisory limit, pricing and clock
rules in the [capacity/budget requirement](specs/twilight/control-plane/spec.md#requirement-capacity-and-budget-admission).
With cap 40, settled 10 and held 1, 29 is admissible, 30 is not, and a cap below 11
is refused. Discovery, retries, children and cancellation share that account id.
Mint an account on retry and bypass the hold separately; the stable
account-id and receiver-count oracles must fail. Advisory without finite hard limits,
hard limits below/dimensionally different from their targets, unknown spend without
a defensible hold/stop, and new dispatch at cap are refused;
target crossing only warns. Four parallel 30-minute agent sessions report 120 agent
minutes and 30 wall minutes. A profile change cannot reset original run/deadline
time; inject summed parallel intervals and a reset clock to fail those exact duration
and launch assertions.

For `moneyScope: delivery`, supply known tool/service/human charges beside model
spend and assert all charge the cap; inject omission of a tool charge to admit an
over-budget dispatch and fail the receiver-count oracle. Switching from model to
delivery scope with missing historical charges is refused; complete history carries
those charges and holds into the same account. A model-spend cap is labeled as such.
Retain stable charge identities, quote/rate revisions, maxima and receipt allocations;
retry a charge report without double settlement, refuse a service with no bounded
charge capability, and leave a shared invoice incomplete until its allocations sum
to the bill. Inject duplicate settlement and a missing-allocation-as-zero fault;
the account total and refused scope-change assertions must move.

Ledger entries retain profile epoch, actual timestamps, planned/reserved/measured
token categories, pinned estimated money, separate billed/tool/service cost, waits,
agent time, serving model and availability. Inject measured-overwrites-planned,
input-plus-cache double charging and unknown-as-zero; each fails its field assertion.
Current rates re-evaluate new holds without repricing settled attempts.
`set_capacity` and `publish_rate_card` refuse a non-administrator and are evented.

Derive the efficiency breakdown from those same ledger entries: reconcile outcome
cost through requests, runs, attempts, model turns, token categories,
activity-scoped tool-definition overhead, failed context lookups, adapter polling
cycles and rates. Use nested identities for denominators, reconcile disjoint token
categories through rates, and keep attributed tool-schema tokens inside input
tokens; byte-only schema observations remain unpriced. Record source coverage and unavailable factors. Inject a dropped
failed attempt, cache tokens counted as both input and cache, and an unavailable
tool-schema contribution treated as zero; each must fail the reconciled total or
coverage assertion. Preflight a declared required context source before reserving
the full attempt allowance, and test both absence and unreadability on the
production admission path. Registered bounded pollers report cycles/tool time
without model turns; move the poll into model turns and watch the turn-driver
assertion fail.

Mark diagnostics complete, sampled with a revision, or unavailable. Measure the
instrumentation's own bytes, tool time, latency and failures against its overhead
budget; inject a sampled tool trace as mandatory settlement evidence and watch the
production consumer refuse it. Store one provider charge shared by two activities
once; without an allocation receipt whose members sum to it, both activity shares
remain unavailable. Duplicate the charge and invent equal shares separately to
fail run-total and coverage assertions. Append a late billed receipt as a new
as-of revision, emit a pricing-drift finding at the configured materiality
threshold, and preserve the prior estimate. Compare currencies only with one
pinned conversion revision; removing it makes the ranking unavailable.

**Estimate:** 12–22 human hours; 3–7 agent hours; 200k–560k tokens, one build slot
and two lightweight child-process slots for race tests.

4.4 owns `libs/twilight-runtime/src/scheduling/ready.ts`, `capacity.ts`,
`libs/twilight-runtime/src/execution/worker-provisioner.ts` and
`scheduling.db.test.ts`; consumes Task 2's `WorkPlan`, Task 3's execution envelope
and `admitActivity`. It produces `selectReady` (selected IDs, scores and blocked
reasons) and `requestCapacity` (requested/granted/refused with pool and reason),
using a registered `WorkerProvisionerPort` rather than
organization-administrator credentials. The port signatures and validated request,
receipt, observation and capacity types are those in the design's K3s topology;
Task 6 implements them. A provisioner observation cannot mint a reservation,
increase a grant, authorize a launch or settle an effect.
First hold a browser task and observe independent backend work launch; inject
head-of-queue-only selection and observe no backend launch while the barrier holds.
Pin two explicit duration chains below the aging window and observe critical-path selection; inject reversed
ordering to fail the selected-ID assertion. Hold a short feasible task until the
literal aging window while continuously adding longer unaged chains; it must start
when capacity is released. Restore chain-first ordering and watch that launch fail.
Check unknown-estimate fallback and
bounded reviewer-reserve borrowing. Raise fan-out with an unchanged pool and assert
the limiting pool is shown; grant supporting capacity and observe additional starts.
Deny the provisioner and assert refusal remains visible without invented capacity.
Record current repository-gate and browser-gate durations on `h2puni` as the
initial estimate provenance for `requestCapacity`. Build and browser capacity used
by the unconstrained scaling control comes from separately labeled K3s nodes with
their own locks and independent launch counters, not from the agent-pool count.

**4.4–4.5 planning allowance:** 16–32 human engineering hours, 4–8 agent hours,
200k–500k tokens, plus separately authorized load-test service charges. These
unmeasured values supplement admission/accounting work and grant no spending.

4.5 uses `libs/twilight-runtime/src/execution/dispatch-load.test.ts` and a controlled
external receiver. Run `scalingAcceptance.coordinator` through `dispatchEffect`,
record host/fixture identities, offered/completed rate, queueing and latency samples.
Record the host storage and fsync characteristics beside those samples.
Hold one remote response while unrelated effects dispatch. Inject a remote await
inside the serialized boundary and watch unrelated dispatch exceed its budget;
separately repeat revocation/fence faults under load. Missing or failed samples
block the supported-capacity claim; multiple coordinators remain a separately
specified response to a measured limit. Run these new suites through the runtime's
Nx test target; record positives and injected failures before Proof comments.

## Task 5: Deliver the FE/MCP run and configuration loop

Proves: One authorized command surface; Versioned inspectable workflow
configuration; Observable evidence with focus access (client halves) (A36).

- [ ] 5.1 Expose the shared operation contracts through authenticated Streamable HTTP MCP and prove BE parity.
- [ ] 5.2 Deliver request/artifact/run/approval/recovery browser journeys against the real BE operations.
- [ ] 5.3 Deliver configuration preview/publication, effective-policy and floor operations, and prove repository CAS and CLI digest parity.
- [ ] 5.4 Deliver the focus brief, resume behavior and Chromium accessibility checks.

**Owns:** `apps/twilight-fe/src/routes/runs.tsx`, `workbench.tsx`,
`workflow-editor.tsx`, `approval.tsx`, `capacity.tsx`, `evidence.tsx`,
`recovery.tsx`, `levers.tsx`, `efficiency.tsx`, `apps/twilight-mcp/src/server.ts`,
`apps/twilight-be/src/policy.ts`, `apps/twilight-fe/e2e/workflow.spec.ts`,
`apps/twilight-mcp/src/server.test.ts`.

**Depends on:** Tasks 2–4. **Consumes:** the operation contracts from Task 3.
Read `apps/mcp-01/src/http.ts`, `oauth.ts`, `server.ts` and their request/auth
tests before deciding reuse of the existing Streamable HTTP transport and verifier.
Do not reuse its per-request bearer forwarding (A36; refusals proven in 3.2). Do
not carry WBS-specific identity or permission rules into Twilight merely because
the transport matches. **Produces:** schema-derived forms and MCP descriptions
calling that BE; no alternate state transitions or permissions in the clients;
`get_effective_policy` and `publish_floor`. Start with the shipped hooks and one
agent role; every control in the spec's M1 control set is visible with effective
value, origin scope and restriction. Unimplemented expansion controls are
explicitly unavailable, not inert switches.

**Tests (5.1, 5.2):** submit in browser/read same run through MCP, then reverse;
duplicate submit returns same run; approval UI displays the exact diff including
profile and budget and issues a subject-bound human decision token; an agent MCP
token cannot approve without it. Block a request in flight and assert the UI has
not optimistically accepted the decision. Restart BE during approval, reload the
page, and recover the same pending state. Drop the decision response after commit
and retry with the same command identity: the UI and MCP show the original receipt
without minting a second token. Show live revocation against the retained pinned
definition, incompatible-restore recovery, and a cancelled local worker whose
remote slot remains visibly held. Start the browser journey with no artifacts or
plan: create/revise intent/specs/tasks in the workbench or via authorized
discovery, adopt the complete plan, and approve its exact revision through real
operations. Include recovery inbox resolution, a skip of a non-floor activity with
a reason, and an out-of-envelope mid-run proposal that requires a new approval. Both clients show
the resolved total activity plan, per-activity model replacements, budget account,
deadline origin and ordered profile epochs; a mixed-epoch run is never presented as
single-profile. Change a profile while an activity is held running and assert the UI
and MCP retain its old epoch while the queued activity shows the new one; collapse
both onto latest-profile and watch the parity assertion fail.

While a held attempt can still be cancelled, show settled spend, outstanding
holds, versioned warning thresholds, hard-cap headroom and coverage per dimension
through the shared FE/MCP contract. A hold consuming the last allowance shows zero
headroom on both surfaces. Remove it from one projection and watch parity fail;
treat an unavailable delivery charge as zero and watch the complete-headroom
assertion fail. Emit one event per configured warning-threshold crossing and prove
a repeated read or reconnect does not create another crossing.

**Tests (5.3):** publishing a workflow creates canonical repository inputs and pins
the immutable organization snapshot it used: check out the published revision and
compile with that snapshot to the same digest; omission, wrong organization and a
competing Git edit refuse rather than selecting defaults or divergent policy.
Configuration preview shows repository requests separately from organization
floor/pool/rate authority, plus every resolved setting's effective value, origin and
restriction. Exercise scalar/map replacement, whole-array replacement, inheritance,
unknown keys and both authorized directions without a model-order heuristic. A floor
violation is rejected through FE and direct MCP; `publish_floor` by a
non-administrator is refused and a tightened floor constrains a queued run. Remove
the snapshot pin or merge arrays by index and watch digest parity or resolved-plan
equality fail.

The capacity view and `get_capacity` MCP result show the registered provisioner,
identified K3s server and agent nodes, readiness/drain state, tested capability
labels, allocatable/reserved resources, queued placement reason and correlated
Job/Pod identity. Cluster API or telemetry loss is unavailable with its source and
reason, never zero capacity or a healthy worker. The UI links the pinned manual
join/drain runbook but exposes no inert node-autoscaling switch in M1. Hold a stale
ready observation after a node disappears and remove the unknown state separately;
the UI/MCP capacity and queued-reason assertions must fail on those faults.

**Tests (5.4):** the focus brief carries the same failure and decision as the full
view, offers one next action, retains full evidence access, and resumes after
reload; the focus profile is a per-actor preference that changes no obligation.
Test keyboard/accessibility and browser default actions in Chromium. Use owned
ports/DBs and assert served source identity before counting a pass (Task 8 owns
the whole-browser-gate rule).

Keep one acceptance receipt per deliverable. 5.2, 5.3 and 5.4 all consume 5.1's
contracts; 5.4 must not change what 5.2 and 5.3 display.

**Estimate:** 18–36 human hours; 4–10 agent hours; 280k–860k tokens, one browser
slot and one frontend writer. Can overlap Task 6 after contracts are stable.

5.2/5.3 also cover execution-envelope inspection/approval, scoped deliverable
progress and the constrained-pool explanation. Drive an in-envelope adjustment
through FE and MCP against held real BE requests: no approval card is created and
new work starts only after acknowledgement. An expansion shows the changed bounds
and admits nothing before its human decision. Tests read the pending window; a
later settled UI cannot prove absence of optimistic authority.

## Task 6: Execute one real ACP activity on the K3s worker pool

Proves: Capacity and budget admission (egress and lease halves); Levers are
configurable and their effects are measured (serving model and escalation); K3s
provides an expandable worker substrate (runtime half) (A34, A41, A49–A50).

- [ ] 6.1 Deliver the ACP adapter contract, capability document and deterministic protocol tests.
- [ ] 6.2a Prove host, allowance, registry, identity, provider and observer readiness and provision the real three-node acceptance cluster.
- [ ] 6.2b Deliver the provisioner and immutable Job specification with privilege canaries.
- [ ] 6.2c Prove runtime-class isolation and workspace persistence/reclamation.
- [ ] 6.2d Reconcile duplicate start, scheduling, eviction, drain, node loss, API loss and rebootstrap.
- [ ] 6.3 Run one live activity inside the effect boundary with scoped credentials, cancellation and escalation.

**Owns:** `apps/twilight-worker/src/main.ts`,
`libs/twilight-runtime/src/agents/acp.ts`, `capabilities.ts`, `escalation.ts`,
`libs/twilight-runtime/src/agents/acp-contract.test.ts`,
`libs/twilight-runtime/src/execution/k3s-worker-provisioner.ts`,
`k3s-worker-provisioner.test.ts`, `job-spec.ts`, `job-spec.test.ts`,
`apps/twilight-worker/src/containment.test.ts`,
`tools/tool-twilight/src/k3s-preflight.ts`, `k3s-preflight.test.ts`,
`deploy/twilight/k3s/`, `docs/runbook-twilight-worker-pool.md` and versioned
integration fixtures.

**Depends on:** Tasks 3–4. **Produces:** `AgentSessionPort` for start/stream/cancel/
reconcile plus an explicit capability document. Discover and pin the actual ACP
adapter/model; choose between intended providers based on authenticated contract
evidence, not a presumed SDK alias. Probe Claude first, then Codex if its required
capabilities fail; if both fail, stop with both reports rather than relabel another
transport ACP. The unselected provider is Task 11's second adapter candidate.
`agy` remains unavailable until its own adapter passes the same suite. A second
provider must not inherit the first's resume/permission/usage claims.

Dispatch consumes the compiled total activity plan. Agent activities resolve the
active epoch's per-activity setting before its class default; tool activities invoke
only their registered implementation and reject model settings. Disabled activities
record their disposition without dispatch, while a mandatory activity cannot be
disabled. Run one agent and the fixed repository gate as positive controls; inject a
model fallback outside the declared ladder and a tool-as-agent dispatch, then observe
the serving-model or tool-invocation counters fail.

6.1: use a deterministic fake ACP process for protocol/error tests: disconnect/
resume/reconcile, duplicate start, cancelled process exit, malformed protocol
frame, denied tool call, missing usage under strict budget, explicit unsupported
capability. Compile-time validation must name a `beforeTool` gap the capability
document reports (spec scenario "Capability cannot be enforced"). Record each
optional telemetry gap in the ledger as unavailable with its reason, and assert the
client shows it.

6.2a: pin the K3s release and artifact digest after reading its current compatibility
and security documentation. Provision one dedicated server with attempt scheduling
disabled and two agent nodes on identified hosts. Do not install on `h3mon` or
`h4claw`: `h3mon` remains the external observer, while `h4claw` runs OpenClaw,
Twilight's control services and application deployment. `k3s-preflight` validates
unique node identity, supported architecture/kernel/cgroups/container runtime,
CPU/memory/disk, clock, required ports, private reachability, conflicting CNI or
firewall state, and the absence of a worker label on the server. Missing or
unreadable evidence refuses installation. The M1 readiness receipt also names the
hosts and spending allowance, proves registry reachability and pull credentials
from each agent node, records provider accounts and quota for Task 8.4, binds the
operator OIDC issuer and proves the `h3mon` export sink. Tasks 8.1 and 8.4 cannot
start without it. The runbook records the exact reversible
bootstrap, join, drain, upgrade, pinned-manifest reapply and rebootstrap commands.

6.2b: implement the four `WorkerProvisionerPort` operations through a namespace-scoped
Kubernetes identity. Generate one immutable Job spec per attempt with the capability
pool's image digest from the run compatibility manifest, attempt/fence labels,
capability/node constraints, resource requests and
limits, active deadline, cleanup TTL, restricted security context, tested runtime
class, network profile, ephemeral workspace and opaque credential-mount reference.
The Pod automounts no service-account token and receives no raw credential, host
namespace/path, Docker/Dagger socket, privileged capability or production route.
The provisioner cannot mutate nodes, RBAC, cluster policy, application namespaces
or stored credentials. Apply namespace, quota, RBAC and network policy from
`deploy/twilight/k3s/` through an Nx-owned tool target; direct unrecorded `kubectl`
mutation is not the product contract.

Prove each control on the real cluster. Deliberately request the cluster API,
Docker socket, host path, deployment endpoint, forbidden egress and another
attempt's credential reference; independent canary endpoints and host inspection
must observe denial. Remove each effective production-path control separately and
watch its named assertion fail. A manifest-only assertion cannot prove kernel,
runtime or network enforcement. Stop if no supported runtime class contains the
live ACP, Bun, Git and filesystem fixture; default `runc` alone does not satisfy the
hostile-code claim. 6.2c probes gVisor for the coding pool first and Kata second; record
the pinned runtime and failure evidence, and stop the hostile-code claim if neither
passes. Build and browser activity classes use separately labeled
nodes/adapters when their runtime requirements differ; agent Pods never gain a
build-engine socket.
Name how a workspace lineage persists between Jobs without a host path. Reclamation
waits for recorded log and workspace evidence, or an explicit unavailable marker;
an unknown attempt's workspace is reclaimed only by an audited operator action.
The image build target records source commit and lock digest as image annotations,
and the registry retains every digest referenced by a nonterminal or
evidence-retained run. Provenance attestation remains customer-phase work.

6.2d exercises duplicate Job program start, scheduler retry, unschedulable resources,
Pod eviction, node drain, abrupt agent-node loss, K3s API loss and server
rebootstrap. The independent worker/effect/workspace oracles must show one current
writer and no duplicate external effect. API or node loss retains reservations and
reports unknown until worker, workspace, provider and usage evidence reconciles.
After server rebootstrap from pinned deployment inputs, reconcile every recorded
attempt before launching a replacement. Join and drain nodes manually in M1; do
not call a VPS provider. Stream correlated logs, scheduler reasons, node/Pod/Job
state and telemetry gaps to Twilight and `h3mon`, then stop that export and require
both surfaces to show the gap. OpenSandbox remains uninstalled unless this slice
records a missing interactive-workspace contract and a separate accepted adapter
change.

6.3: run a live low-risk fixture task in an isolated scratch repository. Test
permissions at the actual tool/egress boundary: forbidden network target and
credential lookup cannot be performed even when prompt text asks for them. Replace
the enforcement boundary with an allow path and observe the controlled
denied-target counter change. If tool interception is unavailable, restrict the
whole sandbox and reject any workflow requiring finer controls. Use the A34
credential lifecycle: repository/provider-scoped secret references resolved by the
trusted launcher into an isolated ephemeral mount; never an operator's home. Test
wrong-client secret lookup, expired/revoked credentials, and removal after observed
worker exit; synthetic credential canaries must not reach traces or Git.
Rotate a repository/provider secret while an attempt is live. The next brokered
dispatch revalidates the integration grant, the run view identifies the stale
mount, and the old value never reaches a new attempt.

The real ACP path uses the effect boundary from Task 4. For M1, all externally
visible effects use brokered tools; unmediated shell tools are limited to isolated
scratch/source writes with network denied. A live activity attempting direct egress
must hit the actual sandbox denial. Test acknowledgment loss and replay through the
brokered ACP tool path. Keep a stale ACP process alive after expiry and request a
new external action: the broker fence must deny it. Prove workspace reuse waits for
all old writable access to be detached, and local exit cannot release an
independently still-active provider session.

Escalation: run an `implement` attempt under a profile epoch whose ladder has one step;
force a gate failure and assert the retry is a new attempt on the escalated model,
both attempts carry their own measured usage, serving model and same run budget
account in the ledger, and no third step occurs. Change profile after the first
attempt and prove only the not-yet-admitted retry sees the new epoch after required
reapproval. Remove the `maxSteps` check, reset spend on retry, and silently downgrade
the model separately; watch the no-third-step, account-total and serving-model
assertions fail. No real client secrets in this fixture.
Treat `providerUnavailable` as an attempt outcome, not an escalation trigger: retry
the same model within the unchanged envelope under the declared bound without
consuming a rework round or ladder step, then pause with the provider constraint
visible. Exercise both retry and exhaustion here.

**Estimate:** 24–48 human hours; 6–14 agent hours; 320k–900k tokens plus separately
admitted live-provider and VPS spend; one provider slot, one dedicated K3s server
and two isolated worker nodes. Infrastructure spending needs an explicit allowance.

## Task 7: Join evidence, hooks, review and the outcome record

Proves: Hooks, critics and judges preserve authority; Observable evidence with
focus access; Lifecycle points are the one key space (`onRework`); Levers are
configurable and their effects are measured (outcome half); Outcomes use an
independent evaluation definition (A48).

- [ ] 7.1 Run mandatory pre/post hooks and profile-selected critics/judge with source-bound evidence and bounded rework.
- [ ] 7.2 Persist redacted evidence, durable event cursors, terminal outcomes and defect reports; expose their shared operations.
- [ ] 7.3 Pipeline scoped deliverables through an automated, independently provisioned integration queue.
- [ ] 7.4 Execute opt-in bounded speculative attempts with independent selection and complete loser accounting.

**Owns:** `libs/twilight-runtime/src/hooks/registry.ts`,
`libs/twilight-domain/src/review.ts`, `outcome.ts`,
`libs/twilight-runtime/src/evidence/store.ts`, `redact.ts`,
`apps/twilight-be/src/events.ts`, `evidence.ts`, `outcomes.ts`, `defects.ts`,
`apps/twilight-fe/src/routes/evidence.tsx`, `apps/twilight-mcp/src/server.ts`,
`apps/twilight-be/src/review-flow.db.test.ts`,
`apps/twilight-fe/e2e/evidence.spec.ts`.

This task registers `registered:integration-queue`,
`registered:task-acceptance`, `registered:scenario-test-coverage`, `registered:tool-secrets`,
`registered:evidence-redaction` and `registered:run-ledger`. Their unavailable and
malformed paths are floor failures, and each production caller receives a negative
proof.

**Depends on:** Tasks 5–6. **Produces:** attributed finding/verdict records, durable
scoped event cursors, evidence manifests, hook outcomes and outcome records shared
by all clients, plus `list_run_events`, `read_evidence`, `read_outcomes` and the
idempotent revision-checked `report_defect` operation across FE, BE and MCP.
Mandatory deterministic checks run outside model authority. A safety critic is a
critic with a safety rubric, not a credential broker or final approver.

Implement `registered:task-acceptance` for the `acceptance.evaluate` tool activity.
It reads independently authored assertions from the pinned task fixture, charges
its resource/cost usage to the run, and reports unavailable when no oracle exists.
The initial evaluator comes from the compiled `quality` subtree; workflow edits
publish it through Task 5's shared editor/operations under Task 1's authority checks.
Both M1 profile runs use clean instances of one task fixture/digest and evaluator.
Disable the observer in a third fixture: publication refuses the floor violation.
Remove task assertions: candidate acceptance blocks as unavailable. Inject a
synthetic pass and observe the candidate-acceptance assertion fail; moving the
observer back to handoff must fail the acceptance-stage execution-order assertion.

Implement `registered:scenario-test-coverage` for `acceptance.coverage`. It reads
the specification coverage ledger and candidate reports, requiring each applicable
scenario to name its stateless/API/Playwright/manual layer or an explicit
inapplicable disposition. Remove one report mapping and watch candidate acceptance
block at this observer.

Task 7.2 makes the coordinator own the handoff transition and terminal outcome
write. Under factory-core it records the core accepted outcome even though the
inactive `handoff.dev-main` tool has only a disposition; under personal-delivery
handoff records progress into `awaiting_release`, not a terminal outcome.
Every evidence and trace record carries its retention class and terminal timestamp;
`read_evidence` and the capacity view expose measured bytes per class. Task 16 owns
the A17 expiry job and can enforce retention without re-ingesting the corpus.

It also exposes each outcome's reconciled efficiency breakdown from Task 4's
ledger. Driver counts remain diagnostic observations rather than outcome
denominators. An unavailable driver keeps the relevant branch and aggregate
coverage incomplete in stored evidence, FE and MCP.

Outcome revisions expose their as-of time, sampling/coverage states, shared-charge
allocation status, instrumentation overhead and pricing-drift findings. A later
billing receipt appends evidence without replacing the earlier estimate or
reclassifying the accepted result. Cross-currency cohorts remain visible but
unranked unless they pin the same conversion revision.

**Tests (7.1):** required hook timeout/malformed output keeps the independent
worker launch counter at zero; a fixture-registered optional hook fails visibly as degraded;
post-hook failure after an effect does not replay the effect; author cannot act as
independent reviewer; disabled judge means no judge dispatch while an enabled critic
still records findings. Rework counts already-consumed rounds across profile epochs;
zero allows no rework, and exhaustion leaves a blocker paused. The `onRework` policy
is evaluated with the round number: reset it on profile change and watch the
pause/attempt-count assertion fail. Stale evidence, wrong
repo and wrong revision cannot close a task. A prompt-injection source asking to
weaken the rubric is retained as text and changes no authority.

**Tests (7.2):** inject known synthetic secrets into tool output; assert absence
in persisted blobs, events, error messages and exported bundle, while redaction
metadata is present; remove redaction at the persistence boundary and watch the
storage assertion fail. Cursor replay after reconnect yields the same events;
expired cursor explicitly requests resync.

Exercise the [independent evaluation and outcome rules](specs/twilight/control-plane/spec.md#requirement-levers-are-configurable-and-their-effects-are-measured)
for every terminal accepted, failed or cancelled run/candidate. Pin definition and
ordered profile epochs, keep incomplete/immature quality unknown, and compare only
matched mature cohorts. Delete failed-run cost, relabel a mixed run as
single-profile, mature the defect window at acceptance, and drop a skipped
observation separately; each must fail its aggregate, ranking, maturity or
observation-count oracle. Zero accepted outcomes makes cost-per-accepted unavailable.

`report_defect` appends a versioned report with command id, expected revisions,
scope, source evidence, `reportedAt` and accepted-candidate lineage; it never infers
that a model caused the defect. Exact retry returns one report, wrong repository or
lineage is refused, and publication updates the outcome version. Remove source
evidence or auto-assign the currently serving model and watch the persisted report
assertion fail. No private model reasoning is part of the contract.

**Estimate:** 10–20 human hours; 3–6 agent hours; 150k–420k tokens, one reviewer
slot reserved alongside the implementation slot.

7.3 owns `libs/twilight-runtime/src/integration/queue.ts`, `compose.ts`,
`integration.test.ts`, the candidate preparation portion of
`apps/twilight-be/src/candidates.ts` and
`apps/twilight-fe/e2e/integration.spec.ts`. Consume WorkPlan contracts, envelope,
source/plan locks, evidence and gate adapters; produce immutable candidate records
through `composeCandidate`. Task 7 MUST NOT implement or invoke `publishCandidate`.
Expose queue/member/base/check/
repair state through run events and FE/MCP run views. Preparation and verification
use separate workspace/build/browser reservations. Integration prepares only.
Attempt to call the absent publication operation through Task 7's integration
boundary and require the type/operation boundary to refuse it. Deliberately expose
that operation and watch the boundary test fail. Task 13.3 later introduces
publication after staging acceptance.

Start with an implementation barrier: an independent deliverable must finish review
and verification before release of that barrier. Inject a run-wide stage join and
observe it fail in that window. Compose branches that pass alone but violate an
independently authored cross-contract assertion together; copying branch greens must
make the candidate-refusal assertion fail. Move the base during verification: no
publication until recomposition and a fresh gate. Introduce one failing member and
observe an independent candidate continue. Restore all-or-nothing run blocking to
prove that observation. Verify source/plan-lock union and reject changed dependency
contracts. A knowledge edit produced after implementation must be included in the
ordinary review and later verification inputs; inject the former review-before-
knowledge order and watch the reviewed-source identity assertion fail. Knowledge
reconciliation itself does not consume a rework round; a later review finding uses
the normal bounded rework path back through implementation and knowledge.
Run runtime Nx tests plus the FE browser suite on its owned stack. Full composed
verification remains mandatory; all named Proof comments wait for actual failures.

**7.3–7.4 planning allowance:** 24–48 human engineering hours, 6–12 agent hours,
300k–800k tokens, plus explicitly authorized integration/speculation experiments.
Re-estimate from actual gate duration and conflict rates; these are not deadlines.

7.4 owns `libs/twilight-runtime/src/agents/speculation.ts` and
`speculation.test.ts`. Consume the envelope, shared budget account and session port;
return selected candidate identity plus terminal/unresolved loser records. Use the
independent task oracle from 7.1/7.2; this slice depends on those completed slices. A controlled first
answer fails the oracle while the later one passes: only the latter is selected.
Inject first-response selection and observe the wrong candidate. Keep a loser alive
after selection and prove it cannot publish or free holds; remove fencing and observe
the forbidden effect at the receiver. Exceed the attempt count/budget and assert no
extra launch. Drive the opt-in control through shared FE/BE/MCP configuration;
disabled speculation starts one attempt. Run via runtime/worker Nx test targets.

## Task 8: Accept the first factory-core run

Proves: every M1 requirement end to end; Executable restore compatibility (refusal
and retained-version recovery) (A39, A45).

- [ ] 8.1 Run the complete M1 journey on puni-00 and a clean client fixture under two delivery profiles.
- [ ] 8.2 Switch puni-00 and the template to `twilight-v1` with existing changes pinned.
- [ ] 8.3 Rehearse incompatible-upgrade refusal and retained-closure recovery.
- [ ] 8.4 Pass the fixed-quality scaling matrix before M1 acceptance, independently of WBS migration.

**Owns:** `apps/twilight-fe/e2e/first-run.spec.ts`,
`tools/tool-twilight/src/template.ts`,
`tools/tool-twilight/fixtures/client-minimal/`, initial versioned starter package,
and the change's eventual `verify.md`/runbook updates.

**Depends on:** Tasks 1–7. Complete 8.1, 8.3 and 8.4 before 8.2 promotes the
workflow default; a scaling failure cannot be bypassed by the UI journey.

8.1: pin `factory-core` and test a real harmless source change through request, assumption,
specification, plan approval, ACP execution, knowledge reconciliation,
profile-selected review and the fixed integrated gate, once under `balanced` and once under
`economy`. Balanced runs one critic and judge with affected browser verification;
economy runs its critic with no judge and with floor-required affected browser
verification. Specification
critique and scenario validation remain floor activities. Branch dev, staging,
cloud acceptance, publication and dev-main are disabled until Task 13 registers
their implementations and publishes `personal-delivery`. Assert activity and floor
dispositions and independent dispatch/session counters; enable economy's judge as
an injected fault and observe its counter increment. Select `personal-delivery` and
require its unavailable adapters to block workflow publication without blocking the
factory-core run. Interrupt
once during approval and once after a controlled effect. `read_outcomes` must show
both runs with money, agent time, run elapsed, rework rounds and activity
dispositions side by side, each figure measured or unavailable. Pin the same basic
independent evaluation revision/cohort to both: an immature defect window remains
unknown, and these two runs prove instrumentation without authorizing automatic
profile recalibration. Inject a per-profile observation set and watch comparison
eligibility fail. Repeat against a generated repo with a different
repository ID and prove it has no puni-specific content, personal paths or shared
credentials. Its `gateTargets` and `contextRoots` differ from puni-00's; organization
and issuer variation remains behind A63's customer discovery gate. Pin forbidden
content canaries: `/home/df/`, `/Users/danylofedorov`,
`/root/`, `h2puni`, `h1claw` and the legacy `wbs-tool-v1` identity. Each occurs in
this repository's own docs, receipts or archived changes, which is what makes the
injection meaningful. A clean fixture passes; inject each into a copied template
file and watch the actual acceptance gate fail.

For both runs, require the efficiency breakdown to reconcile with the outcome
ledger and expose the same coverage through FE and MCP. The comparison attributes
differences to requests, attempts, model turns, token categories, tool context,
failed lookups, polling and rates without treating any driver as another accepted
outcome. These observations establish the baseline for later activity benchmarks;
they do not select a default profile.

Run source/spec typechecks, lint, build, all affected tests and the complete
browser gate on the owned stack. The repository's Playwright server-reuse landmine
applies to every browser test in this plan: own ports and databases, verify the
served build identity, and run the whole browser gate when shared UI or CSS
changes. Run the repository-wide gate on the correct host/lock before integration.
M1 acceptance is a working local/development control plane with the real K3s worker
topology; cloud-browser deployment and production application machinery are Task
13's. Its accepted candidate is unpublished; before Task 13 the operator may carry
it to main only through the repository's existing manual review and merge path.

8.2: at M1 acceptance, set `schema: twilight-v1` in puni-00 and the generated
client template. Before switching, pin every existing change's current schema in
its `.openspec.yaml` so old changes retain their workflow. Prove a new change
selects Twilight in both repos and a pre-existing `sdd-lean` change is still
interpreted under that schema. The trial remains opt-in until this is tested.

8.3: rehearse incompatible-upgrade refusal using Task 1's retained packages and
Task 4's actual effect fixture. With a pending approval and uncertain effect,
present an unsupported executable/checkpoint/hook closure and assert zero new
worker/effect dispatches. Use the protected recovery command with the rejected
controller unavailable to return to the retained supported closure: preserve the
pending subject, transition/outbox identity and unknown effect; receiver count
stays one. Inject latest-hook substitution or bypass restore validation and observe
the named refusal/counter assertion fail. Successful migration and rollback
preserving post-upgrade writes belong to Task 14.

**Estimate:** acceptance harness and scaling matrix: 20–40 human hours,
6–12 agent hours and 300k–840k engineering tokens, excluding benchmark executions.
Benchmark spend requires a separate explicit allowance within the authorized
account before launch. Re-estimate M1 after Tasks 1–4 expose measured runtime and
provisioning costs; no aggregate completion date is asserted from unmeasured slices.

8.4 runs under `factory-core`; its accepted outcome ends at core handoff and
excludes Task 13's serialized staging and interactive-browser path. It owns
`tools/tool-twilight/src/scaling.ts`, `scaling.test.ts` and versioned
`fixtures/scaling/` with independently authored outcome assertions. Run through an
Nx `tool-twilight:scaling` target created with this behavior, consuming the real
scheduler, ACP workers, integration queue and gate adapters. The canonical capacities,
repetitions and speedup/coordinator budgets are `execution.yaml.scalingAcceptance`;
do not copy constants into fixtures or derive test advances from the challenged value.
The matrix owns a separately approved budget account naming run count, spend ceiling
and elapsed ceiling. Record whether approval covers one plan's fixed deliverables or
uses an explicit per-request decision procedure, then report decision count,
operator minutes and human-wait share. For later regression, run one repetition at
one and four workers on the independent workload. Record evidence, trace and corpus
bytes per retention class per run and confirm or revise A66 before Task 13.

The `dev-sweep` trigger workflow is unavailable under `factory-core`. Task 13 may
publish it only with `personal-delivery`, its per-occurrence execution envelope and
budget-account contract, and all registered environment/browser adapters present.

Use fixed workloads: eight independent small changes; one feature with a stable
shared interface, four parallel components and a final integration assertion; and
four changes including a shared-contract conflict, one failed attempt and a moved
integration base. Pin identical quality, model/effort, oracle and sufficient hard
budget ceilings at every capacity. Pin the profile's `authorizedControls` fan-out,
client ceiling and envelope maximum at every point; vary actual worker pool capacity
and supporting pools only. Independent launch counters must observe 1/2/4/8 useful
workers on the independent workload; advertised pool sizes alone are not evidence. Randomize
capacity order across repetitions and report all raw samples, warm/cold conditions,
provider quota, queue/resource utilization, accepted throughput, elapsed p50/p95,
costs and quality coverage. Independent speedup is median accepted throughput divided
by the one-worker median; feature speedup is one-worker median elapsed divided by
scaled elapsed. The contended control must preserve all outcomes without silent
loss or duplicate acceptance; report its speedup without promising linearity.

Negative controls: force one worker while advertising eight and observe the speedup
budget fail; hold integration/build capacity to expose a limiting pool; split a task
into extra checkboxes and assert the accepted-outcome denominator stays fixed; remove
loser charges and observe cost reconciliation fail. Repeat the stage, stale-candidate
and authorization controls on the real runtime. Record actual failures in verify.md;
a synthetic scheduler test or two-profile comparison cannot substitute for this
acceptance. Five samples establish the proposed milestone budget, not mature defect
rates or a universal scaling law. Re-estimate the remaining tasks from measured M1
costs and elapsed times. Compare measured cost and elapsed per accepted fixture
outcome with a manual baseline and the remaining Tasks 11.1, 13, 15 and 16 estimate;
record the A69 go/no-go. M1 duration remains unmeasured until those ledgers exist.

Run the matrix on Task 6's identified one-server/two-agent-node cluster. Before
timing, prove both agent nodes execute a labeled fixture and the server executes
none. During the contended workload, drain one agent node; assert no new Job lands
there, current work reaches the modeled draining or unknown outcome, and feasible
work continues on the other node without increasing authority. Rejoin it and
observe capacity only after readiness and capability probes pass. Abruptly lose the
other node during a brokered effect, inject the documented duplicate-program
condition, and use independent receiver and workspace counters to prove no repeated
effect or second writer. Advertised node count, fake Pods on one host or local child
processes cannot satisfy multi-host acceptance.

## Task 9: Prove the Backlog/WBS storage adapter after refactors

Adopts the M2 delta's requirements from
[client repositories](../../../docs/twilight-structure/client-repositories.md#contract-for-the-m2-storage-delta)
(A31, A33, A44).

- [ ] 9.1 Run the storage spike at the client's declared scale and record the go/no-go on ADR 0015.
- [ ] 9.2 Specify and prove a lossless revisioned planning adapter against the landed WBS repository contract.

**Entry:** the concrete [refactor closure checklist](../../../docs/twilight-structure/client-repositories.md#cutover-after-the-refactors-land),
including a recorded landing revision, dispositions of the remaining W4-3/W4-4/
W2-1 work and associated deferred slices, verified source/spec typecheck coverage,
the full WBS gate and explicit table/field/history inventory. Much of the refactor
is already recorded as done; that is not evidence that the remaining closure
conditions passed. The user sequenced this work after those refactors, so this
trial does not start the adapter or migration. The typecheck-coverage row of that
checklist is WBS work; Task 9 cannot start until the WBS owner records it. **Owns
next increment:** proposed `libs/wbs-backlog/` codecs, broker, fixtures, tests;
exact WBS integration paths are selected from that landing revision.

9.1 is the spike: run the [storage acceptance profile](../../../docs/twilight-structure/client-repositories.md#storage-workload-acceptance-budget)
at the repository's declared scale through actual broker/native adapter/WBS paths,
retaining timing samples and conflict counts. Inject receiver delay above the
single-edit budget and watch acceptance refuse; a full-field round trip cannot
compensate for an exceeded latency or restart budget. ADR 0015 becomes accepted
only after this proof.

9.2: use the [client planning design](../../../docs/twilight-structure/client-repositories.md)
and [Backlog source findings](../../../docs/twilight-structure/research/backlog-patterns.md).
Pin the upstream release and test native create/edit/archive/restore/ID allocation
and MCP behavior under the required Backlog configuration baseline. Preserve
unsupported WBS fields, including the resource units of Task 2, in a versioned
extension and prove native CLI/MCP round trips do not drop them.

**Exit tests:** same repository contract suite on SQLite and Backlog; full
canonical plan equality; real independent readers during interrupted multi-file
batch; two-clone CAS race; reused archived ID cannot acquire earlier evidence; undo
conflict refusal; invalid external edits quarantined; unauthorized direct
accepted-ref push refused with separate broker and ordinary writer identities on
the A31 remote (commit authorship or an HTTP field cannot impersonate the broker;
a bypass from a second clone leaves the remote ref unchanged). Native Backlog
CLI/MCP operate on materialized candidate views and import through the broker.

Pin `PlanRef` and source-candidate export publication. Test a predecessor completed
only on an unmerged branch: a dependent candidate from main must remain blocked.
Test incompatible requirements/source basis, two plans in the same repo, stale
exports, and progress-only receipt updates that preserve the approved task
definition. Merge source branches with disjoint change-keyed plan-lock entries and
exports; assert both entries survive and the merged candidate is verified against
each pinned snapshot. Inject a single-value lock/last-writer replacement and watch
the missing entry assertion fail. Freeze input receipt R, create candidate C, then
accept C's output receipt; prove C/R remain unchanged and a later candidate can
consume it. Force two exact commands from one ref: one acceptance and one 409.
For authorized disjoint commands, preserve both edits with one receipt each through
bounded CAS retries. Change a cross-plan edge, collection membership and shared
reference between preparation and publication; each must refuse reconciliation.
Remove the corresponding broker-derived predicate and observe the forbidden
acceptance before recording Proof. A caller-supplied empty read set cannot bypass
registry derivation. Run the storage profile's writer sweep, retain conflicts and
retries in its denominators, and inject serialization delay to prove its throughput
budget can fail. Restart after publication before acknowledgement and replay the
same key: one accepted effect and receipt, including its original/reconciled bases.

**Estimate:** 16–32 human hours for contract/spike, then re-estimate implementation
from measured model coverage and Git latency. One repo writer; two isolated clones
for conflict tests. No migration follows an incomplete field mapping.

## Task 10: Migrate planning and make WBS the single editor

- [ ] 10.1 Cut over a representative puni plan, then a clean client plan, with a tested lossless rollback path.

**Depends on:** Task 9. **Owns next increment:** WBS backend selector/adapter, export
and import utilities, generated OpenSpec task bridge, migration runbook and FE/MCP
acceptance cases. Update R4's task ownership rule explicitly when the bridge lands.

Shadow comparisons → verified backup → short write freeze → complete Git planning
revision → canonical comparison → backend switch → FE/MCP checks. No dual writers.
Show WBS connected repo/ref/revision. Edits and progress traverse the broker; the
emitted `tasks.md` at the manifest's export path carries stable IDs/source revision
and is checked for drift. Runtime leases and credentials remain outside versioned
planning files.

**Exit tests:** WBS rich edit/undo/saved-plan/concurrent-user cases, no hidden SQLite
plan reads, export drift refusal, new writes after cutover preserved on rollback,
fresh clone renders the same plan. Deliberately drop one estimate/reference/history
field and watch cutover refuse before switching authority. Restore-backup-only is
not an acceptable rollback once Git accepted new writes.

Generate the source candidate's change-keyed plan lock/exports after immutable
planning commits and input receipt snapshots exist. CI resolves those pinned
inputs, never the latest branch. Output completion receipts are accepted afterward
and appear only in later candidates' input snapshots/exports. Exercise the merged
two-change candidate through the real WBS/export/CI path, including a shared-key
conflict that cannot silently discard either plan.

**Estimate:** 16–32 human hours after adapter proof; reserve one exclusive cutover
window whose duration is measured in rehearsal, not chosen in advance.

## Task 11: Expand agent roles, lifecycle hooks and automation

Proves: Activity defaults are benchmark-driven; later expansion of versioned
workflow configuration and the authorized command surface.

- [ ] 11.1 Expand roles/hooks/capacity, model routing and cron/webhook automation for OpenSpec-origin plans after M1.
- [ ] 11.2 After Task 10, connect the same automation to accepted WBS/Backlog plan revisions.

**Depends on:** 11.1 depends only on M1; 11.2 alone depends on Task 10 and 11.1.
**Owns next increment:** role registry, second ACP adapter, policy editor
expansion, automation admission and queue views, including
`registered:notifications` and the human-only `publish_trigger_envelope` operation.
Task 11 supplies the generic versioned trigger-envelope record, decision binding,
allowance-to-occurrence-account copy, declared-profile resolution, activity
benchmark registry and authorized tool catalog. Use the
[product matrix](../../../docs/twilight-structure/product-experience.md) as the
coverage ledger: each control needs schema/form/API/MCP/runtime/test entries and,
where it is a lever, ledger and outcome fields.

Add specialist critics (including safety critics), judges with rubric/version/
dissent, scoped hook registrations, provider rate pools and fair queues, multi-step
escalation ladders and per-activity model routing, and `onTrigger` automation:
cron/webhook occurrence IDs, timezone/DST policy, overlap and missed-run behavior,
with retries bounded by the `retries` policy at `onTrigger.*`, selecting the
applicable `triggerKinds`, and recursion bounded by a profile `maxRecursion` field.
Cron invokes the same admission path as manual work.
A required unavailable channel is a failed operation, not a successful notification.
Operator notifications at `onBudgetThreshold.*`, `onReconciling.*` and
`afterStage.handoff` deduplicate per subject and carry one actionable link.

Before changing an activity-class or per-activity model, effort, tool-exposure or
execution default, run its versioned activity benchmark. Pin authored adversarial
cases, a worker-inaccessible sealed holdout, retained redacted real-work samples,
model/effort and adapter revisions, quality rubric, cost coverage, latency,
timeouts and reliability. Declare and meet a positive minimum real-work sample
count, representative task/context/failure/cache strata and uncertainty before
recommending a default. Randomize treatment order with a recorded seed and pin or
report provider quota, region, harness load and cache state. Preserve the
non-dominated choices and publish the selected trade-off as an ordinary evaluated
factory change; do not reduce them to one score or mutate a default from a
recommendation. Holdout leakage, mixed revisions, incompatible conditions,
missing observations and immature required outcome windows make the recommendation
unavailable. Before broad publication, run an effect-safe bounded canary or shadow
observation and pin the prior default plus quality, timeout, reliability and cost
thresholds for a rollback proposal.

Add activity-scoped lazy tool loading behind the existing effect broker: catalog
search reveals only authorized descriptors; descriptor text is untrusted, and the
catalog/schema digests are pinned in epoch and effect intent. Loading a selected
schema grants no dispatch authority. Bind reusable prompt prefixes to client,
repository security domain, effective policy, prompt, skill and catalog digests;
revocation or change prevents reuse. Compaction retains the executable closure and
keeps summaries as derived claims.

Add bounded compound effects only for a measured chatty workflow; the parent
records its ordered dependency plan and limits while every external sub-effect
retains identity, fencing, reconciliation and partial outcome. Only declared
independent members run concurrently. A universal shell projection and direct
provider access remain forbidden. Analyze attributed session papercuts on demand
first—repeated oversized context, polling turns, failed lookups, unchanged retries
and consistently overpowered models—and emit an optimization proposal with
redacted evidence references, baseline, target driver, expected payback, quality
floor, analysis/rollout cost and stop condition. Analysis clusters stable
session/effect identities, retains sample counts and dissent, and is itself a
bounded charged activity. Scheduling it and dynamic routing need later evidence
and a separate change.

M1 retains one active coordinator. Multiple trigger/scheduler producers submit to
that single admission authority. Active coordinator scale-out is a separate future
change requiring a distributed store/lease decision and real two-process
admission/fencing proofs before its own spec is synchronized.

**Exit tests:** second-provider capability differences visible; mandatory hook
cannot fail open; adversarial source cannot upgrade role authority; signed webhook
replay yields one admitted occurrence; DST/missed/overlap fixtures; duplicate
scheduler instances do not double-start; a retry beyond `retries.max` is refused and
recorded; two clients contend under the queue policy: neither client's queue wait
exceeds the aging window while the other holds capacity below its ceiling, and no
context or credential crosses clients. Unknown telemetry remains explicit. Attempt
to publish a routing default with mixed benchmark revisions and observe refusal;
bypass that guard and watch the unchanged-default assertion fail. Leak a holdout
answer, collapse the workload strata, omit a timeout sample and compare different
quota/load conditions separately; none can produce a recommendation. Attempt broad
publication without effect-safe rollout or rollback thresholds and observe refusal.
An unauthorized catalog search reveals no descriptor or count, malicious
descriptor text changes no prompt/authority, and a selected descriptor still
cannot dispatch without effect authority. Reuse a cached prefix across clients or
after revocation and observe the digest-bound refusal. Remove one retained
compaction-closure member and observe compaction refusal. Kill a compound effect after one
sub-effect and prove restart reconciles that identity without repeating it or
hiding the unfinished member. Remove sub-effect identity and watch the independent
receiver count fail; reorder dependent members and watch the second receiver remain
untouched. A papercut proposal cannot edit its own skill or profile, expose private
trace content or exceed its declared analysis allowance.

**Estimate:** 24–48 human hours; 0.4M–1.0M tokens, recalibrated from M1 ledgers.

## Task 12: Operate and evaluate the LLM wiki

- [ ] 12.1 Add ingest/answer/reconcile/compact operations with claim provenance and client isolation.

**Depends on:** Tasks 7–8. **Owns next increment:** `libs/twilight-runtime/src/knowledge/`,
knowledge FE/MCP operations and `tool-twilight:verify-knowledge`. Read-only index
navigation from M0 remains sufficient until this increment exists.

Use [knowledge operations](../../../docs/twilight-structure/knowledge.md). Require
source/status/revision records; maintain contradiction dispositions and stale
dependencies. A wiki editor can propose deltas but cannot edit policy or promote
requirements. Compare the profile's benchmark question set against cited answers
before and after compaction; record correctness, source traceability and retrieval
effort against the profile's `knowledge.benchmark` targets.

**Exit tests:** missing and unreadable required sources; source changed since
acceptance; conflicting primary claims preserved; broken links; malicious source
instructions remain text; client-B-only document never returned to A; compaction
retains decisive citations and repairs inbound links. Add full-text/QMD/embeddings
only if the measured baseline misses the profile's targets; rerun isolation tests
on that backend. Retrieval quality requires judgment, not a parser-only green.

**Estimate:** 16–32 human hours; 0.25M–0.65M tokens plus measured indexing cost if chosen.

## Task 13: Operate branch dev, staging, dev-main and production

- [ ] 13.1 Persist the environment identity, assignment, lifecycle and desired/observed state model.
- [ ] 13.2 Publish committed runnable increments to branch dev and continuously converge dev-main on accepted main.
- [ ] 13.3a Compose with current main, build once, deploy production-like staging and prove parity.
- [ ] 13.3b Run cloud acceptance and the report verifier against that exact candidate.
- [ ] 13.3c Publish by source-ref CAS and converge dev-main.
- [ ] 13.3d Promote the same artifact with recovery, restore and accessibility receipts.
- [ ] 13.4 Run source-bound scheduled dev sweeps and candidate-bound staging scenarios with inspectable reports.

**Depends on:** Task 8 and Task 11.1 (release health notifications and scheduled
sweeps ride the same hook and trigger machinery). **Owns next increment:**
environment and deployment adapters, cloud-browser integration, report/coverage
records, the `personal-delivery` floor publication, release command UI/MCP authority and runbooks.
Own `libs/twilight-runtime/src/environments/{environment,branch-dev,staging,dev-main}.ts`,
`libs/twilight-runtime/src/environments/*.test.ts`,
`libs/twilight-runtime/src/browser/report.ts`,
`apps/twilight-be/src/{environments,candidates,release}.ts`, the matching FE/MCP
operations, `implementation.branch-dev`, `triggerWorkflows.dev-sweep`,
`staging.deploy`, `acceptance.cloud-browser`, `acceptance.browser-report`,
`publication.main`, `handoff.dev-main` and `release.production`
registrations/settings in `execution.yaml`, including
`registered:environment-observe`, `registered:branch-dev-observer`,
`registered:staging-deploy`, `registered:cloud-browser-report`,
`registered:dev-sweep-report`,
`registered:publish-candidate`, `registered:dev-main-converge` and
`registered:production-deploy`. Task 13 publishes the bounded `dev-sweep` envelope
through Task 11's human operation before enabling its schedule. Use existing deploy
planners/locks through supported interfaces, not copied shell scripts. Re-check
current runbooks and inspected code before choosing reuse.

Start with one serialized staging environment, one dev-main and one branch dev per
active branch subject to capacity (A57). Branch devs may source-run; explicit sleep
and resume preserve identity (A58). Staging uses the same immutable image,
deployment/migration/recovery path, runtime/topology class, routing/auth shape and
health checks as production, with every endpoint, credential, scale and isolated
data difference visible (A60). Start the browser adapter with the Browserbase
cloud-session integration selected in A32. Pin the provider/connector and prove the
Nx-invoked runner against a real remote session before acceptance; its docs' Bun/
Playwright warning is a compatibility gate, not a reason to silently run local
Chrome instead. Record session ID, served source identity, bounded credentials,
recording/export retention and observed teardown.
The branch-dev adapter owns its checkout; it never serves from the operator's
bind-mounted development checkout.

The acceptance path is `integration composition → staging deployment → automated
and interactively driven, tool-verified acceptance → compare-and-swap main publication → dev-main convergence →
explicit production promotion`. Main movement restarts composition, build, staging
and evidence. Production consumes the staging-tested artifact; rebuilding is a new
candidate. Nightly sweeps cover dev-main and every active branch dev, coalescing
only identical source/configuration/scenario revisions (A59).

13.3 introduces `publishCandidate` and its source-ref CAS after the staging and
acceptance receipts exist. Hold the report verifier at a barrier and prove main
does not move; inject the former Task 7 early-publication path and watch that
assertion fail. Crash after source publication but before receipt recording,
reconcile the same effect exactly once, and never republish.

**Exit tests:** two long-running branches receive isolated devs; exhausted capacity
queues a third without reassignment; sleep/resume preserves identity; commit and
desired-deploy identity never masquerade as observed served identity; served
revision mismatch blocks browser acceptance; cloud browser cannot silently reuse
another checkout; mandatory browser unavailable blocks the stage; missing scenario
coverage or a failed/skipped/unavailable report blocks; staging parity differences
are visible and unaccepted differences block; a moved main or wrong artifact forces
complete fresh acceptance; a driver's prose without captured assertions cannot
produce a passing browser report; invoking the report verifier before the exact
browser receipt completes is refused; wrong/stale candidate or environment approval is
refused; handoff without a release command records `awaiting_release` with no
`terminalAt`; expiry of the 30-day decision window records the non-accepted terminal
disposition with no production effect; exhaust the ordinary run cap and separately
expire the delivery deadline before issuing a valid release command, then prove its
same-account release-only suballocation still admits `release.production` without
spending the exhausted cap or resetting the clock; no human decision means no production effect; health failure triggers
observed recovery; unknown remote state throws; migration rollback failure remains
visible with recovery instructions; a scheduled sweep binds the observed dev
revision and cannot turn an unchanged coalesced disposition into a new pass. Task
8's whole-browser-gate rule applies. Drive the 30-day decision and two-hour release
expiry cases through injected `asOf`, never wall-clock waiting. Before registering
`registered:production-deploy`, back up the application store, checkpoint store,
outbox and evidence at a named transition; restore them on a fresh host and prove
pending decisions and unknown effects survive. Record observed restore time and the
procedure in the Task 13 runbook. Repeat Task 5.4's Chromium keyboard/accessibility
checks against the release command UI. Task 13 acceptance also reports decision
count, operator minutes and human-wait share.

**Estimate:** 48–96 human hours plus external environment availability. One
host-wide release/build lease; production activity only on an explicit
candidate-bound command whose separate release envelope bounds spend and expires
without resetting the delivery run clock.

## Task 14: Prove the self-growing repo and client upgrade cycle

Adopts the M4 delta's upgrade rollback contract from the
[design](design.md#environments-publication-and-release) (A39).

- [ ] 14.1 Use Twilight to improve its own template and roll the same verified version into a second client fixture.

**Depends on:** Tasks 10–13. **Owns next increment:** template upgrade planner,
compatibility fixtures, self-improvement evaluation and operator recovery route.

The canary is a real `puni-00` change using WBS/Backlog, OpenSpec, wiki, agent review,
capacity admission, dev evidence and release policy. Record no special factory-only
passes. The new template produces a clean client repo and upgrades an older one
with client-specific configuration intact. Propose improvements against fixed
evaluation inputs and the outcome record's fields (cost per accepted outcome,
elapsed, rework rounds, escaped defects, evidence freshness); retain adverse findings.

**Exit tests:** proposed weaker policy cannot judge/promote its own run; a broken
template upgrade can be rolled back without the new controller; secrets/content
never copied across clients; package pins and migrations are reproducible from a
clean clone; user overrides survive a supported upgrade or produce an explicit
conflict. Only then label the setup reusable for clients.

For every supported executable/schema upgrade, extend Task 8's refusal/recovery
fixture with actual migration: upgrade during an approval wait, commit a decision
and lose an effect acknowledgment under the new controller, then roll back with
that controller unavailable. Assert the decision, application/checkpoint/outbox
transition and unknown effect survive and the external receiver count stays one.
Inject backup-only rollback and observe lost accepted records; inject an unsupported
reverse migration and require refusal before state is changed. Pin the tested
compatibility matrix across control-plane build, compiler/schema and
execution-profile versions, template/workflow/planning-adapter/extension versions
and worker-image digests per pool. `readRepository` and `restoreRun` check that
same record and retained executable/hook closure. No successful migration
or rollback is promised for unsupported old/new combinations.

**Estimate:** 16–32 human hours plus a complete canary cycle; use measured M1–M3
ledgers for agent budgets instead of extrapolating today's untested estimates.

## Task 15: Connect the always-available secretary to Twilight

- [ ] 15.1 Prove the pinned OpenClaw adapter and independently admitted secretary/worker capacity.
- [ ] 15.2 Submit software-delivery requests through Twilight and return durable references without widening authority.

**Depends on:** Tasks 5–7. **Owns next increment:**
`libs/twilight-assistant/src/{openclaw,workers,assignments,sessions}.ts`, their unit
and adapter tests, `apps/twilight-be/src/assistant.ts`, corresponding FE/MCP
operations, `submitAssistantRequest`, `renameWorker`, `bindWorkerSession` and the
secretary/provider reserve admission contract. OpenClaw owns conversation execution; Twilight owns delivery authority and
durable work state (A52). A recurring worker is a stable presentation identity, not
an OpenClaw configured agent, and renaming changes no history or permission (A55).

Pin the inspected OpenClaw version and prove session creation, child delegation,
event observation, cancellation and transcript retrieval through a narrow port.
Reserve interactive secretary capacity separately from worker capacity. Measure
busy, saturated and cold-start behavior before setting a response SLO (A53).
General requests stay in OpenClaw. Software requests call Task 5's authenticated
operation, receive request/run/assignment references and use Tasks 3–4 authority;
chat text cannot mint a decision, budget or effect (A62).

**Exit tests:** a five-minute worker fixture leaves the secretary accepting new
turns; drive worker usage to total provider capacity minus the configured
interactive reserve, observe another worker queue, and admit a secretary turn;
removing the reserve must make that assertion fail. Saturated workers queue with
the limiting pool; unavailable secretary
capacity is reported rather than answered; a general request creates no Twilight
run; a software request returns correlated durable references; adversarial chat
cannot expand an envelope or release; rename during work preserves stable identity,
history and grants; replacing an OpenClaw session/model remains the same worker.

**Estimate:** 24–48 human hours plus authenticated OpenClaw/provider availability;
0.4M–1.0M tokens, recalibrated from Tasks 5–8 ledgers.

## Task 16: Make work, sessions and environments explorable

- [ ] 16.1 Persist sourced high-level work events and the access-controlled searchable session corpus.
- [ ] 16.2 Deliver the secretary-led overview with worker, assignment, environment, evidence and intervention routes.

**Depends on:** Tasks 13 and 15. **Owns next increment:**
`libs/twilight-assistant/src/{corpus,search,work-events,projection}.ts`, their tests,
`apps/twilight-be/src/{session-search,work-view}.ts`,
`apps/twilight-fe/src/work-view/`, its whole-browser suite, and
`searchSessions`, `readSession`, `readWorkView`. Retain
redacted personal session content without an age default; warn and offer export at
the provisional 10 GiB storage ceiling before deletion (A54, A66). Distinguish runtime observation,
agent report and accepted outcome (A56). Start from prototype A as a reversible
presentation default (A51), showing the environment fields in A64.

**Exit tests:** full-text search finds authorized message and tool-output text at
the exact session position, including an inactive branch; protected and unavailable
content is labeled without indexing its value; ceiling pressure never silently
deletes history; an agent completion claim cannot look accepted; observed deployed
identity outranks a conflicting progress claim while both remain visible; the home
keeps the secretary composer available while opening every worker/assignment
history, evidence report, environment and required intervention; empty state
fabricates no active worker. Repeat the prototype's desktop/mobile interaction set
against live APIs, including Task 5.4's keyboard/accessibility cases for every
intervention route, and run the whole browser gate. Own and name the process that
expires A17's 365-day operational evidence.

**Estimate:** 32–64 human hours plus corpus/storage measurement; 0.5M–1.2M tokens.

## Requirement coverage

Spec requirement to task:

| Requirement (control-plane unless noted)                       | Tasks           |
| -------------------------------------------------------------- | --------------- |
| Bounded request-to-plan authoring                              | 3, 5            |
| One authorized command surface                                 | 3, 5, 11        |
| Versioned inspectable workflow configuration                   | 1, 5, 8, 11, 13 |
| Profile overrides and epochs are explicit                      | 3, 5            |
| Lifecycle points are the one key space                         | 1, 7            |
| Executable restore compatibility                               | 1, 8, 14        |
| Durable stage and activity lifecycle                           | 3, 4, 7, 13     |
| Current authority constrains pinned runs                       | 3, 4            |
| Revision-bound human decisions                                 | 3, 5, 13        |
| Caller identity and human-decision provenance                  | 3, 5            |
| Capacity and budget admission                                  | 4, 6, 13        |
| Run clocks preserve distinct time quantities                   | 4, 13           |
| Model pricing is revision-bound and category-complete          | 4               |
| K3s provides an expandable worker substrate                    | 4, 6, 8         |
| Levers are configurable and their effects are measured         | 4–8             |
| Outcomes use an independent evaluation definition              | 7, 8            |
| Activity defaults are benchmark-driven                         | 11              |
| Context and tool optimization preserves isolation              | 11              |
| Hooks, critics and judges preserve authority                   | 7               |
| Observable evidence with focus access                          | 5, 7            |
| Repository planning: client repository contract                | 2, 8, 14        |
| Repository planning: a planning revision has one owner         | 2, 9, 10        |
| Repository planning: resource units carried without conversion | 2, 9            |
| Scheduling minimizes accepted delivery elapsed time            | 1–2, 4.4, 7.3   |
| Integration is an independently scalable execution service     | 7.3, 8.4, 13.3  |
| Speculation spends only bounded authorized capacity            | 3, 7.4          |
| Scaling is proved at fixed quality before M1 acceptance        | 4.5, 8.4        |
| Assistant: secretary availability and authority boundary       | 15              |
| Assistant: worker identity, session search and work projection | 15–16           |
| Delivery environments: lifecycle and development publication   | 13.1–13.2       |
| Delivery environments: staging, publication and promotion      | 13.3            |
| Assistant: personal home keeps work actionable                 | 16              |
| Delivery environments: layered reports and scheduled sweeps    | 1.0, 7, 13.4    |

User requirement to delivery location:

| User requirements                                                             | Delivery location                                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| TS-01–04, 19: FE/BE, LangGraph, ACP, MCP and integrations                     | Tasks 1, 3, 5–6, 11                                                   |
| TS-05, 07–08, 15–18, 22: discovery/spec/plan, wiki, SDLC trial, focus         | M0; Tasks 1–2, 5, 10, 12                                              |
| TS-06, 10: independent review, cross-review, tests and docs                   | Tasks 7–8                                                             |
| TS-09, 20: tokens/time/capacity, hooks/approvals/roles                        | Tasks 2–4, 7, 11                                                      |
| TS-14: observability and improvement                                          | Tasks 7–8, 12, 14                                                     |
| TS-11–12: cloud browser, development and explicit production                  | Task 13                                                               |
| TS-13, 21: Claire/OpenHands/OpenClaw/Dahl/LangChain research                  | M0 source notes; adopted boundaries in design and Tasks 4, 6–7, 11–12 |
| TS-23–25: client Nx repos, Backlog-backed WBS, same self-growth               | Tasks 2, 8–10, 14                                                     |
| TS-26: autonomous assumptions and Claude Fable 5.1 review                     | M0 assumption ledger and review/evidence record                       |
| TS-27: cost, model, review-depth and parallelism levers with quality tracking | Execution profile; Tasks 4, 6–8, 11                                   |
| TS-28: money buys shorter accepted delivery at fixed quality                  | Tasks 1–8; Task 9 for planning contention                             |
| TS-29–30: operated client installations and expandable K3s worker pool        | Discovery/ADR 0016; Tasks 4, 6, 8                                     |
| TS-31: personal assistant-to-production loop, then customer discovery         | Personal phase route; Tasks 13, 15–16                                 |
| TS-32–35: exhaustive scenarios, layered tests, publication and reports        | Every implementation slice; Tasks 13.2–13.4                           |
| TS-36–37: branch devs, dev-main and production-like staging                   | Task 13                                                               |

All future failure experiments above are planned tests. None is an observed R5
proof until implementation runs the test with its fault and records actual output.
