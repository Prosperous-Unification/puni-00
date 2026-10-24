## ADDED Requirements

### Requirement: Preserve the two selected edge containers during Init adoption

An attended helper SHALL select exactly the independently pinned registry and Caddy container IDs, in that order. It SHALL construct replacements from complete supported inspected Config and HostConfig, changing only image spelling to the already-present immutable image ID and Init to true. It SHALL preserve ordered Env, labels, hostname, mount records and configured network endpoint settings, and SHALL refuse unsupported native fields.

#### Scenario: Candidate differs before original stop

- **WHEN** an inert candidate differs in Config, ordered Env, HostConfig, image, mounted object or configured endpoint settings beyond the explicitly admitted native representation profile
- **THEN** the helper refuses before stopping the original and retains the candidate for attended inspection

#### Scenario: Inspected mount order varies

- **WHEN** complete mount records have identical unique canonical destinations and only their inspect array order differs
- **THEN** the helper treats the mount sets as equal without changing create-input arrays

### Requirement: Bind the measured created-state OOM representation to a fixed native profile

Generic invariant comparison SHALL remain strict. Production adoption SHALL independently admit the fixed `engine-29.1.3-api-1.52-cgroup2-created-v2` profile from fresh pinned Docker 29.1.3, API 1.52, Linux, cgroup version 2 and systemd driver evidence, and SHALL require both original targets to contain explicit null OomKillDisable. The outgoing request SHALL retain that null. Only a never-started, fully inert created candidate's observed false OomKillDisable SHALL project to null on a copy for immutable comparison. Every production v2 receipt SHALL bind the same fixed profile identifier; read-only recovery SHALL independently re-admit the current daemon and use the same projection.

#### Scenario: The measured daemon renders a new inert candidate as false

- **WHEN** an admitted original contains null, its unchanged request contains null, and a candidate on the admitted profile has created status, zero PID and restarts, never-started timestamps, inactive sandbox, ports and endpoints, and false OomKillDisable
- **THEN** the shared immutable projection equals the original-derived expected candidate invariant while the raw original, request and observation remain unchanged

#### Scenario: The native profile or candidate phase differs

- **WHEN** profile/version/API/cgroup evidence differs, the original's OomKillDisable is absent or non-null, a candidate contains true or an absent value, a false candidate is running or stopped, or another immutable field differs
- **THEN** the helper refuses without extending null/false equivalence to that observation

#### Scenario: Recovery evidence omits or changes the profile

- **WHEN** a private receipt has a missing, unknown or changed invariant profile identifier
- **THEN** recovery refuses the chain without upgrading its evidence or inferring historical expected configuration from a current candidate

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

### Requirement: Bind never-started endpoint representation to independent network pins

Parsing SHALL preserve an endpoint NetworkID that is empty or a full valid ID without granting admission. Construction and generic comparison SHALL require full IDs. The fixed created-v2 profile SHALL allow empty endpoint IDs only for an explicitly attributed replacement whose actual lifecycle is never-started and fully inert. Its immutable endpoint keys SHALL come from the independently pinned exact name/full-ID roster, with unique names and IDs and unchanged NetworkMode and configured settings. Original, running and stopped contexts SHALL require full actual IDs.

#### Scenario: An owned created candidate has empty runtime network IDs

- **WHEN** the independently attributed candidate is never-started with zero runtime allocations and its exact configured endpoint names match the independent network roster
- **THEN** comparison uses those pinned full IDs as keys while preserving every configured setting and the raw empty observation

#### Scenario: Current network name ownership or candidate stability differs

- **WHEN** fresh full-ID and exact-name network reads differ in ID, name or complete configuration, a never-started candidate appears in either membership record, or its native identity/configuration/lifecycle changes during those reads
- **THEN** candidate verification and the next stop, start or health boundary are refused

#### Scenario: Recovery retains only packet network pins after original removal

- **WHEN** the durable removal grammar permits an absent original and a running replacement remains
- **THEN** recovery uses the historical packet's independent network pins and persisted expected invariant, requires full actual endpoint IDs and fresh network observations, and performs no mutation

#### Scenario: An unrelated created container appears in inventory

- **WHEN** inventory includes an unrelated parsed object with empty endpoint IDs
- **THEN** raw stability hashing preserves its observation without granting it an owner context, mutation membership or Caddy Exec capability

#### Scenario: Owned fixture cleanup observes a different inspected ID

- **WHEN** the freshly inspected full ID differs from the nonce-filtered listed full ID
- **THEN** fixture cleanup refuses before deletion even if the inspected name and label otherwise match

### Requirement: Freeze one operation-wide monotonic effect limit

Preparation and execution SHALL capture the checked wall-to-monotonic expiry once immediately after decoding the private packet and before asynchronous host preparation. Every ordinary admission SHALL fit its existing whole phase and reserve within that immutable finite limit. Admission or receipt time consumption SHALL remain subject to the runner's post-publication phase check before effect dispatch. Later wall-clock adjustments SHALL never renew the captured limit. Read-only recovery SHALL carry an explicit no-effect case with its fresh observation deadline and current edge admission, permitting an expired historical effect interval without reconstructing effect authority.

#### Scenario: Wall time rolls back before the next service phase

- **WHEN** elapsed monotonic time and the next complete service phase no longer fit under the initial effect limit while wall time rolls backward
- **THEN** ordinary admission refuses before the next service is created or stopped

#### Scenario: A clock mapping is not finite

- **WHEN** the initial wall or monotonic sample is NaN or infinite
- **THEN** preparation and execution refuse without constructing an unbounded effect limit
