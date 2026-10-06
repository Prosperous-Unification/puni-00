# 6j: import and final drain ownership

This packet is normative with `design.md`, at merged main
`d1d7399ee71a1d3efa9829352ab75f03f1ee237d` (PR #275). It completes the planned 6j
scope; 6k optimized publication and 6l release closure still follow. It authorizes
no activation, publication, deployment or new delete route.

## Intent and dependencies

Record the consequences of an import, final project deletion and contract retirement in
the transaction which actually changes the displayed bookings or availability. Preserve
old causal identity across deletion, all drain/token/deadline fences, and each existing
transaction's rollback boundary. Use 6g projection and the 6h/6i borrowed capture and
committed delivery. Do not replace durable rows with notifications or treat cache insertion
at an old input address as a displayed-booking change.

The code dependencies through 6i are present in this main revision. Its 6i checkboxes and
last review-status note have not yet been reconciled with that merge; this amendment does
not change them. Every 6j subtask below remains unimplemented and unproved at this checkpoint.

## Source and binding inventory

Paths below are relative to the repository. Read their callers and existing tests before edits.

| Surface                                                                                                                                                     | Existing owner and required change                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/wbs/application/core/src/module/plan-import/{composition.ts,imported-plan.resource.ts,plan-import.feature.ts,check.ts,module.ts}`                     | `ImportTransaction.run` already owns one async UoW. Carry invocation actor/access into that boundary, authorize before capture, observe once around the complete successful import, record before commit and deliver afterwards. |
| `libs/wbs/application/core/src/testing/import-service-source-contract.ts`, `apps/wbs/be-01/src/controller/import-export-organization.controller.db.test.ts` | Source-conformance and installed HTTP import proofs; preserve imported IDs/settings, histories, label failure rollback and existing ordinary announcements.                                                                      |
| `libs/wbs/adapters/store-sqlite/src/{source.ts,fanout-capture.ts,sqlite-unit-of-work.ts,optimization-drain.ts}`                                             | Source-bound borrowed capture plus raw synchronous drain primitives. Add explicit public lifecycle owners over the same source turn; no async Drizzle callback.                                                                  |
| `optimization-drain.ts::{beginOptimizationDrain,finishOptimizationDrain,releaseSolverSlot,reclaimExpiredSolverSlotsIn,reconcileOptimizationDrains}`         | Direct begin/finish, exact-token release, and reconciliation sweeps all need the owner contract. `finishDrainIn` stays the single raw final-delete/retire decision; capture must surround its actual enclosing mutation.         |
| `apps/wbs/be-01/src/{services.ts,repository/optimization.ts}`                                                                                               | Install composed lifecycle operations in the real optimizer graph, using the bound source and `graph.committedFanout`. Raw repository construction must not remain the production release/reconcile path.                        |
| `apps/wbs/be-01/src/module/optimization/{contract.ts,optimization.feature.ts,solver-child-lifecycle.ts}`                                                    | Propagate asynchronous persistence through child termination/cancellation, initial and Retry preflight, unlaunched queue cleanup, startup/periodic reconciliation and shutdown tracking.                                         |
| `libs/wbs/application/core/src/service/{committed-fanout.ts,shared-people-fanout.ts}`                                                                       | Preserve local-fact/topology causes; allow explicitly addressed lifecycle causes through the same projection comparison, because retirement can change display without changing local facts.                                     |

No ordinary HTTP project-delete route calls begin/finish at this base. Do not invent one.
Expose the composed lifecycle capability to source-backed callers/tests and install its
release/reconcile methods in the existing production graph. Raw OPEN primitives remain useful
inside owners and fixture setup; they do not independently promise fan-out.

## Import owner

Preparation remains outside the write transaction. On entering `ImportTransaction.run`, use
the original immutable actor and `ResourceAccess`, re-read scoped membership on the borrowed
writer, validate its stored role and apply the existing organization import/write policy.
A removed membership or newly non-writing role returns the existing typed forbidden import
outcome before directory enumeration, shared capture or writes. Do not infer authority from
an imported project's future owner, perform project recovery admission, or add an audit/grant.
Legacy/pre-activation remains its explicit existing path; corrupt trusted membership throws.

Capture the addressed organization before the first directory/project write. Invoke the
existing complete import with raw OPEN `batchServices`; never install 6i standalone directory
facades in this graph. On `commit:false`, roll back without after-capture, fan-out or delivery.
On success capture after all directory/project/steps/items/history/labels are complete and
record through `scope.stores.eventLog` before commit. Deliver the exact committed envelopes
after writer release and before draining the ordinary `AnnouncementCollector`. Preserve the
collector's existing ordinary events and the successful import response.

Do not manufacture a downstream event merely because import succeeded. Existing same-name
people/teams are reused without overwriting their metadata. A normal newly appended unranked
project may have no lower recipient. The positive production fixture must first demonstrate a
real lower recipient: control the existing clock/ID fixture so imported A and existing unranked
B share a creation timestamp and A sorts before B by ID; both are dated and assigned the same
existing person. Assert actual `orderIn`, displayed displacement and `(B,A)` before injecting
faults. This exercises the existing creation-time/ID tie rule without importing rank, changing
metadata or mocking fan-out. Also prove the ordinary tail/unused-person import is silent.

An event insert failure after at least one real pair has been inserted must restore the full
pre-import directory/project/history/ownership/optimizer/event/sequencer state. A typed late
import refusal and a capture failure receive the same rollback boundary. No push or optimizer
edit callback escapes rollback; delivery failure after commit leaves the import and rows
committed and replayable, and must not retry the import itself.

## Lifecycle transaction boundaries

Use the established async `sqliteUnitOfWork` over raw OPEN drain operations, whose synchronous
Drizzle transactions become savepoints. Resolve the addressed project's organization and
capture it inside the owner before mutation, including delete-pending projects. At this base
`ProjectRankRepository.orderIn` and `ProjectRepository.findInOrganization` still include those
rows: preserve this old topology until the final deletion. A missing target is the existing
absent/no-op outcome; an existing scoped row with missing/conflicting ownership is corruption,
not legacy or successful silence. Internal lifecycle calls derive ownership from trusted
state, not a fabricated human access scope; they add no grants or human read permission.

- **Begin:** surround marker/cancel-epoch/queue changes with one comparison. Emit only an actual
  display/availability consequence. Do not delete early, cancel a child outside existing
  policy, or use a begin event as a substitute for final deletion.
- **Direct finish:** surround the existing finish operation; open/waiting/absent retains its
  outcome. Successful deletion preserves the old project ID as cause and only surviving
  recipients. Contract finish compares selected display after removing that contract's cache
  and generation; an unrelated contract or unchanged selected display is silent.
- **Release:** one owner surrounds exact-token slot deletion, contract finish, then project
  finish. Compare only the complete transaction, never intermediate retirement and deletion
  separately. Event/capture failure restores the slot, caches/generation, project, ownership,
  event rows and sequences together.
- **Reconcile:** preserve existing per-sweep transactions, generations before projects, and
  the admitted persisted deadline predicate. Enumerating candidates is not authority: each
  sweep re-resolves the target/marker and captures inside its own acquired turn, then calls
  the raw reclaim/finish primitive. Do not wrap the whole pass in a new all-or-nothing UoW.
  A later failed sweep leaves earlier committed sweeps intact; its counts/delivery must not
  claim the failed sweep. A stale candidate already finished elsewhere is an explicit no-op.

For a successful owner, compare before/after and record each deterministic recipient/cause
pair once in the same transaction. Supply the addressed project as an additional direct cause
only when present in either capture, alongside existing local-fact/connection causes. The
normal projection comparator still decides whether anything changed and who survives. Never
force an event for an unchanged hash, a retirement, or a release alone. In particular cache
retirement can remove a selected ready schedule while the input hash and localFacts are
unchanged; relying on localFacts alone misses that change. Preserve independent availability
comparison, old/new graph traversal and selected-versus-Fast semantics.

After commit/release, `CommittedFanoutDelivery` invokes optimizer edit notifications before
awaiting transport and sends the exact recorded envelopes. A transport error cannot undo the
committed sweep or justify allocating another sequence. Process death before push is recovered
through the existing durable event replay; no persistent push worker is added. An event error
rolls back, propagates and leaves durable drain state recoverable by a later release/reconcile.

## Required async serialization seam

An outer async owner is unsafe unless other optimizer writes wait for the same source turn.
At this base `createOptimizationRepository` gates Retry only: allocation, pair admission,
reserve/bind/heartbeat, enqueue/dequeue and outcome storage are synchronous raw DB operations.
They can otherwise run during awaited borrowed capture on the same connection and accidentally
join its transaction. Merely making release/reconcile return promises is insufficient.

Choose explicit asynchronous public persistence boundaries over the existing source gate.
Keep raw synchronous adapter operations for an already-owned transaction; do not recursively
enter the gate. The public repository's live DB observations must also avoid seeing another
owner's uncommitted rows. No holder may await a child spawn/verdict/exit, timer, transport,
another public gated method or a scheduler's live admission. Captured scheduling remains
non-admitting and uses the borrowed transaction directly.

Propagate promises through the coordinator's public live-read/admission flow and persistence
callers, rather than silently queueing a write while returning an accepted/pending decision
which has not committed. This requires a narrow internal scheduler-port adjustment:
`OptimizedScheduleAdapter.readLive` can await the source turn; `readCaptured` and Fast stay
non-admitting. `runtime-portable/src/scheduler.ts` and `Scheduler.read` must represent/await
that asynchronous live result explicitly, with awaited consumers in `shared-people.ts`,
`chain-snapshot.ts`, `work-item.resource.ts` and `saved-plans.feature.ts`. Preserve HTTP shapes,
selection policy and computation results; this is not permission to await optimizer solving.
Use precise live/captured types or a declared promise-capable read result, never unchecked
casts or an implicit promise in a synchronous `ScheduleRead`. Import preparation only needs
`Scheduler.supports` and remains synchronous. Audit command-owned scheduling too: notably
`WorkItemResource.arrangeBySchedule` has a fallback marked `mode: live` while called inside a
command owner. Borrowed command/import graphs must bind the transaction-captured scheduler
for these reads, never await the public live gate from inside their own UoW. Prove optimized
arrange/freeze through the actual command graph converges without admission or deadlock and
retains its existing selected-schedule/refusal semantics. Do not solve this with a global
reentrancy flag or by handing unrelated callers OPEN stores.

Audit every live mutation in `repository/optimization.ts` and every caller, not only release:
`readPlan`/`read`, `optimizeAfterEdit`, `pumpQueue`, `retry`, `storeOutcome`,
`storeInternalFailure`, `runReserved` and `startReserved`. Revalidate existing
current-generation/token/cancel/enablement fences after any newly introduced wait. Keep the
original atomic store decisions intact; do not split their SQL to fit the facade.

Both release sites in `runSolverChildLifecycle` must await persistence after terminal evidence
(or kill plus awaited exit). Queue `releaseUnlaunched` must settle before the next dequeue;
initial and Retry preflight cleanup must settle before pumping. Startup and periodic reconcile
become tracked asynchronous work with bounded/coalesced overlap; `stop`/`drain` await it. Failures
reach the existing explicit error boundary and do not count as completed release or authorize
new capacity. Never release a still-running child or hold the source turn waiting for that child.

Implement and review this seam as 6j.b before lifecycle binding. The overlap regression is a
hard acceptance gate, not an optional follow-up in 6k. If its port propagation needs a different
transaction model, pause for a bounded amendment; do not fall back to detached snapshots,
async Drizzle callbacks, timing assumptions or suppressing optimizer work as success.

## Ordered TDD and watched faults

Each row starts with a named production-path RED, then implementation and GREEN. Remove the
specific binding/check independently, watch the named assertion fail, restore it and add the
adjacent `Proof:` comment. A fault which still passes is an incomplete proof.

| Slice                 | Observable acceptance and R5 fault                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6j.a import           | Mounted installed import creates actual `(B,A)` with displacement; silent tail import; late typed refusal; queued membership demotion before capture; raw borrowed graph. Omit installer/composition binding independently, move authority below capture, wrap raw directory graph, inject after-capture failure and fail the second real event insert. Assert complete rollback and zero delivery, not only status.                                                                       |
| 6j.b serialization    | Hold a real source UoW at capture, invoke live admission, heartbeat, bind/queue/outcome and release/reconcile independently; none may settle/write within it. Abort the held owner, then prove each intended operation survives in its own committed turn. Independently bypass the gate for each mutating family and observe premature writes/rollback loss. Prove captured scheduling never calls the live port and an asynchronous live read still propagates refusal/ready invariants. |
| 6j.c direct lifecycle | Installed owner begin/wait/final finish; old bridge removal preserves old cause and surviving lower recipients; repeated/absent finish silent; retirement of selected ready schedule changes bookings or availability at the same input hash; nonselected contract silent. Omit old capture, addressed cause, or transactional record separately. Event failure rolls back complete state; releasing a held push permits a second writer, and push failure retains replay rows.            |
| 6j.d release          | Exact-token child exit, cancellation after kill+exit, queued-unlaunched cleanup and initial/Retry preflight cleanup all reach the composed release. Omit each binding/await independently: watched completion/next-dequeue/state assertions fail. Retain stale token, generation, cancellation, blue/green and alive-child capacity negatives. Inject event failure at final release and prove slot+project restoration, then successful reconciliation recovery without duplicate pairs.  |
| 6j.e reconciliation   | Real installed startup and periodic callbacks each finish an expired pending deletion; deadline not reached stays waiting. Multiple sweep fixture: first commits, later real event insert fails and rolls back only that sweep; rerun converges without duplicating first events. Omit startup and interval bindings separately; remove deadline, ordering or awaited tracking separately. `stop` must not finish while an owned sweep is held.                                            |
| 6j.f closure          | Rerun import, drain, slot, repository/coordinator, spawn handshake, command/directory and 6a–f regression suites. Physical capability remains exactly isolated-only and shared restore refuses before its first write. Space membership removal leaves the project and emits no deletion fan-out. Check durable ordered pairs/envelopes from every owner, then leave full cold replay/retention/authorization matrix to 6l.                                                                |

Use actual SQLite transactions/events and mounted composition, not mocked expected fan-out.
Relevant existing suites include `optimization-drain.db.test.ts`,
`repository/optimization.db.test.ts`, `optimization-coordinator.db.test.ts`,
`optimization-coordinator.model.db.test.ts`, `solver-child-lifecycle.db.test.ts`,
`optimization-spawn-handshake.proc.db.test.ts`, `optimization-events.db.test.ts`, import source
conformance, import module and mounted import/export organization tests. Extend the actual
caller suites for async propagation; a direct raw drain test does not prove installation.

Run affected Bun/Nx tests, lint/typecheck/build, format/diff and pinned strict/all OpenSpec per
checkpoint. Report skips and infrastructure failures truthfully. Full host gate waits for an
approved published candidate and must use `bin/h2puni-gate.sh <sha>` under its canonical lock.
No mutation logs or green results exist for this new packet yet.

## Exclusions and next handoff

First Sol checkpoint is **6j.a only**, including import admission and transactional proofs.
Then independently review 6j.b before changing lifecycle callers. Import completion does not
complete 6j. Do not defer direct finish, release, startup/periodic reconcile, contract retirement
or serialization to a vaguely named later task. 6k still adds transactional fan-out around
optimizer outcome and display-changing admission/Retry writes; 6j serialization alone does
not claim those events exist. 6l still closes replay, retention and the full inventory.

No new booking/event table, migration, delete API, organization mode activation, rank import,
new permission category, persistent push retry worker or instantaneous durable notification
for process-local engine loss. Existing authorization and replay subscription filtering remain.
The bounded decisions above require no additional product choice; a conflicting source contract
or failed overlap proof requires a design review, not a fabricated passing result.
