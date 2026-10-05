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

When a commit or a published optimized outcome changes a project's bookings hash, the process
SHALL publish `elsewhere_changed {projectId, causeProjectId}` to every lower-ranked project
reachable from the cause by shared-person edges that follow rank downward. A change that does not move the hash, such as a rename, SHALL publish nothing.

#### Scenario: a rename

- **WHEN** a work item in a ranked project is renamed
- **THEN** no project below it receives `elsewhere_changed`

### Requirement: Super-admins switch the mode

`PATCH /api/organization {sharedPeople}` SHALL be allowed only to a super-admin. An admin SHALL
be answered `403 forbidden`, and legacy access SHALL be answered `409 organization_required`.
The route SHALL ship only after the engines, the chain and fe-01 understand `shared`.

#### Scenario: an admin switches

- **WHEN** an admin patches `sharedPeople: true`
- **THEN** the answer is `403 forbidden` and the organization stays isolated

### Requirement: Stored encoding does not advertise runtime capability

The intermediate storage-only release SHALL advertise supported `capacityModes` exactly
`['isolated']`. It SHALL NOT install a shared-mode setter, runtime switch or activation route.
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
