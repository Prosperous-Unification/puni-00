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

### Requirement: Native ordinal charges retain lifecycle conditions

Native lifecycle accounting SHALL consume the existing validated rehearsal source traversal and reuse shared quantities, workload normalization and the native ledger. A dedicated Kubernetes adapter MUST distinguish declared/defaulted source policy, supported lifecycle conditions and unobserved runtime prerequisites. Native subset charges MUST NOT confer creation authority or complete whole-attempt admission.

#### Scenario: Supported StatefulSet source gains ordinal charges

- **WHEN** validated apps/v1 StatefulSet inputs use supported default or explicit OrderedReady and RollingUpdate policy in one immutable-source attempt
- **THEN** accounting retains one full normalized Pod charge per supported ordinal through creation, process recovery and graceful same-template replacement
- **AND** selected real source owners gain nonzero native charges without hardcoded owner budgets or a second calculator
- **AND** terminating source demand is never replaced by an assumed zero

#### Scenario: Source defaults remain distinguishable from observations

- **WHEN** supported API defaulting supplies omitted lifecycle policy or grace fields
- **THEN** the declared absence, pinned provider default and derivation provenance remain distinguishable
- **AND** the source-render capability and intended runtime pin remain separate from observed runtime versions
- **AND** a grace value is not presented as a guaranteed physical reclamation deadline

#### Scenario: A source or recognized input is malformed

- **WHEN** required frame identity/hash/namespace closure drifts, counts are malformed, or supplied quantities, claims or volumes contradict their known contract
- **THEN** production accounting throws before an unsupported lifecycle or missing-bound shortcut can conceal the malformed input
- **AND** valid absent resource declarations in the broad inventory remain named incomplete facts without invented maps or caps
- **AND** legacy selected-input missing-bound refusals remain strict

#### Scenario: A lifecycle is outside the supported scenario

- **WHEN** forced deletion, lost-node execution, foreign mutation, unbound old templates, unsupported ordinal or management policy, or unaccounted controller generations are required
- **THEN** the affected lifecycle remains explicitly incomplete rather than receiving a nominal-replica peak
- **AND** Deployment, DaemonSet, Job, CronJob, generated-operator and writer obligations remain separately visible until their own accounting is implemented

#### Scenario: Replacement reuses an ordinal claim

- **WHEN** a supported same-template StatefulSet ordinal reuses its source claim template
- **THEN** the namespace/controller/template/ordinal claim identity is charged once
- **AND** conflicting identities or sizes refuse
- **AND** requested claim bytes remain source reservations rather than observed Bound storage, retained usage or filesystem quotas

#### Scenario: Existing callers and full admission remain bounded

- **WHEN** common per-owner derivation is reused by the new whole-inventory native adapter
- **THEN** existing valid selected-input and cutover contracts remain unchanged and no caller can replace full production source validation with a filtered summary
- **AND** whole-attempt system/helper/image/transient/host accounting, effective enforcement and live acceptance remain required
- **AND** native source charges report no creation or runtime authority

### Requirement: Deployment charges retain bounded replacement conditions

Native Deployment accounting SHALL reuse the existing validated native source traversal and workload normalizer. A supported conditional envelope MUST charge each original and first replacement Pod fully, retain exact source/template identities and distinguish source declarations/defaults from unobserved runtime conditions. No Deployment strategy alone establishes a physical peak.

#### Scenario: A supported single replacement wave is accounted

- **WHEN** a supported apps/v1 Deployment has explicit positive replica count R and complete supported workload bounds
- **THEN** a conditional single-ReplicaSet, same-template first replacement wave retains R original and R first replacement Pod charges through termination
- **AND** source lifecycle/defaulting provenance identifies the intended pinned provider separately from observed runtime state
- **AND** source does not claim its strategy enforces the replacement-wave event exclusions

#### Scenario: A lifecycle or supplied source is unsuitable

- **WHEN** a supplied recognized lifecycle, count, quantity or volume value is malformed or contradictory
- **THEN** production accounting throws before missing bounds or unsupported policy can conceal it
- **AND** valid unsupported strategies, absent bounds or unsupported workload shapes remain named incomplete obligations

#### Scenario: A conditional source envelope cannot authorize creation

- **WHEN** Deployment contributions are emitted
- **THEN** actual single-ReplicaSet/template/generation identity, unchanged scale, first replacement identities and absence of further replacement or foreign mutation remain required runtime conditions
- **AND** rollout, repeated replacement, old/new templates, forced deletion and lost-node execution remain outside this source envelope
- **AND** terminating Pods are never budgeted as zero and grace is not a reclamation deadline
- **AND** existing StatefulSet charges and unrelated native/operator/writer/system/helper obligations remain visible
- **AND** creation and runtime authority remain false and whole-attempt admission stays incomplete

### Requirement: Shared networking workloads declare bounded resources

Shared cert-manager and Traefik source definitions SHALL declare explicit container CPU, memory and ephemeral-storage requests and limits. Their validated source and locked rendered workloads MUST agree. Workload limits are candidate policy inputs, not measured consumption or proven runtime enforcement.

#### Scenario: Common networking candidates have complete maps

- **WHEN** the shared cert-manager and Traefik releases are prepared
- **THEN** all three cert-manager controllers, its startup API-check Job and the Traefik container have explicit CPU, memory and ephemeral-storage requests and limits
- **AND** requests are nonnegative, limits are positive, quantities are valid and requests do not exceed limits
- **AND** Traefik's existing data and temporary emptyDirs have positive size limits while persistence remains disabled
- **AND** versions, images, workload identity, replicas, ingress/TLS/redirect behavior and supported environment parity remain unchanged

#### Scenario: A required source bound is missing or malformed

- **WHEN** a networking candidate omits a required map or field, supplies null or malformed quantities, contradicts request/limit relationships or loses a required emptyDir bound
- **THEN** its production source validation refuses before rendering or claiming a bounded candidate
- **AND** structural image-reference decoding remains distinct from the stricter current-candidate budget policy
- **AND** broad native source inventory still represents valid historical absent bounds as incomplete rather than inventing maps

#### Scenario: Limits activate resource-aware runtime settings

