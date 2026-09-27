## ADDED Requirements

### Requirement: A step allowance edit is one undoable command

A committed project-step allowance edit through settings, HTTP or MCP SHALL use the same authorized mutation, publish a step update and invalidate derived totals and schedules. It SHALL be one undoable journal entry restoring the prior policy. Undo SHALL refuse as stale after a conflicting edit or step deletion and SHALL not overwrite newer work.

#### Scenario: Undo restores the old policy

- **GIVEN** QA allowance changes from 0% to 30%
- **WHEN** the editor invokes undo without an intervening conflict
- **THEN** QA returns to 0% and affected derived figures refresh

#### Scenario: A conflicting edit blocks undo

- **GIVEN** another editor changed QA after the original allowance update
- **WHEN** the original editor invokes undo
- **THEN** undo refuses visibly and preserves the newer policy
