## ADDED Requirements

### Requirement: Scratch teardown has a scoped finite allowance

The shared Bun scratch preload SHALL allow its existing cleanup hook 30 seconds without changing ordinary test deadlines or job and phase limits.

#### Scenario: Cleanup outlasts the ordinary test deadline

- **WHEN** the actual scratch remover completes after the command-line test deadline but within the cleanup allowance
- **THEN** the child test run succeeds and its scratch directories are physically absent

#### Scenario: Cleanup exceeds its hook deadline

- **WHEN** injected finite cleanup latency exceeds an inherited or explicitly reduced hook deadline
- **THEN** the child test run fails with a hook timeout

#### Scenario: An ordinary test hangs

- **WHEN** ordinary tests hang in multiple files under the shared preload
- **THEN** each still times out at its command-line test deadline
