## ADDED Requirements

### Requirement: Cross-cluster telemetry authenticates both peers

Workers SHALL use OTLP gRPC TLS with a client leaf, explicit server name and separate server trust. The receiver SHALL require a client certificate from an enrolled workers CA. Collector Pods SHALL NOT mount signing keys or fall back to plaintext.

#### Scenario: Unauthenticated worker

- **WHEN** no certificate, a foreign CA, expired client or wrong client EKU is presented
- **THEN** the receiver refuses telemetry

#### Scenario: Untrusted platform

- **WHEN** the server CA or hostname differs from worker trust
- **THEN** the worker refuses the connection

### Requirement: Canary topology preserves rollback and queue identity

The canary SHALL use receiver 14317 and NodePort 30419 while preserving exporter `otlp`, queue extension IDs and queue paths. Plaintext 30417 SHALL remain explicitly temporary rollback state until cutover proofs pass.

#### Scenario: Unsafe topology mutation

- **WHEN** TLS verification is bypassed, a signing key is mounted, a canary targets plaintext or queue identity changes
- **THEN** the platform validator rejects the graph

### Requirement: Certificate lifecycle gates telemetry

Flux SHALL install cert-manager on workers and gate telemetry on current-generation Ready leaves. Leaves SHALL renew before expiry with rotated keys. Server sessions SHALL use five-minute maximum age and 30s grace, with a conservative six-minute forced-close bound including grpc-go ±10% jitter. Outgoing trust changes SHALL require agent rollout.

#### Scenario: Required material unavailable

- **WHEN** a signing Secret, runtime leaf or trust bundle is missing or unreadable
- **THEN** readiness or startup fails visibly

#### Scenario: Overlap rollover

- **WHEN** old and new roots overlap and new leaves are issued
- **THEN** new handshakes succeed and old clients fail after old trust removal and session expiry

### Requirement: Production activation requires evidence

Production activation SHALL require two-cluster authentication, plaintext bypass, queue and expected-worker alert proofs. Insufficient resources SHALL leave activation pending without weakening lab guards.

#### Scenario: Fleet capacity refusal

- **WHEN** available capacity is below the fleet profile requirement
- **THEN** the lab refuses and the two-cluster proof remains unverified
