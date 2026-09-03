## ADDED Requirements

### Requirement: The optimization toggle gates computation, not display

When the project-wide optimization toggle is OFF, the application SHALL compute the Fast schedule only and SHALL cancel any in-flight solver work; it SHALL NOT start a new solver process. When ON, it SHALL publish the current Fast schedule immediately, SHALL consult the cache for the current input hash, and SHALL start solves only for the variants that are missing or stale — normally one Priority-first (PRI) and one Finish-first (Time) solve on a cold input, and none on a full hit. A variant holding a `status='failed'` row for that exact key SHALL NOT be restarted by a read; only an explicit Retry or a new input hash SHALL start it.

#### Scenario: OFF computes Fast only and cancels solver work

- **GIVEN** the optimization toggle is OFF while a solver run is in flight
- **WHEN** the toggle is flipped OFF
- **THEN** the in-flight solver process is terminated, no new process starts, and the Fast schedule remains the only visible schedule

#### Scenario: ON publishes Fast then starts both variants on a cold input

- **GIVEN** the optimization toggle is ON, a debounced edit fires, and the cache holds nothing for the resulting input hash
- **WHEN** the debounce elapses
- **THEN** the Fast schedule is published immediately and one PRI and one Time solve start for the same canonical input

### Requirement: Optimized results are cached against the exact scheduling input

Validated solver results SHALL be stored in a durable SQLite cache keyed by project, the exact scheduling-input hash, objective, and solver package version. A cache entry SHALL be valid only when its input hash equals the current hash and its solver version equals the installed version. A cache hit SHALL return the cached schedule directly to the requester.

#### Scenario: a cache hit returns without a solve

- **GIVEN** a validated PRI and Time pair is cached for the current input hash and objective
- **WHEN** a collaborator reads that project's schedule
- **THEN** the cached result is returned directly and no solver process starts

#### Scenario: a solver version bump invalidates the cache

- **GIVEN** a cached pair recorded with solverVersion v1 while the installed version is v2
- **WHEN** the schedule is read
- **THEN** the cached entry is treated as invalid and a fresh solve starts

### Requirement: schedule_optimized broadcasts only newly stored results

The coordinator SHALL emit one `schedule_optimized` event when a newly validated result is stored. A cache hit SHALL NOT emit the event.

#### Scenario: a newly stored result broadcasts once

- **GIVEN** a solve whose result validates and stores
- **WHEN** the result is stored
- **THEN** exactly one `schedule_optimized` event is emitted for that project

#### Scenario: a cache hit emits nothing

- **GIVEN** a cache hit on read
- **WHEN** a collaborator reads the schedule
- **THEN** no `schedule_optimized` event is emitted

### Requirement: The comparison indicator names the change against Fast

The compact indicator SHALL compare the selected optimized variant with the Fast schedule for the same exact input and SHALL report one of: Earlier by N days, Later by N days, Same deadline + reordered, or Same deadline + same order.

#### Scenario: the selected variant finishes earlier

- **GIVEN** an optimized variant that finishes earlier than Fast for the same input
- **WHEN** that variant is displayed
- **THEN** the indicator reads "Earlier by N days" with the exact day count

### Requirement: Failure keeps Fast usable and requires manual retry

When a solve exits non-zero, times out, is killed, or returns output that fails re-validation, the coordinator SHALL keep showing the Fast schedule, SHALL NOT publish a partial or unvalidated result, SHALL NOT retry on a timer, and SHALL surface a non-intrusive `Optimization unavailable · Retry` indicator. It SHALL record the failure as a `status='failed'` cache row on the same composite key carrying a `failureReason` and no `scheduleJson`. That row SHALL NOT satisfy a read, SHALL suppress an automatic re-spawn for that exact key, and SHALL NOT block an explicit Retry or the fresh generation a new input hash starts. The Retry action SHALL recheck the current input hash and launch only the failed or missing variant.

#### Scenario: a failed solve keeps Fast and offers Retry

- **GIVEN** a solve that times out
- **WHEN** the timeout is observed
- **THEN** the Fast schedule stays visible, a `status='failed'` row with the timeout reason is written, no schedule is published, and the indicator shows "Optimization unavailable · Retry" with no toast or modal

#### Scenario: a failed row never satisfies a read and never auto-restarts

- **GIVEN** a `status='failed'` row for the current input hash and objective
- **WHEN** that objective's schedule is read, repeatedly and by several collaborators
- **THEN** the row is not returned as a schedule, Fast stays visible, no solver process starts on any of those reads, and only an explicit Retry starts a fresh solve for the same key

### Requirement: Solver output is independently re-validated

