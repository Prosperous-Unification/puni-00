## ADDED Requirements

### Requirement: Common deployed behavior

Local integration rehearsal, dev and production candidates SHALL derive their observability services from one versioned set of component definitions and pinned runtime versions. The acceptance path MUST exercise the same log, trace, metric, alert, access and recovery contracts. A lightweight fixture or transitional Compose deployment MUST NOT certify parity with the Kubernetes deployment.

#### Scenario: All candidates contain the trace path

- **WHEN** local, dev and production candidates are rendered from one reviewed revision
- **THEN** every candidate contains the edge collector, compatible Elastic gateway with APM enrichment and aggregates, Elastic/Kibana, Prometheus and Alertmanager, with the existing Grafana integrated by an explicit owner
- **AND** deleting the trace pipeline or changing one environment's gateway pin makes the production validation entrypoint fail

#### Scenario: A fixture cannot establish deployment parity

- **WHEN** a rehearsal sends telemetry only to a fixture receiver, or validates only Compose
- **THEN** its evidence is identified as component evidence and cannot satisfy Kubernetes deployment acceptance

### Requirement: Explicit environment differences

The system SHALL compare rendered candidates semantically and refuse differences outside a versioned, narrowly scoped list. Each permitted difference MUST name its exact field, environments, reason and verification. Unknown fields, absent inputs, unreadable configuration and malformed exception records MUST fail. Whole subtrees, runtime-version drift and weaker security or recovery semantics MUST NOT be admitted as generic dev exceptions.

#### Scenario: Capacity differs for a measured reason

- **WHEN** a dev memory limit differs at an explicitly permitted field with capacity evidence
- **THEN** comparison accepts that field and continues checking every sibling field

#### Scenario: An exception does not hide a disabled guard

- **WHEN** an allowed capacity patch also disables TLS verification, removes a persistent queue or changes a health acceptance rule
- **THEN** comparison rejects the candidate and identifies each unauthorized behavioral difference

### Requirement: Separate deployment and signal identities

Adapters SHALL distinguish the deployment target's cluster/namespace identity from the source application's environment and revision. Stored telemetry MUST retain measured source identity. Unknown source environment MUST be visible or refused at the applicable input boundary and MUST NOT be replaced by the monitoring host's profile name. Cross-environment ingestion and query permissions MUST match the explicitly declared isolation contract.

#### Scenario: Dev observed from a platform cluster

- **WHEN** an observer on a platform cluster collects a dev application's health revision
- **THEN** stored records retain the application's dev identity and measured revision independently of the cluster name

#### Scenario: Foreign telemetry cannot be relabelled into acceptance

- **WHEN** an input claims a different environment from the destination's admitted sources
- **THEN** acceptance refuses that input rather than overwriting its environment and reporting complete health

### Requirement: Common protected access and lifecycle

Every persistent environment SHALL enforce authenticated private access, query-versus-mutation separation, bounded resources, durable state and controller-managed process recovery. Local rehearsal SHALL exercise those mechanisms with disposable identities. Receiver and backup endpoints SHALL be explicit environment inputs; missing required credentials MUST refuse readiness rather than select an unauthenticated fallback.

#### Scenario: Invalid identity is refused everywhere

- **WHEN** a local, dev or production candidate receives a request with an untrusted certificate or a query identity attempts an administrative operation
- **THEN** the request is refused through the real deployed route
- **AND** a valid identity succeeds through the same route

#### Scenario: Local backup transport exercises certificate verification

- **WHEN** a local rehearsal candidate connects to its disposable snapshot or backup destination
- **THEN** it uses authenticated HTTPS with the configured trust anchor
- **AND** an unknown CA or a plaintext/certificate-verification bypass makes acceptance fail rather than becoming an environment exception

#### Scenario: A dev identity cannot access the production instance

- **WHEN** a valid dev client identity reaches a production ingest or query listener
- **THEN** production refuses that identity
- **AND** each instance accepts its own authorized identity through the same tested route

#### Scenario: A restarted process preserves history

- **WHEN** a collector or store process is terminated in an isolated authorized rehearsal
- **THEN** its deployment controller restores the workload within the declared bounded acceptance deadline
- **AND** known retained records remain queryable and observation health reflects any gap

### Requirement: Ownership and capacity precede migration

Migration planning SHALL bind a reviewed revision to fresh target identity, namespace/controller ownership, prerequisite readiness, safe credential metadata, capacity including coexistence, and retained-volume identities. Read denial, unready dependencies and unknown ownership MUST block live readiness. Flux SHALL own long-lived platform resources; an alternative apply path MUST NOT bypass its dependencies. Existing Grafana, Victoria, MLflow and application services MUST be preserved.

#### Scenario: Denied cluster read blocks live readiness only

- **WHEN** SSH succeeds but authorized Kubernetes inspection fails
- **THEN** the source candidate remains reviewable while live migration is explicitly blocked
- **AND** no guessed cluster identity or direct apply is substituted

