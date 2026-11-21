## ADDED Requirements

### Requirement: One node role per host

Every fleet host SHALL hold exactly one node role: platform services, continuous integration,
observability, or production apps. A host's capabilities MUST be those of its role. The
continuous integration role covers everything that runs branch code: gates, release builds and
the Compose dev stacks.

#### Scenario: Declared fleet

- **WHEN** the desired state of the rebuilt production cluster is decoded
- **THEN** the platform node carries `control-plane` and `platform-services`, the observability
  node carries `observability`, the production apps node carries `product` and `ingress`, and
  no node carries the capabilities of two roles

#### Scenario: Gate host listed as a k3s node

- **WHEN** an inventory lists one host under `gate_hosts` and under a k3s group
- **THEN** the placement check fails and names the host

### Requirement: Platform services capability

The fleet model SHALL define the capability `platform-services` for platform clusters only.

#### Scenario: Workers node carries it

- **WHEN** a workers-cluster node declares `platform-services`
- **THEN** the fleet decoder refuses the fleet

#### Scenario: Floor not met

- **WHEN** a platform cluster requires `platform-services` and no present node carries it
- **THEN** the fleet decoder refuses the fleet

### Requirement: The control plane runs on a tainted platform node

In a platform cluster that requires `platform-services`, the control-plane node SHALL carry
`platform-services`, MUST NOT carry `product` or `ingress`, and SHALL carry the taint
`puni.dev/role=platform:NoSchedule`.

#### Scenario: Server on the production apps node

- **WHEN** the desired state gives the control-plane node the capability `product` or `ingress`
- **THEN** the placement check fails and names the node

#### Scenario: Server without the taint

- **WHEN** the server configuration of a `platform-services` node is rendered without the taint
- **THEN** the role test fails

### Requirement: Workloads are pinned to their role

Every pod template that the rebuilt cluster's tree renders SHALL select the node capability of
its role. Only workloads that select `platform-services` MAY tolerate the platform taint.

#### Scenario: Workload without a role selector

- **WHEN** the delivery check reads a pod template whose node selector names no capability
- **THEN** the check fails and names the workload

#### Scenario: Toleration without the selector

- **WHEN** a pod template tolerates the platform taint and does not select `platform-services`
- **THEN** the check fails and names the workload

#### Scenario: Running placement

- **WHEN** the rebuilt cluster is observed with all three nodes joined
- **THEN** every Argo CD and cert-manager pod runs on the platform node, every Traefik pod runs
  on the production apps node, and no app pod runs on the platform or observability node

### Requirement: Inventory and desired state agree for every production cluster

Each production cluster in the desired state SHALL be bound to one static inventory, and the
two MUST name the same nodes with the same machine ids, addresses and capabilities.

#### Scenario: Machine id differs

- **WHEN** a node's machine id in an inventory differs from the desired state
- **THEN** the placement test fails and names the node

#### Scenario: Node in one file only

- **WHEN** a node is present in an inventory and absent from its cluster's desired state, or
  the reverse
- **THEN** the placement test fails and names the node

### Requirement: The rebuilt cluster is delivered by Argo CD from a tree of its own

The rebuilt cluster SHALL be reconciled by Argo CD from `infra/argocd`. That tree MUST NOT
share a file with any path a Flux unit reconciles, except chart archives locked by digest, and
MUST NOT render a Flux object, read a remote base, or hold an encrypted Secret.

#### Scenario: File shared with a Flux path

- **WHEN** a file is in the source closure of an Application and of a Flux unit under
  `infra/clusters`, and is not a locked chart archive
- **THEN** the delivery check fails and names the file

#### Scenario: Flux object rendered

- **WHEN** an Application source renders an object of a `toolkit.fluxcd.io` group
- **THEN** the delivery check fails and names it

#### Scenario: Encrypted Secret in a source path

- **WHEN** a document with a `sops` key lies under an Application source path
- **THEN** the delivery check fails and names the file

#### Scenario: Install bytes changed

- **WHEN** the vendored Argo CD install manifest differs from its locked SHA-256
- **THEN** the toolchain check and the bootstrap playbook both refuse it

#### Scenario: Distribution in the tree

- **WHEN** an Application source renders a Distribution registry workload
- **THEN** the delivery check fails and names it

### Requirement: Units are delivered in dependency order

