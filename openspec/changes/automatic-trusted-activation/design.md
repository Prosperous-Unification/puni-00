## Context

The user requires WBS 030.6 to unblock automatically, with no per-PR operator procedure.
This packet follows the combined brainstorming, grilling and domain-modeling interview.
The chosen technical shape is proposed for review; it is not an activation certificate.

Coordinator observations on 2026-10-07: the live WBS contains 193 entries, with only 030.6
blocked/held and dependency 030.2 DONE (project revision 12, entry revision 24).
The repository exposes three syntactically valid activation-variable names, but their values
have not been verified. Repository secret inventory is empty; the default workflow token is
read-only; an organization ruleset requires the trusted-wiki workflow. These observations do
not prove absence of organization/environment secrets, availability of administrative authority,
valid activation bytes or a usable external provider. See [verification](verify.md).

Current source: `trusted-wiki.yml` consumes one selected exact-SHA archive. The relocation
preparer imports operator attestation; `assertReviewBinds` checks identity joins rather than
authenticating external execution. The local invoker is explicitly `local-cooperative`.
Integration certification already requires an external receipt/journal verifier.
The [activation runbook](../../../docs/runbook-tool-wiki-activation.md) remains the operational
contract until implementation is installed.

## Goals / Non-Goals

**Goals:** automatic independent review, immutable activation, required-workflow admission,
protected merge, actual merged-SHA certification, host provisioning and recoverable operation.

**Non-Goals:** product changes, npm publication, synthetic review evidence, bypassing protection,
turning review findings into automatic approvals, or marking WBS complete from this packet.

## Decisions

[ADR 0037](../../../docs/adr/0037-activation-authority-is-independent-of-the-candidate.md)
records the authority and selection decision. Reuse Toolkit activation and Review attestation
from CONTEXT.md; an Activation controller coordinates their lifecycle.

### Ownership and deployment

Host the controller in an independently protected execution environment, preferably a dedicated
control repository running pinned GitHub Actions workflows. Actions can host the orchestration;
the current candidate repository alone does not provide the necessary authority. A timer
reconciles open ready PRs and protected-branch revisions; authenticated events shorten latency.
Do not depend on exactly-once webhook delivery or on a candidate-triggered workflow having a
privileged token. The controller deployment and its release pin are external bootstrap inputs.

Keep adapters in Twilight Burokrat for review invocation, external journal verification,
activation preparation/resolution and controller state transitions. Candidate execution uses
disposable workers. Reuse existing review protocol, role validation and receipt-authentication
contracts; do not fork a second schema or relabel local provider evidence.

| Principal               | Required capabilities                                                                                 | Forbidden capabilities                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Candidate author/worker | Propose commits; read frozen candidate; run checks in disposable isolation                            | Trusted journal mutation, publication/signing, protected-check or merge credentials |
| Audit provider          | Invoke independently selected reviewer; retain real observations in append-only authenticated journal | Merge or approve its own changed authority                                          |
| Controller verifier     | Read repository/PR state and authenticated records; validate pinned authority and exact bindings      | Trust candidate-supplied issuer, prompt, policy override or journal                 |
| Publisher               | Write immutable activation storage and authenticated descriptors; report controller check             | Execute candidate code with its credential                                          |
| Merge identity          | Read checks and merge current eligible PR under protection                                            | Administrative bypass or relaxed required workflow                                  |
| Bootstrap administrator | Install identities, trust pins, storage and required workflow configuration                           | Treat missing authority as successful bootstrap                                     |

Repository permissions are scoped to the adapter: repository metadata/contents and PR read for
observation; checks write only for controller reporting; contents write for GitHub release
storage if that storage is chosen; PR/contents write only where required by the merge API.
The deployment must verify the exact supported GitHub App permissions rather than infer them
from scopes. Administration and secret/variable writes belong only to bootstrap provisioning,
not the normal controller. Prefer short-lived installation/provider credentials, independently
stored and rotated. Never expose them in logs, candidate checkouts, shared caches or artifacts.

Trust-provider configuration includes issuer identity, allowed executor, protocol/prompt digest,
journal endpoint/verifier, retention contract and measured telemetry requirements. Independent
review means a separately authorized execution and evidence path; using another model alone
does not establish authority. Candidate instructions are reviewed content, not permission to
alter the review protocol. Missing observations refuse certification.

### Request and durable state

