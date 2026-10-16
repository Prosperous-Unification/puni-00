## ADDED Requirements

### Requirement: Explicit disposable CRI observation

The explicit probe SHALL run pinned crictl as the native relay's direct child against a fresh current-user containerd with private root, state, configuration and sockets. It SHALL issue only Version, ListContainers and missing-container ContainerStatus and retain the native one-connection limit, peer checks, deadline, byte cap and complete-drain requirement. A passing observation test SHALL NOT certify successful CRI transport.

#### Scenario: Direct disposable baseline

- **WHEN** the probe queries its disposable daemon directly
- **THEN** it explicitly binds both runtime and image endpoints to that daemon, observes containerd Version, parses the empty ListContainers JSON and observes CRI NotFound for the absent fixture container while an inherited IMAGE_SERVICE_ENDPOINT trap remains uncontacted.

#### Scenario: Version observation distinguishes transport refusal

- **WHEN** the explicit probe invokes Version through the native relay
- **THEN** it records the runtime response and separately records either clean relay completion or a read/write refusal after that response, with the child reaped and private listener removed.

#### Scenario: Additional service connection is refused

- **WHEN** crictl ListContainers or ContainerStatus initializes its separate image-service connection through the one-connection listener
- **THEN** the probe records image-service connection refusal with native exit 1 and exact stderr `relay:child-exit\n`; it does not claim either runtime operation reached its final CRI call through the relay.

#### Scenario: Unrecognized command is refused

- **WHEN** the crictl mode selects a command outside the fixed read-only set
- **THEN** the relay refuses before connecting upstream or spawning crictl.

#### Scenario: Wrong upstream identity is refused

- **WHEN** the probe supplies a PID other than the disposable daemon's PID
- **THEN** the native relay refuses before launching crictl.

#### Scenario: Wrong executable is refused

- **WHEN** the configured crictl executable has a different SHA256 digest
- **THEN** the fixture refuses before starting the disposable runtime.

#### Scenario: Child cleanup evidence requires a receipt

- **WHEN** Version, ListContainers or ContainerStatus is launched through the relay
- **THEN** exactly one syntactically valid positive CHILD PID receipt is required before cleanup can be certified; prelaunch refusals require no CHILD receipts.

### Requirement: Synthetic connected-descriptor observation remains nonauthoritative

A separate explicit throwaway probe SHALL distinguish its deterministic framing
controls from CRI or HTTP/2 transport acceptance. It SHALL retain the original
native relay refusal and SHALL NOT change the pinned crictl CRI observation.

#### Scenario: Fixture descriptor identity and ownership

- **WHEN** the Python probe captures its disposable fixture socket
- **THEN** it checks the fixture-selected PID/UID on that connection, retains a
  SO_PEERPIDFD reference, refuses mismatched identities and a dead peer, permits
  one descriptor claim, leaves a replacement endpoint uncontacted and closes its
  owned socket and pidfd while reaping its disposable children.

#### Scenario: Synthetic completion differs from remaining control bytes

- **WHEN** deterministic payload and terminal-status frames complete before a
  later synthetic control frame
- **THEN** the probe records logical completion at 27 received bytes and later
  control processing at 40 received bytes; truncated payload or absent terminal
  status, expired deadline and an oversized response refuse completion.
- **AND** these synthetic observations certify neither gRPC terminal status nor
  complete HTTP/2 drain, global transport byte accounting or production deadlines.

#### Scenario: Bun inherited socket is an observed incompatibility

- **WHEN** Bun 1.4.2 wraps the inherited Unix socket with node:net.Socket and
  supplies it through node:http2.connect's createConnection callback
- **THEN** the probe confirms the inherited descriptor is a socket, records the
  observed `Socket is closed` refusal and confirms zero request bytes reached
  the disposable fixture; this outcome is recorded as a blocker.

#### Scenario: Maintained CRI client selection is unresolved

- **WHEN** only synthetic framing and the inherited-socket refusal are observed
- **THEN** Version, ListContainers, ContainerStatus, second-dial refusal and all
  protected source-memory and runtime authority guarantees remain unverified by
  this probe; selecting a supported maintained client remains an open task.
