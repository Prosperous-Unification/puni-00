## ADDED Requirements

### Requirement: Independent bootstrap authority

The system SHALL require externally controlled audit execution, journal verification,
publication and protected admission configuration before issuing trusted activation.
Bootstrap SHALL NOT manufacture credentials, elevate local cooperative evidence, relax the
required workflow, or silently accept missing, unreadable or malformed trusted state.

#### Scenario: Bootstrap prerequisites are absent

- **WHEN** any required identity, verifier, storage authority or protected configuration
  is absent, unreadable or malformed
- **THEN** bootstrap fails with the named condition and no successful admission is issued

#### Scenario: Candidate claims to be its own authority

- **WHEN** candidate-controlled configuration or a relabelled local review claims trusted
  provenance
- **THEN** the independently selected verifier rejects it before publication

### Requirement: Automatic candidate lifecycle

After bootstrap, the system SHALL start or reconcile work for ready pull requests when opened,
marked ready or updated, and for applicable integration and protected-branch push events.
It SHALL require no per-candidate human review record, artifact handling, release creation,
variable editing, workflow rerun or merge action.

#### Scenario: Ready candidate succeeds unattended

- **WHEN** a ready candidate satisfies independently selected reviews and all required checks
- **THEN** the controller publishes its activation, the protected workflow verifies admission,
  and automatic merge proceeds under existing protection without a human action

#### Scenario: Events are missed or duplicated

- **WHEN** event delivery is lost or duplicated
- **THEN** periodic reconciliation recovers eligible work and duplicate delivery does not create
  competing authoritative publications

### Requirement: Exact candidate and trust identity

Every activation request SHALL bind its typed subject, qualified target ref, candidate head
SHA, base SHA, policy and mapping identities, toolkit identity and audit generation in its
canonical hash and current-request validation. A subject SHALL identify a PR by immutable
repository ID and PR number, a merge group by repository ID and verified qualified group
identity/ref plus ordered PR member identities and head SHAs, or a protected revision by
repository ID and qualified protected ref. Receipts, descriptors, admission and merge effects
SHALL bind the same subject and canonical request identity.
Webhook delivery IDs, workflow-run IDs and observation timestamps SHALL remain authenticated
source metadata rather than canonical request identity; delivery deduplication SHALL reject
conflicting content under the same source delivery ID. Older persisted schemas missing these
bindings SHALL be explicitly migrated with authoritative evidence or rejected, never defaulted.
Evidence SHALL NOT be reused across changed identities unless an existing explicit
certification contract proves its applicability; candidate-specific review SHALL remain exact.

#### Scenario: Different PRs share the same commits

- **WHEN** two PR numbers share repository, head, base, target ref and trust identities
- **THEN** their canonical requests and lifecycle ownership remain distinct, and neither
  request can authorize a receipt, admission or merge for the other PR

#### Scenario: A PR and protected revision share the same commits

- **WHEN** a PR request and a protected-revision request otherwise share commit and trust fields
- **THEN** the subject discriminator keeps their requests and effect authorization distinct

#### Scenario: PR retargeting preserves the base commit

- **WHEN** a PR changes target refs while both refs point to the same base SHA
- **THEN** its logical PR identity remains stable but the changed canonical request requires
  fresh applicable evidence and cannot use the old target's admission

#### Scenario: Webhook and polling observe the same candidate

- **WHEN** authenticated webhook deliveries and a polling run observe the same current subject,
  candidate and trust tuple
- **THEN** they converge on one canonical request despite different delivery IDs, run IDs or
  observation timestamps

#### Scenario: A delivery ID is reused with different content

- **WHEN** a delivery ID already recorded for an authenticated source is reused with a different
  payload digest
- **THEN** ingestion refuses the conflict without changing the request or issuing admission

#### Scenario: Persisted request lacks subject bindings

- **WHEN** an old stored request has no subject or qualified target-ref binding
- **THEN** loading refuses it unless an explicit migration reconstructs and verifies the
  authoritative bindings, without inheriting stale leases or prior approval

#### Scenario: Head or base advances during review

- **WHEN** the PR head or base changes before final admission or merge
- **THEN** the old request cannot approve the new tuple and the new tuple is evaluated

#### Scenario: Same tree carries different authority

- **WHEN** source bytes match but repository, policy, mapping, toolkit or generation differs
- **THEN** the previous certificate cannot discharge the new request

### Requirement: Authenticated independent review

