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

The coordinator SHALL emit one `schedule_optimized` event when a newly validated result is stored, carrying the full cache-key identity `(projectId, generation, inputHash, objective, contractVersion, budgetMs)`. A cache hit SHALL NOT emit the event. The guarantee SHALL be one durable `event_log` record per newly stored outcome plus one best-effort post-commit push, stated identically here and in every other normative location; the system SHALL NOT claim delivery over a live socket, because `event_log` is a replay buffer rather than a dispatched-and-acknowledged outbox.

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

When a solve exits non-zero, times out, is killed, or returns output that fails re-validation, the coordinator SHALL keep showing the Fast schedule, SHALL NOT publish a partial or unvalidated result, SHALL NOT retry on a timer, and SHALL surface a non-intrusive `Optimization unavailable · Retry` indicator. It SHALL record the failure as a `status='failed'` cache row on the same composite key carrying a `failureReason` drawn from `timeout | invalid-output | no-solution | internal-error | oom | horizon-overflow | objective-overflow` and no `scheduleJson`. The two pre-spawn reasons SHALL write that row and emit the failure event exactly as a spawned failure does, so a client already on screen and a freshly loaded one both reach Retry although no process ever started. That row SHALL NOT satisfy a read, SHALL suppress an automatic re-spawn for that exact key, and SHALL NOT block an explicit Retry or the fresh generation a new input hash starts. The Retry action SHALL recheck the current input hash and launch only the failed or missing variant.

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

The coordinator SHALL cap solver processes at 4 per project and 16 globally. A valid generation SHALL normally use 2 (one PRI and one Time); remaining headroom SHALL cover only termination overlap or future variants, never stale publication — stale publication is prevented by the generation check, not by the slot count. When the global cap is full, entries SHALL wait in a FIFO holding at most one entry per `(projectId, contractVersion, objective)` and ordered by `enqueuedAt`, then `projectId`, then `contractVersion`, then `objective` — the last two terms are required for a total order, because a project's PRI and Time entries can share a timestamp and two co-existing releases can enqueue the same project and objective in that same millisecond. Each entry SHALL persist the cancel epoch it was admitted under. At dequeue the coordinator SHALL re-check that the entry's generation is still current for its contract version, that the current cancel epoch equals the admitted one, and that the project's optimization toggle is still ON, and SHALL discard the entry without launching if any check fails. Enforcement scope is defined by the cross-process requirement below.

#### Scenario: the per-project cap holds during overlap

- **GIVEN** a project cancelling its previous generation while launching the next
- **WHEN** overlap is at its maximum
- **THEN** no more than 4 solver processes for that project run at once

### Requirement: The solver wire contract is one versioned schema every consumer reads

The request and the response SHALL be defined by one checked-in JSON Schema, `libs/contracts/solver/solver-wire.v1.json`, and prose SHALL NOT be a second definition. Exactly four consumers SHALL read that file: the Bun request builder, `parseSolverResponse`, the `wbs-solver` Python entrypoint, and a shared golden-fixture corpus both suites run. Every message SHALL carry the required literal `wireVersion`, and the schema SHALL state the unit of every numeric field. The request SHALL be one JSON line carrying `wireVersion`, `contractVersion`, `solverVersion`, `objective`, `budgetMs`, `stageBudgetSplit`, `quantum`, `horizonUnits`, `slices`, `edges`, `pools`, `baselineOffsets` and `fastHint`. Each slice SHALL carry its `sliceKey`, an integer `durationUnits`, `width`, `personId`, set-valued `poolIds`, a resolved `priorityWeight`, and a resolved `notBeforeUnits`. `edges` SHALL already be leaf-expanded with the project's dependency reach applied and SHALL already include the intra-work-item step-order edges, so the solver never receives the tree, `parentId`, or `dep_reach`. `baselineOffsets` SHALL be the Fast schedule for the same canonical input and SHALL be the only movement reference either objective uses. The solver SHALL NOT read a clock, a database, or any other schedule, and SHALL NOT derive a duration, a priority, or a floor.

#### Scenario: a consumer that diverges from the schema fails the gate

- **GIVEN** the checked-in wire schema and its golden fixture corpus
- **WHEN** any one of the request builder, the response parser, the Python entrypoint or the generated TypeScript types accepts a message the schema rejects, or rejects one it accepts
- **THEN** the contract test fails, so no consumer can carry a private variant of the request

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

