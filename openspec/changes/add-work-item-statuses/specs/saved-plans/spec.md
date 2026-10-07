## ADDED Requirements

### Requirement: Saved plans capture readiness and hold

A saved plan's canonical input SHALL carry each work item's `readiness` and `hold` at
input schema version 4. A version 3 body SHALL be upgraded on read with both fields `null`, so
that a version 3 body and its version 4 upgrade schedule identically. A saved plan's schedule
SHALL exclude held work exactly as the working plan does. Comparing two saved plans SHALL
report readiness and hold changes per work item.

#### Scenario: an old saved plan reads with nothing held

- **GIVEN** a saved plan stored at input schema version 3
- **WHEN** it is read
- **THEN** its input is version 4 with every readiness and hold `null`, and its schedule equals
  the one computed from the version 3 body

#### Scenario: a comparison names a hold

- **GIVEN** two saved plans differing only in one leaf's hold
- **WHEN** they are compared
- **THEN** the difference names that leaf and its hold before and after
