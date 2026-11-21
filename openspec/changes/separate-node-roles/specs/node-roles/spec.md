## ADDED Requirements

### Requirement: One node role per host

Every fleet host SHALL hold exactly one node role: production apps, platform services,
observability, or continuous integration. A host's capabilities MUST be those of its role.

#### Scenario: Declared fleet

- **WHEN** the production desired state is decoded
- **THEN** the production apps node carries `product` and `ingress`, the platform node carries
  `platform-services`, the observability node carries `observability`, and no node carries the
  capabilities of two roles

#### Scenario: Continuous integration host

- **WHEN** the production inventory is read
- **THEN** every gate host is absent from every k3s group, and no k3s node is a gate host

### Requirement: Platform services capability

The fleet model SHALL define the capability `platform-services` for platform clusters only, and
the production platform cluster MUST require at least one node that carries it.

#### Scenario: Workers node carries it

- **WHEN** a workers-cluster node declares `platform-services`
- **THEN** the fleet decoder refuses the fleet

#### Scenario: Floor not met

- **WHEN** a platform cluster requires `platform-services` and no present node carries it
- **THEN** the fleet decoder refuses the fleet

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

- **WHEN** the cluster is observed after the controllers have moved
- **THEN** every Flux and cert-manager pod runs on the platform node and every Traefik pod runs
  on the production apps node

### Requirement: The cluster keeps one server through the move

The platform cluster SHALL have exactly one control-plane node in every committed desired
state, and the control plane MUST change hosts by a snapshot restore, never by a second server.

#### Scenario: Two servers declared

- **WHEN** a desired state for the `single` platform cluster names two present control-plane
  nodes
- **THEN** the fleet decoder refuses it

#### Scenario: Old server still active

- **WHEN** a restore onto the platform node is planned while the old server's k3s unit is
  active or its datastore directory is in place
- **THEN** the plan is refused and nothing on either host changes

#### Scenario: Node-local data after the move

- **WHEN** the control plane has moved and the old server has rejoined as an agent
- **THEN** that agent has its old node name, every `Retain` volume bound to that name is Bound,
  and data written before the move is readable

### Requirement: Gates do not share a host with production apps

A host that carries `product` or `ingress` SHALL NOT be a gate host once production WBS runs on
it.

#### Scenario: Cutover precondition

- **WHEN** the WBS production cutover is authorised
- **THEN** its target node is not listed in `gate_hosts` and is enrolled in no host pool

### Requirement: Each node is watched from outside itself

Every fleet node SHALL have a liveness probe that runs on a different node.

#### Scenario: Node without a probe

- **WHEN** the desired state names a present node that no probe on another node targets
- **THEN** the platform check fails and names the node

#### Scenario: Observability node stops

- **WHEN** the observability node stops answering
- **THEN** the probe on the platform node reports it, without depending on any service that
  runs on the observability node