On startup the coordinator SHALL NOT resume any generation and SHALL NOT rebuild a queue. A result SHALL be written only by a transaction whose generation is still the project's current generation, so a process that dies mid-solve SHALL leave no row. Orphaned solver children SHALL NOT be identified by a stored PID: `wbs-solver` SHALL call `prctl(PR_SET_PDEATHSIG, SIGKILL)` before reading stdin and SHALL then re-read its parent process id, exiting immediately if the parent already died in that window, and SHALL arm its own hard deadline at `budgetMs + 5000` so termination never depends on its coordinator being alive; `solver_slot` rows SHALL be reclaimed by heartbeat expiry rather than process probing, and each backend release SHALL run in its own container or cgroup.

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

Retention SHALL be two rules, because generation changes only when `inputHash` changes and a budget or contract-version change therefore inserts a different composite-key row inside the same generation. First, allocating a new generation SHALL delete every cache row of that project for that contract version. Second, when a new outcome commits, the same transaction SHALL delete every other row for `(projectId, objective, contractVersion)` whose `(inputHash, budgetMs)` differs. Reads are keyed by the current budget, so nothing readable is lost. The resulting bound SHALL be stated as at most two rows per project per live contract version, with live contract versions bounded by the 30-day retirement rule. Undoing an edit back to a previous input hash SHALL be a cache miss that re-solves, with Fast visible throughout.

#### Scenario: repeated budget changes stay bounded

- **GIVEN** a project whose `solverBudgetMs` is raised three times and whose contract version is then bumped, with no plan edit
- **WHEN** each new result commits
- **THEN** each superseded budget row is deleted by the committing transaction and at most two rows per live contract version remain for that project

#### Scenario: a new generation evicts the previous one

- **GIVEN** a project with a stored PRI and Time pair for hash A
- **WHEN** an edit produces hash B and its generation stores a result
- **THEN** the hash-A rows are gone, and a later undo back to hash A misses the cache and starts a fresh generation while Fast stays visible

### Requirement: The canonical input is the exact argument tuple of the Fast pass

The input hash SHALL be the SHA-256 of a canonical JSON built from every argument `schedule(rows, edges, slices, notBefore, poolSizes, reach)` receives and from nothing else. It SHALL include each row's `id`, `parentId`, `position`, `frozenNumber` and as-written `priority`; the authored dependency edges; the `slices` array **grouped by work item, groups ordered by `workItemId`, each group's own order preserved as given** — only that intra-item order is step precedence, and the order between groups is whatever SQL returned — with each slice's `workItemId`, `stepId`, `days` (null distinct from zero), `personId`, `width` and set-valued `poolIds`; the `notBefore` floors as whole days from day zero (quantised only at the solver boundary); the pool sizes; and the project's `dep_reach`. Engine, Objective, the toggle, the display variant, the clock, the acting user and the request sequence SHALL be excluded.

#### Scenario: a dependency-reach change is a different input

- **GIVEN** a cached pair for a project whose `dep_reach` is `whole-item`
- **WHEN** `dep_reach` is changed to `anchor-slice` and the schedule is read
- **THEN** the hash differs, the read misses, and a new generation is admitted

#### Scenario: reordering two slices of one work item is a different input

- **GIVEN** a work item whose two slices are ordered design-then-build
- **WHEN** the order becomes build-then-design and the schedule is read
- **THEN** the hash differs and the read misses, because that order is step precedence

### Requirement: The objectives are defined as executable mathematics

PRI SHALL minimize `(PRIORITY, MAKESPAN, MOVEMENT)` lexicographically and Time SHALL minimize `(MAKESPAN, PRIORITY, MOVEMENT)`, where `MAKESPAN` is the maximum slice finish in quantised workday units, `PRIORITY` is `Σ w(s)·finish(s)` where `w(s)` is the **dense rank** of the leaf priority resolved by the nearest-ancestor floor rule — `w(s) = (R + 1) − rank(p(s))` over the `R` distinct priorities present in the canonical input, and `w(s) = 0` for an unprioritised leaf. The absolute priority SHALL NOT be used as a weight: the API accepts any safe integer priority with no ceiling, so `P_max + 1` loses integer precision at `Number.MAX_SAFE_INTEGER` and the weighted sum overflows CP-SAT's signed 64-bit linear expressions on legal data. The request builder SHALL compute the exact worst case `Σ w(s) × horizonUnits` before spawning and SHALL fail with reason `objective-overflow` when it exceeds `2^62`. When no leaf carries a priority, every weight SHALL be zero, so `PRIORITY` is identically zero and PRI degenerates to Time; and `MOVEMENT` is `Σ |start(s) − baselineStart(s)|`. The lexicographic order SHALL be implemented as staged optimization rather than a weighted sum. Neither ordering SHALL be claimed to be a total order, and production SHALL NOT be required to break ties reproducibly.

