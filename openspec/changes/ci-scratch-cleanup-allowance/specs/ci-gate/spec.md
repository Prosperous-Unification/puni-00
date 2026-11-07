## ADDED Requirements

### Requirement: Scratch teardown has a scoped finite allowance

The shared Bun scratch preload SHALL allow its existing cleanup hook 60 seconds without changing ordinary test deadlines or job and phase limits.

#### Scenario: Cleanup outlasts the ordinary test deadline

- **WHEN** the actual scratch remover completes after the command-line test deadline but within the cleanup allowance
- **THEN** the child test run succeeds and its scratch directories are physically absent

#### Scenario: Cleanup exceeds its hook deadline

- **WHEN** injected finite cleanup latency exceeds an inherited or explicitly reduced hook deadline
- **THEN** the child test run fails with a hook timeout

#### Scenario: An ordinary test hangs

- **WHEN** ordinary tests hang in multiple files under the shared preload
- **THEN** each still times out at its command-line test deadline

#### Scenario: Cleanup outlasts the former allowance

- **WHEN** the actual remover is exercised with31 seconds of finite filesystem latency under the60-second hook allowance
- **THEN** the child run succeeds and its real scratch directories are absent
- **AND** the former30-second hook reproduces the unnamed timeout without changing named-test, job or phase budgets
- **AND** this slow proof is recorded separately without adding31 seconds to the default fast regression suite
