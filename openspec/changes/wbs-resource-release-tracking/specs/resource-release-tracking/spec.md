## ADDED Requirements

### Requirement: Register separately attributable resource-use reports

WBS SHALL allow an authorized project writer to register a reported resource use with its
declared resource, work item, responsible person, agent run, locator and positive units.
Optional step/attempt references SHALL be validated together. Registration SHALL retain
attribution snapshots and a history event. Each use SHALL remain distinct from logical
claim occupancy and from other uses on the same leaf.

#### Scenario: Two checkouts for one task

- **WHEN** an implementation and a review register separate checkouts on the same leaf
- **THEN** both uses are listed with their distinct identities and logical occupancy is unchanged

#### Scenario: A resource belongs to another organization

- **WHEN** registration names a foreign resource or work item
- **THEN** registration refuses without writing either a use or a history event

#### Scenario: Machine identity is impersonated

- **WHEN** a machine principal registers a use for another responsible agent
- **THEN** registration refuses instead of attributing its use to that agent

### Requirement: Cleanup requests and reported releases are different facts

WBS SHALL store the states active, cleanup pending, blocked, retained and release reported.
A request SHALL NOT report release. A release report SHALL require a reason and evidence
reference and SHALL identify its source as reported rather than independently verified.

#### Scenario: Cleanup requested

- **WHEN** a writer requests cleanup of an active use
- **THEN** its state becomes cleanup pending and no files, claims or capacities change

#### Scenario: Release without evidence

- **WHEN** a writer reports release without the required evidence
- **THEN** the write refuses and the use and history remain unchanged

#### Scenario: Release is reported with evidence

- **WHEN** a writer reports release of a pending use with reason and evidence
- **THEN** WBS records the reporter and evidence and displays release reported, not verified release

### Requirement: Retention preserves explicit responsibility

Retention SHALL require an in-scope owner, reason and future review deadline. Retained and
blocked uses SHALL remain visible as outstanding, and a new cleanup request SHALL permit a retry.
A reported release SHALL be terminal except for identical replay.

#### Scenario: A review checkout must stay

- **WHEN** a writer retains a use for review with an owner and deadline
- **THEN** the use stays visible as retained and is not counted or labelled as released

#### Scenario: Missing retention owner

- **WHEN** a retention request lacks a valid owner or review deadline
- **THEN** it refuses without a partial history entry

#### Scenario: Terminal release cannot be rewritten

- **WHEN** a new event tries to reactivate a use whose release was reported
- **THEN** it refuses and keeps the original history

### Requirement: History and current state change atomically and idempotently

WBS SHALL append immutable history with admitted actor and server time, update current state
in the same write turn and require the expected revision. Identical event/request identity,
payload and actor SHALL replay its recorded answer. Changed replay or stale revision SHALL
refuse rather than overwrite history.

#### Scenario: Duplicate release report

- **WHEN** the same event is retried after the response was lost
- **THEN** the same answer is returned and only one event exists

#### Scenario: Competing cleanup reports

- **WHEN** two different events use the same expected revision
- **THEN** only one commits and the other conflicts without appending history

#### Scenario: Another actor reuses an event identity

- **WHEN** a different actor replays an existing id
- **THEN** it is refused and cannot assume the original actor's history

### Requirement: Ended ownership requests cleanup for matching uses

Ending an attempt or releasing its claims, including lease expiry, SHALL request cleanup
for the uses whose ownership has ended. The transition SHALL share the existing write
transaction and SHALL NOT arise from a read. It SHALL preserve unrelated runs, remaining
ownership and explicit retention.

#### Scenario: Attempt ends with a checkout outstanding

- **WHEN** an attempt ends successfully with an active use bound to it
- **THEN** the work outcome stays succeeded and the use becomes cleanup pending with a trigger event

#### Scenario: Lease expires while files may remain

- **WHEN** the existing lease sweep releases the last matching claim
- **THEN** its active uses request cleanup and none becomes release reported merely from expiry

#### Scenario: Another run continues

- **WHEN** one run releases its claim while a different run owns another use
- **THEN** only the matching ended ownership is marked cleanup pending

### Requirement: Authorization and history survive planning deletion

Reads and writes SHALL obey existing project and organization authorization. History SHALL
not cascade with planning references. After project deletion, same-organization admins SHALL
retain orphan access; ordinary members and foreign organizations SHALL not gain it.
Undo/redo SHALL not erase or manufacture operational release reports.

#### Scenario: Deleted task retains history

- **WHEN** a work item or attempt with a resource-use report is deleted
- **THEN** the report retains its original attribution and event history

#### Scenario: Deleted project has orphaned resources

- **WHEN** a project is removed while its reported uses remain
- **THEN** an admin of its original organization can inspect and update those uses and a
  member or foreign admin cannot

#### Scenario: A viewer tries to release

- **WHEN** a project viewer submits a release report
- **THEN** the write refuses and no history entry is appended

### Requirement: Resource management exposes tracking with honest states

The Resources screen SHALL expose registered uses, paged history, cleanup requests and
reported outcomes. It SHALL show pending, retained and release-reported states distinctly,
render errors locally, and suppress stale responses after project changes. Empty tracking
SHALL not assert that no physical resources exist.

#### Scenario: The tracking endpoint is unavailable

- **WHEN** tracking cannot be loaded
- **THEN** a local failure is visible while existing resource declarations remain usable

#### Scenario: Cleanup request is accepted

- **WHEN** the request returns a pending use
- **THEN** the panel displays cleanup pending and never cleanup complete

#### Scenario: A project changes during a read

- **WHEN** an earlier project's response arrives after the panel switches projects
- **THEN** the earlier resources and history are not rendered in the new project
