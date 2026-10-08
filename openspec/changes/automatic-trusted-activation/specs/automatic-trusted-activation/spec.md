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

### Requirement: Authoritative ordinary-PR polling

Ordinary-PR polling SHALL validate bounded provider discovery and directly reconcile both
newly discovered and durable active subjects. The current provider response SHALL bind the
configured repository, requested PR subject, eligibility, target ref and exact head/base
identities before the controller commits under its subject observation-version fence.
Unknown, malformed, inaccessible or incompletely enumerated provider state SHALL fail closed
without manufacturing a closed subject, new authority or successful activation.

#### Scenario: Timer discovers eligible work without an event

- **WHEN** a reconciliation tick discovers an eligible open non-draft PR with no recorded event
- **THEN** the mounted provider and durable owner create its exact current request, and repeated
  ticks reuse that request while its identity and eligibility remain unchanged

#### Scenario: Listing loses an active PR

- **WHEN** a durable active PR is absent from the latest ready listing
- **THEN** the controller directly reads that subject and supersedes it only after validated
  current ineligibility, preserving high-water generation for a later return

#### Scenario: Provider read is ambiguous

- **WHEN** discovery/current reads encounter inaccessible or malformed state, unconfirmed
  absence, foreign identity, invalid continuation, conflicting pages or a pagination bound
- **THEN** the affected observation refuses without converting failure into empty inventory,
  closure or approval, and a later bounded tick may reconcile independently confirmed subjects

#### Scenario: Current PR changes after discovery

- **WHEN** listing names A but the current read names B, or another owner advances the subject
  while the current read is held
- **THEN** the owner uses authoritative B or refetches after the observation fence changes,
  with no database transaction held across the provider wait and no revival of A's old lease

#### Scenario: Ready PR becomes draft then returns

- **WHEN** an active ready PR becomes an authenticated open draft and later returns ready
- **THEN** current eligibility is retired without asserting a merge, and its return receives
  a fresh generation rather than inheriting the retired request's work authority

#### Scenario: Bounded GET-only PR transport

- **WHEN** the installed ordinary-PR reader lists or fetches through GitHub REST
- **THEN** it sends only GET to the fixed API origin with a trusted optional credential,
  validates same-origin pagination metadata before locally constructing the next request,
  and bounds response bytes and elapsed time before returning untrusted provider JSON
- **AND** redirects, non-200 statuses, rate limits, malformed bodies and ambiguous reads
  refuse rather than becoming empty discovery, closed PR state or activation authority

### Requirement: Finite single-flight observation service

The observation entrypoint SHALL perform at most one bounded ordinary-PR reconciliation
attempt under a host-local process lock and independently pinned configuration. It SHALL
require explicitly initialized durable state, retain attempts/cooldowns across restart and
expose busy, deferred, cancelled and complete reconciliation distinctly. It SHALL NOT execute
evaluation, worker, review, publication, admission, merge or WBS effects.

The uninstalled service artifact SHALL invoke an executable launcher with a canonical protected
configuration and optional explicit read credential, without ambient token or env-file discovery.
It SHALL pin its runtime and trusted configuration bytes, confine writes to the private state
directory and retain the one-tick exit status. Rendering SHALL refuse unsafe account, path,
digest or timeout inputs and SHALL NOT initialize/migrate state or install/enable a unit.

#### Scenario: A rendered timer fires before administrator initialization

- **WHEN** the launcher runs against absent protected state
- **THEN** it fails without creating a database, making a provider read or reporting success

#### Scenario: Another process owns observation

- **WHEN** a second tick or initialization process targets the same state store
- **THEN** it reports busy without provider reads or mutation while the first holds the lock
  through tick settlement, state completion and database closure

#### Scenario: Shutdown arrives during an authoritative read

- **WHEN** shutdown or the whole-tick deadline occurs while a provider response is held
- **THEN** unfinished observation commits are fenced, the response cannot revive work, and
  the controller continuation settles before database closure and lock release