#### Scenario: unbounded priorities do not overflow the solver

- **GIVEN** a project whose leaf priorities include `Number.MAX_SAFE_INTEGER` and whose slice count and horizon are at the boundary
- **WHEN** the priority term is built
- **THEN** the weights are dense ranks bounded by the number of distinct priorities, the checked worst-case sum stays under `2^62`, and a plan that would exceed it fails with `objective-overflow` before any process starts

#### Scenario: a plan with no priorities is well defined

- **GIVEN** a project where no leaf and no ancestor carries a priority
- **WHEN** PRI is solved
- **THEN** every weight is zero, `PRIORITY` is zero for every placement, and PRI returns a Time-equivalent result rather than an undefined `P_max`

#### Scenario: the two objectives differ only in term precedence

- **GIVEN** one canonical input with at least one prioritised leaf and a resource conflict
- **WHEN** PRI and Time are both solved
- **THEN** both are feasible against the same graph, PRI's `PRIORITY` is no worse than the Fast baseline's `PRIORITY`, and Time's `MAKESPAN` is no worse than the Fast baseline's `MAKESPAN` — the cross-objective comparison is deliberately **not** required, because two independent time-limited best-found runs cannot guarantee it

### Requirement: Every duration crossing the solver boundary is computed by the caller

Bun SHALL compute every duration and the solver SHALL NOT derive one. The value crossing the boundary SHALL be an integer count of `1 / SOLVER_QUANTUM` workday units, never a whole-day integer and never a raw fraction. The request SHALL contain no null duration.

#### Scenario: an unestimated slice crosses the boundary as its assumed duration

- **GIVEN** a slice whose `days` is null and whose `width` is 1
- **WHEN** the solver request is built
- **THEN** its `durationUnits` is `ASSUMED_SLICE_WORKDAYS × SOLVER_QUANTUM`, and the request contains no null and no fraction

### Requirement: A stale generation can neither publish nor evict

Every spawn SHALL carry `(generation, cancelEpoch, attemptToken)`, and every result, failure and eviction write SHALL be conditional, in the same transaction as its event, on all four of: the generation still being current for that contract version, the cancel epoch being unchanged, `optimization_enabled` still being 1, and the writer's `attemptToken` still matching its live `solver_slot` row. A statement failing any of those SHALL match zero rows and the writer SHALL abort rather than store, evict or broadcast.

#### Scenario: an undo back to a previous hash does not revive its old run

- **GIVEN** a run in flight for hash A, an edit to hash B that cancels it, and an undo back to hash A
- **WHEN** the original hash-A child returns a valid result
- **THEN** its write is rejected, no rows are deleted, no `ok` row is overwritten, and no event is emitted, even though the current hash is again A

### Requirement: Resource ceilings are enforced across processes

The per-project ceiling of 4 and the global ceiling of 16 SHALL be enforced by a SQLite admission transaction over a `solver_slot` table, not by coordinator memory, so that co-existing backend releases share one budget; the count SHALL include every unreleased row, including rows already asked to cancel, so a terminating child is never uncounted. Allocating a new generation SHALL NOT delete slot rows. Admission SHALL mint an unforgeable 128-bit `attemptToken`, and heartbeat, release, the outcome write and the event write SHALL each carry it so a superseded owner's statement matches zero rows. Reclamation SHALL mint a new token for the replacement and SHALL NOT authorize one while the old child may still run: slot expiry SHALL be `solverBudgetMs + 5000 + SLOT_RECLAIM_MARGIN_MS`, which is strictly later than the child's own hard self-deadline. Waiting entries SHALL be ordered by `enqueuedAt`, then `projectId`, then `contractVersion`, then `objective`, at most one per `(projectId, contractVersion, objective)`, and SHALL be discarded at dequeue if their generation is no longer current, their admitted cancel epoch no longer matches, or the project's toggle is no longer ON.

