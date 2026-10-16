## ADDED Requirements

### Requirement: Configured authoritative DNS schedules retained proof checks

WBS SHALL start retained proof scheduling only when authoritative DNS is explicitly configured. It SHALL immediately process at most 32 due verified claims, then repeat after a fixed one-hour delay following each completed sweep. A process SHALL run at most one sweep at a time. Due claims SHALL be ordered by last check time and claim ID so completed checks yield to older due claims on later sweeps. Existing seven-day eligibility and fourteen-day suspension SHALL remain authoritative. Concurrent deployment colors MAY perform redundant lookups; transactional currentness SHALL reject stale results.

#### Scenario: Bounded startup and eventual progress

- **GIVEN** authoritative DNS is configured and 65 unchanged verified claims are due
- **WHEN** startup and two subsequent hourly sweeps complete
- **THEN** the sweeps check 32, 32 and 1 distinct claims respectively
- **AND** no process starts another sweep while its previous sweep is in flight

#### Scenario: Absent authoritative DNS

- **GIVEN** authoritative DNS is not configured
- **WHEN** be-01 starts
- **THEN** no proof scheduling timer or lookup is started

### Requirement: Proof scheduling owns cancellation and failures

Shutdown SHALL cancel future scheduling and in-flight DNS work, join the sweep before closing its database, and prevent a cancelled lookup from recording a failed proof. Modeled DNS unavailability SHALL use existing warning and suspension persistence. Unexpected resolver or repository failures SHALL reject the worker completion promise. Suspended claims SHALL remain recoverable through the existing manual verification path.

#### Scenario: Stop during lookup

- **GIVEN** a scheduled lookup is awaiting DNS
- **WHEN** the worker stops
- **THEN** its signal is aborted, the sweep joins, no proof completion is written, and no later sweep runs

#### Scenario: Unexpected failure

- **GIVEN** the resolver or repository throws an unexpected programming or cleanup failure
- **WHEN** a scheduled sweep executes
- **THEN** the completion promise rejects with that failure and no failed-proof completion masks it
