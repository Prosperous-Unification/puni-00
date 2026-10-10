## ADDED Requirements

### Requirement: Dash exposes only local enrollment planning

The Dash CLI SHALL support `plan-enrollment` with required fleet, observation,
output, node, cluster, inventory SHA-256, Ansible variables SHA-256 and known-hosts
SHA-256 flags. It SHALL reject unknown commands, unknown/duplicate flags, missing
values and attempts to select another operation before invoking the planner.
It SHALL NOT expose an arbitrary executable, shell command or apply option.

#### Scenario: Operator requests an unsupported effect

- **WHEN** Dash receives `apply`, `discover`, `plan-enrollment --operation destroy`, an executable flag or duplicate node flags
- **THEN** it exits unsuccessfully with a specific diagnostic before planner invocation and creates no output

### Requirement: Fleet owns the plan contract and validation

Dash SHALL delegate accepted requests to the existing `runPlan` enrollment path
with a fixed `--operation enroll`. The persisted plan bytes, summary and digest
SHALL match the direct fleet invocation for identical supplied inputs. Existing
fleet schemas, observed identity and enrollment eligibility checks, lab separation,
complete-observation requirements and reviewed-input digest checks SHALL remain
in force. A generated plan SHALL NOT claim that enrollment is authorized or done.

#### Scenario: Equivalent entrypoints

- **WHEN** identical valid fixture files are supplied to Dash and direct tool-fleet planning with different unused output paths
- **THEN** both produce identical plan bytes, digest and summary
- **AND** neither invokes a host mutation or creates repository authority state

#### Scenario: Incomplete or wrong identity observations

- **WHEN** observation is incomplete, a target machine identity disagrees, or an operator-input placeholder remains
- **THEN** Dash retains the fleet refusal and creates no output plan

#### Scenario: Lab observation targets production fleet

- **WHEN** a lab-provider observation is supplied against the production fleet
- **THEN** the existing fleet lab-boundary refusal remains observable through Dash

### Requirement: Required files and output remain fail-closed

Dash SHALL preserve distinct absent, unreadable and malformed required-input
failures. It SHALL preserve fleet's exclusive new-output creation and restrictive
file mode; an existing output SHALL remain unchanged. Output-write failure SHALL
exit unsuccessfully and SHALL NOT print a success summary. Input files SHALL
remain unchanged, and diagnostics SHALL NOT dump their contents or credentials.

#### Scenario: Missing and unreadable input differ

- **WHEN** a required fixture file is absent, or separately exists but cannot be read by the invoking user
- **THEN** each invocation fails with its path/context and creates no plan

#### Scenario: YAML warning or schema-invalid required state

- **WHEN** fleet YAML has an unresolved tag, including on otherwise schema-valid input, or fleet/observation schema validation fails
- **THEN** planning refuses with required-file context, creates no output, and diagnostics contain no supplied input values or raw parser/schema causes

#### Scenario: Existing output cannot be replaced

- **WHEN** output already contains reviewed bytes
- **THEN** the command refuses and leaves those bytes unchanged

#### Scenario: Output directory is unavailable

- **WHEN** output cannot be created
- **THEN** the command fails without a successful plan acknowledgment

### Requirement: Planning acquires no execution authority

This Dash command SHALL operate solely on supplied local planning inputs and one
new output file. It SHALL NOT perform discovery, contact hosts/providers, launch
build/deploy tools, open or initialize the repository authority database, acquire
runtime claims, move tokens, or release any lease. Fleet apply remains a separate
existing entrypoint with its original admission and mutation checks.

#### Scenario: Production entrypoint runs with mutation canaries

- **WHEN** the real Dash CLI plans an enrollment in a fixture repository with external mutation commands replaced by observable canaries
- **THEN** zero canaries run, input bytes are unchanged, no authority directory/database is created, and only the requested plan output is added
