## ADDED Requirements

### Requirement: A saved plan freezes project-step policy

A saved plan or snapshot SHALL include the allowance of each captured project step and its charged estimate readings. Later edits to the live project-step policy SHALL not change the saved plan's figures. Snapshot and archive format versions SHALL distinguish records with allowances from legacy records converted to zero.

#### Scenario: A later setting edit does not rewrite history

- **GIVEN** a snapshot saved when QA allowance was 30%
- **WHEN** the live project's QA allowance becomes 50%
- **THEN** the saved plan still reads 30% and its original charged estimates
