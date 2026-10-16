## ADDED Requirements

### Requirement: Observe only the selected local source container

The observer SHALL inspect one full containerd ID using an explicit absolute local crictl executable and local Unix endpoint, with fixed inspect arguments, finite deadline, bounded combined output and sanitized errors. It SHALL refuse remote endpoint schemes and Docker/SSH executables.

#### Scenario: Stable source

- **WHEN** both inspections identify the expected full ID, Pod UID, source metadata name, running state and same init PID, and local process and cgroup identities remain stable through one complete sample
- **THEN** the observer returns only sanitized evidence accepted by validateSourceMemory, including the exact 2Gi limit

#### Scenario: Foreign or changed identity

- **WHEN** runtime ID, UID, name, state, PID, process starttime, final namespace PID, exact membership or cgroup directory identity is absent, malformed, foreign or changes
- **THEN** no source memory evidence is returned

#### Scenario: Required state or runtime fails

- **WHEN** required state is missing, unreadable, oversized or malformed, or the runtime stalls, exits unsuccessfully or exceeds its output cap
- **THEN** observation throws within its local deadline with no raw runtime fields, argv, environment or credential text in the returned error

#### Scenario: Evidence scope

- **WHEN** observation succeeds
- **THEN** it makes no cluster/operator authenticity, historical first-attempt, readiness, OOM-attribution or acceptance claim