The canonical request binds immutable repository ID, a typed subject, qualified target ref,
head SHA, base SHA, policy/mapping identities, toolkit digest and audit generation. Distinct
PRs can share all commit and trust fields: SHA equality cannot identify the workflow subject.
The subject variants share the request's repository ID:

| Kind               | Subject fields                                                                                                    | Logical key for supersession                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| PR                 | PR number                                                                                                         | Repository ID and PR number                   |
| Merge group        | Verified qualified group identity/ref and ordered members, each binding its repository ID, PR number and head SHA | Repository ID and verified group identity/ref |
| Protected revision | Qualified protected ref                                                                                           | Repository ID and protected ref               |

The target ref is a canonical field, even when two target branches share a base SHA. PR
retargeting supersedes the request within the same logical PR; it does not create a different
PR or reuse another target's policy. The protected subject ref must match its target ref;
merge-group target and ordered membership must match authoritative provider state. Preserve
member order rather than sorting away composition. Refuse unavailable group identity or
membership; do not manufacture it from event labels. Validate all subject fields at ingress.

Include the full subject and target ref in canonical hashing and current-request comparison,
and bind that request identity through authenticated receipts, descriptors, admission and
merge effects. An authenticated descriptor also joins archive/manifest digests and issuer.
Equivalent archive bytes cannot transfer a different subject's approval or effect ownership.
Store immutable requests and stage receipts outside the candidate.

Keep authenticated source type/identity, delivery ID, workflow-run ID where present, observation
timestamp and payload digest in provenance records, outside canonical request identity.
Webhook redelivery and timer polling converge when the authoritative request tuple matches.
Deduplicate deliveries within their authenticated source namespace; an existing delivery ID
with a different payload digest is a conflict. A delivery identifier is not itself evidence
that the source is authentic. Neither timestamps nor arrival order establish current state.

Use one `evaluating` stage with independent check and audit obligations, rather than mutually
exclusive checking/reviewing stages. The transition graph is guarded by durable evidence:

| Transition                    | Required evidence and atomic local mutation                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| observed → evaluating         | Freeze all selected check/audit obligations and create their work records                                                                                 |
| evaluating → verified         | Every required obligation has an authenticated, complete, passing receipt for this request; store the selected receipt set and combined evidence identity |
| verified → published          | A durable publication reservation has an independently verified archive/descriptor acknowledgement; record its exact remote identity with the transition  |
| published → admitted          | Observe the required trusted workflow's success for this exact request and revision; a posted controller status is insufficient                           |
| admitted → merge-requested    | For a PR, verify current eligibility, acquire branch coordination and reserve the exact merge effect                                                      |
| merge-requested → merged      | Verify the provider's actual merge disposition and SHA; atomically record them and create/link the protected-revision certification request               |
| merged → merged-certified     | The linked actual-commit request has completed its own certification and admission                                                                        |
| merged-certified → host-ready | The host has acknowledged the linked revision's exact authenticated archive                                                                               |

Failed and superseded requests retain their evidence and effect history but cannot acquire new
authority-bearing work. They never reset to observed. Read-only remote reconciliation may record
facts about effects already initiated; it cannot revive approval or erase a completed remote
effect. Do not expose an unrestricted `advance(nextStage)`: each transition requires its
specific receipts/reservations and rejects missing proof, even if the caller holds a lease.

Each obligation stores its identity, kind, expected executor/command/protocol, attempt, state
and selected authenticated receipt. Checks and audit can complete in either order; cold and
informed audit phases retain protocol order. Retain every attempt's evidence immutably and
reject conflicting bytes for an existing receipt identity. A check cannot satisfy an audit
obligation or vice versa; a terminal failed/skipped required command cannot be erased by a
later success. Only explicitly classified transient failures use bounded retry policy.

External receipt authentication occurs outside a short database transaction. Inside the
transaction, revalidate immutable bindings, active subject generation, current authority pin,
lease epoch and obligation attempt/version; record the receipt and evaluate the completion
join atomically. Independent completions must not invalidate one another merely because
the other incremented the request version. Compare the current transactional request version
and the completion's own attempt, not an obsolete global version captured at dispatch.

### Paired review obligations and authenticated invocations

`reviewId` identifies one selected review within the canonical request. It is the stable
review selection already used by the integration evidence contract, not an execution ID.
Freeze it on exactly one cold and one informed audit obligation in the evaluation plan.
Their obligation identities remain distinct; the plan digest includes each `reviewId` and
phase. Reject duplicate phases, missing partners and ambiguous membership. A request may
contain several review pairs: another pair's completed cold phase cannot satisfy this pair.
Check obligations remain independent of review pairing.

