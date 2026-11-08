## ADDED Requirements

### Requirement: Supervisor execution consumes captured boot material

The supervisor SHALL execute its hashed captured bundle bytes through a private virtual Bun.plugin loader and invoke the exported entrypoint. Config digest and decode SHALL consume identical captured bytes. Runtime identity SHALL use `/proc/self/exe`. The bundle SHALL contain only admitted builtin imports.

#### Scenario: Bundle path replacement cannot replace captured execution

- **WHEN** bundle A is captured and its path is atomically replaced by B or unlinked before virtual import
- **THEN** A executes and reports A's digest; a hash-A/import-path mutant fails the same semantic control

#### Scenario: Config and executable pathname replacement cannot counterfeit boot identity

- **WHEN** config A is captured then replaced by B before decoding, or the installed Bun path is replaced after exec
- **THEN** decoding and config digest describe A, and executable identity describes `/proc/self/exe`
- **AND** missing, unreadable or malformed boot material refuses readiness

#### Scenario: Existing packages cannot extend the bundle

- **WHEN** a bundle contains a non-builtin residual import, including an existing local package despite `--no-install`
- **THEN** installation refuses before service restart

### Requirement: Supervisor startup policy excludes ambient executable inputs

The generated unit SHALL explicitly constrain config, environment files, package installation, cwd and pre-exec environment for Bun 1.4.2. It SHALL exclude measured startup and loader injection. Generated argv and typed effective policy SHALL agree; unexpected execution inputs SHALL refuse identity admission. Each policy control SHALL have a watched failure proof.

#### Scenario: Measured ambient preload and loader faults are excluded

- **WHEN** ambient `BUN_OPTIONS` preload, cwd bunfig preload, cwd dotenv and dynamic-loader inputs are injected independently
- **THEN** the explicit policy prevents their measured effects
- **AND** removing the relevant control permits the injected effect and fails its identity acceptance test

#### Scenario: Actual generated unit preserves the literal bootstrap

- **WHEN** the real generated unit is loaded in a disposable manager fixture
- **THEN** typed effective ExecStart contains exactly the canonical executable and argv, including the literal bootstrap and explicit policy flags
- **AND** the admitted policy includes expected cwd, environment sources and pre-exec environment exclusions
- **AND** systemd quoting, percent specifiers, dollar expansion or drop-ins cannot silently change the accepted execution contract

### Requirement: Both connected sockets are bound to one service invocation

The host installer SHALL authenticate private nonce readiness and public solver connections using kernel SO_PEERCRED matching expected host service UID and systemd MainPID. Readiness SHALL follow config validation, orphan sweep and public listen. Challenge and captured boot identities SHALL match exactly. The container public client SHALL use a reviewed namespace-compatible authentication and expectation-refresh protocol before work.

#### Scenario: Private readiness correlates the boot report

- **WHEN** the expected invocation answers a fresh private challenge after startup completes
- **THEN** its nonce, bundle/config/runtime identities and connected kernel PID/UID agree with installer expectations
- **AND** the per-attempt readiness socket is host-private, separate from the public socket, and payload process claims cannot replace kernel credentials

#### Scenario: Invocation observer supports installer and subsequent clients

- **WHEN** the installer completes its private query and multiple broker clients then observe the same invocation, including concurrent queries
- **THEN** the invocation-lifetime host-private observer remains listening and each query uses a distinct fresh nonce and bounded isolated state
- **AND** query completion/refusal closes only its connection and discards its query state
- **AND** invocation shutdown/restart closes the old listener and removes only its owned private socket/directory, with cleanup failures reported

#### Scenario: Stale, foreign or partial readiness refuses

- **WHEN** a stale response is replayed, a nonce/digest differs, a foreign process serves either socket, a peer UID differs, or a private success coexists with a foreign public listener
- **THEN** installation refuses even if both paths exist and the service reports active
- **AND** no public solver request is sent before its server identity is admitted

### Requirement: Container clients authenticate across the PID namespace boundary

A pre-implementation feasibility gate SHALL prove the root-owned online broker and pinned supervisor TLS protocol across the Docker private PID namespace. PID 0, UID alone or payload identity SHALL NOT suffice. Backend systemd authority and host PID sharing SHALL NOT be fallbacks. Unauthenticated, stale or uncertain connections SHALL refuse before work.

#### Scenario: A legitimate isolated backend completes authenticated work

- **GIVEN** the host installer authenticates both host-connected sockets against systemd MainPID and UID
- **WHEN** a backend in its actual Docker private PID namespace connects through the mounted runtime directory
- **THEN** the reviewed namespace-compatible protocol authenticates the connected supervisor and admits a legitimate solver request without requiring a visible host PID
- **AND** a zero SO_PEERCRED PID is never sufficient authentication

#### Scenario: A foreign listener sharing the UID cannot release work

