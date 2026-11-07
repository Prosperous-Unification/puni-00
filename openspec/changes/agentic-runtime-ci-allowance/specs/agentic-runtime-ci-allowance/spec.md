## ADDED Requirements

### Requirement: Complete Twilight validation has a finite allowance

The CI Twilight job SHALL declare a 120-minute timeout while retaining every existing selected test, typecheck, build, source-lint and packed-package phase. Its commands, parallelism, cache behavior, resource guards and required aggregate semantics SHALL remain unchanged.

#### Scenario: Read the production job allowance

- **WHEN** the workflow regression parses the production CI workflow
- **THEN** the Twilight job declares 120 minutes
- **AND** the workspace job retains its existing 120-minute allowance

#### Scenario: Regress the production timeout

- **WHEN** the production Twilight timeout is restored to 75 minutes
- **THEN** the same regression fails with expected 120 and received 75
- **AND** restoring 120 makes the regression pass

### Requirement: Timeout evidence does not certify unexecuted work

Verification SHALL retain the original cancelled run and distinguish a declaration proof from a completed hosted or canonical gate. A cancelled job SHALL NOT be accepted as passing validation.

#### Scenario: Inspect the historical cancellation

- **WHEN** reviewing run 41544558083 after the allowance repair
- **THEN** the record identifies its cancelled Twilight job and skipped packed-package phase
- **AND** fresh final-head checks remain required before merge
