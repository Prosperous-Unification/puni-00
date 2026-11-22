## ADDED Requirements

### Requirement: The agents host and the workstation stand outside the cluster

The agents role and the workstation role SHALL be outside the cluster and the gate pool.
They MAY share one server and nothing else may share it. A host with the agents role MUST
NOT be on the cluster's private network. A workstation MAY hold the operator's credentials
and MUST NOT accept a login from any automation.

#### Scenario: Agents host or workstation listed elsewhere

- **WHEN** an inventory lists an agents host or a workstation under a k3s group or under
  `gate_hosts`, or the desired state names one as a node
- **THEN** the placement check fails and names the host

#### Scenario: Shared host, minimal profile

- **WHEN** one host is in both groups and in no other
- **THEN** the placement check passes, and the play applies both groups' rules to it

### Requirement: On a shared host the agents cannot read the operator's files

On a host that holds both roles, OpenClaw SHALL run as a Unix user of its own with no `sudo`
entry and no supplementary group, and the operator's home MUST NOT be readable by it.

#### Scenario: Agent user with privileges

- **WHEN** the play runs for a shared host whose OpenClaw user has a `sudo` entry or is in
  the operator's group or a container-runtime group
- **THEN** the play fails and names the user

#### Scenario: Operator home readable

- **WHEN** the OpenClaw user can list the operator's home on a shared host
- **THEN** the play fails

#### Scenario: Agents host on the private network

- **WHEN** an agents host's address is among the enrolled private addresses
- **THEN** the placement check fails

#### Scenario: Automation key on the workstation

- **WHEN** the play runs for a workstation whose operator keys include a key of a gate
  caller, the build user or, when it is a server of its own, the agents host
- **THEN** the play fails before it changes the host and names the key's owner

#### Scenario: Automation keys not given

- **WHEN** the play runs for a workstation without the list of automation keys
- **THEN** the play fails before it changes the host

### Requirement: A host outside the cluster admits SSH by key over the private access network and nothing else

The play that prepares an agents host or a workstation SHALL turn password login off, SHALL
install a firewall whose inbound policy admits SSH on the tailnet interface only and
nothing on the public interface, and SHALL apply to no host of
another group.

#### Scenario: Password login left on

- **WHEN** the rendered SSH configuration of such a host allows password or
  keyboard-interactive login
- **THEN** the role test fails

#### Scenario: Another inbound port

- **WHEN** the rendered firewall of such a host admits an inbound port other than SSH, or
  SSH on its public interface
- **THEN** the role test fails

#### Scenario: Play run against a k3s node

- **WHEN** the play is limited to a host that is in a k3s group
- **THEN** the play refuses it and changes nothing
