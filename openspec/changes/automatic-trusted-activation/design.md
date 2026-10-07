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

The canonical request binds repository identity, head SHA, base SHA, policy/mapping identities,
toolkit digest and audit generation. An authenticated descriptor adds archive/manifest digests
and issuer identity. Store immutable requests and stage receipts outside the candidate.

Stages are observed → checking/reviewing → verified → published → admitted → merge-requested →
merged → merged-certified → host-ready. Failed and superseded are explicit dispositions.
Checks and review may run concurrently; publication depends on both. Each mutation compares
the stored stage/version and lease epoch. Effects have deterministic request-derived keys.
An old worker cannot publish under a replacement worker's lease.

Candidate evaluations may run concurrently. Serialize actual merges per protected branch;
head preconditions and protection enforce current base freshness. A merge queue, when enabled,
requires merge-group evaluation and invalidates evidence on changed composition. Do not assume
the GitHub merge API provides a base compare-and-swap merely because it accepts a head SHA.

### Review, checks and publication

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
