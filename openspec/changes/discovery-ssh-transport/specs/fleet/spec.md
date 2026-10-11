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
