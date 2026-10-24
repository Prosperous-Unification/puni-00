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
