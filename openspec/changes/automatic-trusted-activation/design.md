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
control repository with a pinned controller release and a durable service/store. Protected
Actions jobs can invoke that service and supply ephemeral workers; their disposable workspace
cannot be the only copy of controller state, journal or recovery reservations. The current
candidate repository alone does not provide the necessary authority. A timer
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

### Bounded ordinary-PR observation increment

At implementation baseline `1520d3b58c34149d0c35b4ac021cc3c2a4f368b9`, the durable
controller already exposes `readyCandidates`, `currentCandidate` and `reconcileReady`.
This increment mounts a read-only GitHub provider into those ports. Its outcome is automatic
candidate discovery and durable supersession on a reconciliation tick, not an activation,
a deployed scheduler, authenticated check/review evidence or WBS completion.

The adapter receives trusted repository identity, supported target/fork policy and immutable
policy/mapping/toolkit identities from bootstrap. Candidate-controlled files, API URLs or
labels cannot choose authority. A narrow transport boundary returns untrusted provider
responses; the adapter validates the fields it consumes before constructing internal types.
Network/authentication/rate-limit failures remain explicit failures, never empty lists or
closure. Provider schema additions may be ignored only outside the consumed contract;
missing or malformed required fields cannot be defaulted.

| Port                                      | Meaning and refusal boundary                                                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readyCandidates()`                       | Bounded, fully validated discovery of eligible ordinary PR subjects in the configured repository; discovery is a hint, not an atomic provider snapshot                           |
| `currentCandidate(repositoryId, subject)` | Direct authoritative read for the exact ordinary PR, yielding a validated current tuple or confirmed current ineligibility; unsupported subject kinds and ambiguous reads refuse |
| `reconcileReady()`                        | Union discovered subjects with durable active subjects, refetch each through the current port, then commit under the existing subject observation-version fence                  |

The existing current-port `closed` variant means no currently eligible candidate for the
subject. For this adapter it may represent a confirmed closed/merged PR or an open draft;
it is not a fabricated GitHub merge outcome. Reopening or becoming ready allocates a new
generation using retained high-water history. Unsupported subject kinds, an absent/masked
PR response, revoked access and unavailable state must throw rather than produce `closed`.

Bind the configured immutable base repository ID, requested PR number, open/non-draft state,
qualified target ref and exact head/base SHAs. Validate source repository identity according
to the explicit fork policy: a legitimate fork's head repository differs from its base and
must not be confused with a foreign base repository. Never infer an allowed source from an
arbitrary clone/download URL. Trusted snapshot acquisition remains a later adapter.

Pagination has finite page/entry/time bounds, validated origin and monotonic continuation.
The bounded source port requires a trusted 1–60,000 ms read deadline; the adapter
arms its timer before invoking a reader, passes an abort signal, and rejects even if
the reader ignores it. It rechecks monotonic expiry after final response validation
before returning a list or current observation, including synchronous reader work.
Refuse repeated/conflicting pages, malformed links and incomplete traversal; never send a
credential to an arbitrary continuation URL. Complete validation before returning discovery
so a truncated page set cannot masquerade as an empty successful inventory. A successful
listing still does not prove closure: directly read every durable active subject. A later
provider failure may leave earlier subjects reconciled; do not claim a whole-poll transaction
or roll back already valid observations. Retry through another bounded reconciliation tick.

Provider reads occur outside SQLite transactions. Revalidate subject-version ownership after
the await and refetch on conflict using the existing finite retry bound. Returning A after
A → B → A must create a fresh generation and never restore an obsolete lease. Provider state
can change after any read: this increment does not authorize effects, and later dispatch,
admission and merge adapters must revalidate their exact current tuple again.

Tests mount the real adapter and durable controller with a synthetic read-only transport.
They prove the timer-call boundary, loss/duplication recovery and refusal semantics, not
GitHub authentication, a running timer or real external-review provenance. Webhook signature
verification, merge-group/protected-revision discovery, credential provisioning, worker
execution, publication, admission, merge and deployment remain outside this increment.

The next GET-only transport increment implements the existing reader port against the
fixed `https://api.github.com` origin. It accepts an optional credential only from trusted
runtime configuration; public repository reads can omit it. Requests carry a fixed API
version and JSON accept header, disable redirects and caches, and pass the source abort
signal through headers and streamed body consumption. A bounded body is parsed as JSON
only after the byte cap succeeds. List responses must be arrays; the reader validates
every Link URL against the fixed origin, exact repository pulls path, expected query keys
and monotonic page, then constructs the next request locally. It never follows a Link URL.
Only HTTP 200 is a successful read; 304, 3xx, 401, 403, 404, 422, 429 and 5xx are
explicit refusals, with rate limits distinguished as retryable, never empty discovery or
confirmed closure. Existing source validation owns the consumed PR fields and repository
joins. This increment has fake-HTTP tests but no live credential, scheduled process,
webhook verification, write endpoint or external-review authority.

### Observation-only tick and uninstalled service increment

Baseline `e13eee341ed29ac43d6846a009bf5cab616017c1` supplies the GET reader and durable
observation owner. Add one finite `runObservationTick` composition and uninstalled systemd
oneshot/timer templates after task 1.2d. A tick only discovers and reconciles ordinary PRs.
It does not select evaluation work, acquire evaluation leases, execute candidate commands,
authenticate reviews, publish archives, report admission, merge or update WBS. Keep these
capabilities absent from its composition rather than accepting a caller-selected mode.

The local entrypoint consumes independently pinned bootstrap bytes, a validated repository
binding, an explicit persistent state path and a trusted scheduling policy. The policy binds
whole-tick and cleanup deadlines, workload limits, transient attempt budget, retry delays and
slow recovery-probe interval. Validate finite positive bounded values and their ordering;
never infer configuration from candidate files, the current directory or ambient credentials.
The local observation increment requires `maxSubjects` in the protected, hashed policy:
an integer from 1 through 10,000. Discovery hints and durable active subjects form one
union before any authoritative current read; exceeding the limit refuses the entire tick
without reporting complete or truncating that union. Existing protected state with a
different policy identity requires explicit authority to migrate, never a default.
Use a monotonic clock for live deadlines and validated absolute time for persisted cooldowns.
Retain the existing source's per-read bounds under the shorter remaining tick deadline.
No SQLite transaction spans an HTTP wait, process-lock wait or cleanup await.

| Tick outcome | Required meaning                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `reconciled` | Discovery and every subject selected for this bounded tick completed; atomically record successful scheduler completion |
| `busy`       | Another process owns the single-flight lock; no provider reads or state mutation occurred                               |
| `deferred`   | Valid persisted cooldown prevents another attempt; no provider reads or success record occurred                         |
| `cancelled`  | Controlled shutdown fenced unfinished observations and completed local teardown; prior valid subject commits remain     |

