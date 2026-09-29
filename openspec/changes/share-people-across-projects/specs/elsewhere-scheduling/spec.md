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
and the weighted (SS/FF) paths alike. Until solver wire 3, a non-empty map SHALL be refused
beside pinned (optimized) starts and by the solver request builder.

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
model SHALL add each interval as a fixed interval to that person's no-overlap constraint. Before
publication, Bun SHALL check person no-overlap against `elsewhere` and refuse a violating
result. Solver 0.2.0 SHALL refuse wire 2, and 0.1.4 SHALL refuse wire 3, each with a typed
refusal.

#### Scenario: a solver that ignores elsewhere

- **GIVEN** a model that drops the fixed intervals
- **WHEN** its result overlaps Ana's elsewhere interval
- **THEN** Bun refuses to publish it

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
within the organization, of projects that outrank P and share a person with P or with another
influencer. The read SHALL schedule the influencers in rank order with a running booking map,
and schedule P last. Each influencer SHALL be read as its own plan read displays it, without
queueing a solve for it. The reads are not one transaction: a commit to an influencer during
the chain is followed by `elsewhere_changed`, which re-reads P. An influencer that reports
`engine_unavailable` SHALL make P's read report `engine_unavailable`, naming the influencer; it
SHALL never fall back to Fast silently. An undated project SHALL neither book nor see bookings.
A command batch, a saved plan's capture and a restarted solve SHALL schedule P around the same
bookings as P's read.

#### Scenario: transitivity

- **GIVEN** A above B above C, where A and B share Ana and B and C share Ben
- **WHEN** C is read
- **THEN** B's bookings reflect A's, and C works around B's bookings of Ben
