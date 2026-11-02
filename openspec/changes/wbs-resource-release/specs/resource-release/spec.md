## ADDED Requirements

### Requirement: Managed resource uses are registered before creation

The runtime SHALL persist each resource-creation intent and reserve its complete capacity
vector before executing the effect. Each use SHALL carry immutable authority, organization,
incarnation and runtime-attempt identity, WBS attribution when bound, provider-verifiable
target identity, current owner and dependencies. Each physical implementation, review or
baseline copy SHALL have its own use even when the copies belong to one WBS leaf.

#### Scenario: Two copies on the same leaf

- **WHEN** implementation and review create separate checkouts for the same leaf
- **THEN** both uses and their respective disk and workspace reservations appear in WBS;
  the leaf's single logical occupancy does not collapse the physical uses

#### Scenario: Creation succeeded but its acknowledgment was lost

- **WHEN** a provider creates a checkout and the caller times out before observing success
- **THEN** its persisted intent and reservation remain until reconciliation establishes
  the original target's state, without creating a duplicate use or freeing capacity

### Requirement: Cleanup is mandatory after every managed execution

Success, failure, cancellation, loss of ownership and explicit cleanup requests SHALL lead
to durable settlement work independent of the worker's continued availability. The
controller SHALL fence creation before sealing the attempt's resource manifest. Work outcome
and duration SHALL remain separate from cleanup outcome and duration. Missing manifests
SHALL render untracked, not clean.

#### Scenario: Successful work leaves a checkout

- **WHEN** an attempt succeeds while its registered checkout still exists
- **THEN** WBS records the successful work and cleanup pending, and the checkout's runtime
  reservation remains charged until verified release or accepted transfer

#### Scenario: Worker crashes and its claim expires

- **WHEN** the worker crashes, its claim lease expires and WBS releases the claim
- **THEN** Dash reconciles the registered uses with its own cleanup authority, and no
  runtime capacity is freed solely because the WBS claim disappeared

#### Scenario: Empty and missing manifests differ

- **WHEN** one managed attempt seals an empty creation manifest and a legacy attempt has none
- **THEN** the first reads not required and the second reads untracked

### Requirement: Provider evidence decides release

The runtime SHALL release only reservation entries whose provider-specific postconditions
are verified under the current cleanup generation. It SHALL distinguish removed, returned,
not-created and externally verified dispositions. Process exit SHALL prove only the
identified process's termination. A shell exit code, lease expiry or directory age SHALL
NOT prove resource release.

#### Scenario: Process stops while a volume survives

- **WHEN** a container's process is confirmed stopped but its persistent volume remains
- **THEN** the proven execution entries can release while the volume remains charged and
  appears separately in WBS

#### Scenario: A workspace returns to its reusable pool

- **WHEN** old access is removed and the workspace's reset and availability are verified
- **THEN** its execution reservation is released as returned while its storage remains
  charged to the continuing pool owner and no deleted-byte claim is made

#### Scenario: An unlinked file is still open

- **WHEN** a temporary file's directory entry is removed but an owned process holds it open
- **THEN** its disk charge remains until provider evidence verifies the remaining hold ended

### Requirement: Destructive cleanup preserves required work and excludes writers

Before destructive cleanup, the controller SHALL verify preservation of required work and
evidence, stop or exclude all writers, verify exact target identity and containment, and
resolve dependencies. Identity and dependency checks SHALL remain protected through the
effect. Failure or unreadability of a required check SHALL block release.

#### Scenario: Uncommitted work cannot be preserved

- **WHEN** a checkout has unique staged, unstaged or untracked source and its recovery
  destination cannot be written or verified
- **THEN** cleanup is blocked, the original checkout remains and the reservation stays held

#### Scenario: The locator now names a replacement

- **WHEN** a cleanup retry finds a different incarnation at the original path
- **THEN** it refuses to remove the replacement and reconciles the original use separately

#### Scenario: A writer changes files after the first inspection

