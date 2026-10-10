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
optimization SHALL contribute its published schedule. Chain derivation SHALL NOT allocate generations,
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

### Requirement: Runtime consumers use coherent mode-aware inputs

Shared live trees and exports SHALL derive input, displayed schedule, local labels, live revision
and sequence from the same authorized observation as their influencers. They SHALL preserve
`elsewhereHolder` and project `waitingElsewhere` when the schedule carries them. Isolated reads
SHALL retain their existing response shape and scheduler-input bytes. Arrange-by-schedule and
command calendar preflight SHALL use the command's existing transaction and see staged writes;
their borrowed readers SHALL NOT commit or close that transaction or admit solver work.

#### Scenario: a shared tree and export

- **GIVEN** A outranks B, both start on the same day and assign Ana, and A books `[0, 3)`
- **WHEN** B's one-day task is read through the live tree and exported without an intervening edit
- **THEN** both show B on `[3, 4)`, name A's holding work item and report `waitingElsewhere: 1`

#### Scenario: staged command input

- **GIVEN** a command transaction has changed B's assigned work or estimates without committing
- **WHEN** arrange-by-schedule or calendar preflight reads B under shared mode
- **THEN** it sees those staged values with the coherent influencer chain, and a later refusal
  rolls back the command without solver admission

### Requirement: Optimizer admissions rebuild the same shared input

Initial admission, edit debounce, queue rebuild and manual Retry SHALL obtain canonical input,
mode and optimization settings coherently. Background rebuilds SHALL resolve the project's current
organization and activation state without fabricating user access or defaulting absent scope to
legacy. Ordinary live admission SHALL occur after its chain read snapshot closes and SHALL NOT
replace that response's captured display. Shared saved/current capture SHALL remain non-admitting.
A queue capture refusal or exception before launch SHALL release its unlaunched reservation;
unexpected exceptions SHALL propagate after cleanup. Existing child terminal-evidence rules
SHALL remain unchanged.

#### Scenario: Retry after an upstream-only edit

- **GIVEN** B was read at hash H and an upstream edit changes only B's incoming bookings
- **WHEN** the caller retries B with H
- **THEN** Retry reports the existing stale-input-hash outcome with the current shared input hash
  and does not launch H

#### Scenario: a queued input becomes unavailable

- **GIVEN** a queue rebuild has reserved a slot and its required influencer is engine-unavailable
- **WHEN** the queued input is captured
- **THEN** no child starts, the unlaunched slot is released, and the modeled refusal remains
  distinct from missing input; an unexpected capture exception likewise releases before throwing

### Requirement: Retry reports unavailable schedule input without admission

Manual Retry SHALL capture current input and settings under the requesting human's admitted
scope in one observation, revalidating access there, and SHALL close that observation before
admission. Successful capture SHALL retain the existing stale-input-hash decision and the
transactional Retry authority recheck. Background project-owned authority SHALL NOT replace
human authority for Retry.

When a required engine is unavailable or the target has a cycle/calendar-range failure, Retry
SHALL return HTTP 409 with `code: 'schedule-input-unavailable'`, a `reason` of
`engine_unavailable`, `cycle` or `calendar_range`, and the failing readable `projectId`.
It SHALL NOT invent a current hash, report an idle variant, use local-only input, or write
cache, generation, slot, queue or event state. It SHALL NOT launch a child. Missing/foreign
projects and denied access SHALL retain their existing refusal semantics; unexpected failures
SHALL throw. The existing upstream cycle/calendar-range skip-bookings policy SHALL remain.

#### Scenario: a required influencer has no available engine during Retry

- **GIVEN** authorized B Retry and readable influencer A whose required engine is unavailable
- **WHEN** the coherent input capture cannot derive B's input
- **THEN** Retry returns 409 `schedule-input-unavailable`, `reason: 'engine_unavailable'`,
  `projectId: A`, with no fabricated hash, admission, durable state change or child launch

#### Scenario: the target cannot be scheduled during Retry

- **GIVEN** authorized B Retry whose captured target fails with cycle or calendar_range
- **WHEN** Retry captures B's current input
- **THEN** it returns 409 `schedule-input-unavailable` with that reason and `projectId: B`,
  without changing optimizer state or launching a child

#### Scenario: an upstream cycle does not become a target refusal

- **GIVEN** readable A outranks B and A has a cycle or calendar_range failure
- **WHEN** the chain can derive B after omitting A's unavailable bookings
- **THEN** Retry uses B's resulting shared input and existing hash/admission decisions,
  rather than treating A's cycle/range evidence as engine unavailability

#### Scenario: Retry loses human access before capture

- **GIVEN** the route admitted a human Retry but membership is revoked before snapshot capture
- **WHEN** the capture revalidates that human's access
- **THEN** Retry returns the existing access refusal, exposes no failing-project identity and
  writes no optimizer state; a later revocation before admission is still checked transactionally

### Requirement: Cached outcomes retain immutable input addresses

Publication SHALL continue validating against the admitted request and enforcing existing slot,
generation, cancellation and enablement fences. An eligible result for an earlier input SHALL
retain that input's cache address. Consumers SHALL derive their current shared input before the
exact input-hash, contract-version, budget and generation lookup. A detached current-chain
recheck SHALL NOT replace those fences or be treated as atomic publication evidence. Existing
outcome/event atomicity SHALL remain intact; downstream booking-change evidence belongs to the
separate durable fan-out transaction work.

#### Scenario: an earlier input finishes after its basis changes

- **GIVEN** a solve for B at H1 is running when A changes B's incoming bookings to H2
- **WHEN** the still-eligible H1 outcome is stored and B is subsequently read
- **THEN** the outcome remains addressed by H1 and B's H2 lookup never serves it, even if no
  downstream event has yet been delivered

### Requirement: Installed shared saved capture preserves historical display

The installed saved-plan service SHALL use the caller's scoped shared chain for both save and
current comparison. The module installer and composition root SHALL retain that capability.
Capture SHALL preserve the existing S4 pending, infeasible and unavailable policy and SHALL NOT
admit solver work. Saved schedule bytes SHALL remain independent of later influencer edits or
deletion; the target's saved input alone SHALL NOT be represented as replayable upstream history.

#### Scenario: a mounted shared save and current comparison

- **GIVEN** A outranks B and delays B's assigned task
- **WHEN** B is saved through the installed route, then A changes and B's current side is read
- **THEN** the saved bytes retain the original displaced schedule, current reflects the new
  chain, and neither capture allocates a generation, slot or queue entry

#### Scenario: a removed booking remains a representable comparison

- **GIVEN** B was saved while A's booking held B's assigned slice
- **WHEN** A's assignment is removed and B's saved plan is compared with current in either direction
- **THEN** the comparison answers with the displaced dates and holder difference; a missing
  side is JSON `null`, while actual zero, false and empty-string values remain those values