Required-work failures throw with redacted typed diagnostics and a nonzero command exit.
Busy/deferred may exit successfully only with their explicit outcome, never a successful
reconciliation or activation claim. A tick may commit earlier subjects before a later refusal;
record incomplete completion and preserve those valid observations. Enforce finite whole-tick
and subject-count limits. Capacity exhaustion is visible failure, not successful truncation;
resumable scheduling for repositories exceeding this bounded increment remains separate work.

#### Process ownership and state initialization

Use one nonblocking host-local OS process lock for the configured state store. Every production
invocation, including explicit initialization, goes through the same lock owner. Contention
returns `busy` before HTTP or database mutation. Keep the stable lock inode in the protected
state directory; never unlink it, replace it or rely only on a PID file. Hold ownership through
all tick continuations, scheduler completion, database closure and resource cleanup. Release
only owned resources, aggregate cleanup failures without losing the original error, and do
not hand numeric lock descriptors to callbacks. Process termination releases ownership.
The systemd unit adds scheduling serialization but is not the only lock guard. Do not reuse
request evaluation leases for observation scheduling. Multiple hosts/shared-network-filesystem
locks and distributed lease takeover are outside this single-host contract.

Normal ticks require an initialized persistent database and scheduler record; absent,
unreadable, corrupt, partial, wrong-repository or unsupported-schema state refuses before
provider calls. An explicit initialization operation validates the external bootstrap first,
creates new state atomically and records its repository/configuration binding. It cannot erase
existing state, silently repair a partial store or guess missing authority. Scheduled execution
must not use the controller's current create-if-missing constructor path to recreate lost state.
Version scheduler storage additively in the existing SQLite state owner; preserve activation
requests, subject high-water history and observations across migration/reopen/rollback. If new
migration.sql files are introduced, ship their matching down.sql files.

#### Cancellation and settle-before-close

Compose caller shutdown, SIGTERM/SIGINT and the whole-tick deadline into one cancellation
boundary and propagate it through discovery, current reads, body consumption and retry waits.
Check cancellation before another read/refetch and inside the observation transaction before
any subject/request write. Also recheck monotonic expiry before that commit: an event-loop
timer alone cannot catch synchronous work that consumed the budget. A held old response must
not mutate observation state after cancellation, even if the transport ignores its signal.
Previously committed observations remain; cancellation does not roll back the entire poll.

After cancellation, await the controller-facing tick continuation and its resource cleanup
before closing SQLite or releasing the lock. A timeout race must not leave a continuation
able to access the closed database. Transport promises isolated from controller state may
finish late only to release their own response resources, with observed rejection handling.
A cleanup deadline bounds graceful shutdown; if local work cannot settle, the supervised
process fails and is terminated while retaining the process lock until exit. Never unlock and
start another tick while an old owner can still write. Scheduler bookkeeping may record the
cancelled/failed attempt after the observation fence; it must not advance candidate authority.

#### Durable attempts, cooldown and GitHub timing

The local retry policy explicitly binds `initialDelayMs`, `maxDelayMs`,
`fallbackDelayMs`, `recoveryProbeMs` and `horizonMs` alongside the attempt,
subject and tick budgets. All are finite positive bounded integers;
`initialDelayMs <= maxDelayMs <= recoveryProbeMs <= horizonMs`, while
`fallbackDelayMs <= horizonMs`. The fallback applies only when an eligible
transient response supplies no valid provider timing. A later valid provider
minimum remains authoritative even beyond `horizonMs`; the next tick visibly
defers rather than clipping it. These bytes join the protected configuration
identity and have no default for established state.

Version 10 adds a separately bound recovery singleton plus immutable attempt
reservations and one terminal fact per sequence. Keep the v9 scheduler's
sequence as the high-water authority and its burst counter as the current
burst, but remove the old sequence-equals-burst constraint in v10 because
successful bursts reset and recovery probes advance only sequence. The
v9-to-v10 migration preserves legacy sequence/burst/start values as an
unclassified watermark without inventing historical attempt outcomes. An
active v10 reservation left by a crash is sealed `interrupted` on reopen;
it consumes its budget and cannot erase an already recorded provider minimum.
The lock owner holds every reservation and terminal write, with short SQLite
transactions around no network await.
The terminal journal COMMIT is the irreversible observation-completion point:
recheck caller cancellation and monotonic tick expiry immediately before it,
rolling back a proposed complete fact and recording cancellation if the bound
was crossed. Close the reservation connection before provider work and settle
the controller before this terminal write. A signal or terminal-connection
cleanup delay **after** the complete COMMIT cannot relabel the durable attempt
as cancelled. A post-commit close failure reports a separate nonzero cleanup
failure while retaining the complete fact; cleanup beyond the absolute grace
budget terminates under the held process lock. Neither outcome grants candidate
evaluation or external activation authority.

Reserve a scheduler attempt durably before the first provider read. Bind its identifier and
configuration identity, start time and finite budget. Reopening after a crash retains the
consumed attempt and accounts for unfinished work; it cannot reset counters or pretend the
attempt succeeded. Each invocation makes at most one reconciliation attempt and holds no lock
while sleeping between scheduled attempts.

Extend the typed GitHub read failure to retain validated retry timing without raw response
headers, bodies or credentials. Parse supported `Retry-After` timing and relevant rate-limit
reset epoch with explicit numeric/date, overflow and clock checks. When multiple applicable
bounds exist, respect the latest provider minimum and the local delay. An absent optional
header uses an explicitly configured conservative fallback; a present malformed header refuses
as invalid-response. A valid provider minimum beyond the automatic scheduling horizon must
produce a visible deferred/exhausted condition, never be shortened to the local backoff cap.
Provider timing cannot change repository, authority, attempt limit or command identity.

Persist bounded exponential cooldown for modeled transient unavailable/rate-limited failures.
Inaccessible, invalid-response and trusted-state failures do not enter a rapid retry loop.
On transient-budget exhaustion, persist failed health and throw. A configured slower recovery
probe may run on later timer ticks, at most once per persisted probe interval, while retaining
failed health/history until a complete successful tick. Such probes are not hidden resets of
the exhausted burst. Cancellation does not become a provider error. Reboot, process restart,
clock rollback and repeated timer delivery cannot shorten persisted provider cooldowns or
refresh the attempt budget. Any unresolvable clock inconsistency refuses scheduling visibly.

#### Service artifacts and bootstrap limits

