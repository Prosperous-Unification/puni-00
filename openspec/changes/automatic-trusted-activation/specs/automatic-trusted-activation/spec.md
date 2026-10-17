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

#### Scenario: A historical operator capture is offered as trusted evidence

- **WHEN** a previously captured operator review, journal entry or receipt (2026-10-01 audit
  rule: no historical operator capture is replayed as trusted evidence) is resubmitted, or the
  built-in invoker's `local-cooperative` record is presented under a `require-external` policy
- **THEN** it is refused as trusted evidence: only an informed request that consumes an
  acknowledged cold judgment from the independently selected provider can complete a review

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

### Requirement: Complete retained-content extraction

The installed producer SHALL derive all eleven freeze documents and their source projections
from a closed retained candidate, every policy-declared historical input and an independently
pinned compiler/dependency closure. Candidate/history reads SHALL NOT use ambient filesystem,
Git, current checkout or network fallback. Exact historical commit/tree/path/blob proof and
selector completeness SHALL precede extraction. Head-only support SHALL NOT replace required
historical selectors. All objects, parser work and documents SHALL obey installed finite bounds.

#### Scenario: Historical authority differs from head and base

- **WHEN** an installed declaration selects a third exact commit's path with bytes different
  from the same path at head/base
- **THEN** capture and retain its exact commit/tree/blob proof before extraction; source removal
  and replay preserve those bytes and the existing selector meaning

#### Scenario: Historical closure is unavailable or substituted

- **WHEN** a required commit/path/proof is absent, a tree edge or blob differs, the declared
  selector set is shrunk or a capture bound expires
- **THEN** refuse with the named historical failure and select no complete preparation;
  neither head bytes nor an empty history manifest can substitute

#### Scenario: Compiler resolution attempts an ambient read

- **WHEN** config extends, imports, types, symlinks or dependency metadata resolve outside the
  retained candidate and pinned runtime namespaces, or ambient dependency configuration changes
- **THEN** refuse before any outside read; legitimate absent probes inside the closed namespace
  remain modeled absence and complete read observations bind the actual selected bytes

#### Scenario: Static Nx target authority survives retained replay

- **WHEN** retained declaration evaluation selects an explicit Nx target after source checkout
  and retained storage removal following capability open
- **THEN** the installed composition derives the project census and target configuration from
  owned candidate bytes through the shared static selector core, preserves legacy shallow defaults
  and implicit dependencies, executes no candidate code, and refuses copied candidate authority
  or entry/read/byte/output overflow before returning declaration facts

#### Scenario: All documents survive retained replay

- **WHEN** the producer is reopened after its original checkout and acquired Git store are gone
- **THEN** all eleven documents, exact bindings, exhaustive obligations and source projections
  recompute from retained bytes; corrupt input or stale ownership commits no partial selection

### Requirement: Shared bounded TypeScript compiler IO prerequisite

The shared source entrypoint SHALL derive the existing TypeScript selectors and extractor
identities through explicit IO ports. Config parsing, referenced-project enumeration, compiler
source reads, default libraries and resolution SHALL use those ports without ambient filesystem,
Git, subprocess, environment or candidate-code execution. The legacy filesystem wrapper SHALL
retain its existing selectors, identities and absent/directory/malformed diagnostic distinctions.
The source entrypoint SHALL snapshot and validate every finite limit before IO, count repeated
probes, UTF-8 reads, enumerated paths and output observations before accumulation, and bound the
complete canonical returned envelope including identities and empty selector arrays.
This prerequisite SHALL NOT establish retained replay, runtime-closure authentication or protected
authority; those remain part of the complete retained-content extraction requirement.

#### Scenario: Referenced wildcard config and supplied compiler library

- **WHEN** source-owned config bytes select a wildcard project reference and supplied default libraries
- **THEN** extraction derives real selectors with every IO route delegated to the source, even when
  ambient filesystem, TypeScript system, environment, write and execution routes throw

#### Scenario: Invalid or exceeded source execution limit

- **WHEN** a required limit is absent, nonfinite, fractional or negative, or repeated
  probes/reads/enumeration/output exceed their original snapshotted ceiling
