## ADDED Requirements

### Requirement: Global scratch cleanup has a scoped finite allowance

The shared scratch preload SHALL allow its global afterAll 30000 ms while retaining ordinary command-line test deadlines, synchronous privacy-preserving start/return markers and the existing removal/error policy.

#### Scenario: Loaded cleanup exceeds ordinary test allowance

- **WHEN** the actual removal path takes longer than a smaller child command-line test budget but less than the explicit hook allowance
- **THEN** both file fixtures are removed and the hook passes
- **AND** deleting only the explicit allowance makes that replay fail
- **AND** an ordinary hung test still fails at the command-line deadline

### Requirement: Remote execution has exactly two fixed complete leaves

The remote logical partition SHALL remain owned once. After independent immutable plan/head validation, CI SHALL execute its entire exact process-model wrapper in one leaf and the unchanged canonical Bun discovery arguments excluding only that exact file in the other. The exception SHALL preserve canonical local/host execution. Unsupported configuration, overrides, absent/unreadable/aliased required files, empty execution and failed children SHALL refuse.

#### Scenario: Discovery adds another canonical test

- **WHEN** Bun's unchanged canonical selection discovers an additional file, including a substring-filter collision
- **THEN** that file executes in the remainder and the model wrapper executes only in its singleton leaf
- **AND** union coverage equals canonical discovery with no overlap

### Requirement: Both remote leaves retain gate obligations

Both leaves SHALL retain provisioning, fixed phase/job bounds, source identity, fresh execution and distinct always-upload logs. Remainder SHALL own remote Caddy and static checks once. The required gate SHALL require both selected leaves to succeed and SHALL accept both skipped only when the validated plan explicitly excludes remote or selects docs.

#### Scenario: One leaf is missing or unsuccessful

- **WHEN** remote is selected and either leaf is absent, skipped, failed, cancelled, unknown or bound to another head
- **THEN** the gate refuses without cancelling the other leaf solely because its peer failed