#### Scenario: an old owner cannot outlive its token

- **GIVEN** a slot reclaimed after heartbeat expiry and re-admitted to a new owner
- **WHEN** the original owner issues a late heartbeat, a release and a result write
- **THEN** all three match zero rows and are refused, only the current token's result can be stored, and exactly one outcome record exists for that key

#### Scenario: rapid generations never exceed the process ceilings

- **GIVEN** a project edited repeatedly so several generations overlap while their children terminate
- **WHEN** the observed operating-system process count is sampled throughout
- **THEN** it never exceeds 4 for that project or 16 globally, because superseded slot rows stay counted until their owners release them

#### Scenario: two coordinators share one global budget

- **GIVEN** a blue and a green backend process against the same database file
- **WHEN** both admit solver work until refused
- **THEN** at most 16 solver children run between them, and at most 4 for any one project

#### Scenario: two concurrent first reads start one solve per objective

- **GIVEN** no cached row for a project and two simultaneous reads
- **WHEN** both request admission
- **THEN** exactly one PRI child and one Time child are started, and the losing read waits for the event

### Requirement: A newly stored result and its event commit together

The cache row and a durable `event_log` record SHALL be written in one SQLite transaction, and the broadcaster SHALL push from the committed record. The guarantee SHALL be one durable replay record per newly stored outcome plus one best-effort post-commit push; the system SHALL NOT claim delivery over a live socket, because `event_log` is a replay buffer rather than a dispatched-and-acknowledged outbox and the process can die between the commit and the push. The payload SHALL be `(projectId, generation, inputHash, objective, contractVersion, budgetMs)` so a duplicate delivery is idempotent and a budget change is distinguishable.

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

The solver response SHALL carry only `{ status, offsets, objectiveValues }`, and the system SHALL NOT persist or return that offsets map as a schedule. Before storage the system SHALL materialise a complete `Schedule` from the offsets and the canonical input, using a Fast annotation pass with the optimized starts pinned. Because `placeSlices` today chooses starts and annotates in one traversal, Fast SHALL first be split into `chooseStarts(canonicalInput)` and `annotate(canonicalInput, starts)`, proved behaviour-preserving by the existing Fast golden corpus, and `materialiseOptimized` SHALL be `annotate` over the dequantised offsets. `annotate` SHALL process slices in ascending start with ties broken by the canonical slice order, SHALL replay the person and pool ledgers to reconstruct which reservations bind — choosing a multi-pool slice's pool by Fast's own rule at the pinned instant — and SHALL derive the resource-successor edges `lateTimes` consumes from those ledgers, so that every `ScheduledSlice` field the read payload exposes — duration, estimate state, earliest and latest times, float, critical, `boundBy`, `resourcePredecessorId`, `capacityPredecessorIds`, `capacityTeamId`, `width`, `effort` — and both wait counters and the work-item projections are produced by the same code path that produces them for Fast, with resource edges and late times derived from the optimized placement. The floor precedence SHALL be the complete ordered list `projectStart | notBefore | predecessor | stepOrder | person | capacity | optimizer`. A start SHALL be reported as the added `ScheduleFloor` member `optimizer` only when it is strictly later than **every** floor including the person and capacity floors; a slice that starts later because its assignee or its team is occupied SHALL retain that explanation rather than being labelled `optimizer`. An `optimizer` slice SHALL carry a null `resourcePredecessorId`, an empty `capacityPredecessorIds` and a null `capacityTeamId`. The client mirror SHALL be extended in the same change: the `ScheduleFloor` union in `apps/fe-01/src/lib/wbs-api.ts` and the exhaustive `floorWordsOf` switch in `apps/fe-01/src/components/wbs/gantt-geometry.ts`.

#### Scenario: a deliberately idled slice is named rather than misattributed

- **GIVEN** a PRI solve that idles a low-priority slice past every one of its floors so a high-priority slice can run first
- **WHEN** the result is materialised and read through the plan payload
- **THEN** that slice reports `boundBy: 'optimizer'`, a null `resourcePredecessorId`, an empty `capacityPredecessorIds` and a null `capacityTeamId`, and no other slice's floor is reported as `optimizer`

#### Scenario: a resource-bound optimized slice keeps its explanation