`invocationId` identifies an actual review execution, using the existing review protocol's
name. Keep it in immutable attempt/registration evidence rather than the frozen plan.
The durable registration binds `(requestIdentity, reviewId, attempt)` to one invocation;
both phase obligations share this review attempt. Reserve that binding under current
authority before dispatch, then require the verifier's authenticated invocation to match it.
A receipt cannot allocate or replace the registration. Duplicate acknowledgement preserves
the same binding; conflicting invocation identity refuses. This is a local registration
contract, not a claim that provider execution occurred or that dispatch is exactly once.

An explicitly permitted transient retry reserves a new shared review attempt and invocation
while retaining the same selected `reviewId` and immutable prior evidence. Its informed phase
must use its own attempt's cold execution; it cannot borrow a cold result from an earlier
attempt. A terminal failed/skipped required review remains terminal under the existing retry
policy. Do not place invocation IDs in the immutable plan or advance the request audit
generation merely because transport or an execution attempt is retried.

The external verifier port consumes exact phase-specific submission bytes and a trusted
expectation snapshot. The snapshot binds request, review, obligation, attempt, phase,
registered invocation, issuer, executor and pinned protocol/prompt. Derive it from durable
selection/registration and independently pinned bootstrap. A caller-provided locator may
select a row; its labels cannot supply expected authority. Authenticate the exact submission
digest together with its invocation/journal bindings and existing `ReviewEvidence`,
`ColdHarnessOutput` and `InformedHarnessOutput`, or exact immutable references to those records.
Loose unauthenticated attachments do not complete an authenticated binding.

Reuse the existing protocol decoders and evidence checks for required reads, retained raw
responses, measured telemetry and finding disposition. Match both outputs and whole-review
evidence to the same registered invocation, subject and protocol. Require the informed
output's `coldArtifact` and the evidence expansion's `coldJudgmentArtifact` to equal the
hash of that invocation's exact cold judgment. The informed completion also joins the
already retained cold receipt for this request, review and attempt. A caller's phase label,
an unrelated passed cold row or a schema-valid journal record is insufficient.

One complete invocation can legitimately satisfy both of its phase obligations through two
distinct authenticated phase records. Project only the authenticated phase into the controller
receipt; reusing/relabeling one phase record for the other obligation refuses. Retain the
source evidence or authenticated immutable references, not only a flattened `passed` status.
`IntegrationEvidenceVerifier` supplies a binding pattern, not a replacement for phase
completeness. `FileInvocationJournal` and `validateReviewProvenance` remain explicitly
local-cooperative and cannot be relabeled as independently authenticated external provenance.

Read the expectation snapshot before the external verifier await without holding a SQLite
transaction. Inside the subsequent transaction, recheck current request/generation, authority,
lease, immutable plan/pair and this attempt/registration, then atomically retain phase evidence
and perform the selected-evidence join. An unrelated completion's request-version increment
does not invalidate the snapshot. A changed pair, attempt, invocation or authority does.

Introduce pairing and registration storage through an explicit versioned transition. Missing
legacy `reviewId` or registration is not permission to infer a pair from row order, phase,
executor, protocol or a singleton cold row. Preserve historical evidence; refuse affected
execution/admission until explicit trusted supersession/replanning establishes a new request
audit generation and freezes the new contract. No silent defaults or mutation of an old
frozen plan are allowed. In particular, v2/v3 stores may contain evaluating or verified audit
requests with no pair identity. A versioned schema migration must retain their original rows,
plan identities, phase evidence and attempts as historical unpaired state; historical reads
remain possible, but migration alone cannot make them eligible for execution or admission.
Do not add fabricated `reviewId`/`invocationId` defaults or overwrite their frozen-plan hashes.
New paired requests can coexist with that history. Schema migration failure rolls back its
structural changes and preserves the old schema version and rows. The earlier v2-to-v3 attempt
storage migration does not establish pairing and is not evidence of this new acceptance.

Implement the pair/registration contract and its refusal tests before the read-only verifier
adapter. The adapter can be exercised with a fake trusted port before isolated-worker dispatch
in task 2.2, but this establishes no installed external provenance. Real dispatch additionally
requires durable effect reservation and lease/attempt recovery from tasks 1.2/3.3. Concrete
provider transport, authentication and credentials remain one-time bootstrap choices; this
internal port does not choose a wire format, signing scheme or authority.

