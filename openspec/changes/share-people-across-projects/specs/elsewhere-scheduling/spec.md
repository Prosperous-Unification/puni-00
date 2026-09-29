## ADDED Requirements

### Requirement: Fast works around elsewhere intervals

`schedule()` SHALL accept `elsewhere`, a map from person id to sorted, disjoint intervals in
the project's own workday offsets. No slice of a person SHALL be placed across one of that
person's elsewhere intervals. A slice whose start was set by one SHALL read `boundBy:
'elsewhere'`, naming the holding project and work item. The number of work items holding such a
slice SHALL be reported as `waitingElsewhere`. With an empty map, placement SHALL be
byte-identical to the placement without the parameter.

#### Scenario: a foreign interval

- **GIVEN** Ana booked elsewhere on `[0, 3)`, and a two-day slice of Ana with no other floor
- **WHEN** the project is scheduled
- **THEN** the slice runs `[3, 5)` with `boundBy: 'elsewhere'`

#### Scenario: an empty map

- **WHEN** any corpus plan is scheduled with an empty `elsewhere` map
- **THEN** its schedule equals the schedule computed without the parameter, byte for byte

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
and schedule P last, in one read transaction. An influencer that reports `engine_unavailable`
SHALL make P's read report `engine_unavailable`, naming the influencer; it SHALL never fall back
to Fast silently. An undated project SHALL neither book nor see bookings.

#### Scenario: transitivity

- **GIVEN** A above B above C, where A and B share Ana and B and C share Ben
- **WHEN** C is read
- **THEN** B's bookings reflect A's, and C works around B's bookings of Ben