- **WHEN** the pinned Traefik chart derives Go runtime settings from explicit resource limits
- **THEN** the locked render retains the chart's resource-aware CPU and memory settings and their declared/defaulted provenance
- **AND** actual ingress, TLS, readiness, garbage collection and throttling under those limits remain required rehearsal checks
- **AND** source success cannot complete host admission, actual enforcement or runtime acceptance

### Requirement: Velero scratch patches have one validated execution contract

Both Velero releases SHALL bound their plugin init and writable storage without changing original chart/component/image pins. A narrow standard Flux Kustomize post-render patch MUST have the same source, target and effects in offline rendering. No ignored or arbitrary post-renderer may establish a bounded candidate.

#### Scenario: The supported patch is applied

- **WHEN** a current Velero candidate is prepared
- **THEN** the AWS-plugin init has complete CPU, memory and ephemeral requests/limits and its server has explicit ephemeral bounds
- **AND** exactly one supported inline JSON6902 patch tests the complete pinned volumes array and adds only the plugins and scratch size limits
- **AND** the original chart archive, images, credentials reference, namespace, endpoints and unrelated workload fields remain unchanged

#### Scenario: A patch or tool cannot establish its intended effect

- **WHEN** policy is missing, malformed, excessive, ambiguous or outside the exact supported target/operation shape, its quantities are invalid, or prepared locked tools cannot be authenticated
- **THEN** production source validation or direct offline rendering refuses before treating the workload as bounded
- **AND** missing or duplicate targets, failed preconditions, no-op output, wrong values and unrelated semantic changes refuse
- **AND** other releases cannot acquire arbitrary post-renderer permission

#### Scenario: The direct and canonical paths retain the same boundary

- **WHEN** the supported Velero release is rendered directly or through the canonical rehearsal producer
- **THEN** both use the same narrow decoder and the actual verified locked kubectl to apply the original source patch
- **AND** semantic identity/cardinality and exact effects are checked without a second patch interpreter, fallback download or validation bypass
- **AND** historical source inventory remains valid incomplete evidence without granting current-candidate readiness

#### Scenario: Source patch success remains distinct from runtime acceptance

- **WHEN** actual offline patched outputs satisfy the shared workload normalizer
- **THEN** source and generator identities, original chart provenance and patch source are retained separately from runtime facts
- **AND** actual Flux revision/patch binding, generated Pods, plugin installation/backup/recovery, writable storage/eviction/headroom and physical enforcement remain required
- **AND** runtime/creation authority and whole-attempt admission remain incomplete until their separate criteria pass

### Requirement: Serial Job attempts retain conditional lifecycle costs

The native capacity companion SHALL derive supported serial Job attempt charges through the existing validated traversal and workload normalizer, preserving source provenance and every independent incomplete contributor. A finite source envelope MUST NOT confer runtime or creation authority.

#### Scenario: A supported Job has bounded retry accounting

- **WHEN** a fresh unchanged serial NonIndexed Job has one completion, one parallel slot, supported failure/replacement behavior and a valid declared or pinned-default backoff limit B
- **THEN** the companion retains B+1 full normalized Pod charges, including failed and terminating attempts, with exact source/template/namespace and declared/defaulted provenance
- **AND** slots are accounting identities rather than observed Pod UIDs
- **AND** the conditional envelope explicitly requires reconciled successful and uncertain creates, durable nonduplicated failure accounting, no adoption or foreign mutation, and no further creation after success
- **AND** container restart, deadline, grace, TTL and hook deletion do not provide physical reclamation or cumulative log-growth bounds

#### Scenario: A known Job declaration is malformed or unsupported

- **WHEN** supplied known count, policy, selector, quantity or volume state is malformed or contradictory
- **THEN** the production entry refuses before unsupported-policy, missing-bound or provider-mismatch shortcuts
- **WHEN** the supplied declaration is valid but outside the supported serial scenario or has absent bounds
- **THEN** its unsupported policy or independent missing resource/storage facts remain explicit, without manufactured maps or zeroed demand

#### Scenario: A per-Job envelope cannot certify the whole attempt

- **WHEN** conditional Job contributions are derived from retained real source
- **THEN** existing StatefulSet/Deployment charges and unrelated obligations remain intact
- **AND** missing Helm invocation/retry/remediation, hook Job generations, Flux forced-recreation and predecessor-history bindings remain explicit whole-attempt obligations
- **AND** actual provider features, effective Pods, UIDs, mounts, logs and enforcement still require runtime evidence
- **AND** inventory remains source-only and creation/runtime authority remain false

### Requirement: Common container candidates declare ephemeral storage bounds

Current platform candidates SHALL declare explicit ephemeral-storage requests and limits for the registered registry, signal, exporter, object-store and setup/snapshot container roles. The bucket initializer MUST also bound its existing temporary emptyDir. These are candidate policy inputs, not measurements or a host admission verdict.

#### Scenario: The registered role is prepared from common source

- **WHEN** registry, signal metrics proxy/collector/gateway, blackbox exporter, kube-state-metrics, node exporter, local MinIO or setup/snapshot/bucket containers are prepared
- **THEN** each role has explicit nonnegative ephemeral requests and positive ephemeral limits with requests not exceeding limits
- **AND** its existing CPU/memory policy, images, versions, replicas, security, endpoints, storage identities and functional configuration remain unchanged
- **AND** common generated instances and actual locked outputs retain the declared bounds
- **AND** the bucket initializer's existing temporary emptyDir has a positive size limit without introducing a duplicate mount

#### Scenario: A required current bound is absent or invalid

- **WHEN** a current registered candidate lacks its required map, field or scratch size, supplies null or malformed quantities, or contradicts request/limit relationships
- **THEN** production candidate validation refuses before claiming bounded source readiness
- **AND** missing, unreadable or malformed required source files cannot be ignored
- **AND** structural/image reading still accepts valid historical absence as incomplete, without weakening existing supplied-value, image or ownership checks

#### Scenario: Source bounds preserve unrelated obligations

- **WHEN** a clean committed candidate is captured and normalized through the canonical source path
- **THEN** exact new resource/scratch values and source/generator identities are retained while unrelated source semantics and prior captures remain unchanged
- **AND** other unbounded receiver, Flux, node-agent, hostPath, lifecycle, system/helper/transient and retained-storage facts remain explicit
- **AND** actual startup/load/log/eviction/recovery and effective enforcement remain required before live activation
- **AND** source-only inventory and false creation/runtime authority do not become deployment permission