- **GIVEN** three optimized slices whose starts are respectively equal to a person floor, equal to a capacity floor, and strictly later than both
- **WHEN** the result is materialised and read through the plan payload
- **THEN** the first reports `boundBy: 'person'` with its `resourcePredecessorId`, the second reports `boundBy: 'capacity'` with its `capacityPredecessorIds` and `capacityTeamId`, only the third reports `optimizer`, and both wait counters and the hover words agree with those bindings

#### Scenario: the materialised schedule is field-complete on the real read path

- **GIVEN** a stored optimized variant for a project whose plan uses assignees, sized teams and a manual floor
- **WHEN** the plan is read with Engine Optimized
- **THEN** every field the same read returns for Fast is present and non-placeholder, and float, critical, earliest and latest are recomputed against the optimized starts rather than copied from Fast

### Requirement: Solver time is exchanged in fixed-point workday units

The system SHALL NOT send whole-day integers to the solver. It SHALL compute each slice's duration exactly as Fast computes it — `ASSUMED_SLICE_WORKDAYS` when `days` is null, without dividing by width, and `days / width` otherwise, preserving genuine fractions — and SHALL express durations, manual floors, the horizon and every returned offset in integer multiples of `1 / SOLVER_QUANTUM` workdays. A duration that is not an exact multiple SHALL be rounded up to the next unit, never down, because widths outside the divisors of `SOLVER_QUANTUM` are legal and no fixed denominator makes every legal duration exact. Because every quantised duration is therefore at least its real duration and every start is an exact unit multiple, any solution feasible in the quantised model SHALL be feasible in the real domain. The solution hint and the first stage's upper bound SHALL be taken from the **quantised Fast baseline** — Fast's own placement re-run over the rounded durations through the same code path — and SHALL NOT be taken from real Fast, whose value can be unreachable in the quantised model. `MOVEMENT` SHALL be measured against those integer baseline offsets. Before storage the materialised result SHALL be scored in the real domain against real Fast's value for that variant's own primary term, and when quantisation has made it worse the system SHALL store Fast's own materialised schedule with `objectiveValues[primary].status` of `quantisation-floor` rather than reporting a failure. `horizonUnits` SHALL be the serial bound `max(notBeforeUnits) + Σ durationUnits`; the system SHALL reject a plan whose horizon exceeds `2^31 − 1` with failure reason `horizon-overflow` rather than spawning a process, and the re-validator SHALL reject any offset that is not a non-negative integer unit within the horizon.

#### Scenario: a width-five serial plan is solvable rather than infeasible

- **GIVEN** three serial slices each with `days = 1` and `width = 5`, so Fast's real durations are 0.2 workdays and its real makespan is 28.8 units at `SOLVER_QUANTUM = 48`
- **WHEN** the request is built and solved
- **THEN** each duration is sent as 10 units, the hint and the stage-1 bound come from the quantised baseline's 30 units and are feasible, `MOVEMENT` is defined over integer offsets, and the stored variant's primary term measured in the real domain is no worse than real Fast's — falling back to Fast's own schedule if the quantised search cannot match it

#### Scenario: a width-two one-day slice keeps its half day

- **GIVEN** a slice with `days = 1` and `width = 2`
- **WHEN** the solver request is built
- **THEN** its duration is sent as `SOLVER_QUANTUM / 2` units and the materialised schedule reports `duration` 0.5, matching Fast for the same input

#### Scenario: an unestimated wide slice is not divided

- **GIVEN** a slice with `days = null` and `width = 3`
- **WHEN** the solver request is built
- **THEN** its duration is `ASSUMED_SLICE_WORKDAYS × SOLVER_QUANTUM` units, not one third of it

### Requirement: The staged objective is an anytime algorithm with stated stage outcomes

