## ADDED Requirements

### Requirement: Ownership preflight reports one read snapshot

The operator preflight SHALL return exactly `marker`, `unmappedRoots`, `catalogNameDrift`, and `ownershipConflicts`. It SHALL compose `readOrganizationActivation`, `findUnmappedRoots`, `findCatalogNameDrift`, and `findOwnershipConflicts` on one dedicated connection inside a deferred read transaction. Findings SHALL retain the existing queries' kind/id ordering. Both valid activation states SHALL be reported explicitly. It SHALL release its transaction on success and roll back on failure, leaving the connection reusable.

#### Scenario: Findings coexist

- **GIVEN** a copied WBS database containing an unmapped root, catalog name drift, and an ownership conflict
- **WHEN** ownership preflight runs
- **THEN** its report contains all three findings and the durable marker without changing ownership

#### Scenario: A writer commits during inspection

- **GIVEN** the marker read has pinned a snapshot
- **WHEN** a second connection commits a root before the later ownership queries
- **THEN** all report fields describe the original snapshot, and the next preflight sees the committed root

#### Scenario: Failure releases the snapshot

- **GIVEN** a required ownership table cannot be read
- **WHEN** preflight fails and the table is restored
- **THEN** the dedicated connection can run another preflight successfully

### Requirement: Operator invocation is read-only and refuses untrusted inputs

The CLI SHALL accept no arguments and require nonempty `DB_PATH`. It SHALL open that existing database read-only without creating a missing file, run the report, close the connection, and print one JSON document on stdout only after success. Completed inspection SHALL exit zero even with findings. Unexpected arguments, missing or empty environment input, absent or unreadable files, invalid SQLite, missing required query tables, and absent/unreadable/malformed marker state SHALL exit nonzero with an error on stderr and no stdout report. The opened connection SHALL reject writes and the database contents SHALL remain unchanged.

#### Scenario: Completed report with findings

- **GIVEN** a readable copied database with known ownership findings
- **WHEN** the CLI runs with only `DB_PATH`
- **THEN** it exits zero and prints the complete report; the findings remain explicit

#### Scenario: Refused invocation

- **GIVEN** unexpected arguments or missing/empty `DB_PATH`
- **WHEN** the CLI runs
- **THEN** it exits nonzero with no stdout and does not open an invented database

#### Scenario: Trusted state cannot be inspected

- **GIVEN** missing or permission-unreadable database, invalid SQLite, or broken required schema or marker
- **WHEN** the CLI runs
- **THEN** it exits nonzero with stderr context and no stdout report

#### Scenario: Actual CLI connection rejects mutation

- **GIVEN** the CLI has opened its supplied database
- **WHEN** a test injects a write through that actual connection
- **THEN** SQLite refuses it, and replacing the opener with a writable opener makes this negative test fail

### Requirement: Report scope does not imply activation readiness

The operator contract SHALL state that the report covers only the marker and three named ownership queries. It SHALL name excluded opaque journal/captured bodies, reviewed production identity and access inventory, old-process drain, and MCP credential epoch/actual activation evidence. It SHALL NOT expose an activation-ready verdict or mark parent tasks 1.1 or 7.1 complete.

#### Scenario: Empty findings

- **GIVEN** all three ownership query arrays are empty
- **WHEN** the report is printed
- **THEN** it contains the marker and empty arrays without any readiness approval
