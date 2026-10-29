## ADDED Requirements

### Requirement: Global scratch cleanup has a scoped finite allowance

The shared scratch preload SHALL allow its global afterAll 30000 ms while retaining ordinary command-line test deadlines, synchronous privacy-preserving start/return markers and the existing removal/error policy.

#### Scenario: Loaded cleanup exceeds ordinary test allowance

- **WHEN** the actual removal path takes longer than a smaller child command-line test budget but less than the explicit hook allowance
- **THEN** both file fixtures are removed and the hook passes
- **AND** deleting only the explicit allowance makes that replay fail
- **AND** an ordinary hung test still fails at the command-line deadline

### Requirement: Remote execution has exactly three fixed complete leaves

After immutable plan/head validation, CI SHALL execute remote through its 43-case core file, 24-case continuation file and canonical discovery excluding only those two exact files. Logical ownership SHALL remain singular and canonical local/host execution SHALL remain unchanged.

#### Scenario: Discovery adds another canonical test

- **WHEN** Bun's unchanged canonical selection discovers an additional file, including a substring-filter collision
- **THEN** that file executes in the remainder and each model file executes only in its own singleton leaf
- **AND** union coverage equals canonical discovery with no overlap

#### Scenario: Execution contract or child is invalid

- **WHEN** configuration or overrides are unsupported, either required owner is absent, unreadable or aliased, or the actual child is empty or unsuccessful
- **THEN** every leaf refuses without a fresh successful execution receipt

### Requirement: All remote leaves retain gate obligations

All three leaves SHALL retain provisioning, fixed phase/job bounds, source identity, fresh execution and distinct always-upload logs. Remainder SHALL own remote Caddy and static checks once. The required gate SHALL require all selected leaves to succeed and SHALL accept all skipped only when the validated plan explicitly excludes remote or selects docs.

#### Scenario: One leaf is missing or unsuccessful

- **WHEN** remote is selected and any leaf is absent, skipped, failed, cancelled, unknown or bound to another head
- **THEN** the gate refuses without cancelling the other leaf solely because its peer failed

#### Scenario: Model files share fixed fixture ports

- **WHEN** remote is selected
- **THEN** a closed two-entry model matrix uses separate runners for core and continuation, with fail-fast disabled and serial cases within each file
- **AND** each model allocation retains its existing 75-minute phase, 90-minute job and 30-second termination cleanup, with unchanged child and parent bounds
- **AND** each partition has a distinct artifact and phase identity, and the required model aggregate succeeds only after both matrix jobs succeed
