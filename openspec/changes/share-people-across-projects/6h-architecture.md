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
| `module/plan-commands/admitted-write.ts`, `admittedWrites`                                                 | Wraps project updates and the bare/legacy step-removal path with `NO_ADMISSION`; a false `ok` rolls back. Mounted scoped step removal uses the recovery boundary below. Broader settings routing stays in 6i.                                                                |
| `libs/wbs/application/core/src/http/step.routes.ts::write` → `http/recovery-write.ts::runRecoveryWrite`    | Scoped step removal bypasses `createAdmittedWrites`: the existing UoW freshly admits, records any recovery audit and grants its batch. Bind capture/record inside this same granted transaction; preserve restricted super-admin removal.                                    |
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

### Command grant lifetime ends before committed delivery

`PlanCommandRunner.execute` and `walk` own the grants supplied to their command graphs.
Their current outer `transaction.run(...).finally(() => grant?.expire())` relies on that
transaction abstraction settling at the UoW boundary. If command composition awaits network
delivery before returning, the finally runs too late: a retained graph still has authority
while another writer can already enter. Writer release alone is not grant expiry.

For execute, undo and redo, expire the command grant no later than successful UoW settlement,
**before** recipient optimizer notifications or any awaited committed delivery. Expiring it
when the transaction act finishes using its command graph is also valid: fan-out comparison
and recording need the admitted transaction's capture capability, not a live command grant.
Preserve Working plan closure. Do not move delivery inside the UoW to shorten grant lifetime.

Keep refusal and exception cleanup unconditional, including failures while opening the graph,
performing the prelude, applying commands, walking history, deriving fan-out or recording an
event. A late refused undo's existing after-rollback journal repair retains its separate
`NO_ADMISSION` graph; do not carry the failed command's grant into that repair or change the
stale-entry discard/audit rules. No success, refusal, thrown error or failed commit may leave
the granted actor/project usable after its UoW. Scoped step recovery already expires its grant
inside `runRecoveryWrite`'s act; retain that independent boundary.

Choose either cleanup inside the command act's own `finally`, or an explicit transaction
result/delivery split that lets the runner close its grant before delivery. Do not rely on
an outer finally that runs only after a held transport completes. Update the grant/transaction
symbol JSDoc with this lifetime and preserve the source-neutral transaction capability boundary.

### Admitted route seam: fresh observation authority without a second audit

The numbered admission step above has different owners for commands and admitted route
services. `ProjectService.updateWithin` first classifies the supplied access, but
`ProjectRepository.write` later rechecks current membership inside its write transaction.
`StepService.removeWithin` performs its own project/step gate. This subsection covers the
bare `createAdmittedWrites` graph, which uses `NO_ADMISSION`; mounted scoped step removal
has the separate, already audited boundary below. A service hook after those
initial checks alone does not prove current authority before organization capture. Do not
pre-call `admitEditInOrganization`: it can insert a super-admin recovery audit, duplicating the
project store's existing recovery record and changing step-removal permissions.

Use a required composition-owned callback for the mapped admitted route graph. Recommended
source-neutral contract (names may shorten while preserving this shape):

```ts
type BeforeAdmittedWrite = (ask: {
  readonly kind: 'project-update' | 'step-remove';
  readonly projectId: string;
  readonly actorId: string;
  readonly access: ResourceAccess;
}) => Promise<
  { readonly ok: true } | { readonly ok: false; readonly reason: 'not_found' | 'forbidden' }
>;
```

This is a trusted capability supplied by composition, never an HTTP field or caller-provided
callback. Bind it only to the admitted graph; unrelated direct service callers retain their
existing contract. Production `createAdmittedWrites` must require the capability, with a
negative for omission rather than an optional chaining no-op. A modeled isolated/legacy
implementation remains explicit and does not scan shared organization facts.

`ProjectService.updateWithin` awaits the hook after its existing edit classification and
optimizer/depReach preflight refusals, immediately before `projects.update` or
`editInOrganization`. `StepService.removeWithin` awaits it after its project/step gate,
dependency/cycle and usage refusals, immediately before `steps.remove`. Propagate the hook's
typed refusal unchanged; do not wrap it as a capture error or proceed to the write. Existing
outer UoW `ok` handling decides rollback/commit as before.

The callback first performs a **read-only fresh authority check on the borrowed UoW
connection**: resolve current ownership, actor identity and current membership/role, preserving
foreign/absent `not_found` equivalence and the exact operation's restriction/recovery policy.
Project updates may authorize existing super-admin recovery; bare step removal must not
acquire a recovery grant. This restriction does not remove the existing grant from mounted
scoped recovery. This check records no audit, issues no grant, writes
no state and does not call the auditing admission method. Reuse/extract the existing pure
classification rules rather than inventing a parallel permission policy. Only after success
may the callback observe mode and capture old shared fan-out facts, once for the UoW.

