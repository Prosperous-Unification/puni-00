# saved-plans Specification

## Purpose

TBD - created by archiving change add-step-finish-start-dependencies. Update Purpose after archive.

## Requirements

### Requirement: Saved plans retain typed dependency history

A saved plan SHALL capture each typed relationship's stable ID, endpoint scopes, step IDs, step codes, work-item numbers and FS type with the tree and project-step identities needed to interpret it. Historical reads SHALL display that captured meaning after live edits to steps, parentage or relationships. Saved plans remain immutable inspection records; this change SHALL NOT introduce restoration of a saved plan into the live project.

#### Scenario: Later step reorder does not reinterpret history

- **GIVEN** a saved plan with a dependency on a named step
- **WHEN** live project steps are reordered and the saved plan is read
- **THEN** the saved dependency still points to the captured step identity

#### Scenario: Later relationship edit does not rewrite history

- **GIVEN** a saved FS relationship
- **WHEN** its live counterpart is changed or removed
- **THEN** the saved plan still displays its captured FS endpoints

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