The root Application SHALL order its child Applications by sync wave as the design's unit table
states, and Argo CD SHALL assess the health of Application objects so that a wave completes
only when its Applications are Healthy.

#### Scenario: Wave differs from the table

- **WHEN** an Application's sync wave differs from the unit table
- **THEN** the delivery check fails and names the Application

#### Scenario: Health assessment missing

- **WHEN** the rendered install lacks the health customization for `argoproj.io/Application`
- **THEN** the delivery check fails

### Requirement: Git is the only write path

Every Application SHALL sync automatically with pruning and self-healing from the protected
deploy branch to the cluster it runs in. The Argo CD interface MUST have no public route, MUST
grant read access only, and the built-in `admin` account MUST be disabled.

#### Scenario: Manual change

- **WHEN** a managed object is edited in the cluster
- **THEN** Argo CD restores the state of the deploy branch without operator action

#### Scenario: Other revision or destination

- **WHEN** an Application names a revision other than the deploy branch or a destination other
  than the in-cluster API
- **THEN** the delivery check fails and names the Application

#### Scenario: Interface exposed or writable

- **WHEN** the rendered install has an Ingress, a default role other than `role:readonly`, or
  the `admin` account enabled
- **THEN** the delivery check fails

#### Scenario: Non-fast-forward push

- **WHEN** a push to the deploy branch is not a fast-forward
- **THEN** the repository ruleset refuses it

### Requirement: Delivery cannot delete data

Every PersistentVolumeClaim in the rebuilt cluster's tree, and every namespace that holds one,
SHALL carry the sync options `Prune=false` and `Delete=false`. No Application SHALL carry the
resources finalizer.

#### Scenario: Claim without the options

- **WHEN** a rendered PersistentVolumeClaim lacks either option
- **THEN** the delivery check fails and names the claim

#### Scenario: Manifest removed

- **WHEN** a claim's manifest is removed from the deploy branch and the Application syncs
- **THEN** the claim and its volume remain

### Requirement: SQLite backups are kept and watched from inside the cluster

The cluster SHALL write its SQLite backups under a prefix that names the cluster, apply the
documented retention to it, and alert when the newest backup report is older than two backup
intervals, without depending on a host outside the cluster.

#### Scenario: Shared prefix

- **WHEN** an app overlay of the rebuilt cluster sets the backup prefix to the bare `sqlite`
- **THEN** the delivery check fails and names the overlay

#### Scenario: Retention

- **WHEN** the retention job reads the prefix
- **THEN** it keeps every stamp of the last 48 hours, the last of each UTC day for 60 days and
  the last of each UTC week for 52 weeks, deletes a snapshot only together with its report, and
  never deletes the newest report

#### Scenario: Snapshot without a report

- **WHEN** a snapshot has no report
- **THEN** the job keeps it and reports it

#### Scenario: Listing fails

- **WHEN** the prefix cannot be listed completely
- **THEN** the job deletes nothing and exits nonzero

#### Scenario: Stale backup

- **WHEN** the newest report of a database is older than two backup intervals
- **THEN** the alert for that database fires

### Requirement: Each node is watched from outside itself

Every k3s node and every gate host SHALL have a liveness probe that runs on a different node.

#### Scenario: Node without a probe

- **WHEN** the desired state names a present node, or an inventory names a gate host, that no
  probe on another node targets
- **THEN** the delivery check fails and names it

#### Scenario: Observability node stops

- **WHEN** the observability node stops answering
- **THEN** the probe on the platform node reports it, without depending on any service that
  runs on the observability node

### Requirement: Irreplaceable data is verified before its old host is deleted

A host that holds the WBS dev database, the WBS production database, the website data or the
MLflow store SHALL NOT be deleted until that store has one backup taken after its writer
stopped, a restore of that backup on the new side checked against the backup's report, and one
verified backup made on the new side. A gate host SHALL NOT be deleted before the new CI host
is calibrated.

#### Scenario: Restore differs

- **WHEN** the restored store differs from its backup report
- **THEN** the move stops and the old host is kept

#### Scenario: No backup on the new side

- **WHEN** no verified backup of a moved store exists from its new host
- **THEN** the old host is kept

#### Scenario: Successor not calibrated

- **WHEN** the new CI host has no recorded calibration
- **THEN** neither old gate host is deleted
