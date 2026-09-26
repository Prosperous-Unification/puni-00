## ADDED Requirements

### Requirement: Working-plan commands observe project-step allowance edits

An admitted project-step allowance edit SHALL update the working-plan state read by later commands in the same batch. A refused edit SHALL leave that state and the persisted policy unchanged. The working-plan read SHALL expose the current allowance and charged estimate readings after a committed edit.

#### Scenario: A later command reads the edited allowance

- **GIVEN** a batch changes QA allowance from 30% to 50% and then reads or uses QA charged effort
- **WHEN** the second command executes
- **THEN** it observes the 50% policy and corresponding charged effort

#### Scenario: A refused edit does not leak into later state

- **GIVEN** a batch attempts an invalid allowance edit
- **WHEN** the edit is refused
- **THEN** neither persisted policy nor retained working-plan state exposes that edit