Keep `ProjectRepository.write`'s final guard and existing recovery audit completely intact.
The new check authorizes observation; it does not replace or cache authorization for mutation.
Because the outer UoW holds `BEGIN IMMEDIATE`, the check/capture/write share the protected
observation; do not open a fresh connection. Never await capture inside the repository's
synchronous Drizzle transaction callback. A later modeled write refusal discards the captured
before-state; a capture exception rolls back. Only a successful act captures after and records
events. Successful UoW return is still required before delivery or optimizer notification.

### Mounted scoped step removal: retain the recovery transaction

`app.ts` passes the mapped admitted step service into `stepRoutes`, but the scoped branch of
`stepRoutes.write` deliberately invokes `runRecoveryWrite` and passes **its own**
`services.steps` to the operation. Only the legacy branch calls the mapped bare service.
`runRecoveryWrite` currently admits inside its UoW through `admitEditInOrganization`, returns
its typed refusal, grants the admitted actor/project, builds the granted batch and expires the
grant in `finally`. A successful restricted-project removal by a super-admin already commits
one recovery audit (`step-marker-organization.controller.db.test.ts`, `audits each super-admin
step and marker recovery while keeping the creator`). Preserve that behavior.

Bind a required, source-neutral fan-out capability at this **existing** recovery boundary for
scoped step removal. Composition maps the existing `Scope` and granted batch into observation,
recording and committed delivery; do not expose raw stores to the step service. Bind both
production boot/app composition and the recovery-route test fixtures. Merely supplying a
capability to `createAdmittedWrites` cannot cover this branch. Installation must distinguish
this operation from other recovery callers; do not silently activate new marker/add/rename
bindings or count them as covered by this slice.

The transaction sequence is:

1. Keep `runRecoveryWrite`'s existing fresh `admitEditInOrganization`, typed `not_found` /
   `forbidden` return, recovery audit and grant. A refused admission invokes no capture or step
   mutation. Do not replace this established auditing admission with the bare path's read-only
   check; do not call it a second time.
2. Build the batch over the same borrowed `Scope`, held-event collector and existing grant,
   adding the step-removal observation hook. `StepService.removeWithin` awaits the hook after
   its existing project/step gate and dependency/cycle/usage refusals, before `steps.remove`.
   The callback relies on the fresh admission and still-live grant owned by this same UoW;
   it performs no new admission, issues no second grant and inserts no audit. It captures old
   shared facts once on that transaction's connection. The existing `BEGIN IMMEDIATE` turn
   keeps the admitted membership/project state stable through capture and mutation.
3. If the operation refuses, roll back the staged audit and any mutation; discard the old
   observation. A capture exception also rolls back the audit. Preserve grant expiry on every
   outcome. If the operation succeeds, capture after and record downstream rows/sequences
   through the same scope before returning the commit decision. Event failure rolls back
   step/domain changes and the existing audit together.
4. Return committed envelopes with the original typed outcome. Only after UoW success and
   writer release, run committed delivery, then the existing held announcements. Preserve
   their source-project optimizer trigger. Nothing is pushed or notified from the open UoW.

Never call `createAdmittedWrites` or start another UoW from the granted recovery operation:
that would re-enter the writer gate and discard its grant semantics. Never route scoped step
removal through a `NO_ADMISSION` graph. The bare path's hook still performs its own fresh
read-only authority check; it receives no recovery grant. These are separate bindings with
separate omission proofs, sharing projection and committed-delivery semantics.

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

Topology causes are already required by design.md's changed-endpoint rule. When deriving
`directCauses`, union changed local facts with both endpoints of changed rank-directed
shared-person connections from the old and new observations. Comparing local input hashes
alone cannot detect an unchanged upstream endpoint that loses a connection. Keep these edge
sets separate for comparison; 6g still traverses each observation separately and filters
unchanged incoming bases. This is not permission to promote transitive schedule changes into
direct causes or to traverse a graph formed by mixing old and new edges.

For example, dated A uses Ana, B uses Ana then Ben, and C uses Ben. Removing B's Ana
assignment removes A→B while A's local facts stay unchanged. A and B are direct causes; where
B and C's incoming bases change, `(B,A)`, `(C,A)` and `(C,B)` are required. The fact that B
also receives an ordinary source-project announcement does not replace its specified causal
fan-out event. An undated endpoint or numerically respaced but unchanged rank order does not
invent a scheduling connection.

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

Additional command-lifetime and topology proofs are mandatory:

- `command grant expires before held delivery`: retain the real `EditAdmission` handed to
  `batchServices`, commit a shared command producing fan-out, and hold committed transport.
  Prove a second SQLite connection can write and the retained admission already refuses its
  original actor/project before releasing transport. Repeat for successful undo and redo
  through `walk`, not just execute. Moving expiry back to the outer transaction promise's
  finally must make each relevant retained-admission assertion fail while the writer enters.
