## ADDED Requirements

### Requirement: Private authenticated registry

The existing production registry SHALL serve its distribution API over verified TLS through a private-network endpoint and SHALL reject unauthenticated requests. Credential and CA plaintext MUST remain outside source control and ordinary logs.

#### Scenario: Authentication and trust

- **WHEN** the build host contacts the private endpoint with the escrowed CA and valid credential
- **THEN** it can push and fetch an image by its digest, while a wrong password is refused and a client without the CA cannot verify TLS

#### Scenario: Private exposure

- **WHEN** the endpoint is activated
- **THEN** its host socket binds only the configured private address and no public listener is introduced

### Requirement: Repeatable host integration

Registry endpoint and client setup SHALL preserve unrelated configuration, refuse malformed or conflicting inputs before changing live configuration, and be repeatable without additional changes. Node restarts SHALL be serialized with readiness checks.

#### Scenario: Managed clients

- **WHEN** configuration is applied to each eligible node and the build host
- **THEN** private name resolution and trust work, each node can perform a verified uncached pull, and a second apply changes nothing

#### Scenario: Refused configuration

- **WHEN** the supplied CA, address, port or existing registry configuration is invalid or conflicts with unmanaged state
- **THEN** setup fails without replacing the prior working configuration

### Requirement: Recovery proof

A verified backup SHALL exist outside the registry node before product adoption. A recovery drill MUST restore into an isolated destination and verify a known image manifest and every referenced blob by digest. Corrupt backups MUST be rejected.

#### Scenario: Restart and recovery

- **WHEN** the registry restarts and a backup is restored into an isolated registry
- **THEN** the original image remains pullable by digest in both registries

#### Scenario: Corrupt backup

- **WHEN** an archive or restored image blob is altered
- **THEN** the recovery verification fails before reporting success

### Requirement: Scoped activation

Activation SHALL retain existing product image references and the deployed platform source revision. Unrelated dependent Flux stages SHALL remain held until separately activated, and their state MUST be recorded.

#### Scenario: Website remains available

- **WHEN** the registry becomes Ready
- **THEN** website workloads keep their prior image digests and remain healthy, and unrelated monitoring or backup rollouts do not begin