Maintain the active request pointer per logical subject. Superseding PR A never supersedes
PR B, a merge group or a protected-revision request sharing A's commits. Reconcile current
authoritative state before applying delayed events, including close/reopen and retargeting.
For an A → B → A tuple sequence, assign a new durable audit generation when A returns;
retain the old request as superseded and reject its worker's stage, publication and merge
effects. Retry attempts and delivery IDs do not themselves allocate a new audit generation.
The durable store serializes active-pointer/generation allocation and lease ownership. Retain
a per-subject generation high-water mark and closed-subject tombstone independently of the
active request pointer. Closing a PR cannot reset its generation when it reopens.

The bootstrap authority pin and request audit generation are different dimensions. Re-observe
the independently pinned authority, but compare candidate fields using the durable active
request's audit generation; do not rebuild current identity with bootstrap authorityGeneration
and thereby reject a legitimate later subject generation. Authority-pin changes invalidate
prior authority and create a newly fenced request through subject generation allocation.

Before an asynchronous source observation, read the subject version (or reserve an observation
epoch). Accept the response only while that version/epoch remains current. If another
reconciliation advances it, discard the stale observation and refetch authoritative state.
Do not keep SQLite transactions open across provider calls, and do not use event timestamps
as a substitute for this fence. A source change after observation is still checked at admission
and through provider-enforced head/base protection before merge.

An older persisted schema without subject/target binding cannot be accepted with defaults.
Either reject it or use an explicit versioned migration that verifies the missing fields
against authoritative state and creates newly fenced requests without inherited approval.
Do not silently reinterpret existing request hashes under the amended schema.

Candidate evaluations may run concurrently. During initial rollout, serialize controller-driven
branch advancement through actual merged-SHA certification and admission, not just the merge
API response. Head preconditions and protection enforce current base freshness. A merge queue,
when enabled, requires merge-group evaluation and invalidates evidence on changed composition.
Do not assume the GitHub merge API provides a base compare-and-swap merely because it accepts
a head SHA. External branch advancement can supersede an unfinished revision; retain an explicit
incomplete/superseded disposition rather than declaring it merged-certified.

### External effect reservations

Persist an outbox reservation before each publication, workflow/check dispatch or merge call.
It binds a deterministic request-derived effect key, exact subject/request, payload digest,
expected remote target, current ownership epoch and effect state. Acknowledgements bind the
observed provider identity and verified bytes/disposition. Reserve and acknowledge in short
local transactions; execute network calls between them. Concurrent recovery uses the same
effect key and first queries the existing remote effect.

After publication response loss, verify the occupied archive/descriptor before reuse. After
merge response loss, query actual PR disposition and commit before another merge action.
An acknowledgement with another request, payload, target or remote identity is refused.
Recording an acknowledgement and its request-stage transition is atomic. Recording actual
merge disposition and creating/linking its certification request is atomic and idempotent.

SQLite CAS does not provide exactly-once remote execution. The publisher must enforce fencing
at its own authority boundary before accepting a new dispatch. An effect authorized before
lease expiry may already be in flight or complete remotely: recovery retains that fact and
prevents a stale completion from granting current admission. Do not claim that a local lease
can revoke a GitHub request already sent. If an adapter cannot enforce required authorization,
idempotency or reconciliation, it is not ready for activation.

### Review, checks and publication

#### Inert selected-check launch preparation

Before any check worker can be admitted, the controller resolves the frozen
check manifest's `toolchainIdentity` and `sandboxProfileIdentity` through
independently controlled, immutable registries. Each registry returns versioned
canonical descriptor bytes whose SHA-256 equals the frozen identity. Missing,
unreadable, malformed, noncanonical, changed or ambiguous descriptor state
refuses preparation; candidate files and ambient host configuration are never
fallbacks. The runtime descriptor identifies the exact read-only toolchain
closure. The profile descriptor defines a finite, supported isolation policy:
private namespaces and network, dropped capabilities, closed nonstandard file
descriptors, an explicit logical mount allowlist, a sanitized fixed environment,
and positive bounded time, memory, process and output budgets. It contains no
credential, journal, publisher path or host-selected executable endpoint.

