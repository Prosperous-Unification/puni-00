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

The event SHALL be `elsewhere_changed {projectId, causeProjectId}` under the recipient's
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

`PATCH /api/organization {sharedPeople}` SHALL be allowed only to a super-admin. An admin SHALL
be answered `403 forbidden`, and legacy access SHALL be answered `409 organization_required`.
The route SHALL ship only after the engines, the chain and fe-01 understand `shared`.

#### Scenario: an admin switches

- **WHEN** an admin patches `sharedPeople: true`
- **THEN** the answer is `403 forbidden` and the organization stays isolated

### Requirement: Stored encoding does not advertise runtime capability

The intermediate storage and runtime/cache releases SHALL advertise supported `capacityModes`
exactly `['isolated']` until runtime/cache, durable fan-out and UI prerequisites are complete.
They SHALL NOT install a shared-mode setter, activation route or environment override, and
SHALL continue refusing shared restores. A dormant runtime reader exercised with seeded shared
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
