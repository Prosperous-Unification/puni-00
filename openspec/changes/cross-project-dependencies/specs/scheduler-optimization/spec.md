## MODIFIED Requirements

### Requirement: Solver edges represent the expanded authored graph

The scheduler input hash SHALL include typed endpoint/type relationships
distinctly from legacy `depReach` links, including the stable project identities
of external endpoints. The shared step-node graph SHALL emit the FS, SS or FF
constraint for every resolved typed step-node pair with `authored` provenance
beside `workflow` step order and `legacy` edges. Each project's legacy edges
SHALL use that project's own reach and each endpoint SHALL use its own project's
steps and tree. CP-SAT SHALL receive those resolved constraints or their exact
fixed-boundary equivalents; Fast SHALL enforce them at the selected successor
step. Zero-duration unknown slices SHALL remain nodes and SHALL consume no
resources. A versioned contract change SHALL retire stale optimized results.
Independent response validation SHALL recheck every materialized real typed
boundary, including external incoming and outgoing boundaries, before publication.
These scheduling constraints SHALL follow the existing hold reduction;
authored relationship and hold evidence SHALL remain captured separately.

#### Scenario: External FS targets the second step

- **GIVEN** a typed dependency targeting node `B.qa` rather than `B.dev`
- **WHEN** Fast and CP-SAT schedule the plan
- **THEN** B.QA waits for the selected predecessor finish
- **AND** B.Dev runs earlier when its other constraints permit it

#### Scenario: Solver omits one expanded pair

- **GIVEN** a parent relationship expands into several FS slice edges
- **WHEN** a solver response violates one pair despite satisfying the others
- **THEN** independent validation rejects it as invalid output

#### Scenario: Cross-project SS and FF retain their actual boundaries

- **GIVEN** `A.dev SS B.dev` and `B.qa FF C.qa` across three projects
- **WHEN** either engine schedules their connected work
- **THEN** B.dev starts no earlier than A.dev starts and C.qa finishes no earlier than B.qa finishes
- **AND** neither relation is substituted with whole-work-item FS

## ADDED Requirements

### Requirement: Connected scheduling preserves task interleaving

A schedule affected by external relationships SHALL derive from one captured
connected step-node graph. It SHALL allow project-level cycles when the resolved
step-node graph is acyclic and SHALL reject actual resolved cycles. Dependency
eligibility and typed boundary inequalities SHALL precede project rank and
work-item priority.

The scheduling constraints SHALL be resolved after the existing hold reduction;
authored cycle validation SHALL continue to use the unreduced graph.

#### Scenario: A project resumes after another project's work

- **GIVEN** `A.design → B.build → A.test` is an acyclic step-node graph and A outranks B
- **WHEN** Fast and optimized placement are derived
- **THEN** B.build waits for A.design and A.test waits for B.build
- **AND** the relationship set is not rejected or reordered merely because A and B refer to each other

#### Scenario: A lower-ranked prerequisite remains a prerequisite

- **GIVEN** a high-ranked project has work depending on a lower-ranked project's step
- **WHEN** the competing work is scheduled
- **THEN** the successor is not eligible before its dependency constraint permits it
- **AND** rank orders only eligible competing work

### Requirement: Connected scheduling retains project inputs

Each project SHALL retain its estimate rules, step order, start floor, manual
constraints and project-scoped team/resource capacities. Person capacity SHALL
be shared only under shared-capacity mode. Projects unaffected by external
dependencies SHALL retain the existing scheduling path.

#### Scenario: Shared catalog IDs do not merge project pools

- **GIVEN** two linked projects state capacity one for the same team or resource catalog identity
- **WHEN** their connected schedule is computed
- **THEN** each project's capacity constrains its own slices independently
- **AND** the same assigned person cannot overlap across them when capacity mode is shared

### Requirement: Cross-project dates use actual project anchors

Connected schedules SHALL translate dated projects through the shared workday
axis and return project-relative projections using each project's own anchor.
They SHALL preserve fractional workday boundaries and SHALL NOT substitute one
project's start date for another's.

#### Scenario: Projects begin on different dates

