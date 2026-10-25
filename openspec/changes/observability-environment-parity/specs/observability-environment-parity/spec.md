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
