## Context

`wbs-resources` R3 made occupancy a WBS fact checked per project: `refuseOccupancy`
(`libs/wbs/domain/domain/src/occupancy.ts`) compares a leaf's ask with the project's stated
capacity minus what the project's other leaves hold, and `ClaimStore.occupancyOf(projectId)`
reads only that project's `claim_occupancy` rows. R3 and its risk list named the gap
("two projects each told 32 GB can overcommit one host … the fix is a directory-wide
`totalUnits` later"), and the startable read says `occupancyScope: 'project'`.

The swarm rehearsal of 2026-10-25 (check 4, `g4-multi.ts`) observed it on dev: one directory
resource `host ram` (16 GB, divisible) and `staging` (exclusive), each stated 16 and 1 in
projects A and B. With A holding all 16 GB, B read `[16, 0, 16]` (capacity, occupied, free),
a 16 GB claim in B answered 200, and `staging` was claimed in A and in B at once.

What already exists and this change must agree with:

- A `resource` belongs to one organization (`resource_organization`), a plan can name only
  its organization's resources (`command-references.ts` 103 to 123, proven by
  `refuses a foreign resource exactly as an absent one` and `refuses a claim asking for a
foreign resource exactly as an absent one` in `resource-organization.controller.db.test.ts`),
  and `claim_occupancy` is indexed by resource (`claim_occupancy_by_resource`).
- `claim_limit` (`wbs-organization-limits` L10) already counts across every project of the
  organization inside the claim's write turn.
- The canonical schedule input already hashes `resourceCapacities`
  (`canonical-schedule-input.ts`), and both engines already level them as pools.
- `wbs-resource-release` (in progress, not on `main`; read only) makes Dash's runtime
  reservations the authority for physical host pools and commits, in five sentences, to WBS
  claim occupancy and schedule inputs staying as they are (S9).

## Goals / Non-Goals

**Goals:** one resource's units are promised at most once across the organization's claims;
an agent's startable read and refusal say what other projects hold; the schedule never assumes
more units than exist; a resource nobody states a directory capacity for decides exactly as
today.

**Non-Goals:** portfolio levelling; guaranteed shares; physical admission and measured usage
(Dash); cross-organization sharing; push notification of foreign occupancy changes.

## Alternatives

**A. Organization-scoped occupancy in WBS against a directory capacity.** The resource
states how many units exist; a claim must fit what every project of the organization holds.
Elastic (an idle project strands nothing), one number to maintain, the startable read stays
true for agents that never touch Dash. Costs: one claim can be refused because of another
project, which raises a visibility question (S5), and undo in one project can be refused by
another (S8).

**B. Per-project shares (quotas) of a directory capacity.** The resource states a total and
each project a share, with the shares summing to at most the total; occupancy stays per
project and the check is untouched. No cross-project read, no visibility question. Costs:
units are stranded in idle shares (A idle on 8 GB while B waits), rebalancing is an admin
chore during a swarm, and the exclusive `staging` (1 unit) cannot be shared at all, only
given to one project.

**C. Dash-side host-pool admission only.** WBS stays per project; Dash refuses at run
admission (`wbs-resource-release` §6). Costs: WBS answers 200 to a claim that cannot run, so
the startable read lies to every agent; resources that are not host pools (`staging`, a
licence, a review slot) have no Dash pool; agents claiming over MCP without a Dash-managed
run never meet admission; and Dash admission is still open work (`twilight-control-plane`
tasks 4).

**Recommendation: A, with project capacity kept as a ceiling, and C kept beside it as the
physical guard.** A closes the observed gap where agents look (the claim and the startable
read), works for non-host resources, and wastes nothing; the project ceiling gives the
"at most 8 GB for project A" that B would give without stranding the rest. Dash's admission
stays necessary because declared units are not measured bytes; the two ledgers stay apart
(S9). B remains a later refinement (guaranteed minimum shares) if Dany needs isolation over
elasticity.

## Decisions

Each is **assumed, awaiting Dany**, overrulable by id.