#### Scenario: Cleanup cannot settle within its budget

- **WHEN** cancelled local work cannot settle before the cleanup deadline
- **THEN** the supervised process fails and terminates with ownership retained until exit,
  without releasing the lock while an old continuation can still mutate durable state

#### Scenario: Synchronous cleanup overruns the monotonic budget

- **WHEN** controller or scheduler database closure blocks the event loop across the
  whole-tick and cleanup deadlines
- **THEN** the tick does not report complete and terminates before releasing its
  process lock, even when a timer callback could not run during closure

#### Scenario: Terminal completion and later cleanup are distinguished

- **WHEN** the monotonic deadline or cancellation arrives before the terminal
  journal COMMIT
- **THEN** the tick cannot record complete or restore healthy status
- **AND WHEN** terminal COMMIT succeeds before that boundary but terminal
  connection closure later crosses the tick deadline or fails
- **THEN** the durable complete fact remains complete, and any close failure
  reports a separate nonzero cleanup disposition rather than cancellation
- **AND** cleanup beyond its absolute grace budget terminates while the
  process lock remains owned

#### Scenario: Bounded subject union exceeds trusted policy

- **WHEN** ready discovery and durable active subjects exceed the configured positive
  `maxSubjects` limit before authoritative current reads
- **THEN** the tick refuses without a partial successful scan or new subject writes

#### Scenario: Tick failure contains provider credentials

- **WHEN** a provider or protected-state failure causes a nonzero CLI exit
- **THEN** a required typed diagnostic reports a fixed actionable code and action
  without raw provider error text or credentials

#### Scenario: Restart occurs after a failed or interrupted attempt

- **WHEN** a process exits after reserving an attempt or persisting a provider cooldown
- **THEN** reopening preserves the consumed attempt and cooldown, with no provider call before
  the allowed time and no synthetic successful reconciliation

#### Scenario: Provider timing exceeds local retry policy

- **WHEN** a valid provider minimum is longer than the local delay or scheduling horizon
- **THEN** scheduling respects that minimum or remains visibly deferred/exhausted; malformed
  supplied timing refuses instead of silently falling back or shortening the delay

#### Scenario: Retry burst is exhausted

- **WHEN** the finite transient attempt budget is consumed
- **THEN** the tick fails and retains failed health; later bounded recovery probes respect
  their persisted interval and only a complete successful tick restores healthy status

#### Scenario: Established state is absent or invalid

- **WHEN** scheduled execution sees missing, unreadable, partial, corrupt or wrongly bound state
- **THEN** it refuses before provider calls and cannot initialize, repair or reset that state;
  explicit initialization cannot overwrite existing state or manufacture bootstrap authority

#### Scenario: Observation succeeds without other capabilities

- **WHEN** an initialized tick reconciles an eligible ordinary PR through the mounted reader
- **THEN** exact observation state is retained with zero evaluation, worker, review, publication,
  admission, merge and WBS effects; service templates alone do not establish live deployment

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

### Requirement: Selected external provider authority

The controller SHALL use GitHub Actions custom artifact attestations as the external journal
envelope for 2.1 and SHALL require an independently installed versioned provider descriptor.
The descriptor SHALL bind immutable control repository/workflow identities, signer/source
digest, issuer, signing and receipt audiences, predicate type/version, trusted roots/verifier,
retrieval/registration origins, model/protocol/prompt/program pins, retention and verified plan
entitlement. No absent field SHALL acquire a default from candidate input or ambient state.
Anthropic Messages API is the recommended execution backend, requiring explicit approved
model access; a model response SHALL NOT itself authenticate a review.

#### Scenario: Provider configuration lacks authority or entitlement

- **WHEN** any required pin or entitlement is missing, malformed, unreadable or mismatched,
  or private/internal attestations lack GitHub Enterprise Cloud entitlement
- **THEN** real dispatch and receipt authentication refuse; legacy bootstrap history remains
  readable but cannot acquire guessed authority, and no HTTPS broker fallback occurs

