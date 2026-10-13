## ADDED Requirements

### Requirement: The mode is per organization, isolated by default

`organization.shared_people` SHALL be non-null and constrained to integer 0/1, defaulting to
`0` (`isolated`). Adapter reads SHALL decode only 0 and 1, and SHALL throw for missing or malformed trusted state. Under `isolated`, nothing in
this change SHALL move a date. Pre-activation (legacy) access SHALL read `isolated`.

#### Scenario: an isolated organization

- **GIVEN** an isolated organization where Ana is booked in two ranked projects
- **WHEN** the lower project is read
- **THEN** its dates are those it had before this change, and the load view reports the overlap

### Requirement: Rollback refuses to lose a shared organization

`down.sql` SHALL refuse while any organization is shared or any rank row exists, naming
`shared-people-rollback-cli.ts save|remove|restore`. `STORED_VOCABULARIES` SHALL gain
`capacityModes`, and the swap SHALL refuse an image lacking it while an organization is shared.

#### Scenario: a pre-feature image

- **GIVEN** a shared organization
- **WHEN** a swap targets an image whose vocabularies lack `capacityModes`
- **THEN** the swap refuses before moving traffic

### Requirement: Booking changes fan out down the rank

For each committed shared-mode change, the process SHALL derive before/after displayed
bookings and scheduling availability in the originating write transaction. Outgoing bookings
SHALL use absolute fractional intervals and person/project/work-item/step identity, excluding
labels, rank numbers and process counters. Available-empty, undated and modeled unavailable
states SHALL remain distinct. Equal input or bookings hashes alone SHALL NOT suppress an
availability transition. Unexpected derivation failures SHALL abort; modeled unavailability
SHALL remain explicit, never an empty successful schedule.

For every directly affected cause whose outgoing bookings or availability change, recipients
SHALL include all surviving lower projects reachable in either the old or the new rank-directed
shared-person graph. For a topology-only change, recipients SHALL include reachable projects
whose effective incoming basis or availability changes. Each graph SHALL be traversed
separately before unioning recipients; paths assembled from mixed old/new edges are invalid.
The cause itself and foreign-organization projects SHALL NOT be recipients of that cause.

The event SHALL be `elsewhere_changed {projectId, causeProjectId: string | null}` (null only for an organization mode switch) under the recipient's
project subscription. A commit SHALL record at most one event per recipient/cause pair,
ordered lexicographically by recipient id then cause id. Multiple direct causes MAY produce
multiple events for one recipient. Causes SHALL include every project whose local scheduling
facts or topology are directly affected, including directory-resource users without project-row
edits, and SHALL exclude merely transitive recipients. A removed cause SHALL retain its
pre-deletion id. A rename with unchanged bookings, availability and incoming basis SHALL emit
no downstream event. Isolated and legacy operations SHALL emit no shared-capacity event.

#### Scenario: a rename

- **WHEN** a work item in a ranked project is renamed without changing scheduling facts
- **THEN** no project below it receives `elsewhere_changed`

#### Scenario: a removed bridge

- **GIVEN** A reaches C through B in the old graph
- **WHEN** a committed assignment removal disconnects that path and changes C's incoming basis
- **THEN** C receives the relevant cause event even though the path is absent after the write

#### Scenario: mixed edges invent a path

- **GIVEN** old and new graphs each lack a path from A to D but their mixed edges would create one
- **WHEN** recipients are calculated
- **THEN** D is not included on account of that invented path

#### Scenario: availability changes without an input-hash change

- **GIVEN** a transaction changes a required project's modeled scheduling availability
- **WHEN** its input hash or outgoing empty-bookings hash remains unchanged
- **THEN** its affected lower projects still receive events

#### Scenario: a directory edit has several causes

- **GIVEN** a directory resource is used by A and B and both directly change scheduling facts
- **WHEN** one transaction changes that resource and both causes affect C
- **THEN** exactly the applicable `(C,A)` and `(C,B)` events are recorded in deterministic order
- **AND** neither a project-row edit nor a fabricated single winning cause is required

### Requirement: Fan-out commits with its originating mutation

The originating transaction SHALL include projection comparison, event sequencing and all
fan-out event rows. This applies to command batches, undo/redo, admitted settings and step
writes, rank changes, standalone directory edits, import, optimizer display transitions and
actual project deletion. Refusal, derivation failure or event-recording failure SHALL roll back
all mutation and fan-out writes. Transport SHALL begin only after commit and writer release.
Final project deletion SHALL capture old reachability in its final deletion transaction,
including deletion completed by slot release or reconciliation; a delete-request hook alone
SHALL NOT substitute for it. A retirement or cache/generation change that alters current
display SHALL receive the same comparison even without a new optimizer outcome.

#### Scenario: event insertion fails

- **WHEN** recording a downstream event fails during an otherwise valid command or import
- **THEN** the mutation, all downstream rows and their sequence advances roll back
- **AND** no downstream push has occurred

#### Scenario: deletion waits for a child

- **GIVEN** deletion is pending while a solver slot exists
- **WHEN** slot release or reconciliation completes the actual deletion
- **THEN** surviving old-closure recipients are recorded atomically with that deletion

### Requirement: Import and drain owners preserve authority and transaction boundaries

An import SHALL recheck the acting user's current organization write authority inside its
owning transaction before observing shared state or writing. Refusal SHALL preserve the
existing typed import outcome and perform no shared capture, fan-out or mutation. Successful
import SHALL compare its complete before/after state once; a silent comparison SHALL not
fabricate events. Borrowed import stores SHALL not acquire independent standalone owners.

