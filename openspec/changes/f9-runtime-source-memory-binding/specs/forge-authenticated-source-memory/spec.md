## ADDED Requirements

### Requirement: Installed authority establishes provenance

The authenticated acquisition path SHALL obtain its runtime, node, source selection and trusted executable identities from source observation authority installed outside candidate and caller control. Caller fields SHALL be selectors only and SHALL NOT create or replace authority. Authority SHALL bind the observation invocation to the selected cluster/node, expected Pod UID, full containerd ID, source container name and captured process/namespace identities. Missing independently established first-source lineage SHALL prevent a first-source authenticity claim.

#### Scenario: Caller supplies a consistent foreign world

- **WHEN** caller-selected executable, socket, roots, process identities, hashes or a self-issued receipt describe mutually consistent observations without installed authority
- **THEN** authenticated acquisition returns no authenticated source memory evidence

#### Scenario: Required authority cannot be verified

- **WHEN** the authority or its executable/configuration is absent, unreadable, malformed, replaced, writable by the candidate or caller, or bound to another node or invocation
- **THEN** acquisition fails before sending runtime request bytes or reading source metrics

### Requirement: Native transport remains conditional on feasibility and ownership

Production activation SHALL require demonstrated platform capabilities, an owned native project with reproducible Bun/Nx build and packaging entry points, and protected installation and execution of every trusted executable and configuration dependency, including process-memory and descriptor access boundaries. A native one-shot relay SHALL remain an unselected candidate until the gate proves authenticated CRI transport and lifetime ownership. Fixture echo success, same UID, process name, pathname, a digest supplied beside an executable, or successful compilation SHALL NOT satisfy this gate. Unsupported installed capabilities SHALL fail closed without a weaker transport fallback.

#### Scenario: Only the throwaway relay succeeds

- **WHEN** a tiny-message native relay probe passes but installed CRI, lifetime, packaging or protected ownership evidence is missing
- **THEN** the gate remains incomplete and no authenticated acquisition is activated

#### Scenario: Required peer-reference capability is absent

- **WHEN** a selected deployment cannot establish a stable kernel process reference for the actual connected peer
- **THEN** acquisition refuses instead of accepting a numeric PID or reopening a pathname as authority

### Requirement: Every runtime byte uses an authenticated connection

Each runtime connection SHALL authenticate the actual connected peer and retain its kernel process reference and socket for the operation. Every CRI request and response byte SHALL flow only through authenticated invocation-owned transport. Reconnects, retries and additional connections SHALL repeat authentication against the same authority and obey explicit finite connection/byte/time bounds. Peer termination, replacement or unverifiable continuity SHALL refuse evidence. A path inspection followed by an independent client connection SHALL NOT satisfy authentication.

#### Scenario: Endpoint changes after authentication

- **WHEN** the endpoint pathname is replaced after connection A is authenticated
- **THEN** existing traffic remains on authenticated A; any new connection is independently authenticated and a foreign B receives no request bytes

#### Scenario: Same UID impersonates the peer

- **WHEN** a different same-UID process offers identical labels, JSON and executable names
- **THEN** its process identity fails authentication before runtime request bytes are forwarded

#### Scenario: CRI uses partial writes or reconnects

- **WHEN** real supported CRI traffic fragments, experiences backpressure or opens another connection within configured bounds
- **THEN** complete framing is preserved through authenticated connections or the operation fails without evidence; truncation or unauthenticated fallback is never accepted

### Requirement: Relay clients and descendants have owned lifetimes

If the native relay is selected, its private listener SHALL accept only the exact trusted direct client process it created, with identity held until reaping. The relay SHALL establish the client's protected executable chain, fixed arguments and scrubbed environment before execution. Private paths and descriptors SHALL remain invocation-owned; arbitrary candidate code SHALL NOT run inside that trusted chain. Foreign connectors, PID reuse, unexpected descendants and inherited descriptors SHALL provide no access to runtime authority. Cleanup SHALL close every owned connection/reference and terminate and reap controlled children on every exit.

#### Scenario: Foreign connector wins the listener race

- **WHEN** a same-UID foreign process connects before the trusted child
- **THEN** no bytes are forwarded upstream and acquisition refuses and cleans up the child and listener

