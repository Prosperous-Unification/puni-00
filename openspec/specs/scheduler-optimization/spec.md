# scheduler-optimization Specification

## Purpose

TBD - created by archiving change add-step-finish-start-dependencies. Update Purpose after archive.

## Requirements

### Requirement: Solver edges represent the expanded authored graph

The scheduler input hash SHALL include typed endpoint/type relationships distinctly from legacy `depReach` links. The shared step-node graph SHALL emit FS edges for every resolved step-node pair with `authored` provenance beside `workflow` step order and `legacy` edges; CP-SAT SHALL receive those resolved edges, while Fast SHALL permit them to enter any selected successor step. Zero-duration unknown slices SHALL remain nodes and SHALL consume no resources. A versioned contract change SHALL retire stale optimized results. Independent response validation SHALL recheck each materialized real FS boundary before publication.

#### Scenario: External FS targets the second step

- **GIVEN** a typed dependency targeting node `B.qa` rather than `B.dev`
- **WHEN** Fast and CP-SAT schedule the plan
- **THEN** B.QA waits for the selected predecessor finish
- **AND** B.Dev may run earlier subject to its other constraints

#### Scenario: Solver omits one expanded pair

- **GIVEN** a parent relationship expands into several FS slice edges
- **WHEN** a solver response violates one pair despite satisfying the others
- **THEN** independent validation rejects it as invalid output