### Requirement: Conditional DaemonSet costs bind the selected source topology

The native capacity companion SHALL derive supported DaemonSet initial and first-replacement contributions through the existing source traversal and normalizer, bound to the same selected source's candidate-node population. No source condition or caller-provided count may establish runtime or creation authority.

#### Scenario: The source topology supports a conditional wave

- **WHEN** independently captured source/packet/bootstrap coordinates match exact retained topology bytes and the supported DaemonSet policy
- **THEN** N is the entire source-declared server-plus-agent population, without eligibility or scheduling discounts
- **AND** the companion retains N full initial plus N full first-replacement Pod charges, including failed and terminating demand
- **AND** source/template/namespace, declared/defaulted policy, topology provenance and synthetic candidate-slot identities are retained without inventing Node UIDs
- **AND** validated topology provenance is snapshotted so subsequent caller-input mutation cannot change the accepted record

#### Scenario: Topology evidence is missing, invalid or computationally unsupported

- **WHEN** legacy callers omit optional topology evidence
- **THEN** their existing native contributions remain usable and DaemonSet topology remains explicitly incomplete, without a default N
- **WHEN** supplied topology bytes, source coordinates, selected revision or artifact identity are malformed or mismatched
- **THEN** the native boundary refuses rather than trusting the evidence object's own count or hash
- **WHEN** a valid decoded candidate population falls outside the supported one-to-128 materialization range
- **THEN** the adapter reports an explicit computational limitation before allocating slots, without truncation or a physical-capacity claim

#### Scenario: Known policy validation precedes incomplete classification

- **WHEN** supplied known DaemonSet strategy, counts, placement, selector/template, toleration, affinity, restart, deadline or foreign-controller fields are malformed
- **THEN** the complete native prepass refuses before provider, missing topology, missing resources or unsupported-policy shortcuts
- **AND** valid unsupported policies remain named incomplete without inventing API contradictions or widening legacy contracts
- **AND** independent missing map, claim, volume, hostPath, log/runtime and generation/history obligations cannot be concealed by the first unsupported contributor

#### Scenario: The first-wave condition cannot certify the whole attempt

- **WHEN** conditional DaemonSet contributions are returned
- **THEN** one unchanged controller/template and fixed reachable Node UID set, complete reconciled creation histories, no prior/adopted work and at most one first replacement remain unobserved requirements
- **AND** rollout, repeated replacement/eviction, force/loss, node/placement changes, controller recreation and foreign mutation remain outside the bound
- **AND** grace, history, surge and cleanup policies provide no physical reclamation credit
- **AND** other native families and all system/helper/writer/transient/host obligations remain intact, with source-only inventory, incomplete state and false creation/runtime authority

### Requirement: Immutable helper selection and versioned effective image evidence

The rehearsal SHALL select its load-balancer and temporary helper images from a closed committed provider/version/platform lock, retaining index, selected manifest and config identities. The same selection MUST derive creation-plan references and the owned provider environment for ordinary and witnessed execution. Source metadata, effective image observations and runtime authority MUST remain distinct.

#### Scenario: Supported helper selection reaches creation

- **WHEN** the selected k3d version and linux/amd64 platform match the reviewed helper lock
- **THEN** both helper references use the selected immutable manifests and reach the owned load-balancer/tools environment overrides
- **AND** helper names, order and permanent/temporary roles remain unchanged
- **AND** inherited provider overrides remain refused by strict creation before mutation

#### Scenario: Supplied helper selection cannot be validated

- **WHEN** required lock state is absent, unreadable, malformed, unknown, or mismatched by provider/version/platform or repository identity
- **THEN** creation throws before resource mutation without a mutable-tag fallback
- **AND** syntactically valid digests alone do not establish registry provenance or physical image costs

#### Scenario: Effective helper identity is retained

- **WHEN** a new strict creation uses the selected helper lock
- **THEN** precreation helper image observations match its selected reference, manifest association, config identity and platform
- **AND** every permanent and temporary creator has the exact configured reference and expected effective config image ID
- **AND** each serial temporary creator has a unique retained exact-ID observation joined to its creator and lifecycle evidence
- **AND** missing, duplicate, substituted or mismatched evidence cannot seal a successful attempt

#### Scenario: Temporary helper disappears before observation

- **WHEN** a required exact-ID inspection loses the race with provider deletion, or retention fails
- **THEN** the attempt throws, retains partial evidence and cannot report ready or complete
- **AND** it does not retry by name, infer an effective ID from events, fabricate observations or claim to synchronize provider deletion

#### Scenario: Historical receipts retain their supported meaning

- **WHEN** an authentic old sealed receipt satisfies the complete closed historical format and existing identity checks
- **THEN** its existing receipt-based teardown remains available with current exact-ID/attachment checks and retained volumes/history
- **AND** historical evidence cannot satisfy the new effective-image forward-acceptance boundary or be rewritten into new evidence
- **AND** new creation writes only the explicit new format; unknown, mixed, truncated or inconsistent versions refuse

#### Scenario: Source helper closure does not supply admission

- **WHEN** helper source selection and component evidence pass
- **THEN** complete system/helper/transient/physical costs, actual daemon/cache/platform observations, host admission and live acceptance remain separately required
- **AND** k3d memory flags remain disabled and no historical hidden-helper cleanup claim is inferred

### Requirement: The rehearsal receiver bounds input and retained alert history

The current local receiver SHALL preserve opaque Alertmanager webhook bytes and firing/resolved evidence while enforcing explicit candidate input, history and scratch policies. Source bounds SHALL remain distinct from measured workload fit, transport costs, effective Kubernetes enforcement and full-stack readiness. Production recipients and routing authority SHALL remain unchanged.

#### Scenario: A bounded webhook is recorded and acknowledged

