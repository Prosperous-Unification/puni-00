# Twilight delivery plan

Start with **Task 1: prove the compiler and durable-runtime boundary**. This is
the single authored product plan. Every checkbox is intentionally unchecked:
the current request delivered planning and a repository workflow trial, not the
factory implementation. Execute against the [design](design.md) and both
[capability specs](specs/twilight/). Design is required for this architecture.

All numerical effort/capacity values below are **planning estimates**, not measured
performance or spending authority. The actor executing an increment receives an
explicit scope/budget. Record actual model rates at admission, observed tokens,
human effort, elapsed time and review cost separately. No automatic spending when
a budget is missing. Existing repository gate and R5 failure proofs apply.

## Milestones and ordering

| Milestone                            | Tasks                                          | Observable exit                                                                                                                                    | Dependency                                       |
| ------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| M0 — repository SDLC trial           | [Pilot tasks](../twilight-sdlc-pilot/tasks.md) | Current request produces canonical docs, real CLI counterexamples and attributed plan review                                                       | This work                                        |
| M1 — usable factory core             | 1–8                                            | Operator starts in FE or MCP, configures a run, approves a revision, restarts the service, executes one bounded ACP activity and inspects evidence | M0; tasks below specify internal edges           |
| M2 — client planning backend         | 9–10                                           | WBS reads/writes complete plans through per-repo Backlog.md with atomic batches, undo and lossless migration                                       | WBS refactor landing evidence + M1 planning port |
| M3 — full workflow operations        | 11–12                                          | Multiple agent roles, hooks, capacity, schedules and wiki operations are configurable and inspectable through all clients                          | M1; M2 for accepting WBS-origin plans            |
| M4 — client delivery and self-growth | 13–14                                          | Real cloud-browser acceptance, controlled release, tested client template upgrades, and factory self-change use the same workflow                  | M1–M3 and deployment/recovery proofs             |

M1 and the WBS refactor can proceed independently. M2 must not alter WBS storage
before its entry criteria hold. Tasks 9–14 are bounded follow-on increments: create
their own OpenSpec deltas/design from these contracts when their dependencies land,
so post-refactor file paths and provider facts are verified at the correct revision.
They are not speculative permission to begin a migration now.

## Common execution contract

One implementation owner per slice and an independent review at its end. Use
separate worktrees for concurrent slices and isolate ports, databases, caches and
credentials. Concurrency starts at two agents; reserve review capacity and permit
one writer per workspace lineage. After two fix/review rounds, pause unresolved
blockers with evidence; never average verdicts into a pass.

For each behavior: write the production-path negative, observe failure, implement
the minimal contract, observe the positive, inject the named realistic fault and
observe that assertion fail, restore and run affected/full gates as appropriate.
Record the actual failure before the adjacent `Proof:` comment. Unit tests for
pure predicates do not replace request, restart, race or browser tests below.

## Task 1: Compile a workflow and prove durable restart

- [ ] 1.1 Prove the pinned Bun/LangGraph/checkpointer interrupt/restart contract and record a go/no-go decision.
- [ ] 1.2 After 1.1 passes, deliver the compiler, contracts and non-vacuous Nx targets.

**Owns:** new `tools/tool-twilight/project.json`, `tools/tool-twilight/src/compile.ts`,
`libs/twilight-contracts/src/workflow.ts`,
`libs/twilight-runtime/src/workflow/compile.ts`,
`libs/twilight-runtime/src/workflow/compile.test.ts`,
`libs/twilight-runtime/src/workflow/checkpoint.db.test.ts`, and the first
`execution.yaml` beside the Twilight schema. Fold Nx/tsconfig setup into this task.

**Depends on:** M0. **Produces:**
`compileWorkflow(inputs: WorkflowInputs): CompiledWorkflow` and
`CheckpointPort` with persisted run/thread/revision identity, selected package
pins and a compatibility record. Add `WorkflowRestore.restoreRun(runId)` as the
only checkpoint-loading/resume entry; it owns executable resolution, compatibility
and revision reconciliation. Its implementation belongs under
`libs/twilight-runtime/src/workflow/restore.ts`, with production-path fixtures in
`restore.db.test.ts`. The runtime-validated input schema is canonical.

**Acceptance:** same inputs yield the same digest/forms/effective policies; a
changed prerequisite changes the digest; unknown fields and unrepresentable
policies are errors. Package selection uses current primary release/API docs and
records actual lockfile pins. Prove the selected LangGraph JS/checkpointer pair
runs under Bun, persists before interrupt, and resumes after process termination.
If the selected adapter fails, test a supported external checkpoint store before
changing runtime language; record that decision before Task 3.

**Tests:** `compile rejects unreadable required template`, `compile rejects
unsupported beforeTool policy`, `checkpoint resumes the same pending decision
after SIGKILL`. Delete the required input/make it unreadable in separate probes;
replace the durable saver with memory and observe the restart test fail. This
does not yet prove external-effect deduplication.

