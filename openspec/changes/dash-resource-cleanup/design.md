# Managed local resource runtime

The broader [resource-release design](../wbs-resource-release/design.md) defines the target
model. This change records the concrete local implementation and transport contracts.

## Authority and storage

Dash owns a dedicated canonical directory, an owner-only configuration and a fixed SQLite
ledger beneath `.dash`. The ledger binds the root's identity, authority id, epoch, provider
and disk-unit scale. Multiple projects reserve from this one pool. Initialization is explicit;
a missing ledger cannot silently reset capacity. Creation intent and capacity reservation
precede the filesystem effect. Every physical copy has a distinct use and incarnation.

Before creating a path, Dash must obtain durable WBS admission of its exact attribution.
It saves an immutable admission intent with local revision 0 and reserves capacity first.
`PUT /api/resource-authorities/:authorityId/admissions` accepts `eventId`, `epoch`, `useId`,
`incarnation`, `observedAt`, `reason`, and the same immutable `use` declaration as events.
The exact live bound credential and current account/person ownership are rechecked inside
its write transaction. Missing or foreign planning references refuse. Successful admission
stores the registered attribution/history immediately, with `runtimeRevision: 0`, and returns
`{eventId, useId, incarnation}`. The immutable registration history fingerprint stores the
complete admission envelope and authority identity; it has no planning-reference cascade.
Admission replay compares that envelope and returns the original receipt without resolving
deleted planning references or overwriting newer projection/request revisions.

Only after validating that receipt does Dash allocate the ordered `registered` event at
source revision 1 or create any directory. WBS confirms the exact admitted envelope, inserts
its runtime source-progress row at revision 1, and advances source metadata without duplicating
registration history. Provisional admission deliberately has no `resource_runtime_use` row;
this named phase is recognized only through the original admitted registration response and
exact immutable history. Resource/provider deletion already guards the outstanding runtime
use. An operator or ended-attempt request may carry expected source revision 0 and remains
pending through ordered confirmation. The existing migrations remain unchanged.

New allocations therefore require WBS availability. An ambiguous or rejected admission stays
charged at local revision 0 with no physical path and no ordered event. Failures seal the
intent for retry; a dead creator is also recoverable. A live creator waiting for admission is
not recovered by a concurrent watcher. Recovery replays the exact admission, then queues
cleanup and verifies noncreation instead of recreating work. It never skips a rejected source
event, invents missing attribution, or frees an unknown hold. A persistently refused admission
needs operator repair and remains charged, but cannot occupy an authority sequence or prevent
publication of already admitted uses. Already admitted local cleanup remains independent of
WBS availability.

The configured budget and measured available space minus headroom gate admission. Every
unreleased use consumes its disk allowance and workspace slot. Reservation release and an
immutable publication-outbox event commit atomically after verified removal or verified
noncreation. `reclaimedBytes: null` expresses the absence of attributable byte measurement.

## Execution and cleanup

Managed commands run with recorded Linux boot/process-start identity and an owned process
group. Completion, failure and cancellation request cleanup; reconciliation handles a dead
owner after restart. A watch loop services pending uses and WBS requests. Cleanup never
uses age alone as authority, never treats a PID alone as ownership, and never accepts an
arbitrary path from WBS as a deletion instruction.

The provider verifies target incarnation, root containment, dependencies and live process
references. Disposable directories contain explicitly disposable output. Git worktrees
preserve commits through durable recovery references; dirty, untracked or required ignored
work is retained for its responsible owner. Any assume-unchanged or skip-worktree index
entry is conservatively retained before generated-output preparation: Git status and normal
worktree removal both hide modifications under these legitimate flags. Sparse worktrees
therefore require owner review rather than automatic cleanup. Explicit `disposablePaths` may designate
untracked generated directories such as `node_modules`; tracked source within those paths
must refuse the policy. Shared hardlinks remain a blocker without an accounted continuing
storage owner. For this Bun-based repository, `bun install --backend=copyfile` provides an
owned-output installation mode (confirmed by the installed Bun's help); ordinary Bun
hardlinked installations must not be advertised as covered automatic deletion. Replacement paths and inaccessible required
inspection remain blocked and charged. Evidence is stored outside the disposable target.

The supported execution environment is a dedicated runtime user whose same-user processes
are inspectable. This is a cooperating-workload boundary, not protection from arbitrary
hostile code with the same UID. Do not hide host PIDs to make a production preflight pass.

## WBS transport

An organization admin binds an authority with
`PUT /api/organization/resource-authorities/:authorityId` using
`{providerId, credentialId, epoch}`. The epoch is a nonempty string. An identical binding
can replay; replacing an existing binding is refused. Admin GET at the same path exposes
binding identity and accepted sequence. Recovery must preserve this ledger/identity;
credential replacement and authority migration need an explicit future recovery operation.

`PUT /api/resource-authorities/:authorityId/events` ingests a credential-bound event.
Events carry `eventId`, `epoch`, ordered `sequence`, `useId`, `incarnation`, runtime
`revision`, `kind`, `observedAt`, `reason`, optional `requestId`, and immutable attribution.
Kinds are `registered`, `cleanup_pending`, `blocked`, `retained`, `release_verified`.
Verified release requires evidence with digest, durable locator, disposition
`removed | not_created`, and nullable measured reclaim. WBS validates authority and
provenance; it does not independently inspect the remote filesystem.

`GET /api/resource-authorities/:authorityId/cleanup-requests?after=&limit=` returns
`{requests, nextCursor}`. Each request has `requestId`, `useId`, `incarnation`,
`expectedRevision`, `reason`, `at`. Dash persists request consumption with cleanup intent
before advancing its cursor. An event acknowledges the request in WBS atomically with its
projection. Lost acknowledgments replay the same identity. A late request for a terminal
use reuses the complete first release envelope's evidence, including its original locator,
through restart; it performs no removal or reservation settlement again.

Ordinary project writes can request cleanup of runtime-owned uses, but cannot declare them
released, blocked or retained. The use read's `pendingCleanupRequest` denotes unacknowledged
intent, while `state` remains the runtime's last observation. Runtime revision is independent
of WBS projection revision, so operator requests do not break ordered runtime ingestion.
Reported uses retain their explicitly reported lifecycle and are never upgraded by inference.

## Coverage and acceptance

The commands and provider tests must demonstrate real creation/removal, retained work,
blocked live writers, crash recovery, reservation conservation, replay and WBS outage.
The user-facing runbook must identify how Claude/Codex are launched through management and
how additional subagent/review copies enter the same ledger. Unmanaged native copies remain
untracked; neither a green parent task nor a prompt instruction certifies their cleanup.
