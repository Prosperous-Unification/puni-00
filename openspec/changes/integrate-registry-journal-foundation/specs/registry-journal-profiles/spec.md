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

### Requirement: Kubernetes journal families preserve distinct authority

The active Kubernetes journal SHALL retain main's schema4 controller lifecycle, full progress validation, legacy1/2/3 prior-executor refusal and UID-fenced sticky Lease ownership. The dormant registry journal SHALL retain schema3/4 historical progress and exact binding/history without controller defaults, fabrication, projection or active wiring.

#### Scenario: Valid independent formats remain readable

- **GIVEN** a complete active controller schema4 record and a valid dormant historical registry3/4 record
- **WHEN** each actual owning reader reads its format
- **THEN** it retains complete original progress and authority with no migration or manufactured fields

#### Scenario: Reserved-family hybrids refuse

- **GIVEN** an otherwise valid active4 record carrying registry, registryHistory or registry-inheritance kind, or a dormant registry4 record carrying controllers
- **WHEN** the actual owning file/parser path reads it
- **THEN** it refuses before granting effects, preserves original bytes, and active refusal identifies unsupported schema/family rather than relying on malformed controller evidence

### Requirement: Shared Kubernetes parsing retains validation ownership

Shared parsing SHALL validate precise common shape/capture. Active controller shape/lifecycle and controller progress MUST precede unchanged replay validation. Dormant replay SHALL follow common validation.

#### Scenario: Corrupt controller and replay progress

- **WHEN** an active record has invalid controller progress and replay evidence
- **THEN** the owning parser retains main's controller-first diagnostic, and dormant parsing retains its existing replay validation without controller fabrication

### Requirement: Current-main delivery and source qualification remain complete

Integration SHALL preserve main's validated CI base/partitions/status/timeouts, remote discovery and eight leaves, controller planning/effects and observed Lease UID forwarding. Fleet source prerequisites MUST remain in the workspace phase that selects Fleet and unchanged infra-check. Exact dependency patch, S3 resolution, aliases, policy declarations and all old assertions SHALL survive additive resolution. Frozen install and provenance-dependent tests MUST use the actual combined source.

#### Scenario: Combined clean source qualification

- **WHEN** the normal combined candidate is committed after finite source checks
- **THEN** the unchanged eleven pilot cases and five actual document-target cases plus index/link positives qualify that clean HEAD/tree without mutable archive substitution, earlier-error acceptance or new skips
