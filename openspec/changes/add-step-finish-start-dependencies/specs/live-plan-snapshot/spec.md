## ADDED Requirements

### Requirement: Working plans expose committed typed dependency mutations

A working plan SHALL include legacy and typed dependencies distinctly after each successful mutation in its admitted batch. A retained read after a typed edit SHALL see its stable ID, endpoint scopes, step IDs and FS type; a refused mutation SHALL not change the working plan.

#### Scenario: A typed edit is visible to a later batch command

- **GIVEN** an admitted batch with a typed dependency edit
- **WHEN** a later command reads the working plan
- **THEN** it sees the committed relationship state and endpoint label

#### Scenario: A refused edit leaves the working plan unchanged

- **GIVEN** a typed edit that would close a slice cycle
- **WHEN** validation refuses the command
- **THEN** a retained read sees the preceding dependency set
