# 6h: command fan-out and committed delivery

Architecture checkpoint, 2026-10-06. Review before implementation. Planning base:
`24025e6545b36bae8f32e18c078b5b755670211c`; required projection dependency:
`6ac0cd4dc8772790c1dafc63c89d10d2a6a8a3db` (6g). This packet changes documentation only;
6h remains unchecked. It refines design.md and the shared-people-mode delta, without replacing
ADR 0034 or claiming that fan-out, activation or release is complete.

## Intent

A successful command can change lower projects' displayed bookings without durably recording
that invalidation with its own writes. Closing the gap requires transaction-borrowed before/after
observations, one comparison around the whole operation, and event rows in the same unit of work.
Deliver those committed rows after writer release while preserving optimizer edit callbacks.
Cover command batches, command preludes, undo/redo and the two existing admitted route writes.
Keep scoped write admission, command history and unrelated announcements intact. Reuse 6g's
projection semantics and the existing event log. No new ledger, queue, permission, activation,
optimizer admission during capture, import/drain/outcome binding or UI work is authorized here.

## Observed production paths

Paths below are relative to the repository root; findings were read at the planning base.

| Path / symbol                                                                                              | Consequence for 6h                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts`, `PlanCommandRunner.execute` | Opens a per-batch collector, admits inside `transaction.run`, applies prelude and commands, records command history, closes Working plan, then sends and announces the tree after return. Capture must precede the prelude and finish after the full batch, not per command. |
| Same file, `PlanCommandRunner.walk`                                                                        | Undo/redo can refuse after partial writes. `afterRollback` discards stale history against surviving stores; `collector.send` also runs after a refused walk. Failed transaction fan-out must be a separate channel, never this collector.                                    |
| `module/plan-commands/composition.ts`, `commandTransaction`, `createAdmittedWrites`                        | Own raw `Scope`; runner and route feature receive mapped capabilities. Retain this boundary rather than passing stores into features.                                                                                                                                        |
| `module/plan-commands/admitted-write.ts`, `admittedWrites`                                                 | Currently wraps `projects.updateWithin` and `steps.removeWithin`, with `NO_ADMISSION`; a false `ok` rolls back. Bind these existing paths in 6h; broader settings routing stays in 6i.                                                                                       |
| `libs/wbs/adapters/store-sqlite/src/source.ts`, `bindLivePlans`                                            | Installs owned public readers and borrowed command readers over `process.db` and OPEN-gated stores. Add capture here; public read snapshots are unsuitable for observing staged command writes.                                                                              |
| `libs/wbs/adapters/store-sqlite/src/sqlite-unit-of-work.ts`                                                | Holds writer turn across explicit `BEGIN IMMEDIATE` / awaited act / COMMIT or ROLLBACK, then releases. Its explicit async lifetime is valid; do not copy it into synchronous Drizzle callbacks.                                                                              |
| `libs/wbs/adapters/store-sqlite/src/event-log.ts`, `recordEvent` / `recordEventIn`                         | `scope.stores.eventLog.recordEvent` already nests under the owning transaction through OPEN gate. Reuse this neutral port; no Drizzle transaction argument belongs in core `EventLogStore`.                                                                                  |
| `libs/wbs/application/core/src/compose.ts` and `apps/wbs/be-01/src/services.ts`                            | Build source, scheduler and optimizer decorator. Bind both transaction capture and committed delivery here.                                                                                                                                                                  |
| `apps/wbs/be-01/src/boot.ts` → `app.ts::mountedEndpoints`                                                  | `writes` transports capabilities; mounted endpoints separately call `createPlanCommandRunner` and `createAdmittedWrites`. Binding only `composeServices.commands` leaves production HTTP unwired.                                                                            |
| `ports/announcement-collector.ts` → `module/realtime/gateway-broadcaster.ts`                               | `send` calls `publish`, which allocates a new row after commit. Keep for unrelated announcements; never feed already recorded fan-out back through it.                                                                                                                       |
| `service/optimizer-trigger-broadcaster.ts` → `module/optimization/optimization.feature.ts::inputChanged`   | Scheduling events start bounded/debounced optimizer work after publication. Raw `pushRecorded` bypasses this policy; `elsewhere_changed` is not yet in its event predicate.                                                                                                  |

## Transaction and capture contract

Composition supplies a required fan-out capability for production shared-mode writes. Keep
source-specific capture behind a source-neutral port, with borrowed acquisition in the SQLite
adapter. Do not make missing production wiring an optional chaining no-op. Legacy/isolated
fixtures may explicitly model no shared capacity; an actual shared organization without its
capture capability throws before mutation. The implementation must keep source-neutral memory
composition and transaction-boundary type tests valid.

1. Enter the UoW and perform existing scope/role/project admission before accessing organization
   scheduling facts. Resolve organization ownership inside this turn; never trust a route's
   preflight ownership list. Preserve `NO_ADMISSION`, grant expiry and Working plan closure.
2. Capture immutable organization facts on the borrowed writer connection before the prelude
   or first mutation. Read mode first: legacy/isolated observations need no rank/organization
   scan. Shared capture uses the existing project-owned scheduling authority only within the
   admitted organization, not a fabricated human principal. This internal capture returns no
   additional facts in the HTTP response and changes no human read/subscription authorization.
3. Run the existing act, including prelude, validation, journal and plan-event writes. If its
   decision is refusal, return it unchanged and discard fan-out staging. After-rollback journal
   repair remains separate; it changes no bookings and produces no shared fan-out.
4. On a commit decision, capture after values from the same transaction, compare once using
   `compareSharedPeopleFanout`, then insert every recipient/cause event through
   `scope.stores.eventLog.recordEvent`. Clock acquisition and recording finish inside this act.
5. Return the original command outcome plus immutable event envelopes through the UoW value.
   They become deliverable only after `run` succeeds and releases its writer turn. If COMMIT,
   derivation or any event insert fails, no delivery or optimizer notification may run.

The adapter capture must provide everything 6g consumes, not merely reuse `readAggregate`'s
human-facing summary. Capture rank, ownership, mode, assignments, local scheduling facts,
selected display outcomes, canonical incoming basis and resource usages under one transaction.
Reuse `readPlanInputIn`, `readChainSnapshotIn`, `readSharedPeople` and the borrowed
`capturedOptimizationReaderOf` where their contracts fit. A process scheduler attached to a
different connection, a public `livePlans.read` or a fresh readonly snapshot is not equivalent.

`FanoutObservation.projects` is **already in authoritative project-rank order**, including the
rank repository's equal-position tie rule and unranked tail. `rankPosition` is metadata; neither
capture nor 6g may reconstruct the order by independently sorting that field. The interface
JSDoc at the required 6g SHA explicitly states this precondition; independent inspection closes
the 6g P3 documentation finding. Keep the same precondition on the new capture port.

Determine direct causes from changed local scheduling facts and old/new shared-person topology,
not from every full chain input hash (which includes propagated changes). Compare resource
usages before and after so an in-batch directory edit includes all directly affected projects,
including directory-only batches with no target project. Numeric rank respacing and labels are
not scheduling facts. A changed incoming basis does not make a transitive recipient a direct
cause. Canonical incoming basis must include the actual inherited booking/availability evidence;
labels, collection order and optimization counters do not belong in it. `null` is reserved for
the API's modeled unavailable/absent evidence, never an unknown capture silently treated empty.

Every schedule read uses `mode: 'capture'` and the transaction-bound optimized cache reader.
Known cycle/calendar-range outcomes retain 6g's explicit states and skip-bookings semantics;
required-engine refusal remains `engine_unavailable`, including when it blocks a downstream
chain. Unknown faults, inconsistent rank/ownership and missing required captured state throw.
Capture must not allocate generations, change cache rows, occupy slots, start timers/children,
or write fan-out. There is no retained last-read hash or dependency on a prior GET.

## Committed-record delivery decision

Use a separate required composition-owned delivery capability alongside `Broadcaster`:
`deliverCommitted(events: readonly CommittedProjectEvent[]): Promise<void>`. Each envelope
contains `projectId`, typed `event: ProjectEvent`, and the `RecordedEvent` returned by the
transactional writer. Construct event and envelope together; subscription, payload, sequence
and timestamp must identify that exact durable row. Extend `ProjectEvent` with
`elsewhere_changed {projectId, causeProjectId}`; the project is the recipient.

Delivery has two stages after successful commit and writer release:

1. Notify the existing optimizer event policy for every envelope, synchronously before any
   transport await. Add `elsewhere_changed` to the scheduling-input predicate and call
   `onPlanChanged` for the **recipient**, not the cause. Existing debounce coalesces repeated
   recipient notifications from distinct causes. This is an edit notification, not a direct
   call to generation allocation or solver launch.
2. In deterministic envelope order, call the gateway's existing
   `pushRecorded(recorded.subscription, recorded, event)`. Do not call `publish`, `recordEvent`
   or another transaction here. Buffer and transport use the original sequence and payload.

Factor the event-reaction policy from `OptimizerTriggerBroadcaster` so its existing `publish`
path and committed delivery call the same predicate/callback. Preserve ordinary publish's
existing rule: invoke the reaction only after its inner durable publication succeeds. The
committed path already possesses durability evidence and therefore notifies before attempting
push. Call this policy in exactly one layer per envelope; do not both decorate `pushRecorded`
and invoke the same reaction in the delivery loop. Keep `Broadcaster`'s existing source-neutral
contract unchanged. No optional delivery method or `instanceof GatewayBroadcaster` fallback.

Drain committed fan-out before unrelated `collector.send` / post-commit tree announcements, so
an unrelated announcement failure cannot suppress the required recipient edit notification.
Retain the existing source-project announcements and their triggers. No downstream event is
inserted by the reaction, replay, buffer or push. Subsequent optimized publication is compared
only at its actual durable display boundary in 6k; it is not recursively forwarded on delivery.

A normal transport failure remains the gateway's existing reported, replayable outcome: the
write succeeds, the durable event remains, and scheduling was already notified. Invariant
violations or unexpected callback errors throw with committed state intact; do not turn them
into transaction rollback/refusal or catch-and-ignore them. This packet introduces no automatic
command retry or durable optimizer-notification queue. A crash after commit can lose a local
optimizer callback; a later live read/edit uses existing admission recovery. Only event replay,
not guaranteed background optimization after process loss, is promised here.

This resolves the practical alternatives without a new storage ADR: `publish` after commit
loses atomicity; `publish` inside the act permits premature push and triggers; bare
`pushRecorded` loses scheduling duties. A separate committed delivery capability retains the
current event log and existing decorator policy without changing ordinary publishers.

## RED tests and R5 fault proofs

These are required implementation proofs, **not observed results from this documentation
checkpoint**. Observe each listed negative failing, restore the production path and rerun.
Record exact commands/assertions in verify.md and adjacent `Proof:` comments at each check.

| Required test / path                                                                    | Fault injection and decisive witness                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command and downstream events commit together`, real SQLite execute/undo/redo          | Make the second downstream insert fail after a first insert; compare domain, journal, plan-event, event-log and sequencer rows with before. Move fan-out recording after UoW return: witness persisted mutation/history despite failure.                                    |
| `late refusal emits nothing`, execute prelude/batch and partial undo                    | Refuse late after staged edits, then inspect recipients' durable rows, sequences, push witness and optimizer notification witness. Move push/notification before commit: witness escape despite rollback. Preserve permitted stale-journal repair and its unrelated notice. |
| `cold command fan-out needs no previous read`, mounted app                              | Compose fresh services, issue only a real authorized command on an already seeded shared chain, then inspect durable recipient events. Remove core and mounted/boot bindings separately: each must fail a production-path assertion.                                        |
| `one batch coalesces each cause pair`, command and directory-only command               | Repeated changes to A plus an in-batch directory change to B yield distinct sorted `(C,A)` and `(C,B)` once each; transient changes restored by the batch produce no net fan-out. Compare per command or use the collector's type-only dedup: observe wrong count/pairs.    |
| `capture does not admit optimization`, real enabled optimized fixture                   | At capture boundaries compare generations/cache/slots and timer/child witnesses. Substitute live scheduler or detached snapshot independently: observe admission or stale before/after display. Post-commit debounce is allowed only after the capture witnesses.           |
| `committed delivery retains the optimizer trigger`, mounted command and direct delivery | Hold transport pending; prove recipient notification and second writer can proceed after commit. Remove the committed reaction or `elsewhere_changed` predicate separately: notification/new-input scheduling assertion fails. Cause gets only its ordinary trigger.        |
| `pushRecorded preserves sequence`, real log plus delivery                               | Compare inserted subscription/sequence/payload with buffered/pushed record. Replace push with publish: event count/sequence advances unexpectedly. Rejecting transport still retains rows and notification.                                                                 |
| `admitted routes commit fan-out`, mounted step removal/project depReach                 | Omit each existing admitted binding independently; assert expected recipient row absent. A modeled route refusal changes neither rows nor sequence.                                                                                                                         |
| `capture retains authoritative rank`, borrowed SQLite capture                           | Seed equal rank positions and unranked tail so insertion order differs; scramble/sort by metadata in capture: observe wrong recipient direction. Broken ownership/rank/required capture throws rather than skipping.                                                        |