Keep proposed runtime files under the activation-controller module: `observation-tick.ts`,
its mounted database/process tests and `observation-cli.ts`; extend `github-reader.ts` only
for typed retry timing and source/controller interfaces only for explicit cancellation/fencing.
Place uninstalled service/timer templates with a short provisioning runbook under
`infra/ci/burokrat/observation/`. Reference that runbook from the activation runbook when the
artifacts are implemented. No template contains real credentials or invented bootstrap pins.

The oneshot template uses a dedicated non-sudo service account, a protected pinned executable
outside candidate checkouts, read-only trusted configuration and an explicitly writable private
state directory. Require restrictive creation modes, no privilege escalation, empty capability
sets, protected system/home paths and private temporary storage. Permit only the networking
needed for fixed-origin HTTPS/DNS; this observer's confinement is not a candidate worker sandbox.
Do not add unverified options incompatible with the pinned Bun runtime. State/config/lock paths
must not alias candidate paths or be replaceable by candidate users.

Set a finite startup timeout greater than the tick plus cleanup budgets, a finite stop timeout
covering graceful cleanup, whole-service-group termination and no automatic restart storm.
Use one named oneshot service and a persistent calendar timer; application cooldowns govern
whether a tick may read GitHub. Do not rely on timer coalescing for cross-process exclusion.
Render explicit account/path/timing values during one-time administration. Template parsing
and negative configuration checks prove the artifact contract only; installed systemd behavior
requires separate host acceptance.

The executable observation launcher consumes one canonical protected service JSON path, pins
the trusted bootstrap before any GET and opens an optional explicit read credential file; it
does not discover a token from ambient environment, `.env`, Bun preloads or candidate files.
The service entrypoint calls only the existing one-tick CLI and never initializes or migrates
SQLite. A typed administrator renderer emits units and an exact SHA-256 list for Bun, the
launcher, Bun configuration, service configuration and bootstrap into a new private staging
directory. Rendering binds a non-root account, canonical runtime/trust/state paths and finite
startup/stop budgets. The unit clears the environment, disables Bun env-file loading, checks
those pins before execution, writes only the private state path and propagates the launcher exit.
The renderer does not install or enable a unit; the actual service-account and systemd behavior
remain host acceptance work.

Local implementation can exercise process locking, SQLite recovery, cancellation and cooldown
with synthetic transport and test-only bootstrap fixtures. It cannot establish independent
bootstrap authority from those fixtures. Protected account/directory creation, real bootstrap
pins, optional read credential installation, unit installation/enablement and live host restart
acceptance remain one-time authorized provisioning. Publisher, reviewer and merge secrets are
not accessible to this service. No host configuration, unit deployment, activation or WBS
completion is authorized by this artifact increment; 030.6 remains blocked.

### Unattended implementation sequence and provisioning boundary

Continue in ordered, independently reviewable slices after ordinary-PR observation:

1. Install the protected controller runtime with durable database, bounded timer reconciliation
   and later authenticated webhook ingestion. Reserve effects before dispatch; retain immutable
   acknowledgements, query after ambiguous delivery and fence stale owners. Do not claim
   exactly-once remote effects or rely on an ephemeral Actions workspace for recovery.
2. Install real isolated check execution and the independent cold/informed audit provider.
   Reuse the frozen obligation/attempt/invocation contracts and authenticated journal verifier.
   Checks and review join only after every selected required receipt passes; fake acceptance,
   a successful process exit and locally authored review bytes are not authenticated evidence.
3. Prepare and self-certify the exact activation through the production launcher, publish its
   immutable archive and authenticated descriptor, then automatically request/observe the
   existing required trusted workflow for the exact subject/head/base. A variable update alone
   does not rerun a workflow; the adapter must prove the supported trigger and exact run joins.
   Preserve the base-owned read-only validator and organization requirement.
4. Use a serialized compatibility transition for the three existing activation variables,
   verifying all values and refusing partial writes. Candidate-addressed descriptors replace
   the global pointer before parallel PR publication is enabled. A controller status cannot
   substitute for required-workflow admission.
5. Merge under existing protection with fresh subject/head/base checks, then certify the actual
   merged SHA as its own protected-revision request. Serialize the branch until certification;
   install that same authenticated archive on h2puni atomically and require its exact acknowledgement.
   Preserve the separate sole-parent integration-binding guard.

Repository work can implement all ports, contracts, local recovery proofs, provisioning
artifacts and runbooks without enabling credentials. Live acceptance needs these one-time
administrative capabilities; they are not recurring PR tasks:

| Capability                     | One-time prerequisite and installed proof                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protected controller           | Independently controlled release pin/runtime, durable database and backup/restore; timer restart/recovery acceptance                                                  |
| GitHub observation and effects | Installed dedicated identities with verified minimum read/publisher/merge permissions; keep administration and bootstrap configuration separate from normal dispatch  |
| Audit and evidence             | External executor/issuer, authenticated retained journal, pinned verifier and immutable archive storage; real exact-invocation negative and positive acceptance       |
| Ephemeral CI worker            | Dedicated non-sudo worker identity, delegated cgroup-v2 subtree with cpu/memory/pids limit write/readback, exact loaded AppArmor policy and pinned executable/runtime |
| h2puni                         | Separately administered worker/service account, corresponding cgroup/profile setup, protected archive trust pins and atomic installation/retention service            |
| Trusted workflow cutover       | Authorized protected bootstrap transition and proof of required-workflow failure/pass at exact candidate identities, without bypass                                   |

Worker provisioning must precede candidate execution. Required uncached `test:worker` must
prove the exact runtime profile: namespaces, private mounts, network refusal, fixed environment,
FD/credential/socket exclusion, resource enforcement, deadlines and descendant cleanup.
The readiness classifier and inert staging at the baseline do not provide those proofs.
A constrained local environment reports unavailable capability and fails the required target;
it cannot turn unrun isolation into a passing skip. CI success does not certify h2puni.
Provisioning code must come from protected pinned source, never candidate scripts executed
with root or publication authority. Neither repository edits nor this plan install any of
these capabilities. Until installed end-to-end evidence exists, 030.6 remains blocked.

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

### Selected external review provider and attested journal

Task 2.1 selects GitHub Actions custom artifact attestations as the external journal
envelope. Anthropic Messages API is the recommended review execution backend, subject to
administrator-supplied model access and immutable execution pins. A separately administered
control repository runs the trusted review program. Candidate authors cannot change that
program, its signing authority, journal retention, model credentials or bootstrap pins.
The observation service remains read-only; this selection does not install an evaluator,
dispatch a review, close parent tasks 1.1/1.2, complete 2.1 or unblock WBS 030.6.

#### Protected provider descriptor