- **THEN** extraction refuses without returning relationships; exact final output size succeeds and
  one byte less refuses, including an extraction whose selector families are all empty; caller
  policy changes during IO do not replace the original ceiling or bypass an exceeded cap

### Requirement: Derived artifact dependency semantics

The installed producer SHALL derive exact artifact descriptors, dependency edges and roots
from every retained evidence record plus its pinned versioned graph recipe. Semantic hashes
SHALL NOT be guessed as graph references. Review raw-response payload hashes SHALL resolve to
exact retained container identities under the declared rule. Independent derivation SHALL reject
missing, foreign, ambiguous and false-empty graphs even when a caller graph passes structural
validation. Empty graphs SHALL require an actually empty evidence census.

#### Scenario: Payload digest differs from container artifact digest

- **WHEN** a review receipt names its raw response payload and a matching opaque transcript
- **THEN** the edge targets the transcript artifact's exact byte digest after invocation/payload
  checks; a payload digest, another invocation or missing/ambiguous transcript refuses

#### Scenario: Semantic identities look like artifact hashes

- **WHEN** inventory/protocol/executor/context or opaque payload fields contain digest-shaped values
- **THEN** apply the exact pinned per-record mapping; no fabricated edge or recursively parsed
  opaque payload enters the graph

#### Scenario: A plausible caller graph omits required structure

- **WHEN** a graph drops an evidence record, required intrinsic/installed edge or derived root,
  adds a foreign node, or claims empty evidence despite retained records
- **THEN** independent derivation refuses before freeze even if remaining descriptors and
  references are structurally valid

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

### Requirement: Bounded declared runtime admission

The system SHALL admit only exact independently pinned canonical closed `ReviewRuntimeClosureV1`
bytes with a nonempty program inventory, unique UTF-8-byte-sorted canonical relative virtual
file paths, no file-ancestor conflicts, exact roles, safe lengths and raw SHA-256 file identities.
It SHALL capture every declared file through regular, readable, non-symlinked leaves and
ancestors outside the candidate, reconcile stable file metadata, and close every descriptor
before publishing an immutable capability. Read and cleanup failures SHALL preserve both causes
and publish no partial capability. Positive safe-integer installed limits SHALL bound manifest
bytes, entries, path bytes, filesystem probes, content reads/read bytes, retained content bytes
and lifetime content allocations before their corresponding work or allocation.

#### Scenario: Declared runtime capture succeeds

- **WHEN** canonical independently pinned closure bytes and every declared installed file satisfy
  all identity, path, readability, stability, separation and resource checks
- **THEN** the frozen exact-object capability returns fresh owned bytes only for the complete
  declared path/role/identity/length tuple, unaffected by caller or later ambient mutation

#### Scenario: A dependency or runtime admission fence is invalid

- **WHEN** a declared file is missing, unreadable, substituted, symlinked at any ancestor or leaf,
  overlaps the candidate, differs in exact bytes or length, changes during capture, or a closure
  schema, canonical pin, path or resource constraint fails
- **THEN** admission refuses without publishing a partial capability, including after cleanup failure

#### Scenario: Extra installed files or copied methods request authority

- **WHEN** an extra installed file, unknown or altered tuple, or copied capability method is offered
- **THEN** it confers no read, discovery, enumeration, resolution or fallback authority and refuses
  before any filesystem IO; post-capture legitimate reads use owned bytes exclusively
- **AND** this admission prerequisite authenticates only the declared bytes; transitive completeness,
  protected installation ownership and executing compiler/runtime identity remain separate obligations

#### Scenario: Configured bootstrap getters change across accesses

- **WHEN** configured roots, closure bytes, expected identity or installed limits use changing getters
- **THEN** admission snapshots each top-level operand once before checks, copies the captured
  limits, bounds and copies the captured byte reference, and publishes only the captured expected pin

#### Scenario: A physical root contains malformed Unicode

- **WHEN** a configured physical root would change under UTF-8 encoding, including a lone surrogate
  that aliases a replacement-character directory
- **THEN** admission rejects before realpath/open/read, independently of path-library normalization,
  and checks physical root byte ceilings before round-trip allocation

### Requirement: Bounded retained namespace metadata

