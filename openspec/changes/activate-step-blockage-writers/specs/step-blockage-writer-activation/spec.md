## ADDED Requirements

### Requirement: Atomic exact activation receipt

The image-local command SHALL transition DISABLED to ENABLED and persist one validated version-1 receipt in one IMMEDIATE SQLite transaction, after validating the existing migration, marker and exact writer triggers. It SHALL open only an existing database and SHALL expose a read-only inspect mode.

#### Scenario: Disabled inspected without enabling

- **WHEN** inspect runs on a valid DISABLED database
- **THEN** it reports DISABLED and no receipt without writing authority

#### Scenario: Exact attended attempt commits

- **WHEN** activate receives a valid receipt on a DISABLED database with no receipt
- **THEN** both ENABLED and that exact receipt become durable together

#### Scenario: Receipt insert fails

- **WHEN** the receipt insert fails inside activation
- **THEN** the marker remains DISABLED and no receipt commits

#### Scenario: Exact retry and conflicting retry

- **WHEN** an ENABLED database is activated again
- **THEN** the same receipt is returned only for the exact existing attempt and any different receipt refuses

#### Scenario: Broken authority

- **WHEN** the marker, trigger definitions, migration ledger, receipt schema or receipt content is missing or malformed
- **THEN** activation refuses without changing authority

#### Scenario: Empty malformed receipt schema

- **WHEN** the migration ledger is intact and the receipt relation is empty but its required table constraints are missing or altered, or a view replaces the table
- **THEN** both inspect and activate refuse without changing the activation marker, receipt rows or migration ledger

### Requirement: Guard receipt rollback

The receipt migration SHALL preserve schema and ledger when activation is ENABLED or any receipt remains, including an enabled database containing zero facts.

#### Scenario: Enabled empty rollback

- **WHEN** down is requested after activation with no blockage facts
- **THEN** down refuses and preserves receipt, marker and ledger

### Requirement: Explicit fenced deployment admission

Host activation SHALL require an explicit operator flag, durable intent, exact stopped-writer and database identity, and independent candidate and rollback step_blockage_activation_v1 capabilities. Enabled inventory SHALL retain that compatibility obligation even with zero facts. Uncertain activation or readback SHALL retain all barrier evidence. A preserve-only capable release SHALL precede attended activation. Kubernetes first-start SHALL continue to require DISABLED.

#### Scenario: Incapable rollback

- **WHEN** activation is requested with an incapable rollback image
- **THEN** it refuses before activation intent or SQLite mutation

#### Scenario: Activation readback unavailable

- **WHEN** activation may have committed but exact receipt readback is unavailable
- **THEN** deploy retains barriers and refuses application exposure or rollback
