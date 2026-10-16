## ADDED Requirements

### Requirement: Explicit disposable CRI observation

The explicit probe SHALL run pinned crictl as the native relay's direct child against a fresh current-user containerd with private root, state, configuration and sockets. It SHALL issue only Version, ListContainers and missing-container ContainerStatus and retain the native one-connection limit, peer checks, deadline, byte cap and complete-drain requirement. A passing observation test SHALL NOT certify successful CRI transport.

#### Scenario: Direct disposable baseline

- **WHEN** the probe queries its disposable daemon directly
- **THEN** it observes containerd Version, parses the empty ListContainers JSON and observes CRI NotFound for the absent fixture container.

#### Scenario: Version observation distinguishes transport refusal

- **WHEN** the explicit probe invokes Version through the native relay
- **THEN** it records the runtime response and separately records either clean relay completion or a read/write refusal after that response, with the child reaped and private listener removed.

#### Scenario: Additional service connection is refused

- **WHEN** crictl ListContainers or ContainerStatus initializes its separate image-service connection through the one-connection listener
- **THEN** the probe records image-service connection refusal and relay child-exit; it does not claim either runtime operation reached its final CRI call through the relay.

#### Scenario: Unrecognized command is refused

- **WHEN** the crictl mode selects a command outside the fixed read-only set
- **THEN** the relay refuses before connecting upstream or spawning crictl.

#### Scenario: Wrong upstream identity is refused

- **WHEN** the probe supplies a PID other than the disposable daemon's PID
- **THEN** the native relay refuses before launching crictl.

#### Scenario: Wrong executable is refused

- **WHEN** the configured crictl executable has a different SHA256 digest
- **THEN** the fixture refuses before starting the disposable runtime.