- **WHEN** the sole admitted writer receives a complete body with a valid declared byte length no greater than65536 within10seconds and sufficient space in8388608bytes of history
- **THEN** the exact body, including trailing whitespace and labels, is retained with the existing alert-received textual prefix through checked same-directory atomic replacement
- **AND** the retained record is readable and its stdout mirror completes before a200ok acknowledgement
- **AND** existing records are preserved; no rotation, JSON transformation or new method/content-type restriction is introduced

#### Scenario: Input or storage cannot safely accept a record

- **WHEN** length is absent/malformed/oversized, input is short or times out, another writer holds the nonwaiting lock, history is full, or persistence/readback/stdout fails
- **THEN** the receiver returns an explicit non-success status withoutok; malformed/absent length is400, oversized413, short400, timed-out408, busy503, full507, and write/readback/stdout failure500
- **AND** bounds apply before body buffering or unbounded decimal arithmetic, interrupted state remains visible for inspection, and accepted history is never silently truncated or reset
- **AND** loss of acknowledgement may permit duplicates; exactly-once or power-loss durability is not claimed

#### Scenario: Current source policy is missing or inconsistent

- **WHEN** the required receiver role, policy, scratch mount/cap, resource map or identity cannot be validated through the current platform entry
- **THEN** validation refuses before source success
- **AND** scratch is32Mi disk emptyDir, ephemeral request32Mi/limit64Mi, with unchanged image, security, CPU5m/100m and memory8Mi/32Mi
- **AND** valid historical structural/image readers retain their supported meaning without being upgraded to current-candidate acceptance

#### Scenario: Source or application tests do not establish runtime acceptance

- **WHEN** extracted actual CGI/bootstrap application tests and source comparison pass
- **THEN** exact pinned BusyBox/httpd behavior, arbitrary transport children/buffers, actual traffic fit, effective resource/storage enforcement and host admission remain separately required
- **AND** the one-writer cap only bounds application serialization/spooling; same-Pod restart retention is distinct from Pod replacement and power-loss durability
- **AND** fixture-receiver-cannot-certify-stack-readiness, full stored-signal/isolation/history/recovery and live-dev criteria remain open

### Requirement: Effective image observations retain identity roles and provider provenance

The shared image-identity concepts SHALL distinguish index, manifest and config identities without assuming a provider uses one as its object ID. A dedicated provider adapter SHALL bind observed objects to selected content and retain provenance. Missing, contradictory or unsupported trusted observations SHALL refuse before mutation or sealing.

#### Scenario: Supported observations use different object roles

- **WHEN** a supported provider reports an index or manifest object instead of a config object, or image inspection and container inspection report different object roles
- **THEN** both observations must bind the same selected child manifest, exact configured reference, platform and daemon through corroborating descriptors and the source selection
- **AND** helper config identity is inferred only from its independently verified selected manifest/config tuple; it is not mislabeled as a direct runtime config-byte observation
- **AND** arbitrary digest membership or version-only inference cannot substitute for that binding

#### Scenario: Runtime pins do not declare a config identity

- **WHEN** a nonhelper source pin declares only the executable image identity
- **THEN** preserve that source-root pin and the provider-observed selected child with exact provenance
- **AND** config identity remains explicitly unobserved rather than manufactured from an object ID

#### Scenario: A provider or identity graph cannot be validated

- **WHEN** source/lock, daemon, capability/store contract, role, descriptor, configured reference, repository, platform or expected/runtime graph is missing, malformed, conflicting or unsupported
- **THEN** the production creation/read boundary refuses before creating or sealing resources
- **AND** a failed projection is not retried through an unqualified fallback and missing fields are not supplied from defaults

#### Scenario: New creation and retained history have explicit versions

- **WHEN** new creation records effective image evidence
- **THEN** plans, inputs, permanent/transient observations and closure use the explicit version3 contract with neutral image identities and separate provider binding provenance
- **AND** every join validates the exact same independently selected content and daemon
- **AND** unknown versions, mixed cohorts, omitted observations and false provenance refuse

#### Scenario: Authentic prior receipts are used for teardown

- **WHEN** a version1 or version2 receipt satisfies its original closed schema and identity semantics
- **THEN** its existing exact-ID, attachment and retained-volume teardown remains available under those original rules
- **AND** old bytes and configId meanings are not rewritten, upgraded or defaulted into version3, and legacy formats cannot certify new forward acceptance

#### Scenario: Identity compatibility does not authorize the full rehearsal

- **WHEN** role-aware source checks and selected provider components pass
- **THEN** all existing configured-reference, daemon/container/mount/network, anonymous-volume, transient lifecycle, sealing/history and source-authority checks remain required
- **AND** actual selected-helper capture, complete physical/runtime image costs, host admission and full observability acceptance remain separately unresolved

### Requirement: Image platform observations retain their provider origin

Image inspection SHALL accept a supported omitted descriptor platform only when explicit observed image platform fields establish the selected content platform and satisfy source/request agreement. Provider records SHALL retain safe raw observations and their normalization origin without changing prior receipt meanings.

#### Scenario: Direct helper descriptors omit platform

- **WHEN** normal and platform-selected image inspections report the exact selected manifest, explicit supported image OS/architecture and an explicitly observed empty image variant, while descriptor platform is omitted
- **THEN** the adapter derives known content platform from those observed image fields and retains descriptor-platform absence and image-field origin
- **AND** digest/media/size, normal/selected, configured reference, repository, daemon, source/config and volume joins remain required
- **AND** requested or source platform is never substituted for an observed field

#### Scenario: Image platform evidence is missing or contradictory

- **WHEN** an image field is absent, unreadable, malformed or unsupported, image variant is nonempty, descriptor platform is null/malformed, or a present descriptor platform conflicts with image/source/request evidence
- **THEN** the production boundary refuses before creation or sealing without an unqualified retry or fabricated default

#### Scenario: Provider provenance has a discriminated format

- **WHEN** new forward image evidence is produced or sealed
- **THEN** binding and container observations use closed adapter4 records inside outer creation3 and preserve mandatory raw-to-normalized provenance
- **AND** omitted provenance, mixed3/4 pairs or cohorts and unknown formats refuse
- **AND** complete old adapter3 pairs retain their original supported teardown semantics without new raw fields or silent upgrades
- **AND** outer1/2 teardown and outer3 independent Git source validation keep their existing requirements

#### Scenario: Container descriptor platform remains mandatory