- `refused command and replay leave no grant`: retain the grant across late command refusal,
  refused partial undo/redo and an exception; assert it refuses after settlement. Retain the
  existing stale-journal repair witness, which runs with `NO_ADMISSION` and creates no fan-out.
  No pending transport is needed for a path that rolls back without delivery.
- `removed connection retains the unchanged endpoint cause`: use the A/Ana → B/Ana+Ben → C/Ben
  fixture above, remove B's Ana assignment in a real command and inspect durable pairs.
  Independently omit changed-edge endpoint causes while keeping local-fact causes: `(B,A)`
  and `(C,A)` disappear even though `(C,B)` remains. Restore and rerun; keep rename/respacing
  and mixed-edge negatives green.

Additional admitted-route proofs are mandatory:

- `refused admitted writes never capture`: forbidden, foreign/absent and a member demoted or
  removed after request access resolution but before UoW entry all return their typed refusal;
  capture, event and optimizer witnesses stay zero. Remove the fresh read-only authority check
  or move capture before it independently: the denied request now reaches capture (plant a
  throwing capture dependency to prove refusal precedence, not merely response shape).
- `recovery observes once and audits once`: a permitted super-admin project recovery captures
  old state and commits exactly one existing audit. Replace the read-only check with
  `admitEditInOrganization`: the extra audit makes this test RED. A bare `NO_ADMISSION` step removal
  from a restricted project by a non-creator retains its forbidden outcome and receives no new grant/audit. Mounted scoped
  recovery instead retains its successful audited removal, as specified below.
- `admitted observation precedes mutation`: inspect the old project settings/step while the
  hook runs and the final recipient event after success. Move the hook after the write: old
  state or expected event assertion fails. Omit project and step hooks/bindings independently.
- `admitted capture and event failures roll back`: inject capture failure and later event
  insertion failure separately; compare domain, recovery audit, journal where applicable,
  event log and sequence state. The push and optimizer witnesses remain empty.

Additional scoped-recovery proofs are separate from the bare admitted-route proofs:

- `scoped removal retains recovery and fan-out`: invoke the mounted shared-organization DELETE
  as a non-creator super-admin; expect success, exactly one existing step-removal audit, one
  UoW entry, and expected downstream rows. Omit the recovery-specific binding: rows disappear.
  Substitute the bare `NO_ADMISSION` service: the established successful recovery is refused.
  Add a second auditing admission: audit count becomes two. Retain actor/project/expiry tests
  for the original grant; the observation callback must not grant authority itself.
- `scoped refusal never captures`: revoke/demote after request access resolution before the
  recovery turn, or address a foreign/absent project. Existing admission returns the typed
  refusal with zero capture, audit, downstream rows or optimizer witnesses. Bypass that fresh
  admission or capture before it independently; a throwing capture seam proves precedence.
- `scoped observation precedes removal`: inspect the old step/settings inside its granted hook;
  move the hook after removal or omit it independently and observe missing old evidence/events.
  Repeat the late-hook/omission proof through the bare admitted service with a permitted
  shared-mode creator; a scoped recovery test cannot prove that separate binding.
- `scoped capture and event failures roll back recovery`: fail capture, then separately a later
  downstream insert after one event was inserted. Step/domain, audit, event-log and sequencer
  state equal their before values, grant is expired, and push/optimizer witnesses are empty.
  Repeat both faults through permitted bare shared-mode removal (which must create no
  recovery audit).
- `scoped delivery releases the writer`: hold downstream transport pending after successful
  mounted recovery; a second writer enters and the recipient edit notification has run. Move
  delivery before UoW return to observe premature push/notification or blocked writer. Retain
  the equivalent bare shared-mode test; do not implement a nested UoW to obtain after-commit
  delivery. Legacy mounted removal must retain its successful creator behavior, with zero
  organization-capture, fan-out or recipient-trigger calls; plant throwing shared dependencies
  to prove they are unused. A legacy no-fan-out result alone cannot prove shared hook binding.

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
   the whole act and exclude refusal/repair. Expire execute/undo/redo grants before committed
   delivery and prove retained admission refuses while transport is held. Derive topology
   endpoint causes as well as local-fact changes. Add admitted-write RED tests and integrate its two
   existing routes under the same decision boundary. Implement the admitted-route hook and
   read-only observation-authority check above for the bare graph. Separately integrate mounted
   scoped step removal within `runRecoveryWrite`, preserving its original grant/audit and
   transaction; add its dedicated omission, late-hook, rollback and writer-release proofs.
4. Add delivery, trigger and mounted RED tests. Wire the required capability through
   `compose.ts`, `services.ts`, `boot.ts::writes`, `app.ts::mountedEndpoints`,
   `http/step.routes.ts` / `http/recovery-write.ts` and relevant module
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
