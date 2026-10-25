## ADDED Requirements

### Requirement: A non-working range moves human work only

A calendar range of kind `non_working` SHALL remove its weekdays from the work calendar of
every human-kind and either-kind slice of every work package beneath its scope; agent-kind
slices SHALL be scheduled as if it did not exist. A `note` range SHALL change no date.

#### Scenario: A space holiday shifts a human slice and leaves an agent slice

- **WHEN** a space holds a `non_working` range on Wednesday 2027-03-10 and a dated work
  package in that space has a two-day human-kind slice and a two-day agent-kind slice both
  starting Tuesday 2027-03-09
- **THEN** the human slice finishes on Thursday 2027-03-11 and the agent slice on Wednesday
  2027-03-10

#### Scenario: A note changes nothing

- **WHEN** the same range is kind `note`
- **THEN** the schedule is byte-identical to the schedule without it

### Requirement: Scopes add ranges with provenance

A work package's effective ranges SHALL be the union of the ranges of its organization, every
space of its chain, its project and itself, each answered with provenance `{ level, id }`. A
write to a range through a scope that does not own it SHALL be refused with
`409 inherited_range` naming the owner.

#### Scenario: Ranges from three levels are all effective

- **WHEN** the organization holds range A, the project range B and the work package range C
- **THEN** `GET /api/work-packages/:id/calendar-ranges` answers A, B and C with provenance
  `organization`, `project` and `work_package`

#### Scenario: A work package cannot delete an organization range

- **WHEN** `DELETE /api/work-packages/:id/calendar-ranges/:rangeId` names range A
- **THEN** it answers `409 inherited_range` naming the organization and A still exists

### Requirement: An undated plan refuses a work package range

A range written at the work package scope SHALL be refused with `422 undated_plan` while that
work package has no start date (ADR 0017), and the Gantt SHALL refuse a drag on a
workday-axis cell naming the missing start date. A range whose end is before its start SHALL
be refused with `422 end_before_start`.

#### Scenario: The route refuses on an undated plan

- **WHEN** `POST /api/work-packages/:id/calendar-ranges` is sent for a work package with no
  start date
- **THEN** it answers `422 undated_plan` and no row is written

#### Scenario: The end precedes the start

- **WHEN** a range is posted with start 2027-03-10 and end 2027-03-09
- **THEN** it answers `422 end_before_start`

### Requirement: Every marker survives as a one-day note

The forward migration SHALL copy every `calendar_marker` row into `calendar_range` with the
same id, scope, name and colour, start and end equal to its date and kind `note`, and SHALL
refuse to complete when the counts differ. Its `down.sql` SHALL refuse while a range exists
that is not such a copy.

#### Scenario: Markers migrate unchanged in meaning

- **WHEN** the migration runs over a store with markers on 2027-01-01 and 2027-01-02
- **THEN** `calendar_range` holds two `note` rows whose start and end are those dates and the
  work package's schedule is unchanged

#### Scenario: Rollback refuses to lose a new range

- **WHEN** a two-day `non_working` range was created after the forward migration and
  `down.sql` runs
- **THEN** it refuses and both tables are unchanged
