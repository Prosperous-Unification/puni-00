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

### Requirement: Archive byte facts preserve allocation uncertainty

The existing verified archive boundary SHALL provide digest-bound layer byte facts through bounded complete streaming inspection without filesystem extraction. Compressed bytes, decoded tar-stream bytes and logical file payload MUST remain separate from physical allocation, process memory and runtime demand. These facts MUST NOT replace unknown unpack or memory allowances or grant creation authority.

#### Scenario: Locked layers are completely inspected

- **WHEN** the actual retained verified archive contains supported complete layers
- **THEN** byte facts identify the archive and ordered layers and report decoded stream bytes, logical payload and entry counts
- **AND** overwritten or deleted layer contributions receive no speculative storage credit
- **AND** original and retained import identities remain unchanged while physical allocation, heap and import demand remain unknown

#### Scenario: Layer inspection cannot establish complete facts

- **WHEN** input is missing, unreadable, changed, malformed, truncated, unsupported or exceeds the bounded expansion, member or metadata contract
- **THEN** the production reader refuses without returning partial sums as complete facts
- **AND** it neither extracts paths nor silently skips unsupported tar, link or whiteout semantics

#### Scenario: Byte facts are consumed for planning

- **WHEN** deterministic byte facts are available
- **THEN** complete device, filesystem, memory, concurrency and runtime accounting remain separately required
- **AND** no declared claim capacity, decoded byte sum or measured peak is relabeled as a physical quota or total process-memory bound

### Requirement: Rehearsal source inventory retains closure and uncertainty

The rehearsal inventory SHALL consume the existing validated packet's actual stage builds and pinned Helm expansions, retaining source, tool, archive, namespace and object provenance. It MUST distinguish source declarations from provider/bootstrap/runtime obligations and MUST NOT infer capacity, creation authority or runtime acceptance from source inventory.

#### Scenario: Selected sources produce an inventory

- **WHEN** a complete validated packet is inventoried
- **THEN** its required stage outputs and discovered release expansions retain exact byte hashes, object identities, native images, claim references and hook phases
- **AND** enabled objects come from actual rendered output while disabled values alone produce no runnable entry
- **AND** release declarations stay linked to their expansions without double counting the same owner

#### Scenario: A required source or tool identity is not established

- **WHEN** a required stage or expansion is omitted, bytes or chart identities drift, or a matching-version Helm executable differs from the verified locked artifact
- **THEN** inventory refuses instead of accepting a narrowed or substituted source view
- **AND** archive and extracted executable digests remain distinct provenance facts

#### Scenario: Namespace or provider scope is unresolved

- **WHEN** an object has an unfamiliar API, scope or provider-produced behavior
- **THEN** its known declaration and concrete unresolved facts remain visible without a guessed namespace or zero-demand classification
- **AND** known malformed shapes, duplicate ownership and contradictory identities refuse

#### Scenario: Existing source contracts are preserved

- **WHEN** shared structural decoding is reused by inventory
- **THEN** existing prepare/validate outputs and observability API/default namespace policy remain unchanged
- **AND** no smaller test graph bypasses the production packet contract

#### Scenario: Source inventory is not runtime acceptance

- **WHEN** stage and chart inventory succeeds
- **THEN** bootstrap/helper/provider closure, lifecycle accounting, host observations and runtime acceptance remain separately required
- **AND** inventory grants no creation authority and records transport as not evaluated in its own scope without relabeling the existing authenticated binding implementation

### Requirement: Bootstrap contributors retain exact source and lifecycle origins

The source inventory SHALL retain the selected Git input's Flux install, local platform topology and policy bootstrap inputs with exact source/artifact hashes. It MUST distinguish bootstrap application origins from Flux stage ownership and from observed runtime behavior. It MUST reuse the existing structural inventory and runner/bootstrap contracts without creating a second graph runner or capacity calculator.

#### Scenario: A complete packet retains bootstrap inputs

- **WHEN** the full selected packet is prepared and inventoried
- **THEN** the committed Flux install and local platform topology are retained through the existing source collector before artifact hashes are computed
- **AND** the Flux install bytes match the same packet's manifest lock
- **AND** source inputs remain bound to the selected Git revision rather than mutable original-checkout bytes
- **AND** native bootstrap images and templates retain explicit bootstrap origins using the shared structural decoder

#### Scenario: A required bootstrap input drifts

- **WHEN** a required Flux/topology/policy input is omitted, unreadable, malformed or contradicts its bound manifest hash
- **THEN** the production inventory refuses instead of accepting an incomplete bootstrap view as source closure

#### Scenario: Bootstrap and a stage apply the same object

- **WHEN** independently decoded bootstrap and stage declarations have the same group, kind, namespace and name and equal definitions
- **THEN** inventory records one physical object with both lifecycle origins
- **AND** stage-only generated objects remain explicit
- **AND** unequal shared definitions refuse instead of silently merging them
- **AND** unrelated cross-stage duplicate-owner checks remain strict

#### Scenario: A rendered digest reference omits its locked tag

- **WHEN** the exact rendered repository and digest match a supported structured chart lock record whose name also contains a tag
- **THEN** inventory retains the rendered string and exact lock coordinates as separate linked facts
- **AND** a digest from another repository or a changed digest cannot establish that link
- **AND** existing strict platform/source guard contracts and pinned values remain unchanged

#### Scenario: External runtime demand remains unresolved

- **WHEN** node/system, registry, load-balancer, serial tool, import, provisioning, solver or transfer roles are declared by the existing topology and bootstrap flow
- **THEN** inventory retains their known source/pin origins and concrete unresolved realization facts
- **AND** an unknown helper cannot disappear behind a complete or zero-demand classification
- **AND** arbitrary ConfigMap strings are not treated as already active Pods
- **AND** no image sizes, process allowances, capacity totals, runtime identities or creation authority are invented

#### Scenario: Bootstrap inventory remains source evidence

- **WHEN** bootstrap contributor inventory succeeds
- **THEN** actual runner-input equality, lifecycle and writer accounting, admitted measurements, host facts and full runtime/live acceptance remain required
- **AND** runtime and creation authority remain false, with transport not evaluated in this receipt