#### Scenario: Configured identity drifts

- **WHEN** a dispatch ref resolves to another program, repository/workflow identity changes,
  or a signed receipt has the wrong issuer, signer digest, predicate version or receipt audience
- **THEN** no receipt is selected and no new invocation is authorized under the old pin

### Requirement: Authenticated journal mapping and retention

The verifier SHALL authenticate an immutable journal manifest and its exact evidence artifacts
before returning the existing `VerifiedCompleteReview` or `VerifiedColdTerminal` contract.
It SHALL bind exact submission and canonical source-evidence digests separately from the
attested manifest digest and SHALL preserve phase, attempt, registered invocation and actual
protocol observations. `recordReceipt` SHALL remain the transactional selection/join owner.
Retrieval SHALL enforce protected origins, resource bounds and credential separation.

#### Scenario: Fixed journal resources are retrieved without receipt authority

- **WHEN** a protected registration supplies a manifest SHA-256 and the pinned journal
  producer serves its complete canonical manifest and digest-addressed artifacts
- **THEN** retrieval uses only the v1 fixed manifest/artifact routes, verifies exact bytes
  and returns an unauthenticated `RetrievedReviewJournal` with no selected receipt,
  `VerifiedReview` or database write

#### Scenario: Candidate lookup is complete and bounded

- **WHEN** the GitHub attestation API returns multiple pages or multiple matching bundles
- **THEN** the reader joins the pinned repository ID, validates one exact next cursor and
  all fixed query filters, scans at most five pages and 16 candidates, and returns the whole
  candidate set without selecting by response order; malformed or truncated pagination refuses
  and invalid UTF-8 listing bytes refuse before parsing, including informational fields

#### Scenario: Retrieval cannot cross a credential or resource boundary

- **WHEN** a journal or candidate request redirects, a bundle hint points elsewhere,
  an origin or route changes, a body exceeds its declared or streamed limit, a digest differs,
  staging is incomplete or symlinked, a cache entry conflicts, or cancellation occurs
- **THEN** retrieval refuses with a typed failure, forwards no credential across its exact
  origin and route-family capability, and exposes no partial journal or selected receipt

#### Scenario: Late response cleanup remains observable and bounded

- **WHEN** a fetch returns a response after cancellation, its body cancellation rejects,
  stalls or settles after the monotonic request deadline, or pending-directory removal
  crosses the operation deadline or caller abort
- **THEN** retrieval cancels the late body within the original request deadline, reports
  redacted late cleanup failure to its required observer, and classifies post-cleanup
  deadline or cancellation while preserving the original typed refusal as a cause

#### Scenario: Valid attestation covers incomplete or substituted review

- **WHEN** a signature is valid but submission/source/artifact bytes differ, required raw
  response/read/telemetry is absent, informed evidence borrows another cold artifact, or a
  cold-only terminal is relabeled passed or informed
- **THEN** the mounted receipt owner refuses without changing selected evidence

#### Scenario: Retrieval loses required evidence or changes origin

- **WHEN** an artifact is absent, unreadable, corrupt or expired, or retrieval redirects to an
  unapproved origin or exceeds its configured bound
- **THEN** authentication refuses without leaking credentials or treating missing bytes as
  a successful review; a retained complete journal remains retrievable after process restart

### Requirement: Idempotent external review acceptance

The controller SHALL reserve immutable invocation/effect bytes before dispatch. The protected
provider registry SHALL accept a matching effect at most once under current authority and
live lease ownership before any model execution. Duplicate delivery SHALL recover that
accepted fact. Dispatch acknowledgement, run listings and workflow concurrency alone SHALL
NOT establish invocation acceptance. Recovery SHALL distinguish authoritative absence from
unavailable/ambiguous state and preserve bounded retries and historical facts.

#### Scenario: Lost dispatch reply and duplicate workflow run

- **WHEN** the dispatch reply is lost and a duplicate run receives the same effect
- **THEN** recovery queries its authenticated registry, preserves the exact invocation/payload,
  and returns the original accepted fact without starting another accepted execution

