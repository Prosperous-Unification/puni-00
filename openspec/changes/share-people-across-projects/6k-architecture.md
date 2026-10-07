# 6k: Optimized display atomicity

## Context

Normative implementation checkpoint for task 6k, revalidated against merged main
`ae7c1ff110731277e776ea3de45cd980614b2d67` (PR #282). The [design](design.md),
[delta specification](specs/shared-people-mode/spec.md) and [6j ownership packet](6j-architecture.md)
remain authoritative. This packet specifies work; it records no implemented behavior or runtime
acceptance. [tasks.md](tasks.md) carries the ordered slices and [verify.md](verify.md) their evidence.

## Goals / Non-Goals

Commit each optimizer operation's actual displayed-booking or modeled-availability change,
existing outcome event and downstream events atomically. Preserve immutable cache addresses,
admitted-result validation, generation/token/cancellation/enablement fences, coherent admission
observations, blue/green cache dimensions and the original admission/queue/retirement policies.

Do not implement 6l cold replay/retention/authorization closure, UI work, mode routes, trusted
activation, schema changes, a booking ledger, a persistent transport worker or process-local
engine health monitoring. The user's deferred trusted activation remains deferred. Booking,
Engine, Objective, Input hash, Generation and Contract version retain their existing meanings
in `CONTEXT.md`; this design introduces no new domain term or hard-to-reverse decision.

## Operation inventory

Backend `repository/` and `service/` paths below are under `apps/wbs/be-01/src/`;
`optimization.feature.ts` is under its `module/optimization/`. Store filenames are under
`libs/wbs/adapters/store-sqlite/src/`. Enumerate production callers again when applying the
packet; a direct repository test does not prove the installed service binding.

| Operation and source                                                                                                                                                                                                     | Current transaction and projection consequence                                                                                 | Required boundary                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/wbs/be-01/src/module/optimization/optimization.feature.ts::storeOutcome` → `repository/optimization.ts::recordOutcome` → `libs/wbs/adapters/store-sqlite/src/optimized-outcome.ts::storeOptimizedOutcomeAndRecord` | Synchronous outcome/event transaction; current coordinator pushes its one recorded outcome event                               | Source UoW owns borrowed before/after capture, the existing synchronous savepoint and all event rows; coordinator owns postcommit delivery |
| `optimization.feature.ts::readPlan` → `repository/optimization.ts::observeForAdmission`                                                                                                                                  | One immediate observation allocates/reuses generation and returns its original pair plus immutable requests                    | Surround that observation with comparison while retaining its original pair/request identity                                               |
| `optimization-generation.ts::allocateGenerationIn`                                                                                                                                                                       | A changed generation marks older slots cancelled and deletes older cache/queue rows                                            | Cache removal can change selected display without an outcome insertion; include it in the observation owner                                |
| `optimized-schedule-cache.ts::storeOptimizedOutcomeIn` and `enforceLiveBudgetBound`                                                                                                                                      | Inserts an outcome, replaces an older failed/corrupt marker under an admitted Retry, and enforces the budget bound             | Compare the complete mutation, including eviction; do not compare insertion alone                                                          |
| `service/optimization-initial-reservation.ts`, repository `enqueueRequest`, `service/optimization-retry-reservation.ts`                                                                                                  | Initial reservation and subsequent enqueue are separate commits; eligible Retry owns reservation/queue/recovery audit together | Retain those boundaries and 6j global-reclaim comparisons; prove own-display effects or silence                                            |
| `service/optimization-dequeue-reservation.ts`                                                                                                                                                                            | One commit owns the entire FIFO loop, including invalid-entry consumption and global reclaim                                   | Retain whole-loop ownership and its original cutoff; compare any own-display effects once with existing victim effects                     |
| `service/optimization-lifecycle.ts`, `service/optimization-reconciliation.ts`                                                                                                                                            | 6j already compares direct begin/finish/release and per-target reconciliation, including selected retirement                   | Reuse and regress these owners; no second event for an intermediate retirement                                                             |
| Repository `allocateGeneration`, raw store wrappers                                                                                                                                                                      | No production invocation of the public allocation method at this base; direct wrappers support store/repository tests          | Preserve compatibility; do not claim a wrapper test covers live `observeForAdmission`                                                      |

Slot bind/heartbeat alone change process bookkeeping, not the selected schedule. Ordinary
reserve/enqueue/dequeue and failed-marker Retry change optimization status but currently keep
Fast displayed until a selected ready outcome exists. Prove that silence rather than forcing
events. If an operation has a real projection-changing case, include its addressed project in
the existing owner comparison. For a FIFO operation that changes queued projects outside the
old slot-owner set, resolve and capture those organizations inside the same source turn before
the loop; do not use the returned head alone as the inventory. No such extension is justified
solely by a pending/retrying label.

## Transaction and projection ownership

Install an outcome owner in `apps/wbs/be-01/src/services.ts`, using the same `source.db`,
`boundSource.uow` and `graph.committedFanout` as the 6j owners. Its ordered operation is:

1. Acquire the source gate and `BEGIN IMMEDIATE` through `boundSource.uow`.
2. Resolve trusted project ownership through the borrowed `scope.fanoutCapture`. Preserve
   absent/legacy behavior; malformed active ownership or a missing required capability throws.
3. For a scoped owner, capture its organization before storage on that borrowed connection.
4. Call the existing synchronous outcome/event primitive on the borrowed connection. Its
   Drizzle callback remains synchronous and its transaction nests as a savepoint. Preserve
   outcome validation and the event-envelope check inside the transaction.
5. Capture after the whole storage/replacement/eviction operation. Use `recordCommittedFanout`
   with `scope.stores.eventLog`, adding the addressed project as a direct cause if present in
   either capture. Existing local-fact/connection causes remain; transitive recipients are not
   invented as direct causes. The comparator decides whether an event is necessary.
6. Commit the outcome/cache changes, existing outcome event, downstream rows and all sequence
   advances together. Return the committed decision and recorded envelopes after writer release.

An isolated organization yields no shared fan-out; a legacy operation retains its existing
outcome event without shared capture. A superseded or already-recorded outcome cannot itself
create an event. Unexpected capture/derivation/event errors abort the complete owner. Neither
capture may open a detached snapshot or call the live scheduler. No network call, solver
launch, public gated repository method or recursive source UoW belongs inside the owner.

Use the established async `sqliteUnitOfWork` lifetime around synchronous raw operations. Do
not make Drizzle transaction callbacks async. A small borrowed synchronous repository helper
may retain outcome adaptation/envelope validation for both direct and installed paths; do not
duplicate fences or weaken the direct repository's atomic outcome/event behavior.

Follow the merged service-kind policy when adding outcome or observation owners. New backend
service files without a kind suffix must be classified in `docs/code-organization/kinds.json`,
as the five installed 6j owners are. Keep their feature classification and run
`tools/tool-devsync/src/service-kinds.test.ts` with each slice that adds an owner file.

`readFanoutObservationIn` → `readChainSnapshotIn` → `readChain` uses the captured scheduler and
its installed Contract version/budget configuration. It derives current shared input from the
persisted graph. Do not select capture by the outcome's stored H1 address, fabricate a caller
access scope, or replace existing multi-input behavior with a latest-input-only write fence.
An H1 publication can remain eligible while current captured input is H2; test eligibility
without advancing/cancelling its admitted generation as an accidental alternative refusal.

`displaySchedule` selects a ready Optimized result for the persisted Engine/Objective; otherwise
Fast remains displayed. Fan-out availability stays `available`, `undated`, `engine_unavailable`,
`cycle` or `calendar_range`. Idle/pending/retrying/failed/corrupt labels are not additional
availability kinds. Compare bookings and availability independently of Input hash and retain
old/new graph traversal, deterministic recipient/cause ordering and surviving recipients.

### Outcome handoff

Change the outcome port to `Promise<CommittedDecision<RecordedOptimizationOutcome>>`, reusing
the 6j wrapper. Its decision preserves `stored`, `superseded` and `already-recorded`; the stored
arm retains its typed existing event/envelope. The wrapper's envelopes are downstream records,
not a second copy of the existing outcome event. The direct repository returns an empty
downstream list while preserving its existing outcome/event write.

The coordinator assembles the stored outcome envelope and downstream envelopes into one
tracked `deliverCommitted` call, exactly once, after commit. The existing delivery composition
notifies applicable recipients before awaiting transport and pushes recorded rows without new
sequences. Outcome events do not trigger optimization-input reactions. Preserve the original
outcome event first and deterministic downstream pair order. A held outcome push must not
prevent recipient edit notifications from running.

Use the established tracking/error boundary: synchronous delivery throws and rejected promises
are reported through `onChildError` without replacing the committed decision. `storeOutcome`
finishes its durable work without waiting for transport; terminal/preflight callers can then
perform their existing awaited exact-slot release. Stop/drain still waits for tracked delivery.
Do not move outcome storage and release into one transaction or allow a transport failure to
retry the durable write. A shutdown tracking test must terminate the child and release its slot
before holding only transport, so child lifetime cannot mask omitted delivery tracking.

### Admission observation

Factor the existing observation union into a precise internal type and return it through
`CommittedDecision` from `observeForAdmission`. The source-bound observation owner captures
before, runs the original allocation/pair/request collection synchronously, captures after and
records any actual display change before commit. The direct adapter returns empty downstream
envelopes. The coordinator registers delivery before consuming idle/observed outcomes.

Keep the observation callback-free. Return the original pair/requests even if a later reservation
or preflight write changes cache state. Do not split generation and pair reads into different
source turns, rerun live admission during capture, or merge initial observation, reservations
and enqueue into a new large transaction. Retry's authority/hash/outcome/live refusal order and
zero-capture refusals remain unchanged; its accepted audit/queue/reservation stay together.

## Ordered implementation and proof matrix

Implement 6k.a–e in [tasks.md](tasks.md), each with a failing production-path test before its
behavior change, watched fault/restoration evidence and independent exact-SHA review. The rows
below are proof obligations, **not observed results**.

| ID  | Installed/store witness                                                                                                                                             | Independent production fault and required failure                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Current selected outcome changes A's displayed bookings and records its outcome plus B/C fan-out                                                                    | Remove installed outcome binding, then separately omit transactional fan-out recording; required durable recipient rows disappear                                                                               |
| K2  | Eligible H1 stores at H1 while current H2 stays displayed; nonselected objective stores silently                                                                    | Fan out on every successful insertion; each silence assertion detects extra rows/pushes                                                                                                                         |
| K3  | Selected ready result, failed/corrupt Retry replacement and selected cache eviction                                                                                 | Substitute Fast in projection, then independently omit addressed cause; expected displacement event disappears despite equal local facts                                                                        |
| K4  | Mounted empty-booking available→calendar_range transition with unchanged canonical/admission Input hash H; separately, equal captured hashes in the pure comparator | Unconditionally suppress availability comparison in the mounted path; required event disappears. Separately retain the existing conditional equal-captured-hash mutation against the pure comparator regression |
| K5  | Capture sees staged outcome/cache eviction and competing writer waits for owner                                                                                     | Open a detached capture connection; staged-write projection/event assertion fails. Bypass owner source serialization separately where changed                                                                   |
| K6  | Second recipient event insertion throws after a first event; full state restores                                                                                    | Split `COMMIT`/`BEGIN` after mutation before event recording; full cache/generation/slot/queue/audit/event/sequencer snapshot assertion fails                                                                   |
| K7  | After-capture derivation throws after mutation; no push escapes                                                                                                     | Break that dependency at the borrowed post-write capture; state restores. An unexpected throw is not modeled unavailability                                                                                     |
| K8  | Already-recorded and superseded attempts remain silent; isolated/legacy writes retain only their existing outcome semantics                                         | Bypass the relevant no-op/event predicate; corresponding event/sequence/push absence assertion fails                                                                                                            |
| K9  | Held/rejected delivery retains durable decision, releases writer and permits exact-slot cleanup                                                                     | Await transport before decision handoff; cleanup/completion assertion fails. Rethrow delivery rejection separately; accepted decision or shutdown assertion fails                                               |
| K10 | Only transport remains held after child/slot completion; stop remains pending and errors are reported                                                               | Omit tracking, then independently omit error reporting; stop settles early or error sink stays empty                                                                                                            |
| K11 | Generation-driven cache removal changes selected display, with original observation pair/requests preserved                                                         | Remove observation installer/recording, then separately omit its addressed cause; event assertion fails. Retain split-generation/pair and post-preflight reread faults                                          |
| K12 | Initial/queue/Retry status-only transitions are silent; selected retirement changes display, unrelated retirement is silent                                         | Force fan-out for an admission/status/retirement alone; real unchanged-projection assertions fail. Any newly added display comparison also needs its own omission fault                                         |
| K13 | Outcome and downstream envelopes are delivered once at original sequences; recipient reactions precede held transport                                               | Drop downstream handoff or call `publish` instead of `pushRecorded`; push/sequence assertions fail. Omit recipient reaction independently                                                                       |

Build the mounted K4 fixture before accepting the implementation: use actual captured schedules
and an empty-booking `available` → `calendar_range` transition, with the result passing
admitted-result validation and shared-person topology retained. Its canonical/admission Input
hash H stays unchanged. The nullable `FanoutProject.inputHash` is a different observation:
`readFanoutObservationIn` records H for a scheduled chain and null for `calendar_range`, so the
mounted capture changes H → null. The mounted fault must **unconditionally suppress availability
comparison**; its required downstream event must disappear while bookings remain empty. A fault
conditional on equal captured hashes does not exercise this witness and cannot count as its RED.

Retain `shared-people-fanout.test.ts::equal hashes retain availability transitions with no bookings`
as a separate pure comparator regression: its two captured hashes are equal, and conditionally
suppressing availability comparison on equal captured hashes must fail that test. Record the two
faults and their different test layers separately; neither substitutes for the other.

A possible mounted construction changes the selected schedule's calendar fit with no positive
assigned bookings. If no valid admitted fixture can realize that construction, stop for design
review and choose another genuine modeled transition; do not invent availability states, bypass
validation, or claim the pure comparator test is the mounted owner proof. Process-local engine
disappearance has no new durable transition owner here.

K6 must reach the full-state assertion, not fail earlier on an unrelated SQLite error. For
Retry/queue changes include queue and recovery audit in the snapshot. Preserve earlier
independent commits; do not compare against a snapshot predating those commits. Faults masked
by startup reconciliation, a live child, syntax failures or unrelated setup errors are
disqualified. Every new/changed safety dependency needs its adjacent `Proof:` comment naming
the watched fault/test. An unchanged dependency may cite an existing observed proof only when
its actual production path still applies; no unbreakable redundant check earns acceptance.

## Acceptance and risks

The primary installed witnesses belong in `apps/wbs/be-01/src/services.db.test.ts`; retain raw
outcome/event coverage in `libs/wbs/adapters/store-sqlite/src/optimized-outcome.db.test.ts` and
repository/coordinator handoff/observation coverage in their existing test files. Rerun cache,
generation, admission, queue, captured-reader, cancellation, child, restart and selected-retirement
suites affected by each slice, plus pure shared projection and committed-delivery regressions.
Use actual composed owners and real event/sequencer rows; a stub returning invented envelopes
proves only the consumer and must be labeled accordingly.

Accept 6k only when the six parent-task tests, operation inventory and K1–K13 are reconciled
with exact commands, pass/assertion counts, fault/restoration logs and independent review in
`verify.md`. Record skipped/unavailable checks explicitly. Run declared affected Nx lint,
typecheck and build targets, scoped formatting, pinned strict/all OpenSpec and normal hooks.
Canonical exact-SHA host gate and CI remain separate integration requirements; local suites
do not replace them. 6l, UI, mode route and deferred activation stay open.

The main risks are missing generation/cache-eviction writes, confusing UI status with scheduling
availability, selecting the write's old hash as current display, and recursively acquiring the
source gate. Whole-organization borrowed derivation is the accepted correctness boundary;
this task adds no authority and does not optimize capture scope before the proofs exist.