Final drain operations SHALL record fan-out in their actual transaction, including direct
finish, exact-token slot release, startup reconciliation and periodic reconciliation.
Reconciliation SHALL retain per-sweep commits, generation-before-project order and persisted
slot deadlines. Async capture SHALL not allow unrelated optimizer writes to join or observe
its uncommitted transaction. Callers SHALL await committed persistence before reporting its
completion or pumping newly available capacity, and shutdown SHALL await owned sweeps.

#### Scenario: an import loses authority while queued

- **GIVEN** an admitted import waits for the writer and its actor loses organization write authority
- **WHEN** it acquires the turn
- **THEN** it returns typed forbidden before shared capture, writes, events or optimizer notification

#### Scenario: import actually precedes an existing project

- **GIVEN** dated imported A precedes existing B under the real unranked creation-time/ID order and both name the same person
- **WHEN** the complete import changes B's incoming bookings
- **THEN** its applicable `(B,A)` event commits atomically with the import
- **AND** an unrelated import with no shared-person connection emits no fan-out
- **AND** a last-ranked shared-person import emits no event to pre-existing projects, while retaining the normal event to the new recipient for its new incoming basis

#### Scenario: contract retirement changes display at unchanged input

- **GIVEN** retirement removes A's selected ready schedule while its input hash and local scheduling facts stay equal
- **WHEN** the resulting displayed bookings or availability changes
- **THEN** the owning transaction compares A as a direct cause and records the applicable surviving recipients
- **AND** unchanged or nonselected display produces no fan-out

#### Scenario: a later reconciliation sweep fails

- **GIVEN** one sweep has committed and a later sweep fails recording a real downstream event
- **WHEN** the pass fails
- **THEN** the earlier commit remains and the failing sweep restores its slot, cache, generation, project and event state
- **AND** a subsequent pass converges without duplicating previously committed pairs

#### Scenario: reservation finalizes drains in other organizations

- **GIVEN** a requester belongs to X and expired slots belong to pending drains in Y and Z
- **WHEN** initial admission, dequeue or Retry globally reclaims them inside its reservation transaction
- **THEN** all applicable surviving recipients retain the old victim cause IDs and commit with that transaction
- **AND** this holds even if the reservation result is closed or capacity-blocked
- **AND** event failure restores reclaimed state, reservation, queue, recovery audit and event sequences together

#### Scenario: a later dequeue entry advances the reclaim cutoff

- **GIVEN** dequeue skips an earlier invalid or closed entry and a later entry has a greater admitted timestamp
- **WHEN** its reservation reclaims another pending drain at that persisted cutoff
- **THEN** that victim's organization and old cause were captured before deletion and its fan-out commits once
- **AND** slots whose persisted deadline remains in the future are not reclaimed

#### Scenario: transport fails after a reservation with final-drain events

- **GIVEN** initial admission, dequeue or Retry committed a new reservation and victim fan-out
- **WHEN** post-commit transport stalls or rejects
- **THEN** the coordinator retains the exact committed decision and token and launches it once or explicitly completes unlaunched cleanup
- **AND** delivery failure is tracked and reported separately, original event rows remain replayable and the admission is not retried

#### Scenario: trusted ownership or membership is corrupt

- **GIVEN** an installed import has malformed stored membership or a present scoped lifecycle victim lacks required ownership
- **WHEN** the owning operation resolves authority and organization before capture
- **THEN** it throws without observing shared state, mutating state or delivering events
- **AND** explicit legacy/isolated operation and an absent target retain their distinct modeled outcomes

#### Scenario: another optimizer operation arrives during capture

- **GIVEN** a source owner is paused inside borrowed capture
- **WHEN** another live optimizer persistence operation arrives
- **THEN** it waits outside that transaction and cannot read uncommitted rows or lose its writes with the owner's rollback
- **AND** captured scheduling remains non-admitting and holds no child or transport wait

### Requirement: Direct lifecycle composition preserves final-drain semantics

An internal source-backed lifecycle capability SHALL own direct begin and finish transactions
and remain installed without a running optimizer. Raw synchronous drain primitives SHALL
retain their synchronous ownership, fencing and outcome contracts while completing populated
project deletion as specified below; they SHALL NOT independently
start asynchronous capture or delivery. The owning capability SHALL resolve trusted ownership
and capture the delete-pending target before mutation, compare after, and record applicable
pairs before committing. An explicit addressed cause SHALL NOT by itself force an event.

#### Scenario: a counted child keeps the old bridge alive

- **GIVEN** a dated shared-person bridge project has a counted solver child and deletion is pending
- **WHEN** direct finish runs
- **THEN** it returns waiting and retains the project, ownership, rank and captured bridge
- **AND** unchanged displayed bookings and availability produce no event or sequence advance

#### Scenario: selected retirement has unchanged displayed bookings

- **GIVEN** the selected ready schedule has the same canonical bookings and availability as the display after retirement
- **WHEN** direct contract finish removes its cache and generation
- **THEN** no downstream event is forced by retirement, cache status or the addressed cause alone

#### Scenario: direct lifecycle transport rejects after commit

- **GIVEN** final deletion or retirement committed real downstream event rows
- **WHEN** post-release transport rejects
- **THEN** the error propagates while the mutation and original event identities remain committed and replayable
- **AND** repeated finish produces no replacement event or sequence advance