Retain controller/graph, compiler, runtime/lock, serializer/saver, application schema
and hook/adapter digests. Exercise an old pending-approval checkpoint on a compatible
new controller and assert the same subject/transition and pinned hook behavior.
Separately remove a pinned executable, make it unreadable, substitute the latest
hook under the same name, and present an unsupported serializer/schema. Each must
refuse before a fixture worker/effect counter increments; a compatible positive
must increment it after approval. Bypass compatibility to prove those assertions
can fail. Task 8 adds a real uncertain-effect upgrade/rollback fixture once Task 4
exists, limited to incompatibility refusal and retained-version recovery. No retained
package or format is assumed compatible from its version name; M1 may refuse an
upgrade while incompatible nonterminal runs exist.

**Commands established by this task:**
`bunx nx run tool-twilight:compile -- --repository <fixture> --json` and
`bunx nx test twilight-runtime`. Add lint and source/spec typechecks that compile
actual files; inject a deliberate type error to prove those targets see them.

Record separate evidence for each checkbox: 1.1 uses a minimal graph independent
of the compiler; 1.2 proves compilation against that selected runtime boundary.

**Estimate:** 8–16 human engineering hours (4–8 per deliverable); 2–5 agent elapsed hours; 120k–360k tokens,
one execution slot. Stop on unresolved checkpoint durability or compiler authority.

## Task 2: Define client repository identity and the planning port

- [ ] 2.1 Validate a clean client fixture and read one revision-bound plan without copying puni content.

**Owns:** `libs/twilight-contracts/src/repository.ts`,
`libs/twilight-runtime/src/repository/manifest.ts`,
`libs/twilight-runtime/src/planning/openspec-plan.ts`,
`tools/tool-twilight/src/repository.test.ts`, and
`tools/tool-twilight/fixtures/client-minimal/`.

**Depends on:** Task 1 contract. **Produces:**
`readRepository(root: string): RepositoryManifest` and
`PlanningPort.readPlan(reference: PlanRef): Promise<WorkPlan>` using the design's
repository/plan/change/source identity tuple.
`WorkPlan` contains stable task IDs, dependencies, requirements, owner, resource
units and source revision. A future Backlog implementation satisfies that port.

Validate stable repository ID/version/context roots and reject required paths
outside the authorized repository. Build task briefs from actual `Task N` headings
and stable deliverable IDs such as `1.1`/`1.2`; preserve multiple deliverables per
group and compare extracted task IDs/count/order to a pinned
fixture, including two changes with identically named `tasks.md`. No shared
`.superpowers/sdd/tasks` directory can collapse their identity.

**Tests:** `fresh fixture needs no home skills`, `two repositories cannot resolve
each other's plans`, `task briefs preserve dependency and proof fields`,
`malformed task artifact refuses execution`. Inject a cross-repo path, missing
skill package, duplicate task ID and old parser format; each must fail before run
admission. Test symlink escape at the actual read boundary.

Use a versioned change-keyed plan-lock fixture with two changes and immutable input
receipt snapshots, including an explicit empty snapshot. Reject missing/unreadable
snapshots separately, mismatched map key/change/export path, and a lock that tries
to consume its candidate's own output receipt. Verify that adding a later output
receipt leaves the earlier candidate and its exported checkbox view byte-identical.

Run the clean-client fixture in a disposable container with empty home and XDG
directories, passed through the container runtime's supported options. Do not
repurpose the shell's `HOME`/`CODEX_HOME` variables. It must succeed using packaged
repo skills; injecting a required reference to an absent home skill must fail at
the same resolver. Record both controls before claiming independence from home setup.

Bootstrap binds repository/organization/policy/integration references through a
trusted operator command before first use. The manifest distinguishes initial
`openspec` planning from later `wbs-backlog`; untrusted content cannot grant its
own server access. Test a missing binding and a second repo claiming the first's ID.

**Estimate:** 4–8 human hours; 1–3 agent hours; 80k–200k tokens, one slot.
Can overlap Task 3 after shared Task 1 contracts are frozen.

## Task 3: Persist authorized runs and revision-bound approvals

- [ ] 3.1 Implement and verify OIDC caller identity and interactive decision-token issuance under A30.
- [ ] 3.2 Expose submit/read/command/decision operations with atomic transition and outbox records.

**Owns:** `apps/twilight-be/src/app.ts`, `apps/twilight-be/src/runs.ts`,
`apps/twilight-be/src/approvals.ts`, `apps/twilight-be/src/auth.ts`,
`apps/twilight-be/src/auth.integration.test.ts`,
`libs/twilight-domain/src/run.ts`, `libs/twilight-domain/src/approval.ts`,
`libs/twilight-runtime/src/repository/run-store.ts`, migrations plus `down.sql`,
`apps/twilight-be/src/run-lifecycle.db.test.ts`.