The system SHALL build a deeply frozen metadata-only virtual namespace from exact owned
retained candidate and declared runtime capabilities. Both provenance lookups SHALL precede
inspection of either census. Exact-owner namespace provenance SHALL bind candidate and runtime
identities, independently hashed canonical `namespacePolicyIdentity`, the opaque unjoined
closure `resolutionPolicyIdentity`, and `runtimeTrust: 'unverified'`.

#### Scenario: Owned metadata is indexed after acquisition roots disappear

- **WHEN** exact owned candidate and runtime capabilities survive removal of their source,
  retained store and runtime roots
- **THEN** namespace creation uses metadata exclusively, emits byte-sorted directories and
  exact candidate regular/symlink and runtime file tuples, and performs no content, filesystem,
  Git, compiler, parsing, environment, history, glob or symlink-resolution access
- **AND** all published metadata is immutable and has no content-read API

#### Scenario: V1 virtual paths select compiler-visible metadata

- **WHEN** a candidate path `p` or runtime dependency path beginning `node_modules/` is indexed
- **THEN** its virtual path is `/__puni_review__/candidate/p`; runtime programs and other runtime
  entries are not compiler-visible
- **AND** the namespace is case-sensitive, its working directory is `/__puni_review__/candidate`,
  and its configured library directory is `/__puni_review__/candidate/node_modules/typescript/lib`
  without asserting directory existence

#### Scenario: Copied owners or invalid trusted metadata request a namespace

- **WHEN** either capability is copied or supplies a false-empty census, or metadata contains
  malformed Unicode, NUL, backslash, empty/dot/traversal/noncanonical path components,
  candidate `.git`/`node_modules`, unsupported modes/Gitlinks, visible runtime `.git`, duplicate
  mounts, or file/symlink ancestors
- **THEN** construction refuses before publishing a namespace; symlinks never resolve

#### Scenario: Namespace bounds exceed their installed ceilings

- **WHEN** any installed limit is not a positive safe integer, candidate plus all declared
  runtime entries exceed `maximumEntries` before filtering, emitted nodes including root exceed
  `maximumNodes`, any source/virtual path exceeds `maximumPathBytes`, or retained node and source
  tuple path fields exceed `maximumTotalPathBytes`
- **THEN** construction refuses before corresponding accumulation, path concatenation or UTF-8
  buffer allocation; each limit is captured once with no defaults
- **AND** this index supplies no compiler mount or claim of runtime completeness or authentication

#### Scenario: Namespace recipe identity is independently bound to exact V1 bytes

- **WHEN** an owned namespace is constructed under the fixed V1 recipe
- **THEN** its namespace policy identity equals the independently computed SHA-256 of the exact
  canonical recipe bytes, including key order and terminal LF
- **AND** the constructor hashes the private frozen recipe once after ownership and limit
  validation; replacing the published pin or omitting a recipe field fails the independent oracle

### Requirement: Direct retained TypeScript source admission

The system SHALL expose the complete TypeScript source interface over exact owned retained
namespace, candidate and runtime capabilities, joining their snapshot/classification and runtime
closure/resolution identities before inspecting the namespace census. The source and its
exact-owner provenance SHALL remain frozen and retain unverified runtime trust.

#### Scenario: Direct methods read an owned virtual namespace after physical removal

- **GIVEN** an admitted retained namespace and candidate/runtime bytes whose source, store and
  runtime roots have been removed
- **WHEN** direct path-kind, read, directory listing, recursive matching, realpath and cwd methods run
- **THEN** only owned metadata and content are consulted; intercepted filesystem, Git, ambient
  environment and `ts.sys` ports cannot supply reads or enumeration
- **AND** the source is case sensitive, uses the fixed candidate cwd and configured library directory,
  and returns modeled in-namespace misses while refusing outside/malformed direct queries before reads

#### Scenario: Current symlinks route through retained components

- **WHEN** selected candidate links occur at leaf or ancestor components
- **THEN** the shared retained component walk preserves exact BOM target bytes, follows candidate-only
  links, refuses cycles/escapes and file ancestors before parent normalization, and never mounts a
  declared runtime file through a candidate alias
- **AND** reads decode fatal UTF-8; regular file BOMs are stripped, while runtime files are direct
  declared entries and candidate file reads require complete private path/blob/raw identity tuples