Staged lexicographic optimization SHALL divide `budgetMs` across its three terms by the exported `STAGE_BUDGET_SPLIT`, donating an early stage's remainder to the next. A stage proved OPTIMAL SHALL fix its term as an equality; a stage ending FEASIBLE, or UNKNOWN with an incumbent, SHALL constrain its term by the inequality `term <= incumbent` and SHALL NOT fix an equality; a stage ending UNKNOWN with no incumbent SHALL stop staging, and the outcome SHALL depend on the stage: at the **first** stage nothing is publishable and the variant SHALL fail with reason `no-solution`, while at any **later** stage the previously found incumbent SHALL be published, because it is feasible for the original constraints and already satisfies every bound added so far, with `objectiveValues` reporting `{ value: null, bound: null, status: 'unknown' }` for that term and every later one. INFEASIBLE SHALL be reported as `invalid-output` at any stage: Fast found a placement for the same graph, and every constraint a later stage adds is satisfied by the previous incumbent, so infeasibility is a contract violation rather than a plan property. One stage-status matrix in the design SHALL be the single authority driving the Python implementation, the response schema and the tests; no other text SHALL restate a stage rule. The published result SHALL be the incumbent of the last stage that produced one, and a partially staged result SHALL be cacheable. `objectiveValues` SHALL report `{ value, bound, status }` per term. The system SHALL NOT require either variant's objective value to beat the other variant's; it SHALL require each variant's own primary term to be no worse than the Fast baseline's value for that term, achieved by supplying Fast's placement as both a solution hint and an upper bound on the first stage.

#### Scenario: a later stage times out without an incumbent of its own

- **GIVEN** a PRI solve whose priority stage ends FEASIBLE with an incumbent and whose makespan stage ends UNKNOWN with no incumbent under its short budget
- **WHEN** the run ends
- **THEN** the priority stage's incumbent is published rather than discarded, the variant is not marked `no-solution`, and `objectiveValues` reports the makespan and movement terms as `unknown`

#### Scenario: the first stage exhausts the budget without proof

- **GIVEN** a PRI solve whose priority stage ends FEASIBLE with incumbent `v` after consuming its whole stage budget
- **WHEN** the makespan stage runs
- **THEN** the model carries `PRIORITY <= v` rather than `PRIORITY = v`, and the published result is the last incumbent found

#### Scenario: a run that cannot beat Fast still publishes

- **GIVEN** an input where CP-SAT finds no placement better than Fast's on the selected primary term within the budget
- **WHEN** the run ends
- **THEN** Fast's own value is published as the variant result and the variant is not marked failed

### Requirement: A generation records the input hash it was allocated for

The durable current identity SHALL live in an `optimization_generation` table keyed **`(projectId, contractVersion)`** holding `generation`, `inputHash` and `cancelEpoch`, and SHALL NOT live on the project row. Keying it by contract version is required rather than tidy: a canonicalizer change bumps `SCHEDULER_CONTRACT_VERSION` while blue and green run against one database, so a single row would let the two releases alternately increment one generation and delete each other's rows for ever. A `(projectId, contractVersion)` row untouched for 30 days, or whose contract version is retired at deploy, SHALL be deleted with its cache, slot and queue rows. Allocation within one release's row SHALL be one transaction that reads `generation` and `inputHash`, reuses the generation when the stored hash equals the computed hash, and otherwise sets the hash and increments the generation under a compare-and-swap on the generation it read, deleting the previous generation's cache and queue rows in the same transaction. It SHALL NOT delete that generation's slot rows, which stay counted until release or expiry. Two processes computing the same hash concurrently SHALL NOT allocate two generations, and a process computing a different hash SHALL NOT coalesce onto the current generation's slot.

#### Scenario: two canonicalizers do not supersede each other

- **GIVEN** an outgoing release computing hash H1 and an incoming release computing H2 for the same unchanged stored plan
- **WHEN** both read the project repeatedly
- **THEN** each converges on its own `(projectId, contractVersion)` row and neither reallocates a generation or deletes the other's rows, while a real plan edit still changes both hashes and fences both releases' in-flight work

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

Two schedules SHALL be reported as the same order iff, for every pair of slices present in both, the sign of the difference between their starts is equal in both, compared in the real fractional-workday domain on the two materialised schedules rather than in quantised units, because real Fast's starts need not lie on the unit grid and quantised comparison would report a reorder produced purely by rounding. The relation SHALL be computed server-side and shipped as one boolean beside the day-count delta.

#### Scenario: a uniform shift is not a reorder

- **GIVEN** an optimized schedule whose every slice starts exactly two workdays later than Fast's
- **THEN** the indicator reports the same order and a later deadline

#### Scenario: a broken tie is a reorder

- **GIVEN** two slices that start on the same day under Fast and on different days under the optimized result
- **THEN** the indicator reports reordered

### Requirement: Cancellation is a durable epoch observed across processes