Trusted review SHALL retain actual cold and informed invocations, ordered phase evidence,
observed reads, raw responses and measured telemetry required by the review protocol.
An external verifier SHALL authenticate invocation, receipt, obligation, journal and candidate
bindings against independently selected executor authority. Unresolved findings, missing
evidence and incomplete or censored phases SHALL prevent admission.

#### Scenario: Review file looks valid but was not executed

- **WHEN** a schema-valid review names an invocation absent from the authenticated journal
- **THEN** publication and admission refuse it

#### Scenario: Review evidence is incomplete

- **WHEN** a phase, required read, retained response, required telemetry or finding disposition
  is absent, unreadable, malformed or mismatched
- **THEN** the request fails without synthesizing the missing observation

### Requirement: Paired review obligations and invocation identity

The frozen evaluation plan SHALL bind a stable `reviewId` to exactly one cold and one
informed obligation with distinct obligation identities. Each review attempt SHALL have
an immutable registration joining canonical request identity, review identity and shared
attempt to one `invocationId`. Receipt submission SHALL NOT create or replace that binding.
Authentication SHALL bind exact phase-specific bytes and retained protocol evidence to the
registered invocation and trusted issuer/executor/protocol/prompt expectation.
An informed completion SHALL join its paired, retained cold completion from the same request,
review, attempt and invocation, including the exact cold judgment artifact.
Missing legacy pairing or registration SHALL refuse affected execution/admission without
guessing authority or rewriting historical evidence.

#### Scenario: One complete invocation satisfies its selected pair

- **WHEN** distinct authenticated cold and informed phase records match one frozen review
  pair and its registered invocation, with required observations and exact cold-artifact linkage
- **THEN** each record satisfies only its own obligation and the whole required evidence
  set can complete independently of check completion order

#### Scenario: Phase labels or another cold review substitute for paired evidence

- **WHEN** a caller relabels one phase record, duplicates a phase in the frozen plan, omits
  its partner or supplies a passed cold completion from another review in the same request
- **THEN** the controller refuses the substitution without recording the submitted completion
  or changing the request's selected evidence

#### Scenario: Same review has a permitted new execution attempt

- **WHEN** an explicitly classified transient retry reserves a new attempt and invocation
- **THEN** the selected review and frozen plan remain unchanged, prior attempt evidence is
  retained, and informed evidence cannot borrow the prior attempt's cold execution
- **AND** terminal failed/skipped required work cannot become retryable by changing invocation

#### Scenario: Invocation or retained cold artifact conflicts

- **WHEN** authentication names an unregistered/replacement invocation or the informed output
  and expansion do not bind the registered invocation's exact retained cold judgment
- **THEN** completion refuses and prior registration, receipts and selected evidence remain intact

#### Scenario: Trusted expectation changes during authentication

- **WHEN** external authentication is held while authority, the active request, its pair or
  its registered attempt/invocation changes
- **THEN** the completion cannot commit under its earlier expectation
- **AND** an unrelated obligation completion alone does not invalidate a valid completion

#### Scenario: Legacy review obligations have no authenticated pairing

- **WHEN** persisted audit obligations lack explicit pairing or invocation registration
- **THEN** affected execution/admission refuses while retaining historical evidence; row order,
  equal executor/protocol or a sole cold row cannot supply a default pair or invocation

#### Scenario: Versioned storage preserves unpaired v2/v3 history

- **WHEN** the pairing schema is introduced over v2/v3 evaluating or verified audit requests
- **THEN** their rows, plan identities and available receipt/attempt evidence remain readable
  as unpaired history, and migration does not authorize further execution or admission
- **AND** trusted supersession/replanning creates a new audit generation before paired work
  resumes; a failed schema transition restores the old version and rows

#### Scenario: Phase completion fails after evidence insertion

- **WHEN** recording a valid informed completion fails at the later selected-evidence or
  request transition write
- **THEN** all new phase/attempt/selection writes roll back together while the prior registered
  invocation and cold evidence remain intact

### Requirement: Isolated checks and protected publication

Candidate execution SHALL have no access to audit signing, journal mutation, activation
publication, protected checks or merge credentials. Required checks SHALL record actual
commands, execution identities, outputs, exit statuses and skips; failed or skipped required
work SHALL prevent certification. The trusted preparer SHALL validate every activation role
and the production launcher before publication.

