## ADDED Requirements

### Requirement: Preserve the two selected edge containers during Init adoption

An attended helper SHALL select exactly the independently pinned registry and Caddy container IDs, in that order. It SHALL construct replacements from complete supported inspected Config and HostConfig, changing only image spelling to the already-present immutable image ID and Init to true. It SHALL preserve ordered Env, labels, hostname, mount records and configured network endpoint settings, and SHALL refuse unsupported native fields.

#### Scenario: Candidate differs before original stop

- **WHEN** an inert candidate differs in Config, ordered Env, HostConfig, image, mounted object or configured endpoint settings
- **THEN** the helper refuses before stopping the original and retains the candidate for attended inspection

#### Scenario: Inspected mount order varies

- **WHEN** complete mount records have identical unique canonical destinations and only their inspect array order differs
- **THEN** the helper treats the mount sets as equal without changing create-input arrays

### Requirement: Bound effects and retain originals until complete health

The helper SHALL publish and read back a private fsynced hash-only intent before each effect, use exact full IDs for effects, stop with t=-1 and a bounded uncertain client deadline, and perform no mutation retries or automatic compensation. Both replacements SHALL pass three complete health rounds spanning at least ten seconds before final combined health and removal of either exact stopped original without volumes.

#### Scenario: Graceful stop acknowledgement is lost

- **WHEN** a selected original stop request times out or its response is uncertain
- **THEN** the helper records an uncertain failure and performs no rename, start or removal

#### Scenario: Candidate fails health

- **WHEN** replacement health or stable process identity fails
- **THEN** the helper retains both originals and performs no automatic recovery

#### Scenario: Intent cannot be persisted

- **WHEN** exclusive intent publication, fsync or readback fails
- **THEN** the next effect is forbidden and the last published record is retained

### Requirement: Compose the production observer through a closed attended CLI

The CLI SHALL admit one canonical absolute `--packet` path and at most one `--execute` or `--inspect-recovery` flag. It SHALL default to read-only preparation and require the inherited edge-lock description before invoking the production factory. It SHALL expose no host, socket, service, fixture, environment-skip or callback override.

#### Scenario: An invocation expands the operation

- **WHEN** arguments or private packet members supply a fixture, host, socket or service override
- **THEN** the actual CLI refuses without reporting preparation or execution success

#### Scenario: A foreign or independently opened descriptor is supplied

- **WHEN** a caller supplies a different open description while the real edge description is held
- **THEN** both the source and bundled CLI refuse before production packet preparation

### Requirement: Bundle the production factory and preserve bounded diagnostics

Source and bundled entries SHALL invoke the same production factory. Production receipts SHALL bind the full packet and each target's ordered Compose source roster and literal Init proof. Diagnostics SHALL expose fixed codes, selected validated receipt metadata and a read-only recovery invocation for a validated packet path, without native messages, stacks, causes, configuration or credentials.

#### Scenario: The bundle runs outside the source tree

- **WHEN** an isolated bundle receives a private invalid packet under a valid inherited lock
- **THEN** its actual production factory refuses the packet with the same fixed preparation code as the source entry

#### Scenario: A private failure occurs

- **WHEN** admission, preparation or an attended operation refuses
- **THEN** diagnostics expose fixed codes and selected validated private receipt metadata, plus the read-only recovery invocation for a validated packet path, without native error messages, stacks, causes, configuration or credentials
