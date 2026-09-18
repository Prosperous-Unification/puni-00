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
