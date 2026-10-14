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

### Requirement: Replay compatibility observations are independent and immutable

The infrastructure replay inventory SHALL inspect both journal directions recursively through batches, independently of image application code and live blockage facts. It SHALL refuse missing, unreadable or malformed trusted state and unknown command kinds. Image capability observations SHALL execute image-owned code and bind validated output to the exact image digest.

#### Scenario: Empty live facts with nested guarded history

- **GIVEN** no live blockage facts and nested inverse moves or precondition metadata containing empty snapshot markers
- **WHEN** the infrastructure inventory executes against the database
- **THEN** it reports `move_progress_v1` once per affected journal row for own move `expectedProgress` or own precondition `moveProgress` properties, including empty arrays/maps
- **AND** it counts every nested `replace_blockage` command in both directions

#### Scenario: Each immutable image owns its vocabulary

- **GIVEN** an exact SHA-256 backend image reference
- **WHEN** capability observation runs
- **THEN** it executes that image's own `src/step-blockage-replay-kinds-cli.ts` and binds the validated string vocabulary to the same image reference
- **AND** only a genuinely absent CLI under a readable/searchable source directory yields the prior empty vocabulary
- **AND** missing/unreadable source directories, dangling/nonregular CLI paths, unreadable CLI files, failed execution, malformed output or mutable image references refuse observation

### Requirement: Kubernetes replay admission is durable under the writer fence

The release coordinator SHALL inventory retained history under its Lease and writer fence after writers stop and before capture. It SHALL persist receipts binding target, transaction, direction, inventory and exact candidate/previous image capabilities. Forward admission SHALL require both images. Rollback SHALL record fresh previous-image admission before restoring tiers or reopening writes and SHALL refuse changed fenced inventory.

#### Scenario: Guarded history precedes forward capture

- **GIVEN** retained nested inverse or precondition-only guarded moves with empty snapshots
- **WHEN** either exact backend image lacks `move_progress_v1`
- **THEN** capture and migration do not start
- **AND** a previous image lacking the capability prevents automatic tier restoration or reopening

#### Scenario: Rollback refuses changed or unsupported inventory

- **GIVEN** a failed forward transaction with writes closed
- **WHEN** fresh rollback inventory differs from the durable forward summary, observation fails, or the previous image cannot replay it
- **THEN** bounded abort records `rollback-failed`, retains the fence and Lease, and reports the failed replay step and manual recovery command

### Requirement: Replay progress and reused Jobs retain their pinned inputs

Resume SHALL refuse missing, malformed, changed or foreign receipt progress before any journal or cluster mutation. Reused replay Jobs SHALL preserve requested fields and effective mount options, including absent subpath, access and propagation settings, before their output is accepted. Refused rollback SHALL retain the fence and parked Lease with explicit failure evidence and a manual completion command.

#### Scenario: Interrupted evidence is absent or changed

- **GIVEN** a recorded forward or rollback replay phase
- **WHEN** resume reads missing, malformed, altered or foreign evidence
- **THEN** the journal is preserved and no Lease claim or cluster mutation occurs

#### Scenario: A reused observation Job belongs to different inputs

- **GIVEN** an existing observation Job for the transaction
- **WHEN** its observed manifest differs from any pinned field, including image, command or database mount
- **THEN** its output is refused even if it reports successful completion

#### Scenario: Recovery loses the prior forward receipt

- **GIVEN** a post-reopen failure parked at `recovery-required`
- **WHEN** a recovery request reads a missing or null prior forward receipt
- **THEN** disk parsing refuses before Lease takeover, cluster work or journal replacement

#### Scenario: A reused Job changes omitted mount options

- **GIVEN** a replay Job pinning the database PVC root with default mount options
- **WHEN** the observed Job adds a subpath expression or changes effective access or propagation
- **THEN** inventory and capability output are refused even when completion and output are valid
- **AND** equivalent explicit Kubernetes defaults remain accepted