**Depends on:** Task 1; Task 2 to bind real repo/plan identity. **Consumes:** the
command contracts in design. **Produces:** `submitRequest`, `commandRun`,
`decideApproval`, and event/outbox interfaces used by worker and clients.
`libs/twilight-runtime/src/authority/authorize.ts` owns `authorizeAction`: pinned
requested/approved scope intersected with current grants/floors. BE routes and
Task 4's dispatch use that module; callers cannot construct their own authorization
ordering or treat an earlier decision response as an enduring dispatch grant.

Before the first Twilight migration, extract be-01's migration runner
(`apps/be-01/src/repository/migrate.ts`, `migrate-down.ts`) into a shared library
that both apps call, keeping the `down.sql` rule and the migration lint (A38);
its existing `.db.test.ts` cases run unchanged against the extracted module.
Reuse `JwksTokenVerifier` and `browserOidcClientFromEnv` from `libs/auth` after
reading their tests and the existing be-01 auth/boot callers. Configure a separate
Twilight OIDC client/audience and durable server-side browser session; no copied
WBS identity database or auto-provisioned organization membership. Implement the
design's browser-session-only decision-token endpoint. A valid service token and
an ordinary user-delegated MCP token both receive 403 when minting or spending a
human approval without that capability; a real local OIDC/JWKS test issuer plus
the browser flow supplies the positive control. Test wrong audience/issuer,
callback replay, missing CSRF/origin binding, revocation, single-use expiry and
wrong intended consumer. A token minted for one authorized client must not be
spendable by a different client, even when the actor and subject match.

Derive actor from verified auth; validate request boundary once. Persist decision
attempts, subject revision/digest, expiry, policy revision and effect scope.
Return 409 for stale revision, 403 for insufficient scope, 422 for invalid workflow
combination. A human decision capability is separate from an agent's ordinary
user-delegated token. All writes deduplicate command IDs with parameter digests;
reusing a key for different parameters is a conflict. Atomically bind token
consumption to canonical command identity and the decision receipt. Lose the
response after commit, advance beyond token expiry, then retry the identical
command against the actual BE endpoint with authenticated caller contexts and
access to that answer: assert the same receipt and one committed decision/admission.
Task 5 repeats this scenario through the implemented FE and MCP clients. Use the consumed token with another
key, changed parameters and wrong consumer separately; assert refusal and no extra
admission. An expired token never committed must fail. Inject consumed-token
checking before exact retry lookup and observe the lost-response test fail; bypass
token-to-command binding and observe the different-command test fail.

Implement `revise_artifact` and `adopt_plan` with expected revisions, coverage and
resource validation. A new request uses its explicitly selected discovery envelope
for research/artifact work; it cannot edit product code or launch implementation
until plan approval. Test an empty request through real API artifact creation and
adoption, malformed/incomplete plan refusal, and a discovery agent attempting a
product-code write. No fixture-only file write may supply the missing plan.
Include null discovery envelope: manual authoring succeeds, automated discovery
and model spend remain refused until the user selects a valid envelope.

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
Count committed admission/outbox records at this stage; Task 6 must repeat the
stale/refreshed approval test against an actual worker launch counter. A missing
worker cannot be the reason the earlier zero assertion passes.
Additional tests cover duplicate FE/MCP start, A→B→A subject revisions, expired
or revoked decisions, agent-provided `approved:true`, and client-B evidence present
while client-A reads it. Remove the subject/actor predicates independently and
observe the relevant assertions fail. Kill between store transaction and graph
checkpoint and prove outbox reconciliation preserves one transition.

Hold approved work queued, then independently revoke membership, repository grant,
approval or integration grant and tighten a safety floor. Each admission must refuse
with its reason and no launch. Relax a floor and ask for a capability outside the
original approval: it still refuses. Remove the relevant current/pinned intersection
and observe each negative fail; restore it and execute an authorized positive.
Task 6 repeats the admitted-record oracle against a real worker launch.

**Estimate:** 12–24 human hours; 3–7 agent hours; 190k–500k tokens, one writer slot.

## Task 4: Admit resources and recover uncertain effects

- [ ] 4.1 Reserve resource vectors before launch, fence owners, and reconcile effect outcomes.

**Owns:** `libs/twilight-domain/src/admission.ts`,
`libs/twilight-runtime/src/execution/admit.ts`, `lease.ts`, `effects.ts`,
`apps/twilight-be/src/admission-race.db.test.ts`,
`libs/twilight-runtime/src/execution/effects.db.test.ts`.

**Depends on:** Task 3. **Produces:**
`admitActivity(command: AdmissionRequest): Promise<AdmissionDecision>`,
`dispatchEffect(request: EffectRequest): Promise<EffectOutcome>`,
`reconcileEffect(effectId: string): Promise<EffectOutcome>`, and `settleAttempt`.
Intent persistence, provider transport, fence/authority validation and resource
release are private to effect execution; graph nodes and workers cannot call
`recordEffect` then dispatch or release resources independently.
Discriminated outcomes include `queued`, `admitted`, `denied`, and
effect `succeeded`, `failed`, `unknown`; every reason is visible.