- **GIVEN** A begins on Monday and B begins on Wednesday with B depending on A's finish
- **WHEN** the connected schedule is projected onto B
- **THEN** B respects both its Wednesday start floor and A's actual workday finish
- **AND** the cross-project boundary agrees when inspected from A or B

### Requirement: Missing external anchors remain explicit

An external relationship SHALL remain valid when a project lacks a start date.
A connected dependency schedule needing that absent anchor SHALL return
`dependency_calendar_missing` with the readable project identity. The read SHALL
retain inspectable relationships and readiness and SHALL NOT fabricate dates,
omit the prerequisite or present incomplete dated placement as complete.

#### Scenario: An undated prerequisite remains visible

- **GIVEN** dated B depends on undated A
- **WHEN** B's schedule is read
- **THEN** it reports `dependency_calendar_missing` naming A without fabricated dates
- **AND** the relationship and dependency-based readiness remain inspectable

### Requirement: Mixed engines publish one coherent connected placement

Projects affected by external relationships SHALL retain per-project engine,
enablement and objective choices. Projections from one captured observation
SHALL belong to one valid composite placement. The system SHALL start with
combined Fast placement and consider selected optimizations in rank order while
fixing all other project starts at each stage. A ready variant SHALL replace only
its project's placement after validation of all component constraints.

#### Scenario: A Fast project and an optimized project share a dependency

- **GIVEN** A selects Fast and B selects a ready optimized variant, with dependencies between their steps
- **WHEN** either project's projection is read from the same captured observation
- **THEN** both projections come from the same composite placement satisfying every dependency
- **AND** B's optimized replacement does not move A's fixed starts

### Requirement: Optimizer refusals preserve valid connected placement

Pending or failed optimization SHALL retain the current valid placement with
its visible state; `boundary-infeasible` SHALL also retain that placement with
its scoped explanation. An unavailable required engine SHALL remain explicit. A
candidate violating any external constraint SHALL be refused before publication
and SHALL NOT replace any part of the valid composite placement.

#### Scenario: A late optimizer moves an external predecessor too far

- **GIVEN** B is being optimized while its external successor A has a fixed start
- **WHEN** the candidate finishes B after the FS boundary allows
- **THEN** independent publication validation rejects the candidate
- **AND** the prior valid composite placement remains available with the refusal state

### Requirement: Fixed-boundary infeasibility has a scoped outcome

A validated fixed-boundary quantized subproblem proved infeasible SHALL produce
`boundary-infeasible`, including when it contains no authored deadline. Its
certificate SHALL identify the captured question, project, objective, quantum,
contract and effective boundary/local constraints. It SHALL NOT certify the
whole plan or its authored deadlines infeasible. Unknown, timeout, malformed
requests and invalid answers SHALL retain distinct failure dispositions.

#### Scenario: Real placement fits between two solver quanta

- **GIVEN** fixed A finishes at 0.2, one-day B precedes fixed C starting at 1.2, no deadlines exist, and quantum is 48
- **WHEN** conservative quantization yields B start at least 10 units and at most 9 units
- **THEN** the outcome is `boundary-infeasible` for that captured subproblem, not invalid-output or plan-infeasible
- **AND** real composite placement with B at 0.2 through 1.2 remains displayed with a scoped resolution explanation
- **AND** preparation does not invent a feasible quantized baseline or classify the empty integer window as a malformed request

#### Scenario: An unrelated deadline does not change certificate scope

- **GIVEN** the same fixed-boundary subproblem also contains an authored deadline that does not bind B
- **WHEN** the validated subproblem is proved infeasible
- **THEN** its certificate still concerns the captured fixed-boundary quantized subproblem
- **AND** the application does not claim the authored deadline or whole plan is infeasible

### Requirement: Boundary infeasibility is cached without retry loops

The system SHALL persist `boundary-infeasible` separately with its scoped
certificate and release the attempt's slot. Reads, capture and restart SHALL
retain the valid composite and visible explanation. Automatic admission SHALL
NOT re-enqueue the certified question; manual Retry SHALL return typed
not-retryable for that identity. Changed placement-relevant inputs SHALL create
a new question eligible for normal admission.

#### Scenario: An unchanged boundary certificate survives restart

