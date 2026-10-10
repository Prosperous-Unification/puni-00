## ADDED Requirements

### Requirement: Recoverable daily snapshots

After a disposable restore drill proves retention replay, the operator SHALL be able to activate one consistent, integrity-checked website SQLite snapshot per UTC day in a private directory. Snapshot metadata SHALL identify the database migration set, backup instant and authoritative remote retention-record position. The service SHALL retain the most recent proven-restorable snapshot before aging any older snapshot. A failed or unverified new snapshot SHALL not delete an older recovery copy.

#### Scenario: Verified daily snapshot

- **WHEN** the daily backup job finishes a consistent snapshot and an isolated restore replays later retention decisions
- **THEN** the snapshot is recorded as restorable and eligible to replace an older recovery copy

#### Scenario: Failed replacement backup

- **WHEN** a daily snapshot fails integrity, migration or restore-replay validation
- **THEN** no previous backup is removed and the job reports a failed backup state

### Requirement: Bounded backup age

After activation, the backup lifecycle SHALL target a rolling 30-day age for website snapshots, including pre-release copies. It SHALL remove an aged copy only after a newer snapshot has passed restore proof, and SHALL record any explicit operator incident hold. If a required backup or authoritative remote recovery record and latest-head witness is unavailable, the lifecycle SHALL report an overdue retention exception rather than silently delete the last usable copy or claim the age policy is met. Restored databases SHALL replay all later erasures, client designations and classification holds for both retention subject types before serving.

#### Scenario: Aged pre-release snapshot

- **WHEN** a pre-release snapshot exceeds 30 days, has no recorded incident hold, and a newer snapshot has passed restore proof
- **THEN** the aged snapshot is removed with an audit record while the newer recovery copy remains

#### Scenario: Journal unavailable during restore

- **WHEN** an otherwise valid backup is selected but its required later retention record cannot be read or verified
- **THEN** restore refuses to serve the backup and retains it for operator diagnosis
