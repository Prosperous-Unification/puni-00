# Workflow identities Specification

## Purpose

Stable workflow-run construction and exact private persistence.

## Requirements

### Requirement: New workflow runs have stable generated identities

Workflow-run construction SHALL generate one random UUID and one revision-zero Run
record from project, work-item, manifest and retry-budget inputs. Retrying persistence
or recovering that same run MUST reuse its retained ID. Existing store ports SHALL
continue to accept the complete currently admitted opaque-ID domain.

#### Scenario: Persist the same generated run twice

- **WHEN** a generated Run is submitted twice with identical content under current ownership
- **THEN** the second call identifies the same retained run without generating another ID
- **AND** a reopened store returns that exact ID and content

### Requirement: Private persistence preserves every admitted identity

SQLite SHALL encode raw identity keys as canonical JSON strings and decode before
domain comparisons. All key producers, lookups, readers and foreign-key counterparts
MUST agree. Digest keys, existing JSON tuple keys, serialized records and artifacts
SHALL retain their present representations. Semantic ordering MUST remain unchanged.

#### Scenario: Unicode and literal escape identities remain distinct

- **WHEN** IDs containing lone surrogates, literal replacement characters, literal escape
  text, NUL and astral characters are created, read, retried and reopened
- **THEN** every successful operation preserves the exact original UTF-16 code units
- **AND** distinct IDs retain independent records and references

#### Scenario: Noncanonical or mismatched trusted keys refuse

- **WHEN** a persisted physical key uses a noncanonical JSON spelling or disagrees with
  its independently validated logical record
- **THEN** the actual public read or open refuses the trusted state as corrupt

### Requirement: Format transition preserves genuine predecessor state

An explicit format4-to-format5 transition SHALL fully validate the predecessor, populate
an additive parallel keyed family and publish the complete successor identity atomically.
It MUST retain every prior migration byte and payload byte, preserve all key relationships,
and fence already-open old writers. Ordinary open SHALL never perform this transition.

#### Scenario: Populated predecessor upgrades atomically

- **WHEN** a genuine populated format4 store is explicitly upgraded
- **THEN** all public records, ordering and constraints remain equivalent after reopening
- **AND** old tables remain intact and old-format semantic writers refuse

#### Scenario: Corrupt predecessor or late transition failure

- **WHEN** predecessor validation fails or a fault interrupts successor population
- **THEN** the transition refuses with the original predecessor contents and identity intact

### Requirement: Downgrade refuses to discard new-format work

Unused format5 downgrade SHALL restore the validated format4 identity and remove only
new structures. After any new-format semantic mutation, both API downgrade and direct
transactional down SQL MUST refuse. Missing or corrupt use markers MUST refuse.

#### Scenario: Unused transition round trip

- **WHEN** a genuine format4 store is upgraded and downgraded before new-format semantic use
- **THEN** its predecessor execution/history ledger, payloads and identity remain exact

#### Scenario: Unused downgrade preserves a later observed clock

- **WHEN** an upgraded store has only duplicate or refused operations that advance its
  observed clock, without a new semantic mutation
- **THEN** unused downgrade preserves the greatest observed clock
- **AND** its predecessor execution/history ledger and payloads remain exact

#### Scenario: New-format use prevents destructive downgrade

- **WHEN** an upgraded store commits a new semantic mutation
- **THEN** API downgrade and direct down SQL refuse without losing that work