Selected-check launch preparation SHALL resolve versioned, canonical,
content-addressed toolchain and sandbox-profile descriptors from independently
controlled trusted state. The sandbox profile SHALL define an explicit logical
mount and environment allowlist, private namespaces and network, dropped
capabilities, and finite supported resource bounds. The prepared description
SHALL bind the exact frozen check command, both descriptors, the candidate
snapshot, and the current request, attempt, lease and authority. Preparation
SHALL grant no process-launch or receipt authority.

Before worker admission, a trusted complete-tree manifest SHALL bind the
candidate snapshot identity to the exact request/head and every directory and
regular file's relative path, mode and content digest. A corresponding trusted
manifest SHALL bind the runtime executable-tree identity to its complete
toolchain closure. The supervisor SHALL traverse one basename at a time under
retained no-follow directory descriptors, reject symlinks, special or
unexpected entries, and stage only verified bytes and modes into fresh private
trees without reopening original paths. Failure SHALL close descriptors and
leave no launch-capable staging result. Staging SHALL not execute a worker or
create a measured receipt.
The independently pinned sandbox profile SHALL provide positive finite safe-
integer limits for manifest bytes, entry count, depth, path bytes, file bytes
and total bytes, enforced independently for candidate and runtime trees.

Before selected-command execution, an uncached required worker target SHALL
refuse with named unavailable controls unless the exact mandatory namespace,
delegated cgroup quota, pinned AppArmor policy and FD/mount isolation are
independently observed. An inert namespace probe alone SHALL NOT grant worker
admission. An unavailable control SHALL make the required target fail; the
target SHALL neither skip nor fall back to unsandboxed execution.

#### Scenario: Namespace setup succeeds without quota or policy

- **WHEN** an inert namespace probe succeeds but the worker has no verified
  delegated `cpu`/`memory`/`pids` quota leaf or pinned AppArmor policy
- **THEN** the uncached worker target reports each unavailable control, exits
  nonzero, and runs no selected command or measured receipt

#### Scenario: Source tree changes during anchored staging

- **WHEN** a source root or ancestor is renamed, a child symlink or file is
  substituted, a selected file changes, or the complete-tree digest differs
- **THEN** staging returns only the exact manifest-verified bytes and modes or
  refuses, closes its descriptors, and creates no worker or receipt

#### Scenario: Source inventory is not exact

- **WHEN** a source contains an unlisted entry, symlink, special file,
  malformed path or missing trusted full-tree manifest
- **THEN** staging refuses without deriving a manifest from candidate files or
  using an old descriptor as a guessed inventory

#### Scenario: Runtime or profile authority is missing or drifts

- **WHEN** a selected check's runtime or sandbox descriptor is absent,
  unreadable, malformed, noncanonical or differs from its frozen identity
- **THEN** launch preparation refuses without falling back to candidate or
  ambient host state, and no worker or receipt is created

#### Scenario: Candidate path or current selection changes during preparation

- **WHEN** the main or skip-probe cwd traverses a symlink outside the immutable
  candidate snapshot, or the current subject, check attempt, lease or bootstrap
  authority changes while trusted descriptors are resolving
- **THEN** preparation refuses without returning a launch-capable token, worker
  execution or receipt

#### Scenario: Candidate attempts credential or journal access

- **WHEN** candidate code attempts to use publication credentials or alter authenticated records
- **THEN** isolation denies the access and the candidate cannot issue trusted approval

#### Scenario: Required command fails or skips work

- **WHEN** a selected command exits unsuccessfully or reports skipped required work
- **THEN** no certified activation or successful admission is published

### Requirement: Immutable candidate-addressed selection

The system SHALL publish immutable activation archives with authenticated descriptors joining
the complete request identity, archive digest and role identities. Consumers SHALL resolve
only through an independently configured trust source and verify both provenance and content.
Different candidates SHALL have independent selections after bootstrap.

#### Scenario: Two candidates finish concurrently

- **WHEN** candidates A and B complete in either order
- **THEN** each resolves its own exact activation without overwriting the other's selection

#### Scenario: Archive or descriptor is substituted

- **WHEN** archive bytes, role bytes, descriptor bindings or the selected issuer differ from
  authenticated expectations
- **THEN** the production consumer refuses admission before executing an untrusted launcher

#### Scenario: Existing publication conflicts

- **WHEN** a publication key already contains different bytes or authenticated identities
- **THEN** the controller fails without replacing it; an identical existing publication is
  verified before being reused

### Requirement: Guarded parallel evidence completion

