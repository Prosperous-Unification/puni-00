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

Validated solver results SHALL be stored in a durable SQLite cache keyed by `(projectId, inputHash, objective, contractVersion, budgetMs)`. `contractVersion` SHALL combine the domain scheduler's `SCHEDULER_CONTRACT_VERSION` with the solver package version, because durations, the leaf expansion and `baselineOffsets` are produced by domain code the package version does not describe. A cache entry SHALL be valid only when every key column matches the current state and its generation is still the project's current generation. A cache hit SHALL return the cached schedule directly to the requester.

#### Scenario: a cache hit returns without a solve

- **GIVEN** a validated PRI and Time pair is cached for the current input hash and objective
- **WHEN** a collaborator reads that project's schedule
- **THEN** the cached result is returned directly and no solver process starts

#### Scenario: a contract version bump invalidates the cache

- **GIVEN** a cached pair recorded under contractVersion `3+v1` while the running contract is `4+v1` — the domain scheduler changed, the Python package did not
- **WHEN** the schedule is read
- **THEN** the cached entry is treated as invalid and a fresh solve starts, because a `solverVersion`-only key would have matched

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

The coordinator SHALL cap solver processes at 4 per project and 16 globally. A valid generation SHALL normally use 2 (one PRI and one Time); remaining headroom SHALL cover only termination overlap or future variants, never stale publication — stale publication is prevented by the generation check, not by the slot count. When the global cap is full, entries SHALL wait in a FIFO holding at most one entry per (project, objective) and ordered by `enqueuedAt`, then `projectId`, then `objective` — the last term is required for a total order, because a project's PRI and Time entries can share a timestamp. At dequeue the coordinator SHALL re-check both that the entry's generation is still its project's current generation and that the project's optimization toggle is still ON, and SHALL discard the entry without launching if either check fails. Enforcement scope is defined by the cross-process requirement below.

#### Scenario: the per-project cap holds during overlap

- **GIVEN** a project cancelling its previous generation while launching the next
- **WHEN** overlap is at its maximum
- **THEN** no more than 4 solver processes for that project run at once

### Requirement: The solver receives every fact its objective depends on

The solver request SHALL be one JSON line carrying `contractVersion`, `solverVersion`, `objective`, `budgetMs`, `horizonDays`, `slices`, `edges`, `pools`, and `baselineOffsets`. Each slice SHALL carry its `sliceKey`, an integer `durationDays`, `width`, `personId`, set-valued `poolIds`, a resolved `priorityWeight`, and a resolved `notBeforeDays`. `edges` SHALL already be leaf-expanded with the project's dependency reach applied and SHALL already include the intra-work-item step-order edges, so the solver never receives the tree, `parentId`, or `dep_reach`. `baselineOffsets` SHALL be the Fast schedule for the same canonical input and SHALL be the only movement reference either objective uses. The solver SHALL NOT read a clock, a database, or any other schedule, and SHALL NOT derive a duration, a priority, or a floor.

#### Scenario: the movement term uses the passed baseline, not live state

- **GIVEN** two solves for the same input hash with different schedules already published
- **WHEN** each solve computes its movement term
- **THEN** both use the identical `baselineOffsets` derived from that input, so the input hash fully determines the objective

### Requirement: The solver budget is a cache key dimension

The solver budget SHALL be one configuration value `solverBudgetMs` defaulting to 60000, and the coordinator SHALL kill the child process at `solverBudgetMs + 5000`. `solverBudgetMs` SHALL be excluded from the input hash and SHALL be a column of the cache key, because a larger budget can find a better feasible result. The cached promise SHALL be "the best result found for this input, this contract, this objective, at this budget".

#### Scenario: raising the budget re-solves rather than serving the smaller-budget result

- **GIVEN** a cached validated pair produced under a 60000 ms budget
- **WHEN** `solverBudgetMs` is raised to 300000 and the schedule is read
- **THEN** the read misses, both variants are admitted under the new budget, and the 60000 ms rows are not served

### Requirement: A coordinator restart resumes nothing and publishes nothing stale

On startup the coordinator SHALL NOT resume any generation and SHALL NOT rebuild a queue. A result SHALL be written only by a transaction whose generation is still the project's current generation, so a process that dies mid-solve SHALL leave no row. Orphaned solver children SHALL NOT be identified by a stored PID: `wbs-solver` SHALL call `prctl(PR_SET_PDEATHSIG, SIGKILL)` before reading stdin so a reparented child terminates itself, `solver_slot` rows SHALL be reclaimed by heartbeat expiry rather than process probing, and each backend release SHALL run in its own container or cgroup.

