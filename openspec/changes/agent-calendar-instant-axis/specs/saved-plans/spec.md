## ADDED Requirements

### Requirement: Saved plans carry executor kinds and the working window

A saved plan's canonical input SHALL carry each step's `executorKind` and the project's
working window at the input schema version allocated at packet time; a body at the previous
version SHALL upgrade on read with `either` and the default window and schedule identically
under the default. A saved plan's schedule SHALL run on the same calendars as the working plan.
Comparing two saved plans SHALL report kind and window changes.

#### Scenario: an old saved plan keeps its dates

- **GIVEN** a saved plan stored at the previous input schema version with no `agent` step
- **WHEN** it is read
- **THEN** its input is at the new version with every step `either` and the default window,
  and every day boundary of its schedule equals the stored one

#### Scenario: a comparison names a kind change

- **GIVEN** two saved plans differing only in one step's executor kind
- **WHEN** they are compared
- **THEN** the difference names that step and its kind before and after
