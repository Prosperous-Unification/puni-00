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

Use a source-bound callback on `Scope.fanoutCapture`, declared beside the existing authority
callbacks in `ports/fanout-capture-store.ts`:
`authorizeImport(actorId: string, access: ResourceAccess): Promise<{ ok: true } | { ok: false; reason: 'forbidden' }>`.
Bind it in SQLite `source.ts::bindLivePlans` to a read-only adapter function over that UoW's
connection, using `organizationMembership` plus `validateStoredRole` and the existing import
write-role predicate. Invoke it inside `ImportTransaction.run` before capture and map refusal
to the existing import outcome. Pass actor/access explicitly into that transaction interface;
never resolve membership on the public store or outside the acquired writer. It records no
audit or grant. A scoped call with a missing callback is a composition error and throws before
capture/write, with a watched omission proof; it must not trust the cached role as fallback.
Explicit `LEGACY_ACCESS` fixtures keep the existing raw import path without requiring an
organization capture or this callback. The memory source's current import conformance is
legacy and has no transactional membership source: do not invent membership from the supplied
role or fabricate shared capture merely to keep a fixture green. A new scoped memory fixture
must supply real staged authority capability or explicitly refuse unsupported scoped admission.

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
metadata or mocking fan-out. Also prove a shared-person tail import changes no pre-existing recipient. Preserve the normal
comparator's event to the newly imported project when its new incoming basis/availability
requires one: with existing higher B and imported lower A, `(A,B)` is legitimate. Do not
filter new recipients or claim this case has zero total events. A separate unused-person or
no-connection import proves total fan-out silence; ordinary import announcements remain.

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

### 6j.c installed lifecycle capability

Expose an internal `BeServices.optimizationLifecycle` capability, separate from the solver
coordinator's `OptimizationRepository`:

```ts
interface OptimizationLifecycle {
  beginDrain(projectId: string, stamp: WriteStamp, contractVersion?: string): Promise<number>;
  finishDrain(projectId: string, contractVersion?: string): Promise<OptimizationDrainFinish>;
}
```

The returned count and finish outcome retain the existing raw contracts. This is a source-backed
internal capability, not a new HTTP endpoint, permission category or human admission API.
`stamp` retains its existing audit-stamp meaning; it does not grant authority. Do not add
otherwise-unused begin/finish methods to `OptimizationRepository`.

`apps/wbs/be-01/src/services.ts::buildServices` constructs the capability after `boundSource`
and `graph` exist, from the same source connection, `boundSource.uow` and
`graph.committedFanout`. Construct it even when `options.optimizer` is absent: cleanup is not
conditional on a running solver coordinator. Keep connection/ownership SQL in the SQLite
adapter or backend repository composition, not core. Add the public interface to the backend
service contract and exercise the actual `buildServices` property in source-backed tests.
Do not accept an arbitrary unrelated connection/UoW pairing; installation must use this
source's writer and the bound capture, with an overlap/borrowed-read witness.

`libs/wbs/adapters/store-sqlite/src/optimization-drain.ts::{beginOptimizationDrain,
finishOptimizationDrain,finishDrainIn}` keep their synchronous raw mutation and fence
semantics. Existing exports remain low-level borrowed operations and fixture tools; they do
not independently promise shared fan-out. No raw helper starts a new public owner, performs
asynchronous capture or delivers events. Their synchronous transactions may nest as savepoints
under the explicit async UoW; never pass an async callback to Drizzle. Document this boundary
on the relevant symbols rather than implying every raw call emits events.

Implement the public begin/finish owner in this sequence:

1. Enter `boundSource.uow` once. Resolve the addressed project on its borrowed writer through
   a narrow source-bound ownership capability beside `FanoutCaptureStore`. Its precise outcome
   distinguishes absent target, explicit pre-activation/legacy, and scoped organization ID.
   An active scoped project missing required ownership is corruption and throws. No cached
   preflight organization, fabricated `ResourceAccess` or human recovery grant is used.
