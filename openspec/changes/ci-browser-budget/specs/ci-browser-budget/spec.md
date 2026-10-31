## ADDED Requirements

### Requirement: Browser jobs allow measured setup and complete verdicts within a finite budget

The pixels_shard job SHALL declare a numeric 35-minute job timeout covering setup and browser execution. It SHALL retain four shards, existing test limits and retry policy, affected-stack routing, the activated-organization check, artifact retention and required pixels verdict propagation.

#### Scenario: Setup and layout together exceed the former allowance

- **WHEN** system dependency setup and complete browser checks take more than 25 minutes but finish within 35 minutes
- **THEN** the job budget permits their remaining checks to execute
- **AND** the actual outcomes determine the required pixels verdict

#### Scenario: The browser job exceeds the allowance

- **WHEN** a browser job reaches 35 minutes
- **THEN** GitHub Actions cancels it and the required pixels check cannot pass

#### Scenario: The declared budget is removed or widened

- **WHEN** the production workflow lacks its explicit budget or declares more than 35 minutes
- **THEN** the production-workflow contract check fails