- **WHEN** a new or retained supported container observation has missing, malformed, unsupported or contradictory descriptor platform
- **THEN** it refuses through the existing exact manifest/platform/source join
- **AND** image inspection compatibility alone does not justify inferred container platform, helper functionality, full admission or observability acceptance

### Requirement: Fresh CronJob syntax is validated before conditional source accounting

The native inventory SHALL validate supplied CronJob schedule and timeZone fields on its existing full-source prepass before provider, missing-bound or unsupported-lifecycle shortcuts. Malformed supplied fields SHALL throw. The provider adapter SHALL preserve pinned Kubernetes1.36.4 fresh-source schedule predicates and robfig3.0.1 field/descriptor/Go1.26.0 duration semantics. Validation SHALL remain separate from recurrence charging. No runtime calendar engine or source authority is implied.

#### Scenario: Malformed late CronJob cannot hide behind another incomplete owner

- **GIVEN** an earlier owner has unresolved ordinal, resource or provider conditions and a later CronJob has a missing, null, nonstring or malformed schedule/timeZone
- **WHEN** `readRehearsalNativeCosts` validates all source frames
- **THEN** it throws on the malformed trusted source before returning an incomplete inventory
- **AND** absent timeZone remains explicitly absent rather than becoming UTC

#### Scenario: Pinned syntax and duration semantics preserve valid unsupported schedules

- **GIVEN** the retained337-case Go1.26.0/robfig3.0.1 corpus and original code points
- **WHEN** the actual production parser is compared under Bun
- **THEN** applicable fresh-source schedule predicates, field masks including bit63, descriptor identity, exact duration nanoseconds and Every delay semantics agree with the independently retained reference
- **AND** all embedded uppercase TZ forms are rejected by the fresh Kubernetes predicate even where raw robfig accepts them
- **AND** raw panic inputs become controlled refusal; direct raw-TZ and host-only zone lookups are diagnostic reference evidence, not a broader raw ParseStandard compatibility claim
- **AND** valid syntax outside the separately declared charging subset stays unsupported rather than receiving invented capacity

#### Scenario: Timezone knowledge stays distinct from malformed input

- **GIVEN** a supplied timezone satisfies pinned fresh-source component predicates but is absent from the exact598-name Go1.26.0 catalogue
- **WHEN** the source calendar is decoded
- **THEN** it returns an explicit outside-catalogue state and inventory retains a named timezone-knowledge blocker
- **AND** it neither defaults the zone nor declares that catalogue absence proves universal Kubernetes invalidity
- **AND** known non-UTC zones remain valid source syntax but unsupported for the initial UTC charging subset

### Requirement: CronJob rehearsal horizons bind conditional full-attempt charges

The native-only capacity companion SHALL bind optional declared CronJob horizons to independently verified native source inputs. Malformed or mismatched bindings SHALL throw before incomplete/provider shortcuts. Missing or valid unsupported scenarios SHALL remain named incomplete, preserving existing calls, Job semantics, other contributors and independent blockers.

#### Scenario: Supplied horizons cannot detach from their source

- **GIVEN** optional `RehearsalCronJobHorizons` containing closed declared windows
- **WHEN** the native-only reader validates the horizon with its required source contract
- **THEN** each window binds exact source selection, resource identity, frame, pointer and jobTemplate bytes
- **AND** malformed, duplicate, unknown-owner or mismatched bindings throw before incomplete/provider shortcuts
- **AND** calls without horizons preserve existing standalone Job and other-contributor facts and independent blockers

#### Scenario: Supported UTC windows charge every scheduled retry slot

- **GIVEN** an unsuspended source CronJob with supported serial NonIndexed Job policy, declared source or controller UTC, cadence `*/d * * * *` for a positive divisor d of60 or `* * * * *`, and bound interval `(L,U]`
- **WHEN** the conditional lifecycle is calculated
- **THEN** ticks equal `floor(U/P)-floor(L/P)`, where P is60000d milliseconds
- **AND** it reserves N times B+1 full normalized Pod slots for N ticks and effective backoff B, including failed/terminating attempts
- **AND** Forbid, deadlines, TTL/history and cleanup assumptions do not discount those charges
- **AND** slots and provenance remain accounting coordinates rather than observed Job or Pod identities

#### Scenario: Valid large or absent scenarios remain visibly incomplete

- **GIVEN** a missing horizon, unknown effective timezone knowledge, suspended/Replace/non-UTC/other valid calendar, unsupported Job policy or safe computed envelope exceeding256 slots
- **WHEN** source accounting runs
- **THEN** it retains exact named incomplete conditions without truncating demand or inventing a horizon
- **AND** malformed supplied fields and bindings still throw before those classifications

#### Scenario: Declared windows never supply runtime admission authority

- **GIVEN** a supported declared horizon and source-derived slot subtotal
- **WHEN** lifecycle provenance and readiness are emitted
- **THEN** fresh creation afterL, bounded controller clock while creation remains possible, stable source/calendar/timezone/controller generation and one JobUID per nominal tick remain explicit conditions
- **AND** prior/missed-beforeL/manual/adopted/recreated Jobs, Helm/Flux generations, retained history/log/device/volume growth and actual window enforcement remain independent unobserved obligations
- **AND** source completeness, whole-attempt fit, creation and runtime authority remain false until their own evidence is verified

#### Scenario: Required controller metadata does not override explicit source scheduling

- **GIVEN** a valid bound horizon always supplies structurally valid controllerTimeZone metadata and the CronJob explicitly declares UTC
- **WHEN** the declared controller zone differs or lies outside pinned catalogue knowledge
- **THEN** scheduling still uses source UTC without an invented equality requirement
- **AND** controller declaration and its knowledge state remain visible without claiming observation or replacing the source
- **AND** absent source timezone instead requires the declared controller zone as an explicit conditional scheduling input

#### Scenario: Zero scheduled ticks do not fabricate retry allocations

- **GIVEN** a supported UTC horizon contains no nominal tick and nested backoff is a large valid count
- **WHEN** the aggregate CronJob envelope is calculated
- **THEN** N(B+1) is zero and no retry entry is materialized
- **AND** declared lifecycle facts and all manual/prior/generation/history/enforcement obligations remain visible
- **AND** the standalone Job representation bound is unchanged