- **WHEN** a foreign listener shares the expected UID or copies public identity claims
- **THEN** the container client refuses before a solver start frame or work is released
- **AND** removing the connection-authentication guard fails this acceptance

#### Scenario: Replay and restart require trusted expectation refresh

- **WHEN** authentication is replayed, an expectation becomes stale after restart, or refresh is unavailable or races an invocation change
- **THEN** the client refuses before work until a fresh connected exchange and trusted expectation refresh establish the admitted invocation
- **AND** the legitimate restarted supervisor can complete work after bounded verified refresh
- **AND** independently removing freshness or refresh admission fails its respective acceptance

### Requirement: Effective service evidence converges under one admission deadline

The installer SHALL retain canonical edge admission through publication, restart, identity observation and final four-artifact readback. Closed typed D-Bus observations SHALL bracket both connected probes and agree on effective execution policy, positive MainPID, UID and InvocationID. Per-call and overall deadlines SHALL bound convergence. Final hashes SHALL match captured expectations.

#### Scenario: Restart during observation converges or refuses

- **GIVEN** typed observations include executable/argv, MainPID, UID, InvocationID, FragmentPath, DropInPaths, NeedDaemonReload, startup state and environment policy
- **WHEN** MainPID or InvocationID changes between the before and after snapshots
- **THEN** the entire attempt is discarded and retried only within the fixed overall deadline
- **AND** exhausted convergence reports failure with uncertainty evidence

#### Scenario: Malformed effective state and final drift refuse

- **WHEN** a typed property is missing/malformed, a query or socket stalls, a fragment/drop-in or effective argv changes, NeedDaemonReload is true, or a final artifact hash differs
- **THEN** admission refuses within the deadline and preserves attempt identity and original hashes
- **AND** a competing edge-lock holder cannot enter during the operation

#### Scenario: Identity evidence grants no adoption authority

- **WHEN** all identity observations and final hashes agree
- **THEN** the installer reports only verified effective supervisor identity for this invocation
- **AND** activation, retained-owner publication, prior-holder drain/adoption and automatic rollback remain separate ungranted operations

### Requirement: Root authority owns supervisor identity publication

A root-owned online solver identity broker SHALL publish observations only against an independently approved root admission baseline. Runtime, baseline, key, public pin and their ancestors SHALL be protected from supervisor-UID modification. Only an authorized provisioner SHALL change the baseline or root pin; observed bytes SHALL NOT approve themselves.

#### Scenario: Same UID replacement cannot replace publication authority

- **WHEN** a supervisor-UID process attempts chmod, rename, symlink or ancestor replacement against broker code, runtime, baseline, key or public trust
- **THEN** the protected boundary denies modification or the provisioner/broker refuses the invalid state
- **AND** a 0444 pin beneath a writable ancestor is not admitted
- **AND** independently removing the corresponding ownership or path guard fails its negative acceptance

#### Scenario: Approved baseline publication is privileged and verified

- **WHEN** the authorized root provisioner atomically updates a baseline or broker pin
- **THEN** readback establishes the exact approved identity; missing, unreadable, malformed or mixed installed/candidate state refuses observations
- **AND** broker requests cannot change expected hashes, policy, paths or service identity
- **AND** user-owned supervisor code is never executed as root and private keys never reach backends

### Requirement: Online observations remain session local and freshly confirmed

The broker SHALL expose only bounded TLS resolve-current and confirm-current requests. Each SHALL require a fresh 32-byte canonical nonce. Confirm SHALL rerun host observation for the connection-local single-use observation identifier. Changed invocation, certificate, baseline or startup policy SHALL refuse. Cached live-state success SHALL NOT answer a new observation.

#### Scenario: Resolve and confirm bind one admitted invocation

- **WHEN** the pinned broker receives resolve-current then confirm-current on the same TLS session
- **THEN** each response echoes its fresh nonce/version, and confirm agrees on observation, invocation and certificate digest after fresh before/after host observation
- **AND** both host-connected peers match systemd MainPID/UID, reported/public TLS certificates agree, captured identities match approved baseline and final four-artifact hashes agree
- **AND** the public host TLS probe releases no solver work

#### Scenario: Wrong session replay and malformed authority refuse

- **WHEN** a caller replays a nonce, observation or reply, reuses confirm, changes session, supplies unknown unit/path/PID/policy/hash fields, or sends duplicate, oversized or partial frames
- **THEN** the closed protocol refuses without publishing authority or starting work
- **AND** broker restart loses observations and unavailable broker cannot be replaced by cached expectations

#### Scenario: Read-only broker observation does not deadlock installation

- **WHEN** installer edge admission is held through restart and identity proof
- **THEN** the broker observes fixed state without acquiring edge.lock, changing installed files, making Docker calls, controlling services or granting activation/adoption
- **AND** the installer retains its own admission and final installed readback obligations

### Requirement: Solver work follows broker resolve pinned hello and confirmation