Retain existing core `compose.test.ts`, `admitted-write.test.ts`, transaction-boundary types,
optimizer-trigger and gateway tests; SQLite UoW/event-log/plan-commands tests; mounted
`command-organization.controller.db.test.ts`, shared-plan and step-allowance regressions.
New capabilities need positive and negative fixture coverage, not a default silent stub that
lets production omission pass. Test missing and unreadable capture dependencies separately
where the implementation distinguishes them. Test names above describe required witnesses;
choose files near their owning boundary rather than introducing a second harness.

## Exact Sol handoff

1. Work from the reviewed 6g commit above plus this architecture packet; reconcile documentation
   only if cherry-picking the packet. Do not change another agent's worktree. Confirm packet
   review acceptance before product implementation; leave 6i–6l unchecked.
2. Add RED source-neutral contract and real SQLite capture tests. Introduce transaction-borrowed
   organization observation, preserving authoritative rank and local-cause versus incoming-basis
   separation. Keep scheduler reads capture-only and retain source-neutral fixture support.
3. Add the command/undo/redo atomicity RED tests. Map capture/record through command composition
   and return committed envelopes without exposing `Scope` to the feature; integrate once around
   the whole act and exclude refusal/repair. Add admitted-write RED tests and integrate its two
   existing routes under the same decision boundary.