**Tests:** barrier-synchronized concurrent requests for one remaining slot; two
pools with one unavailable (no partial reservation); expired owner tries to
publish/free a replacement lease; SIGKILL after external fixture server records
success but before acknowledgment; cancellation while worker ignores its first
signal. The fixture effect server exposes an independent request counter and
receipt query. Assert that counter remains one after restart, then remove
reconciliation and watch it become two. Do not assert only the journal count.

Unknown usage with a strict budget refuses admission unless a defensible
reservation and stop mechanism exist. Test queue aging/client ceilings, reviewer
reservation and hold-free waiting on a human decision. A cancelled worker's slot
remains occupied until its exit is observed; mutation releases it early while the
process is alive and must fail a launch-count assertion. Add these distinct
production-path experiments; none is covered by deduplicating a repeated key:

| Proposed fault                             | Scenario and independent oracle                                                                                                                                                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skip attempt-fence validation on dispatch  | Keep expired attempt A alive, grant replacement B an isolated workspace/fence, then have A submit a new effect key. Receiver request count stays zero for A and increments for authorized B; removing the fence must increment A's counter.                                      |
| Check authority only at admission          | Hold a recorded tool/hook intent before dispatch, revoke its grant or tighten the floor, then release the barrier. External receiver sees zero requests; removing dispatch revalidation must produce one.                                                                        |
| Reuse a writable workspace on lease expiry | Keep an old writer modifying a sentinel after expiry. Replacement cannot mount that workspace until the writer/mount is verifiably detached; remove that condition and observe conflicting writes.                                                                               |
| Release remote resource on local PID exit  | Worker exits while fixture provider/browser job remains active. Replacement stays queued; only independently queried terminal state releases it. Missing/unreadable remote state retains the hold. Remove remote terminal validation and observe a second concurrent remote job. |

Exercise cancellation/revocation ordered on both sides of dispatch admission: before
commit must prevent the request; after dispatch must reconcile/stop it without
claiming it was unsent. Unknown spend remains unresolved in accounting; abandoning
unknown effect outcome does not release a still-active remote reservation.

Add `resolve_effect` with scoped decision authority, expected effect/run revisions,
evidence references and explicit confirmation/terminal-abandonment dispositions.
Exercise acknowledgment loss with a provider lacking a receipt query; ordinary
resume must not dispatch again. Evidence-backed resolution or retained-unknown
abandonment must be possible through BE and FE/MCP, with a second decision refused
as stale. Confirming non-application does not itself grant a new dispatch.

**Estimate:** 8–16 human hours; 2–6 agent hours; 150k–450k tokens, one build slot
and two lightweight child-process slots for race tests.

## Task 5: Deliver the FE/MCP run and configuration loop

- [ ] 5.1 Expose the shared operation contracts through authenticated Streamable HTTP MCP and prove BE parity.
- [ ] 5.2 Deliver request/artifact/run/approval/recovery browser journeys against the real BE operations.
- [ ] 5.3 Deliver configuration preview/publication and prove repository CAS and CLI digest parity.
- [ ] 5.4 Deliver the focus/full views, resume behavior and Chromium accessibility checks.

**Owns:** `apps/twilight-fe/src/routes/runs.tsx`, `workflow-editor.tsx`,
`approval.tsx`, `capacity.tsx`, `apps/twilight-mcp/src/server.ts`,
`libs/twilight-contracts/src/operations.ts`,
`apps/twilight-fe/e2e/workflow.spec.ts`, `apps/twilight-mcp/src/server.test.ts`.

**Depends on:** Tasks 2–4. **Consumes:** BE operations in design.
Read `apps/mcp-01/src/http.ts`, `oauth.ts`, `server.ts` and their request/auth tests
before deciding reuse of the existing Streamable HTTP transport and verifier. Do
not reuse its per-request bearer forwarding: A36 requires a Twilight-MCP-audience
token to be refused by BE directly, with token exchange or an actor-carrying service
credential in between; test both refusals. Do not carry WBS-specific identity or
permission rules into Twilight merely because the transport matches.
**Produces:** schema-derived forms and MCP descriptions calling that BE; no
alternate state transitions or permissions in the clients. Start with registered
hooks and one agent role; all supported settings for that subset are visible.
Unimplemented expansion controls are explicitly unavailable, not inert switches.

**Tests:** submit in browser/read same run through MCP, then reverse; duplicate
submit returns same run; approval UI displays exact diff and issues a subject-bound
human decision token; an agent MCP token cannot approve without it. Block a
request in flight and assert the UI has not optimistically accepted the decision.
Restart BE during approval, reload the page, and recover the same pending state.
Drop the decision response after commit and retry with the same command identity:
the UI and MCP show the original receipt without minting a second token. Show live
revocation against the retained pinned definition, incompatible-restore recovery,
and a cancelled local worker whose remote slot remains visibly held.