2. Require installed ownership/capture capabilities; missing binding is an error before
   observation or writes. An absent target preserves begin's zero / finish's absent result
   without inventing a cause. Explicit legacy follows its raw mutation path without shared
   capture. Valid scoped isolated ownership follows the existing isolated silent projection.
3. Capture before on the borrowed writer, including the delete-pending target. Invoke exactly
   the raw begin or finish operation on that same connection inside the owner.
4. Capture after. Extend `recordCommittedFanout` narrowly to accept explicit lifecycle causes
   in addition to its local-fact/connection causes. Add the addressed ID only when present in
   either observation. Deduplicate causes and retain the normal comparator's sorted pairs,
   old/new graph traversal and surviving-recipient rule. Do not modify the domain comparator
   to emit on a cause alone, compare only hashes or substitute Fast for selected ready output.
5. Record the comparison-derived envelopes through `scope.stores.eventLog` before commit.
   Capture/event errors roll back raw changes, audit stamps, caches/generations, project and
   cascades, events and sequence advances together; no delivery runs on rollback.
6. After the UoW returns and releases the writer, deliver the committed envelopes through
   `graph.committedFanout`, notifying optimizer recipients before awaiting transport. Return
   the original begin/finish outcome on successful delivery. Delivery rejection is propagated
   after commit; it is not a rollback or permission to replay the mutation. A repeated finish
   after such an error is absent and emits no replacement event; original rows remain replayable.

**Waiting is not deletion.** Begin only marks/cancels/clears under the existing rules. With a
counted child, finish returns waiting and retains the target, ownership, rank and old bridge.
The borrowed observation must still include it. An unchanged waiting/open/absent finish emits
no event or sequence; a begin operation emits only if its actual display/availability changes.
Repeated begin is not required to be a byte-for-byte database no-op: preserve its existing
cancel-epoch behavior, while unchanged projection stays silent. Never remove a pending node
from old topology merely because a list endpoint hides it.

**Selection and availability remain distinct from cache status.** Retiring the selected
contract can remove a ready optimized schedule and expose Fast at the same input hash and
localFacts. Emit only if canonical displayed bookings or `FanoutProjection` availability
actually differ. Pending/failed/corrupt cache badges alone are not an additional availability
vocabulary: if the established display policy returns identical Fast bookings and the same
availability, no event is forced. Engine-unavailable/cycle/calendar-range/undated states retain
the comparator's existing explicit meanings; a missing optimizer never authorizes a Fast
substitute for an unavailable selected engine. Nonselected-contract retirement with unchanged
display stays silent. The addressed cause is needed because cache retirement does not have to
change local scheduling facts; it is not itself evidence of a booking change.

Future release/reconcile composition must reuse these borrowed ownership/comparison mechanisms
without calling the public lifecycle owner from inside another gate/UoW. In particular replace,
rather than nest beneath, the public repository's gate when installing a lifecycle UoW owner.
Reconciliation keeps independent sweep owners; implicit global reclaim keeps its enclosing
reservation/dequeue/Retry owner and complete victim set. Those bindings remain 6j.d/e, not
claims of this direct begin/finish checkpoint.

### Seven required direct-lifecycle proofs

All cases enter `buildServices(...).optimizationLifecycle`. Raw helper tests remain useful
regressions but do not prove this installation.

1. **Installed begin/wait/final topology:** begin with a counted child, then finish and observe
   waiting with project/ownership/rank and captured bridge intact. A separate no-child final
   finish fixture proves exact comparison-derived surviving recipients and the old deleted
   ID as cause; the removed project receives no event. Omit installation, filter delete-pending
   nodes from before-capture, and capture only after deletion independently; watch missing
   capability/bridge/cause assertions fail. Do not call a raw finalizing release and pretend
   the later absent direct finish performed deletion; release is proved separately in 6j.d.
