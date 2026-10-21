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
its visible state; an unavailable required engine SHALL remain explicit. A
candidate violating any external constraint SHALL be refused before publication
and SHALL NOT replace any part of the valid composite placement.

#### Scenario: A late optimizer moves an external predecessor too far

- **GIVEN** B is being optimized while its external successor A has a fixed start
- **WHEN** the candidate finishes B after the FS boundary allows
- **THEN** independent publication validation rejects the candidate
- **AND** the prior valid composite placement remains available with the refusal state

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

#### Scenario: Capture does not enqueue optimization

- **GIVEN** a saved-plan or retained live capture includes an optimized external project without a ready current result
- **WHEN** the capture derives the connected placement
- **THEN** it records the valid displayed placement and explicit optimization state
- **AND** no generation, queue entry, solver slot or event is allocated by that capture

### Requirement: Solver boundaries are checked before connected publication

Solver requests SHALL carry incoming lower bounds, outgoing upper bounds and
shared-person bookings, with conservative quantization. Publication SHALL
validate that foreign starts are unchanged and every real FS/SS/FF boundary
remains satisfied. A violated boundary SHALL refuse the complete candidate.

#### Scenario: Quantization cannot hide a violated external boundary

- **GIVEN** a candidate satisfies its quantized constraints but violates a materialized real external FS, SS or FF boundary
- **WHEN** independent publication validation checks the candidate
- **THEN** it rejects the candidate and does not publish a partial component update