Start the browser journey with no artifacts or plan: create/revise intent/specs/
tasks in the workbench or via authorized discovery, adopt the complete plan, and
approve its exact revision through real operations. Include recovery inbox
resolution. Publishing a workflow must create canonical repository inputs:
check out the published revision and compile with the CLI to the same digest;
race a competing Git edit and require conflict rather than divergent policy.

Configuration preview shows inherited origin/restriction; forbidden override is
rejected through FE and direct MCP. Focus view carries the same failure and decision
as full view, offers one next action, retains full evidence access, and resumes
after reload. Test keyboard/accessibility and browser default actions in Chromium.
Use owned ports/DBs and assert served source identity before counting a pass.

Keep one acceptance receipt per deliverable; 5.2/5.3 consume the contracts from
5.1 and 5.4 preserves the obligations displayed by those journeys.

**Estimate:** 16–32 human hours; 4–10 agent hours; 260k–800k tokens, one browser
slot and one frontend writer. Can overlap Task 6 after contracts are stable.

## Task 6: Execute one real ACP activity inside its authority

- [ ] 6.1 Run one verified provider adapter with cancellation, bounded tools, persisted identity and evidence.

**Owns:** `apps/twilight-worker/src/main.ts`,
`libs/twilight-runtime/src/agents/acp.ts`, `capabilities.ts`,
`libs/twilight-runtime/src/agents/acp-contract.test.ts`,
`apps/twilight-worker/src/containment.test.ts` and versioned integration fixtures.

**Depends on:** Tasks 3–4. **Produces:** `AgentSessionPort` for start/stream/cancel/
reconcile plus an explicit capability document. Discover and pin the actual ACP
adapter/model; choose between intended providers based on authenticated contract
evidence, not a presumed SDK alias. Probe Claude first, then Codex if its required
capabilities fail; if both fail, stop with both reports rather than relabel another
transport ACP. The unselected provider is Task 11's second adapter candidate.
`agy` remains unavailable until its own
adapter passes the same suite. A second provider must not inherit the first's
resume/permission/usage claims.

Use a deterministic fake ACP process for protocol/error tests, then a live low-risk
fixture task in an isolated scratch repository. Test permissions at the actual
tool/egress boundary: forbidden network target and credential lookup cannot be
performed even when prompt text asks for them. Replace the enforcement boundary
with an allow path and observe the controlled denied-target counter change.
If tool interception is unavailable, restrict the whole sandbox and reject any
workflow requiring finer controls. Record each optional telemetry gap.

**Tests:** disconnect/resume/reconcile, duplicate start, cancelled process exit,
malformed protocol frame, denied tool call, missing usage under strict budget,
and explicit unsupported capability. No real client secrets in this fixture.

Use the A34 worker credential lifecycle: repository/provider-scoped secret
references resolved by the trusted launcher into an isolated ephemeral credential
mount. Never mount an operator's home or share provider auth across clients.
Test wrong-client secret lookup, expired/revoked credentials, and removal after
observed worker exit; synthetic credential canaries must not reach traces or Git.

The real ACP path must use the effect boundary from Task 4. For M1, all externally
visible effects use brokered tools; unmediated shell tools are limited to isolated
scratch/source writes with network denied. A live ACP activity attempting direct
egress must hit the actual sandbox denial. Test acknowledgment loss and replay
through the brokered ACP tool path, not only a standalone effects fixture. Keep a
stale ACP process alive after expiry and request a new external action: the broker
fence must deny it, and a direct egress attempt must hit sandbox enforcement.
Prove workspace reuse waits for all old writable access to be detached, and local
exit cannot release an independently still-active provider session.

**Estimate:** 8–20 human hours; 2–6 agent hours; 150k–450k tokens plus separately
admitted live-provider spend; one provider slot and isolated workspace.

## Task 7: Join evidence, hooks and independent review

- [ ] 7.1 Run mandatory pre/post checks, one critic and one judge, with source-bound evidence and bounded rework.

**Owns:** `libs/twilight-runtime/src/hooks/registry.ts`,
`libs/twilight-domain/src/review.ts`,
`libs/twilight-runtime/src/evidence/store.ts`, `redact.ts`,
`apps/twilight-be/src/events.ts`,
`apps/twilight-be/src/review-flow.db.test.ts`,
`apps/twilight-fe/e2e/evidence.spec.ts`.

**Depends on:** Tasks 5–6. **Produces:** attributed finding/verdict records, durable
scoped event cursors, evidence manifests and hook outcomes shared by all clients.
Mandatory deterministic checks run outside model authority. A safety critic is a
read-scoped reviewer, not a credential broker or final approver.