2. **Selected retirement:** seed a selected ready schedule visibly different from Fast,
   retire its contract through the capability, and assert changed bookings plus the expected
   cause at equal input hash/localFacts. A nonselected-contract control and equal-display
   selected retirement are silent. Omit addressed cause, force Fast before-capture and reduce
   comparison to input hash independently; watch the production booking/event assertions fail.
   Preserve existing explicit availability outcomes and test enabled optimized mode with no
   runtime rather than claiming cache-state changes alone prove an availability transition.
3. **Full rollback:** derive at least two real pairs, fail a later event insert and assert full
   pre-owner tables and sequencer equality, including earlier inserted rows and audit stamps,
   plus zero push/optimizer notification. Independently move recording after commit and inject
   after-capture failure; rollback assertions must fail for the broken boundary.
4. **Modeled no-ops:** absent target, open finish, waiting finish and repeated successful finish
   preserve their declared outcomes and emit no extra rows/sequences. Explicit legacy and
   valid isolated operations retain raw behavior without shared events. Inject a cause/event
   on an empty comparison or discard the surviving-recipient filter and watch the named
   silence/deleted-recipient assertions fail. Preserve repeated-begin cancellation semantics.
5. **Trusted ownership and installation:** existing active scoped target missing ownership,
   malformed trusted ownership and missing installed resolver/capture fail before observation
   or mutation; omit each reachable guard independently and watch the negative fail. Conflicting
   mapping rows are physically excluded by the current resource primary key: prove that schema
   boundary rather than invent an unbreakable count guard. Distinguish absent and pre-activation
   outcomes from corruption. Assert no event, notification or delivery after refusal/error.
6. **Writer release before delivery:** hold actual transport after a real committed pair;
   another writer completes while delivery is held, and all required optimizer recipient
   notifications occur before the held network await. Move delivery under the UoW or omit the
   notification binding independently and watch the writer/notification witnesses fail.
7. **Delivery failure retains durable identity:** reject transport after a real final deletion
   or retirement, assert committed domain state and original event envelopes/sequences remain,
   and show the existing event-log replay returns them. Repeat finish and assert no new pair or
   sequence. Reinsert during delivery or drop committed rows on push failure independently and
   watch exact identity/replay assertions fail. Full cold-process/retention matrix remains 6l.

## Implicit global reclaim inside admission transactions

`optimization-admission.ts::reserveSolverSlotIn` calls unscoped
`reclaimExpiredSolverSlotsIn(tx, request.now)` **before** requester eligibility and capacity
checks. This may finalize unrelated projects/contracts in several organizations even when
reservation returns closed, already-present or capacity-full. Existing enclosing paths are
`readPlan → repository.reserveSlot → reserveSolverSlot`,
`pumpQueue → repository.dequeueRequest → optimization-queue.ts::dequeueSolverRequest`, and
`repository.admitRetry → reserveSolverSlotIn`. All are mandatory 6j final-drain owners;
6k defers only their own admission display transition, never their deletion/retirement effects.

Preserve each actual enclosing reservation/dequeue/Retry transaction. Do not move reclaim into
a separate preliminary commit, replace global reclaim with requester-only reclaim, or treat a
non-reserved return as `commit:false` when the existing transaction commits reclaimed state.
Early Retry authorization/eligibility refusal before reservation still performs no global
capture or writes. Retain the existing sole accepted-recovery audit, queue and reservation
atomicity; use the original actor/access and do not create a second admission/audit path.

Inside the acquired owner, before any possible reclaim, discover every potentially reclaimed
project and retain its old ID and organization. A safe bounded initial implementation reads
all existing slot project identities and their ownership on that borrowed writer and captures
each distinct affected organization once. This conservatively covers every cutoff used in the
raw operation: Retry uses `max(now, failure.createdAt + 1)` and dequeue can visit several entries
with `max(now, entry.enqueuedAt)`. Capturing only the requester's organization, the first queue
head or rows expired at the initial clock value is insufficient. Never discover a new victim
organization only after its project/ownership has been deleted. Internal maintenance ownership
does not grant the requesting human visibility of victim projects or add victim IDs to replies.