### Requirement: Final project deletion removes only its owned populated state

After observing the durable project-deletion marker and zero affected solver slots in its
enclosing transaction, the shared raw finalizer SHALL explicitly remove the project's owned
contents and physical root with foreign-key enforcement enabled. It SHALL retain the existing
absent, open, waiting and finished outcomes. It SHALL NOT treat ordinary populated contents
as a new refusal or waiting state. Cleanup SHALL follow the migrated foreign-key graph and
SHALL NOT introduce blanket schema cascades, disable constraints or delete through separately
committed child operations. Begin and waiting finish SHALL retain the complete populated
project; contract retirement SHALL retain its contents and other contract versions.

Owned contents include work items, steps, estimates, actuals, progress, measures, assignments,
dependencies, work-item directory joins, access rows, capacities, priority bands, calendar
markers, project history, saved plans/bodies, optimization state and ownership/placement links.
Existing cascades SHALL remove only these owned rows. Shared directory entities and their
ownership, organizations, accounts, spaces, organization audit and all unrelated project state
SHALL remain unchanged. Durable event-log rows and sequencers SHALL remain available for
replay independently of project-owned history deletion.

Schema-representable inconsistent cross-project relationships touching the deletion set SHALL
be rejected before cleanup when their referential actions could remove or rewrite another
project's state. Incoming and outgoing relationships SHALL be checked; corruption SHALL NOT
enlarge the deletion set. Any cleanup, after-capture or event-recording failure SHALL roll back
all cleanup and cascades with the complete enclosing finalization operation. Direct finish,
release, reclaim and reconciliation SHALL use the same raw cleanup contract inside their
respective fan-out owners; a direct-owner checkpoint alone SHALL NOT establish complete
final-deletion integration for the other callers.

#### Scenario: populated project finishes without erasing shared or neighboring state

- **GIVEN** a marked project with nested work items, estimates, typed step dependencies, history and placement has no solver slots, alongside populated neighbors and shared directory entities
- **WHEN** installed direct finish completes
- **THEN** it returns finished with no project-owned residue or foreign-key violation
- **AND** shared entities, neighbors, audit and durable replay identities are unchanged
- **AND** surviving old-closure recipients receive only the comparison-derived events with the old project cause

#### Scenario: populated project waits or retires one contract

- **GIVEN** a populated project has either a counted child during deletion or a single contract marked for retirement
- **WHEN** finish runs for that target
- **THEN** waiting project finish preserves all populated contents and its old bridge
- **AND** successful contract retirement removes only its own optimizer state and preserves the populated project and other contracts

#### Scenario: cross-project corruption cannot cascade into a neighbor

- **GIVEN** a schema-representable incoming or outgoing dependency touching a marked project's work items or steps conflicts with the owning project
- **WHEN** installed finish validates the deletion set
- **THEN** it throws before cleanup and retains complete domain, event and sequence state with no delivery

#### Scenario: failure after partial cleanup restores the entire project

- **GIVEN** at least one explicit cleanup statement has deleted populated project rows inside the finalization owner
- **WHEN** a later cleanup statement fails, after-capture throws, or a later fan-out insert fails after an earlier event insert
- **THEN** all project contents, cascades, ownership, optimizer state, history, event rows and sequences equal their pre-owner state
- **AND** no optimizer notification or transport escapes rollback

#### Scenario: committed populated deletion retains replay after transport failure

- **GIVEN** populated deletion and its original comparison-derived envelopes committed atomically
- **WHEN** transport rejects after the writer is released
- **THEN** the project remains deleted and the original event identities replay unchanged
- **AND** another writer can complete during held transport and repeated finish remains absent and silent

### Requirement: Live optimizer observation does not recursively enter admission

Live optimizer admission SHALL obtain generation, cached pair and miss-only objective requests
from one committed source observation before calling public reservation or queue operations.
No callback inside that observation SHALL call a public gated persistence method. Returned
schedule evidence SHALL retain that observation's identity and pre-admission pair even when
later preflight writes a marker. Reservation SHALL recheck existing current-generation,
enablement and drain fences after waiting. Captured command scheduling SHALL remain
non-admitting and SHALL NOT recursively acquire the live source gate.

#### Scenario: admission writes a marker after observation

- **GIVEN** a coherent observed pair contains a miss for an objective
- **WHEN** later preflight commits a failure marker for that admission
- **THEN** the current read retains its original pre-admission pair and generation
- **AND** a later read may observe the committed marker without automatically retrying it

#### Scenario: heartbeat waits behind a source owner

- **GIVEN** a durable solver slot and a source owner paused inside its transaction
- **WHEN** a public heartbeat arrives
- **THEN** heartbeat_at remains unchanged and the heartbeat does not settle until that owner releases
- **AND** child lifecycle decisions await the resulting heartbeat outcome

#### Scenario: generation changes between observation and reservation

- **GIVEN** a coherent observation has returned generation G and the source then supersedes G
- **WHEN** its queued reservation acquires the writer
- **THEN** the final admission fence refuses the stale reservation and no child launches for it

### Requirement: Command fan-out retains post-commit optimizer notifications

A command batch, undo/redo or admitted route write SHALL compare once around its whole
successful act, including any prelude, using the originating transaction's captured rank,
mode, ownership, resource usages and scheduling evidence. Capture SHALL use non-admitting
scheduler/cache reads and SHALL require no earlier plan read. Refused acts and their
history-only rollback repairs SHALL produce no shared fan-out.

