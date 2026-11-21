## ADDED Requirements

### Requirement: The agents host and the workstation stand outside the cluster

An agents host and a workstation SHALL be outside the cluster and the gate pool, each on a
server of its own. They are the seventh and eighth node roles, which the `node-roles`
capability names. An agents host MUST NOT hold a cluster credential or a key of the
cluster's backups, and MUST NOT be on the cluster's private network. A workstation MAY hold
the operator's credentials and MUST NOT accept a login from any automation.

#### Scenario: Agents host or workstation listed elsewhere

- **WHEN** an inventory lists an agents host or a workstation under a k3s group, under
  `gate_hosts` or in the other's group, or the desired state names one as a node
- **THEN** the placement check fails and names the host

#### Scenario: Agents host on the private network

- **WHEN** an agents host's address is among the enrolled private addresses
- **THEN** the placement check fails

#### Scenario: Automation key on the workstation

- **WHEN** the play runs for a workstation whose operator keys include a key of a gate
  caller, the build user or the agents host
- **THEN** the play fails before it changes the host and names the key's owner

#### Scenario: Automation keys not given

- **WHEN** the play runs for a workstation without the list of automation keys
- **THEN** the play fails before it changes the host

### Requirement: A host outside the cluster admits SSH by key and nothing else

The play that prepares an agents host or a workstation SHALL turn password login off, SHALL
install a firewall whose inbound policy admits SSH only, and SHALL apply to no host of
another group.

#### Scenario: Password login left on

- **WHEN** the rendered SSH configuration of such a host allows password or
  keyboard-interactive login
- **THEN** the role test fails

#### Scenario: Another inbound port

- **WHEN** the rendered firewall of such a host admits an inbound port other than SSH
- **THEN** the role test fails

#### Scenario: Play run against a k3s node

- **WHEN** the play is limited to a host that is in a k3s group
- **THEN** the play refuses it and changes nothing
