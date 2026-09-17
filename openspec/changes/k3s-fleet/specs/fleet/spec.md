## ADDED Requirements

### Requirement: Desired fleet is independent of host names

The system SHALL model cluster membership and capabilities with stable logical, provider, machine, and Kubernetes identities; host names are display fields only.

#### Scenario: Arbitrary host joins

- **GIVEN** a new valid desired node with a previously unseen host name
- **WHEN** fleet planning and enrollment run
- **THEN** role code is unchanged and the node joins its named cluster with its capabilities

#### Scenario: Name is reused by another instance

- **GIVEN** an enrolled host name observed with a different provider instance ID
- **WHEN** an operation is planned or applied
- **THEN** mutation is refused as identity drift

### Requirement: Observation failures are not absence

Each observation source SHALL report freshness, completeness, and source-specific failures before its output can authorize mutation.

#### Scenario: Provider command exits nonzero

- **GIVEN** the provider inventory process exits 42
- **WHEN** discovery runs
- **THEN** it names the provider failure and invokes no apply executable

#### Scenario: Provider returns a valid empty list

- **GIVEN** a successful, fresh provider observation containing no instances
- **WHEN** discovery compares it with enrolled desired nodes
- **THEN** enrolled nodes are reported missing rather than removed from desired state

#### Scenario: One observation source is partial

- **GIVEN** provider inventory succeeds but Kubernetes or storage observation is incomplete
- **WHEN** a mutation plan is requested
- **THEN** the snapshot names the incomplete source and cannot authorize apply

### Requirement: Plan review precedes apply

Mutation SHALL consume a persisted content-addressed operation plan and recheck its target, expiry, lease, identities, and preconditions before each effect.

#### Scenario: Lease expires during apply

- **GIVEN** a valid operation whose lease expires after one journaled effect
- **WHEN** apply reaches the next mutation
- **THEN** it stops issuing mutations and records recoverable journal state

#### Scenario: Provider reports pending deletion

- **GIVEN** the target instance exists in a provider pending-deletion state
- **WHEN** apply re-observes the target
- **THEN** it refuses enrollment or a second destructive effect until the modeled deletion converges

### Requirement: Retirement and replacement preserve authority

Retirement SHALL refuse lost required capability, unsafe storage/workload movement, sole-server removal, or an unfenced missing node; provider destruction SHALL require the matching completed retirement receipt.

#### Scenario: Retired host can still re-register

- **GIVEN** a retirement path that leaves the k3s service or joining credential active
- **WHEN** de-enrollment verification runs
- **THEN** it refuses the completion receipt

#### Scenario: Pod disruption budget blocks drain

- **GIVEN** a planned retirement whose workload cannot be evicted under its disruption budget
- **WHEN** generic drain runs
- **THEN** retirement stops without force deletion or a completion receipt

#### Scenario: Enrolled node disappears

- **GIVEN** an enrolled node that vanishes without a verified provider fence
- **WHEN** replacement is planned
- **THEN** the old node remains faulted and storage/writer reassignment is blocked

### Requirement: Terragrunt preserves reviewed Terraform execution

Fleet infrastructure SHALL execute through checksum-locked Terragrunt 1.1.5 with explicitly selected checksum-locked Terraform 1.16.3. It SHALL preserve existing backend, provider lock, saved-plan, state, ownership, and retirement authority. The source-free unit configuration SHALL be bound into each infrastructure operation plan. Unexpected execution overrides, changed binaries/configuration, implicit retries, and multi-unit execution SHALL NOT authorize effects.

#### Scenario: Caller attempts engine or configuration override

- **GIVEN** an alternate engine, source, CLI arguments, or Terragrunt configuration override in the environment
- **WHEN** a fleet infrastructure command starts
- **THEN** it refuses before executing Terragrunt or Terraform

#### Scenario: Reviewed configuration changes

- **GIVEN** a persisted provision or destroy plan and changed Terragrunt configuration bytes
- **WHEN** apply or response-lost recovery runs
- **THEN** it refuses before engine execution

#### Scenario: Provider response is lost

- **GIVEN** a failed infrastructure mutation that may have reached the provider
- **WHEN** Terragrunt returns the failure
- **THEN** the command is not automatically retried and fleet journal recovery retains authority

#### Scenario: Exact saved plan and machine-readable evidence

- **GIVEN** explicit readonly-lock initialization and a reviewed saved Terraform plan
- **WHEN** the fleet inspects state and applies the plan through Terragrunt
- **THEN** JSON remains unwrapped, the same saved-plan bytes are consumed, and stale identity or destructive changes remain refused
