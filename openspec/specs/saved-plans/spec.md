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

### Requirement: Saved and current schedules preserve capture mode

In isolated mode, saved-plan capture and comparison against `current` SHALL release the
coherent read snapshot before scheduling over the detached captured values. Scheduling SHALL
NOT hold the isolated capture's database read transaction open.

In shared mode only, capture and comparison against `current` SHALL keep one dedicated read-only
snapshot open through authorization, project rank, assignments, influencer and target inputs,
optimized-cache selection and non-admitting rank-ordered scheduling. The target schedule and
captured evidence SHALL detach by value before the snapshot connection closes. No generation,
solver slot, queue entry or event SHALL be written by this snapshot read. Saved-plan body hashing,
serialization, quota checks and persistence SHALL occur after the snapshot closes.

The saved target schedule SHALL remain immutable historical display evidence after influencers
are edited or deleted. Captured target inputs alone SHALL NOT be presented as sufficient to
replay that shared schedule; this requirement introduces no durable upstream history or booking ledger.
The same existing absent-schedule policy SHALL apply to save and `current` comparison.

#### Scenario: isolated scheduling releases the snapshot

- **GIVEN** an isolated project is saved or compared against `current`
- **WHEN** scheduling starts over its captured values
- **THEN** the capture read snapshot is already closed

#### Scenario: shared capture selects one coherent chain

- **GIVEN** a shared project has ranked influencers whose displayed bookings move its dates
- **WHEN** it is saved or compared against `current` while an influencer changes
- **THEN** its inputs and selected schedule reflect one snapshot of the chain, with no solver admission

#### Scenario: shared history survives influencer deletion

- **GIVEN** a shared project's target schedule was saved
- **WHEN** an influencer is edited or deleted
- **THEN** the saved target schedule bytes remain unchanged
