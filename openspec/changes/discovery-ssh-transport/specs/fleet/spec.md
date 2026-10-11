## ADDED Requirements

### Requirement: Production SSH discovery uses one validated transport

Production discovery of a fleet with SSH nodes SHALL require an operator transport naming the
remote user and an owner-only `known_hosts` file, plus an optional jump host, and SHALL validate
it together with the forwarded SSH agent before any discovery command runs. Discovery SHALL
refuse, with a typed reason, a missing transport, a transport combined with the lab provider, an
unreadable, non-owner-only or malformed transport or `known_hosts`, an invalid user or jump, a
target or jump address without a plain key line, and an absent or non-socket agent.

#### Scenario: SSH fleet without a transport

- **GIVEN** a production fleet with SSH node platform-a and no `--ssh-transport`
- **WHEN** discovery runs
- **THEN** it refuses as `transport-required`, names platform-a, and runs no command

#### Scenario: Target without a pinned host key

- **GIVEN** a transport whose `known_hosts` has no plain key line for 10.1.0.2
- **WHEN** discovery reads the transport
- **THEN** it refuses as `host-unpinned` and names 10.1.0.2

#### Scenario: Forwarded agent absent

- **GIVEN** a valid transport file and no `SSH_AUTH_SOCK`
- **WHEN** discovery reads the transport
- **THEN** it refuses as `agent-unavailable` and invokes no controller

### Requirement: Discovery pins every SSH host key it reaches

The SSH fact command SHALL connect as the transport's user with the transport's `known_hosts`
as the only known-hosts source, strict host-key checking and batch mode, and a jump host SHALL
be reached through a ProxyCommand carrying the same options. The controller container SHALL
receive the `known_hosts` read-only, the validated agent socket, and
`ANSIBLE_HOST_KEY_CHECKING=True`, and SHALL receive no agent without a transport.

#### Scenario: Changed host key

- **GIVEN** a transport whose `known_hosts` pins another key for the target
- **WHEN** `discover.yml` runs in the controller with the rendered transport
- **THEN** ssh reports host key verification failed and the host is unreachable

#### Scenario: Changed jump host key

- **GIVEN** a transport whose jump host's pinned key differs from the jump's real key
- **WHEN** `discover.yml` runs through the jump
- **THEN** the connection closes before authentication and the host is unreachable

### Requirement: An SSH-served cluster API is reached through a pinned forward

When a cluster's API endpoint host is the address of one of its SSH nodes, production discovery
SHALL reach the API only through an SSH local forward from a controller loopback port to that
node's loopback, pinned by the same transport, SHALL verify the API certificate for the endpoint
host, SHALL remove the forward when the cluster's Kubernetes reads end, and SHALL refuse when the
forward cannot be established or the certificate does not match.

#### Scenario: Forward host key changed

- **GIVEN** a transport whose `known_hosts` pins another key for the API host
- **WHEN** discovery opens the API forward
- **THEN** it refuses with ssh's host key verification failure and reads no Kubernetes source

#### Scenario: Certificate for another address

- **GIVEN** an open forward whose API certificate is valid only for another address
- **WHEN** discovery reads Kubernetes nodes
- **THEN** discovery refuses with the x509 failure and removes the forward

### Requirement: Reserved .invalid endpoints are unprovisioned clusters

A cluster whose API endpoint host is under the RFC 2606 `.invalid` TLD SHALL be observed as
not bootstrapped from an `unprovisioned:` source without any provider, Kubernetes or SSH read
and without a kubeconfig context; such a cluster SHALL declare no nodes. Any other cluster whose
Kubernetes context is missing SHALL still be refused.

#### Scenario: Declared workers placeholder

- **GIVEN** the `workers` cluster at `https://workers.example.invalid:6443` with no nodes
- **WHEN** discovery runs
- **THEN** it records `workers` not bootstrapped and issues no command for it

#### Scenario: Missing context for a real endpoint

- **GIVEN** a cluster at `https://workers.example.test:6443` and no `workers` context
- **WHEN** discovery runs
- **THEN** it refuses and names `kubernetes-nodes:workers`