#### Scenario: Registry is unavailable or acceptance fence changed

- **WHEN** the registry cannot establish absence, effect bytes conflict, or authority/owner/
  epoch/expiry changes before provider acceptance
- **THEN** the provider does not start a model call; recovery does not infer absence or grant
  a stale acknowledgement, while any already accepted historical fact remains retained

### Requirement: Recoverable accepted execution progress

Acceptance SHALL atomically establish durable execution progress independently of the
immutable acceptance fact. Each phase/model-call ordinal SHALL carry exact input identity,
versioned ownership, lease, deadline and bounded recovery budget through `pre-send`,
`uncertain`, `evidence-retained` and immutable `terminal` disposition. A protected gateway
SHALL own the actual model send and commit its fenced send intent before that send. Unknown
execution SHALL NOT be replayed or transformed into a review verdict. Operational failure
without complete actual cold evidence SHALL NOT produce `VerifiedColdTerminal` or a receipt.

#### Scenario: Accepted worker crashes before send intent

- **WHEN** the worker dies after acceptance while progress remains pre-send
- **THEN** a replacement may recover the same invocation/input under a new fenced lease and
  bounded budget; the stale worker cannot commit an intent or independently send a call

#### Scenario: Worker crashes around the model POST

- **WHEN** send intent is committed and the process dies either before POST or after POST
  before response evidence is durably retained
- **THEN** progress remains uncertain, recovery does not resend, and bounded reconciliation
  either recovers exact authenticated evidence or records terminal operational failure;
  absent response/reads/telemetry never become a synthetic cold terminal or selected receipt

#### Scenario: Worker returns after takeover or terminal failure

- **WHEN** a stale worker returns authentic response evidence after takeover, expiry or failure
- **THEN** matching bytes may be retained as immutable facts but the worker cannot advance
  progress or select evidence; terminal state cannot reopen, and only a current owner before
  deadline/terminal may reconcile complete matching evidence

#### Scenario: Retained evidence survives crash before signing

- **WHEN** the process restarts with complete digest-bound evidence-retained progress
- **THEN** it resumes validation/journal/signing under current fences without another model
  call; conflicting or missing evidence refuses and cannot satisfy a required obligation

#### Scenario: Installed external execution is not yet observed

- **WHEN** local fixture tests pass but independent workflow/model execution, entitlement or
  durable external journal retrieval has not been observed
- **THEN** 2.1 remains open and WBS 030.6 remains blocked without a per-PR manual workaround

### Requirement: Strict signed review semantics

Checkpoint A SHALL authenticate a version-1 custom review predicate with the exact fields
and joins defined in design, including descriptor/audience, registered request/effect/payload,
review/attempt/invocation, independently resolved selection, execution pins, attestor and
manifest phase bindings. Certificate/provider metadata SHALL authenticate signer/run identity;
predicate assertions SHALL NOT supply their own authority. The result SHALL authenticate only
the manifest, not grant receipt authority. Missing selection or identity mappings SHALL refuse.

#### Scenario: Signed wrong subject or workflow claims trust

- **WHEN** a cryptographically valid predicate substitutes selection, request, audience,
  workflow ID, signer revision, invocation or phase bindings
- **THEN** authentication refuses the expected review; signed labels cannot override protected
  selection, certificate claims or authenticated workflow metadata

#### Scenario: Duplicate and conflicting candidate attestations

- **WHEN** all bounded candidates have been evaluated and valid proofs differ only in signing
  run, bundle/signature or timestamp while the normalized predicate is identical
- **THEN** retain every proof and select the smallest bundle digest deterministically
- **WHEN** applicable authenticated claims conflict, or a required verification operation fails
- **THEN** refuse rather than choose first/newest or skip an operational failure

### Requirement: Persisted protected review selection