Every solver response SHALL be a single well-formed JSON line and SHALL be independently re-validated in Bun: every offset present and non-negative, no dependency violated, no pool over capacity, and no assignee double-booked. A response that fails any check SHALL be treated as invalid-output (a failure).

#### Scenario: a malformed response is rejected

- **GIVEN** a solver output that is not one JSON line
- **WHEN** the coordinator reads it
- **THEN** the response is rejected as invalid-output and no result is stored

### Requirement: Resource ceilings cap solver concurrency

The coordinator SHALL cap solver processes at 4 per project and 16 globally. A valid generation SHALL normally use 2 (one PRI and one Time); remaining headroom SHALL cover only termination overlap or future variants, never stale publication. When the global cap is full, entries SHALL wait in a single global FIFO ordered by enqueue time with one entry per (project, objective). At dequeue the coordinator SHALL re-check both that the entry's input hash still matches its project's current hash and that the project's optimization toggle is still ON, and SHALL discard the entry without launching if either check fails.

#### Scenario: the per-project cap holds during overlap

- **GIVEN** a project cancelling its previous generation while launching the next
- **WHEN** overlap is at its maximum
- **THEN** no more than 4 solver processes for that project run at once

### Requirement: The solver receives every fact its objective depends on

The solver request SHALL be one JSON line carrying `objective`, `slices`, `edges`, `pools`, `baselineOffsets`, `budgetMs`, and `solverVersion`. `baselineOffsets` SHALL be the Fast schedule for the same canonical input and SHALL be the only movement reference either objective uses. The solver SHALL NOT read a clock, a database, or any other schedule.

#### Scenario: the movement term uses the passed baseline, not live state

- **GIVEN** two solves for the same input hash with different schedules already published
- **WHEN** each solve computes its movement term
- **THEN** both use the identical `baselineOffsets` derived from that input, so the input hash fully determines the objective

### Requirement: The solver budget is not a cache dimension

The solver budget SHALL be one configuration value `solverBudgetMs` defaulting to 60000, and the coordinator SHALL kill the child process at `solverBudgetMs + 5000`. `solverBudgetMs` SHALL be excluded from the input hash and SHALL NOT invalidate stored rows, because every stored row is an independently re-validated feasible schedule.

#### Scenario: changing the budget keeps stored results valid

- **GIVEN** a cached validated pair produced under a 60000 ms budget
- **WHEN** `solverBudgetMs` is changed and the schedule is read
- **THEN** the cached pair is still served and no solve starts

### Requirement: A coordinator restart resumes nothing and publishes nothing stale

On startup the coordinator SHALL NOT resume any generation and SHALL NOT rebuild a queue. Only the live coordinator that spawned a run SHALL write its result, so a process that dies mid-solve SHALL leave no row. Any orphaned solver child SHALL be killed on startup.

#### Scenario: a mid-solve restart leaves no partial result

- **GIVEN** a solve in flight
- **WHEN** the coordinator process is killed and restarted
- **THEN** no cache row exists for that run, no orphan solver child survives, and the next read starts a fresh generation

### Requirement: Selection changes broadcast on the project-settings channel

The optimization toggle, Engine, and Objective SHALL be project-scoped persisted settings. A change to any of them SHALL broadcast on the existing project-settings update channel and SHALL NOT emit `schedule_optimized`, which is reserved for newly stored solver results.

#### Scenario: switching Objective to a cached variant starts no solve

- **GIVEN** both PRI and Time are cached for the current input hash
- **WHEN** a collaborator switches Objective from Priority-first to Finish-first
- **THEN** the project-settings change broadcasts, no `schedule_optimized` is emitted, and no solver process starts

#### Scenario: a project that opted out while queued burns no slot

- **GIVEN** a queued entry for a project whose optimization toggle is switched OFF while it waits
- **WHEN** that entry reaches the front of the global FIFO
- **THEN** it is discarded without launching, even though its input hash still matches — the toggle is excluded from the hash, so the hash check alone would not catch it

### Requirement: A project keeps only its current generation's rows

Retention SHALL be one rule: a project keeps the `ok` and `failed` rows for its current input hash, and a new generation SHALL delete every older row for that project. Undoing an edit back to a previous input hash SHALL therefore be a cache miss that re-solves, with Fast visible throughout.

#### Scenario: a new generation evicts the previous one

- **GIVEN** a project with a stored PRI and Time pair for hash A
- **WHEN** an edit produces hash B and its generation stores a result
- **THEN** the hash-A rows are gone, and a later undo back to hash A misses the cache and starts a fresh generation while Fast stays visible
