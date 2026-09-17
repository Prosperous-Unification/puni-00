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
