## ADDED Requirements

### Requirement: Staging and production use identical artifact bytes

Promotion SHALL deploy the exact per-tier image digests and admission identities proved by staging without rebuilding.

#### Scenario: Production descriptor differs from staging

- **GIVEN** a passing staged release descriptor
- **WHEN** production promotion receives a changed image, source, package, or activation identity
- **THEN** deployment is refused

### Requirement: Stateful release is one recoverable transaction

The release coordinator SHALL serialize deployment under a Lease and journal backup, migration, rollout, verification, rollback, and Flux suspension state.

#### Scenario: Migration fails

- **GIVEN** a captured consistent backup and a failing migration
- **WHEN** release apply runs
- **THEN** writes remain fenced, rollback restores the recorded migration/data state, and Flux ownership resumes only after recovery is verified

#### Scenario: Coordinator restarts after rollout

- **GIVEN** a journaled release interrupted after new tier start
- **WHEN** the coordinator restarts
- **THEN** it re-observes the same release identities and continues or rolls back without starting another writer

#### Scenario: Rollback fails

- **GIVEN** a failed release and a rollback step that cannot restore its recorded state
- **WHEN** recovery executes
- **THEN** the journal stays failed, writes remain fenced, and the exact manual completion command is reported

### Requirement: First cutover remains reversible

The Compose-to-k3s cutover SHALL record old/new digests, database integrity, applied migrations, DNS/edge effects, downtime, and the boundary after which rollback uses the k3s recovery transaction.

#### Scenario: Production inputs are incomplete

- **GIVEN** a staged release without the concrete production operation plan or authorization
- **WHEN** production delivery is requested
- **THEN** implementation artifacts remain ready and no production mutation occurs