#### Scenario: a mid-solve restart leaves no partial result

- **GIVEN** a solve in flight
- **WHEN** the coordinator process is killed and restarted
- **THEN** no cache row exists for that run, the solver child has terminated itself, its slot expires, and the next read starts a fresh generation

### Requirement: The toggle, Engine and Objective are persisted project settings

The optimization toggle, Engine, and Objective SHALL be columns on the `project` row — `optimization_enabled` defaulting to false, `schedule_engine` defaulting to `'fast'`, `schedule_objective` defaulting to `'pri'` — readable in the project payload and writable only through a PATCH under the existing project-write authorization. A change to any of them SHALL emit a `project_settings_changed` event and SHALL NOT emit `schedule_optimized`, which is reserved for newly stored solver results.

#### Scenario: an unmigrated project reads OFF

- **GIVEN** a project row that existed before the migration
- **WHEN** the project is read after the migration runs
- **THEN** `optimization_enabled` is false, `schedule_engine` is `fast`, and `schedule_objective` is `pri`, with no backfill required

#### Scenario: a reader cannot change a project setting

- **GIVEN** a collaborator with read-only access to the project
- **WHEN** they PATCH `schedule_engine`
- **THEN** the request is refused and no event is emitted

#### Scenario: switching Objective to a cached variant starts no solve

- **GIVEN** both PRI and Time are cached for the current input hash
- **WHEN** a collaborator switches Objective from Priority-first to Finish-first
- **THEN** `project_settings_changed` broadcasts, no `schedule_optimized` is emitted, and no solver process starts

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

### Requirement: The canonical input is the exact argument tuple of the Fast pass

The input hash SHALL be the SHA-256 of a canonical JSON built from every argument `schedule(rows, edges, slices, notBefore, poolSizes, reach)` receives and from nothing else. It SHALL include each row's `id`, `parentId`, `position`, `frozenNumber` and as-written `priority`; the authored dependency edges; the `slices` array **in its given order**, because that order is intra-work-item step precedence, with each slice's `workItemId`, `stepId`, `days` (null distinct from zero), `personId`, `width` and set-valued `poolIds`; the `notBefore` floors as whole days from day zero; the pool sizes; and the project's `dep_reach`. Engine, Objective, the toggle, the display variant, the clock, the acting user and the request sequence SHALL be excluded.

#### Scenario: a dependency-reach change is a different input

- **GIVEN** a cached pair for a project whose `dep_reach` is `whole-item`
- **WHEN** `dep_reach` is changed to `anchor-slice` and the schedule is read
- **THEN** the hash differs, the read misses, and a new generation is admitted

#### Scenario: reordering two slices of one work item is a different input

- **GIVEN** a work item whose two slices are ordered design-then-build
- **WHEN** the order becomes build-then-design and the schedule is read
- **THEN** the hash differs and the read misses, because that order is step precedence

### Requirement: The objectives are defined as executable mathematics

PRI SHALL minimize `(PRIORITY, MAKESPAN, MOVEMENT)` lexicographically and Time SHALL minimize `(MAKESPAN, PRIORITY, MOVEMENT)`, where `MAKESPAN` is the maximum slice finish in whole workdays, `PRIORITY` is `Σ w(s)·finish(s)` with `w(s) = (P_max + 1) − p(s)` over the leaf priority resolved by the nearest-ancestor floor rule and `w(s) = 0` for an unprioritised leaf, and `MOVEMENT` is `Σ |start(s) − baselineStart(s)|`. The lexicographic order SHALL be implemented as staged optimization rather than a weighted sum. Neither ordering SHALL be claimed to be a total order, and production SHALL NOT be required to break ties reproducibly.

#### Scenario: the two objectives differ only in term precedence

- **GIVEN** one canonical input with at least one prioritised leaf and a resource conflict
- **WHEN** PRI and Time are both solved
- **THEN** both are feasible against the same graph, PRI's `PRIORITY` is no worse than Time's, and Time's `MAKESPAN` is no worse than PRI's

### Requirement: Time is expressed in whole workdays computed by the caller

Every duration crossing the solver boundary SHALL be an integer count of workdays computed by Bun exactly as the Fast pass computes it — `ASSUMED_SLICE_WORKDAYS` substituted for a null `days`, divided by `width`, then snapped by `snapWorkdays`. The solver SHALL NOT receive fractional effort and SHALL NOT derive a duration.

#### Scenario: an unestimated slice crosses the boundary as its assumed duration