The controller SHALL freeze required check and audit obligations when a request enters one
evaluation phase. Their independent completion SHALL join only authenticated, complete,
passing evidence for every selected obligation before verified state. Recording a receipt
and evaluating this join SHALL be atomic and SHALL preserve per-attempt evidence immutably.
Transitions to published and admitted SHALL respectively require verified publication
acknowledgement and the exact required workflow's observed success. A lease alone SHALL NOT
authorize these transitions, and terminal failure or supersession SHALL NOT reset to observed.

#### Scenario: Checks and audit complete in either order

- **WHEN** checks and audit complete in either order, including concurrently
- **THEN** both valid completions are retained and verified is reached only after the entire
  authenticated receipt set is present, without rejecting one solely for the other's version change

#### Scenario: Incomplete or conflicting evidence attempts to advance

- **WHEN** a required receipt is absent, failed, skipped, wrong-request, wrong-obligation or
  conflicting with already recorded bytes
- **THEN** advancement is refused and earlier attempt evidence remains intact

#### Scenario: Caller requests a later stage without its proof

- **WHEN** a leased caller requests published or admitted without its specific verified
  acknowledgement or required workflow conclusion
- **THEN** the durable stage remains unchanged and the missing proof is reported

### Requirement: Durable external effect reservations

Publication, workflow/check dispatch and merge effects SHALL have durable reservations before
external calls, binding effect key, request/subject, payload digest, expected target and ownership.
Recovery SHALL reconcile observed external state before retrying an uncertain effect.
Acknowledgement and its corresponding request transition SHALL commit atomically.
The publisher SHALL enforce current authorization before new dispatch; a local database lease
SHALL NOT be treated as revocation of a remote operation already sent or as exactly-once execution.

#### Scenario: Acknowledgement belongs to another effect

- **WHEN** an acknowledgement differs in request, subject, payload, target or expected remote identity
- **THEN** no publication/admission/merge stage is advanced

#### Scenario: Remote merge succeeds before the controller crashes

- **WHEN** merge succeeds remotely and the controller crashes before durable acknowledgement
- **THEN** recovery observes the actual merged commit and atomically records it with exactly one
  linked protected-revision certification request, without blindly invoking merge again

#### Scenario: Previously authorized effect completes after takeover

- **WHEN** a remote effect dispatched while authorized completes after lease expiry or supersession
- **THEN** recovery retains its actual immutable disposition, while the obsolete worker cannot
  authorize new dispatch or use its completion to grant current admission

### Requirement: Protected workflow and merge identities

The required trusted workflow SHALL remain enforced and SHALL independently verify exact
candidate admission. A controller status alone SHALL NOT replace a workflow required by the
organization ruleset. Automatic merge SHALL use current required-check conclusions and exact
head preconditions, with base freshness enforced through protected up-to-date checks or a
verified merge queue. The controller SHALL NOT bypass protection on failure.

#### Scenario: Stale approval reaches merge

- **WHEN** the head or protected integration base changes after successful evaluation
- **THEN** merge refuses the stale approval and schedules the current candidate for evaluation

#### Scenario: Unrelated identity forges a green status

- **WHEN** another actor reports success without the required authenticated activation
- **THEN** the required workflow still refuses admission

#### Scenario: Merge queue recomposes the candidate

- **WHEN** a merge group changes its verified identity/ref, base, member identity, member head
  or member order
- **THEN** the newly composed identity requires its own checks and applicable review before merge

### Requirement: Actual merged revision certification

The actual merged SHA SHALL receive its own exact certification before downstream admission.
The system SHALL NOT treat a checked PR head, merge-group SHA, ancestor or equal tree as a
certificate for another commit. Existing sole-parent integration-binding constraints SHALL
remain enforced unless changed by a separately specified and proven contract.

#### Scenario: GitHub creates a different merge SHA

- **WHEN** merge creates a commit different from the admitted PR or merge-group SHA
- **THEN** downstream admission waits for certification of the actual commit

#### Scenario: Ordinary merge is passed to sole-parent binding

- **WHEN** a two-parent GitHub merge is presented to the existing sole-parent binding emitter
- **THEN** the binding is refused rather than weakening the parent check

### Requirement: Subject-specific completion routes

PR subjects SHALL use protected merge reservation and actual merged-revision certification.
Merge-group subjects SHALL await the provider's queue outcome after admission rather than
independently issuing ordinary PR merges. Protected-revision subjects SHALL certify and
provision their exact revision without entering a merge route. Initial rollout SHALL serialize
controller-driven branch advancement through actual merged-SHA certification and admission.

