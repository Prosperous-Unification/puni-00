# Twilight delivery plan

Start with **Task 1: prove the compiler and durable-runtime boundary**. This is
the single authored product plan. Every checkbox is intentionally unchecked:
the current request delivered planning and a repository workflow trial, not the
factory implementation. Execute against the [design](design.md) and both
[capability specs](specs/twilight/). Design is required for this architecture.
Each task names the spec requirements it proves; the
[traceability table](#requirement-coverage) at the end is derived from those lines.

All numerical effort/capacity values below are **planning estimates**, not measured
performance or spending authority. The actor executing an increment receives an
explicit delivery profile and run budget account. Record pinned organization rates,
model tokens, known tool/service cost, agent time, run elapsed and human effort as
their distinct quantities. No automatic spending when budget authority is missing.
The repository gate (`bunx nx format:check --all`, `bunx nx run-many -t test lint typecheck build`,
`openspec validate --all`; `bin/h2puni-gate.sh` on h2puni) and R5 failure proofs apply.

## Milestones and ordering

| Milestone                            | Tasks                                          | Observable exit                                                                                                                                                                                                          | Dependency                              |
| ------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| M0 — repository SDLC trial           | [Pilot tasks](../twilight-sdlc-pilot/tasks.md) | Canonical docs, real CLI counterexamples and attributed plan review; delivered by this request                                                                                                                           | None                                    |
| M1 — usable factory core             | 1–8                                            | Operator starts in FE or MCP under a delivery profile, approves a revision with its budget, restarts the service, pipelines deliverables through integration, proves fixed-quality scaling, inspects evidence and ledger | M0; tasks below specify internal edges  |
| M2 — client planning backend         | 9–10                                           | WBS reads/writes complete plans through per-repo Backlog.md with atomic batches, undo and lossless migration                                                                                                             | WBS refactor closure + M1 planning port |
| M3 — full workflow operations        | 11–12                                          | Multiple agent roles, hooks, capacity, schedules, escalation ladders and wiki operations are configurable and inspectable through all clients                                                                            | M1; M2 for accepting WBS-origin plans   |
| M4 — client delivery and self-growth | 13–14                                          | Real cloud-browser acceptance, controlled release, tested client template upgrades, and factory self-change use the same workflow                                                                                        | M1–M3 and deployment/recovery proofs    |

M1 and the WBS refactor can proceed independently. M2 must not alter WBS storage
before its entry criteria hold. Tasks 9–14 are bounded follow-on increments: create
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

For each behavior: write the production-path negative, observe failure, implement
the minimal contract, observe the positive, inject the named realistic fault and
observe that assertion fail, restore and run affected/full gates as appropriate.
Record the actual failure before the adjacent `Proof:` comment. Unit tests for
pure predicates do not replace request, restart, race or browser tests below.

## Task 1: Compile a workflow and prove durable restart

Proves: Versioned inspectable workflow configuration; Lifecycle points are the
one key space; Executable restore compatibility (A39, A47).

- [ ] 1.1 Prove the pinned Bun/LangGraph/checkpointer interrupt/restart contract and record a go/no-go decision.
- [ ] 1.2 After 1.1 passes, deliver the compiler, contracts and non-vacuous Nx targets.

**Owns:** new `tools/tool-twilight/project.json`, `tools/tool-twilight/src/compile.ts`,
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
record, and `WorkflowRestore.restoreRun(runId)` as the only checkpoint-loading
entry, owning executable resolution, compatibility and revision reconciliation.
The runtime-validated input schema is canonical.

**Acceptance:** the same Git inputs and organization snapshot yield the same digest,
forms, resolved activity plan and effective policies with origin scope; changing
either changes the digest. The compiled stage DAG follows `stages[].after`, retains
scoped ordering boundaries for disabled stages and cannot auto-start the release command;
expand implementation/review/verification per deliverable, join only declared
candidate members at integration, and join required outcomes at handoff;
artifact readiness edges never become stage edges. Profiles resolve a total activity
map: agent activities have an allowed class/per-activity model, tool activities have
a registered implementation and no model, and floors remain enabled. Unknown fields,
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
Delete an activity entry,
enable cloud acceptance without its agent-class model, attach a model to the fixed
tool gate, and disable a floor activity; each must fail the profile-completeness
oracle. Pin the built-in matrix: thorough browser scope is whole, balanced is
affected, economy browser/judge/discovery review/specification critique are disabled,
the critic remains enabled, cloud acceptance is disabled until M4, and every profile
runs the fixed integrated gate with no depth control. Delete the required input/make
it unreadable in separate probes; replace the durable saver with memory and observe
the restart test fail; bypass the floor/rate checks separately and observe their
negatives fail. This does not yet prove external-effect deduplication.

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
`bunx nx test twilight-runtime`. Add lint and source/spec typechecks that compile
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
Current authority constrains pinned runs (A30, A36, A38, A40, A42).

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

3.1: extract `apps/be-01/src/repository/migrate.ts` and `migrate-down.ts` into the
shared library that both apps call, keeping the `down.sql` rule and the migration
lint; its existing `.db.test.ts` cases run unchanged against the extracted module.
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
Levers are configurable and their effects are measured (ledger and rate card
halves) (A41, A46).

- [ ] 4.1 Reserve resource vectors before launch and fence owners.
- [ ] 4.2 Persist effect intent, dispatch through the fence, reconcile and settle.
- [ ] 4.3 Write the run ledger, price it from the rate card and expose capacity and rate-card operations.
- [ ] 4.4 Schedule feasible ready deliverables and request constrained capacity within existing grants.
- [ ] 4.5 Prove dispatch latency and isolation under the coordinator acceptance load.

**Owns:** `libs/twilight-domain/src/admission.ts`, `ledger.ts`,
`libs/twilight-runtime/src/execution/admit.ts`, `lease.ts`, `effects.ts`,
`libs/twilight-runtime/src/ledger/ledger.ts`, `rate-card.ts`,
`apps/twilight-be/src/effects.ts`, `capacity.ts`, `rate-card.ts`, `ledger.ts`,
`apps/twilight-be/src/admission-race.db.test.ts`,
`libs/twilight-runtime/src/execution/effects.db.test.ts`,
`libs/twilight-runtime/src/ledger/ledger.db.test.ts`.

**Depends on:** Task 3. **Produces:**
`admitActivity(command: AdmissionRequest): Promise<AdmissionDecision>`,
`dispatchEffect(request: EffectRequest): Promise<EffectOutcome>`,
`reconcileEffect(effectId: string): Promise<EffectOutcome>`, `settleAttempt`,
one run-scoped `BudgetAccount`, `recordLedgerEntry`, and the `get_capacity`,
`set_capacity`, `publish_rate_card`,
`read_ledger` and `resolve_effect` operations. Intent persistence, provider
transport, fence/authority validation and resource release are private to effect
execution. Admission outcomes are `queued`, `admitted`, `denied`; effect outcomes
`succeeded`, `failed`, `unknown`; every reason is visible.

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

**Estimate:** 12–22 human hours; 3–7 agent hours; 200k–560k tokens, one build slot
and two lightweight child-process slots for race tests.

4.4 owns `libs/twilight-runtime/src/scheduling/ready.ts`, `capacity.ts` and
`scheduling.db.test.ts`; consumes Task 2's `WorkPlan`, Task 3's execution envelope
and `admitActivity`. It produces `selectReady` (selected IDs, scores and blocked
reasons) and `requestCapacity` (requested/granted/refused with pool and reason),
using a registered provisioner rather than organization-administrator credentials.
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

**4.4–4.5 planning allowance:** 16–32 human engineering hours, 4–8 agent hours,
200k–500k tokens, plus separately authorized load-test service charges. These
unmeasured values supplement admission/accounting work and grant no spending.

4.5 uses `libs/twilight-runtime/src/execution/dispatch-load.test.ts` and a controlled
external receiver. Run `scalingAcceptance.coordinator` through `dispatchEffect`,
record host/fixture identities, offered/completed rate, queueing and latency samples.
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
`recovery.tsx`, `levers.tsx`, `apps/twilight-mcp/src/server.ts`,
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

## Task 6: Execute one real ACP activity inside its authority

Proves: Capacity and budget admission (egress and lease halves); Levers are
configurable and their effects are measured (serving model and escalation) (A34, A41).

- [ ] 6.1 Deliver the ACP adapter contract, capability document and deterministic protocol tests.
- [ ] 6.2 Run one live activity inside the effect boundary with scoped credentials, cancellation and escalation.

**Owns:** `apps/twilight-worker/src/main.ts`,
`libs/twilight-runtime/src/agents/acp.ts`, `capabilities.ts`, `escalation.ts`,
`libs/twilight-runtime/src/agents/acp-contract.test.ts`,
`apps/twilight-worker/src/containment.test.ts` and versioned integration fixtures.

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

6.2: run a live low-risk fixture task in an isolated scratch repository. Test
permissions at the actual tool/egress boundary: forbidden network target and
credential lookup cannot be performed even when prompt text asks for them. Replace
the enforcement boundary with an allow path and observe the controlled
denied-target counter change. If tool interception is unavailable, restrict the
whole sandbox and reject any workflow requiring finer controls. Use the A34
credential lifecycle: repository/provider-scoped secret references resolved by the
trusted launcher into an isolated ephemeral mount; never an operator's home. Test
wrong-client secret lookup, expired/revoked credentials, and removal after observed
worker exit; synthetic credential canaries must not reach traces or Git.

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

**Estimate:** 10–22 human hours; 3–7 agent hours; 170k–500k tokens plus separately
admitted live-provider spend; one provider slot and isolated workspace.

## Task 7: Join evidence, hooks, review and the outcome record

Proves: Hooks, critics and judges preserve authority; Observable evidence with
focus access; Lifecycle points are the one key space (`onRework`); Levers are
configurable and their effects are measured (outcome half) (A48).

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

**Tests (7.1):** required hook timeout/malformed output keeps the independent
worker launch counter at zero; optional notification fails visibly as degraded;
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
`integration.test.ts`, `apps/twilight-be/src/candidates.ts` and
`apps/twilight-fe/e2e/integration.spec.ts`. Consume WorkPlan contracts, envelope,
source/plan locks, evidence and gate adapters; produce immutable candidate records
through `composeCandidate` and `publishCandidate`. Expose queue/member/base/check/
repair state through run events and FE/MCP run views. Preparation and verification
use separate workspace/build/browser reservations. Integration prepares only;
acceptance completion publishes through effect execution after the candidate oracle
and all required checks. Handoff consumes the publication receipt. Hold the oracle
at a barrier and assert the shared source ref stays unchanged; inject early
publication and watch that assertion fail. Publication uses source-ref CAS.

Start with an implementation barrier: an independent deliverable must finish review
and verification before release of that barrier. Inject a run-wide stage join and
observe it fail in that window. Compose branches that pass alone but violate an
independently authored cross-contract assertion together; copying branch greens must
make the candidate-refusal assertion fail. Move the base during verification: no
publication until recomposition and a fresh gate. Introduce one failing member and
observe an independent candidate continue. Restore all-or-nothing run blocking to
prove that observation. Verify source/plan-lock union and reject changed dependency
contracts. A knowledge edit after candidate checks must trigger new verification;
reusing the earlier receipt must fail at candidate acceptance. Exercise crash after
source publication before receipt recording: reconcile once, never republish.
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

## Task 8: Accept the first useful factory run

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

8.1: test a real harmless source change through request, assumption,
specification, plan approval, ACP execution, profile-selected review, the fixed
integrated gate and knowledge reconciliation, once under `balanced` and once under
`economy`. Balanced runs one critic and judge with affected browser verification; economy
runs its critic with no judge or browser verification. Cloud acceptance is disabled
for both until Task 13 enables and proves it. Assert activity dispositions and
independent dispatch/session counters; enable economy's judge or either profile's cloud
acceptance as injected faults and observe those counters increment or the unavailable provider
block M1. Interrupt
once during approval and once after a controlled effect. `read_outcomes` must show
both runs with money, agent time, run elapsed, rework rounds and activity
dispositions side by side, each figure measured or unavailable. Pin the same basic
independent evaluation revision/cohort to both: an immature defect window remains
unknown, and these two runs prove instrumentation without authorizing automatic
profile recalibration. Inject a per-profile observation set and watch comparison
eligibility fail. Repeat against a generated repo with a different
repository ID and prove it has no puni-specific content, personal paths or shared
credentials. Pin forbidden content canaries: `/home/df/`, `/Users/danylofedorov`,
`/root/`, `h2puni`, `h1claw` and the legacy `wbs-tool-v1` identity. Each occurs in
this repository's own docs, receipts or archived changes, which is what makes the
injection meaningful. A clean fixture passes; inject each into a copied template
file and watch the actual acceptance gate fail.

Run source/spec typechecks, lint, build, all affected tests and the complete
browser gate on the owned stack. The repository's Playwright server-reuse landmine
applies to every browser test in this plan: own ports and databases, verify the
served build identity, and run the whole browser gate when shared UI or CSS
changes. Run the repository-wide gate on the correct host/lock before integration.
M1 acceptance is a working local/development core; cloud-browser deployment and
production machinery are Task 13's.

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

8.4 owns `tools/tool-twilight/src/scaling.ts`, `scaling.test.ts` and versioned
`fixtures/scaling/` with independently authored outcome assertions. Run through an
Nx `tool-twilight:scaling` target created with this behavior, consuming the real
scheduler, ACP workers, integration queue and gate adapters. The canonical capacities,
repetitions and speedup/coordinator budgets are `execution.yaml.scalingAcceptance`;
do not copy constants into fixtures or derive test advances from the challenged value.

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
costs and elapsed times. M1 duration remains unmeasured until those ledgers exist.

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

- [ ] 11.1 Expand roles/hooks/capacity, model routing and cron/webhook automation for OpenSpec-origin plans after M1.
- [ ] 11.2 After Task 10, connect the same automation to accepted WBS/Backlog plan revisions.

**Depends on:** 11.1 depends only on M1; 11.2 alone depends on Task 10 and 11.1.
**Owns next increment:** role registry, second ACP adapter, policy editor
expansion, automation admission and queue views. Use the
[product matrix](../../../docs/twilight-structure/product-experience.md) as the
coverage ledger: each control needs schema/form/API/MCP/runtime/test entries and,
where it is a lever, ledger and outcome fields.

Add specialist critics (including safety critics), judges with rubric/version/
dissent, scoped hook registrations, provider rate pools and fair queues, multi-step
escalation ladders and per-activity model routing, and `onTrigger` automation:
cron/webhook occurrence IDs, timezone/DST policy, overlap and missed-run behavior,
with retries bounded by `onTrigger.schedule.retries` and recursion bounded by a
profile `maxRecursion` field. Cron invokes the same admission path as manual work.
A required unavailable channel is a failed operation, not a successful notification.

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
context or credential crosses clients. Unknown telemetry remains explicit.

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

## Task 13: Deliver through real development acceptance and controlled release

- [ ] 13.1 Join artifact-identified dev deployment, cloud-browser evidence, production command and recovery.

**Depends on:** Task 8 and Task 11.1 (release health notifications ride the same
hook and trigger machinery). **Owns next increment:** deployment adapter,
cloud-browser integration, release command UI/MCP authority and runbooks. Use
existing deploy planners/locks through supported interfaces, not copied shell
scripts. Re-check current runbooks and the inspected code before choosing reuse.
Start with the Browserbase cloud-session integration selected in A32. Pin the
provider/connector and prove the Nx-invoked runner against a real remote session
before acceptance; its docs' Bun/Playwright warning is a compatibility gate, not a
reason to silently run local Chrome instead. Record session ID, served source
identity, bounded credentials, recording/export retention and observed teardown.

**Exit tests:** served revision mismatch blocks browser acceptance; cloud browser
cannot silently reuse another checkout; mandatory browser unavailable blocks the
stage; wrong/stale candidate or environment approval refused; no human decision
means no production effect; health failure triggers observed recovery; unknown
remote state throws; migration rollback failure remains visible with recovery
instructions. Task 8's whole-browser-gate rule applies.

**Estimate:** 24–48 human hours plus external environment availability. One host-wide
release/build lease; production activity only on an explicit candidate-bound command.

## Task 14: Prove the self-growing repo and client upgrade cycle

Adopts the M4 delta's upgrade rollback contract from the
[design](design.md#release-and-operational-limits) (A39).

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
compatibility matrix and retained executable/hook closure. No successful migration
or rollback is promised for unsupported old/new combinations.

**Estimate:** 16–32 human hours plus a complete canary cycle; use measured M1–M3
ledgers for agent budgets instead of extrapolating today's untested estimates.

## Requirement coverage

Spec requirement to task:

| Requirement (control-plane unless noted)                       | Tasks         |
| -------------------------------------------------------------- | ------------- |
| Bounded request-to-plan authoring                              | 3, 5          |
| One authorized command surface                                 | 3, 5          |
| Versioned inspectable workflow configuration                   | 1, 5, 8       |
| Lifecycle points are the one key space                         | 1, 7          |
| Executable restore compatibility                               | 1, 8, 14      |
| Durable stage and activity lifecycle                           | 3, 4          |
| Current authority constrains pinned runs                       | 3, 4          |
| Revision-bound human decisions                                 | 3, 5          |
| Caller identity and human-decision provenance                  | 3, 5          |
| Capacity and budget admission                                  | 4, 6          |
| Levers are configurable and their effects are measured         | 4, 6, 7, 8    |
| Hooks, critics and judges preserve authority                   | 7             |
| Observable evidence with focus access                          | 5, 7          |
| Repository planning: client repository contract                | 2, 8, 14      |
| Repository planning: a planning revision has one owner         | 2, 9, 10      |
| Repository planning: resource units carried without conversion | 2, 9          |
| Scheduling minimizes accepted delivery elapsed time            | 1–2, 4.4, 7.3 |
| Integration is an independently scalable execution service     | 7.3, 8.4      |
| Speculation spends only bounded authorized capacity            | 3, 7.4        |
| Scaling is proved at fixed quality before M1 acceptance        | 4.5, 8.4      |

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

All future failure experiments above are planned tests. None is an observed R5
proof until implementation runs the test with its fault and records actual output.