- **GIVEN** a slice whose `days` is null and whose `width` is 1
- **WHEN** the solver request is built
- **THEN** its `durationDays` is `ASSUMED_SLICE_WORKDAYS`, and the request contains no null and no fraction

### Requirement: A stale generation can neither publish nor evict

Each project SHALL carry a monotonic `optimizationGeneration`, allocated in the same transaction that deletes the previous generation's rows. Every spawn SHALL carry its generation and every write SHALL be conditional on that generation still being the project's current one.

#### Scenario: an undo back to a previous hash does not revive its old run

- **GIVEN** a run in flight for hash A, an edit to hash B that cancels it, and an undo back to hash A
- **WHEN** the original hash-A child returns a valid result
- **THEN** its write is rejected, no rows are deleted, no `ok` row is overwritten, and no event is emitted, even though the current hash is again A

### Requirement: Resource ceilings are enforced across processes

The per-project ceiling of 4 and the global ceiling of 16 SHALL be enforced by a SQLite admission transaction over a `solver_slot` table, not by coordinator memory, so that co-existing backend releases share one budget. Slots SHALL be reclaimed by heartbeat expiry. Waiting entries SHALL be ordered by `enqueuedAt`, then `projectId`, then `objective`, at most one per `(project, objective)`, and SHALL be discarded at dequeue if their generation is no longer current or the project's toggle is no longer ON.

#### Scenario: two coordinators share one global budget

- **GIVEN** a blue and a green backend process against the same database file
- **WHEN** both admit solver work until refused
- **THEN** at most 16 solver children run between them, and at most 4 for any one project

#### Scenario: two concurrent first reads start one solve per objective

- **GIVEN** no cached row for a project and two simultaneous reads
- **WHEN** both request admission
- **THEN** exactly one PRI child and one Time child are started, and the losing read waits for the event

### Requirement: A newly stored result and its event commit together

The cache row and a durable `event_log` record SHALL be written in one SQLite transaction, and the broadcaster SHALL push from the committed record. The guarantee SHALL be exactly one durable event record per newly stored result, delivered at least once, with the payload `(projectId, generation, inputHash, objective, contractVersion)` so a duplicate delivery is idempotent.

#### Scenario: a crash between the row and the event leaves neither

- **GIVEN** a validated solver result
- **WHEN** the process dies after the cache write but before the transaction commits
- **THEN** no cache row and no event record exist, and the next read starts a fresh solve

### Requirement: The solver is a versioned package behind one entrypoint

The solver SHALL ship as its own version-pinned Python package exposing exactly one stdin/stdout entrypoint, invoked as a short-lived child process. There SHALL be no import from Bun, no daemon, no listening port, and no sidecar.

#### Scenario: the coordinator invokes the solver only as a child process

- **GIVEN** a solver run
- **WHEN** the coordinator starts it
- **THEN** it spawns the package entrypoint, writes one JSON line to stdin, reads one JSON line from stdout, and the process exits

### Requirement: A pending optimized variant keeps Fast on screen

While Engine is Optimized and the selected variant has neither a stored result nor a failure marker, the UI SHALL display the Fast schedule under an `Optimizing…` indicator, and SHALL NOT show a blank schedule, a spinner over the plan, or a stale variant.

#### Scenario: the selected variant is still solving

- **GIVEN** Engine is Optimized, Objective is Priority-first, and PRI is admitted but not stored
- **WHEN** the schedule is read
- **THEN** Fast offsets are returned with an `Optimizing…` indicator

### Requirement: An optimized result is materialised into the full schedule contract

The solver response SHALL carry only `{ status, offsets, objectiveValues }`, and the system SHALL NOT persist or return that offsets map as a schedule. Before storage the system SHALL materialise a complete `Schedule` from the offsets and the canonical input, using the Fast annotation pass with the optimized starts pinned, so that every `ScheduledSlice` field the read payload exposes — duration, estimate state, earliest and latest times, float, critical, `boundBy`, `resourcePredecessorId`, `capacityPredecessorIds`, `capacityTeamId`, `width`, `effort` — and both wait counters and the work-item projections are produced by the same code path that produces them for Fast, with resource edges and late times derived from the optimized placement. A start that is strictly later than every floor of its slice SHALL be reported as the added `ScheduleFloor` member `optimizer`, and such a slice SHALL carry a null `resourcePredecessorId`, an empty `capacityPredecessorIds` and a null `capacityTeamId`.

#### Scenario: a deliberately idled slice is named rather than misattributed