Committed fan-out delivery SHALL notify the existing optimizer edit policy for each recipient
after commit and writer release, before transport awaits. It SHALL preserve ordinary
source-project scheduling announcements, reuse the recorded subscription/sequence/payload
without reinsertion, and SHALL NOT create fan-out by replaying or delivering an event.
Transport failure SHALL retain the committed write, event and optimizer notification.
This does not promise durable optimizer callback recovery across process failure.

For bare admitted project/step writes, observation SHALL require fresh read-only authority within
the owning UoW before capture. Supplied request scope alone SHALL NOT authorize observation.
This check SHALL return typed `not_found` or `forbidden`, write no audit, grant or other state,
and preserve each operation's existing recovery policy. It SHALL NOT replace the repository's
final mutation guard/audit. The service SHALL await observation after its existing preflight
refusals and before its write, and propagate an observation-authority refusal unchanged.

#### Scenario: membership changes before the admitted turn

- **GIVEN** request access was resolved before its actor was demoted or removed
- **WHEN** the admitted route enters its UoW
- **THEN** it returns the existing typed refusal without invoking shared capture or mutation
- **AND** no downstream event, optimizer callback or recovery audit is produced

#### Scenario: exactly one recovery audit

- **WHEN** a currently authorized super-admin updates a restricted project through an admitted route
- **THEN** old-state capture precedes the write and exactly the existing store recovery audit commits
- **AND** the observation-authority check creates no grant or audit and step-removal policy is unchanged

Mounted scoped step removal SHALL retain its existing recovery UoW, fresh auditing admission,
actor/project grant and successful super-admin restricted-project recovery. Observation SHALL
use that same granted batch after the step service's preflight refusals and before removal;
it SHALL neither repeat admission/audit nor open a nested UoW. Successful removal, existing
recovery audit and downstream event rows/sequences SHALL commit together. Refusal or capture /
event-recording failure SHALL roll them back together. Delivery SHALL start only after writer
release. The bare `NO_ADMISSION` path SHALL NOT gain recovery privileges.

#### Scenario: scoped recovery removes a step

- **WHEN** an authorized non-creator super-admin removes a step from a restricted shared project
- **THEN** the existing recovery boundary grants and audits the successful removal exactly once
- **AND** old-state capture, removal and downstream recording share that same UoW
- **AND** recipient notifications and delivery occur after commit and writer release

#### Scenario: scoped recovery capture or recording fails

- **WHEN** capture or downstream recording fails during an otherwise permitted scoped removal
- **THEN** the step, existing audit, downstream events and sequence advances all roll back
- **AND** the grant expires and no downstream push or optimizer notification occurs

Command grants for execute, undo and redo SHALL expire no later than UoW settlement and
before any post-commit optimizer notification or awaited delivery. Retained command authority
SHALL NOT remain usable while transport is pending after writer release. Failure/refusal
cleanup and the existing `NO_ADMISSION` after-rollback history repair SHALL remain intact.

#### Scenario: transport waits after command or history replay commits

- **WHEN** a command, undo or redo commits downstream events and its delivery remains pending
- **THEN** another writer can enter and the retained command grant refuses its original actor/project
- **AND** releasing or failing transport cannot extend or restore that grant

#### Scenario: mounted command on a cold process

- **GIVEN** a shared chain is persisted and fresh services have served no plan reads
- **WHEN** an authorized mounted command changes the higher project's bookings
- **THEN** its downstream events commit with the command and history
- **AND** recipient optimizer edit callbacks run after writer release without a second event insert

#### Scenario: transport is slow or unavailable

- **GIVEN** a command has committed its downstream events
- **WHEN** gateway transport is pending or fails
- **THEN** recipient edit notifications have already run and another writer can enter
- **AND** retained events remain replayable at their original sequences

### Requirement: Publication compares current display rather than cache insertion

A stored optimizer outcome SHALL retain existing validation, generation, slot/token,
cancellation and enablement fences and outcome/event atomicity. Fan-out SHALL compare the
current selected displayed schedule before and after the write in that transaction. An
eligible old-address result SHALL NOT itself imply a displayed-booking change. Nonselected
outcomes with no display/availability effect SHALL not produce downstream events.

#### Scenario: H1 publishes while H2 is current

- **GIVEN** H1 remains eligible for storage but current shared input is H2
- **WHEN** H1 is stored at its original immutable address
- **THEN** its existing outcome event may be recorded but no downstream event is emitted unless
  the current displayed bookings or availability actually changed

#### Scenario: the selected schedule arrives

- **WHEN** a current selected optimized outcome changes displayed bookings from the prior Fast schedule
- **THEN** affected downstream events commit with the outcome and its existing outcome event

#### Scenario: generation allocation removes the selected cache

- **GIVEN** a generation-changing admission observation removes cache rows that supply the
  current selected display
- **WHEN** the observation commits
- **THEN** its actual displayed-booking or modeled-availability change and downstream events
  commit with the generation/cache mutation
- **AND** the returned generation, original pair and admission requests remain one coherent
  observation, without recursive live admission during comparison

#### Scenario: storage replaces or evicts a selected cache row

- **WHEN** an admitted outcome replaces a failed/corrupt marker or enforces the live budget bound
- **THEN** comparison covers the complete storage and eviction operation using the current display
- **AND** event or after-capture failure restores cache rows and event sequences together
- **AND** a different Objective, Contract version or budget does not itself imply a display change

#### Scenario: admission changes only optimization status

