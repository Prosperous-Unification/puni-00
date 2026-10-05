## ADDED Requirements

### Requirement: Fast works around elsewhere intervals

`schedule()` SHALL accept `elsewhere`, a map from person id to sorted, disjoint intervals in
the project's own workday offsets, each naming its holding project and work item, and SHALL
refuse a malformed map (an interval that is not finite, holds no time, or overlaps or precedes
the one before it). No slice of a person SHALL be placed across one of that person's intervals;
an interval that only touches a slice holds nothing. A slice whose start was set by one SHALL
read `boundBy: 'elsewhere'` and carry `elsewhereHolder`, present exactly then. A tie with a
plan's own floor SHALL name the plan's floor; a pool that pushed last SHALL be named
`capacity` with its blocking set. `waitingElsewhere` SHALL count the work items holding such a
slice, and SHALL be present exactly when the map is non-empty. With an empty or absent map,
placement and output SHALL be byte-identical to the placement without the parameter, in the FS
and the weighted (SS/FF) paths alike. Pinned optimized starts SHALL obey the original
workday bookings and SHALL be refused when they overlap a booking.

#### Scenario: a foreign interval

- **GIVEN** Ana booked elsewhere on `[0, 3)`, and a two-day slice of Ana with no other floor
- **WHEN** the project is scheduled
- **THEN** the slice runs `[3, 5)` with `boundBy: 'elsewhere'`

#### Scenario: an empty map

- **WHEN** any corpus plan is scheduled with an empty `elsewhere` map
- **THEN** its schedule equals the schedule computed without the parameter, byte for byte

#### Scenario: a pool that pushes last

- **GIVEN** Ana away on `[0, 2)` and her team's only slot held until day 4
- **WHEN** her one-day slice is scheduled
- **THEN** it starts on day 4 with `boundBy: 'capacity'` and the holder of the slot named

### Requirement: CP-SAT works around elsewhere intervals

Solver wire 3 SHALL carry `elsewhere` as `Record<personId, [startUnits, endUnits][]>`. The
wire SHALL round starts down and ends up, clip at zero, omit intervals ending at or before
zero, and union intervals overlapping after rounding per person while preserving adjacency.
The original holder-bearing workday bookings SHALL be retained for Fast and publication
diagnostics. The solver horizon SHALL extend past booking ends. The
model SHALL add each interval as a fixed interval to that person's no-overlap constraint. Before
publication, Bun SHALL check person no-overlap against `elsewhere` and refuse a violating
result. Solver 0.2.0 SHALL refuse wire 2, and 0.1.4 SHALL refuse wire 3, each with a typed
refusal.

#### Scenario: a solver that ignores elsewhere

- **GIVEN** a model that drops the fixed intervals
- **WHEN** its result overlaps Ana's elsewhere interval
- **THEN** Bun refuses to publish it

#### Scenario: outward quantization and clipping

- **GIVEN** Ana booked on `[-1, 0.01)`, `[0.015, 0.025)`, `[0.03, 0.04)` and `[2/48, 3/48)`
- **WHEN** a request is built with quantum 48
- **THEN** her wire intervals are `[0, 2)` and `[2, 3)`, while her original bookings retain their holders and fractions

### Requirement: The hash moves only when elsewhere does

`canonicalScheduleInput` SHALL include `elsewhere` (persons sorted, intervals sorted, each with
its holder) only when it is non-empty. A plan that nothing outranks SHALL keep its hash.
`SCHEDULER_CONTRACT_VERSION` SHALL be 15 and `CACHE_DTO_VERSION` 3. Rank SHALL NOT be hashed.

#### Scenario: a moved booking

- **GIVEN** P's optimized result is cached, and a project above P moves Ana's booking
- **WHEN** P is read
- **THEN** P's input hash differs and the cached result is not served

### Requirement: The chain reads influencers in rank order

Under `shared`, reading P SHALL first compute P's influencers. These are the transitive closure,
within the readable organization projects, following shared-person edges only toward higher
project ranks from P or from an already reached influencer. A lower-ranked neighbor of an
influencer that cannot displace it SHALL NOT join the closure. The read SHALL schedule the influencers in rank order with a running booking map,
and schedule P last, in one read transaction. An influencer that reports `engine_unavailable`
SHALL make P's read report `engine_unavailable`, naming the influencer; it SHALL never fall back
to Fast silently. An undated project SHALL neither book nor see bookings and SHALL stop influencer traversal.
An influencer with a dependency cycle or calendar-range error SHALL supply no bookings and SHALL
be recorded explicitly as unavailable with that reason. Before filtering out unassigned or
zero-duration slices, the selected displayed schedule's maximum work-item finish SHALL fit the
calendar range, using the same preflight as the live tree. This applies to both influencers and
the target, including schedules with no assigned slices. Unexpected failures SHALL throw.
Pending or failed optimization SHALL contribute the displayed Fast schedule; selected ready
optimization SHALL contribute its published schedule. Reads SHALL NOT allocate generations,
reserve solver slots, queue work or publish events. The chain SHALL return detached captured
values and schedules, and close its dedicated read connection on success, refusal and throw.

#### Scenario: transitivity

- **GIVEN** A above B above C, where A and B share Ana and B and C share Ben
- **WHEN** C is read
- **THEN** B's bookings reflect A's, and C works around B's bookings of Ben

#### Scenario: an undated bridge

- **GIVEN** dated A shares Ana with undated B, and B shares Ben with dated C below both
- **WHEN** C is read
- **THEN** B supplies no booking and does not cause A to be read as C's influencer

#### Scenario: an unavailable influencer

- **GIVEN** A outranks B and shares Ana, and A requires an unavailable optimized engine
- **WHEN** B is read
- **THEN** the chain returns `engine_unavailable` with A's identity and no unmarked target dates

#### Scenario: historical shared schedule

- **GIVEN** a shared chain is captured and its target schedule saved
- **WHEN** an influencer is edited or deleted
- **THEN** the saved target schedule bytes remain unchanged; target input alone is not a replay guarantee

#### Scenario: an unassigned work item exceeds the calendar

- **GIVEN** influencer A has an independent unassigned work item finishing at 80,000,000 workdays,
  and a lower target B shares an assigned person with A
- **WHEN** B is read, including when A's assigned work is on hold and its schedule has no assigned slices
- **THEN** A is listed as unavailable with `calendar_range`, A supplies no bookings and B starts at 0