- **GIVEN** a PRI solve that idles a low-priority slice past every one of its floors so a high-priority slice can run first
- **WHEN** the result is materialised and read through the plan payload
- **THEN** that slice reports `boundBy: 'optimizer'`, a null `resourcePredecessorId`, an empty `capacityPredecessorIds` and a null `capacityTeamId`, and no other slice's floor is reported as `optimizer`

#### Scenario: the materialised schedule is field-complete on the real read path

- **GIVEN** a stored optimized variant for a project whose plan uses assignees, sized teams and a manual floor
- **WHEN** the plan is read with Engine Optimized
- **THEN** every field the same read returns for Fast is present and non-placeholder, and float, critical, earliest and latest are recomputed against the optimized starts rather than copied from Fast

### Requirement: Solver time is exchanged in fixed-point workday units

The system SHALL NOT send whole-day integers to the solver. It SHALL compute each slice's duration exactly as Fast computes it — `ASSUMED_SLICE_WORKDAYS` when `days` is null, without dividing by width, and `days / width` otherwise, preserving genuine fractions — and SHALL express durations, manual floors, the horizon and every returned offset in integer multiples of `1 / SOLVER_QUANTUM` workdays. A duration that is not an exact multiple SHALL be rounded up to the next unit, never down. The system SHALL reject a plan whose horizon in units exceeds the solver's integer bound with failure reason `horizon-overflow` rather than spawning a process, and the re-validator SHALL reject any offset that is not a non-negative integer unit within the horizon.

#### Scenario: a width-two one-day slice keeps its half day

- **GIVEN** a slice with `days = 1` and `width = 2`
- **WHEN** the solver request is built
- **THEN** its duration is sent as `SOLVER_QUANTUM / 2` units and the materialised schedule reports `duration` 0.5, matching Fast for the same input

#### Scenario: an unestimated wide slice is not divided

- **GIVEN** a slice with `days = null` and `width = 3`
- **WHEN** the solver request is built
- **THEN** its duration is `ASSUMED_SLICE_WORKDAYS × SOLVER_QUANTUM` units, not one third of it

### Requirement: The staged objective is an anytime algorithm with stated stage outcomes

Staged lexicographic optimization SHALL divide `budgetMs` across its three terms by the exported `STAGE_BUDGET_SPLIT`, donating an early stage's remainder to the next. A stage proved OPTIMAL SHALL fix its term as an equality; a stage ending FEASIBLE, or UNKNOWN with an incumbent, SHALL constrain its term by the inequality `term <= incumbent` and SHALL NOT fix an equality; a stage ending UNKNOWN with no incumbent SHALL stop staging and publish nothing with reason `no-solution`; INFEASIBLE at the first stage SHALL be reported as `invalid-output`. The published result SHALL be the incumbent of the last stage that produced one, and a partially staged result SHALL be cacheable. `objectiveValues` SHALL report `{ value, bound, status }` per term. The system SHALL NOT require either variant's objective value to beat the other variant's; it SHALL require each variant's own primary term to be no worse than the Fast baseline's value for that term, achieved by supplying Fast's placement as both a solution hint and an upper bound on the first stage.

#### Scenario: the first stage exhausts the budget without proof

- **GIVEN** a PRI solve whose priority stage ends FEASIBLE with incumbent `v` after consuming its whole stage budget
- **WHEN** the makespan stage runs
- **THEN** the model carries `PRIORITY <= v` rather than `PRIORITY = v`, and the published result is the last incumbent found

#### Scenario: a run that cannot beat Fast still publishes

- **GIVEN** an input where CP-SAT finds no placement better than Fast's on the selected primary term within the budget
- **WHEN** the run ends
- **THEN** Fast's own value is published as the variant result and the variant is not marked failed

### Requirement: A generation records the input hash it was allocated for

The project row SHALL store `optimization_input_hash` beside `optimization_generation`. Allocation SHALL be one transaction that reads both, reuses the generation when the stored hash equals the computed hash, and otherwise sets the hash and increments the generation under a compare-and-swap on the generation it read, deleting the previous generation's cache, slot and queue rows in the same transaction. Two processes computing the same hash concurrently SHALL NOT allocate two generations, and a process computing a different hash SHALL NOT coalesce onto the current generation's slot.

#### Scenario: two backends cold-read the same plan at once

- **GIVEN** blue and green both compute hash H for a project whose stored hash is H0
- **WHEN** both attempt allocation
- **THEN** exactly one increments the generation and stores H, the other observes H and reuses the same generation, and one PRI child and one Time child exist in total