#### Scenario: Enumeration follows the installed pure TypeScript matcher

- **WHEN** direct enumeration supplies extensions, include/exclude patterns or a depth
- **THEN** ordering, matching and depth behavior match the pinned installed `ts.sys` on equivalent
  small fixtures, and immediate directory listing returns basenames
- **AND** production uses only the pinned pure matcher with a checked runtime shape and owned
  metadata callbacks; changed matcher shape refuses without a filesystem fallback

#### Scenario: Any source resource ceiling is exceeded

- **WHEN** explicit positive safe integer ceilings for nodes, lifetime probes/steps/reads/raw bytes,
  query/target/expanded path bytes, link expansions, directory depth, lifetime pattern count/bytes,
  enumerated entries or returned path bytes would be exceeded
- **THEN** the source throws before the bounded copy or accumulation; candidate raw byte length
  comes from private exact-owner metadata and is reserved before candidate.read copies content
- **AND** limits are captured once; copied owners, foreign provenance and changing limit getters
  cannot replace the admitted source authority

#### Scenario: Pattern normalization could erase a file ancestor or candidate alias

- **WHEN** any include/exclude pattern contains a `.` or `..` path component, either before
  or after a wildcard
- **THEN** direct source admission refuses the pattern before any content read or matcher call
- **AND** all supplied patterns receive syntax admission before literal-prefix resolution;
  ordinary admitted literal prefixes still walk files and candidate aliases component-wise
- **AND** all-missing include prefixes return no matches rather than passing an unrestricted
  empty include array to the matcher; valid mixed includes retain their order
- **AND** query-root normalization retains candidate alias provenance and cannot expose
  runtime entries after canonical spelling; cwd output and trailing-separator listing remain bounded

The direct e2 interface deliberately does not claim full tsconfig-pattern compatibility or
compiler mounting. Dot components in direct query roots continue through the component walk.

Drive-rooted patterns are outside the fixed POSIX namespace and SHALL refuse during pattern
syntax admission, before any literal-prefix read or matcher invocation.

#### Scenario: Expanded paths fit individually but exceed their combined byte ceiling

- **WHEN** a candidate link expansion has individually fitting target, resolved components
  and remaining components but their sum including one separator per component exceeds the limit
- **THEN** the source refuses the expansion before continuing its component walk
- **AND** an expansion equal to the byte limit remains admitted

#### Scenario: Caller pattern getters change their arrays during capture

- **WHEN** a supplied pattern or extension array getter appends or removes entries
- **THEN** the source captures its length once, reserves that count before copying, and reads
  exactly those indexed entries; appended entries do not enter the matcher and missing entries refuse
- **AND** missing-only includes remain no-match even if the caller truncates its original array
- **AND** malformed pattern syntax and invalid supplied enumeration depth refuse before link reads

### Requirement: Retained TypeScript compiler mounting

The system SHALL provide an additive retained compiler entrypoint that constructs its source
internally from the exact owned namespace, candidate and runtime. Its workspace and provenance
SHALL come from the fixed retained namespace recipe and exact newly constructed source owner.
Caller workspace, extractor labels and supplied sources SHALL confer no authority. The returned
extraction SHALL explicitly retain unverified runtime trust.

#### Scenario: Retained compiler replays after physical capture roots disappear

- **GIVEN** a small captured candidate with noLib globals, wildcard config discovery, relative
  imports/reexports, path aliases and a declared runtime package plus compiler package metadata
- **WHEN** source, object store and runtime roots are removed before retained extraction
- **THEN** SHA-1 and SHA-256 captures produce the same complete imports, reverse edges, public
  declarations, configuration identities and compiler identity as the preserved legacy producer
- **AND** intercepted filesystem, Git, environment, cwd and ts.sys routes cannot supply access

#### Scenario: Explicit retained ES5 standard libraries preserve legacy extraction

- **GIVEN** a candidate selecting `lib: ['es5'], types: []` with no inherited noLib setting or
  handwritten globals, and exact pinned installed ES5/decorators/decorators.legacy raw bytes
  declared at namespace V1 `node_modules/typescript/lib/<basename>` paths