#### Scenario: Child or helper fails during observation

- **WHEN** startup, connection authentication, sampling, output collection or timeout handling fails
- **THEN** cleanup closes owned descriptors and listener paths and terminates and reaps controlled children; failed cleanup is reported and cannot yield evidence

### Requirement: Sampling retains authenticated process and directory references

The sampler SHALL acquire process, namespace, procfs and cgroup-v2 references from the authenticated runtime/node boundary and retain them through inspection, metric reads and final validation. Required relative reads SHALL use retained directory references with enforced containment and no symlink or magic-link traversal. It SHALL verify filesystem/mount provenance and the same live source process, starttime, namespace PID1 identity, exact membership and cgroup device/inode throughout the observation. Reopening caller roots or comparing pre/post pathname strings SHALL NOT establish this binding.

#### Scenario: Directory is replaced and restored

- **WHEN** an adversary substitutes a proc or cgroup path between reads and restores it before a final pathname check
- **THEN** reads remain attached to the original retained references or acquisition refuses, and substituted metrics never become authenticated evidence

#### Scenario: Source process exits or is reused

- **WHEN** the captured init exits, its numeric PID is reused, an observed namespace or cgroup binding changes, or an observed runtime identity changes during sampling
- **THEN** no authenticated source memory evidence is returned

#### Scenario: Required state cannot be read safely

- **WHEN** a required process/metric file is absent, unreadable, nonregular, symlinked, oversized or malformed, or mount provenance cannot be established
- **THEN** acquisition fails without substituting another root, process, cgroup or metric

### Requirement: Evidence remains bounded complete and private

Authenticated acquisition SHALL preserve validateSourceMemory's complete metrics, exact full identities, init membership and memory.max equal to 2147483648. One monotonic invocation budget SHALL bound local waits, connection attempts, sampling and cleanup with an external watchdog for controlled child processes; byte, sample, member and connection limits SHALL be finite and enforced. Errors and evidence SHALL expose only declared sanitized fields. No remote-process or uninterruptible-kernel-IO termination guarantee SHALL be inferred from a local deadline.

#### Scenario: Observation exceeds limits or omits metrics

- **WHEN** output exceeds its combined cap, the invocation stalls, samples are empty, required counters are absent, or memory.max is missing, unlimited, malformed or different from 2Gi
- **THEN** acquisition fails without authenticated evidence and reports only a fixed sanitized failure

#### Scenario: Credentials and verdict fields arrive

- **WHEN** runtime output or caller fields contain credentials, argv, environment, raw trusted paths or injected acceptance conclusions
- **THEN** returned errors and evidence omit those fields and grant no acceptance conclusion

### Requirement: Installed acceptance proves the production path

Acceptance of this capability SHALL exercise a fresh installed consumer outside the candidate checkout against the supported real CRI/runtime and separately provisioned authority. It SHALL retain source, toolchain, helper/client/configuration, authority and invocation identities, raw bounded evidence and cleanup outcomes. Every safety check SHALL have a production-path injected fault observed failing, a restored control and an adjacent Proof comment. Fixture-only or source-checkout success SHALL NOT close installed acceptance.

#### Scenario: Installed consumer resists substitution

- **WHEN** the installed consumer faces runtime/client/helper/configuration substitution, a foreign listener connector, retained-reference path replacement, PID reuse or a broken authentication dependency
- **THEN** its production acquisition refuses without foreign request bytes or authenticated evidence, and restored controls pass

### Requirement: Diagnostic and F9 conclusions remain distinct

The existing typed validator and local observer SHALL remain available with their explicit non-authentic scope. The new authenticated evidence SHALL establish only the runtime provenance and observed source continuity actually proven in its invocation. It SHALL NOT prove historical first-attempt ownership without independent lineage, readiness, cold-start success, OOM cause, restored-checker success or complete F9 acceptance. Automatic recovery lab creation and teardown SHALL remain disabled.

#### Scenario: Matching local diagnostics or later readiness

- **WHEN** existing diagnostic APIs return matching evidence or a replacement container later becomes ready
- **THEN** neither is promoted to authenticated evidence, successful cold startup or F9 acceptance
