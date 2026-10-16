## ADDED Requirements

### Requirement: Configured authoritative DNS schedules retained proof checks

WBS SHALL start retained proof scheduling by default when authoritative DNS is explicitly configured, and SHALL leave it stopped when configuration is absent. An explicit enabled/disabled override SHALL be validated; enabled without configured resolvers SHALL reject before opening storage or the listener. It SHALL immediately process at most 32 due verified claims, then repeat after a fixed one-hour delay following each completed sweep. A process SHALL run at most one sweep at a time. The lookup and commit bound SHALL preserve validation of every verified claim before selecting due work; database reads are not bounded by this limit. Due claims SHALL be ordered by last check time and claim ID so completed checks yield to older due claims on later sweeps. Existing seven-day eligibility and fourteen-day suspension SHALL remain authoritative. Concurrent deployment colors MAY perform redundant lookups; transactional currentness SHALL reject stale results.

#### Scenario: Bounded startup and eventual progress

- **GIVEN** authoritative DNS is configured and 65 unchanged verified claims are due
- **WHEN** startup and two subsequent hourly sweeps complete
- **THEN** the sweeps check 32, 32 and 1 distinct claims respectively
- **AND** no process starts another sweep while its previous sweep is in flight

#### Scenario: Failed proof progress

- **GIVEN** 65 verified claims are due and every DNS response lacks the retained TXT proof during grace
- **WHEN** startup and two later hourly sweeps complete
- **THEN** the sweeps check 32, 32 and 1 distinct claims, without advancing last-success times or releasing ownership

#### Scenario: Malformed proof outside the batch

- **GIVEN** a verified claim outside the first 32 has missing trusted retained-proof state
- **WHEN** the worker reads due work
- **THEN** the full repository validation rejects before any lookup commits

#### Scenario: Absent authoritative DNS

- **GIVEN** authoritative DNS is not configured
- **WHEN** be-01 starts
- **THEN** no proof scheduling timer or lookup is started

### Requirement: Proof scheduling owns cancellation and failures

Shutdown SHALL cancel future scheduling and in-flight DNS work, join the sweep before closing its database, and prevent a cancelled lookup from recording a failed proof. Modeled DNS unavailability SHALL use existing warning and suspension persistence. Unexpected resolver or repository failures SHALL reject the worker completion promise. Boot SHALL latch such rejection and unexpected normal completion before a process observer can miss them. Both entrypoints SHALL share one supervisor that disposes once, joins all resources before exit, and exits 1 for a background or disposal failure even if a signal concurrently requested shutdown. Suspended claims SHALL remain recoverable through the existing manual verification path.

#### Scenario: Stop during lookup

- **GIVEN** a scheduled lookup is awaiting DNS
- **WHEN** the worker stops
- **THEN** its signal is aborted, the sweep joins, no proof completion is written, and no later sweep runs

#### Scenario: Unexpected failure

- **GIVEN** the resolver or repository throws an unexpected programming or cleanup failure
- **WHEN** a scheduled sweep executes
- **THEN** the completion promise rejects with that failure and no failed-proof completion masks it

#### Scenario: Cancellation while completion waits for a write turn

- **GIVEN** a day-fourteen proof completion is waiting for the database write turn
- **WHEN** the scheduler is cancelled before the completion transaction begins
- **THEN** the claim keeps its old check and success timestamps and verified status, and cancellation is returned without counting checked or stale work

#### Scenario: Immediate failure and concurrent signal

- **GIVEN** a worker failure is already latched or occurs while a signal is joining shutdown
- **WHEN** either process entrypoint supervises the running backend
- **THEN** disposal runs once, its completion is awaited, and the process exits 1

#### Scenario: Listener and schema admission fail

- **GIVEN** synchronous listener readiness or schema admission throws
- **WHEN** boot acquires the server
- **THEN** no proof worker starts and acquired storage and listener resources are released