Turning the optimization toggle OFF SHALL advance a durable `cancelEpoch` for every contract version of that project and SHALL NOT advance the generation, because the toggle is deliberately excluded from the input hash and allocation is required to reuse the generation for an unchanged hash. The OFF transition SHALL, in one transaction, clear `optimization_enabled`, increment the epoch, set `cancel_requested_at` on every one of that project's `solver_slot` rows, and delete its queue rows. A solver owner SHALL read `cancel_requested_at` and the current epoch on the same round trip as its heartbeat and SHALL terminate its child when either has moved, so real termination is bounded by one heartbeat interval even when the child belongs to a different backend process. A local process handle SHALL NOT be the cancellation mechanism.

#### Scenario: one backend turns the toggle off while the other owns the children

- **GIVEN** blue owning a live PRI child and a live Time child for a project, and green serving the settings PATCH
- **WHEN** green turns optimization OFF
- **THEN** both real children exit within one heartbeat interval, and neither can store a result, write a failure marker, or emit any event, because every write is conditional on the epoch and on `optimization_enabled`

### Requirement: The plan read carries every optimization state the UI renders

The plan read SHALL return an `optimization` block beside the existing schedule arrays and wait counts, carrying `enabled`, `engine`, `objective`, `inputHash`, `generation`, `contractVersion`, `budgetMs`, `displayed`, a `variants` map with one state per objective, and a `comparison` present exactly when `displayed` is not `fast`. Each variant state SHALL be one of `ready`, `pending`, `retrying`, `failed` with its reason, or `idle`, distinguished by the presence of a cache row together with the presence of a live slot or queue entry for that key. The schedule arrays SHALL hold Fast when the toggle is OFF, when Engine is Fast, or when the selected variant is not `ready`, and otherwise the materialised selected variant, with `displayed` naming which. A freshly loaded client SHALL be able to render every state from this one response without a second request.

#### Scenario: a cold reload distinguishes pending from failed

- **GIVEN** a project whose PRI variant has a failure marker with no live slot entry and whose Time variant has a live slot entry and no row
- **WHEN** a client loads the plan for the first time
- **THEN** the response reports PRI `failed` with its reason and Time `pending`, the arrays hold Fast, and the client renders Retry for PRI and `Optimizing…` for Time without polling

#### Scenario: a retry in flight is not rendered as unavailable

- **GIVEN** a failed PRI variant whose Retry has been admitted and whose marker row still exists
- **WHEN** the plan is read
- **THEN** PRI reports `retrying` rather than `failed`, Fast stays on screen, and no read deletes the marker or starts a second child

### Requirement: Retry is an authorized endpoint with defined stale and concurrent responses

Retry SHALL be `POST /api/projects/:projectId/optimization/retry` with a body naming the `objective` and the `inputHash` the client holds, under the same project-write authorization as the settings PATCH. It SHALL run the ordinary admission transaction, so two concurrent retries produce one child. It SHALL answer `202` with the new state, generation and input hash on admission or enqueue; `409 stale-input-hash` carrying the current hash when the body's hash is not current; `409 already-running` when a live slot or queue entry exists for that key; and `409 not-failed` when no failure marker exists. It SHALL NOT delete the failure marker before its replacement outcome commits.

#### Scenario: a retry against a superseded plan is refused with the current hash

- **GIVEN** a client holding a failed variant for hash A while the project has since moved to hash B
- **WHEN** it posts a retry naming hash A
- **THEN** the response is `409 stale-input-hash` carrying hash B, no process starts, and the client refetches rather than retrying blind

### Requirement: The cached schedule has a versioned codec

`scheduleJson` SHALL be a versioned DTO with explicit `encodeSchedule` and `decodeSchedule` functions rather than an unspecified serialisation, because `Schedule` carries two `Map` values that `JSON.stringify` renders as empty objects. Both maps SHALL be encoded as arrays of entries sorted by key, and `waitingForPerson`, `waitingForCapacity` and `eventsVisited` SHALL be stored so the round trip is total. `decodeSchedule` SHALL reject an unknown `dtoVersion`, a duplicate key, an entry whose key disagrees with its own slice key, or a missing work-item projection, throwing and naming the defect rather than returning a partial plan.

#### Scenario: a stored schedule reloads non-empty through the real read path

- **GIVEN** a materialised optimized schedule with populated slice and work-item maps
- **WHEN** it is stored, read back from SQLite and returned through the plan read
- **THEN** every slice and work-item entry is present with its fields, and a row whose JSON has a duplicate or mismatched key is refused rather than served as a partial plan