### Requirement: Generated rehearsal costs reuse bound source traits

The full rehearsal capacity companion SHALL consume its independently validated stage/chart source once and reuse the existing selected generated-role decoder, pinned-provider traits, workload normalizer and capacity arithmetic. It MUST preserve native-only API/output behavior and public source-only inventory. Source-derived selection, exact packet/runtime-lock binding, conditional lifecycle charges and unobserved runtime facts MUST remain distinct.

#### Scenario: Retained frames supply generated roles

- **WHEN** the supported two-instance releases and their shared providers are retained with exact stage/frame/resource identities
- **THEN** application namespaces/environments and release inputs come from validated declarations and explicit enablement or the exact pinned chart defaults, and all eight generated store traits bind to exact API group/kind/namespace/name, release, frame and pointer
- **AND** no mutable-checkout reconstruction, fabricated full source object, synthetic effective Pod or second resource calculator is used

#### Scenario: Runtime lock is authenticated independently

- **WHEN** exact toolchain bytes accompany the combined reader
- **THEN** the retained packet's unique toolchain file hash authenticates them and packet source/artifact identity equals inventory provenance before decoding
- **AND** absent/duplicate/wrong coordinates, changed bytes, malformed locks, selection drift and substituted decoded locks refuse; a historical bootstrap source is not invented

#### Scenario: Retained file metadata matches its artifact commitment

- **WHEN** a retained packet accompanies the combined capacity reader
- **THEN** its complete ordered files list hashes to its independently retained artifact identity using the existing canonical two-space JSON encoding plus trailing newline, before its toolchain bytes are decoded
- **AND** coherently changing toolchain bytes and their file row while preserving the original packet/inventory artifact identity refuses; a partial file list cannot borrow a full packet identity
- **AND** self-consistent supported packets remain accepted, and lower lock-coordinate, lock-schema and pinned-default checks remain independently exercised with deliberately resealed synthetic packets

#### Scenario: First replacement remains a conditional budget

- **WHEN** a selected supported one-replica trait has finite per-replica costs
- **THEN** the declared fresh-attempt scenario retains one full initial and one full first-replacement Pod charge, including failed/terminating resource and disk costs, through existing cohort arithmetic
- **AND** source claim slots are charged once under explicit unchanged-claim reuse, without pretending to observe PVC names/UIDs or granting reuse credit across unrelated owners
- **AND** second/repeated/uncertain creations, adopted/prior children, changed scale/template, new claims, retained history and actual enforcement remain independent blockers; the scenario is not an operator maximum

#### Scenario: Unsupported traits cannot acquire nominal charges

- **WHEN** a valid selected trait has unsupported cost-bearing source shape or unknown concurrency/enforcement
- **THEN** null per-replica costs never become charges, and concrete trait/lifecycle/runtime blockers preserve incompleteness
- **AND** only actually covered generated-owner generic blockers are replaced; native entries, totals, lifecycle records and unrelated provider/writer/history obligations remain unchanged

#### Scenario: Combined entry uses the existing producer

- **WHEN** the production companion is invoked
- **THEN** it prepares the existing canonical packet exactly once and consumes the same validated source and packet/runtime identities for native and generated costs
- **AND** the combined closure binds exact traits, lifecycle inputs and charges while creation/runtime authority remains false

#### Scenario: Retained enablement preserves pinned defaults

- **WHEN** the retained KPS91.4.1 declaration omits a store or shared-controller enablement flag
- **THEN** only the locked chart archive SHA256 `1bd5e7a88e758ed3ec22db0fe6e72b1352f3f0e7e5a93c79979f7edf361becdb` supplies its modeled `true` default for `alertmanager.enabled`, `prometheusOperator.enabled` or `prometheus.enabled`
- **AND** each enablement fact distinguishes an explicit value from a pinned-default value with its declaration pointer and chart/version/hash provenance; null, nonboolean or malformed maps refuse before selection
- **AND** disabled, extra or mismatched selections cannot disappear, and changed pins cannot reuse these defaults

### Requirement: Read-only host-path source costs preserve writer obligations

The native source adapter MAY account an explicitly supported read-only host-path consumer through the existing workload normalizer and cohort arithmetic. It SHALL bind its internal policy to exact validated source/provider identity and every application/init mount. Default normalization and cutover observation remain strict. Consumer read intent MUST NOT certify recursive read-only enforcement, zero backing-filesystem demand, a writable quota or runtime admission.

#### Scenario: Selected node-exporter contributes full conditional cohorts

- **WHEN** the validated pinned node-exporter source has its exact proc/sys/root host paths and application/init mount tuples with explicit readOnly true
- **THEN** an internal source policy preserves path/type/mount/propagation identity and allows the existing normalizer to derive full memory, CPU-request and ephemeral costs
- **AND** existing DaemonSet expansion retains both full conditional cohorts for every declared candidate node, with independent device/writer/runtime/lifecycle obligations

#### Scenario: Every host mount must match the declared reader policy

- **WHEN** any app/init reference is writable or lacks explicit readOnly, changes path/type/target/propagation, uses a subpath, duplicates or adds an unmatched mount
- **THEN** the read-only policy does not authorize a contribution through that unsupported shape
- **AND** Bidirectional propagation and unknown provider/template identities cannot inherit an exemption from labels or owner names alone

#### Scenario: Known malformed state precedes incomplete classification

- **WHEN** supplied hostPath bodies, types, mount modes/propagation or reference/cardinality state are malformed
- **THEN** source validation throws before another unsupported volume, absent bound, lifecycle/provider shortcut or earlier-owner collision
- **AND** structurally valid unsupported paths/types remain named obligations rather than fabricated device observations

#### Scenario: Source metadata preserves absence and remains a snapshot

- **WHEN** the selected source omits hostPath.type or mount propagation, or explicitly supplies empty type or None propagation
- **THEN** those states remain distinct without canonicalization or invented Directory/enforcement facts
- **AND** accepted policy and normalized evidence cannot be rewritten by later caller mutation

#### Scenario: Existing strict consumers and writable state remain blocked