- **GIVEN** a certified boundary-infeasible question is persisted
- **WHEN** the service restarts, the plan is read, and manual Retry is requested with the same identity
- **THEN** no new attempt is admitted and Retry reports not-retryable with boundary-infeasible state
- **AND** the previous valid composite remains visible with the captured boundary explanation

#### Scenario: Moving the fixed successor permits a fresh question

- **GIVEN** the 0.2-to-1.2 fixed-boundary question was certified infeasible at quantum 48
- **WHEN** C's fixed start moves to 1.25 and the next connected observation captures that change
- **THEN** the old certificate does not classify the new question and normal admission is allowed
- **AND** the historical certificate retains its original boundary values

### Requirement: Connected optimization has bounded and stated proof scope

The optimization pass SHALL be bounded by the captured project count and SHALL
NOT recursively derive live project trees. Optimization proof claims SHALL
state their fixed external boundary scope and SHALL NOT claim global optimality.

#### Scenario: Interleaving does not recurse between project reads

- **GIVEN** a valid `A.design → B.build → A.test` chain with both projects selecting optimization
- **WHEN** the connected placement is derived
- **THEN** each captured project has at most one optimization stage in that pass
- **AND** any proof describes the project's objective under its captured fixed external boundaries

### Requirement: Boundary changes invalidate downstream optimization

A selected upstream variant changing a later stage's captured boundaries SHALL
invalidate the later optimization question. Pending replacement SHALL retain
valid baseline placement. Later selected variants SHALL NOT feed back into
earlier stage identities.

#### Scenario: An upstream selected variant changes

- **GIVEN** B has a cached optimization built after A's selected placement
- **WHEN** A's selected variant changes the external boundary before B's stage is read
- **THEN** B's previous optimization does not match the current question identity
- **AND** B retains valid baseline placement while the current question is pending

### Requirement: Connected optimization identity is complete

Optimization identity SHALL include every placement-relevant captured input,
external relationship/type, project anchor, capacity mode, project rank, fixed
boundary placement and scheduler contract version. Stage identity SHALL use
the captured boundaries for that stage rather than recursively depending on
later selected variants.

#### Scenario: Outgoing constraints participate in cache identity

- **GIVEN** A's optimization has an outgoing relationship to a fixed B step
- **WHEN** B's captured start changes but A's local tree does not
- **THEN** A's optimization question identity changes
- **AND** a cached answer violating the new outgoing bound is not published

### Requirement: Connected snapshot reads remain non-admitting

Snapshot reads SHALL perform authorization, closure capture and cache selection
coherently and SHALL NOT admit solver work, allocate generations or publish
events. Missing required external state SHALL fail visibly rather than be
treated as an empty graph.

Externally connected components SHALL retain that snapshot through derivation
and sequential cache selection even in isolated capacity mode, detaching before
closure. Ordinary isolated captures SHALL retain their existing lifetime.

#### Scenario: Capture does not enqueue optimization

- **GIVEN** a saved-plan or retained live capture includes an optimized external project without a ready current result
- **WHEN** the capture derives the connected placement
- **THEN** it records the valid displayed placement and explicit optimization state
- **AND** no generation, queue entry, solver slot or event is allocated by that capture

#### Scenario: An isolated connected capture excludes concurrent publication

- **GIVEN** an isolated-capacity component has external relationships and its capture snapshot has begun
- **WHEN** another connection publishes a matching optimized result between its stage selections
- **THEN** every stage in the capture uses the pre-publication snapshot
- **AND** only a subsequent capture can select that publication

### Requirement: Solver boundaries are checked before connected publication

Solver requests SHALL carry incoming lower bounds, outgoing upper bounds and
shared-person bookings, with conservative quantization. Publication SHALL
validate that foreign starts are unchanged and every real FS/SS/FF boundary
remains satisfied. A violated boundary SHALL refuse the complete candidate.

#### Scenario: Quantization cannot hide a violated external boundary

- **GIVEN** a candidate satisfies its quantized constraints but violates a materialized real external FS, SS or FF boundary
- **WHEN** independent publication validation checks the candidate
- **THEN** it rejects the candidate and does not publish a partial component update

### Requirement: Connected tree responses bind captured optimization evidence