4. Add delivery, trigger and mounted RED tests. Wire the required capability through
   `compose.ts`, `services.ts`, `boot.ts::writes`, `app.ts::mountedEndpoints` and relevant module
   checks/fixtures. Add typed event, reuse optimizer reaction policy, then deliver committed rows
   before unrelated announcements. Do not widen legacy `Broadcaster` or leak adapter types.
5. Watch every fault above independently fail on the actual path, restore it, rerun relevant
   suites and document exact RED/restored GREEN output. New invariant checks need their own
   breakable negatives. Review modified callers and module/source-neutral contract tests.
6. Record targeted test/format/lint/typecheck results and every unavailable/skipped check in
   verify.md. Request independent review of 6h before 6i. Full exact-SHA canonical h2puni gate
   and CI remain required before any integration/release claim; no push or merge is authorized
   by this handoff.

6i owns standalone rank/directory and wider settings transactions; working-plan directory edits
inside commands are 6h's responsibility. 6j owns import and final deletion/retirement and must
settle synchronous projection ownership. 6k owns optimized selected-display writes and their
fences. 6l closes cold replay, retention, subscription authority and the complete mutation
inventory. Keep `capacityModes` exactly `['isolated']` and shared restores refused throughout.
No new domain term is introduced: Booking change cause, Project rank, Elsewhere and Unavailable
schedule input retain their definitions in CONTEXT.md.