- **WHEN** a live writer can still modify the checkout after the preservation inspection
- **THEN** cleanup cannot proceed until access is excluded and preservation reverified

### Requirement: Dependencies and retention preserve charged ownership

The controller SHALL refuse to remove a use while dependent uses need it. Retention SHALL
record an owner, reason, review deadline and capacity responsibility. Transfer SHALL require
receiver acceptance and atomically preserve the physical charge. Retention deadlines SHALL
request review without treating age as deletion authority. Preservation copies SHALL be
tracked and charged too.

#### Scenario: A retained review clone borrows Git objects

- **WHEN** a review clone borrows its parent's Git object store and the parent requests cleanup
- **THEN** the parent remains charged and blocked until the dependency ends or is migrated
  and verified; the review clone continues to read its objects

#### Scenario: A dependency symlink points through a disposable copy

- **WHEN** a retained checkout's dependencies are reached through another checkout's symlink
- **THEN** cleanup preserves the effective target or verifies a new route before removing
  the intermediate checkout

#### Scenario: Evidence is retained after work

- **WHEN** the evidence owner accepts a checkout or backup with a reason and review deadline
- **THEN** original and receiving ownership are recorded, capacity stays charged without a
  gap or duplicate charge, and WBS reports retained/transferred rather than disk freed

### Requirement: Runtime holds survive logical claim release

Pending, running, blocked, unknown and retained resource uses SHALL continue to charge
their unreleased runtime reservation entries. Runtime admission SHALL count these entries
across projects sharing a canonical physical pool. WBS claim occupancy and schedule inputs
SHALL keep their existing semantics, except as `wbs-shared-occupancy` changes them for a
resource with a directory capacity, and remain clearly distinguished from runtime capacity.

#### Scenario: A new project tries to consume cleanup-pending disk

- **WHEN** project A's claim has ended but its cleanup-pending uses hold the remaining
  managed disk budget, and project B requests that pool
- **THEN** Dash refuses or queues B's runtime admission while WBS may separately report that
  B fits its declared project capacity

#### Scenario: Two provider aliases refer to the same host

- **WHEN** concurrent requests reach different aliases for the same physical pool
- **THEN** one authority serializes reservations against the same capacity and cannot
  allocate the final available unit twice

### Requirement: Released units and reclaimed bytes are distinct

History SHALL identify units returned per reservation and resource. Physical bytes reclaimed
SHALL be reported only when attributable evidence supports them; unavailable measurements
SHALL stay explicitly unavailable. Host free-space observations SHALL NOT be attributed
wholesale to one cleanup. Shared, retained or open-held bytes SHALL remain charged.

#### Scenario: Shared blocks survive checkout removal

- **WHEN** a checkout is removed but shared blocks remain owned by a retained store
- **THEN** its workspace slot can release, the continuing storage charge remains, and WBS
  does not equate the checkout's reservation with physically reclaimed bytes

### Requirement: Release is durable and idempotent

The runtime SHALL atomically persist a verified release event, settle exactly its proven
reservation entries and enqueue publication. Every event SHALL bind its authority epoch,
use incarnation, current revision and ordered source sequence. Repeated operations SHALL
reconcile the same intent, and stale owners SHALL NOT release replacements.

#### Scenario: Crash after deletion before recording release

- **WHEN** the controller crashes after removing the original target but before committing
  the release event
- **THEN** recovery checks the persisted intent and original identity, records one release
  after verifying its postconditions, and never removes a replacement

#### Scenario: Duplicate delivery

- **WHEN** the same committed release is delivered twice
- **THEN** WBS stores one event and the runtime frees the reservation entries once

#### Scenario: Superseded cleanup owner returns

- **WHEN** an old cleanup generation submits a release after recovery assigned a new owner
- **THEN** the stale mutation is refused without changing the replacement's reservation

### Requirement: WBS tracks requests and verified history separately