Introduce a strict, versioned provider descriptor whose canonical digest is bound by an
explicitly versioned bootstrap transition. Existing bootstrap v1 has no transport authority;
retain its historical records, but refuse real provider dispatch/verification until trusted
configuration supplies the new descriptor and its independently installed bootstrap pin.
Do not infer missing fields from names, current repository settings, environment credentials,
a singleton workflow, provider responses or local-cooperative journals. Authority changes
produce a new pin/generation under the existing supersession rules.

The external administrator must supply and verify all of the following before installation:

- Control organization/owner and repository immutable IDs, repository locator, numeric
  workflow ID, qualified workflow path, protected dispatch branch/tag, exact workflow source
  commit and GitHub signer digest (the 40-hex `job_workflow_sha` commit, not a SHA-256
  workflow-file digest), and pinned SHA-256 review-program/action/runtime identities.
- GitHub API origin/version, issuer `https://token.actions.githubusercontent.com`, signer
  identity, trusted Sigstore root/verifier identities, accepted runner policy, custom predicate
  type/version, signed application receipt audience and signing OIDC audience.
- Journal issuer/provider/executor IDs, authenticated registration service origin and identity,
  exact retrieval origins/redirect policy, immutable journal retention policy and access policy.
- Approved Anthropic origin/API version, exact model identifier, protocol/prompt/tool-policy
  digests, model entitlement and credential reference. No model alias or sample configuration
  silently supplies a production pin; mutable model identity cannot satisfy an immutable pin.
- Verified GitHub artifact-attestation plan entitlement and control-repository visibility.
  Private/internal repository attestations require GitHub Enterprise Cloud; public-repository
  availability does not authorize exposing private candidate evidence. Missing entitlement
  leaves 2.1 blocked pending explicit selection/design of an HTTPS broker, with no fallback.

OIDC signing audience and application receipt audience are different controls. Verify the
former in the protected credential-issuance setup; require the latter in the signed custom
predicate. Do not claim the original token audience is verified from a certificate that
does not carry it. Workflow IDs and repository IDs must be joined through authenticated
provider metadata where the signing certificate does not expose them. Missing authenticated
joins refuse. Reusable-workflow claims are required only for a descriptor selecting that
route; ordinary workflow certificates cannot be assigned claims they do not contain.

#### Endpoint and execution contract