- **WHEN** the preserved legacy producer receives byte-identical libraries at its existing
  `@typescript/old/lib` paths, then physical capture roots disappear before retained extraction
- **THEN** SHA-1 and SHA-256 captures preserve complete legacy relationships, public declarations,
  configuration identities and compiler identity under intercepted ambient IO routes
- **AND** actual standard-library types appear in public exports; the census library subset is
  exactly the three selected raw identities/lengths, excluding an extra declared unused library
- **AND** each absent required library refuses without ambient fallback, physical mutation after
  capture has no effect, and valid changed captured library bytes change census identity even
  when the extracted relationships stay equal
- **AND** source/compiler read budgets, census bounds and whole-envelope bytes include library
  observations, with exact-fit success and one-byte-short refusal

#### Scenario: Pinned implicit default libraries preserve legacy extraction

- **GIVEN** captured candidate configs omit target/lib/noLib and handwritten globals, with
  TypeScript 6.0.3's actual lib.es2025.full.d.ts recursive closure captured byte-identically
  at the legacy @typescript/old/lib and retained namespace V1 typescript/lib locations
- **WHEN** each SHA-1/SHA-256 replay runs after physical capture roots disappear under
  invoked filesystem/Git/environment/cwd/ts.sys traps
- **THEN** complete legacy relationships, declarations, configuration and compiler identities
  match; public exports include real Document and ES5 types
- **AND** the library census is exactly 82 raw identity/length tuples totaling 2936611 bytes,
  matching fixed closure membership and parsed directives, excluding a declared unused library
- **AND** absent root, direct DOM and transitive promise libraries refuse without ambient
  fallback; physical mutation after capture cannot change retained extraction, while changed
  valid captured indirect bytes change their census identity
- **AND** finite source/compiler/census/envelope ceilings pass at equality and refuse one unit
  below; each selected proof runs in a fresh serial process under a 900 MiB operational guard

#### Scenario: Request admission precedes source construction

- **WHEN** retained extraction receives config and public entrypoint arrays and explicit limits
- **THEN** it captures each top-level group once and captures finite integer ceilings before
  source callbacks; source ceilings are positive and compiler/request ceilings are nonnegative
- **AND** it bounds nonempty array counts before indexed reads, captures each fixed length and
  path once, bounds each path's code units and UTF-8 bytes plus aggregate bytes before copying,
  and refuses missing entries, duplicates and noncanonical relative paths
- **AND** candidate selections refuse drive prefixes, lone surrogates and .git/node_modules
  components before compiler normalization; runtime package and extends resolution remain
  governed by the existing shared core and retained source

#### Scenario: Retained compiler refuses uncertain or oversized extraction

- **WHEN** config parsing, selected config/public entrypoint/import resolution, compiler
  diagnostics or a source/compiler resource ceiling fails
- **THEN** retained extraction throws rather than emitting a successful relationship envelope
- **AND** an independent finite final ceiling measures canonical bytes of the whole returned
  envelope including provenance and runtimeTrust; exact equality passes and one byte less refuses

This mount supplies no compiler read manifest, freeze, runtime authentication, general
config-generated escape policy or synchronous compiler CPU/heap bound. The noLib parity proof
makes no implicit default-library breadth claim: legacy uses @typescript/old/lib while namespace V1 uses
typescript/lib, and installed wrapper metadata can differ from the executing compiler.

### Requirement: Effective retained TypeScript typeRoots admission

Retained extraction SHALL admit each effective parser-normalized root-project `typeRoots`
through its retained source after successful configuration parsing and before compiler program
construction. Every explicit root SHALL consume the compiler probe budget and existing source
path, probe and traversal budgets even when `types` is empty or roots repeat. Admission SHALL
allow absent paths inside the retained namespace and SHALL refuse lexical or symlink escapes,
including escapes through existing ancestors of absent descendants.

#### Scenario: Effective roots follow parser inheritance and override semantics

- **WHEN** a root project inherits `typeRoots` from another configuration
- **THEN** admission uses the paths resolved relative to the declaring configuration
- **AND** an explicit root override replaces discarded inherited roots before admission
- **AND** effective outside roots refuse before program construction even with `types:[]`

#### Scenario: Compatible ordinary compiler probes remain absent outside the namespace