Checkpoint A SHALL resolve subject, ordered context and required-read sets from immutable
explicitly versioned selection records in the protected controller database, using registration-derived
request/review/protocol keys. A protected pinned producer SHALL derive records from the frozen
validated coverage plan and content. The newly versioned frozen plan and dispatch SHALL bind
record and selection identities before provider execution. Receipt-supplied labels, paths or
selection expectations SHALL NOT be authority. Absent legacy mapping SHALL require replanning.

#### Scenario: Selection state is missing or substituted

- **WHEN** a selected row is absent, unreadable, malformed, noncanonical or conflicts with its
  frozen plan, registration, source obligation, selector pin or candidate content
- **THEN** authentication refuses without repairing state from the predicate or receipt

#### Scenario: Selection freeze is partial or replay changes bytes

- **WHEN** a plan freeze fails between selection persistence and obligation references, or
  replay proposes different selection bytes under the same key
- **THEN** no partial plan commits and no existing immutable selection is overwritten

#### Scenario: Legacy request lacks a selection binding

- **WHEN** an old frozen plan or dispatch lacks the versioned selection references
- **THEN** retain historical bytes but refuse dispatch/authentication until explicit fenced
  replanning; a signed subject or empty-context default cannot fill the gap

#### Scenario: Protected selection is stable across producer and restart

- **WHEN** the controller reopens retained state or the independent executor consumes the
  exact registered selection record
- **THEN** both derive the same subject, ordered context, required reads, record identity and
  selection identity from frozen sources; held stale resolution cannot authorize a receipt

### Requirement: Deterministic exhaustive selection preparation

The initial versioned selector SHALL derive all primary coverage obligations from retained
candidate objects, installed policy and the validated exhaustive graph. It SHALL retain subject
preimages and raw blob bytes separately, apply the exact cold/context rules and deterministic
ordering in design, and refuse bounds or missing coverage rather than shrink the selection.
Long preparation SHALL precede an atomic, current-owner-fenced freeze transaction.

#### Scenario: Descriptor reading omits actual source

- **WHEN** a file/documentation selection retains and observes its subject descriptor but
  omits the separately addressed raw source blob
- **THEN** the selected cold read requirements are incomplete and no passing receipt is possible

#### Scenario: Sampling or stale inputs shrink primary coverage

- **WHEN** a producer substitutes sampled audit obligations, a stale derived module mapping,
  candidate-supplied policy, or an artifact graph omitting an evidence record
- **THEN** preparation refuses before freezing any plan or dispatch authority

#### Scenario: Informed expansion exceeds its budget

- **WHEN** complete required resources or context exceed installed byte/count/token limits,
  or an applicable relationship/documentation endpoint cannot resolve
- **THEN** refuse visibly without truncating, dropping neighbors or claiming complete coverage

#### Scenario: Takeover or failure interrupts selection freeze

- **WHEN** ownership/generation/authority changes during held preparation or an insert fails
  midway through freeze
- **THEN** no stale or partial selection references commit; immutable unselected content grants
  no authority and no dispatch occurs

#### Scenario: Reopened selection or dispatch bytes conflict

- **WHEN** restart encounters missing/corrupt retained content, altered selection bytes or a
  dispatch whose selection digest differs from its frozen pair
- **THEN** refuse without rebuilding evidence from current checkout or repairing old payloads

### Requirement: Complete deterministic partition coverage

The versioned selector SHALL partition the full original exhaustive obligation into bounded
whole duties without dropping resources or relationship endpoints. Each shard SHALL have its
own immutable paired review and registered partition/selection identities. An indivisible
oversized duty SHALL refuse. Only exact complete current passing shard evidence SHALL produce
a controller-derived coverage certificate. Multi-shard coverage SHALL require global synthesis;
only a complete authenticated reduction DAG and terminal synthesis certificate SHALL satisfy
the original review or verified join. This change SHALL implement that bounded protocol.

#### Scenario: Partition omits a resource or crossing relationship

- **WHEN** a partition drops original documentation, substitutes sampled duties, splits a
  required relationship across shards without its endpoint resources, or changes a shard digest