The resulting launch plan is inert data, not a dispatch token. It joins the
exact request/subject/head/base/generation, frozen obligation and attempt,
manifest bytes and both descriptors with an independently pinned candidate
snapshot identity. Main and optional skip-probe argv/cwd/env are copied only
from the manifest; both use the same profile. Preparation verifies every cwd
component remains inside the immutable candidate snapshot and is not a
symlink. It rechecks request, generation, selected plan/attempt, lease and
bootstrap authority after each asynchronous trusted resolution. No process is
spawned, no result is measured, and no receipt or admission authority is
created by this preparation step. A later acceptance fence must recheck these
bindings and the installed runtime/profile before launch; actual namespace,
cgroup and filesystem isolation remains unverified until that separate slice.

#### Anchored execution-tree staging before worker admission

The snapshot identity commits to a versioned canonical complete-tree manifest
selected by trusted authority for the exact request and head. The runtime
descriptor's executable-tree identity similarly commits to a complete trusted
toolchain manifest. Each inventory names every directory and regular file by
relative component path, expected mode and file-content SHA-256; no candidate
file supplies or amends it. A source root is only a trusted locator, never
proof of the selected bytes. Missing, unreadable, malformed, noncanonical or
identity-mismatched manifests refuse staging. A prior descriptor without a
complete inventory cannot be promoted by guessing entries.

The candidate manifest is canonical UTF-8
`{schemaVersion:1,kind:'candidate-snapshot',requestIdentity,headSha,entries}`;
the runtime manifest is canonical UTF-8
`{schemaVersion:1,kind:'executable-tree',entries}`. Each identity is SHA-256 of
its exact canonical bytes. An entry is a directory with mode `0755`, or a
regular file with mode `0644` or `0755`, safe-integer size and lowercase
SHA-256. Root is implicit. All other directories, including empty ones, are
explicit and every parent is present. Entries are unique and sorted by UTF-8
byte order. Relative POSIX components reject empty, `.`, `..`, slash within a
component, backslash, NUL and normalization aliases. Source roots remain
external trusted locators. The pinned profile declares positive safe-integer
limits for manifest bytes, entry count, depth, path bytes, file bytes and total
bytes; Linux components also stay within 255 bytes and paths within 4096.

The supervisor traverses each root and child one validated basename at a time
under retained directory descriptors with no-follow opens. It checks file type,
mode and content hash from opened descriptors, enumerates directories to refuse
unexpected entries, and keeps the opened sources until their verified bytes and
modes have been materialized into a fresh private supervisor-owned staging
tree. It never reopens an original pathname after validation. The same
procedure stages the toolchain closure. A rename, symlink substitution,
modified leaf, wrong full-tree hash or closed/reused descriptor must result in
the exact verified bytes or refusal, with every descriptor closed on refusal.
The staging module exclusively owns source descriptors: diagnostic callbacks
receive paths and a callback-scoped, one-shot file-close control, never a raw
descriptor number. Closing through that control invalidates ownership before
the syscall; cleanup skips the released entry and still closes the rest. A
dev/inode match is not treated as proof that a reused number is the same open
file description.
Only the immutable staged trees may become later worker mount inputs; this
step remains inert and launches no worker. Filesystem races after enumeration
cannot add bytes to the staged tree, but installed launcher containment and
host namespace/cgroup capability still require separate acceptance.

1. Freeze and verify the request against GitHub's current repository/PR state.
2. Resolve independently pinned toolkit, prior authority and selected policy. A change to policy,
   launcher, workflow, harness or trust configuration is reviewed under the preceding authority.
   The candidate cannot downgrade its own review obligations.
3. Run required commands in disposable isolation and retain measured receipts. Evaluate cold
   and informed review phases with real observations; retain raw responses and phase ordering.
   Authenticate receipt, invocation, obligation, journal, executor and candidate joins through
   the external verifier. Incomplete phases, unresolved findings and required skips fail.
4. Run the trusted preparer against frozen candidate bytes outside the candidate's writable
   authority boundary. Validate role manifests and pinned runtime closure; execute the prepared
   production launcher and require certified admission.
5. Publish immutable bytes and an authenticated descriptor. The production resolver accepts
   only the external trust source configured by bootstrap, checks issuer/provenance and hashes
   before extraction/execution, and enforces existing path-containment rules. A candidate URL
   or digest is not a trust anchor.
6. The required trusted-wiki workflow independently resolves and verifies the exact request.
   Preserve the organization-required workflow identity/path; an App status is supplementary
   unless the organization rule is deliberately migrated and verified. Workflow success comes
   from authenticated admission, not a controller comment or unbound status name.

Signing a controller-authenticated descriptor is one transport mechanism; another is an
authenticated immutable store with equivalent issuer and integrity guarantees. Select and test
one adapter at bootstrap. Plain SHA-256 with an attacker-selected URL is insufficient.
An occupied key with different bytes is corruption/conflict, not permission to overwrite.