- **WHEN** typeRoots is omitted or the compiler probes default roots, package metadata,
  modules or ancestor directories outside its namespace
- **THEN** ordinary probes preserve their existing absent behavior
- **AND** generic source and legacy wrapper calls default to compatible configuration behavior
- **AND** unknown configuration modes refuse before source callbacks

#### Scenario: Pinned TypeScript default type discovery remains compatible

- **WHEN** both typeRoots and types are omitted under the pinned TypeScript 6 compiler
- **THEN** extraction preserves its existing absence of automatic ambient type discovery
- **WHEN** typeRoots is omitted and types contains the wildcard '*'
- **THEN** visible declared @types packages are discovered through default type-root searches
- **AND** ancestor searches outside the namespace remain absent probes

#### Scenario: Retained root admission uses owned bytes after capture roots disappear

- **WHEN** a SHA-1 or SHA-256 retained candidate uses existing, absent or valid linked roots
  after its original physical capture roots have been removed
- **THEN** extraction succeeds from retained bytes with the same canonical identities and census
- **AND** runtime trust remains unverified and failed admission publishes no successful envelope

This prerequisite does not admit nested project-reference configs, raw discarded spellings,
general configuration paths, a full compiler manifest or authenticated runtime authority.

### Requirement: Retained source byte-read census

The retained TypeScript source SHALL record every successful raw acquisition through its owned
read boundary as a tuple `{namespace, path, revision:null, identity, byteLength}`. Candidate paths
and raw identities SHALL come from private retained metadata; runtime paths and identities SHALL
come from exact closure tuples. The census SHALL preserve unverified runtime trust.

#### Scenario: Byte acquisition differs from metadata and declared availability

- **WHEN** a file, package metadata or link is acquired, including a link reached by probing
  or enumeration
- **THEN** the successful acquisition enters the census with raw bytes counted before decoding,
  including BOM bytes
- **AND** metadata-only probes, misses, failed owner copies and unused declared runtime files
  are absent; aliases deduplicate exact final-file tuples while distinct link paths remain

#### Scenario: Exact canonical census bounds precede owner copies

- **WHEN** a new tuple would exceed explicit positive safe integer `maximumReadEntries` or
  `maximumReadLedgerBytes`
- **THEN** the source throws before copying bytes or inserting the tuple
- **AND** the canonical byte ceiling includes wrapper, final LF, entries and commas; equality
  passes and a one-byte shortage refuses; repeat tuples still consume existing execution budgets
- **AND** complete canonical tuple encodings deduplicate exact tuples and sort by UTF-8 bytes

#### Scenario: Only an exact owned source can seal its final byte census

- **WHEN** `sealRetainedTypeScriptReads` receives the exact admitted source
- **THEN** it returns its cached deeply frozen census and bars all subsequent source operations
- **AND** copied sources and accessor traps confer no authority
- **AND** the compiler mount seals only after successful core extraction and counts the census
  inside its complete-envelope ceiling; failed core extraction leaves the source open

This narrow census supplies no CompilerReadManifestV1, runtime authentication/completeness,
implicit default-library breadth or freeze integration and does not change namespace V1.

### Requirement: Exact-owner successful retained TypeScript extraction

The retained compiler SHALL return an opaque deeply readonly extraction with the same enumerable
canonical envelope and unverified runtime trust. A private exact-object binding SHALL cache a
deeply frozen copied request and namespace provenance. No public constructor or registration
capability SHALL exist.

#### Scenario: Only the exact successful envelope exposes its cached provenance

- **WHEN** the extraction provenance accessor receives an exact successful extraction
- **THEN** repeated calls return the same deeply frozen private binding
- **AND** plain objects, primitives, spreads, JSON copies, inherited shapes and proxies refuse
  without reading their properties or performing IO

#### Scenario: Success freezes snapshots and publication follows every boundary

- **WHEN** retained extraction validates and copies request paths
- **THEN** copied arrays and their wrapper freeze before callbacks while caller inputs remain mutable
- **AND** successful core extraction, census sealing and the complete-envelope ceiling precede
  iterative deep freeze and exact-object registration
