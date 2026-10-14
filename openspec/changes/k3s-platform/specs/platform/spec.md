## ADDED Requirements

### Requirement: Reconciler ownership is explicit

Ansible SHALL own host and k3s configuration while Flux SHALL own long-lived platform Kubernetes resources after bootstrap.

#### Scenario: Second Ansible convergence

- **GIVEN** a successfully configured disposable Ubuntu host
- **WHEN** the same playbook runs again with unchanged inputs
- **THEN** it reports no unexplained changes

#### Scenario: Required controller is unhealthy

- **GIVEN** a dependent platform release whose required CRD/controller is absent or failed
- **WHEN** Flux reconciliation runs
- **THEN** the dependent resource does not become accepted

### Requirement: Privileged workload roots are exact

Trusted solver and source-run namespaces SHALL admit only approved controller/service-account/digest combinations and exact configured directory roots.

#### Scenario: Solver pod requests an alternate host path

- **GIVEN** an otherwise approved solver pod using a parent, socket inode, or alternate path
- **WHEN** admission evaluates it
- **THEN** the workload is denied before it runs

### Requirement: Local rehearsals state their limits

The system SHALL provide k3d and disposable Ubuntu VM rehearsals and SHALL record which acceptance claims each can support.

#### Scenario: k3d platform passes

- **GIVEN** a successful k3d platform and application rehearsal
- **WHEN** verification is recorded
- **THEN** it does not certify systemd, SSH, nftables, host mounts, cloud CSI, MTU, or distinct-host loss

### Requirement: Cold recovery restores application state

Cold recovery SHALL start without the original cluster and prove both platform reconstruction and application data/readiness.

#### Scenario: Recovery key is missing

- **GIVEN** backups but no k3s token or SOPS recovery key
- **WHEN** cold recovery starts
- **THEN** it refuses before empty rebootstrap can replace production state

### Requirement: A stage never reconciles against another cluster

Every Flux stage SHALL use its own cluster kubeconfig and SHALL wait for a target stage that verifies the cluster's bootstrap marker.

#### Scenario: Kubeconfig names another cluster

- **GIVEN** a cluster graph whose kubeconfig reaches a cluster without that graph's marker
- **WHEN** Flux reconciles the target stage
- **THEN** the target stage fails and no dependent stage applies anything to that cluster

#### Scenario: Decryption key is missing

- **GIVEN** a cluster graph and no `sops-age` Secret
- **WHEN** Flux reconciles
- **THEN** no stage applies and no platform namespace or HelmRelease is created

### Requirement: Backups are consistent per store and prove their restore

Each store SHALL be backed up through its own consistent mechanism, and every restore SHALL verify content before it can replace data.

#### Scenario: SQLite restore differs from its report

- **GIVEN** a SQLite backup report and object bytes, integrity or migrations that differ from it
- **WHEN** the restore runs
- **THEN** it fails without creating the target database

#### Scenario: Backup credentials are broken

- **GIVEN** object storage credentials that the store rejects
- **WHEN** a scheduled SQLite backup runs
- **THEN** the Job fails and a backup alert reaches the configured receiver

#### Scenario: Elasticsearch is unavailable

- **GIVEN** log producers running while Elasticsearch is stopped for less than the queue capacity
- **WHEN** Elasticsearch returns
- **THEN** every produced event is searchable once and a backlog alert fired during the outage

#### Scenario: Snapshot archive is corrupt

- **GIVEN** a recovery manifest and a snapshot whose size or SHA-256 differs from it
- **WHEN** cold recovery is verified or the playbook places the snapshot
- **THEN** it refuses before k3s is stopped

### Requirement: Volume recovery is fenced and exact

Recovery SHALL remove a VolumeAttachment or move a node-local volume only when the old node is fenced and the volume, node and claim identities match exactly.

#### Scenario: Attachment belongs to a live node

- **GIVEN** a VolumeAttachment of the requested volume on a node without fence evidence
- **WHEN** stale-attachment removal runs
- **THEN** it refuses and the attachment remains

#### Scenario: Volume would lose its data

- **GIVEN** a node-local PersistentVolume whose reclaim policy is not Retain
- **WHEN** a rebind is requested
- **THEN** it refuses before the PersistentVolume object is deleted

### Requirement: Fleet health is read-only and every rule can fail

The health check SHALL issue only read requests and SHALL report a critical finding for each rule's injected fault.

#### Scenario: Kubeconfig reaches another cluster

- **GIVEN** a kubeconfig for a cluster whose marker names a different cluster
- **WHEN** the health check runs
- **THEN** it reports only the marker finding and exits non-zero

### Requirement: Worker runs survive infrastructure loss under outside authority

Synthetic worker Jobs SHALL be bounded, SHALL start at most once per run identity, and SHALL restart after node or cluster loss only as decided by a journal outside the cluster.

#### Scenario: Worker cluster is recreated during a run

- **GIVEN** a dispatched run whose worker cluster is deleted and recreated
- **WHEN** the authority reconciles the run
- **THEN** it starts the run once more and records its completion, or fails it after the attempt limit

### Requirement: Forge namespace identities preserve trusted admission

The platform SHALL reserve `puni-forge` and the `puni-forge-` family. A family suffix SHALL match the existing dev-environment slug grammar `[a-z](?:[a-z0-9-]{0,18}[a-z0-9])?`. Reserved namespaces SHALL carry `puni.dev/trusted-hostpath: source` on creation and every update. Only `wbs-solver` SHALL carry `solver`; only valid forge identities SHALL carry `source`. Other trusted-label values SHALL be denied. Label removal or changes SHALL be denied.

#### Scenario: Several forge identities request approved Pods

- **GIVEN** `puni-forge`, `puni-forge-alpha` and `puni-forge-beta` with source labels
- **WHEN** approved source Pods are admitted in each
- **THEN** all receive the same exact directory-root, digest image, service-account, controller, node and security checks, including init and ephemeral containers

#### Scenario: A reserved namespace attempts to escape admission

- **GIVEN** a reserved forge name, a malformed forge suffix or an unknown trusted-label value
- **WHEN** a Namespace is created or updated without its correct identity and label
- **THEN** admission denies it, including removal or replacement of an existing label

#### Scenario: Trusted parameters disappear

- **GIVEN** the trusted parameter ConfigMap is missing
- **WHEN** Pods are requested in original and per-environment forge namespaces and the solver namespace
- **THEN** trusted Pods are denied while ordinary Restricted workloads retain their existing behavior

#### Scenario: Policies are installed after an unlabelled reserved namespace exists

- **GIVEN** valid and malformed reserved forge namespaces without trusted labels and Pods that existed before policy installation
- **WHEN** an otherwise approved or unsafe Pod is created or updated, or an ephemeral container is added
- **THEN** a parameter-free Pod identity policy denies each request independently of the trusted label selector, including when the parameter ConfigMap is missing
- **AND** ordinary and system namespaces retain their existing admission behavior