Each supervisor invocation SHALL use a new in-memory private TLS key. Backend admission SHALL complete broker pin/handshake, nonce-bound resolve, supervisor pin/handshake, invocation hello and fresh same-session confirm-current before start on that authenticated connection. The supervisor SHALL enforce invocation/hello state and existing caller authority before runner/create/start.

#### Scenario: A legitimate connection completes the authenticated sequence

- **WHEN** an eligible backend connects using protected broker trust and an admitted invocation certificate
- **THEN** exact DER pin and successful error-free handshake precede application writes on each TLS connection
- **AND** hello uses a fresh connection nonce and expected invocation without solver work or authority options
- **AND** SolverSupervisorConnect resolves only after confirmation, then the existing start/bind/abort flow proceeds

#### Scenario: Foreign certificate or relay cannot release work

- **WHEN** a same-UID foreign broker/solver presents a foreign certificate, including a TLS-authorized but wrong leaf, or a foreign host process relays TLS upstream
- **THEN** pin admission or existing host caller PID/cgroup authority refuses with zero start bytes and zero runner/create calls
- **AND** TLS alone makes no claim about immediate kernel peers relayed within an already-authorized caller boundary
- **AND** no PID 0, UID-only, payload hash, plaintext, session-cache or early-data fallback is admitted

#### Scenario: Premature frames and failed authentication release no work

- **WHEN** open fires before authenticated handshake, hello is replayed, invocation/nonce differs, confirm is absent/stale, or an early/unknown frame arrives
- **THEN** the attempt refuses before start, closes both sockets and rejects pending promises
- **AND** early frames are not buffered as implicit authenticated replies

### Requirement: Identity refresh and failure remain bounded across restart

Client and broker SHALL independently bound calls, frames, pending sessions, concurrency and whole observations. Client time SHALL remain within childDeadlineAt. Only modeled restart instability SHALL retry from fresh session/nonces within fixed attempt/time limits. A dead authenticated connection SHALL require full new admission; unavailable broker or trusted-state faults SHALL refuse.

#### Scenario: Restart or baseline race refuses the stale attempt

- **WHEN** supervisor key/invocation or broker session changes before start, or an approved baseline/policy change is observed between resolve and the final confirmation observation
- **THEN** the stale attempt refuses before work and only a fresh complete resolution can admit the replacement
- **AND** old invocations cannot retain listener/key-bearing children after replacement, including after bound

#### Scenario: Authority update after confirmation is not instant revocation

- **GIVEN** final confirmation admitted the baseline/policy and the same authenticated supervisor connection remains alive
- **WHEN** root authority updates baseline or policy after that confirmation observation and before start
- **THEN** the already confirmed connection can proceed within its existing deadline and protocol state; the update does not instantly revoke it
- **AND** later resolve/confirm observations use the updated authority and refuse any now-unapproved tuple
- **AND** this contract adds no serialized online revocation or atomic future-policy guarantee

#### Scenario: Hung peers and refresh failure stay within budget

- **GIVEN** measured finite per-call, total and retry-count limits capped by remaining child deadline
- **WHEN** broker or solver hangs, sends malformed/truncated/oversized frames, or restarts repeatedly
- **THEN** bounded refusal closes pending resources with zero unauthenticated work
- **AND** malformed authority, pin failure and unreadable trusted state refuse immediately without restart retries

#### Scenario: Confirmation does not promise atomic future availability

- **WHEN** an admitted invocation dies after confirmation
- **THEN** its authenticated connection fails and any replacement connection requires a new complete admission
- **AND** baseline/policy freshness ends at the final confirmation observation, without serialized exclusion of future authority updates or restarts

### Requirement: Deployment exposes only dedicated read-only identity surfaces

Docker and Kubernetes backends SHALL receive separate read-only directory mounts for solver runtime, broker runtime and root public trust. Private keys, root baseline, host PID/proc, systemd, Docker and writable cgroup authority SHALL remain absent. Desired/live and admission validation SHALL enforce this node-local contract; absent authority SHALL refuse rather than borrow another node's expectation.

#### Scenario: Docker dev and generated production mounts survive restart

- **WHEN** broker or supervisor replaces a socket after restart
- **THEN** read-only directory mounts in both dev and generated production Compose expose the new socket without inode/subPath pinning
- **AND** backend startup config contains only fixed trust paths, not a rotating supervisor certificate
- **AND** missing/writable/foreign mounts and forbidden host authority refuse validation

#### Scenario: Kubernetes validates node provisioning and containerd identity

- **WHEN** a backend is generated, admitted, first started or rescheduled in k3s
- **THEN** base/overlay/generated desired and live mounts explicitly enforce read-only solver, broker-runtime and public-trust Directory hostPaths without subPath
- **AND** an unprovisioned node refuses work, and the deployed containerd/workload caller policy is proven separately from Docker identity
- **AND** provisioning root broker runtime, startup policy, key isolation, pin rotation and actual node readbacks remain required acceptance gates