### Merge and downstream admission

Only PR subjects take the ordinary merge-requested route. A merge-group request reaches admitted
and awaits the provider's queue outcome; it must not independently invoke ordinary PR merging.
Reconcile the resulting actual commit(s) and link their protected-revision requests.
A protected-revision request follows observed → evaluating → verified → published → admitted →
host-ready, without merge-requested or merged. Its exact certification/host evidence supplies
the linked PR's merged-certified/host-ready transitions. A normal PR evaluation never recursively
creates another PR merge from its protected-revision child.

Enable automatic merge only after all required checks and current head/base conditions pass.
Keep the existing merge method during initial rollout. If GitHub produces another SHA, create a
new request for that actual commit and certify it before host/deployment admission.
This is an explicit protected interval: the merge may be complete while downstream admission
is pending. Main's previous activation cannot certify the new revision.

A merge-group check proves its own composition, not an assumed final commit identity.
The existing `emitIntegrationBinding` validates a sole-parent commit and publication marker;
do not feed ordinary two-parent GitHub merges through it or remove its parent check.
Toolkit activation for the merged SHA uses its existing exact-commit contract. Broader support
for GitHub merge topology in final integration bindings requires a separate specified change.

Host provisioning fetches the exact authenticated CI archive, verifies it and installs it
atomically in a versioned external directory. Retention roots include active requests,
admissions, retained journal evidence and host references; configured retention expiry cannot
silently delete material still needed to verify a live admission.

### Failure and recovery

Retry only classified transient transport/provider failures with configured attempt and
elapsed-time bounds. Reconcile missing events and incomplete stages automatically.
After a lost publication response, authenticate and compare existing bytes before continuing.
After a lost merge response, query the PR and actual merge commit before issuing another action.
Corrupt durable state, unavailable verifiers, expired evidence and changed identities fail
visibly; never catch them as successful defaults.

A review finding produces actionable feedback for the author/repair agent. A changed commit
triggers fresh applicable evidence. Repair automation must not rewrite review conclusions.
Terminal infrastructure failures identify the exact missing capability; emergency repair is an
exception, not a per-PR approval stage. This change introduces no break-glass bypass.

## Risks / Trade-offs

The external audit provider and publisher are high-value authority; their isolation and
credential rotation are required deployment properties. Automated review is a scoped judgment,
not proof of correctness. Provider outages and mandatory actual-merge recertification add
latency. Durable reconciliation and bounded retries address availability without weakening
admission. Artifact retention and model usage require an explicitly configured budget.

The current package-release prerequisites (license, package ownership, registry credential,
tag rules and protected release environment) remain separate: archive-launcher is sufficient
for this change. No additional live WBS blocker was observed by the coordinator.

## Migration Plan

1. Verify bootstrap access and provider capability read-only; configure exact external identities,
   trust pins, journal/storage and resource/retention/retry budgets through authorized provisioning.
   Absence blocks activation, not local implementation or this design packet.
2. Install the independently pinned controller and exercise isolated negative paths. Use the
   existing archive route as a serialized bridge for the first candidate. Publish its archive
   automatically and write/verify all three legacy variables before running the old workflow.
   Legacy variables are not an atomic set: serialize updates and admission, tolerate partial
   configuration only as a failing intermediate state, and verify the complete tuple before use.
3. Admit the controller/resolver change under the existing authority. Deploy the trusted
   workflow update without removing the organization-required workflow. Freeze admissions
   during incompatible trust/configuration transitions; do not assume candidate YAML changes
   control an externally pinned organization workflow.
4. Prove candidate-addressed resolution on concurrent PRs; then retire normal per-PR legacy
   variable updates. Retain known-good artifacts for rollback, but never reuse an old
   certificate for a new head. Rollback changes the implementation pin and recertifies candidates.
5. Observe unattended PR admission/merge, actual merged-SHA certification and host consumption.
   Reconcile runbook, historical operator task ledgers and live WBS evidence only then.

## Open Questions

Bootstrap must supply a concrete independently controlled reviewer/journal provider, control
repository or equivalent runtime, immutable store/issuer and installation permissions.
Available access to provision these has not been established by this packet. The user has
authorized resolving the blocker without per-PR operator steps; this is not evidence that
external credentials exist. Deployment acceptance must record the chosen provider, exact
permissions and authentic invocation proof before any real activation.