Expose transaction-local reclamation effects from the raw helper (actual finished contract and
project identities), without a nested owner, push or separately recorded event. Compare once
around the whole enclosing act using those retained old causes and organizations; deduplicate
pairs across multiple internal reservations/finishes. Actual persisted deadlines remain the
only reclaim authority. Capture is conservative; emitting is not: untouched candidates,
future-deadline slots and unchanged display stay silent. Own-request admission display effects
remain 6k unless that project is itself a real finalized drain victim. Existing topology/local
fact causes associated with a victim's removal still pass through the normal comparator.

Record all victim fan-out before the encompassing commit and deliver only afterwards, including
when the outward admission outcome is non-reserved. A later real event insert failure restores
all reclaimed slots, retired caches/generations, deleted projects/mappings, consumed queue rows,
new reservation, accepted recovery audit, earlier inserted events and sequences. It must not
leave either reservation-without-fan-out or reclaim-without-reservation partial commits.

Add production installed cases for initial admission, FIFO dequeue and Retry independently:
requester in X, final-drain victims in Y and Z with surviving lower recipients; at least one
persisted future-deadline slot survives. Cover successful and closed/capacity-blocked decisions,
and a dequeue that skips an earlier invalid/closed entry then uses a later greater enqueuedAt
cutoff. Assert exact old victim causes and no invented requester event. Independently omit each
of the three owner bindings; restrict capture to requester/head/initial-cutoff separately; move
recording outside the transaction; discard fan-out on non-reserved outcome. Each must fail its
named pair, unchanged-state or rollback assertion. Retry unauthorized/stale-input negatives
remain capture/write/audit-free. Repeated reclaim emits nothing once the victim is absent.

### Committed reservation decisions survive transport failure

For reservation/dequeue/Retry owners, the repository must hand the coordinator both the
committed decision/token and the exact recorded fan-out envelopes after writer release,
independently of network delivery. Reuse the existing `storeOutcome` pattern: register
committed delivery as tracked work, report its rejection through the existing explicit error
boundary, and retain the committed admission decision. Invoke required recipient optimizer
notifications before awaiting transport, without holding the writer. A held or rejected push
must not hide a reserved seat, a consumed queue entry or an accepted recovery audit behind an
exception which leaves the coordinator unaware that admission committed.

The coordinator either launches that exact committed reservation under existing bind/terminal
rules or deliberately awaits exact-token unlaunched cleanup if launch is abandoned. It must
not re-run the mutation to recover a delivery failure, allocate another token or claim the
reservation rolled back. `stop`/`drain` track delivery work through its error boundary; replay
retains the original durable rows and sequence. A transactional event-insert error is different:
it rolls the whole act back and supplies no committed reservation to launch.

For each initial admission, dequeue and Retry path, hold then reject actual post-commit fan-out
transport. Prove writer release, availability of the original decision/token, exactly one
launch or explicit completed cleanup, no duplicate reservation/audit, preserved queue semantics
and replayable original event rows. Independently move delivery before decision handoff or make
transport rejection replace the committed outcome; the production lifecycle assertion must
fail. No test may pass merely by waiting for orphan expiry.

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

### Callback-free observation before admission

Replace the public `OptimizationRepository.readPairAndAdmit` callback boundary with:

```ts
observeForAdmission(key: OptimizationCacheKey, now: number): Promise<
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'observed';
      readonly generation: number;
      readonly pair: OptimizationCachedPair;
      readonly requests: readonly SpawnRequest[];
    }
>;
```

