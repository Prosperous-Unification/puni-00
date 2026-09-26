## MODIFIED Requirements

### Requirement: Every duration crossing the solver boundary is computed by the caller

Bun SHALL compute every duration and the solver SHALL NOT derive one. The request SHALL carry an integer durationUnits count for every slice, never null or a raw fraction. A slice whose days are null SHALL cross as zero durationUnits, while its canonical input SHALL retain null distinctly from an explicit zero estimate. The optimized solver SHALL keep zero-duration slices as precedence nodes, create no positive interval or resource demand for them, and validate and publish dates under the same zero-duration semantics as Fast.

#### Scenario: An unestimated slice crosses the boundary as zero

- **GIVEN** a slice whose days are null, with any valid width
- **WHEN** the solver request is built
- **THEN** its durationUnits is zero, with no null or fraction on the wire
- **AND** the canonical input hash still distinguishes its unknown days from explicit zero

#### Scenario: A zero-time predecessor remains a dependency node

- **GIVEN** an unknown predecessor linked to an estimated successor
- **WHEN** CP-SAT solves and the result is revalidated
- **THEN** the predecessor has equal start and finish, has no resource interval, and still transmits its precedence constraint
- **AND** the optimized successor is not delayed by an assumed span