#### Scenario: Shared controllers are not installed twice

- **WHEN** two instances use one cluster
- **THEN** their deployment plan resolves one owner for cluster-scoped controllers and CRDs, distinct service/store identities, and scoped selectors
- **AND** duplicate controller ownership, shared writable claims or cross-instance selectors make validation fail

### Requirement: Retained-history cutover

A dev migration SHALL retain the Compose stores and the old telemetry path until the replacement satisfies the same stored-query, UI, isolation and bounded outage acceptance. It MUST use supported snapshot/restore or explicitly queryable retained history, never attach one writable store volume to two runtimes. Each cutover and rollback MUST use a new ownership receipt. Production activation and destructive retirement require separate authorization.

#### Scenario: Candidate failure preserves the old path

- **WHEN** the new candidate fails stored-query acceptance or an outage drill
- **THEN** its route is not promoted, the current dev route remains usable and all retained stores remain intact

#### Scenario: Repeated rollback and restore keeps evidence

- **WHEN** a completed cutover is rolled back and later restored again
- **THEN** each operation has a distinct immutable receipt and prior receipts are not overwritten
- **AND** known historical Elastic and Prometheus evidence remains queryable at its recorded location

### Requirement: Evidence states are distinct

Reports SHALL distinguish source conformance, runtime rehearsal and actual live migration. They MUST bind evidence to exact revisions, target identities and observed commands. Planned production readiness, passing render validation and an accepted ingest response MUST NOT be reported as live stored-signal acceptance.

#### Scenario: Rendered production candidate is not a production deployment

- **WHEN** shared candidates pass local checks but live production activation has not occurred
- **THEN** the report identifies source and rehearsal evidence separately and leaves production live readiness unverified

### Requirement: Native API providers precede consumers

The generated deployment graph SHALL await the existing Prometheus controller Helm release in a prerequisite Flux stage before applying native ServiceMonitor resources. It MUST retain one controller owner, exact release identities and existing Helm dependencies. Declared packet validation MUST reject missing readiness/dependency barriers independently of matching generated bytes.

#### Scenario: A fresh target lacks the monitoring API

- **WHEN** the common graph reconciles on a target without the ServiceMonitor CRD
- **THEN** its controller stage becomes Ready and the API is Established before the application stage applies native ServiceMonitors
- **AND** removing that barrier or combining provider and consumers makes source validation refuse rather than treating Kustomize build success as runtime readiness

### Requirement: Disposable resource evidence precedes ownership use

The strict rehearsal path SHALL retain actual creator-returned container/network identities, same-daemon creation/mount corroboration and a complete expected resource set before consuming ownership evidence. It MUST NOT infer ownership from names or labels. Raw private debug configuration and arbitrary event labels MUST NOT be persisted or exposed.

#### Scenario: A successful creation has accountable resources

- **WHEN** the existing runner creates a fresh strict rehearsal attempt
- **THEN** its exact returned identities, required creation/mount observations and resource inspections agree in exclusive durable attempt-bound evidence
- **AND** missing or conflicting creator evidence, a missed handshake, reuse, foreign attachment or persistence failure refuses complete accounting

#### Scenario: Partial creation retains uncertainty

- **WHEN** creation fails after some identities were recorded
- **THEN** individual evidence and the attempt remain retained while global completeness stays unknown
- **AND** no name/label-based automatic cleanup or failure rollback is authorized

#### Scenario: Recorded teardown retains storage

- **WHEN** a recorded attempt is torn down within its cooperative ownership boundary
- **THEN** the existing runner verifies daemon, exact container/network identities and attachments, removes only those recorded targets and retains volumes and private evidence
- **AND** missing/edited evidence, replacement or foreign attachments refuses the strict path without falling back to legacy teardown

### Requirement: Strict bootstrap consumes a verified retained artifact

The strict full-rehearsal path SHALL require an explicit prebuilt object-store archive and validate its bounded complete import identity against the committed lock before creating Docker resources. It MUST retain and import the same verified bytes on exact owned nodes of the captured daemon without an implicit image build. Ordinary legacy build behavior remains explicit; the app profile requires no object-store archive. Artifact availability MUST NOT replace full capacity or runtime acceptance.

#### Scenario: A locked archive is reused

- **WHEN** a strict non-app attempt receives a complete valid archive for the locked object-store image
- **THEN** its retained bytes, manifest, config, ordered layers, sizes, platform and import references agree before creation and bootstrap imports those retained bytes without Buildx activity
- **AND** imported source and digest-alias targets still match the lock on exact owned nodes

#### Scenario: An unsafe archive refuses before creation

- **WHEN** the required archive is missing, unreadable, malformed, unsafe, duplicated or conflicts with a locked identity, size, platform or import reference
- **THEN** the production lab path refuses before Docker resource creation without rebuilding or silently selecting another artifact

#### Scenario: The original path changes after capture

- **WHEN** original archive bytes change after successful private capture
- **THEN** bootstrap consumes only the retained verified bytes and their receipt, preserving the original source distinction and all existing ownership checks

