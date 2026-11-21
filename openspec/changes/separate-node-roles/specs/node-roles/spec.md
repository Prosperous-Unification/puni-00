## ADDED Requirements

### Requirement: One node role per host

Every fleet host SHALL hold exactly one node role: platform services, continuous integration,
observability, or production apps. A host's capabilities MUST be those of its role.

#### Scenario: Declared fleet

- **WHEN** the desired state of the rebuilt production cluster is decoded
- **THEN** the platform node carries `control-plane` and `platform-services`, the observability
  node carries `observability`, the production apps node carries `product` and `ingress`, and
  no node carries the capabilities of two roles

#### Scenario: Continuous integration host

- **WHEN** a production inventory is read
- **THEN** every gate host is absent from every k3s group of that inventory

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

### Requirement: The control plane runs on the platform node

In a platform cluster that requires `platform-services`, the control-plane node SHALL carry
`platform-services` and MUST NOT carry `product` or `ingress`.

#### Scenario: Server on the production apps node

- **WHEN** the desired state gives the control-plane node the capability `product` or `ingress`
- **THEN** the placement check fails and names the node

#### Scenario: Server without the platform capability

- **WHEN** the control-plane node does not carry `platform-services`
- **THEN** the placement check fails and names the node

### Requirement: Workloads are pinned to their role

Every platform controller and platform service SHALL select the node capability of its role.
Flux, cert-manager, the registry, the secret store and its operator MUST select
`platform-services`; ingress MUST select `ingress`; production apps MUST select `product`;
the observability stack MUST select `observability`.

#### Scenario: Controller without a role selector

- **WHEN** the platform check reads a Flux or cert-manager workload whose node selector names
  no capability
- **THEN** the check fails and names the workload

#### Scenario: Selector the cluster cannot satisfy

- **WHEN** a workload selects a capability that no node of its cluster's purpose may carry
- **THEN** the check fails

#### Scenario: Running placement

- **WHEN** the rebuilt cluster is observed with all three nodes joined
- **THEN** every Flux and cert-manager pod runs on the platform node and every Traefik pod runs
  on the production apps node

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

### Requirement: The rebuilt cluster runs no interim registry

The production `platform` stage SHALL NOT install the Distribution registry.

#### Scenario: Distribution in the stage

- **WHEN** the production `platform` stage renders a Distribution workload
- **THEN** the platform check fails and names it

### Requirement: SQLite backups are kept and watched from inside the cluster

The cluster SHALL apply the documented retention to the `sqlite/<database>/` prefixes and SHALL
alert when the newest backup report is older than two backup intervals, without depending on a
host outside the cluster.

#### Scenario: Retention

- **WHEN** the retention job reads a prefix
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

Every fleet node SHALL have a liveness probe that runs on a different node.

#### Scenario: Node without a probe

- **WHEN** the desired state names a present node that no probe on another node targets
- **THEN** the platform check fails and names the node

#### Scenario: Observability node stops

- **WHEN** the observability node stops answering
- **THEN** the probe on the platform node reports it, without depending on any service that
  runs on the observability node
