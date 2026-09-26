## ADDED Requirements

### Requirement: Fast and optimized scheduling use charged effort

Fast and optimized scheduling SHALL consume charged per-step effort after project-step allowance and project rounding, then convert it to elapsed duration using the slice's resource width. They SHALL agree on feasibility and published effort/dates. An allowance edit SHALL invalidate stale optimized cache entries. Unknown steps SHALL remain zero-duration schedule nodes even if their Gantt placeholder has a visual span.

#### Scenario: Both schedulers charge QA once

- **GIVEN** a QA base of 2 days, a 30% allowance, ceiling rounding and a valid assignee width
- **WHEN** Fast and optimized schedules are produced
- **THEN** both use 3 charged effort days before width conversion
- **AND** their published dates agree under the same constraints

#### Scenario: A policy edit invalidates optimization

- **GIVEN** a cached optimized schedule built with zero QA allowance
- **WHEN** QA allowance changes to 30%
- **THEN** the old cache entry is not published as the schedule for the new policy
