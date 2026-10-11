## ADDED Requirements

### Requirement: Saved plans carry each step's estimate unit

A saved plan's canonical input SHALL carry each step's `estimateUnit` at the input schema
version allocated at packet time. A body at the previous version SHALL be upgraded on read
with `workdays` on every step, so that it and its upgrade schedule identically. A saved
plan's schedule SHALL place minute-unit slices exactly as the working plan does. Comparing
two saved plans SHALL report a step's unit change.

#### Scenario: an old saved plan reads in workdays

- **GIVEN** a saved plan stored at the previous input schema version
- **WHEN** it is read
- **THEN** its input is at the new version with every step `workdays`, and its schedule
  equals the one computed from the stored body

#### Scenario: a comparison names a unit change

- **GIVEN** two saved plans differing only in one step's unit
- **WHEN** they are compared
- **THEN** the difference names that step and its unit before and after
