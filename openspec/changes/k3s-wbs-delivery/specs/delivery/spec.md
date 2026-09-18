## ADDED Requirements

### Requirement: Staging and production use identical artifact bytes

Promotion SHALL deploy the exact per-tier image digests and admission identities proved by staging without rebuilding.

#### Scenario: Production descriptor differs from staging

- **GIVEN** a passing staged release descriptor
- **WHEN** production promotion receives a changed image, source, package, or activation identity
- **THEN** deployment is refused

#### Scenario: Admission or gate evidence fails

- **GIVEN** a candidate whose admission record certifies another commit, lacks package or activation identities, or whose `ci` gate or browser job did not pass
- **WHEN** staging or production delivery prepares the descriptor
- **THEN** no descriptor is sealed and no cluster is contacted

#### Scenario: Candidate code and deploy credentials never meet

- **GIVEN** the CD workflow for any environment
- **WHEN** it runs
- **THEN** candidate code runs only on an ephemeral runner without deployment secrets, and the protected deploy job checks out only the trusted main commit

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

#### Scenario: Desired revision is published under suspension only

- **GIVEN** a Flux-managed environment and a prepared deploy-repository commit
- **WHEN** the release reaches `reconcile-desired` while the WBS unit is not suspended, or the deploy branch is not at the previous release's revision
- **THEN** nothing is pushed and the release reports why

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