- **WHEN** a caller omits the internal reader policy, or the Pod also has unsupported writable OTel checkpoint or Velero paths
- **THEN** default cutover/normalization behavior and whole-Pod incompleteness remain strict
- **AND** existing state/history/backing paths, source resources, versions, image pins and capacity floors remain unchanged; no zero-growth claim or new quota is introduced

### Requirement: Flux bootstrap uses shared finite scratch policy

All forward bootstrap callers SHALL apply one authored Kustomize overlay over the unchanged digest-locked Flux vendor installation. Local rehearsal, fleet installation and cutover rehearsal SHALL consume the same policy. The policy is a declared containment input, not measured startup sufficiency, hard filesystem quota or runtime admission.

#### Scenario: All controllers receive the same authored policy

- **WHEN** the shared Flux overlay is built
- **THEN** only the four apps/v1 Deployments in flux-system receive these additions to their existing manager container and disk emptyDirs: source-controller requests2Gi/limits2304Mi ephemeral-storage and data1Gi/tmp1Gi sizeLimits; kustomize-controller requests1Gi/limits1280Mi and temp1Gi; helm-controller requests256Mi/limits384Mi and temp256Mi; notification-controller requests16Mi/limits64Mi and temp16Mi
- **AND** removing exactly those13 new scalar fields produces objects semantically identical to the locked vendor installation, preserving CPU/memory, images, replicas, identities, security, mounts, disk medium, strategies and termination/persistence behavior
- **AND** missing, unreadable, malformed or foreign overlay inputs, wrong or duplicate roles/coordinates, nonpositive or absent quantities, extra operations/references, and changed vendor bytes refuse at their owning validation boundary

#### Scenario: Every forward caller applies the authored overlay

- **WHEN** Fleet's k3d bootstrap, the fleet Ansible playbook or the existing cutover rehearsal installs Flux
- **THEN** its existing vendor-authentication and lifecycle behavior is preserved and it applies the shared overlay directory rather than raw install.yaml
- **AND** Ansible transports both exact source files and no environment-specific bootstrap policy fork is introduced

#### Scenario: Retained Flux evidence binds the applied build

- **WHEN** a new canonical rehearsal packet is prepared
- **THEN** its source closure retains both the locked vendor and authored overlay, builds the overlay through the existing authenticated kubectl seam and emits exactly one bootstrap/flux frame with the actual build bytes and both input identities
- **AND** missing, unreadable, changed, substituted or unbound overlay inputs cannot acquire raw-vendor accounting or acceptance
- **AND** historical retained native frames remain interpretable under their original explicit source coordinates, without retrofitted hashes or a new-forward raw-manifest fallback

#### Scenario: Declared limits do not imply functional or physical acceptance

- **WHEN** the declared Flux policy contributes finite source costs
- **THEN** existing lifecycle arithmetic accounts full Pod cohorts and retains independent logs/cache/history/concurrency/eviction/device/system/initialization/recovery obligations
- **AND** successful authenticated fetch, Kustomize/Helm reconciliation, restart/recovery and actual effective Pod/storage enforcement remain required runtime evidence; source bounds never grant creation or runtime authority

### Requirement: Combined source costs reserve standalone storage claims

The existing combined capacity reader and canonical companion SHALL account explicitly declared standalone PersistentVolumeClaims from the same validated source traversal, alongside unchanged native and generated subrecords. They SHALL retain declaration origin, declared consumers and unobserved runtime ownership separately. No third capacity API, second source traversal or resource calculator is introduced.

#### Scenario: Declared claims reserve once under explicit source conditions

- **WHEN** a supported v1 claim has a resolved namespace/name, positive validated storage request, explicit nonempty storage class, ReadWriteOnce and absent or Filesystem volumeMode, without prebinding, selector, data-source or runtime-identity/status inputs
- **THEN** its full requested storage is reserved exactly once by the existing claim quantity/CapacityCharge/sum helpers, with source identity and declared/default provenance retained
- **AND** unreferenced declarations still reserve fully; repeated or initial/replacement consumers do not multiply the same logical reservation or establish physical deduplication
- **AND** reservations remain conditional on a fresh immutable attempt, unchanged same-claim reuse, and no prior/adopted/deleted/recreated/resized/unrelated or hidden claims/history

#### Scenario: Consumers and actual ownership remain distinct

- **WHEN** any supported native family's validated source references a persistent claim, including an unbounded or zero-replica consumer
- **THEN** the companion retains every source pointer and joins only exact resolved namespace/name to a declaration, independently of successful Pod normalization
- **AND** missing declarations or unresolved namespaces remain explicit consumer blockers; actual PVC/PV UIDs, Bound status, mounts, devices, ownership, retention and quota/enforcement remain unobserved
- **AND** only a successfully reserved PVC's exact generic unaccounted-declaration refusal is replaced by concrete physical/history obligations; consumer ownership/retention and all unrelated native/generated/runtime/writer obligations remain

#### Scenario: Known malformed claims cannot disappear

- **WHEN** any recognized claim contains malformed known request/spec/identity/access-mode/volume-mode fields, even after an unsupported or incomplete consumer
- **THEN** the complete claim prepass throws before incomplete shortcuts; duplicate/conflicting logical identities and collisions with already charged claims refuse
- **AND** valid unsupported binding/provider/source shapes retain their request evidence and named uncharged obligations rather than nominal capacity, inferred defaults or fabricated effective state

#### Scenario: Existing source APIs gain the corrected total

- **WHEN** the two existing combined entry points are called
- **THEN** additive standalone declaration/consumer/charge evidence and its sum feed their existing total, blockers and closure through one shared derivation, while native-only APIs, public source inventory and native/generated subrecords remain unchanged
- **AND** the retained registry50Gi and object-store20Gi add exactly71680Mi disk and zero CPU/memory; they are not already charged by ordinal or generated claims
- **AND** returned provenance is a snapshot, the canonical producer is invoked once, and state remains incomplete with creation/runtime authority false

### Requirement: Retained collector and backup agents declare ephemeral budgets

Current platform candidates MUST give the retained OTel collector and Velero node-agent finite ephemeral-storage requests and limits. The node-agent MUST retain its existing scratch volume name and mount path with a finite emptyDir size. These policies are shared across placement profiles and do not certify persistent host-path bounds or runtime sufficiency.