- **AND** nested relationship, extractor, provenance and census mutations cannot change canonical bytes
- **AND** compiler failure, a one-byte-short cap or a freeze exception publishes no owned envelope

### Requirement: Exact-owner retained candidate review provenance

A successfully opened public retained candidate SHALL own a private cached readonly frozen
record containing exactly `requestIdentity`, `snapshotIdentity` and `historyManifestIdentity`.
The record SHALL bind the detached validated activation request and exact verified retained pins.

#### Scenario: Public candidate provenance preserves complete and legacy history semantics

- **WHEN** a SHA-1 or SHA-256 public candidate passes all request, snapshot, history and final
  held-owner checks
- **THEN** its accessor returns the exact request and snapshot identities plus the verified
  history manifest pin, including a nonnull pin for complete empty history
- **AND** legacy head-only capture returns null even when supplied an irrelevant history pin
- **AND** closed raw validation precedes copying declared fields; the copied request passes
  canonical validation before use, without cloning undeclared getters or buffers
- **AND** caller request mutation after validation cannot change the binding or freeze the caller

#### Scenario: Only the exact public candidate exposes its cached record

- **WHEN** the provenance accessor receives an exact successfully opened public candidate
- **THEN** repeated calls return the same frozen three-scalar record without property reads,
  IO, rehashing or parser-budget use, even after the original repository and retained store disappear
- **AND** primitives, plain/spread/JSON copies, inherited shapes, getter poison and proxies refuse
  without reading their properties
- **AND** internal phase-one views, wrong raw pins, repinned malformed or noncanonical history,
  history/request binding mismatches and final held-owner failure publish no binding

### Requirement: Effective retained TypeScript rootDirs admission

Retained activation SHALL select the closed `retained-config-roots` configuration mode. After
successful parsing and before constructing each requested root project's compiler host, that
mode SHALL sequentially admit every effective parser-normalized typeRoots entry followed by
every effective rootDirs entry through the retained source. Each entry SHALL charge the same
existing compiler probe and source traversal budgets, with no deduplication within or across
options. The existing compatible default and retained-type-roots mode SHALL preserve their
prior behavior, and unknown modes SHALL refuse before source callbacks.

#### Scenario: Unused outside rootDirs refuse before the rejected project's host

- **WHEN** an effective rootDirs entry is outside the retained namespace, directly, by inherited
  configuration or through symlink ancestors of existing or absent paths
- **THEN** extraction refuses before constructing that project's compiler host
- **AND** it publishes no successful extraction envelope or owner even with types empty
- **AND** an earlier valid root project may already have constructed its own compiler host

#### Scenario: Effective rootDirs preserve parser semantics and admissible absence

- **WHEN** rootDirs values are inherited, overridden, repeated or normalized
- **THEN** admission uses only effective parser paths at the declaring configuration base
- **AND** inside existing, absent and valid linked roots are admitted
- **AND** discarded inherited outside values are not admitted
- **AND** long paths and exact-fit/one-less compiler, source and traversal budgets remain bounded

#### Scenario: RootDirs fallback resolves from retained bytes after physical removal

- **WHEN** src/index.ts imports a provider found through rootDirs in generated/provider.ts
- **THEN** extraction emits the exact declaration closure and raw-byte census
- **AND** SHA-1 and SHA-256 retained replay after physical capture roots disappear preserves the
  canonical envelope and census, including acquired link bytes, without ambient filesystem IO
- **AND** runtimeTrust remains unverified and generic outside compiler probes remain absent

This prerequisite does not establish nested project-reference config policy, general configuration
admission, a complete compiler manifest, runtime authentication or parent 2.1d.1.3 completion.

### Requirement: Retained effective root-project baseUrl admission

Retained TypeScript extraction SHALL admit a defined effective root-project baseUrl through its
owned source after successful config parsing and before constructing that project's compiler host.
The pinned parser SHALL supply declaring-config normalization and effective override semantics.
Outside roots and symlink ancestor escapes SHALL refuse even when unused or followed by absent
descendants. Inside absent roots SHALL remain valid. Admission SHALL charge the existing shared
compiler probe and source traversal budgets and preserve raw symlink byte census entries.

#### Scenario: Inherited outside base replaced inside

