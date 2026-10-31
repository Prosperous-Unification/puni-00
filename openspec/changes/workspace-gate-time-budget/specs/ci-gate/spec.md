## ADDED Requirements

### Requirement: Bounded workspace gate budget

The CI workspace gate SHALL have a finite 120-minute job timeout and SHALL retain its existing required check sequence and verdict propagation.

#### Scenario: Workspace checks exceed the former allowance

- **WHEN** the workspace checks take more than 90 minutes but finish within 120 minutes
- **THEN** the job budget permits the remaining checks to execute
- **AND** their actual outcomes determine the gate verdict

#### Scenario: Workspace checks exceed the allowance

- **WHEN** the workspace job reaches its 120-minute limit
- **THEN** GitHub Actions cancels the job and the required gate cannot pass