The tree response runtime validator SHALL bind each terminal objective's question
project, objective key, input hash, contract version, budget, quantum, wire version
and canonical stage bytes to their sibling captured optimization fields. A
nonselected objective MAY carry terminal evidence; its objective SHALL be checked
against its variant key. Question hash SHALL be preserved independently.

Connected displayed objectives SHALL be ready. Finish and order comparisons SHALL
both exist exactly for ready objectives. Fast MAY remain displayed with ready
alternatives. Local response compatibility SHALL remain unchanged. Structural
JSON Schema SHALL retain its descriptor; these additional runtime relations SHALL
be enforced by the tree's Standard Schema validator after structural validation.
The frontend HTTP adapter SHALL bind connected scope to the requested URL project.

#### Scenario: Correctly typed detached evidence contradicts its captured siblings

- **GIVEN** a projected connected terminal tree that passes structural validation
- **WHEN** any one of those eight question fields differs from its captured sibling
- **THEN** response validation and generated client decoding refuse the response
- **AND** the semantic issue identifies the terminal question field path

#### Scenario: Connected arithmetic lacks coherent comparison evidence

- **WHEN** a displayed objective is not ready, a ready objective lacks finish or order, or a nonready objective carries either
- **THEN** response validation and generated client decoding refuse the response

#### Scenario: Internally consistent scope belongs to a different URL project

- **GIVEN** a connected tree with internally consistent scope and terminal evidence
- **WHEN** the frontend adapter reads it for a different project ID
- **THEN** the adapter refuses the project mismatch before presentation

### Requirement: Connected manual Retry observes current scoped input before writer admission

Manual Retry SHALL authorize the target before opening its connected input capture.
The capture SHALL close its read transaction before the source-owned writer admits
Retry, and SHALL return the target's immutable pre-selection stage rather than
rebuilding a question from final composite dates. The coordinator SHALL compare
the submitted input hash with the captured current hash before retained terminal
lookup. The writer SHALL recheck current project and membership authority and
SHALL consult retained terminal evidence before requiring a matching generation.

A terminal objective SHALL return HTTP 409 `not-retryable` with
`boundary-infeasible` state without mutating optimizer state, audit or events and
without launching a child. A failed sibling MAY be retried independently using
the current connected hash. An idle target SHALL return 409 `not-retryable` with
`idle` state. Missing required calendars SHALL return 409
`schedule-input-unavailable`, reason `dependency_calendar_missing`, the addressed
`projectId` and the captured list of missing projects with their IDs,
abbreviations and names. Engine, cycle and calendar-range refusals SHALL preserve
the existing typed unavailable contract. These observations SHALL NOT activate a
production connected reader or dependency authoring.

#### Scenario: Stale request beside retained terminal evidence

- **GIVEN** the current connected question retains boundary-infeasible Time
- **WHEN** Retry submits an older hash, including after a foreign boundary changes
- **THEN** it returns stale-input-hash with the current captured hash before terminal lookup
- **AND** no optimizer state, audit or event changes and no child launches

#### Scenario: Terminal evidence survives generation replacement

- **GIVEN** a retained terminal question whose generation was replaced
- **WHEN** an authorized caller retries that current question
- **THEN** Retry returns boundary-infeasible rather than idle
- **AND** its writer makes no state changes

#### Scenario: Failed sibling remains retryable

- **GIVEN** retained terminal Time and failed Pri for one connected stage
- **WHEN** an authorized caller retries Pri with the current stage hash
- **THEN** Retry returns HTTP 202 and launches only Pri after closing the read capture
- **AND** Retry of Time still returns boundary-infeasible

#### Scenario: Membership changes after the detached read

- **GIVEN** the caller was authorized for the connected capture
- **WHEN** membership is removed after the read transaction closes and before writer admission
- **THEN** the source-owned Retry writer returns forbidden without optimizer, audit or event mutation

### Requirement: Public connected tree reads admit their captured target after closure

An installed connected public `treeWithin` read SHALL admit only the requested
scheduled enabled target after its owned observation closes. It SHALL consume
the retained pre-selection stage without recapture and return its already-derived
projection. Existing coordinator admission, terminal and lifecycle policies SHALL
remain authoritative.