#### Scenario: a restart on an unchanged plan reuses its generation

- **GIVEN** a backend restarts while the project's stored hash still equals the computed hash
- **WHEN** the plan is read
- **THEN** no new generation is allocated and the existing cache rows remain valid

### Requirement: A failed variant reaches a client already on screen

A newly written failure marker SHALL emit a `schedule_optimization_failed` project event in the same transaction that writes the row, carrying `(projectId, generation, inputHash, objective, contractVersion, budgetMs, failureReason)` and no schedule. A client displaying that variant SHALL move to the `Optimization unavailable · Retry` indicator on receiving it, without a manual refresh and without refetching the variant. A cache hit SHALL still emit nothing.

#### Scenario: both variants fail and Retry still appears

- **GIVEN** a client viewing Engine Optimized while both PRI and Time solves are in flight
- **WHEN** both fail and no other event occurs
- **THEN** the client shows `Optimization unavailable · Retry` for the selected variant without any refresh or poll

### Requirement: Result events name every cache-key dimension

Both `schedule_optimized` and `schedule_optimization_failed` SHALL carry `budgetMs` in their identity, so a receiver can tell which cached row an event names. The system SHALL guarantee one durable `event_log` record per newly stored outcome plus one best-effort post-commit push, and SHALL NOT claim delivery over a live socket. The record SHALL be written inside the same transaction as its cache row through a transaction-taking repository call, and pushed afterwards without being recorded twice.

#### Scenario: raising the budget notifies a client holding the old result

- **GIVEN** a client holding the stored result for generation G at budget 60000
- **WHEN** the budget is raised to 120000 and a new result is stored for the same hash and generation
- **THEN** the event's identity differs by `budgetMs` and the client refetches rather than ignoring it as a duplicate

#### Scenario: the process dies between commit and push

- **GIVEN** a stored result whose transaction has committed
- **WHEN** the process exits before the websocket push
- **THEN** the `event_log` record exists and a client resuming from its last sequence receives it

### Requirement: The canonical slice order is stable across reads and processes

Canonicalization SHALL group slices by work item, order the groups by work-item id, and preserve each group's own order as given, because only the intra-item order carries step precedence. `WorkItemRepo.listByProject` SHALL order work items by id, so the argument tuple handed to Fast does not vary between reads of an unchanged project.

#### Scenario: an unchanged project hashes identically across adapter reads

- **GIVEN** a stored project read twice through the production repository and service path
- **WHEN** the two canonical inputs are hashed
- **THEN** the hashes are equal even if the underlying row order differs

### Requirement: Every new stored enum is validated at the read boundary

The migrations SHALL declare a `CHECK` for each new stored enum and for the new boolean column, and the repository read paths SHALL validate `status`, `objective`, `failureReason`, `schedule_engine` and `schedule_objective` explicitly, throwing an error naming the column and the stored value on an unknown one, as `toProject` already does for `estimateMethod`, `depReach` and `estimateRounding`. The system SHALL NOT cast or default an unknown stored enum.

#### Scenario: an unknown failure reason is refused rather than defaulted

- **GIVEN** a cache row whose `failure_reason` holds a value outside the defined set
- **WHEN** the row is read on the production path
- **THEN** the read throws naming the column and the value, and no variant state is inferred from it

### Requirement: The solver package is installed in the deployed image

The build SHALL install the pinned Python runtime and the locked OR-Tools environment into the be-01 image, copy the `wbs-solver` package and entrypoint into that runtime, and expose the installed package version to the coordinator as the `solverVersion` half of `contractVersion`. The Python suite SHALL have its own build target wired into the gate.

#### Scenario: a spawn from the built image succeeds and its absence is proved to fail

- **GIVEN** the built be-01 image
- **WHEN** the coordinator spawns the solver entrypoint
- **THEN** it returns a valid response line, and an image built without the package makes the same spawn fail with `internal-error` rather than silently returning Fast

### Requirement: The comparison indicator names the change by an exact order relation

Two schedules SHALL be reported as the same order iff, for every pair of slices present in both, the sign of the difference between their starts is equal in both, compared in quantised units on the materialised schedules. The relation SHALL be computed server-side and shipped as one boolean beside the day-count delta.

#### Scenario: a uniform shift is not a reorder

- **GIVEN** an optimized schedule whose every slice starts exactly two workdays later than Fast's
- **THEN** the indicator reports the same order and a later deadline

#### Scenario: a broken tie is a reorder

- **GIVEN** two slices that start on the same day under Fast and on different days under the optimized result
- **THEN** the indicator reports reordered