**Tests:** required hook timeout/malformed output keeps the independent worker
launch counter at zero; optional notification fails visibly as degraded; post-hook
failure after an effect does not replay the effect; author cannot act as independent
reviewer; two review rounds leave a blocker paused. Stale evidence, wrong repo and
wrong revision cannot close a task. A prompt-injection source asking to weaken the
rubric is retained as text and changes no authority.

Inject known synthetic secrets into tool output; assert absence in persisted blobs,
events, error messages and exported bundle, while redaction metadata is present.
Remove redaction at the persistence boundary and watch the storage assertion fail.
Cursor replay after reconnect yields the same events; expired cursor explicitly
requests resync. No private model reasoning is part of the contract.

**Estimate:** 8–16 human hours; 2–5 agent hours; 120k–350k tokens, one reviewer
slot reserved alongside the implementation slot.

## Task 8: Accept the first useful factory run

- [ ] 8.1 Run the complete M1 journey on puni-00 and a clean client fixture, then package the repository contract.

**Owns:** `apps/twilight-fe/e2e/first-run.spec.ts`,
`tools/tool-twilight/src/template.ts`,
`tools/tool-twilight/fixtures/client-minimal/`, initial versioned starter package,
and the change's eventual `verify.md`/runbook updates.

**Depends on:** Tasks 1–7. Test a real harmless source change through request,
assumption, specification, plan approval, ACP execution, critic/judge, integrated
gate and knowledge reconciliation. Interrupt once during approval and once after
a controlled effect. Repeat against a generated repo with a different repository
ID and prove it has no puni-specific content, personal paths or shared credentials.
Pin forbidden content canaries: `/home/df/`, `/Users/danylofedorov`, `/root/`,
`h2puni`, `h1claw` and the legacy `wbs-tool-v1` identity. Each occurs in this
repository's own docs, receipts or archived changes, which is what makes the
injection meaningful; a canary that never occurs in the source it guards is a
check that cannot fail. A clean fixture passes; inject each into a copied
template file and watch the actual acceptance gate fail. Do not merely scan an
empty or ungenerated output directory.

At M1 acceptance, set `schema: twilight-v1` in puni-00 and the generated client
template. Before switching, pin every existing change's current schema in its
`.openspec.yaml` so old changes retain their workflow. Prove a new change selects
Twilight in both repos and a pre-existing `sdd-lean` change is still interpreted
under that schema. The current trial remains opt-in until this migration is tested.

Run source/spec typechecks, lint, build, all affected tests and the complete browser
gate on the owned stack. Run the repository-wide gate on the correct host/lock
before integration. Package/template clean-clone checks are part of the gate.
M1 acceptance is a working local/development core; cloud-browser deployment and
production machinery are additional requirements in Task 13.

Rehearse incompatible-upgrade refusal using Task 1's retained packages and Task 4's
actual effect fixture. With a pending approval and uncertain effect, present an
unsupported executable/checkpoint/hook closure and assert zero new worker/effect
dispatches. Use the protected recovery command with the rejected controller
unavailable to return to the retained supported closure: preserve the pending
subject, transition/outbox identity and unknown effect; receiver count stays one.
Inject latest-hook substitution or bypass restore validation and observe the named
refusal/counter assertion fail. M1 can refuse an incompatible upgrade with nonterminal
runs. Successful schema/graph migration and rollback preserving post-upgrade writes
belong to Task 14 for explicitly supported paths.

**Estimate:** 8–16 human hours; 2–5 agent hours; 120k–350k tokens, exclusive
integration/build/browser capacity. M1 aggregate rough estimate: 72–148 human
engineering hours and 1.19M–3.46M agent tokens before contingency. Plan 30% rework
reserve; recalibrate after Tasks 1 and 4. These are ranges, not delivery promises.

## Task 9: Prove the Backlog/WBS storage adapter after refactors

- [ ] 9.1 Specify and prove a lossless revisioned planning adapter against the landed WBS repository contract.