**S1. The directory capacity is authoritative for shared occupancy (assumed, awaiting
Dany).** A new satellite `resource_directory_capacity (resource_id PK → resource, units ≥ 0)`;
a row is stated, its absence unstated. Unlike a project capacity (`docs/capacity.md`), it has
no **remembered** state: it is a fact about the resource, not about a plan's use of it, so
it is stated or not whatever any leaf demands. Which number decides what:

| Number                                | Set by                            | Decides                                                                                                                                                    |
| ------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Directory capacity                    | `setDirectoryCapacity`            | the organization-wide claim check; the schedule clamp (S7)                                                                                                 |
| Project resource capacity             | `setResourceCapacity` (unchanged) | the project's ceiling in the claim check; the project's pool in the schedule, clamped                                                                      |
| Capacity report (`compute-providers`) | Dash reporter                     | nothing; shown beside both. Adopt writes the directory capacity when one is stated, else the project capacity as today (MODIFIED `compute-provider` delta) |

Alternative: a nullable `total_units` column on `resource`. Rejected: a satellite keeps
`resource` rows and the plan export unchanged and gives `down.sql` one table to guard.

**S2. Occupancy scope is the resource's organization (assumed, awaiting Dany).** For a
resource with a stated directory capacity, the claim check reads every `claim_occupancy` row
naming that resource, joined through `claim → work_item → project_organization` and filtered
to the resource's organization. A plan already cannot name another organization's resource
(Context); the filter keeps the count right if that ever regressed. A legacy resource with no
`resource_organization` row cannot take a directory capacity: `setDirectoryCapacity` is
refused `legacy_resource`, a new member of the refusal union in
`libs/wbs/domain/contracts/src/http/refusal.ts`.