WBS SHALL expose current resource uses, immutable lifecycle history and durable cleanup
requests. History SHALL show attribution, request/execution/verification actors, reasons,
times, evidence references, retained ownership and released units. Request acceptance SHALL
NOT report cleanup success. Runtime events SHALL be outside undoable plan commands.

#### Scenario: Cleanup request is queued

- **WHEN** a project writer requests cleanup while its runtime is offline
- **THEN** WBS persists and displays the pending request without reporting release or
  changing runtime capacity

#### Scenario: Work succeeded but cleanup failed

- **WHEN** an attempt succeeded and cleanup encounters a provider permission error
- **THEN** WBS shows succeeded work and blocked cleanup with its reason and owner

#### Scenario: Claim release is undone

- **WHEN** an operator undoes a WBS claim release after its checkout was removed
- **THEN** logical claim reacquisition follows existing rules and no physical release record
  is undone or deleted; new execution requires new runtime admission

### Requirement: Release reporting is authority-scoped

WBS SHALL accept lifecycle events only from an explicitly bound reporting authority for the
organization and provider. It SHALL enforce event identity, contiguous ordering, schema,
revision and evidence-reference contracts. Ordinary worker credentials SHALL NOT certify
release. Reads and requests SHALL obey project access and orphan views require organization
administration access.

#### Scenario: A worker reports its own unverified release

- **WHEN** an ordinary agent credential submits a verified-release event
- **THEN** WBS refuses the event and neither the history nor current-use projection changes

#### Scenario: An event skips registration

- **WHEN** a reporting authority submits a release with a missing earlier source sequence
- **THEN** ingestion refuses the gap and requests reconciliation instead of showing a
  resource as released without its ownership history

#### Scenario: Another tenant requests the resource

- **WHEN** a caller outside the owning organization reads or mutates a resource use
- **THEN** no target identity, location or history is disclosed and no mutation occurs

### Requirement: Disconnection and deletion preserve responsibility

WBS downtime SHALL NOT prevent safe local cleanup; the runtime SHALL retain its publication
outbox until acknowledgment. WBS SHALL display history freshness. Removing or moving WBS
planning references SHALL preserve attribution and unresolved ownership. Providers and
resources with unresolved uses SHALL NOT be cascade-deleted. Missing runtime state SHALL
NOT be interpreted as released capacity.

#### Scenario: Runtime cleans up while WBS is unavailable

- **WHEN** verified cleanup completes during a WBS outage
- **THEN** the local reservation settles once, its event remains in the outbox, and WBS
  receives the history after reconnecting while displaying stale state beforehand

#### Scenario: An attempt is removed from the plan

- **WHEN** a WBS attempt or its work item is removed while a managed checkout survives
- **THEN** runtime responsibility and event history remain under immutable attribution,
  with an authorized recovery view rather than cascading deletion

#### Scenario: The provider record is removed with cascade

- **WHEN** an administrator requests cascading provider removal while unresolved uses remain
- **THEN** the operation refuses with the outstanding uses instead of erasing cleanup debt

### Requirement: Coverage and cleanup completion are explicit

A fully released cleanup aggregate SHALL require a sealed managed manifest and verified
release of all its resource entries. Accepted transfers SHALL read settled with retained
resources. Unregistered paths SHALL never be automatically deleted merely because they are
old. Coverage SHALL state which harnesses, roots and provider kinds are managed.

#### Scenario: An old unregistered repository is discovered

- **WHEN** inventory discovers a repository outside the managed creation records
- **THEN** it reports untracked ownership and requires verified adoption before automatic
  cleanup; age alone does not authorize removal

#### Scenario: Retention completes the original handoff

- **WHEN** every original use is released or transferred to an accepting continuing owner
- **THEN** the attempt can settle, but any transferred uses remain visible and charged and
  WBS does not display all resources released

#### Scenario: A harness bypasses managed creation

- **WHEN** an executor can create checkouts outside the registered managed roots
- **THEN** the system reports partial coverage and cannot claim mandatory cleanup for that
  executor until its creation and ownership boundaries are enforced
