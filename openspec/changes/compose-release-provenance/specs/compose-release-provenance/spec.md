## ADDED Requirements

### Requirement: Provider-independent deployment verification

Deployment verification SHALL identify source repository/revision/reference, pipeline, execution and attempt, completion/outcome and each named check without assuming a provider or runner. Provider adapters MUST validate external records and normalize them before the core acceptance predicate.

#### Scenario: Alternate provider uses the same acceptance predicate

- **WHEN** equivalent complete passing evidence from two distinct providers satisfies the same source/pipeline/check policy
- **THEN** both are accepted without provider-name or runner-name logic in the core

#### Scenario: Unsupported or malformed provider observation

- **WHEN** source discovery is unsupported, an external record is malformed, or the provider cannot supply a complete bounded observation
- **THEN** execution refuses before remote mutation and never treats unknown as passed

### Requirement: Exact accepted source and current attempt

Execution SHALL observe the latest source-update verification for the exact repository/revision/ref and pipeline. The current attempt MUST pass; required checks MUST be unique, complete, passing and latest applicable. Carried successes MUST retain their actual identities/attempts and be superseded by newer checks. Changed or incomplete observations MUST refuse.

#### Scenario: Complete current verification

- **WHEN** the latest source-update execution and current attempt have complete passing gate and pixels checks on the exact source
- **THEN** the deployment can continue without rerunning verification jobs

#### Scenario: Nonpassing or unrelated verification

- **WHEN** verification is absent, running, failed, cancelled, skipped, for another source/repository/reference/pipeline/trigger, or a required check is absent, duplicate or nonpassing
- **THEN** the production execution path refuses before any swap command

#### Scenario: A retry or newer execution supersedes an earlier success

- **WHEN** an earlier success is followed by an incomplete/failed retry or a new execution, or the execution/attempt changes while jobs are read
- **THEN** the old success does not authorize deployment

#### Scenario: Successful checks are carried across a partial retry

- **WHEN** a completed successful current execution attempt retains a passing pixels check from its earlier attempt and no later pixels observation supersedes it
- **THEN** verification accepts that check with its original identity and attempt without rerunning it

### Requirement: Digest-bound selected image identity

Every selected tier MUST have a structurally valid release entry for the deployment source, correct repository role, matching digest/reference/tag and a digest-verified image/config whose application revision equals that source. All selected images MUST pass before any selected tier changes.

#### Scenario: Missing or mismatched frontend provenance

- **WHEN** an all-tier release claims the accepted source but only frontend is missing its application revision or identifies another source
- **THEN** no backend, gateway or frontend swap executes

#### Scenario: Tampered or inconsistent image identity

- **WHEN** a release entry is malformed, names another role/digest/tag, or a registry returns corrupt manifest/config bytes
- **THEN** the executed deployment refuses before swap effects

### Requirement: Read-only bounded observation and credential custody

Verification adapters MUST use bounded read-only provider operations and retain observation provenance. Registry credentials MUST be bound to an explicitly configured authority, and registry/provider redirects MUST NOT transmit them to another destination. Secrets MUST NOT appear in output.

#### Scenario: Registry authority mismatch

- **WHEN** configured credentials belong to one authority but a selected image names another, or metadata requests redirect
- **THEN** the deployment refuses without sending credentials to that destination

#### Scenario: A loopback alias selects another effective origin

- **WHEN** credentials are bound to the reader's HTTP localhost endpoint but a selected uppercase or numeric hostname spelling selects HTTPS or another effective port
- **THEN** the adapter refuses before sending credentials, even when URL host normalization yields the same host string

### Requirement: Preserve deployment sequencing and advisory planning

The production orchestrator MUST retain existing clean-tree, migration, installed-executor, solver, environment, locking and smoke checks. Provenance acceptance MUST complete before executing any remote preflight/swap command. Dry-run SHALL remain a clearly unverified advisory plan without provider/image verification or additional tests/reviews in CI.

#### Scenario: Passing release and stale installed executor

- **WHEN** source/images would pass but installed executor bytes are stale or unreadable
- **THEN** the existing bundle refusal prevents the first swap

#### Scenario: Advisory planning does not authorize execution

- **WHEN** the operator runs without execute
- **THEN** the output explicitly states provenance is unverified and does not claim release acceptance
