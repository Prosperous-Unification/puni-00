## ADDED Requirements

### Requirement: Bounded workspace gate budget

The CI workspace gate SHALL have a finite 90-minute job timeout and SHALL retain its existing
required check sequence and verdict propagation.

#### Scenario: Workspace checks exceed the former allowance

- **WHEN** the workspace checks take more than 60 minutes but finish within 90 minutes
- **THEN** the job budget permits the remaining checks to execute
- **AND** their actual outcomes determine the gate verdict

#### Scenario: Workspace checks exceed the allowance

- **WHEN** the workspace job reaches its 90-minute limit
- **THEN** GitHub Actions cancels the job and the required gate cannot pass
