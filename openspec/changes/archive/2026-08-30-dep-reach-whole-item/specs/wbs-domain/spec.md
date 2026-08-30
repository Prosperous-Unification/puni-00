## ADDED Requirements

### Requirement: A project chooses what its dependencies reach

The system SHALL store, per project, a **dependency reach** with exactly two
values:

- `whole-item` — a successor waits for the predecessor's **last** slice in step
  order to finish;
- `anchor-slice` — a successor waits for the predecessor's first estimated slice
  in step order, and the predecessor's later steps run in parallel with it.

The reach SHALL be editable in the project's settings. It SHALL be read by the
scheduler from the project being scheduled, and SHALL NOT be supplied by a
client.

A stored reach that is neither value SHALL cause the read to fail loudly. It
SHALL NOT be treated as either value.

#### Scenario: a project's reach decides what a successor waits for

- **GIVEN** a project set to `whole-item`, a predecessor with a Dev slice and a
  QA slice, and a successor depending on it
- **WHEN** the plan is scheduled
- **THEN** the successor SHALL start no earlier than the predecessor's QA finish

#### Scenario: the anchor reach is still available and still means what it did

- **GIVEN** the same plan set to `anchor-slice`
- **WHEN** it is scheduled
- **THEN** the successor SHALL start no earlier than the predecessor's Dev finish
- **AND** the predecessor's QA SHALL be allowed to run alongside it

#### Scenario: an unrecognised stored reach is refused

- **GIVEN** a project whose stored reach is neither value
- **WHEN** it is scheduled
- **THEN** the read SHALL throw
- **AND** it SHALL NOT be scheduled under either rule

## MODIFIED Requirements

### Requirement: A dependency waits for the whole predecessor unless the project says otherwise

The system SHALL default every project — including every project that exists
when this change is released — to the `whole-item` reach.

Either end of a dependency MAY be a parent, which SHALL continue to mean every
leaf beneath it: every predecessor leaf's reached slice SHALL finish before any
successor leaf starts. Successor-side attachment, not-before floors, cycle
detection and the item-anchored arithmetic SHALL be unchanged by the reach.

A predecessor nobody has estimated anywhere SHALL be reached at its own finish
under either value.

#### Scenario: existing plans move to the whole-item rule

- **GIVEN** a project created before this change, with a multi-step predecessor
  and a dependency on it
- **WHEN** it is scheduled after this change
- **THEN** its reach SHALL be `whole-item`
- **AND** the successor SHALL wait for the predecessor's last slice

#### Scenario: a single-step plan schedules identically under both reaches

- **GIVEN** a project with one step and a chain of dependencies
- **WHEN** it is scheduled under each reach in turn
- **THEN** every date SHALL be identical

#### Scenario: a parent predecessor expands to its leaves under either reach

- **GIVEN** a dependency from a parent to a successor
- **WHEN** the plan is scheduled
- **THEN** every leaf beneath the parent SHALL have its reached slice finished
  before the successor starts

### Requirement: A dependency arrow leaves the slice the reach names

The system SHALL draw a dependency arrow from the predecessor slice the
project's reach names — the projection's finish under `whole-item`, the anchor
slice under `anchor-slice` — so that the drawing and the schedule cannot
disagree.

#### Scenario: the arrow leaves the finish under the whole-item reach

- **GIVEN** a project set to `whole-item` with a multi-step predecessor
- **WHEN** its chart is drawn
- **THEN** the dependency arrow SHALL leave the predecessor's last slice
- **AND** it SHALL NOT point backwards in time
