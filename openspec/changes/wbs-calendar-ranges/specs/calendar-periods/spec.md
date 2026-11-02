## ADDED Requirements

### Requirement: A non-working period moves every slice in release 1

A calendar period of kind `non_working` SHALL remove its weekdays from the work calendar of
every slice, of any executor kind, of every dated work package beneath its scope. A `note`
period SHALL change no date. The agent-kind exemption is not part of this release.

#### Scenario: A space holiday shifts human and agent slices alike

- **WHEN** a space holds a `non_working` period on Wednesday 2027-03-10 and a dated work
  package in that space has a two-day human-kind slice and a two-day agent-kind slice both
  starting Tuesday 2027-03-09
- **THEN** both slices finish on Thursday 2027-03-11

#### Scenario: A note changes nothing

- **WHEN** the same period is kind `note`
- **THEN** the schedule is byte-identical to the schedule without it

#### Scenario: Overlapping periods count a date once

- **WHEN** an organization period and a project period are both `non_working` on 2027-03-10
- **THEN** the two-day slice starting 2027-03-09 finishes on 2027-03-11, as with one period

### Requirement: The chain has one space or none

A work package's effective periods SHALL be the union of the periods of its organization, its
space if it has one, its project and itself, each answered with provenance `{ level, id }`. A
project that changes space SHALL lose the old space's periods and gain the new space's, and
every work package of the project SHALL be told.

#### Scenario: A chain without a space

- **WHEN** the organization holds period A, the project period B and the work package period C,
  and the project is in no space
- **THEN** `GET /api/work-packages/:id/calendar-periods` answers A, B and C with provenance
  `organization`, `project` and `work_package`

#### Scenario: A chain with one space

- **WHEN** the project is in space S holding period D, beside A, B and C
- **THEN** the work package answers A, B, C and D, and D carries provenance `space`

#### Scenario: A project moves to another space

- **WHEN** the project moves from space S to space T, S holding `non_working` period D and T
  holding none
- **THEN** D is no longer effective for the project's work packages and each of them receives
  `calendar_periods_changed` with `movesSchedule` true

### Requirement: A foreign period is refused without disclosure

A write SHALL authorize the addressed scope before reading the period. A period owned by an
ancestor in the addressed scope's chain SHALL be refused with `409 inherited_period` naming
the owner. A period outside that chain, of another project or another organization, SHALL
answer `404`, identical to an id that does not exist.

#### Scenario: A work package cannot delete an organization period

- **WHEN** `DELETE /api/work-packages/:id/calendar-periods/:periodId` names organization
  period A by a caller holding `package.manage_settings`
- **THEN** it answers `409 inherited_period` naming the organization and A still exists

#### Scenario: Another project's period is absent

- **WHEN** the same route names a period of an unrelated project of the same organization
- **THEN** it answers `404` with the body an absent id answers, and that period is unchanged

#### Scenario: Another organization's period is absent

- **WHEN** the same route names a period of another organization
- **THEN** it answers `404` with the body an absent id answers

#### Scenario: Authorization comes first

- **WHEN** a caller without `package.manage_settings` names organization period A
- **THEN** it answers `403` and not `409`

### Requirement: Periods are validated at the boundary and in storage

A write SHALL refuse a date that is not a real `YYYY-MM-DD` calendar date with
`422 invalid_date`, an unknown kind with `422 invalid_kind`, an end before the start with
`422 end_before_start` and more than 366 inclusive days with `422 period_too_long`. The table
SHALL refuse the same dates and lengths, and a stored row that fails to parse SHALL throw.

#### Scenario: 366 days are accepted

- **WHEN** a period from 2027-01-01 to 2028-01-01 is posted
- **THEN** it answers `201`

#### Scenario: 367 days are refused

- **WHEN** a period from 2027-01-01 to 2028-01-02 is posted
- **THEN** it answers `422 period_too_long` and no row is written

#### Scenario: An impossible date is refused

- **WHEN** a period starting 2027-02-30 is posted
- **THEN** it answers `422 invalid_date`

#### Scenario: The end precedes the start

