## ADDED Requirements

### Requirement: Kubernetes verifies the candidate migration protocol before capture

Before opening SQLite or creating a capture snapshot, the Kubernetes capture Job SHALL execute
the pinned candidate image's database-free migration capability CLI. It SHALL require a
successful exit and one strict JSON object with protocol `wbs-migration`, version `1`, and
exactly the unique capabilities `capture-v1` and `restore-v1-sha256`, in either order.
Missing, unreadable, failing, malformed, legacy, unsupported or incomplete responses SHALL
refuse capture before any snapshot or forward migration, without a timestamp fallback.
The capability CLI SHALL require neither DB_PATH nor a database or migration directory and
SHALL NOT open SQLite. Existing capture format and deployment identities SHALL remain unchanged.

#### Scenario: Candidate exposes only legacy migration commands

- **GIVEN** an image whose migration commands support only latest-name status and `--to`
- **WHEN** the new Kubernetes executor attempts capture with that image
- **THEN** it reports incompatible migration capabilities before opening SQLite or creating
  the snapshot, and no forward migration is run

#### Scenario: Capability response is not the complete supported protocol

- **WHEN** the executable is missing or unreadable, exits nonzero, or returns malformed JSON,
  extra fields, a wrong protocol/version, duplicate/unknown capabilities, or only one required capability
- **THEN** capture fails with an explicit capability diagnostic, with no SQLite open,
  snapshot, forward migration or fallback to `--to`

#### Scenario: Capability discovery needs no database

- **WHEN** the capability CLI is invoked with no DB_PATH and no database or migration directory
- **THEN** it returns the supported strict response without creating or opening a database
- **AND** unexpected arguments are refused

#### Scenario: Advertised restoration is implemented by the same backend

- **WHEN** a backend advertises `capture-v1` and `restore-v1-sha256`
- **THEN** its actual capture and down CLIs complete the older-candidate/newer-baseline round
  trip and reject altered capture bytes before any ledger or schema mutation
- **AND** the generated Kubernetes script still takes its single existing database observation
  for capture and snapshot after the successful capability check

### Requirement: Capture identifies the complete rollback boundary

Before deployment applies a migration, it SHALL persist an attempt-bound capture containing
the complete applied migration identities and the ordered candidate additions, including
forward and reverse script hashes. Missing, unreadable, malformed, duplicate or incompatible
capture SHALL refuse migration or automatic recovery rather than become an empty baseline.

#### Scenario: Capture cannot be preserved

- **WHEN** capture creation, readback or identity validation fails before migration
- **THEN** no forward migration runs and the deployment reports the failed capture operation

#### Scenario: Empty baseline is explicit

- **WHEN** a fresh database has no applied migrations
- **THEN** capture records an explicit empty set, distinct from absent or unreadable capture

#### Scenario: Capture belongs to another attempt

- **WHEN** recovery receives a capture for another deployment target, attempt or candidate
- **THEN** it refuses before running any down script

### Requirement: Rollback restores the exact captured identities

Within the existing deployment rollback boundary, rollback SHALL reverse only the observed
candidate additions absent from capture's applied set, in reverse forward-migration order.
It SHALL preserve every captured name and forward hash, reject unexpected additions or
changed identities before reversal, and verify exact ledger equality before reporting success.
Migration timestamps SHALL NOT determine membership in the reversal set.

#### Scenario: Older migration arrives after a newer baseline

- **GIVEN** `20261005110000_add_shared_people` is applied and the candidate introduces
  the older-stamped `20261001020000_older_candidate_probe`
- **WHEN** forward migration succeeds and the deployment aborts
- **THEN** the older candidate and its schema are reversed, the captured ledger and
  baseline schema are restored, and baseline sentinel rows remain unchanged

#### Scenario: Older migration was already applied before capture

- **WHEN** the older candidate is already part of the captured set and another migration
  is added before an abort
- **THEN** rollback preserves the older candidate and reverses only the new candidate addition

#### Scenario: Unexpected ledger change

- **WHEN** a captured migration is missing or changed, or an observed addition is not among
  the captured candidate migrations
- **THEN** rollback refuses before a down script runs and reports the mismatched identity

#### Scenario: Command exits successfully without restoring the set

- **WHEN** a migration subprocess exits zero but leaves a candidate addition recorded or
  alters a captured identity
- **THEN** deployment reports failed schema recovery rather than restored schema

### Requirement: Recovery preserves script integrity and resumability

Rollback SHALL check captured forward and reverse script identities before any reversal.
Each down script and its ledger deletion SHALL share one transaction. Repeated recovery
SHALL converge to the same captured set after partial forward application or partial rollback.

#### Scenario: Script missing or changed

- **WHEN** an applied candidate's migration.sql or down.sql is missing, unreadable or differs
  from its captured identity
- **THEN** rollback refuses before executing any reversal and names the affected script

#### Scenario: Interrupted rollback resumes

- **WHEN** recovery is interrupted after one migration and its ledger deletion commit
- **THEN** a retry reverses only the remaining recorded additions and preserves baseline rows

#### Scenario: Down script fails

- **WHEN** a down script fails after executing an earlier statement
- **THEN** that script's schema effects and ledger deletion roll back together, recovery
  remains failed, and a retry after resolving the modeled cause uses the same capture

### Requirement: Deployment callers preserve recovery boundaries

Compose and Kubernetes deployment automation SHALL invoke exact-set rollback and preserve
capture for manual recovery. Failure SHALL remain nonzero and name a usable completion
command after automatic cleanup. Kubernetes SHALL preserve its existing writer fence,
Lease and Flux failure behavior; neither caller SHALL automatically restore a database
snapshot or extend its existing automatic rollback boundary.

#### Scenario: Kubernetes rollback cannot restore capture

- **WHEN** schema recovery fails before writes reopen
- **THEN** the release remains rollback-failed, writes remain fenced, and its report identifies
  the capture and manual recovery command

#### Scenario: Compose rollback fails

- **WHEN** Compose cannot restore the captured migration set
- **THEN** it reports schema recovery failure and a command using retained capture and the
  pinned candidate image that remains usable after incoming-container cleanup

#### Scenario: Old release journal has insufficient capture

- **WHEN** an interrupted legacy release lacks the identities required for exact-set recovery
- **THEN** the new executor refuses automatic recovery with an actionable diagnostic and
  preserves the legacy record instead of inferring missing identities from current files

#### Scenario: Existing manual timestamp rollback

- **WHEN** an operator explicitly invokes the existing `--to=<name>` interface
- **THEN** its documented timestamp behavior remains available and is not presented as an
  exact-set deployment recovery guarantee