**S3. A claim must fit both scopes (assumed, awaiting Dany).** For each asked resource:
the project check as today (project capacity minus the project's other leaves), then, when a
directory capacity is stated, directory capacity minus every other leaf of the organization.
Unstated project capacity skips the first; unstated directory capacity skips the second. The
leaf's own held units never refuse it (R3's held comparison applies in both scopes). The
claim's refusal stays `resources_exhausted`; each shortage gains `scope: 'project' |
'organization'` naming the scope that bound it (the smaller free wins; on a tie,
`organization`). New refusal kinds are only on the new command (`legacy_resource`, and
`capacity_limit` reused, S10). Project capacities may sum above the directory capacity: they
are ceilings, not shares.

**S4. The check stays in the write turn and reads straight through (assumed, awaiting
Dany).** The organization-wide read runs inside the claim batch's transaction, after the
batch has taken its turn, on the batch's own connection, exactly where `claim_limit` counts;
blue and green serialise on SQLite's `BEGIN IMMEDIATE`. Rule: **a check that reads across
projects needs the source's lock to cover the organization.** ADR 0015 lets a future source
lock per project (a Postgres advisory lock on the project); such a source must take the
organization's lock (or a lock per shared resource) for a batch that claims a resource with a
directory capacity, and a source-conformance case states it. The working plan
(`working-plan.resource.ts`) fences claim-store reads to its own project and caches them
lazily; `organizationOccupancyOf` is not fenced and not cached: it reads through on every
call, so a batch that adds a claim and then claims again sees its own first add. The same
check serves claim, redo of a claim, undo of a release and undo of a delete
(`refuseOccupancy` stays the one check, now given both row sets).

**S5. Directory units are an organization fact; holders are named only to readers who may
read them (assumed, awaiting Dany).** `wbs-permissions` makes an ungranted project absent
(404, not listed). This is a deliberate carve-out for Dany to confirm in 0.1: **the units
held of a resource with a directory capacity are an organization fact**, so every reader of a
project that uses the resource sees the total held elsewhere, as `elsewhere: { units }` per
resource, units only: no claim count, project id, project name, person, run or work item. A
holder in a project the reader may read is named in full and carries `projectId`. The
predicate is a new production `mayReadProjectWithin(access, projectId)` on
`ports/organization-access.ts`, which today answers true for every project of the caller's
organization (every member reads every project) and false otherwise; `wbs-permissions`
replaces its body with the grant check. Until a grant can deny, the redaction has no
production-path negative (only a port-seam negative), and verify.md says so. A machine
principal is judged by its own grants (`wbs-machine-credentials` A23).

**S6. The startable read states scope per resource (assumed, awaiting Dany).** Each entry of
`resources` gains `occupancyScope: 'project' | 'organization'`, `directoryCapacity`,
`occupiedElsewhere` and `free` = the smaller of the two scopes' free units; `doesNotFit`'s
`exhausted` gains `scope`. The top-level `occupancyScope` widens to
`'project' | 'organization' | 'mixed'`. A resource with a directory capacity is listed only
when the project demands it on some leaf or states a capacity for it, so an organization with
forty shared resources does not list forty in every project. The MCP description sentence
"claims in other projects on the same host are not subtracted" becomes per resource.

**S7. Engines are unchanged; the input is clamped once (assumed, awaiting Dany).** R5 stands:
no schedule reads a claim, an occupancy or another project's plan. One function,
`effectivePoolSizesOf(projectCapacities, directoryCapacities)`, gives each resource's pool:
the project capacity clamped to the directory capacity when both are stated, the directory
capacity when only it is stated and the project demands the resource, else as today. A
directory capacity of 0 clamps the pool to 0, which per the `wbs-resources` zero-capacity
risk constrains no date (demands clamp to the pool) while the claim path refuses every unit.
No contract bump: `resourceCapacities` is already in the canonical input and its hash, so the
clamped numbers change the hash exactly where a directory capacity changes a pool. The
function is called at every place a schedule input is built (tasks 6.1 lists them: the four
`canonicalScheduleParts` callers in `work-item.resource.ts`, `saved-plan-capture.ts`,
`chain-snapshot.ts`, the memory twins in `store-memory/src/source.ts`, both
`saved-plan-schedule.ts`, and `publication-guard.ts`), so a saved plan's hash and the live
hash agree. A `setDirectoryCapacity` does not announce schedule changes to the organization's
projects; their next read recomputes (Risks). Consequence, stated not hidden: two projects'
schedules may each plan the whole 16 GB on the same day; the claim path enforces the share.
Alternative: portfolio levelling. Rejected for v1: one project's dates would move on another's
edit and the hash would span projects.

**S8. Undo, redo, lease expiry and removal cross projects (assumed, awaiting Dany).** An
undo of a release, an undo of a delete that restores claims (`withClaimsRestored`) or a redo
of a claim in A may be refused `stale_undo` with detail `resources_exhausted:` because of B;
the detail names the scope. An undo of a cascading release re-acquires leaf by leaf through
the one check, all or nothing. A release or lease sweep in A frees units for B.
`deleteResource`'s `in_use` counts include the directory capacity; the cascade drops it.

**S9. This change supersedes five sentences of `wbs-resource-release` (assumed, awaiting
Dany).** That change commits to: no change to WBS claim occupancy (proposal line 23); WBS holding
no competing capacity ledger (proposal line 32); scheduling hashes intact (design line 39);
WBS's project-scoped occupancy unchanged (design lines 181 to 182); claim occupancy and
schedule inputs keeping their semantics (`resource-release` spec lines 126 to 127). For
resources with a directory capacity, this change alters occupancy's scope and the clamped
schedule input, so it supersedes those five sentences. Whichever
change lands second amends the other's sentences; 0.1 asks that change's owner to agree. What
does not change: WBS's ledger is **logical** (declared units, counted at claim time) and
deliberately separate from Dash's **physical** one (reservations, measured bytes); neither
adds the other's numbers, and Dash admission never reads WBS occupancy. They can disagree in
both directions: WBS may admit a claim that then waits at Dash's admission (the host is
physically fuller than declared, or reservations outlive the claim during cleanup), and Dash
may have headroom WBS refuses (declared demands exceed real use, or a released claim's
reservation is gone while the directory capacity was set low). Each side shows its own
number with its own label.

**S10. Organization limits follow the directory capacity (assumed, awaiting Dany).**
`maxCapacityUnitsPerResource` (`wbs-organization-limits` L2) bounds `setDirectoryCapacity`.
While a directory capacity is stated, L2's sum over project capacities no longer applies
(ceilings may overlap) and each `setResourceCapacity` is checked alone: units ≤ cap. Clearing
a directory capacity whose resource's project capacities sum above the cap is refused
`capacity_limit` unless the command carries `confirm: true` (the sum is then held as L11
holds a lowered cap: nothing is reclaimed, new raises are refused). The usage read's
`capacityUnits` reports the directory capacity for a resource that states one, else the sum
as today.

**S11. Who sets a directory capacity, and its audit (assumed, awaiting Dany).** Organization
admins and super-admins only, through the directory command route, not journalled: it
constrains every project of the organization, as removal does (R8a). Agents act as at most
members, so no agent sets it. Every write is one `organization_audit` row,
`directory_capacity_changed` on subject kind `resource`; the action and subject kind are
CHECK-constrained, so this needs a compatible table rebuild (Migration).

**S12. Lowering or clearing lists what it affects; holders can be found and released
(assumed, awaiting Dany).** Under Dany's rule to list what breaks before a config change,
`setDirectoryCapacity` takes `dryRun: true` and answers, without writing, the projects that
use the resource (readable ones named, others as one count), the units each holds, the
resulting free units and any S10 refusal. Lowering below what is held strands nothing: held
units stay held and new claims are refused until it drains. The directory resource read gives
an admin occupancy per project with each holding claim (person, run, work item, claimed at,
lease expiry or none), and says who may release it: the claimant's bound account or an
organization admin (`wbs-team-claims` D5). Human claims have no lease and never expire, so
this view is how an admin unblocks a swarm stuck behind one.

## Migration

Two migrations, each with a guarded `down.sql` and a migration-lint pass:

1. `<ts>_widen_organization_audit_directory_capacity`: the compatible rebuild of
   `organization_audit` that `20261022140100_widen_organization_audit_compute_providers` did,
   carrying the full current vocabulary plus action `directory_capacity_changed` and subject
   kind `resource`; `down.sql` refuses while any row uses the new values. (Issue #632, a
   rebuild-free vocabulary mechanism, is still open; if it lands first this becomes a
   vocabulary row.)
2. `<ts>_add_resource_directory_capacity`: create `resource_directory_capacity` with the
   `units` CHECK and the cascade from `resource`; `down.sql` refuses while any row exists.

An outgoing release ignores the new table, so during a blue/green swap the old process checks
per project only; the operator states directory capacities after the swap completes (runbook
line, task 7.4), and the new release counts every row the old one wrote, so the promise
converges once the old process stops.

## What "no change" means

With no directory capacity stated, these are unchanged: every claim decision and refusal
reason, every occupied, free and capacity number, every schedule and schedule hash, the plan
export and the plan document. The reads gain fields: `projectId` on holders, `scope` on
shortages and `exhausted`, `occupancyScope`, `directoryCapacity` and `occupiedElsewhere` on
startable entries, `directoryCapacity: null` on resource reads. Tests compare the unchanged
projections, not whole bodies.

## Risks / Trade-offs

- **A project is refused by work it cannot see.** Mitigated by `elsewhere` units and the scope
  on the refusal; accepted as the price of elasticity.
- **Stranding behind dead claims.** Human claims never expire, and the lease sweep runs every
  30 s over at most 50 projects per tick (`wbs-claim-leases` L7), so an organization with many
  projects frees an expired agent's units up to several ticks late, across projects. S12's
  admin view is the remedy; the lag is accepted.
- **Hot read on large organizations.** One indexed query per asked resource inside the write
  turn; measured in task 3.5 against a 50-project fixture.
- **Schedules overpromise across projects (S7)**, and a directory-capacity edit announces
  nothing: open plans of other projects show stale dates until their next read.
- **Declared units still lie** about physical use; Dash measures and admits (S9).
- **Stale foreign occupancy in an open browser** until the next read (no push, non-goal).