#### Scenario: The two agent roles are rendered from current owning source

- **WHEN** the retained collector or either placement's Velero node-agent is prepared
- **THEN** the collector declares16Mi request/64Mi limit and the node-agent256Mi request/2Gi limit for ephemeral-storage
- **AND** Velero's existing scratch remains named scratch at /scratch with1Gi emptyDir size, supplied once through the pinned chart's existing values
- **AND** actual locked output matches the owning resource/scratch values while existing CPU, memory, pins, security, persistence, host paths, retention and the Deployment-only postrenderer remain unchanged

#### Scenario: A required current policy is missing, invalid or lost during rendering

- **WHEN** a required resource map, bound or scratch declaration is absent, null, zero where positive is required, malformed, contradictory, duplicated or inconsistent with the effective rendered role
- **THEN** current production candidate validation refuses
- **AND** supplied historical values retain their existing structural and image checks without requiring these new current-policy fields merely to decode historical source
- **AND** neither ignored values nor wrong/extra rendered containers can certify source correspondence

#### Scenario: Finite ephemeral policy preserves persistent growth uncertainty

- **WHEN** a current candidate passes the new source checks
- **THEN** persistent collector queue/checkpoints, Velero writable host paths, physical writers, retained allocations and runtime enforcement remain independent unresolved obligations
- **AND** no whole-path quota, measured functional sufficiency, full-host admission, creation authority, runtime acceptance or live convergence is inferred
- **AND** earlier saved source captures and proof artifacts remain unchanged

### Requirement: Autonomous resource history precedes measured sizing

The existing observer SHALL collect fresh host/workload memory and cumulative CPU
through a bounded read-only provider adapter, retaining identity/generation provenance.
Shared reading/metric concepts MUST remain provider-independent and reuse existing
OTel publication and Prometheus storage with explicit unavailable states.

#### Scenario: Valid measurements enter the existing pipeline

- **WHEN** the existing autonomous cycle obtains fresh identity-bound resource readings
- **THEN** host availability, per-workload current memory and generation-bound CPU counters are published through its existing metric sender
- **AND** resource state and observation time are explicit while existing signal/progress semantics remain unchanged
- **AND** this adds no daemon, backend, Docker socket exposure, credentials, resource-limit change or admission bypass

#### Scenario: Incomplete resource evidence cannot become zero usage

- **WHEN** SSH is denied, a selected workload is absent, identity or generation changes during reading, a cgroup path escapes, counters are invalid, or the observation is stale/future
- **THEN** the resource observation is explicitly unavailable with a finite reason and no fabricated usage samples
- **AND** local protocol rehearsal cannot claim actual host measurements, raw diagnostics/credential material never become metric labels, and configured limits are not reported as measured peaks

#### Scenario: Lifetime maxima do not certify concurrent capacity

- **WHEN** resource history or lifetime peaks are inspected for sizing
- **THEN** distinct workloads' maxima and terminated attempts are not asserted to coexist without phase and identity evidence
- **AND** source component success does not certify full Kubernetes/Flux, history/recovery or live migration readiness

### Requirement: Immutable observer updates preserve operation

The existing dev observer SHALL support selecting an immutable source revision
without changing its transport, checkpoints or service containment. Selecting a
revision generates units only; it does not authorize or perform installation.

#### Scenario: A reviewed observer revision is selected

- **WHEN** the operator renders units for a full lowercase forty-character hexadecimal source revision
- **THEN** only the observer executable release directory and producer version change together
- **AND** omission preserves the original unit bytes, the tunnel remains identical, and checkpoints, resource limits and restart policy remain unchanged

#### Scenario: A revision is malformed or extra arguments are supplied

- **WHEN** revision input is empty, abbreviated, uppercase, path-shaped, contains whitespace or control characters, or the CLI receives unexpected arguments
- **THEN** rendering refuses rather than producing an executable path or accepting an ignored argument

#### Scenario: Source selection does not prove rollout

- **WHEN** a candidate unit has been generated successfully
- **THEN** actual rollout still requires fresh existing-account access, immutable binary/manifest verification, exact prior-unit preservation and reversible activation
- **AND** autonomous stored collection, effective service bounds and retained history must be observed separately before runtime acceptance

### Requirement: Retained observations have bounded durable evidence

Before changing producer or query routes, the runtime tooling SHALL support
capturing a retained observation from actual correlated stored signals and
verifying its exact records later. The shared evidence model MUST be independent
of backend vendors. Capture and verification MUST remain read-only on backends
and MUST NOT authorize migration, route mutation or deletion.

#### Scenario: A fresh correlated observation becomes a retained reference

- **WHEN** an existing validated observation has complete stored log, trace and metric acceptance and a capture command selects it
- **THEN** a new owner-private receipt binds its application identity, observed/captured times and bounded nonempty signal references with canonical content fingerprints
- **AND** provider-specific record locations and safe route-binding commitments are decoded by a dedicated adapter, with no credentials or raw log/document bodies persisted
- **AND** publication is exclusive and cannot overwrite an earlier operation or Grafana receipt

#### Scenario: Historical verification succeeds without asserting fresh health

- **WHEN** the original records and exact metric samples remain readable after the observation ages
- **THEN** verification checks their original identities and fingerprints at the historical sample times
- **AND** it produces a distinct verification outcome linked to the retained receipt digest, leaves that receipt unchanged and does not classify old telemetry as fresh application health

#### Scenario: Missing changed or inaccessible evidence refuses acceptance

- **WHEN** a retained record/sample is missing, changes content or relationships, cannot be read, returns partial/ambiguous output, or a receipt/binding/identity is malformed, changed or mismatched
- **THEN** verification cannot report complete and the CLI exits nonzero with bounded explicit reasons
- **AND** absent, unreadable, malformed and occupied trusted files refuse without overwrite, Secret disclosure, fabricated empty history or backend mutation

#### Scenario: A retained reference is not migration admission

- **WHEN** capture or historical verification succeeds
- **THEN** candidate ownership, fresh preflight, route switching, rollback/restore and full Kubernetes/Flux acceptance remain independent required work
- **AND** existing observer/Grafana receipts, current signal semantics, stores and live routes remain unchanged