**Entry:** the concrete [refactor closure checklist](../../../docs/twilight-structure/client-repositories.md#cutover-after-the-refactors-land),
including a recorded landing revision, dispositions of the remaining W4-3/W4-4/
W2-1 work and associated deferred slices, verified source/spec typecheck coverage,
the full WBS gate and explicit table/field/history inventory. Much of the refactor
is already recorded as done; that is not evidence that the remaining closure
conditions passed. Preserve the user's sequencing: this trial does not start
the adapter or migration. **Owns next increment:** proposed
`libs/wbs-backlog/` codecs, broker, fixtures, tests; exact WBS integration paths
are selected from that landing revision before any implementation.

Use [client planning design](../../../docs/twilight-structure/client-repositories.md)
and [Backlog source findings](../../../docs/twilight-structure/research/backlog-patterns.md).
Pin the upstream release and test native create/edit/archive/restore/ID allocation
and MCP behavior. Resolve conflicting archived-dependency docs through actual
fixtures. Preserve unsupported WBS fields in a versioned extension and prove
native CLI/MCP round trips do not drop them.

**Exit tests:** same repository contract suite on SQLite and Backlog; full canonical
plan equality; real independent readers during interrupted multi-file batch;
two-clone CAS race; reused archived ID cannot acquire earlier evidence; undo
conflict refusal; invalid external edits quarantined; unauthorized direct accepted-ref
push refused. Proposed Git transaction ADR becomes accepted only after this proof.
Test the A31 self-hosted Git remote with separate authenticated broker and ordinary
writer identities; commit authorship or an HTTP field cannot impersonate the
broker. Attempt the bypass from a second clone and observe the remote ref stay
unchanged. Native Backlog CLI/MCP operate on materialized candidate views and
must import through the broker; WBS is the hosted planning UI.

Pin `PlanRef` and source-candidate export publication. Test a predecessor completed
only on an unmerged branch: a dependent candidate from main must remain blocked.
Test incompatible requirements/source basis, two plans in the same repo, stale
exports, and progress-only receipt updates that preserve the approved task definition.
Merge source branches with disjoint change-keyed plan-lock entries and exports;
assert both entries survive and the merged candidate is verified against each pinned
snapshot. Inject a single-value lock/last-writer replacement and watch the missing
entry assertion fail. Competing same-change entries and incompatible dependencies
must require explicit reconciliation. Freeze input receipt R, create candidate C,
then accept C's output receipt; prove C/R remain unchanged and a later candidate can
consume it. Point CI at latest receipts to prove a concurrently accepted receipt
changes the oracle and is detected.

Force two disjoint plans to publish from one ref: assert one accepted command and
one 409, then explicitly resubmit against the new ref and assert both edits survive.
Remove expected-ref checking and observe lost-write or acceptance-count failure.
Run the pinned [storage workload/budgets](../../../docs/twilight-structure/client-repositories.md#storage-workload-acceptance-budget)
through actual broker/native adapter/WBS paths, retaining timing samples and conflict
counts. These are proposed thresholds, not claimed capacity. Inject receiver delay
above the single-edit budget and watch acceptance refuse; a full-field round trip
cannot compensate for an exceeded latency or restart budget.

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
Show WBS connected repo/ref/revision. Edits and progress traverse the broker; emitted
tasks.md carries stable IDs/source revision and is checked for drift. Runtime leases
and credentials remain outside versioned planning files.

**Exit tests:** WBS rich edit/undo/saved-plan/concurrent-user cases, no hidden SQLite
plan reads, export drift refusal, new writes after cutover preserved on rollback,
fresh clone renders the same plan. Deliberately drop one estimate/reference/history
field and watch cutover refuse before switching authority. Restore-backup-only is
not an acceptable rollback once Git accepted new writes.

Generate the source candidate's change-keyed plan lock/exports after immutable
planning commits and input receipt snapshots exist. CI resolves those pinned
inputs, never the latest branch. Output completion receipts are accepted afterward
and appear only in later candidates' input snapshots/exports. Test planning and
receipt updates during source CI and require deterministic results for the pinned
candidate; substantive plan changes require fresh admission. Exercise the merged
two-change candidate through the real WBS/export/CI path, including a shared-key
conflict that cannot silently discard either plan.

**Estimate:** 16–32 human hours after adapter proof; reserve one exclusive cutover
window whose duration is measured in rehearsal, not chosen in advance.

## Task 11: Expand agent roles, lifecycle hooks and automation

- [ ] 11.1 Expand roles/hooks/capacity and cron/webhook automation for OpenSpec-origin plans after M1.
- [ ] 11.2 After Task 10, connect the same automation to accepted WBS/Backlog plan revisions.

**Depends on:** 11.1 depends only on M1; 11.2 alone depends on Task 10 and 11.1.
OpenSpec-origin cron and role/hook expansion must not wait for Backlog cutover.
**Owns next increment:** role
registry, second ACP adapter, policy editor expansion, automation admission and
queue views. Use the [product matrix](../../../docs/twilight-structure/product-experience.md)
as the coverage ledger: each control needs schema/form/API/MCP/runtime/test entries.

Add specialist critics, judges and safety agents with rubric/version/dissent;
scoped hook registrations; provider rate pools and fair queues; cron/webhook
occurrence IDs, timezone/DST policy, overlap and missed-run behavior. Cron invokes
the same admission path as manual work. A required unavailable channel is a failed
operation, not a successful notification. Limit retries and recursion.

M1 retains one active coordinator. Multiple trigger/scheduler producers still
submit to that single admission authority. Active coordinator scale-out is a
separate future change requiring a distributed store/lease decision and real
two-process admission/fencing proofs before its own spec is synchronized.

**Exit tests:** second-provider capability differences visible; mandatory hook
cannot fail open; adversarial source cannot upgrade role authority; signed webhook
replay yields one admitted occurrence; DST/missed/overlap fixtures; duplicate
scheduler instances do not double-start; two clients contend fairly without
sharing context or credentials. Unknown telemetry remains explicit.

**Estimate:** 24–48 human hours; 0.4M–1.0M tokens, recalibrated from M1 observations.

## Task 12: Operate and evaluate the LLM wiki

- [ ] 12.1 Add ingest/answer/reconcile/compact operations with claim provenance and client isolation.

**Depends on:** Tasks 7–8. **Owns next increment:** `libs/twilight-runtime/src/knowledge/`,
knowledge FE/MCP operations and `tool-twilight:verify-knowledge`. Read-only index
navigation from M0 remains sufficient until this increment exists.

Use [knowledge operations](../../../docs/twilight-structure/knowledge.md). Require
source/status/revision records; maintain contradiction dispositions and stale
dependencies. A wiki editor can propose deltas but cannot edit policy or promote
requirements. Compare 20 representative questions against cited answers before
and after compaction; record correctness, source traceability and retrieval effort.

**Exit tests:** missing and unreadable required sources; source changed since
acceptance; conflicting primary claims preserved; broken links; malicious source
instructions remain text; client-B-only document never returned to A; compaction
retains decisive citations and repairs inbound links. Add full-text/QMD/embeddings
only if the measured baseline misses the agreed target; rerun isolation tests on
that backend. Retrieval quality requires judgment, not a parser-only green.

**Estimate:** 16–32 human hours; 0.25M–0.65M tokens plus measured indexing cost if chosen.

## Task 13: Deliver through real development acceptance and controlled release

- [ ] 13.1 Join artifact-identified dev deployment, cloud-browser evidence, production command and recovery.

**Depends on:** M1 and relevant M2/M3 capabilities. **Owns next increment:** deployment
adapter, cloud-browser integration, release command UI/MCP authority and runbooks.
Use existing deploy planners/locks through supported interfaces, not copied shell
scripts. Re-check current runbooks and the inspected code before choosing reuse.
Start with the Browserbase cloud-session integration selected in A32. Pin the
provider/connector and prove the Nx-invoked runner against a real remote session
before acceptance; its docs' Bun/Playwright warning is a compatibility gate, not
a reason to silently run local Chrome instead. Record session ID, served source
identity, bounded credentials, recording/export retention and observed teardown.

**Exit tests:** served revision mismatch blocks browser acceptance; cloud browser
cannot silently reuse another checkout; mandatory browser unavailable blocks the
stage; wrong/stale candidate or environment approval refused; no human decision
means no production effect; health failure triggers observed recovery; unknown
remote state throws; migration rollback failure remains visible with recovery
instructions. Test the complete browser gate when shared UI/CSS changes.

**Estimate:** 24–48 human hours plus external environment availability. One host-wide
release/build lease; production activity only on an explicit candidate-bound command.

## Task 14: Prove the self-growing repo and client upgrade cycle

- [ ] 14.1 Use Twilight to improve its own template and roll the same verified version into a second client fixture.

**Depends on:** Tasks 10–13. **Owns next increment:** template upgrade planner,
compatibility fixtures, self-improvement evaluation and operator recovery route.

The canary is a real `puni-00` change using WBS/Backlog, OpenSpec, wiki, agent review,
capacity admission, dev evidence and release policy. Record no special factory-only
passes. The new template produces a clean client repo and upgrades an older one
with client-specific configuration intact. Propose improvements against fixed
evaluation inputs and independent metrics; retain adverse findings.

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
costs for agent budgets instead of extrapolating today's untested estimates.

## Requirement coverage

| User requirements                                                 | Delivery location                                                     |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| TS-01–04, 19: FE/BE, LangGraph, ACP, MCP and integrations         | Tasks 1, 3, 5–6, 11                                                   |
| TS-05–08, 15–18, 22: discovery/spec/plan, wiki, SDLC trial, focus | M0; Tasks 1–2, 5, 10, 12                                              |
| TS-09, 20: tokens/time/capacity, hooks/approvals/roles            | Tasks 3–4, 7, 11                                                      |
| TS-10, 14: review, evidence, observability/improvement            | Tasks 7–8, 12, 14                                                     |
| TS-11–12: cloud browser, development and explicit production      | Task 13                                                               |
| TS-13, 21: Claire/OpenHands/OpenClaw/Dahl/LangChain research      | M0 source notes; adopted boundaries in design and Tasks 4, 6–7, 11–12 |
| TS-23–25: client Nx repos, Backlog-backed WBS, same self-growth   | Tasks 2, 8–10, 14                                                     |
| TS-26: autonomous assumptions and Claude Fable 5.1 review         | M0 assumption ledger and review/evidence record                       |

All future failure experiments above are planned tests. None is an observed R5
proof until implementation runs the test with its fault and records actual output.