`SpawnRequest` is the source-neutral exact key/objective request shape. This method acquires
one source turn and runs one short **synchronous immediate transaction** over its borrowed
SQLite transaction: raw enabled-generation allocation, raw pair read, automatic-objective
selection and projection. An unavailable generation returns `idle`. The observed generation,
immutable pair and request list all belong to this same observation. Use
`objectivesToAutoSpawn` over the raw pair, or the existing raw helper with a callback which
only collects immutable requests; never duplicate its miss-only policy in the coordinator.
No coordinator callback or public gated method is invoked inside this transaction. In
particular do not implement it by awaiting public `allocateGeneration` or `reserveSlot`.
If public allocation remains exposed for another caller, it independently takes the gate;
the observation owner uses the raw transaction-bound helper instead.

This resolves the actual inversion: `readOptimizedPairAndSpawn` reads a pair and calls its
spawner synchronously; it owns no surrounding SQL transaction. At the base, `readPlan` passes
a callback that calls `reserveSlot`, `enqueueRequest`, `recordOutcome` and `releaseSlot` on
that same public repository. Gating those methods while retaining that callback either
recursively waits for the held turn or loses asynchronous completion through its void type.
Do not make the callback async, install a reentrant gate or introduce a general ambient
owned-repository escape hatch.

After observation commits and releases the turn, `readPlan` processes the returned objective
requests in order and awaits each public reservation and, when necessary, enqueue, preflight
outcome and release. Each public persistence operation owns its own turn and existing atomic
store decision. Return the original pre-admission pair even when preflight subsequently
records a marker; obtain liveness through the gated read boundary using that observation's
key/generation. Do not reread the pair and label it with an earlier generation. The initial
observation is coherent, not a promise that later source state cannot change: reservation
must recheck generation/enablement/drain state after waiting, and stale requests must not
launch. All existing token/cancellation/publication fences remain in their final writes.

Do not wrap all of `readPlan` in one new transaction. The narrow allocation/pair observation
commits before reservation; preflight outcome and release retain separate existing commits.
Child launch, queue pumping and transport occur only after the relevant committed decision
returns and releases its owner. Their result/error tracking follows the committed-token
handoff above, rather than pretending all objectives form one atomic admission.

`dequeueSolverRequest` and `admitRetry` still invoke raw `reserveSolverSlotIn` inside their
existing owning transactions. Neither calls the public gated reservation facade. Their
implicit global-reclaim capture/events remain inside those actual enclosing owners in 6j.d;
this callback removal does not split that atomicity or defer it to 6k.

### Public caller propagation

| Source symbol                                                                                    | Required boundary                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `module/optimization/contract.ts::OptimizationRepository`                                        | Replace the callback port with the discriminated observation. Declare public allocation (if retained), reservation, bind, enqueue/dequeue, refresh, release, outcome and reconciliation asynchronous; keep live DB observations gated too. |
| `repository/optimization.ts::createOptimizationRepository`                                       | Use the same source gate for every public persistence operation and raw helpers inside an owned transaction. No public-to-public call while owning a turn.                                                                                 |
| `OptimizationCoordinator.readPlan` / `read`                                                      | Await observation, then loop over immutable requests outside it; await persistence before dependent work and preserve the original pair.                                                                                                   |
| `optimizeAfterEdit`, `pumpQueue`, `retry`                                                        | Await live reads, decisions and unlaunched cleanup. Set cleanup completion only after release settles; no next dequeue/pump before it.                                                                                                     |
| `storeOutcome`, `storeInternalFailure`, `runReserved`, `startReserved`                           | Await storage and PID binding before dependent protocol actions; track outcome delivery separately. Do not hold the writer during spawn/verdict/exit, evaluation or network delivery.                                                      |
| `runSolverChildLifecycle`                                                                        | Await `refreshSlot` before interpreting its outcome. Await release on normal exit and cancellation; kill plus awaited terminal evidence still precedes cancellation release.                                                               |
| `start`, periodic reconciliation, `stop` / `drain`                                               | Track asynchronous reconciliation and delivery, coalesce overlap, await owned work at shutdown and report failures through the existing explicit boundary.                                                                                 |
| `services.ts`, scheduler ports/runtime adapter, shared-people/chain/work-item/saved-plan readers | Propagate awaited live reads without making captured scheduling admit or recursively acquire the source gate.                                                                                                                              |

