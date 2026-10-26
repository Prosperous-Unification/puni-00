# Resource release in WBS

## Scope and source basis

Architecture baseline from `830e774d2302d852432c51ded1e1b38e85728f66`, read 2026-10-25.
The user requires mandatory cleanup after work and the ability to track resource releases.
Implementation is tracked in [WBS reported tracking](../wbs-resource-release-tracking/tasks.md)
and [Dash automatic cleanup](../dash-resource-cleanup/tasks.md). Their concrete contracts
and verification records establish current coverage; this broader design also describes
future provider adapters and recovery operations.

The existing boundaries are binding:

- WBS `refuseOccupancy` in `libs/wbs/domain/domain/src/occupancy.ts` checks declared
  per-project units. A leaf holds the largest copy across its claims, not the sum of
  physical copies. Last-claim release frees this occupancy.
- `ClaimLeaseSweep` already releases expired claims. `endAttempt` records an execution
  outcome separately from `setProgress`; attempt numbers belong to a work item and step.
- Dash `report-capacity` measures resources. The compute-providers contract deliberately
  keeps measurements informational to WBS claims and scheduling.
- The [control-plane design](../twilight-control-plane/design.md#states-attempts-and-leases)
  assigns runtime reservation, fencing and `settleAttempt` to Dash.
  Its [Tasks 4 and 6.2c](../twilight-control-plane/tasks.md) still list admission and
  workspace reclamation as open. This design refines those contracts; it does not assume
  that their future runtime paths already exist.

## 1. One authority, two views

Dash is authoritative for runtime reservations, physical resource identity, cleanup effects
and verified release. WBS persists an attributable projection of this history and durable
operator requests. It does not inspect paths, run shell commands, trust an ordinary worker's
claim of deletion, or independently return runtime capacity.

WBS claim occupancy retains its current semantics. An expired claim can disappear while its
checkout remains charged in Dash and visible in WBS as cleanup pending. Undoing a claim
release may reacquire logical occupancy; it cannot revive a deleted checkout or undo a
physical release.

The UI labels **planned capacity**, **claim occupancy**, **runtime reserved** and
**observed usage** separately. Runtime reservations are not added to claim occupancy: they
describe different constraints. A WBS step that fits its declared capacity may still wait
for Dash's host admission. Existing scheduling hashes and saved-plan semantics stay intact.

## 2. Resource uses bind reservations to real things

Keep the existing Reservation term and its `held | draining | released` lifecycle. Add a
**Resource use** for the specific checkout, directory, process group, container, volume or
reusable checkout being managed. One resource use can charge several reservation entries:
a checkout can occupy one workspace slot and disk units. Execution slots and memory can
settle separately from persistent storage. Each reservation entry is attributed once;
subdivision or transfer must conserve its units. Partial settlement records the exact
released entries and remaining units rather than freeing the entire vector.

Each use records:

| Field           | Meaning                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Identity        | Organization, runtime authority id and epoch, immutable resource-use id and incarnation.                          |
| Attribution     | Runtime run and attempt ids, agent run, responsible person, WBS project/work item/step/attempt number when bound. |
| Capacity        | Reservation ids, canonical host-pool ids, WBS resource ids, unit labels and reserved units.                       |
| Physical target | Provider instance, resource kind, canonical locator and adapter-verifiable identity.                              |
| Ownership       | Current owner, writer generation, cleanup policy, permitted root and dependent uses.                              |
| History         | Revision, ordered events, creation/preservation observations and evidence references.                             |

The runtime binds WBS references itself under authenticated project access; a worker cannot
attribute arbitrary files to another organization. It retains original attribution when a
later transfer changes the current owner.

A path or PID alone is insufficient. Filesystem uses include the registered root and file
identity, and process observations include host boot/process-start identity or a contained
process group. Containers and volumes use provider identity and ownership labels. Providers
define the comparison and no-follow operations that prevent a replacement at the same
locator from being removed.

Before a resource-creating effect, reserve capacity and persist the creation intent. Register
every additional review, baseline and subagent copy. A second physical copy is a second use,
even on the same WBS leaf. Existing leaf occupancy cannot count these copies correctly.

Creation failure does not imply absence. A timeout after creation leaves the use unresolved
until the provider is inspected. A positively verified never-created use can release its
reservation with disposition `not_created`.

## 3. Settlement is mandatory, outcome is independent

An execution records its actual `succeeded | failed | cancelled` outcome at the actual end.
Cleanup time does not extend its work duration or change success into failure. The resource
settlement state is separate, and the execution is fully settled only when every use is
released or transferred to an explicitly accepted continuing owner.

The runtime seals a complete creation manifest after withdrawing the attempt's ability to
create resources. An empty sealed manifest yields `not_required`; a missing manifest or an
unmanaged execution yields `untracked`, never a green cleanup result. Late observations of
an already-created resource must reconcile the manifest and block settlement.

| Cleanup state | Reservation state                 | Meaning                                                              |
| ------------- | --------------------------------- | -------------------------------------------------------------------- |
| `active`      | `held`                            | Work still owns the use.                                             |
| `pending`     | `draining`                        | Cleanup requested, waiting for the controller.                       |
| `running`     | `draining`                        | The current cleanup owner is checking or removing the use.           |
| `blocked`     | `draining`                        | A known dependency, preservation failure or policy prevents release. |
| `unknown`     | `draining`                        | The provider or required evidence cannot establish the state.        |
| `retained`    | `draining` or transferred `held`  | Explicit continuing ownership; charged throughout.                   |
| `released`    | `released` for the proven entries | Provider-specific release conditions are satisfied.                  |

States apply to each use and its charged entries; aggregates show counts rather than hiding
partially completed cleanup behind one boolean. A blocked disk entry does not keep a
verified stopped process slot occupied.

Success, failure, cancellation, claim expiry, credential revocation and explicit operator
requests all enqueue settlement idempotently. Loss of ownership fences the previous writer;
it does not prove the process stopped. A controller restart resumes durable pending work.
The cleanup controller has its own narrowly scoped authority, so worker credential revocation
does not prevent it from cleaning up. A cancelled workflow cannot cancel this obligation.

Cleanup runs as a registered tool activity with reserved controller capacity and a finite
per-attempt deadline. Timeout records a blocker and retries with bounded backoff; repeated
failure remains visible for operator action. An LLM call is not required to run cleanup.
Absence of cleanup capacity keeps the request queued and its resource holds intact.

## 4. Provider release protocol

For a disposable checkout the controller must:

1. Claim the cleanup operation with a current cleanup generation and resource revision.
2. Fence creation and writes, drain owned processes, and verify that writable mounts and
   other writers no longer reach the target.
3. Verify the target identity and containment; reconcile registered dependencies and scan
   supported Git alternates, worktree links and dependency symlinks.
4. Preserve required commits, staged/unstaged changes, untracked source and evidence in a
   durable destination. Validate the preservation manifest and recoverability. Generated
   dependencies may be omitted only under a recorded reproducibility policy.
5. Record the cleanup effect intent, remove through the owning adapter, then independently
   verify the postcondition.
6. Atomically record the release event, settle the proven reservation entries and enqueue
   the WBS publication in the runtime store.

Git worktrees use the repository's worktree operation. A shared alternate object store
cannot be deleted while a dependent needs it. A symlink is neither traversed for recursive
deletion nor assumed to prove that its destination is disposable. Migration of a dependency
must be verified before its original use is released.

Identity and dependency checks are protected by the provider's ownership/exclusion boundary
through deletion. A preflight followed by an unprotected recursive delete is insufficient.
If another writer cannot be excluded, record a blocker. Recheck after preservation so a
late edit is not silently dropped.

| Kind                                       | Required release evidence                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process / agent slot / RAM                 | The identified execution and owned children are terminal and no longer hold the capacity. Local exit proves nothing about remote jobs.                        |
| Disposable checkout or temporary directory | Work preserved as required, writers excluded, dependencies satisfied and the exact target removed. Deleted-but-open files remain charged until handles close. |
| Container                                  | The identified container is absent or stopped according to policy. Attached persistent volumes remain separate uses.                                          |
| Volume                                     | Detachment and provider-confirmed deletion or return; stopping its container alone does not release it.                                                       |
| Reusable workspace                         | Old access removed, required reset verified and exclusive availability returned to its pool. Its storage remains charged to the pool owner.                   |
| Never-created resource                     | Creation reconciliation establishes absence under the same allocation identity and generation.                                                                |

Other provider kinds remain unsupported until their release postconditions and negative
proofs exist. A successful shell exit, a timestamp threshold or a missing provider connection
is not a release record.

## 5. Retention, dependencies and ownership transfer

Retention requires a responsible owner, reason, review deadline, permitted purpose and
budget/reservation. A deadline requests review or cleanup; it does not authorize deletion
of unknown or active work. A backup created during preservation is itself a retained use
whose storage must be charged; moving bytes to backups is not reclaiming those bytes.

When ownership transfers to a review attempt or a durable cache/evidence owner, the receiver
accepts responsibility and capacity atomically. The same physical use is counted once; an
overlapping handoff never creates an uncharged interval. Record both owners and the reason.
Transferring the use permits the original attempt to settle, but the WBS view must say
**retained/transferred**, not **disk freed**. A retention with no accepted receiver keeps
the original attempt unsettled.

Dependency edges are part of admission and cleanup. A consumer release removes its edge;
a producer cannot release while live consumers remain. Shared objects and cache storage are
charged to their continuing owner once, while each consumer's own checkout is charged
separately. Cycles or unregistered dependencies become explicit blockers requiring
reconciliation; no age-based deletion breaks them.

## 6. Accounting and host admission

Each physical host pool has one runtime authority and canonical identity across provider
aliases. All projects using that pool share its reservation check. Two projects each
declaring 32 GiB do not create 64 GiB of physical capacity. WBS's project-scoped occupancy
is unchanged and must not be advertised as this host-wide protection.

Every unreleased reservation entry counts: active, pending, blocked, unknown and retained.
Admission atomically reserves the whole requested vector and requires provider headroom
under the host policy. For disk, the admission checks both the managed reservation budget
and measured available bytes minus protected headroom and outstanding growth allowances.
An attributed use contributes its remaining possible growth; when consumption cannot be
attributed, conservatively treat its entire reservation as still able to grow. This can
underutilize a host but cannot invent headroom. Convert declared disk units using the
provider binding's explicit scale and round reservation demand upward; never infer a scale
from a display label. Unsupported or stale observations refuse strict admission.

Raw observed usage already includes some managed consumption, so it is not an additional
unqualified charge added to the managed reservation budget. Hard disk limits require an
adapter-enforced quota or another defensible bound, including other writers to the same
filesystem; a periodic `df` report alone is monitoring, not a hard cap.

Release records distinguish:

- Reserved units returned to the admission pool, in each resource's declared unit.
- Verified physical bytes reclaimed, when attributable measurement supports that claim.
- Bytes retained or transferred.
- Host free-space observations, which may change because other work is running.

Do not report reservation units as measured reclaimed bytes. Hardlinks, shared caches,
open handles and filesystem snapshots can make those numbers differ. If removing a checkout
leaves blocks held elsewhere, transfer the physical charge to the identified continuing
owner or keep it unresolved; do not credit the same disk space twice.

## 7. Release history and WBS contract

Dash emits immutable events for registration, creation observation, cleanup request,
cleanup attempt, blocked/unknown observation, retention, transfer and verified release.
A **Release record** is the verified-release event, not the request.

Every event carries organization, authority id/epoch, event id, per-authority resource-release stream sequence,
use id/incarnation, revision, actor, reason, observed/recorded times and evidence references.
Release records additionally name released reservation entries, disposition
(`removed | returned | not_created | externally_verified`), verifier identity, before/after
observations and optional reclaimed bytes. Evidence carries digests and durable locators;
credentials and arbitrary shell output are excluded.

The runtime transaction commits the event, reservation update and publication outbox
together. Lost acknowledgments replay the same event without releasing again. A crash after
deletion but before commit reconciles the original target and intent before publishing.
A stale writer, cleanup generation or authority epoch cannot release a replacement.

Original proposed WBS surfaces, separate from undoable plan commands. The implemented local
rollout uses the [concrete authority/event contracts](../dash-resource-cleanup/design.md#wbs-transport);
the table below remains the broader target, not an API reference:

| Surface                                                                   | Contract                                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PUT /api/compute-providers/:providerId/resource-release-events/:eventId` | Ingest one ordered runtime event, authenticated as the registered reporting authority. Identical replay returns the existing event; conflicting replay or a sequence gap refuses without partial projection. |
| `GET /api/projects/:projectId/resource-uses`                              | Filter by work item, step, attempt, state and provider; cursor-paginated current use projections plus source freshness.                                                                                      |
| `GET /api/projects/:projectId/resource-release-history`                   | Cursor-paginated event history with ownership, blockers and release evidence.                                                                                                                                |
| `POST /api/projects/:projectId/resource-uses/:useId/cleanup-requests`     | Persist an authorized retry or cleanup request with expected revision and idempotency key; acceptance means requested, never released.                                                                       |
| `GET /api/organization/resource-uses`                                     | Admin view of retained/orphaned uses across projects, including deleted planning references.                                                                                                                 |
| `GET /api/compute-providers/:providerId/resource-cleanup-requests`        | Bound runtime authority reads its durable request stream after a cursor, with bounded pagination; ordinary workers cannot consume it.                                                                        |

WBS assigns a monotonically ordered request id and stores each request before acknowledgment
to the requester. Dash persists a consumed request's cleanup intent and stream cursor in one
transaction before advancing its read. Resulting lifecycle events carry the request id;
ingestion records the acknowledgment and projection together. Retries use the same request
id and intent. A request without a controller event stays pending; an acknowledged request
can still be running or blocked. Restart replays the stored intent or redelivers the request,
never loses it between advancing a cursor and enqueueing cleanup.

The request body is `{ action: 'cleanup' | 'retry', expectedRevision, idempotencyKey, reason }`.
The first write surface accepts `cleanup | retry` requests with expected use revision.
Retention and transfer are separately authorized runtime dispositions published to the same
history: the responsible owner and accepting receiver must have budget/ownership authority.
A recovery operator can submit out-of-band evidence for `externally_verified` release through
the runtime recovery operation. The runtime validates resource identity, current revision
and evidence before emitting the release; an operator assertion with no release evidence
keeps the use unknown and charged. No WBS button directly marks a resource released.

A credential must be explicitly bound to the organization, provider and runtime authority
with a release-reporting capability. An ordinary agent credential or browser session cannot
certify release. WBS checks the event schema, sequence, binding and evidence contract; it
does not pretend to independently verify a remote filesystem. Requests require project
write access; history reads require project read access; organization-wide orphan views
require admin access. Other tenants' identities and paths are not exposed.

A contiguous history cursor determines freshness and completeness. WBS outages do not stop
safe local cleanup; events remain in Dash's durable outbox and WBS shows stale data until
caught up. No new reserve depends on the WBS projection. Source loss or authority migration
requires a fenced recovery that preserves event identity, current holds and sequence
continuity; it cannot reset history and free capacity.

## 8. WBS storage, lifecycle and presentation

Add a resource-use projection, immutable runtime-event history and cleanup-request outbox.
They live outside the plan command journal, schedule input, saved plans and normal plan
exports. Store runtime/WBS attribution and last known labels with immutable source identity.
Mutable or missing work-item references cannot erase runtime ownership.

`removeAttempt`, step deletion, project deletion, hand-down, provider deletion and resource
deletion must preserve history and unresolved responsibility. Rebinding a moved attempt is
an attributable event; deleting a planning row leaves a tombstone attribution and an admin
recovery path. A provider/resource with unresolved uses cannot be cascade-deleted. Removing
a member or credential never cascades away its uses; recovery authority remains available.
Undo/redo restores planning data only and cannot reverse release records.

The task and attempt views show work outcome and cleanup status separately. A resources
panel lists owner, host, location, reserved units, cleanup state, blocker, retention deadline,
evidence and latest observation. History shows requested versus verified times and the
actors who requested, executed and verified. Counts include all implementation/review/
baseline copies. A completed task with a retained use says so visibly.

A green cleanup aggregate requires a sealed manifest and all uses released. Accepted
transfers produce **settled with retained resources**, not green **all resources released**.
Legacy or unregistered executions show **untracked**. Stale runtime history carries its
last observed state and an explicit age; it cannot look like a live availability reading.

## 9. Rollout and completion criteria

The first production slice manages local/SSH checkouts, temporary directories and their
processes, plus WBS tracking. Additional container/volume adapters follow the same contract
but cannot advertise coverage before their release proofs pass.

1. Ship projection schema and authenticated history reads with no automatic deletion.
2. Connect Dash reservation/settlement to managed creation, manifests, fencing and release
   reporting; complete the prerequisite control-plane admission work.
3. Prove local provider cleanup, preservation, restart recovery and shared dependencies.
4. Enable cleanup for explicitly enrolled managed roots and executions only.
5. Inventory legacy paths, record coverage and adopt a path only after identity and
   ownership verification. Unknown paths remain outside automatic cleanup.

Admission and cleanup integration must cover both harnesses and subagents before claiming
mandatory cleanup for Claude/Codex. Prompt instructions or a WBS completion checkbox alone
do not enforce it. Managed roots require enforceable creation/ownership boundaries; report
a partial coverage scope for freely running external commands.

The design is delivered when the glossary, requirements, implementation slices and proof
matrix agree and OpenSpec validates. Each runtime rollout must prove its production-path
safety checks and failure/restart scenarios before claiming that coverage. The companion
verification records state which local runtime proofs have actually run; provider and
recovery capabilities outside that coverage remain open.
