## MODIFIED Requirements

### Requirement: Working plans expose committed typed dependency mutations

A working plan SHALL include legacy and typed dependencies distinctly after each successful mutation in its admitted batch. For every typed relationship, a retained read after a successful edit SHALL see its stable relationship ID, FS, SS or FF type, both endpoint scopes, owning project IDs, work-item IDs and applicable step node IDs or step IDs. A refused mutation SHALL NOT change the working plan.

#### Scenario: A typed edit is visible to a later batch command

- **GIVEN** an admitted batch with a typed dependency edit
- **WHEN** a later command reads the working plan
- **THEN** it sees the committed relationship state and endpoint label

#### Scenario: A refused edit leaves the working plan unchanged

- **GIVEN** a typed edit that would close a slice cycle
- **WHEN** validation refuses the command
- **THEN** a retained read sees the preceding dependency set

#### Scenario: An FF edit is visible to a later command

- **GIVEN** an admitted batch with an FF typed dependency edit
- **WHEN** a later command reads the working plan
- **THEN** it sees the committed FF relationship and endpoint label

#### Scenario: A refused SS or FF edit leaves the working plan unchanged

- **GIVEN** an SS or FF edit that would close a slice cycle
- **WHEN** validation refuses the command
- **THEN** a retained read sees the preceding dependency set
