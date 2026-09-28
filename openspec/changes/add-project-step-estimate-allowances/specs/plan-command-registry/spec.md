## ADDED Requirements

### Requirement: A step allowance edit is one undoable command

A committed project-step allowance edit through settings, HTTP or MCP SHALL use the same authorized mutation, publish a step update and invalidate derived totals and schedules. It SHALL be one undoable journal entry restoring the prior policy. Undo SHALL refuse as stale after a conflicting edit or step deletion and SHALL not overwrite newer work.

An allowance that would place the plan past the supported calendar SHALL be refused as a typed 422 `calendar_range` over HTTP, in a command batch and through MCP, changing nothing. A step edit that renames the step and sets its allowance SHALL apply both or neither. The allowance SHALL be its one undo entry, and the rename SHALL stay unjournalled like every step rename.

#### Scenario: Undo restores the old policy

- **GIVEN** QA allowance changes from 0% to 30%
- **WHEN** the editor invokes undo without an intervening conflict
- **THEN** QA returns to 0% and affected derived figures refresh

#### Scenario: A conflicting edit blocks undo

- **GIVEN** another editor changed QA after the original allowance update
- **WHEN** the original editor invokes undo
- **THEN** undo refuses visibly and preserves the newer policy

#### Scenario: An allowance past the calendar is a typed refusal

- **GIVEN** a QA estimate that fits the calendar at 0% but not at 1000%
- **WHEN** the editor sets QA's allowance to 1000% over HTTP, in a batch or through MCP
- **THEN** the reply is 422 `calendar_range` and QA keeps 0%

#### Scenario: A rename and an allowance in one edit settle together

- **GIVEN** a step edit that renames QA to Review and sets its allowance
- **WHEN** the allowance is refused, or the rename is refused
- **THEN** QA keeps both its name and its allowance
- **AND** when neither is refused, both apply and one undo restores only the allowance