- **WHEN** a root project replaces an inherited outside baseUrl with an inside baseUrl
- **THEN** extraction admits only the effective inside root and preserves bare import resolution

#### Scenario: Unused outside root refuses before host

- **WHEN** an effective baseUrl is outside the candidate even with types empty and no bare imports
- **THEN** extraction refuses before that project's host and publishes no extraction owner

#### Scenario: Omitted roots and narrower modes remain compatible

- **WHEN** baseUrl is omitted or a caller selects compatible or retained-type-roots mode
- **THEN** no new explicit baseUrl admission is invented and ordinary package/default misses remain absent

#### Scenario: Replay uses retained bytes

- **WHEN** SHA-1 or SHA-256 captured roots are removed and ambient filesystem ports throw
- **THEN** replay produces the same canonical relationships and byte census

### Requirement: Retained effective literal TypeScript paths admission

Retained-config-roots extraction SHALL admit every effective paths substitution containing no
asterisk after effective baseUrl and before its project host, independent of key shape or usage.
Admission SHALL use the pinned compiler pure-path normalization with effective baseUrl when
defined, otherwise parser-owned declaring pathsBasePath. Malformed mappings, nested arrays,
strings, required origin or pinned helper shape SHALL refuse before host construction.

#### Scenario: Unused literal substitutions escape

- **WHEN** an unused absolute, relative or inherited literal target escapes lexically or through
  a symlink ancestor, including missing descendants and fixed targets under wildcard keys
- **THEN** extraction refuses before the rejected project host, census seal or successful owner

#### Scenario: Effective mappings preserve compiler behavior

- **WHEN** mappings are inherited, replaced including an empty map, normalized, repeated or use
  an effective baseUrl override or parser configDir expansion
- **THEN** only effective literals are admitted in existing key and substitution order
- **AND** options, duplicates, fallback order and admissible absence remain intact
- **AND** wildcard-bearing substitutions and compatible or retained-type-roots modes gain no
  explicit literal admission

#### Scenario: Retained literal aliases replay and remain bounded

- **WHEN** exact or fixed wildcard aliases resolve declarations, including ordered fallbacks
- **THEN** declarations, import targets, raw file/link census and unverified trust remain exact
- **AND** SHA-1 and SHA-256 extraction replays after physical capture roots disappear
- **AND** repeated targets consume shared compiler probes, source probes and traversal steps at
  exact-fit and one-less limits

### Requirement: Pinned compiler paths attempt observation prerequisite

An explicitly built instrumented TypeScript 6.0.3 derivative SHALL synchronously emit a closed compiler-options paths substitution event containing kind, specifier, effective baseDirectory, matched pattern, original substitution and compiler-normalized candidate immediately after candidate formation and before candidate IO. A callback exception SHALL propagate and prevent fallback; a callback return SHALL NOT affect resolution. Events SHALL follow compiler attempt order and stop when the compiler succeeds. Ordinary ancestor probes and package typesVersions substitutions SHALL NOT produce compiler-options events.

The build SHALL verify the pinned upstream executable SHA-256, require every transformation section exactly once and verify a pinned output SHA-256. Its separate artifact SHALL carry a checked input/output manifest, upstream license and modification notice. It SHALL NOT mutate the installed compiler or perform transformation during extraction. This prerequisite SHALL remain unused by retained extraction and SHALL NOT establish runtimeTrust or complete resolution evidence.

#### Scenario: Escaping attempt precedes safe fallback

- **WHEN** a wildcard mapping first attempts an outside candidate followed by a valid inside candidate and the observer refuses the outside candidate
- **THEN** resolution throws before candidate file or directory IO and before fallback

#### Scenario: Extension fast path and compiler order

- **WHEN** an explicit extension substitution succeeds or an earlier missing substitution precedes success
- **THEN** observation precedes the fast file probe and preserves normalized candidate order without emitting later substitutions

#### Scenario: Shared typesVersions helper

- **WHEN** package typesVersions resolution uses the shared substitution implementation
- **THEN** the package resolves without a compiler-options event

#### Scenario: Compiler artifact integrity differs

- **WHEN** upstream bytes, transformation occurrence counts, output bytes or manifest identities differ
- **THEN** the derivative build or verification refuses the artifact