- **GIVEN** reservation, enqueue, Retry or dequeue changes idle, pending or retrying status
- **WHEN** displayed bookings and modeled scheduling availability remain unchanged
- **THEN** that status change emits no downstream event
- **AND** independent global reclaim or retirement effects in the same transaction still receive
  their normal comparison

#### Scenario: outcome transport is held after commit

- **GIVEN** outcome storage and downstream events have committed and released their writer
- **WHEN** delivery is pending or rejects
- **THEN** the committed outcome decision remains usable and exact-slot cleanup can proceed
- **AND** recipient optimization-input reactions run before transport is awaited
- **AND** shutdown waits for tracked delivery and delivery errors are reported without replacing
  the committed outcome or allocating another event sequence

### Requirement: Committed fan-out survives a missed push

Fan-out SHALL use existing durable per-project event sequences and replay authorization.
Pushing an already recorded event SHALL NOT allocate another sequence. Repeating an already
recorded outcome or a no-op reconciliation SHALL NOT repeat fan-out; distinct committed changes
SHALL NOT be conflated merely because their causes match. No global exactly-once delivery or
new command-retry guarantee is introduced. A cold process SHALL replay retained committed
events; an expired replay range SHALL retain the existing snapshot-required behavior.

#### Scenario: crash between commit and push

- **GIVEN** fan-out committed and the process stopped before transport
- **WHEN** an authorized client reconnects through a fresh process with no memory buffer
- **THEN** durable replay returns the original recipient event and sequence

#### Scenario: process-local engine loss

- **WHEN** an external engine disappears without a modeled durable state transition
- **THEN** reads retain their typed availability/refusal behavior
- **AND** no instantaneous durable notification is promised and reads do not write fan-out state

### Requirement: Super-admins switch the mode

