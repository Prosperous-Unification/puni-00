## MODIFIED Requirements

### Requirement: Solver edges represent the expanded authored graph

The scheduler input hash SHALL distinguish typed endpoint/type relationships from legacy `depReach` links. Shared expansion SHALL emit every selected leaf pair and internal step-order edge; Fast and CP-SAT SHALL enforce all resolved edges, including edges entering later successor steps. Zero-duration unknown slices SHALL remain precedence nodes without resource demand. A contract-version bump SHALL retire stale optimized rows. The versioned solver wire SHALL carry relationship type and derived FF start weight for every expanded edge. For real durations, FS SHALL require `S_b >= S_a + d_a`, SS `S_b >= S_a`, and FF `S_b >= S_a + d_a − d_b`; negative FF weights SHALL remain valid. With Q=48 and integer durations `D_i=ceil(Q×d_i)` for positive slices or zero for unknown/zero slices, CP-SAT SHALL enforce FS finish→start, SS start→start, and FF finish→finish plus `S_b >= S_a + W_FF`, where `W_FF=max(D_a−D_b, ceil(Q×(d_a−d_b)))`. The independent validator SHALL recompute W_FF from canonical real durations, reject a mismatched wire value and recheck all relationship boundaries on materialized real offsets before publication. The quantized baseline SHALL satisfy the same active constraints and deadlines before it bounds an objective.

#### Scenario: Rounded FF would violate real finish order

- **GIVEN** real durations A=0.030 and B=0.021 days, each quantized to two units, and equal integer starts
- **WHEN** the FF relationship is checked
- **THEN** the integer finish order alone passes but the strengthened W_FF bound requires B to start at least one unit later
- **AND** a response with equal starts is rejected on real materialization

#### Scenario: Forged FF weight is rejected

- **GIVEN** a solver request or response carries an FF bound smaller than the canonical formula
- **WHEN** independent validation runs
- **THEN** it fails as invalid output rather than publishing a schedule

#### Scenario: Unknown successor has zero duration

- **GIVEN** an FF dependency into an unestimated slice
- **WHEN** either scheduler checks the edge
- **THEN** the successor's real start and finish are equal and no visual placeholder time enters the constraint

## ADDED Requirements

### Requirement: Fast replay and float support weighted relationships

Fast SHALL place slices against the maximum of their own floor and FS, SS and FF weighted predecessor bounds, then satisfy actual resource availability. It SHALL permit a longer FF successor to be placed before an already processed predecessor when valid. Replay SHALL rebuild resource-order evidence from actual placements; latest dates, float and critical path SHALL use weighted constraints without clamping negative FF weights. Fast and optimized validators SHALL agree whether a given schedule satisfies shared constraints. A Fast deadline miss SHALL not be reported as global infeasibility; a solver timeout without a solution SHALL remain unknown, and quantized infeasibility SHALL not be described as proof of fractional infeasibility.

#### Scenario: Longer successor starts before predecessor

- **GIVEN** B lasts longer than A and A→B FF is the only dependency
- **WHEN** Fast schedules B before A with nonoverlapping resources
- **THEN** replay and float remain valid and B's finish is no earlier than A's

#### Scenario: Fast misses a tight deadline

- **GIVEN** Fast chooses a resource order that misses a deadline but another valid order meets it
- **WHEN** optimization evaluates the plan
- **THEN** Fast's miss is not labeled globally infeasible and a valid optimized order may publish