#### Scenario: Protected revision reaches admission

- **WHEN** the linked protected-revision request reaches authenticated admission
- **THEN** it can provision its exact archive and satisfy the parent's merged-certified evidence,
  without issuing a recursive merge

#### Scenario: Merge group reaches admission

- **WHEN** an admitted merge group awaits integration
- **THEN** the controller reconciles the provider's queue outcome and links actual revision
  certification instead of issuing independent ordinary PR merge calls

#### Scenario: Another candidate is ready during merged certification

- **WHEN** one controller-driven merge awaits actual-SHA certification and another PR is ready
- **THEN** the second evaluation can continue but controller-driven branch advancement waits
- **AND** external branch movement leaves an explicit incomplete/superseded disposition rather
  than fabricating certification of the unfinished revision

### Requirement: Durable bounded recovery

The controller SHALL persist stage ownership, immutable request identities and external effect
identities outside candidate storage. Recovery SHALL verify completed effects before resuming,
fence obsolete workers, and bound retries for transient faults. Exhaustion or an unmodeled
failure SHALL report a terminal failure without automatic bypass or fabricated success.
Supersession SHALL be scoped to the logical subject, not a repository or SHA alone. Delayed
events SHALL be reconciled against current authoritative subject state before changing active
requests. A subject returning to an earlier candidate tuple SHALL receive a new durable
generation, and SHALL NOT revive an old lease, approval or merge effect.
The controller SHALL retain a per-subject generation high-water mark and closed-subject
tombstone independently of the active request. Request audit generation SHALL remain separate
from the bootstrap authority generation/pin. Asynchronous authoritative observations SHALL be
fenced against intervening subject-state changes and refetched on conflict.

#### Scenario: A subject closes and reopens

- **WHEN** closing removes the active request and the same subject later reopens
- **THEN** its next audit generation exceeds the retained high-water mark and no old worker,
  lease, request hash or approval is revived

#### Scenario: Durable generation exceeds the bootstrap generation

- **WHEN** candidate reconciliation preserves current authority but the subject's audit
  generation has legitimately advanced beyond the bootstrap authority generation
- **THEN** current-request validation uses the durable subject generation and accepts otherwise
  matching identity, while a changed authority pin still invalidates prior authority

#### Scenario: An older source read returns after newer reconciliation

- **WHEN** an asynchronous authoritative read returns after another reconciliation advances
  the same subject's version or observation epoch
- **THEN** its response cannot replace newer state and the controller refetches authoritative
  state before changing the active request

#### Scenario: An old event arrives after another subject advances

- **WHEN** PR A advances and a delayed event reports its prior head while PR B shares that head
- **THEN** authoritative reconciliation preserves A's current request and B's independent
  request rather than restoring A's old request or superseding B

#### Scenario: Candidate returns to an earlier tuple

- **WHEN** one subject moves from tuple A to B and back to A, and the first A worker completes
- **THEN** the current A has a new durable generation and the old worker cannot publish,
  advance admission or merge using its superseded request or lease

#### Scenario: Publication succeeds but response is lost

- **WHEN** the publisher crashes after publication and before recording success
- **THEN** recovery authenticates the existing immutable publication and resumes once without
  replacing it or issuing duplicate merge actions

#### Scenario: Lease expires while an old worker finishes

- **WHEN** a replacement worker owns the request after expiry
- **THEN** the obsolete worker cannot authorize new publication/merge dispatch or advance
  admission under the old ownership; already dispatched effects follow remote reconciliation

#### Scenario: Retry budget is exhausted

- **WHEN** transient failures exceed the configured attempt or elapsed-time bound
- **THEN** the request visibly fails with the unresolved condition and retains diagnostic evidence

### Requirement: Host retention and closure evidence

Host admission SHALL consume the same authenticated archive as CI and verify its exact
revision before use. Retention SHALL preserve referenced archives and review evidence for
the configured admission and audit lifetime. WBS closure SHALL require observed unattended
end-to-end execution, not a design packet or mocked provider.

#### Scenario: Host copy is missing or corrupt

- **WHEN** the host archive is absent, unreadable or differs from its authenticated digest
- **THEN** host admission fails; reconciliation repairs only from the trusted retained source

#### Scenario: Design exists but external authority is absent

- **WHEN** only design or simulated provider evidence exists
- **THEN** WBS 030.6 remains incomplete and the bootstrap prerequisite remains explicit
