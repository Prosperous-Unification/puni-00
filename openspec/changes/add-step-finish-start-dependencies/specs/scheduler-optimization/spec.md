## ADDED Requirements

### Requirement: Solver edges represent the expanded authored graph

The scheduler input hash SHALL include typed endpoint/type relationships distinctly from legacy `depReach` links. The shared expansion SHALL emit FS edges for every selected leaf pair and internal step order; CP-SAT SHALL receive those resolved edges, while Fast SHALL permit them to enter any selected successor step. Zero-duration unknown slices SHALL remain nodes and SHALL consume no resources. A versioned contract change SHALL retire stale optimized results. Independent response validation SHALL recheck each materialized real FS boundary before publication.

#### Scenario: External FS targets the second step

- **GIVEN** a typed dependency targeting B.QA rather than B.Dev
- **WHEN** Fast and CP-SAT schedule the plan
- **THEN** B.QA waits for the selected predecessor finish
- **AND** B.Dev may run earlier subject to its other constraints

#### Scenario: Solver omits one expanded pair

- **GIVEN** a parent relationship expands into several FS slice edges
- **WHEN** a solver response violates one pair despite satisfying the others
- **THEN** independent validation rejects it as invalid output