- **THEN** reject partition/freeze or receipt selection despite passing remaining shard receipts

#### Scenario: Whole duty exceeds an empty shard

- **WHEN** a required duty plus common cold reads and journal reservations exceeds its cap
- **THEN** refuse explicitly without splitting opaque bytes, dropping reads or increasing limits

#### Scenario: Complete coverage is mistaken for global synthesis

- **WHEN** every shard of a multi-shard obligation passes with complete observed reads
- **THEN** coverage may be certified, but the original review remains blocked on required
  synthesis and the request cannot become verified, published or admitted through that evidence

#### Scenario: Certificate selection races or sees incomplete evidence

- **WHEN** a shard is missing/failed/skipped/foreign/stale, or ownership changes during certificate
  construction, or its selection transaction rolls back
- **THEN** no complete certificate authority commits and existing evidence remains immutable

### Requirement: Bounded authenticated recursive synthesis

For a multi-shard original obligation, the controller SHALL freeze a deterministic reduction
DAG covering every leaf and every crossing relationship duty. Each crossing relationship SHALL
review its complete retained fact/endpoints with authenticated endpoint-leaf evidence. Recursive
reducers SHALL consume exact authenticated child reports under installed fan-in/depth/node,
resource, token and aggregate execution limits. Every node SHALL perform a real paired review
under the versioned synthesis protocol. Reports SHALL retain judgments, rationale and actual
input citations; unsigned summaries and pass-only aggregation SHALL NOT authorize synthesis.

#### Scenario: Many documents require multiple reducer levels

- **WHEN** the complete original documentation and relationship inventory exceeds one review
  and one reducer fan-in, while indivisible duties and installed aggregate limits fit
- **THEN** deterministic bounded leaves and recursive reducers cover every original duty;
  all current authenticated passing node pairs and a passing global root produce the terminal
  certificate without sampling, truncation or a per-PR operator step

#### Scenario: Crossing relationship disappears in aggregation

- **WHEN** a DAG omits a crossing-duty node, substitutes endpoint ownership, drops a child or
  uses an unreachable/cyclic node to claim coverage
- **THEN** independent validation against the original partition and graph refuses authority
  despite all remaining leaf receipts passing

#### Scenario: A child report is unauthenticated or adverse

- **WHEN** a parent sees an unsigned summary, digest-only placeholder, altered report,
  missing/foreign/stale selected pair, failed judgment or unresolved child finding
- **THEN** parent materialization or receipt acceptance refuses without synthesizing a pass
  and the original evidence remains retained

#### Scenario: Ready reducer inputs change or freeze rolls back

- **WHEN** a selected child attempt or owner changes during held materialization, a selection
  insert fails, or restart finds different projection bytes for a ready node
- **THEN** no partial or stale parent dispatch authority commits; exact replay never repairs
  immutable selections, and changed children require explicit fenced replanning

#### Scenario: Root discovers conflict after all leaves pass

- **WHEN** every leaf passes but a relationship reviewer or final global reducer fails
- **THEN** no terminal coverage-and-synthesis certificate or request verification is selected
  and passing children cannot waive the adverse global result

#### Scenario: A reduction or report cannot fit

- **WHEN** an indivisible relationship, two worst-case child reports, actual request token
  preflight, depth/node/call/deadline budget or terminal certificate exceeds installed limits
- **THEN** refuse the named bound without omitting evidence, silently changing policy,
  looping singleton reducers or manufacturing successful completion

### Requirement: Estimated actual-request token admission

Every actual model call SHALL receive a bounded protected count preflight for its exact request
through the pinned projection. Count estimates plus configured headroom SHALL satisfy input
and context/output policy before the current fenced owner sends. Actual usage SHALL remain
separate and SHALL also satisfy policy before a pass. Missing counter authority or failed
preflight SHALL refuse without local approximation fallback or synthetic completion.

#### Scenario: Count is reused for a changed call

- **WHEN** system/tool/history/content/model bytes, call ordinal, invocation or owner changes
  after count admission