- **WHEN** a period is posted with start 2027-03-10 and end 2027-03-09
- **THEN** it answers `422 end_before_start`

#### Scenario: Storage refuses an invalid date

- **WHEN** a row with start and end `garbage` is inserted directly
- **THEN** the insert fails on the table's CHECK

### Requirement: An undated work package keeps and lists its periods

Explicit-date writes SHALL be accepted for a work package with no start date. Its own and
inherited periods SHALL be listed, not drawn, and SHALL move no slice. A drag on a
workday-axis cell SHALL be refused naming the missing start date (ADR 0017). A work package
that loses its start date SHALL keep its periods.

#### Scenario: An explicit-date write on an undated package

- **WHEN** `POST /api/work-packages/:id/calendar-periods` sends start 2027-03-10 for a work
  package with no start date
- **THEN** it answers `201` and the period is listed by the package's `GET`

#### Scenario: A package becomes undated

- **WHEN** a dated work package with its own period P loses its start date
- **THEN** P is still listed and can be edited and deleted

### Requirement: Shared bookings cross calendars by date

A booking of a shared person SHALL reach another work package as segments on a common date
axis, split at every date the booking package does not work, with fractional endpoints kept,
and SHALL be converted into the receiving package's working offsets before scheduling.

#### Scenario: A closed day in one package is free in another

- **WHEN** a person has a two-day slice from Tuesday 2027-03-09 in work package A, whose
  project holds a `non_working` period on 2027-03-10, and is also assigned in work package B
  of another project with no such period
- **THEN** B treats the person as booked on 2027-03-09 and 2027-03-11 and free on 2027-03-10,
  and the person-load read shows the same days

### Requirement: Period changes reach every package beneath the scope

A committed period write SHALL deliver `calendar_periods_changed` with `scopeKind`, `scopeId`
and `movesSchedule` to every work package beneath the scope, after commit. `movesSchedule`
SHALL be true exactly when the old or new row is `non_working`, and only then SHALL the event
trigger optimization. A rolled-back write SHALL deliver nothing.

#### Scenario: A space period reaches unrelated packages

- **WHEN** a `non_working` period is created on a space holding two projects that share no
  person
- **THEN** every work package of both projects receives `calendar_periods_changed` once with
  `movesSchedule` true

#### Scenario: A note does not optimize

- **WHEN** a `note` period is renamed
- **THEN** each package beneath receives the event with `movesSchedule` false and no
  optimization starts

#### Scenario: A rolled-back write is silent

- **WHEN** a period write fails after the row was written in its unit of work
- **THEN** no package receives `calendar_periods_changed`

### Requirement: Saved plans keep periods and scheduling identity apart

A saved plan SHALL snapshot the effective periods (id, scope, dates, kind, name, colour) with
the hierarchy in the same read as the plan. The scheduling identity SHALL depend only on the
sorted, de-duplicated effective `non_working` dates. A historical version SHALL read as an
empty set; a current-version body missing the field or malformed SHALL throw.

#### Scenario: A note edit keeps the scheduling identity

- **WHEN** a `note` period is renamed between two saves of the same plan
- **THEN** the saved inputs differ and `canonicalScheduleInput` is identical

#### Scenario: A deleted ancestor period still renders

- **WHEN** an organization period captured by a saved plan is later deleted
- **THEN** the saved plan still renders it with its captured provenance

### Requirement: Every marker survives as a one-day note

The forward migration SHALL run inside the stop-the-world window of `wbs-work-packages`
slice 3a and copy every marker into `calendar_period` with the same id, scope kind, scope id,
name, colour and creation time, start and end equal to its date and kind `note`, then drop
the marker table. Its `down.sql` SHALL refuse while a period exists that is not such a copy.

#### Scenario: Markers migrate field by field

- **WHEN** the migration runs over a store with markers on 2027-01-01 and 2027-01-02
- **THEN** `calendar_period` holds exactly two `note` rows equal field by field to the markers
  and the work package's schedule is unchanged

#### Scenario: Rollback refuses to lose a new period

- **WHEN** a two-day `non_working` period exists and `down.sql` runs
- **THEN** it refuses and the database is unchanged