### Eight required serialization proofs

1. **Coherent observation:** hold a real source UoW at capture, invoke observation and show it
   neither allocates, reads uncommitted cache state nor settles. Roll back/release the owner,
   then prove generation/pair/objectives are committed independently and retain matching
   identity. Bypass its gate and split pair retrieval onto a later generation independently;
   watch the corresponding premature-state/identity assertions fail.
2. **Heartbeat:** seed an actual durable slot and hold the source writer. `refreshSlot` remains
   unresolved and `heartbeat_at` unchanged until release; afterwards the requested update is
   visible. Remove only the heartbeat gate and watch early settlement/state change fail.
3. **Other public operations:** independently hold the same writer against reserve, bind,
   enqueue, dequeue, outcome, release, reconciliation and Retry, plus exposed allocation if
   retained. Prove no early settlement/write and no rollback loss; independently omit each
   mutating family's gate. Include gated live observation, not only mutation counters.
4. **Callback removal and automatic policy:** real cold `readPlan` completes without deadlock,
   requesting each missing objective once; a full hit requests none, one miss requests only
   that objective, and failed/corrupt/plan-infeasible rows never auto-retry. Reintroduce a
   public reservation inside the owned observation, or widen miss-only selection, and watch
   a bounded completion/policy assertion fail. A void callback dropping promises is not GREEN.
5. **Pre-admission snapshot:** after observation, preflight records a failure marker; the
   returned pair remains the earlier snapshot, with its original generation/key. Mutate it
   to reread after admission and watch the existing snapshot assertion fail.
6. **Intervening changes:** hold between observation and reservation, independently supersede
   generation, disable optimization or begin drain, then resume. The reservation refuses and
   launches no stale child. Remove each final admission fence independently and watch the
   respective installed caller negative fail; no new hash or generation may be fabricated.
7. **Awaited dependencies:** hold persistence completion for heartbeat, slot release and
   dequeue; heartbeat interpretation, caller completion and next pump/dequeue must wait.
   Remove each await independently and watch state/completion witnesses fail. Normal exit,
   cancellation and initial/queued/Retry preflight retain exact-token terminal ordering.
8. **Borrowed command scheduling:** execute optimized arrange/freeze through the actual
   command graph, including the isolated fallback, with the public live reader made a
   throwing witness. It converges using captured reads with no admission or nested owner and
   retains existing selected-schedule/refusal behavior. Bind the public live scheduler back
   into that graph and watch the witness fail; do not merely test a direct captured helper.

Every proof is required evidence, not a claim that it has run. Keep exact RED/GREEN/mutation
commands and outcomes in `verify.md`, and preserve existing token/epoch/enablement, multi-input
cache and child lifecycle regressions after caller propagation.

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