#### Scenario: Observation is unavailable or no admission was installed

- **GIVEN** a connected public tree observation
- **WHEN** runtime is missing or captured scheduling is unavailable
- **THEN** existing explicit unavailable behavior remains visible without admission
- **AND** a configured scheduled enabled observation lacking admission throws

#### Scenario: Existing non-admitting consumer reads a connected observation

- **WHEN** `tree`, aggregate, export, save or background capture reads a connected observation
- **THEN** it does not invoke initial live admission
- **AND** existing committed-event reactions can still admit other enabled targets after outcomes

#### Scenario: Cold target reads converge on existing work

- **GIVEN** an enabled connected target with no retained objective answers
- **WHEN** its public tree is read repeatedly while its solver children remain active
- **THEN** its captured pre-selection stage admits one current attempt per objective
- **AND** the first response retains the captured projection from before admission
- **AND** retained terminal answers suppress subsequent admission for that question

#### Scenario: A borrowed caller receives a live callback accidentally

- **GIVEN** a command graph in capture mode with staged input and a live callback
- **WHEN** the connected tree is read inside its owning unit of work
- **THEN** it presents the staged captured placement without invoking that callback
- **AND** its owner retains commit or rollback control

#### Scenario: Enablement or drain state changes when observation closes

- **GIVEN** the connected observation captured an enabled target
- **WHEN** the target becomes disabled or draining before source writer admission
- **THEN** existing source-owned admission refuses solver work
- **AND** the response still presents the captured observation

### Requirement: Connected schedule arrangement consumes the captured placement

`arrangeBySchedule` SHALL use the final connected target placement from the command's
borrowed observation, preserving held rows and foreign projects. Held rows SHALL
retain their positions, revisions and ordinal sibling slots; eligible rows SHALL
reuse their original slots when their positions represent the requested order.
Valid duplicate positions SHALL use finite replacement positions when possible;
if immutable held anchors prevent the requested full reader order, the command
SHALL return `arrangement_positions_unavailable` as an atomic 409 conflict. It SHALL refuse a
selected enabled Optimized target whose retained selection has no published decision
with `schedule_not_ready`, even when the read displays Fast provisionally. Missing
component anchors SHALL return `dependency_calendar_missing` as a command conflict.
Refusals SHALL preserve the entire command batch; successful changes SHALL use the
existing single arrangement journal entry and stored-position undo/redo.

#### Scenario: Foreign prerequisite changes target sibling order

- **WHEN** a foreign FS prerequisite delays the first target sibling behind another
- **THEN** arrangement follows the captured target dates, leaves held rows in place,
  and changes no foreign positions
- **AND** a repeated press records nothing, while undo and redo restore stored positions

#### Scenario: Unavailable captured arrangement refuses the whole batch

- **WHEN** a component anchor is missing after an earlier command in the same batch
- **THEN** arrangement returns `dependency_calendar_missing` at its command index
- **AND** the earlier command, journal, events and sequence changes are rolled back

#### Scenario: Selected optimization readiness is distinct from final placement

- **WHEN** the selected target objective is pending or terminal without publication
- **THEN** arrangement returns `schedule_not_ready` without optimizer admission or writes
- **WHEN** the selected objective is published, including a quantisation-floor decision
- **THEN** arrangement uses the final target placement, rather than the component baseline
  or the target's retained earlier optimization stage

#### Scenario: Held slots survive sparse, fractional and tied positions

- **WHEN** eligible siblings exchange schedule order around a held sibling
- **THEN** the mounted tree keeps the held sibling between the eligible rows,
  with its exact position and revision unchanged, including sparse/fractional slots
- **AND** a second press writes nothing, while undo/redo restore the exact positions

#### Scenario: Valid duplicate positions cannot always fit between fixed anchors

- **WHEN** valid duplicate eligible positions can be reordered around a held anchor
- **THEN** the command assigns finite positions whose actual `(position, id)` reader
  ordering matches the intended full sibling order
- **WHEN** that order cannot fit between immutable held anchors with equal positions
- **THEN** it returns `arrangement_positions_unavailable` without position, journal,
  event or sequence changes
