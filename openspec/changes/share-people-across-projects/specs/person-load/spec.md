## ADDED Requirements

### Requirement: A booking is a slice of a project's displayed schedule

A booking SHALL be derived on read from one placed slice of a dated project's displayed
schedule: the optimized schedule when the project displays it, otherwise Fast. Each booking
names its project, work item, step, and the slice's person and width. Its interval is
`[start, end)` in absolute workdays: the project start date's workday ordinal plus the
slice's `earliestStart` and `earliestFinish`, with fractions kept. A slice with no person,
or one whose end does not exceed its start, SHALL book nothing. An undated project, or one
whose schedule reports a cycle or calendar-range error, SHALL book nothing. Bookings SHALL
never be stored.

#### Scenario: fractions and dates

- **GIVEN** project P starting on Monday 2026-10-05, and a slice of Ana from 1.5 to 3.5
- **WHEN** Ana's load is read
- **THEN** the booking runs `[ordinal(2026-10-05) + 1.5, ordinal(2026-10-05) + 3.5)`, and reads
  `startsOn` 2026-10-06, `endsOn` 2026-10-08, the same dates as the plan's own rows

#### Scenario: the displayed engine

- **GIVEN** a project that displays a ready optimized schedule placing Ana later than Fast
- **WHEN** Ana's load is read
- **THEN** her booking has the optimized dates and the project reads `engine: optimized`

### Requirement: An overlap is an intersection of more than an endpoint

Two bookings of one person SHALL overlap only when their intervals share more than a point:
`a.start < b.end && b.start < a.end`. An overlap SHALL be reported as a maximal interval where
at least two bookings are active, naming every booking active in it.

#### Scenario: touching bookings

- **GIVEN** Ana booked `[0, 2)` in P and `[2, 4)` in Q
- **WHEN** her load is read
- **THEN** `overlaps` is empty

#### Scenario: a chain of intersections

- **GIVEN** Ana booked `[0, 3)` in P, `[2, 5)` in Q and `[4, 6)` in R
- **WHEN** her load is read
- **THEN** one overlap runs `[2, 3)` naming P and Q, and another `[4, 5)` naming Q and R

#### Scenario: three at once

- **GIVEN** Ana booked `[0, 4)` in P, `[1, 3)` in Q and `[2, 5)` in R
- **WHEN** her load is read
- **THEN** one overlap runs `[1, 4)`, naming all three bookings

### Requirement: One person's load across projects

`GET /api/people/:personId/load?from=YYYY-MM-DD&to=YYYY-MM-DD` SHALL answer `200` with the
person's `id` and organization-local `name`. It SHALL list every readable project that has a
booking of the person intersecting the window `[from, to]` (inclusive dates), ordered by
project creation and then id. Each project SHALL carry its id, name, displayed engine and those
bookings. Each booking SHALL carry its work item's id, number and name, step id, `startsOn`,
`endsOn` and width. The answer SHALL also carry the overlaps that intersect the window. It
SHALL list readable undated projects that assign the person. It SHALL list, with a reason,
readable projects whose bookings could not be read: `engine_unavailable`, `cycle` or
`calendar_range`. An `engine_unavailable` project SHALL be listed whether or not it assigns
the person, because that cannot be known without its schedule.

#### Scenario: two projects, one overlap

- **GIVEN** Ana booked in P on days 0–4 and in Q on days 3–6
- **WHEN** a member reads Ana's load over those weeks
- **THEN** P and Q are listed with one booking each, and one overlap covers days 3–4

#### Scenario: an undated project

- **GIVEN** project U with no start date and a leaf assigned to Ana
- **WHEN** Ana's load is read
- **THEN** U is in `undated` and not in `projects`

### Requirement: The organization's load by week

`GET /api/people/load?from&to` SHALL answer `200` with every person in the caller's
organization directory in directory order. Each person SHALL carry one entry per week that
intersects the window: the week's Monday, `booked` (the workdays of that week inside the
window that the union of the person's bookings covers) and `overlapping` (the workdays of that
week inside the window that their overlaps cover), with fractions kept. It SHALL list the
readable undated and unschedulable projects that assign anyone, and every `engine_unavailable`
project.

#### Scenario: a double-booked week

- **GIVEN** Ana booked full-time on Monday to Friday of one week in both P and Q
- **WHEN** the organization's load is read for that week
- **THEN** Ana's week reads `booked: 5` and `overlapping: 5`

### Requirement: Load windows are bounded and validated

Both reads SHALL require `from` and `to` as ISO dates with `from <= to` and at most 182 days
between them. Anything else SHALL answer `400 invalid_query`.

#### Scenario: a year

- **WHEN** a load is read from 2026-01-01 to 2026-12-31
- **THEN** the answer is `400 invalid_query`

### Requirement: Load reads never name what the caller cannot open

Both reads SHALL resolve organization access first and carry the organization refusals.
Projects SHALL come only from the caller's own project list, through the same predicate the
project routes use. A project outside that list SHALL be omitted entirely: it is never listed,
counted, named or used in an overlap. A person outside the caller's directory SHALL answer
`404 not_found`, the same as an absent person. Any current member MAY read. Restricted projects
are readable by members (restriction gates writes), so they are listed.

#### Scenario: a foreign project booking the same id

- **GIVEN** organization B's project assigning a person, and a member of organization A
- **WHEN** the member reads the load of a person of A
- **THEN** no project of B appears, and no overlap names one

#### Scenario: a foreign person

- **WHEN** a member of A reads the load of a person of B
- **THEN** the answer is `404 not_found`

### Requirement: Bookings follow edits without a stale read

A process MAY memoize each project's bookings. The memo key SHALL include the project row's
revision, which commits with every edit to the project row, and the project's event sequence,
which advances when a plan edit, directory change, capacity change or optimized result is
announced after its commit. Under `shared`, the key SHALL also include the hash of the bookings
that fed the project. A read that begins after an edit to the project row has committed SHALL
reflect that edit. A read that begins after a plan edit has committed and been announced SHALL
reflect that edit. A reading whose engine is unavailable SHALL never be memoized.

#### Scenario: an estimate changes

- **GIVEN** Ana's load has been read once
- **WHEN** a command lengthens her slice in P, and her load is read again
- **THEN** the second read shows the longer booking

#### Scenario: the start date moves

- **GIVEN** Ana's load has been read once, with P starting on 2026-10-05
- **WHEN** P's start date is patched to 2026-10-12, and her load is read again
- **THEN** her booking in P starts on 2026-10-12

#### Scenario: the start date is cleared

- **GIVEN** Ana's load has been read once
- **WHEN** P's start date is patched to null, and her load is read again
- **THEN** P is listed as undated and books nothing

#### Scenario: an estimate rule changes

- **GIVEN** Ana's load has been read once
- **WHEN** P's PERT weights, dependency reach, estimate method or estimate rounding are patched
  so that her slice's length changes, and her load is read again
- **THEN** the second read shows the booking the plan's own read shows