| Slice                           | Observable acceptance and R5 fault                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6j.a import                     | Mounted installed import creates actual `(B,A)` with displacement; tail import with no pre-existing recipient but the normal new-recipient pair; unused-person silence; late typed refusal; queued membership demotion before capture; raw borrowed graph. Omit installer/composition binding independently, move authority below capture, wrap raw directory graph, inject after-capture failure and fail the second real event insert. Assert complete rollback and zero delivery, not only status. |
| 6j.b serialization              | Hold a real source UoW at capture, invoke live admission, heartbeat, bind/queue/outcome and release/reconcile independently; none may settle/write within it. Abort the held owner, then prove each intended operation survives in its own committed turn. Independently bypass the gate for each mutating family and observe premature writes/rollback loss. Prove captured scheduling never calls the live port and an asynchronous live read still propagates refusal/ready invariants.            |
| 6j.c direct lifecycle           | Installed owner begin/wait/final finish; old bridge removal preserves old cause and surviving lower recipients; repeated/absent finish silent; retirement of selected ready schedule changes bookings or availability at the same input hash; nonselected contract silent. Omit old capture, addressed cause, or transactional record separately. Event failure rolls back complete state; releasing a held push permits a second writer, and push failure retains replay rows.                       |
| 6j.d release and global reclaim | Exact-token child exit, cancellation after kill+exit, queued-unlaunched cleanup and initial/Retry preflight cleanup all reach the composed release. Omit each binding/await independently: watched completion/next-dequeue/state assertions fail. Retain stale token, generation, cancellation, blue/green and alive-child capacity negatives. Inject event failure at final release and prove slot+project restoration, then successful reconciliation recovery without duplicate pairs.             |
| 6j.e reconciliation             | Real installed startup and periodic callbacks each finish an expired pending deletion; deadline not reached stays waiting. Multiple sweep fixture: first commits, later real event insert fails and rolls back only that sweep; rerun converges without duplicating first events. Omit startup and interval bindings separately; remove deadline, ordering or awaited tracking separately. `stop` must not finish while an owned sweep is held.                                                       |
| 6j.f closure                    | Rerun import, drain, slot, repository/coordinator, spawn handshake, command/directory and 6a–f regression suites. Physical capability remains exactly isolated-only and shared restore refuses before its first write. Space membership removal leaves the project and emits no deletion fan-out. Check durable ordered pairs/envelopes from every owner, then leave full cold replay/retention/authorization matrix to 6l.                                                                           |

The 6j.d row also includes every implicit global-reclaim owner and watched fault in the
preceding section; these are not optional 6k work. Its installed cross-organization and
non-reserved cases must pass before 6j.d closes.

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

New trust-boundary checks require their own owner-path negatives, not only a generic full-suite
claim. For import, inject an invalid membership role through the trusted adapter seam or an explicitly CHECK-bypassing SQLite fixture and prove the
installed import throws before capture or mutation; bypass only the role validation and watch
that assertion fail. Missing membership and a demoted non-writing role retain typed forbidden;
move each admission check below capture or omit it independently and watch capture/write counts.
For each lifecycle ownership resolver (including global reclaim victims), a present scoped
project with missing ownership must throw before observation/mutation; omit its check and watch
that case fail. Test conflicting ownership if the schema permits it; if a physical unique key
makes it impossible, retain a real constraint negative and document the impossibility rather
than claim a fictitious resolver mutation. Malformed persisted ownership/role values must not
become absent, legacy, isolated or a silently skipped victim. Distinguish absent target (existing
no-op), explicit pre-activation/legacy (permitted silent mode), and isolated ownership (valid
silent projection). Prove rollback and zero delivery for corruption, and fail closed when a
required installed capture/ownership capability is missing. Watch every new presence/validation
guard's omission separately; an insertion rejected by schema is schema proof, not proof that an
unreachable application guard works.

## Exclusions and next handoff

First Sol checkpoint is **6j.a only**, including import admission and transactional proofs.
Then independently review 6j.b before changing lifecycle callers, including the three implicit
global-reclaim admission owners. Import completion does not
complete 6j. Do not defer direct finish, release, startup/periodic reconcile, contract retirement
or serialization to a vaguely named later task. 6k still adds transactional fan-out around
optimizer outcome and each admission/Retry operation’s own display change; final-drain effects
inside those operations already belong to 6j. Serialization alone does
not claim those events exist. 6l still closes replay, retention and the full inventory.

No new booking/event table, migration, delete API, organization mode activation, rank import,
new permission category, persistent push retry worker or instantaneous durable notification
for process-local engine loss. Existing authorization and replay subscription filtering remain.
The bounded decisions above require no additional product choice; a conflicting source contract
or failed overlap proof requires a design review, not a fabricated passing result.
