## ADDED Requirements

### Requirement: Precise explicit journal surfaces

The existing foundation module SHALL preserve its six schema1 exports and object-port API. An explicit managed module SHALL preserve all nineteen retained exports and precise schema3/4 responses. The publication facade MUST retain its managed meaning. Fixed internal entrypoints SHALL select the profile; requests, missing catalogs, ports, paths and state absence MUST NOT select it.

#### Scenario: Independent initialization

- **WHEN** foundation and managed entrypoints initialize separate owned directories
- **THEN** foundation returns schema1 without installed authority and managed returns schema3, without widening either public response type

#### Scenario: Cross-profile ordinary read

- **WHEN** foundation reads schema3/4 or managed ordinarily reads schema1/2
- **THEN** the command refuses before canonical mutation or replacement-orphan reclamation

### Requirement: Separate command and CLI contracts

Foundation SHALL retain its nine-command grammar, including promoted publication completion, and one-directory bounded-stdin/statfs CLI. Managed SHALL retain its stricter publication grammar, deferred installed-authority loading and existing explicit validation/monitor modes at a separate source CLI. Managed command validation MUST precede bootstrap; bootstrap failure MUST precede lock/state effects. Installed transport paths and protocol SHALL remain unchanged.

#### Scenario: Promoted completion differs intentionally

- **WHEN** the same promoted publication outcome reaches each profile
- **THEN** foundation accepts its valid owned transition while managed rejects the request before invoking deferred authority

#### Scenario: Managed authority is unavailable

- **WHEN** a valid managed CLI command has missing, unreadable or invalid installation
- **THEN** it fails without state effects or foundation statfs fallback

### Requirement: One durable coordinator

Both profiles SHALL share one lock/read/transaction/replacement coordinator and identical base ownership, ledger, capacity, timestamp and durability rules. Canonical state validation MUST precede complete orphan validation and cleanup. Required IO, sync or capacity failures MUST fail without acknowledgement. Capacity SHALL charge the entire measured domain, including unrelated occupants; managed installed identity verification remains mandatory and separate.

#### Scenario: An orphan or durable write is unsafe

- **WHEN** canonical/profile validation, any orphan, exclusive replacement, required fsync or failure headroom is invalid
- **THEN** the command fails and preserves the appropriate canonical/recovery evidence

### Requirement: Profile-specific recovery remains intact

Foundation SHALL preserve sticky failure fencing through abandonment and reopen on maintenance completion only below strict70% effective bytes and inodes with host reserve at least20GiB. Managed schema3 completion SHALL remain fenced pending its explicit reopening route; schema4 MUST reject phase-only maintenance and retain verified held-session recovery.

#### Scenario: Low-water maintenance completes

- **WHEN** identical valid measurements are below both70% thresholds with at least20GiB reserve
- **THEN** foundation completion reopens while managed prototype completion stays fenced

#### Scenario: Exact thresholds or phase assertions are insufficient

- **WHEN** foundation completion reaches either exact70% threshold or lacks reserve, or a schema4 caller submits phase-only maintenance
- **THEN** the relevant profile refuses reopening or the invalid command without substituting advisory admission for authority

### Requirement: Upgrades require explicit managed intent

Only explicit managed upgrade SHALL consume schema1/2, preserve every obligation, token, bundle, reservation, protection and closed identifier, and install its existing fence. Schema3-to4 upgrade SHALL retain its existing preconditions. Ordinary reads MUST NOT project fields, migrate state or fabricate physical evidence.

#### Scenario: Legacy state is upgraded explicitly

- **WHEN** a valid explicit managed upgrade receives legacy state with retained obligations
- **THEN** those identities survive, schema3 is fenced and no ordinary read obtains upgrade authority

### Requirement: Source-only integration preserves provenance

Integration SHALL preserve main's complete policy runtime, eight additive tests, foundation OpenSpec/evidence and both glossary scopes. Historical hashes MUST remain historical. Managed import/build/installer-source edges SHALL point explicitly at the managed surface, without changing installed artifacts, ordinary delivery or active manifests. All native/provider/backup/adoption acceptance SHALL remain open.

#### Scenario: Managed artifacts are built

- **WHEN** source builders select the installed authority artifact
- **THEN** they select the explicit managed CLI while the foundation CLI retains no-installation behavior and no installer runs