### Requirement: Generated workloads have finite planning inputs

The shared candidate SHALL declare complete positive resource maps for its selected application, init, reloader and monitoring-hook roles through supported pinned-provider inputs. It MUST preserve existing positive capacity and storage identities and reject omitted required role bounds. Declared inputs MUST remain distinct from actual generated Pods and enforcement evidence used for full admission.

#### Scenario: The selected roles are planned

- **WHEN** both service instances and their shared controllers are generated
- **THEN** the selected supported role inputs contain positive CPU, memory and ephemeral-storage requests and limits without lowering existing positive bounds
- **AND** supported scratch-volume limits are declared while unsupported memory-volume enforcement remains an explicit admission prerequisite

#### Scenario: A required bound is omitted

- **WHEN** a required selected role or positive resource input is removed or replaced with zero
- **THEN** the production candidate validation refuses rather than treating the missing demand as zero

#### Scenario: Source output is not effective Pod evidence

- **WHEN** pinned chart and role-input validation succeeds
- **THEN** the result remains source evidence and full rehearsal still requires actual complete generated roles, resource enforcement, capacity and readiness

### Requirement: Cold-start planning shares exact workload accounting

Native cold-start costs SHALL be derived from byte-bound source artifacts through the existing workload normalizer and shared quantity/capacity arithmetic. The implementation MUST preserve preflight ownership and cutover behavior, including CPU requests with finite limit evidence, and distinguish scoped native contributions from full admission authority.

#### Scenario: Complete native inputs fit a declared capacity

- **WHEN** byte-bound native artifacts have supported complete resource, replica, concurrency and claim inputs
- **THEN** namespace-scoped owners, init sequencing and claims produce exact contributions and the shared evaluator reports fit or named deficit
- **AND** this alone cannot authorize lab creation or certify runtime health

#### Scenario: A contribution is not known

- **WHEN** a runnable owner or capacity behavior cannot be modeled from the selected source contract
- **THEN** its identity and concrete missing fact remain incomplete rather than zero
- **AND** malformed trusted bytes, hash drift, duplicate ownership or contradictory inputs refuse

#### Scenario: Cutover accounting is preserved

- **WHEN** shared calculation is used by existing preflight
- **THEN** memory, CPU-request overcommit, claim, replica, placement and freshness outcomes remain unchanged
- **AND** cold start never supplies fictional Ready, Bound or UID state

### Requirement: Generated capacity traits retain their evidence boundary

Selected generated-workload capacity traits SHALL consume the same validated role inputs and workload normalizer as source validation. Provider-specific mapping MUST remain outside shared capacity concepts. Byte-bound source, provider/runtime pins, per-replica resource and claim facts, unassessed concurrency and unobserved enforcement MUST remain distinguishable. Source traits MUST NOT fabricate effective Pods or grant creation authority.

#### Scenario: Selected provider inputs produce traits

- **WHEN** the exact supported ECK and Prometheus-operator inputs for both instances are decoded
- **THEN** named roles, sequential init order, source resource quantities, scratch and requested claims produce source-bound per-replica traits
- **AND** unresolved operator overlap, generated-input overhead and effective runtime facts remain named blockers rather than nominal replica totals charged as complete demand

#### Scenario: A named generated memory volume has no literal size limit

- **WHEN** an internal source policy authorizes exactly one supported Memory volume with absent literal sizeLimit and complete application and sequential-init limits
- **THEN** the shared normalizer derives the conservative Pod memory upper bound as max(sum(application limits), max(sequential init limits)) plus Pod overhead
- **AND** it adds neither that bound nor overhead twice, preserves the absent source sizeLimit and records enforcement as unobserved
- **AND** missing or wrong policy identity, unsupported volumes, invalid explicit limits or incomplete resource shapes refuse

#### Scenario: Standalone metadata projection is source-policy scoped

- **WHEN** the internal policy authorizes the selected standalone downwardAPI volume
- **THEN** actual safe metadata field paths, unique relative file paths, read-only mounts and effective file modes, including zero, are retained without inventing metadata values or zero overhead
- **AND** missing or contradictory selectors, unsafe paths, invalid modes, mixed volume sources and duplicate identities refuse before unrelated unsupported recovery

#### Scenario: Default normalization remains strict

- **WHEN** existing cutover or native callers omit the new source policy
- **THEN** their accepted schemas, normalized output and first-refusal behavior remain unchanged
- **AND** standalone downwardAPI and emptyDir without a finite literal sizeLimit remain unsupported for those callers

#### Scenario: Provider or cost-bearing closure is unsupported

- **WHEN** required roles, source hashes, provider/runtime identity or claim binding conflict, or an additional cost-bearing shape is unsupported
- **THEN** malformed trusted inputs refuse and supported-but-unmodeled demand remains explicitly incomplete
- **AND** selecting known roles never hides additional demand or relabels source evidence as an actual Pod observation