The selected GitHub adapter uses `https://api.github.com` with an explicitly pinned API
version. Dispatch calls `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`
with the configured protected branch/tag `ref` and exact reserved effect/payload locator and
digest. A raw commit SHA is not assumed to be a supported dispatch ref. Verify the resolved
workflow/source digest before protected acceptance and signing; changing the ref cannot
authorize a new program. Decode the selected API version's response strictly: the documented
2026-03-10 response includes `workflow_run_id`, `run_url` and `html_url`. A dispatch response
proves transport acknowledgement only, never invocation acceptance or completed review.
The dispatch identity has Actions write only on the control repository; it has no candidate
publication/merge authority. The protected signing job alone receives the selected pinned
attestation action's required OIDC/attestation permissions. Candidate code never runs with
either identity. [Dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)
and [custom attestation action](https://github.com/actions/attest) define the transport.

The trusted executor calls `POST https://api.anthropic.com/v1/messages` with the configured
API version, approved exact model and protocol-derived requests. A separately provisioned
credential is supplied only to this executor, never candidate input, logs, receipts or the
observation service. API response/request IDs are execution metadata, not review authority.
The harness must observe required reads through bounded read-only tools, retain raw responses
and actual usage/timing, and enforce cold acknowledgement before informed context. It must
not execute candidate scripts, arbitrary model-selected shell commands or the existing ACP
prototype's permissive tool policy with credentials. Persist cold evidence before advancing;
an interrupted/uncertain model call cannot be relabeled as an observed successful invocation.
Retry only classified transient work under the frozen bounded attempt policy; transport
ambiguity does not allocate a new invocation or overwrite prior evidence.
[Messages API](https://platform.claude.com/docs/en/api/overview) supplies model execution,
not an authenticated implementation of this repository's review protocol.

#### Attestation mapping into the existing receipt owner

The attested subject is the digest of a canonical immutable journal manifest. Exact submission
bytes are the canonical unsigned phase payload, excluding its enclosing attestation/manifest
locator to avoid circular digests; obtain that locator through the authenticated registration.
The manifest binds these phase bytes, frozen request/payload bytes and all referenced evidence
artifacts by digest. A versioned custom predicate joins `effectKey`, payload/request identity,
review/obligation/shared attempt/phase/invocation, executor, protocol/prompt/model/program,
provider descriptor, issuer/audience and journal ID. Bind control repository/workflow source
identity and run ID/attempt as execution metadata; they do not replace canonical candidate
identity or the registered invocation. The signer may attest only bytes emitted by the
authorized harness, not arbitrary candidate-supplied passed files.

For the selected organization-owned route, look up bundles through
`GET /orgs/{org}/attestations/{subject_digest}` and join returned repository IDs to the pin.
Retain the exact bundle and subject bytes. Fetch referenced artifacts only through pinned
origins with bounded bytes/time/pagination/redirects; never forward credentials to an
unapproved redirect origin. A bundle URL or Actions artifact name is not authority.
Verify signature/chain/trusted root, issuer, signer workflow/digest and predicate type using
a pinned verifier, then strictly validate the custom predicate and all manifest digest joins.
A successful verifier exit without semantic binding is insufficient. The selected verifier
may use `gh attestation verify` with protected arguments and structured output; no receipt
supplies CLI switches or trust roots. [Attestation lookup](https://docs.github.com/en/rest/orgs/attestations)
and [verification controls](https://cli.github.com/manual/gh_attestation_verify) govern this boundary.

##### Journal Resource Protocol v1: retrieval before authentication

The separately administered journal producer in 2.1d must implement a fixed HTTPS resource
protocol. Its configured base `bootstrap.journal.endpoint` is an exact allowlisted origin and
canonical path prefix, with no userinfo, query, fragment, dot segment or encoded separator.
For one registered lowercase SHA-256 manifest identity, retrieve only
`GET {base}/v1/manifests/sha256/{digest}`. A successful response is canonical UTF-8
`application/json`, at most 64 KiB, and hashes to that digest. The manifest's artifact
identities alone select `GET {base}/v1/artifacts/sha256/{digest}`; each response is exact
`application/octet-stream` and hashes to its digest. Reject duplicate `(kind, identity)`
entries. Journal IDs, filenames, caller suffixes and provider URL fields never supply route
segments. These routes have no listing or pagination behavior. The producer publishes all
referenced resources durably before exposing the manifest and retains them for the pinned
policy period; an incomplete publication is never a readable successful manifest.

Discover attestation candidates with the fixed configured-version GitHub request
`GET https://api.github.com/orgs/{owner}/attestations/sha256%3A{manifestDigest}` with
`per_page=20` and the encoded pinned `predicate_type`. Parse each returned attestation's
positive safe-integer `repository_id` and `bundle_url`; optional `initiator` is informational.
Keep only the pinned repository ID. A metadata URL is a hint, not authority. Follow at most
one `rel=next` per response only after validating exact API origin, subject path, filters,
`per_page` and one documented cursor; reject repeated, changed or ambiguous cursors, loops,
or a continuation beyond five pages. A truncated scan returns no candidate set. Retain at
most 16 matching candidates and never choose the newest or first as an authentication rule.
Download bundle hints without GitHub or journal credentials; a later verifier must select
by signed semantics, not response order.

Each HTTP request uses GET, `redirect: 'error'` and `cache: 'no-store'`. The transport also
rejects any 3xx, 206, 304 or content encoding response, including a same-origin redirect.
Credentials are omitted unless an independently supplied capability matches the exact origin
and route family; the GitHub token applies only to the GitHub candidate API, a journal token
only to the fixed journal routes, and neither reaches bundle URLs. Never log token or signed
URL query bytes. Classify absent, inaccessible, rate-limited, unavailable, invalid-response,
integrity-mismatch, limit-exceeded and cancelled distinctly; do not retry a GET automatically.
One monotonic 30-second operation deadline includes HTTP body reads, staging and cleanup;
each request has a 10-second ceiling. Bound the scan to five GitHub pages, 16 candidates,
64 artifact entries, 1 MiB per bundle, 4 MiB per artifact and 32 MiB of aggregate body
bytes. Enforce declared `Content-Length` and streamed bytes, including bodies that never
close; abort/cancel all outstanding reads on failure or external cancellation.
The retrieval caller supplies a required observer for redacted late cleanup failures:
if a fetch ignores abort and returns a response after the refusal settles, the
retriever cancels that body within its original request deadline, rechecks the
monotonic deadline after finite cancellation settles, and reports a sanitized
cancellation or deadline failure through the observer. The observer
must record the failure and must not throw. Pending-directory cleanup also
rechecks cancellation and the whole deadline after removal, preserving the
original typed refusal in an aggregate cause.

Stage digest-named resources into one private 0700 operation directory with exclusive 0600
files. Keep staging pending until every required manifest, artifact and candidate bundle is
fully fetched, checked and re-opened with no-follow regular-file checks and a fresh digest.
Reject symlinks, unreadable files, conflicting existing digest cache entries and partial
staging; remove the pending operation on failure. A successful
`RetrievedReviewJournal` remains explicitly **unauthenticated** and carries no
`VerifiedReview`, receipt or database-write capability. This slice only retrieves bytes;
signature verification, semantic mapping and `recordReceipt` remain later 2.1b work, and
the producer/retention implementation remains 2.1d.

The first offline process-policy increment freezes GitHub CLI `gh attestation verify`
v2.98.0 output compatibility. Its protected descriptor supplies an absolute verifier
executable, runtime closure identity and custom trust root; an independent resolver must
match all three identities and the exact version before process launch. Stage one local
JSON bundle and the exact journal-manifest bytes in private files. Launch with an empty
environment, fixed repository/certificate/signer-commit/source-commit/ref/issuer/predicate
arguments, `--bundle`, `--custom-trusted-root`, `--deny-self-hosted-runners` and
`--no-public-good`; bound input, stdout/stderr and time from before staging
through cleanup. Launch in a new process group, terminate that group on
timeout/abort/output failure, cancel both output readers and settle the direct
child and both reader promises before returning, including when one reader
rejects first. Synchronous staging or cleanup that crosses the
original monotonic deadline refuses success; cancellation during cleanup also
refuses success. Require exactly one structured verification record whose subject SHA-256 matches
the manifest and whose bundle, certificate identity, issuer and predicate type match the
pins. The process seam returns an untrusted policy observation in local fake tests. It
does not issue a `VerifiedReview` or satisfy external provenance without an installed
independently pinned executable/root and a provenance-backed valid journal fixture.

##### Signed review predicate v1 and checkpoint A

This is the producer/consumer contract to implement, not evidence that an external producer
or successful signed fixture exists. Checkpoint A authenticates the selected manifest only;
checkpoint B reconstructs review evidence and mounts the receipt owner. Neither may promote
`OfflineVerifierObservation.untrustedCliOutput` by casting or by accepting a caller's trust
flag. The production composition owns the independently pinned runtime/process boundary.
Process fixtures prove adapter behavior only; local `/usr/bin/gh` is not bootstrap authority.

Freeze one custom predicate object with the exact fields below. Every object rejects unknown
fields. `Digest` means 64 lowercase hexadecimal SHA-256 characters; `Commit` means 40 lowercase
hexadecimal Git commit characters; `Id` means a nonempty existing protocol identifier;
`Positive` and `Attempt` mean safe integers respectively >= 1 and >= 0. Canonical objects use
`serializeCanonical`, without trailing whitespace/newline; raw resources use exact bytes.
The configured `predicateType` remains external and must match the signed statement exactly.

```ts
{
  schemaVersion: 1,
  kind: 'tool-wiki-review',
  descriptorIdentity: Digest,
  manifestIdentity: Digest,
  receiptAudience: Id,
  journalIssuerId: Id,
  journalId: Id,
  effectKey: Digest,
  payloadDigest: Digest,
  requestIdentity: Digest,
  reviewId: Id,
  attempt: Attempt,
  invocationId: Id,
  selectionIdentity: Digest,
  execution: {
    executorId: Id,
    modelId: Id,
    protocolIdentity: Digest,
    promptIdentity: Digest,
    programIdentity: Digest,
    actionIdentity: Digest,
    runtimeIdentity: Digest,
    toolPolicyIdentity: Digest
  },
  attestor: {
    ownerId: Positive,
    repositoryId: Positive,
    workflowId: Positive,
    sourceCommitSha: Commit,
    signerDigest: Commit,
    runId: Positive,
    runAttempt: Positive
  },
  phases: ReviewJournalManifest['phases']
}
```

`phases` uses the existing strict phase-record schema and its paired/cold-terminal cardinality;
it must equal the decoded manifest's phase array, including order, obligation, submission and
source digests and status. Require schema/predicate version 1 and exact bootstrap descriptor,
issuer/audience, registration, dispatch payload/effect and manifest joins. `execution` fields
match protected descriptor values, not model-supplied labels. The attested statement must have
one SHA-256 subject equal to the exact registered manifest bytes. Keep its manifest digest,
submission digests, source projections and bundle digest distinct.

The certificate/verified timestamp chain authenticates issuer, signer identity/revision,
source identity, runner and signing execution; the predicate authenticates what that pinned
program claims about review execution. A predicate cannot prove its own signer. Compare
certificate SAN/issuer, build-signer digest, source repository/owner immutable identifiers,
source digest/ref, runner environment and run-invocation URI against protected pins and
`attestor`. The attestor is the signing run, not a substitute for registered `invocationId`.
Require an authenticated read-only GitHub metadata join from that run to the pinned numeric
workflow ID/path and repository/owner IDs when the certificate lacks those fields. Read
`GET /repos/{owner}/{repo}/actions/runs/{runId}/attempts/{runAttempt}`, then
`GET /repos/{owner}/{repo}/actions/workflows/{workflowId}` from the pinned GitHub API origin;
route names come from protected configuration and verified identities, never response URLs.
Validate the run projection `{ id, run_attempt, workflow_id, head_sha, repository: { id,
owner: { id } } }` and workflow projection `{ id, path }`, comparing every field to the
certificate/predicate and source/workflow pins. Accept unrelated documented response fields
only outside these typed projections. Never substitute the latest run attempt. This requires
an explicit Actions-read route capability, separately scoped from attestation lookup, with
redirect refusal and existing finite request/body/operation bounds. Retain exact responses
with each proof; missing/mismatched fields or unavailable historical metadata refuse.
[Run-attempt API](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run-attempt)
and [workflow API](https://docs.github.com/en/rest/actions/workflows#get-a-workflow) define
these read-only endpoints.
Do not infer signing OIDC audience from a certificate without that claim. Its bootstrap
acceptance is separate from the predicate's exact application receipt audience.

Resolve review selection independently before accepting `selectionIdentity`. The protected,
versioned protocol/program resolver takes the frozen canonical request, stable `reviewId` and
protocol identity and returns exactly `{ subject, informedContextIds, coldRequiredReadIds,
informedRequiredReadIds }`, where `subject` uses existing `ReviewSubject` and every list
contains content digests. Its canonical hash is `selectionIdentity`. Required-read lists are
sorted and unique; context order is preserved. This resolver must select content from the
frozen candidate snapshot and selected review scope, never the receipt, current checkout or
predicate. An absent mapping refuses. Existing obligations do not themselves carry this
subject/read mapping: the resolver and its producer parity proof are explicit checkpoint A
prerequisites, not defaults inferred from one observed file. Both required-read sets include
the selected subject content; the informed set also includes every supplied informed context.

For each bounded candidate, privately reread staged bytes with containment/no-follow regular
file checks, byte limits and fresh hashes. Invoke the actual pinned offline verifier over
those bytes and validate its exact versioned output and custom predicate. V1 treats every
nonzero CLI exit as operational refusal: the current process port does not
provide a machine-authenticated distinction between cryptographic rejection and operational
failure. Missing tools, unreadable/corrupt trusted roots, malformed output, timeout and
cancellation also refuse, rather than permitting a skip to another candidate. Do not infer
retry/rejection categories by matching human stderr text. Authenticate all candidates within
one finite composition deadline; no early first-success return. Zero matching proofs refuses.

Group successful proofs by the canonical predicate with only `attestor.runId/runAttempt`
removed. Identical claims may have different bundles/signatures/timestamps or signing runs;
retain every verified proof and choose the lexically smallest bundle digest as the stable
representative. Each proof must independently pass certificate/run/workflow joins. Different
remaining claims for the same expected registration refuse as conflicting evidence. A valid
signature that purports to cover this exact registration/manifest but contradicts its frozen
bindings is also a conflict. Unrelated repository metadata may be filtered by the existing
retrieval contract, but a pinned signer's statement over this exact manifest cannot claim an
unrelated registration and be silently ignored. This comparison does not authorize a second
review execution: only equivalent re-attestations of the identical journal are deduplicated. Response order never grants trust.

Checkpoint A returns an authenticated manifest with retained exact proofs and selection, not
`VerifiedReview`. Receipt rows remain unchanged. Its authenticity derives from protected
composition, not from a structurally constructible TypeScript value or fixture output.

##### Phase submission and artifact contract for checkpoint B

Each `phases[].submissionDigest` additionally addresses an immutable object at
`{base}/v1/artifacts/sha256/{submissionDigest}`. The 2.1d producer retains these bytes before
publishing the manifest. They need not be repeated in `manifest.artifacts`; fetch them as
explicit phase resources, charging the existing 4 MiB per-artifact, 64-resource and 32 MiB
aggregate ceilings, deduplicating by digest. Reject phase-submission objects listed as another
artifact kind. All phase resources belong to the same authenticated manifest; do not discover
receipt bytes from a mutable latest pointer. Authentication precedes interpretation.

An exact phase submission is strict canonical JSON with fields:
`{ schemaVersion: 1, kind: 'review-phase-submission', binding: ReviewExpectation,
journalId: Id, inputs, source }`. `binding` uses all existing expectation fields exactly;
it contains no self digest, manifest locator or authority override. `inputs` is a strict
`{ cold: string, informed: string }` for complete evidence, or `{ cold: string }` for genuine
cold-only failed/skipped evidence. Each string retains exact canonical UTF-8 protocol request
bytes: respectively `ColdHarnessRequest` and `InformedHarnessRequest`. These are harness
protocol inputs, not a claim that their bytes equal the Anthropic HTTP body. The pinned
producer records their translation/model-call observations under its protocol implementation.

`source` is exactly one existing controller projection:

- Complete: `{ evidence: ReviewEvidence, cold: ColdHarnessOutput,
informed: InformedHarnessOutput, findings: AuditFinding[], status: 'passed'|'failed'|'skipped' }`.
- Cold-only: `{ cold: ColdHarnessOutput, terminal: { status: 'failed'|'skipped', reason: Id } }`.

Unknown/missing fields refuse; no inferred empty findings, fabricated reason, telemetry,
response or status. Hash exact submission bytes into `submissionDigest`; hash canonical
`source` into `sourceEvidenceDigest`. Both must equal the selected signed phase record.
The selected record's status equals `source.status` or `source.terminal.status`. A cold-only
projection is permitted only for the cold phase and the manifest's one-phase terminal shape.
A complete manifest has cold then informed; both submissions have identical inputs, evidence,
cold output and informed output. Only selected phase binding, findings and status may differ.

Map artifact roles from these decoded source values, not array position. Each required logical
slot must have exactly one matching `(kind, identity)` resource; identical bytes across phase
slots share one resource. Reject extra unreferenced role entries and conflicting alternatives.

| Manifest artifact kind | Exact bytes and required logical slots                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cold-output`          | Canonical `source.cold`; one cold slot for either source branch                                                                                                            |
| `informed-output`      | Canonical `source.informed`; one informed slot only for complete source                                                                                                    |
| `review-evidence`      | Canonical `source.evidence`; one slot only for complete source                                                                                                             |
| `telemetry`            | Canonical verified telemetry from each present phase output; cold plus informed for complete source                                                                        |
| `raw-response`         | Exact UTF-8 `rawResponse.payload` bytes from each present phase output, without JSON wrapping or newline normalization                                                     |
| `required-read`        | Exact content bytes for every distinct content identity in the phase outputs' observed-read lists; these IDs already name content, not invented observation-wrapper hashes |

Every role identity is SHA-256 of its exact bytes. `required-read` resource identities equal
the union of observed content identities; each independently resolved required-read set must
be included in its phase's observations. The producer records actual read-tool observations;
retaining content alone does not prove a read, and model-provided read IDs alone do not create
journal observations. The pinned executor must attest its observed lists, and the consumer
matches those signed lists, retained content and resolved required sets. Do not silently sort
or deduplicate the protocol's observation arrays; aggregate arrays preserve existing order
and multiplicity, while the resource set deduplicates content storage only.

Both protocol input requests and outputs must match the selected subject, protocol and
registered invocation. Informed context equals the resolved ordered context. Each verified
telemetry receipt's invocation/receipt IDs equal its phase input's IDs; `inputArtifact`
hashes its exact retained harness input; `outputArtifact`
hashes its phase raw response. Executor model equals the descriptor model pin; executor and
price identities agree across complete phases, and existing receipt schemas validate measured
usage, charge and elapsed intervals. Retain actual source values rather than replacing them
with descriptor strings. Additional executor dimensions are authenticated observations, not
unprovided configuration defaults. Missing required measured fields refuse completion.

Require `hashCanonical(cold.cold)` to equal the informed input/output `coldArtifact` and
`evidence.protocolEvidence.expansion.coldJudgmentArtifact`; the informed input's cold judgment
also equals the cold output's. The producer durably acknowledges that exact cold judgment
before making informed context available. Existing `ReviewEvidence` phase receipts/tools,
protocol/subject/judgments, ordered observed-read/usage aggregates, context list and informed
raw-response reference must equal their phase sources as enforced by `authenticatedReview`.
The semantic adapter must reuse these checks rather than invent a parallel looser protocol.

##### Phase verdicts and receipt ownership

Findings/status in each complete submission describe that selected phase. A cold pass has no
unresolved cold findings. An informed failed/skipped submission may introduce new findings;
it preserves all still-applicable findings from prior phases. Finding IDs are unique per
phase; the same ID across phases cannot silently change severity or summary. V1 does not
permit a producer to clear an unresolved cold finding and continue: a non-passing cold phase
is terminal and produces no informed phase. A passed status with any unresolved finding
refuses. Do not infer pass from decodable JSON, telemetry completion, missing findings or an
informed correction to a failed cold phase. The pinned review policy decides judgments/status;
this amendment does not invent a new mapping of `yes|partial|no` judgments to pass.

Cold-pass/informed-fail is represented explicitly: the final immutable manifest contains
cold `passed` and informed `failed`; both complete submissions retain identical real phase
outputs/evidence, cold has its authenticated empty unresolved-findings list and informed
retains its failed verdict/findings. The controller records cold first, then informed failure;
the request fails and cannot become verified. Its earlier cold receipt remains immutable.
This is not an omission of informed findings: the adapter authenticates both submissions
before returning either, checks the paired verdict relationship and retains both. An
operationally interrupted informed phase without complete evidence cannot manufacture this
complete branch or a cold-only failed receipt for an actually passed cold phase; it follows
the operational-failure path and produces no fabricated review receipt.

After checking the entire source/role graph and exact caller submission equality, construct
only the selected existing `VerifiedCompleteReview` or `VerifiedColdTerminal`. Mount behind
`verifyReview(ReviewSubmission)` with protected lookup/retrieval/authentication; let
`recordReceipt` reread current authority, subject generation, lease and own attempt/registration
inside its short transaction. Authentication runs outside it. Retain authenticated source and
proof objects before selecting evidence; failed receipt transactions may leave immutable
unselected evidence but cannot partially select it or erase earlier receipts. Stale results
cannot grant authority. No schema/default backfill, provider dispatch or observation-service
evaluation is implied by this composition.

Mount this authentication behind the existing `verifyReview(ReviewSubmission)` port. Obtain
`ReviewExpectation` from protected selection/registration, not the submission. Return
`VerifiedCompleteReview` or `VerifiedColdTerminal` using the existing protocol decoders:

- Copy only authenticated matching expectation fields into `ReviewBinding`; set
  `exactSubmissionDigest` to the hash of the exact submitted bytes and authenticate that hash.
- Compute `sourceEvidenceDigest` with the existing canonical source projection:
  `{ evidence, cold, informed, findings, status }` for complete review, or `{ cold, terminal }`
  for cold-only failed/skipped evidence. The manifest/bundle digest is a separate binding;
  it cannot replace this source digest. Authenticate the projection and every raw reference.
- Preserve actual `ReviewEvidence`, `ColdHarnessOutput`, `InformedHarnessOutput`, findings
  and outcomes. Both phase records join the same registered invocation and exact cold
  artifact. A cold-only terminal can satisfy no informed obligation and can never pass.
- Let existing `recordReceipt` revalidate current authority, registration and own attempt
  after the verifier await, then atomically retain/join evidence. No SQLite transaction spans
  transport/verification; authenticated stale facts remain history, not current approval.

#### Durable registration and uncertainty

Before dispatch, persist the existing `ReviewDispatchReservation` and invocation registration.
A protected durable provider registry must atomically accept each `effectKey` against its exact
request, target, payload digest and invocation, while validating current authority and live
owner/lease epoch/expiry. The controller exposes authenticated acceptance to that registry;
caller-supplied epochs alone are not authority. Reject conflicting bytes/target/invocation.
A duplicate workflow run must query this registry before any model call and cannot allocate
a second invocation; it may recover unfinished progress only through the fenced protocol below. GitHub workflow concurrency and workflow-run listings alone do not
implement idempotency. The registry is an explicit bootstrap dependency, not an assumed
GitHub API feature or an ephemeral Actions cache.

Implement `ReviewDispatchPort.query` as an authenticated exact-effect lookup returning
`absent | unavailable | accepted { observed }`; `send` returns `uncertain | accepted`.
The selected registry contract uses authenticated `GET /v1/review-effects/{effectKey}` and
`POST /v1/review-effects/{effectKey}/accept` at its externally pinned HTTPS origin. Acceptance
submits the frozen reservation, invocation and ownership fence; the receiver joins them to
authoritative current state in its atomic acceptance operation. An authenticated 200 returns
the immutable bound acceptance fact; an authenticated exact-key 404 proves absence only on
the query route. Conflict/refusal does not create a fact; timeout, 401/403, 5xx or malformed
responses do not prove absence. The registry service and its controller-state authentication
are required provisioned dependencies, not part of GitHub workflow dispatch.
An unavailable registry, incomplete listing or unauthorized response is never absence.
Map acceptance into `ReviewDispatchObservation` with exact effect/request/target/payload,
invocation, immutable remote dispatch ID and retained authenticated `evidenceBytes`.
An acknowledged workflow run without registry acceptance remains uncertain. On lost replies,
reopen and query the registry; resend only when authoritative absence and existing deadline,
attempt budget and lease policy permit it. Same-effect replay returns the same accepted fact.
Late facts are retained after supersession/expiry without granting a stale acknowledgement.
Recovery does not claim exactly-once network delivery or erase duplicate transport runs.

Registry acceptance and execution completion are separate durable facts. Acceptance must
atomically create an execution-progress row; an accepted row without progress is corrupt
trusted state and refuses rather than silently repairing or waiting forever. Preserve the
immutable acceptance fact while advancing versioned progress for each phase and model-call
ordinal. Record the exact call-input digest, execution owner/epoch/lease, attempt budget,
absolute deadline, observed response references and terminal reason. A workflow run ID is
not an execution lease. The progress states are:

| State               | Durable meaning and permitted recovery                                                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pre-send`          | No send-intent exists for this call. A current authorized owner may acquire/recover a bounded execution lease and CAS the progress version. A replacement must fence the old owner before proceeding.                                                |
| `uncertain`         | Send intent was committed before permitting the HTTP POST. The call may or may not have reached Anthropic. No replay of this call, new invocation or automatic replacement review is authorized merely by a lost response or expired lease.          |
| `evidence-retained` | Exact response bytes, request metadata and actual required observations are durably retained and digest-bound. Recovery may validate these bytes and resume journal/signing work without repeating the call. This state alone is not a passed phase. |
| `terminal`          | Immutable execution disposition: completed with required retained evidence, or failed with an explicit operational reason. It cannot reset to pre-send, erase evidence or revive a failed request.                                                   |

A protected send gateway owns model credentials and the actual POST. It validates current
request/authority and execution owner/epoch/lease/deadline, then atomically CASes `pre-send`
to `uncertain` before sending. Workers cannot bypass the gateway or use a previously issued
permit to send independently. Losing the CAS or using an expired/replaced lease sends nothing.
There is no transaction spanning the network call. A crash after the intent commit but before
the POST is deliberately indistinguishable from a crash after the POST: both remain uncertain.
The gate's intent marker authorizes at most one send for that call; recovery never resends it.
An already initiated call cannot be revoked by later lease expiry or supersession.

A crash while still `pre-send` is safely recoverable by a fenced owner under the original
invocation, input digest, deadline and bounded recovery budget. A crash in `uncertain` uses
bounded reconciliation for exact authenticated retained response evidence only; Anthropic
request IDs or workflow success are not assumed to provide replayable response retrieval.
If the bytes cannot be recovered before the persisted deadline/budget, record terminal
`execution-uncertain` failure and propagate a failed/incomplete required obligation through
an explicit operational-failure path. Do not leave an accepted effect pending indefinitely.
Missing/corrupt trusted progress or required retained bytes is a distinct refusal, reported
through failure health without synthesizing or repairing progress. It is neither ordinary
pending work nor completion. A classified
pre-send transient may use bounded fenced recovery; uncertain execution has no automatic
fresh-attempt retry in this increment. Any later retry policy needs a separately specified
trusted transition retaining the failed attempt, not an implicit reset.

Late workers may append authenticated matching response facts immutably through a retention
path, even after their execution lease is stale; they cannot update authoritative progress,
select a receipt or change a terminal disposition. A current recovery owner may join such
facts only before terminal/deadline and after all current-state and evidence checks. Retained
late bytes after terminal remain historical. Repeated identical facts are idempotent;
conflicting bytes, call ordinals or invocation bindings refuse. Recovery from
`evidence-retained` never calls the model again. A next model-call ordinal or informed phase
requires the prior call's validated durable evidence and protocol order under a fresh fenced
transition; phases/ordinals cannot disguise a replay of an uncertain call.

Operational execution failure is not `VerifiedColdTerminal`. That review type still requires
an actual valid cold output, observed reads/raw response/telemetry and its authenticated
bindings. If these are absent, retain operational failure and available partial evidence;
produce no synthetic cold output, review receipt or passed status. If genuine complete
cold-only failed/skipped evidence exists, it may use the existing verifier normally. Tests
must inspect both operational state and absence of selected receipts after bounded failure.

Publish the journal manifest only after all referenced raw evidence is durably retained;
attest the committed manifest afterward. Resume interrupted retention/signing by immutable
digest and effect identity. Retain bundles, manifests, raw responses, observations and phase
receipts beyond workflow workspace/log expiry under the configured retention policy.
Missing, unreadable, corrupt or conflicting required evidence, revoked authority, unsupported
entitlement and exhausted retry/deadline refuse visibly. Pending transport is not a passed
review. Installed acceptance must exercise a real independently administered workflow/model,
retained journal retrieval after restart, and a forbidden candidate-authority substitution.
Local fixtures can prove adapter behavior but cannot authenticate external independence,
entitlement or deployment. [GitHub plan requirements](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
remain a one-time bootstrap acceptance condition; no per-PR operator action is introduced.

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

#### Required worker capability target before launch

`twilight-burokrat:test:worker` is an uncached, separate required target. It
first tests fail-closed capability classification, then reports the actual
host state and exits nonzero when any required control is unavailable. The
read-only inspection uses only an inert `/bin/true` Bubblewrap namespace
probe; it never runs a selected command. It distinguishes mandatory namespace
setup, delegated cgroup v2 `cpu`/`memory`/`pids` quota control, the pinned
AppArmor policy, and exact-profile FD/mount sentinel proof. A successful
namespace probe alone cannot certify the other controls. Read-only cgroup
inspection cannot establish a writable quota-enforced execution leaf, and a
non-`unconfined` AppArmor label alone cannot establish the pinned policy; both
remain unavailable until independently installed and measured. There is no
fallback, skip, candidate fixture or receipt authority in this target.

The target is outside ordinary CLI unit-test collection. CI and the host gate
must require it only after an independently provisioned service/scope and
specific loaded policy provide a measurable quota leaf and exact sentinel
tests. Provisioning cannot be attempted by candidate code or a PR-time sudo
step. B2 worker execution, authenticated completion and activation remain
separate later work.

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
