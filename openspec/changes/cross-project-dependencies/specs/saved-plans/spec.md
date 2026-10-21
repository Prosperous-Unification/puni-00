## MODIFIED Requirements

### Requirement: Saved plans retain typed dependency history

A saved plan SHALL capture each typed relationship's stable ID, relationship type, endpoint scopes, owning project IDs, work-item IDs, applicable step node IDs and step IDs, step codes, work-item numbers and project-step identities needed to interpret it. For external endpoints it SHALL capture the project abbreviation, qualified address, names and external readiness and scheduling evidence needed to explain the saved target schedule. These values SHALL be captured coherently with the target inputs and selected schedule. Historical reads SHALL display that captured meaning after live edits to abbreviations, numbering, steps, parentage, accessibility or relationships, or deletion of external work. Historical display and comparison SHALL NOT live-dereference external facts to fill or replace captured evidence. Stable navigation identity MAY target the current authorized endpoint, but navigating SHALL NOT rewrite historical facts. Saved plans remain immutable inspection records; this change SHALL NOT introduce restoration of a saved plan into the live project.

A save with missing, unreadable or malformed required external evidence SHALL fail explicitly without persisting an incomplete saved plan or fabricating endpoint or schedule facts. A historical record that claims external dependencies but lacks required captured evidence SHALL be reported as incompatible or invalid rather than repaired from current live values. Existing records that contain no external dependencies SHALL remain readable under their supported historical format.

#### Scenario: Later step reorder does not reinterpret history

- **GIVEN** a saved plan with a dependency on a named step
- **WHEN** live project steps are reordered and the saved plan is read
- **THEN** the saved dependency still points to the captured step identity

#### Scenario: Later relationship edit does not rewrite history

- **GIVEN** a saved FS relationship
- **WHEN** its live counterpart is changed or removed
- **THEN** the saved plan still displays its captured FS endpoints

#### Scenario: External renaming and deletion preserve historical meaning

- **GIVEN** a saved dependency displayed as `PUNI-CORE.080.39` with captured external schedule evidence
- **WHEN** the external project abbreviation and number change or its work item is deleted
- **THEN** the historical dependency retains its captured address, names, identities and schedule evidence
- **AND** historical inspection does not fetch current external facts to reinterpret the record

#### Scenario: Historical inspection does not depend on current external reads

- **GIVEN** an authorized saved plan contains complete captured external endpoint and scheduling evidence
- **WHEN** the live external project cannot be read
- **THEN** historical inspection uses only the captured evidence
- **AND** any attempted live navigation remains subject to current authorization without modifying history

#### Scenario: Required evidence is absent at save time

- **GIVEN** the target plan has a cross-project dependency
- **WHEN** required external endpoint or scheduling evidence cannot be captured coherently
- **THEN** save fails explicitly and no incomplete saved plan is persisted

#### Scenario: Historical external evidence is malformed

- **GIVEN** a stored historical record claims a cross-project dependency but required captured external evidence is missing or malformed
- **WHEN** the saved plan is read
- **THEN** the reader reports an incompatible or invalid record rather than dropping the relationship or fetching live replacements

#### Scenario: An older local-only saved plan stays readable

- **GIVEN** a saved plan in a supported older format with no external dependencies
- **WHEN** it is inspected after cross-project dependencies are introduced
- **THEN** its existing local dependency meaning remains readable without invented external evidence

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