`PATCH /api/organization {sharedPeople}` SHALL be allowed only to a super-admin whose membership
is re-read on the writer inside the switch, and never through a delegation
(`403 insufficient_scope`). An admin SHALL be answered `403 forbidden`, and legacy access SHALL be
answered `409 organization_required`. Any current member SHALL read the mode with
`GET /api/organization`. A mode outside the release's `SUPPORTED_CAPACITY_MODES` SHALL be
answered `409 capacity_mode_unsupported` before anything is written. Every switch SHALL be
recorded in `shared_people_audit` (who, when, to which mode) in the same transaction, together
with one `elsewhere_changed {projectId, causeProjectId: null}` event row per project of the
organization; setting the mode the organization already has SHALL record and publish nothing.
Switching back to `isolated` SHALL restore each project's isolated dates. A rollback SHALL never
discard a recorded switch: the audit migration's `down.sql` and `shared-people-rollback-cli.ts
remove` SHALL refuse while one exists. The route SHALL ship only after the engines, the chain
and fe-01 understand `shared`.

#### Scenario: an admin switches

- **WHEN** an admin patches `sharedPeople: true`
- **THEN** the answer is `403 forbidden` and the organization stays isolated

#### Scenario: an isolated-only release

- **GIVEN** the release's supported capacity modes are `['isolated']`
- **WHEN** a super-admin patches `sharedPeople: true`
- **THEN** the answer is `409 capacity_mode_unsupported` and nothing is stored, audited or published

#### Scenario: a release that supports shared people

- **GIVEN** the release supports `shared` and Platform ranks above Billing, both booking Ana
- **WHEN** a super-admin patches `sharedPeople: true`
- **THEN** one audit row and one `elsewhere_changed` per project are recorded, and Billing's work
  for Ana starts after Platform's
- **AND** patching `sharedPeople: false` restores Billing's isolated dates

### Requirement: Stored encoding does not advertise runtime capability

The intermediate storage and runtime/cache releases SHALL advertise supported `capacityModes`
exactly `['isolated']` until runtime/cache, durable fan-out and UI prerequisites are complete.
No route or CLI SHALL store `shared` while the release does not list it; there SHALL be no
activation route or environment override, and shared restores SHALL continue to be refused. A dormant runtime reader exercised with seeded shared
state SHALL NOT itself authorize production activation.
The swap SHALL inspect stored encodings truthfully: old schemas lacking the column mean isolated;
a missing organization table, present unreadable column or value outside 0/1 SHALL refuse.
Only an absent capability CLI under readable source SHALL denote an older isolated-only release;
a nonregular or dangling CLI path and missing source SHALL refuse. Shared state SHALL refuse an
isolated-only incoming release before migration and again after the outgoing color stops.

#### Scenario: intermediate release over shared state

- **GIVEN** a database containing a shared organization
- **WHEN** the incoming release supports only isolated mode
- **THEN** the swap refuses and names the combined recovery procedure

### Requirement: Standalone and borrowed rank/resource fan-out have one owner

Standalone rank and directory store mutations SHALL capture before and after scheduling state
and record derived shared-person events within their owning write transaction. A directory
mutation already inside a command or Working plan SHALL participate only in that outer
operation's capture and event set. The owner SHALL preserve old resource usages after removal,
compare authoritative relative project ordering rather than numeric rank positions, and use
the selected displayed schedule. Refusal or capture/event failure SHALL preserve the prior
domain state, event rows and sequence. Committed delivery and recipient optimizer notification
SHALL occur only after commit and writer release.

The rank owner SHALL recheck current admin/super-admin membership on the borrowed writer
before capture; a revoked or demoted actor SHALL receive typed `forbidden` without recovery
audit. Ownership resolution SHALL preserve typed caller-addressed absent/foreign entry and
link refusals, while throwing for present trusted rows with missing or corrupt required
ownership. Both refusal and corruption classification SHALL precede standalone shared capture.

#### Scenario: a queued rank move loses current authority

- **GIVEN** rank request access was resolved while its actor was an admin
- **WHEN** the actor is demoted or removed before the rank writer acquires its turn
- **THEN** the move returns typed forbidden without capture, rank changes, audit, events or sequence changes

#### Scenario: a standalone addressed resource is absent or foreign

- **GIVEN** an operation addresses an absent or validly foreign directory entry or team/service link
- **WHEN** its owning transaction resolves the address
- **THEN** the existing not_found, unknown_team or unknown_service refusal is preserved
- **AND** shared capture and mutation are not invoked

#### Scenario: a present trusted resource has corrupt ownership

- **GIVEN** a present scoped resource lacks its required ownership, or a stored usage has corrupt ownership
- **WHEN** standalone ownership resolution examines it
- **THEN** it throws before capture and mutation, without treating corruption as absence or a silent mode

The public directory service SHALL retain its existing raw-store transaction boundaries.
Its standalone facade SHALL carry immutable invocation access and own capture/event recording
per raw mutator call, not per compound service operation. Service validation and ordinary
announcement ownership SHALL remain unchanged. Already-owned command/import/repair graphs
SHALL use raw borrowed stores and SHALL NOT acquire this standalone owner.

#### Scenario: standalone rename commits before a later link after-capture failure

- **GIVEN** a scoped person or team patch renames through one store call and patches links through another
- **WHEN** the rename commits and after-capture fails after the later link mutation
- **THEN** the committed rename and its prior ordinary announcement remain
- **AND** only the failing owner's mutation and event/sequence effects roll back
- **AND** a links-only zero-pair comparison does not fabricate a downstream event

#### Scenario: membership changes derive no recipients

- **WHEN** a name-idempotent add joins memberships to an existing person without changing displayed bookings, availability or effective incoming basis
- **THEN** normal before/after observation produces no recipient pairs and no fan-out event is inserted

#### Scenario: service validation precedes standalone capture

- **WHEN** a standalone service refuses invalid kind/name or nothing-to-change before any store mutation
- **THEN** no shared capture, fan-out write or delivery is invoked

#### Scenario: concurrent standalone invocations retain their own access

- **GIVEN** two interleaved public directory invocations belong to different scoped organizations
- **WHEN** their mutators enter their owners
- **THEN** each resolves only its explicit invocation access and records only its own valid recipients
- **AND** no mutable shared context or target-derived authority can transfer authorization between them

#### Scenario: ordinary announcements are not republished by the facade

- **WHEN** standalone directory mutations complete or a later compound mutation fails
- **THEN** ordinary announcements retain their existing service call sites and counts
- **AND** the facade delivers only the shared events recorded by each successful mutation owner

#### Scenario: a rank move only respaces stored positions

- **GIVEN** the organization's stored rank positions need respacing but project identity order is unchanged
- **WHEN** an admitted move rewrites positions into the same identity order
- **THEN** it records no shared-person event and advances no shared-person event sequence

#### Scenario: standalone person removal retains old users

- **GIVEN** a person connects ranked dated projects and its removal derives at least two distinct recipient/cause pairs
- **WHEN** a standalone directory mutation removes that person and their assignments
- **THEN** the same transaction records each required old-closure recipient/cause pair once
- **AND** an independent failure of the second real event insert restores the person, assignments, earlier events and sequences

#### Scenario: command directory edits have no inner fan-out owner

- **GIVEN** one command batch edits several directory resources through a Working plan
- **WHEN** it commits
- **THEN** the outer command's before/after state determines one distinct event per recipient/cause pair
- **AND** intermediate directory writes produce no independently committed or duplicate shared events

#### Scenario: refused standalone resource edit leaves event sequence unchanged

- **GIVEN** a used directory entry whose removal requires cascade confirmation
- **WHEN** standalone removal is refused without confirmation
- **THEN** its resource usages, event rows and event sequence remain unchanged
- **AND** no shared push or recipient optimizer notification occurs

### Requirement: Combined backup preserves every mode and rank

`shared-people-rollback-cli.ts save` SHALL write a deterministic versioned file containing every
organization's id and semantic mode, including isolated organizations, and every column of every project
rank row, captured from one snapshot on a dedicated physically read-only connection that closes
on every outcome. Save SHALL create a private file exclusively and SHALL NOT overwrite an existing file. `remove` SHALL validate that file and atomically clear modes
and ranks only if it matches the entire current state exactly. `restore` SHALL validate supported
modes before mutation, require every saved organization to exist while leaving additional isolated organizations
untouched, require all current modes isolated and no ranks, and atomically restore the saved state after validating rank ownership and authors. Missing,
unreadable, malformed, duplicate or stale input SHALL refuse without partial changes. Partial
organization updates SHALL stamp the supplied operator instant; restored ranks SHALL retain
their saved audit fields. A failed transaction SHALL roll back audit fields with the modes and ranks.

#### Scenario: a mode changes after backup

- **GIVEN** a complete backup, followed by a stored mode change without a rank change
- **WHEN** remove is attempted with that backup
- **THEN** remove refuses and preserves both modes and ranks

#### Scenario: intermediate restore of shared mode

- **GIVEN** a complete backup containing shared mode
- **WHEN** restore runs on the isolated-only intermediate release
- **THEN** it refuses before changing any mode or rank

#### Scenario: failure halfway through remove

- **GIVEN** both organization modes and ranks have been backed up
- **WHEN** a database write fails after ranks are deleted during combined remove
- **THEN** the transaction restores all prior modes and ranks

#### Scenario: existing recovery file

- **GIVEN** a recovery file already exists at the save path
- **WHEN** save is attempted again
- **THEN** save refuses and the existing bytes stay unchanged

#### Scenario: additional isolated organization

- **GIVEN** saved organizations still exist and an additional isolated organization was created
- **WHEN** restore runs with isolated current modes and no ranks
- **THEN** the saved state is restored and the additional organization remains untouched

#### Scenario: additional shared organization

- **GIVEN** an additional organization is currently shared
- **WHEN** restore runs
- **THEN** restore refuses before changing any saved mode or rank

### Requirement: Mode selection shares the scheduling observation

Scoped runtime scheduling SHALL read the organization's stored mode in the same observation as
authorization, rank, assignments, plan settings and cache selection. Legacy access SHALL use
isolated semantics. Missing or malformed trusted mode state SHALL throw, never default to
isolated. Concurrent edits SHALL produce an observation from one coherent state, not a mixture.
An unavailable required influencer SHALL remain a typed refusal before any cached target dates
are returned; cycle and calendar-range evidence SHALL retain the chain's existing policy.

#### Scenario: isolated dates stay isolated

- **GIVEN** A outranks B and both assign Ana, but the organization is isolated
- **WHEN** B is read, including under legacy access
- **THEN** B retains its existing isolated dates and input hash without reading A as an influencer

#### Scenario: concurrent mode and rank edit

- **GIVEN** a scoped scheduling read has opened its observation
- **WHEN** another connection changes mode, rank, assignments or start date during capture
- **THEN** the response agrees with one coherent state and contains no mixed chain

#### Scenario: corrupt mode after a warm read

- **GIVEN** a target has cached dates and its organization's stored mode is malformed
- **WHEN** the target is read again
- **THEN** the read throws instead of serving cached dates or defaulting to isolated

### Requirement: Restore approvals are personal and bound to one backup

`POST /api/organization/shared-people/restore-approvals` SHALL accept an operation ID and a
lowercase SHA-256 canonical backup digest. It SHALL derive the actor and active organization
from the authenticated request, reject delegations, and require current super-admin membership
inside an immediate SQLite writer transaction. Pre-activation requests SHALL answer 409
`organization_required`. Invalid or extra request fields SHALL answer 400. Role refusal SHALL
answer 403. No refusal SHALL write approval or operation state.

One operation ID SHALL bind exactly one digest across organizations. One operation and
organization SHALL bind exactly one approving actor and durable approval ID. An identical
personal retry SHALL return the original approval after rechecking membership. Any changed
digest or approving actor SHALL answer 409 `restore_approval_conflict` without changing evidence.
Rollback SHALL refuse to discard any restore operation or approval evidence. The preparatory
shared-people removal SHALL reject either kind of evidence in its immediate writer transaction
before mutating ranks, modes or organization audit fields, preserving evidence and the migration
ledger even when all modes are isolated and no switch audit exists.

#### Scenario: restore evidence closes removal before schema rollback

- **GIVEN** one isolated organization has a rank, no capacity-mode switch audit, and a restore operation with or without an issued approval
- **WHEN** the operator attempts shared-people removal followed by schema rollback
- **THEN** removal refuses before changing ranks, modes, organization audit fields or evidence
- **AND** schema rollback also refuses while the migration ledger remains unchanged

#### Scenario: demotion after request admission

- **GIVEN** a personally authenticated super-admin whose request resolves organization access
- **WHEN** their membership is demoted before approval obtains the writer
- **THEN** approval returns 403 and stores neither operation nor approval

#### Scenario: one operation is reused with a different backup

- **GIVEN** organization A has approved operation R for digest D
- **WHEN** a super-admin in organization B approves R for another digest
- **THEN** the request returns 409 and the original evidence remains unchanged

#### Scenario: delegated super-admin

- **WHEN** a valid delegation for a super-admin requests approval
- **THEN** it returns 403 insufficient_scope and writes no approval

### Requirement: Shared people backups have a canonical offline digest

The v1 shared-people backup boundary SHALL preserve existing shape, semantic mode, integer rank
field and uniqueness validation. Every rank SHALL name an organization included in the complete
backup. A malformed or incomplete backup SHALL fail before producing a digest or recovery write.

The canonical representation SHALL be UTF-8 JSON without whitespace, with root fields
`format,version,organizations,ranks`, organization fields `organizationId,mode`, and rank fields
`projectId,organizationId,position,createdAt,updatedAt,createdBy` in that order. Organization and
rank arrays SHALL sort by ordinal organization/project ID, never locale collation. The digest
SHALL be lowercase SHA-256 of those canonical bytes, including every normalized saved fact.

`shared-people-rollback-cli.ts digest <backup-file>` SHALL emit only that digest and a newline,
without requiring `DB_PATH`, opening SQLite or changing any database. Invalid arguments and
absent, unreadable, malformed or invalid backups SHALL exit nonzero without digest output.
Existing isolated `save|remove|restore <file>` recovery SHALL retain its contract and shared
backups SHALL remain refused by bare restore.

#### Scenario: equivalent backup presentation

- **GIVEN** two v1 backups with identical saved facts and different whitespace, object key order or array order
- **WHEN** the offline digest command reads either backup
- **THEN** both emit the same canonical digest without opening a database

#### Scenario: a rank outside the complete organization set

- **WHEN** a backup rank names an organization absent from its organizations array
- **THEN** digest and recovery validation refuse it before any output or write

### Requirement: Host restore excludes writers before opening the database for recovery

The host recovery entrypoint SHALL own a nonblocking exclusive flock on
`/home/puni1/wbs/state/deploy.lock` in the same process that restores
`/home/puni1/wbs/data/wbs.db`. It SHALL hold that lock from before the backup read through
inspection, diagnostics, transaction completion and connection closure. Contention SHALL refuse
before a writable database connection opens. It SHALL NOT launch a child writer or pass the
lock's lifetime to an inspection child. Owner death SHALL release the flock and roll back any
uncommitted recovery changes, including organization audit fields.

The entrypoint SHALL inspect the full Docker container inventory, including stopped containers.
Both `be-01-blue` and `be-01-green` SHALL exist, be stopped unconditionally and have an unambiguous
writable DB_PATH mount resolving to the canonical database's physical device and inode. Every
additional running container with a writable mount covering that database or naming its physical
file SHALL refuse recovery. An additional running container with a writable directory on the
same device SHALL also refuse, since path disjointness or a directory scan cannot exclude a
hardlink. Missing, unreadable, malformed, incomplete or ambiguous inspection facts SHALL refuse
before the writable opener; unknown state SHALL NOT establish writer exclusion.

The entrypoint SHALL read the backup file exactly once, retain its validated contents and use the
canonical digest defined by "Shared people backups have a canonical offline digest" for any
operation/approval reference diagnostics. Those diagnostics SHALL use a physically read-only
snapshot, reject inconsistent operation/digest/organization bindings and incomplete references
for saved shared changes, and SHALL NOT assert an actor, consume consent or grant restore
authority. The intermediate-release refusal in "Combined backup preserves every mode and rank" SHALL also apply to this host entrypoint, before its writable opener, even when references
are valid. The host entrypoint SHALL NOT start containers or activate runtime capability.

#### Scenario: deploy contention during backup inspection

- **GIVEN** a host restore owns the canonical deploy flock and a Docker inspection child is still running
- **WHEN** another deploy or host restore attempts that flock
- **THEN** the rival refuses while the recovery owner retains the lock
- **AND** no rival writable recovery connection opens

#### Scenario: owner dies while its inspector survives

- **GIVEN** the recovery owner holds the canonical deploy flock while its inspection child runs
- **WHEN** the owner is killed and the inspection child remains alive
- **THEN** another process can acquire the same lock inode
- **AND** no detached writer continues recovery

#### Scenario: owner dies after partial SQLite writes

- **GIVEN** the locked recovery owner has written organization audit state and spilled uncommitted SQLite pages during a later restore update
- **WHEN** the owner is killed before commit
- **THEN** prior modes, ranks and organization audit fields remain unchanged after recovery
- **AND** the same flock becomes available and a successor isolated restore can complete

#### Scenario: the colours name different physical databases

- **GIVEN** both colours configure the same container DB_PATH but their writable mounts resolve to different database inodes
- **WHEN** host restore inspects those colours
- **THEN** it refuses before the writable opener instead of accepting matching path strings

#### Scenario: a running colour names the canonical database through a hardlink

- **GIVEN** green is running and its alternate mount directory contains a hardlink to the canonical database
- **WHEN** host restore verifies that green's database has the canonical device and inode
- **THEN** it still refuses because green is running
- **AND** ranks remain absent and the database journal mode is unchanged

#### Scenario: an additional running writer has a disjoint same-device directory

- **GIVEN** both verified colours are stopped and another running container has a writable directory on the canonical database's device
- **WHEN** host restore inspects that container, including when the directory contains a database hardlink under an alternate pathname
- **THEN** it refuses even though the directory path does not contain the canonical database path
- **AND** ranks remain absent and the database journal mode is unchanged

#### Scenario: required inspection facts cannot establish exclusion

- **GIVEN** Docker inspection fails, a required colour is missing, or inventory, state, DB_PATH or mount facts are malformed, incomplete or ambiguous
- **WHEN** host restore attempts preflight
- **THEN** it refuses before opening a writable database connection
- **AND** no saved mode, rank or organization audit field changes

#### Scenario: a physical mount source is unreadable

- **GIVEN** a required inspected writable mount source exists but the recovery owner cannot read its physical identity
- **WHEN** host restore attempts to establish writer exclusion
- **THEN** it refuses before the writable opener rather than treating unreadability as absence

#### Scenario: the backup pathname changes during inspection

- **GIVEN** host restore has read and validated an isolated backup under its flock
- **WHEN** the inspection subprocess replaces that pathname with malformed bytes
- **THEN** restore uses the retained original contents without rereading the pathname

#### Scenario: diagnostic references do not match the retained backup

- **GIVEN** supplied references have a foreign canonical digest, operation or saved organization, or omit an approval required for saved shared changes
- **WHEN** the host entrypoint checks those references
- **THEN** it refuses without changing approval evidence, ranks, modes or database journal mode

#### Scenario: valid diagnostic consent cannot enable shared restoration

- **GIVEN** a shared backup has valid operation and approval reference bindings
- **WHEN** the intermediate host entrypoint completes read-only diagnostics
- **THEN** the existing unsupported-shared-mode refusal occurs before a writable connection opens
- **AND** approval evidence and database journal mode remain unchanged
