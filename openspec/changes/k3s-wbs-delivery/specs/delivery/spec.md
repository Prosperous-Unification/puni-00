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

### Requirement: Cutover replay evidence binds original inputs

Cutover export and restore SHALL require original descriptor bytes and their separate SHA-256 pin. Incoming backend identity SHALL match the descriptor, and old/incoming immutable backend digests SHALL be equal. Export SHALL inventory retained history independently and execute the old image's own capability CLI before checkpoint or VACUUM, refusing unsupported history without a snapshot. Versioned replay evidence SHALL bind these inputs to the export SHA-256.

#### Scenario: Guarded retained history meets an incompatible image

- **GIVEN** nested forward/inverse or precondition-only move markers, including empty snapshots, or retained replacement commands
- **WHEN** the old image has empty or insufficient replay capabilities
- **THEN** export refuses before checkpoint and snapshot creation, preserving the stopped source database

#### Scenario: Descriptor bytes or backend identity change

- **GIVEN** an independently pinned descriptor and equal immutable backend digests under different host/cluster references
- **WHEN** original bytes, their pin, the incoming descriptor image or old digest differ
- **THEN** export/restore preparation refuses
- **AND** matching digest aliases remain valid

#### Scenario: Optional deletion snapshots require their own capability

- **GIVEN** own `deletionState` properties on nested forward/inverse `delete_subtree` or `restore_subtree`, including empty collections
- **WHEN** independent inventory runs
- **THEN** it reports `delete_state_v1` once per marked row, resetting between rows
- **AND** any own `moveProgress` precondition independently reports `move_progress_v1`
- **AND** export/coordinator admission refuses images lacking the required capability while legacy markerless rows remain valid

### Requirement: Restore replay admission precedes database rename

The restore Job SHALL verify incoming bytes, independently inventory the incoming database and run its own image capability CLI. It SHALL require matching descriptor, image, inventory, capabilities and export identity before database rename. Refusal SHALL preserve the source export and failed arrival artifacts with the target absent. Verification SHALL require matching versioned replay evidence and explicitly refuse legacy reports. Stale arrival markers SHALL never authorize retry.

#### Scenario: Restore cannot replay imported history

- **GIVEN** matching exported bytes and versioned replay evidence
- **WHEN** incoming history or image observation is missing, unreadable, malformed, changed or unsupported
- **THEN** the target remains absent and source export remains intact

#### Scenario: Retry encounters a stale arrival marker

- **GIVEN** arrival artifacts retained after a refused restore
- **WHEN** another restore starts using the same marker, even after capabilities become compatible
- **THEN** it refuses before rename and requires explicit reviewed cleanup

#### Scenario: Exact matching control

- **GIVEN** matching original descriptor bytes, immutable image digests and replay evidence
- **WHEN** restore independently validates matching incoming bytes and replay observations
- **THEN** the restored database is byte-for-byte equal to the export and reports the same versioned evidence

### Requirement: Cutover preparation does not start tiers

Prepared cutover manifests SHALL hold every Deployment at zero. First-start scale admission, release-record persistence and Flux handoff SHALL remain pending a separate guard.

#### Scenario: Preparation renders a running backend

- **GIVEN** rendered release manifests with nonzero replicas
- **WHEN** cutover preparation emits manifests
- **THEN** all Deployment replicas are zero
- **AND** malformed manifests or an absent/duplicate backend are refused

### Requirement: First-start admission binds the actual restored PVC

The first-start coordinator SHALL use durable state separate from release journal schema 3. Before scaling, it SHALL hold the WBS Lease and closed writer fence, verify Flux suspension and stopped writers, validate matching descriptor-bound export/restore evidence and restore Job identity, and freshly inspect the actual PVC.

#### Scenario: A changed actual volume cannot reuse restore evidence

- **GIVEN** a completed restore Job and matching original reports
- **WHEN** the mounted database bytes, retained replay inventory or activation authority differs
- **THEN** no tier scales and the Lease, closed fence and Flux suspension remain held

#### Scenario: Durable evidence precedes the first scale

- **GIVEN** a fresh compatible actual-PVC observation under the Lease and fence
- **WHEN** first-start proceeds
- **THEN** admission is persisted and read back before every intended tier starts explicitly at its pinned digest
- **AND** admission binds original descriptor bytes/pin, export/restore evidence, cluster/context, namespace/PVC UIDs/path, restore Job UID, transaction, all tier images and desired Flux revision
- **AND** ready rollout and persisted release-record readback precede Flux handoff

#### Scenario: Interrupted scaling repeats the stopped-writer observation

- **GIVEN** a first-start transaction interrupted during scaling
- **WHEN** its owner resumes the durable request
- **THEN** every tier stops and a fresh actual-PVC inspection repeats before any restart
- **AND** foreign, malformed, missing or altered durable admission refuses before mutation

### Requirement: First-start authority stays disabled

The actual image-owned activation authority SHALL exist and validate its migration ledger, singleton marker and exact triggers. Its marker SHALL remain DISABLED. First-start SHALL refuse a nonempty WAL and SHALL never enable authority.

#### Scenario: Activation authority is missing or already enabled

- **GIVEN** a restored database with missing, malformed or unreadable authority, altered triggers, an enabled marker or a nonempty WAL
- **WHEN** first-start inspects the actual PVC
- **THEN** admission refuses before scaling

### Requirement: Flux first-start handoff preserves the closed fence

Before resuming Flux, the coordinator SHALL admit the exact desired source tree against its pinned revision and prove that reconciliation preserves the closed writer fence and intended tier/PVC contracts. It SHALL observe matching applied revision and closed fence after reconciliation. An unfenced desired revision SHALL refuse before resume. Traffic opening SHALL remain a separate attended cutover operation.

#### Scenario: A pinned unfenced source cannot open a handoff interval

- **GIVEN** the desired Flux revision pins the intended images but opens writer ingress
- **WHEN** the coordinator attempts first-start handoff
- **THEN** it refuses before Flux resumes and preserves the Lease, closed fence and suspension

### Requirement: First-start admits complete immutable source and traffic actors

Before scale or resume, the coordinator SHALL admit actual live referenced GitRepository
URL/commit bytes, bind source and Kustomization UIDs/config/artifact, conditionally pin
that commit, and require one regular release.yaml with complete trusted fenced resource
inventory. It SHALL revalidate immediately before conditional resume. Backend mount,
volume and label contracts SHALL be exact and startup overrides SHALL refuse. Complete
Pod/controller and NetworkPolicy inventories SHALL refuse alternate writers/public
allowances. Writer and public ingress SHALL remain fenced while backend readers remain
available for gateway readiness. A missing journal with an existing Lease SHALL refuse
before mutation.

#### Scenario: Desired revision opens public ingress while writer remains fenced

- **GIVEN** a desired commit with matching tier digests and closed writer selector but open public ingress
- **WHEN** first-start admits the actual referenced source
- **THEN** it refuses before scaling or resuming Flux

#### Scenario: Hidden PVC or public traffic actor exists

- **GIVEN** an unlabeled or terminating PVC Pod, unknown capable controller, startup override or alternate allow policy
- **WHEN** first-start observes complete live inventories
- **THEN** it refuses and retains suspension, fences and its Lease

#### Scenario: Durable journal disappeared while Lease remains parked

- **GIVEN** an existing parked Lease and missing first-start journal
- **WHEN** a new transaction attempts first-start
- **THEN** it refuses before any cluster mutation