- **THEN** refuse the model send; an estimate for previous bytes supplies no current authority

#### Scenario: Estimate passes but execution exceeds policy

- **WHEN** the provider rejects context size or retained actual usage/output exceeds policy
- **THEN** retain the appropriate real operational/review failure and never produce a pass,
  even when the earlier estimate plus margin passed

#### Scenario: Counter or retained preflight evidence is incomplete

- **WHEN** count is unavailable/malformed/over-budget, arithmetic overflows, retries expire,
  or the signed journal omits/substitutes a call's preflight record
- **THEN** refuse admission or semantic verification without fabricated counts or telemetry

### Requirement: Canonical byte identity includes the terminal LF

Canonical review resources SHALL use exact UTF-8 `serializeCanonical` output, including one
terminal LF. Canonical identity SHALL hash those bytes. Raw content/responses and signed
bundle/statement bytes SHALL retain their original encoding for their corresponding hashes
and signature verification; they SHALL NOT be normalized into canonical resources implicitly.

#### Scenario: Semantically equal JSON has different canonical bytes

- **WHEN** a canonical resource omits its LF, uses CRLF or extra whitespace, changes key order,
  or supplies duplicate object keys
- **THEN** refuse its noncanonical bytes rather than normalize them to the expected digest
- **WHEN** a retained raw response ends with a newline
- **THEN** preserve that exact newline in its raw-response digest without adding or stripping one

### Requirement: Exact phase submissions and artifact graph

Each signed phase submission digest SHALL address retained canonical bytes at the artifact
route. Checkpoint B SHALL validate both complete phase submissions, or the genuine cold-only
terminal submission, using existing source projections and protocol schemas. Artifact roles
SHALL resolve by exact content identities and required cardinality. Findings, terminal reasons,
raw responses, telemetry and read observations SHALL NOT be defaulted or synthesized.
The adapter SHALL return only the selected phase after validating the entire authenticated
source graph and independently selected subject/read requirements.

#### Scenario: Phase submission changes its source projection

- **WHEN** exact submitted bytes, source digest, findings/status/reason, phase input or any
  role resource differs from the authenticated manifest or selected source
- **THEN** no review receipt is returned or selected; manifest digest cannot substitute for
  the exact submission or canonical source digest

#### Scenario: Retained content is mistaken for observed reading

- **WHEN** content files exist but signed actual observed-read lists omit a required content
  identity, or model claims replace trusted executor observations
- **THEN** required review evidence remains incomplete despite matching resource hashes

#### Scenario: Cross-phase evidence is substituted

- **WHEN** input/output subject or invocation, telemetry input/raw-output digest, measured
  phase aggregation, informed context or exact acknowledged cold judgment differs
- **THEN** the mounted verifier refuses without selecting either submitted receipt

### Requirement: Phase verdict preservation

Complete cold and informed submissions SHALL share exact inputs and phase source evidence
while preserving their own authenticated verdicts and unresolved findings. A non-passing cold
phase SHALL remain terminal with no informed phase. A cold pass followed by informed failure
SHALL retain the cold receipt and fail the request. Operational absence of phase evidence
SHALL NOT produce a fabricated cold terminal or successful review.

#### Scenario: Cold passes and informed review fails

- **WHEN** both complete submissions authenticate, cold passed without unresolved findings
  and informed failed with its retained verdict/findings
- **THEN** cold may be recorded first and informed failure then fails the request; informed
  cannot precede its paired cold, and the request never becomes verified

#### Scenario: Informed execution is absent after a cold pass

- **WHEN** informed response or required observations are absent after actual cold success
- **THEN** retain the operational failure/partial evidence, without rewriting cold as failed
  or manufacturing a complete review receipt

#### Scenario: Receipt ownership changes during semantic verification

- **WHEN** generation, authority, lease or own attempt/registration changes while verification
  is held, or the later receipt transaction fails
- **THEN** no stale or partial selected evidence commits; prior immutable receipts remain intact

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
