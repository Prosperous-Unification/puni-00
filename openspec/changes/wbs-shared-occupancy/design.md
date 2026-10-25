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
- `wbs-resource-release` (on `main` since #735, 2026-10-25) makes Dash's runtime
  reservations the authority for physical host pools and commits, in six sentences, to WBS
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
refused with the existing `organization_required` (`refusal.ts`), as a measure definition is.

**S3. A claim counts against both scopes (assumed, awaiting Dany).** For each asked resource:
the project check as today (project capacity minus the project's other leaves), then, when a
directory capacity is stated, directory capacity minus every other leaf of the organization.
Unstated project capacity skips the first; unstated directory capacity skips the second. The
leaf's own held units never refuse it (R3's held comparison applies in both scopes). The
claim's refusal stays `resources_exhausted`; each shortage gains `scope: 'project' |
'organization'` naming the check that bound it (the smaller free wins; on a tie,
`organization`). The claim gains no refusal kind; the new command reuses
`organization_required`, `forbidden` and `capacity_limit`. Project capacities may sum above
the directory capacity: they are ceilings, not shares.

**S4. The check stays in the write turn and reads straight through (assumed, awaiting
Dany).** The organization-wide read runs inside the claim batch's transaction, after the
batch has taken its turn, on the batch's own connection, exactly where `claim_limit` counts;
blue and green serialise on SQLite's `BEGIN IMMEDIATE`. A source that locks less than the
whole store, which ADR 0015 allows, must make its lock cover the organization for such a
batch; task 3.3 writes that rule into ADR 0015 as an amendment, where it belongs (R3). The
working plan (`working-plan.resource.ts`) fences claim-store reads to its own project and
reads them through, uncached; `organizationOccupancyOf` is a new unfenced read that also reads
through. The same check serves claim, redo of a claim, undo of a release and undo of a delete
(`refuseOccupancy` stays the one check, now given both row sets).

**S5. Units held of a shared resource are an organization fact; holders are named only to
readers who may read them (assumed, awaiting Dany).** `wbs-permissions` makes an ungranted
project absent (404, not listed). This is a deliberate carve-out for Dany to confirm in 0.1:
**the units held of a resource with a directory capacity are an organization fact**, so a
reader of a project that uses the resource sees the units held in projects it may not read,
as `hiddenHolders: { units }` per shortage, with no claim count, project id, project name,
person, run or work item. A holder in a project the reader may read is named in full and
carries `projectId`. The predicate is a new port method
`OrganizationAccess.mayReadProjectWithin(project, actorId, access)`, in
`mayEditProjectWithin`'s argument order, whose `project` carries its `organizationId` (the
occupancy query joins `project_organization`, so every holder row arrives with it). Its
production body answers true for every project of the caller's organization (every member
reads every project today) and false otherwise; `wbs-permissions` replaces the body with the
grant check, and the grants that judge a machine principal are that change's. Until a grant
can deny, the redaction has no production-path negative, only a port-seam one: an R5
exception that 0.1 asks Dany to waive explicitly.

**S6. The startable read keeps its contract and adds per-resource scope (assumed, awaiting
Dany).** The top-level `occupancyScope` stays the literal `'project'` (`startable-shapes.ts`
and every client that validates responses accept nothing else); it now means "every resource
is counted within the project", which stays true, since S3 always applies the project check.
Each entry of `resources` gains `occupancyScope: 'project' | 'organization'` (the widest
scope it is counted in) and `directory: { capacity, occupied, free } | null`, where
`occupied` is held by every leaf of the organization, this project's included. Under
organization scope `capacity` is the project's stated capacity, or the directory capacity
when the project states none; `occupied` stays this project's leaves; `free` is the smaller
of the project's free units (when stated) and `directory.free`. `doesNotFit`'s `exhausted`
gains `scope`. A resource with a directory capacity is listed only when the project demands
it on some leaf or states a capacity for it. The project resources read carries
`directoryCapacity` and the same `directory` totals, never holders: it is readable by
viewers and is not where an agent decides to claim.

**S7. Engines are unchanged; the input is clamped once (assumed, awaiting Dany).** R5 stands:
no schedule reads a claim, an occupancy or another project's plan. One function,
`effectivePoolSizesOf(projectCapacities, directoryCapacities, demandedResourceIds)`, gives
each resource's pool: the project capacity clamped to the directory capacity when both are
stated, the directory capacity when only it is stated and the project demands the resource,
else as today. A directory capacity of 0 clamps the pool to 0, which per the `wbs-resources`
zero-capacity risk constrains no date (demands clamp to the pool) while the claim path
refuses every unit. `resourceCapacities` is already in the canonical input and its hash, so
the clamped numbers change the hash exactly where a directory capacity changes a pool, with
no contract bump. A saved plan captures the raw facts, `directoryCapacities` beside
`resourceCapacities` in `PlanInputReads` on the same snapshot, and clamps through the same
function when it schedules, as it already captures raw project capacities; so a saved plan
keeps the directory capacity it was captured under. Task 6.1 lists every call site. Every
`setDirectoryCapacity` publishes `directory_changed` to each project that demands or states
the resource, through `DirectoryService.announce`, the path every directory resource write
takes; the publication moves each project's event sequence, so the `RollUpCache` key and
open plans recompute. Consequence, stated not hidden: two projects' schedules may each plan
the whole 16 GB on the same day; the claim path enforces the share. Alternative: portfolio
levelling. Rejected for v1: one project's dates would move on another's edit and the hash
would span projects.

**S8. Undo, redo, lease expiry and removal cross projects (assumed, awaiting Dany).** An
undo of a release, an undo of a delete that restores claims (`withClaimsRestored`) or a redo
of a claim in A may be refused `stale_undo` with detail `resources_exhausted:` because of B;
the detail names the scope. An undo of a cascading release re-acquires leaf by leaf through
the one check, all or nothing. A release or lease sweep in A frees units for B.
`deleteResource`'s `in_use` counts include the directory capacity; the cascade drops it.

**S9. This change supersedes six sentences of `wbs-resource-release` (assumed, awaiting
Dany).** That change commits to: no change to WBS claim occupancy (proposal line 23); WBS holding
no competing capacity ledger (proposal line 32); claim occupancy retaining its current
semantics (design line 34); scheduling hashes intact (design line 42); WBS's project-scoped
occupancy unchanged (design lines 185 to 186, as amended); claim occupancy and schedule inputs keeping
their semantics (`resource-release` spec lines 126 to 127). For resources with a directory
capacity, this change alters occupancy's scope and the clamped schedule input, so it
supersedes those six sentences. `wbs-resource-release` landed first (#735), so this change
amends them: each now carries a pointer here, and the spec sentence an exception for a
resource with a directory capacity. 0.2 still asks that change's owner to agree. What does not change: WBS's
ledger is **logical** (declared units, counted at claim time) and deliberately separate from
Dash's **physical** one (reservations, measured bytes); neither adds the other's numbers, and
Dash admission never reads WBS occupancy. They can disagree in both directions: WBS may admit
a claim that then waits at Dash's admission (the host is physically fuller than declared, or
reservations outlive the claim during cleanup), and Dash may have headroom WBS refuses
(declared demands exceed real use, or the directory capacity was set low). Each side shows its
own number with its own label.

**S10. Organization limits follow the directory capacity (assumed, awaiting Dany).**
`maxCapacityUnitsPerResource` (`wbs-organization-limits` L2) bounds `setDirectoryCapacity`,
refused `capacity_limit` with `CapacityLimitRefusalDetail { resourceId, cap, declared: 0,
asked: units }`. While a directory capacity is stated, L2's sum over project capacities no
longer applies (ceilings may overlap) and each `setResourceCapacity` is checked alone
(`declared: 0`). Clearing a directory capacity whose resource's project capacities sum above
the cap is refused `capacity_limit` with `{ resourceId, cap, declared: <that sum>, asked: 0 }`
unless the command carries `confirm: true` (the sum is then held as L11 holds a lowered cap:
nothing is reclaimed, new raises are refused). The usage read's `capacityUnits` reports the
directory capacity for a resource that states one, else the sum as today, each entry with
`countedFrom: 'directory' | 'projects'` (not `source`, which the read's top level already
uses).

**S11. Who sets a directory capacity, on which routes, and its audit (assumed, awaiting
Dany).** `setDirectoryCapacity { resourceId, units | null, confirm?: true }` is accepted on
both routes that carry directory commands, `POST /api/directory/commands` and
`POST /api/projects/:id/commands`, in all-or-none batches like every other command, and the
admin check sits in the one function both paths take, as R8a's removal check does. Allowed:
an organization admin or super-admin, in a browser session or through their own MCP session
(an MCP delegation consented as themselves keeps their role, authentication kind `upstream`),
exactly as R8a's removal allows. Refused `forbidden`: every other role, and every agent: a
machine credential and an MCP consent delegation that acts as an agent person
(authentication kind `consent`) both resolve as at most a member through
`organizationRoleOf` (`wbs-machine-credentials` A23), whatever their account's role. So the
check is the role check alone, as `mayRemoveResourceInOrganization` is; no `scope.delegated`
check. (Dany may choose the stricter rule, refusing a human's own MCP session too; then R8a
should change with it, so both organization acts keep one rule.) Not journalled. Every write
is one `organization_audit` row, `directory_capacity_changed` on subject kind `resource`; the
action and subject kind are CHECK-constrained, so this needs a compatible table rebuild
(Migration).

**S12. Previewing a change and finding the holders (assumed, awaiting Dany).** Under Dany's
rule to list what breaks before a config change, and both admin-only (others `forbidden`,
agents included, by the same role check as S11):

- `POST /api/organization/resources/:resourceId/directory-capacity/preview`, body
  `{ units: number | null }`, writes nothing and answers `{ resourceId, before, after,
projects: [{ projectId, name, units }], hiddenProjects: { count, units }, free, refusal:
null | { error, ...detail } }`: readable projects named, the others counted, `free` after
  the change, and the refusal the write would meet (`capacity_limit` with its detail).
- `GET /api/organization/resources/:resourceId/occupancy` answers `{ resourceId,
directoryCapacity, occupied, free, projects: [{ projectId, name, restricted, units, claims:
[{ claimId, personId, personName, runId, workItemId, claimedAt, leaseExpiresAt,
releasableBy }] }] }`, where `releasableBy` is `claimant_or_admin` for an unrestricted
  project and `claimant` for a restricted one: an admin may not write a restricted project
  (`canEditProjectInOrganization`), and the super-admin's audited recovery override is not
  built (organization ownership task 3.7). Human claims have no lease and never expire, so
  this read is how an admin finds what stalls a swarm.

Lowering below what is held strands nothing: held units stay held and new claims are refused
until it drains.

## Migration

Two migrations, each with a guarded `down.sql` and a migration-lint pass:

1. `<ts>_widen_organization_audit_directory_capacity`: the compatible rebuild of
   `organization_audit` that `20261022140100_widen_organization_audit_compute_providers` did,
   carrying the full current vocabulary plus action `directory_capacity_changed` and subject
   kind `resource`; `down.sql` refuses while any row uses the new values. (Issue #632, a
   rebuild-free vocabulary mechanism, is still open; if it lands first this becomes a
   vocabulary row.)
2. `<ts>_add_resource_directory_capacity`: create `resource_directory_capacity` with the
   CHECK `typeof(units) = 'integer' AND units >= 0` (as `project_resource_capacity`'s) and
   the cascade from `resource`; `down.sql` refuses while any row exists.

An outgoing release ignores the new table, so during a blue/green swap the old process checks
per project only; the operator states directory capacities after the swap completes (runbook
line in `docs/runbook-prod-deploy.md` and `docs/runbook-dev-deploy.md`, task 7.4), and the new release counts every row the old one wrote, so the promise
converges once the old process stops.

## What "no change" means

With no directory capacity stated, these are unchanged: every claim decision and refusal
reason, every occupied, free and capacity number, the startable read's top-level
`occupancyScope`, every schedule and schedule hash, the plan export and the plan document.
The reads gain fields: `projectId` on holders, `scope` and `hiddenHolders` on shortages,
`scope` on `exhausted`, `occupancyScope` and `directory` on startable entries,
`directoryCapacity` and `directory` on the project resources read, `countedFrom` on the
limits usage. Tests compare the unchanged projections, not whole bodies, and one contract
test parses a new startable body with the old shape.

## Risks / Trade-offs

- **A project is refused by work it cannot see.** Mitigated by `hiddenHolders` units and the scope
  on the refusal; accepted as the price of elasticity.
- **Stranding behind dead claims.** Human claims never expire, and the lease sweep runs every
  30 s over at most 50 projects per tick (`wbs-claim-leases` L7), so an organization with many
  projects frees an expired agent's units up to several ticks late, across projects. S12's
  occupancy read is the remedy; the lag is accepted.
- **Hot read on large organizations.** One indexed query per asked resource inside the write
  turn; measured in task 3.5 against a 50-project fixture.
- **Schedules overpromise across projects (S7).** Each project's dates assume it may use the
  whole clamped pool; only claims enforce the share.
- **Another process misses the announcement.** The `RollUpCache` then converges within its
  300 s TTL, as for every other write it misses.
- **Declared units still lie** about physical use; Dash measures and admits (S9).
- **Stale foreign occupancy in an open browser** until the next read (no push, non-goal).
