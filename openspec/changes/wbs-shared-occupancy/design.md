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

Three things already exist that this change must agree with:

- A `resource` belongs to one organization (`resource_organization`) and `claim_occupancy`
  is indexed by resource (`claim_occupancy_by_resource`).
- `claim_limit` (`wbs-organization-limits` L10) already counts across every project of the
  organization inside the claim's `BEGIN IMMEDIATE` turn under the process-wide
  `WriteCoordinator`, so an organization-wide count in the write turn is a solved pattern.
- `wbs-resource-release` (in progress, not on `main`; read only) makes Dash's runtime
  reservations the authority for physical host pools: "Runtime admission counts unreleased
  reservations across projects on the same host pool", runtime reservations are never added
  to claim occupancy, and WBS's occupancy "must not be advertised as this host-wide
  protection". See S9 for how this change sits beside it.

## Goals / Non-Goals

**Goals:** one resource's units are promised at most once across the organization's claims;
an agent's startable read and refusal say what other projects hold, within what the agent
may read; the schedule never assumes more units than exist; a resource nobody states a
directory capacity for behaves exactly as today.

**Non-Goals:** portfolio levelling; guaranteed shares; physical admission and measured usage
(Dash); cross-organization sharing; push notification of foreign occupancy changes.

## Alternatives

**A. Organization-scoped occupancy in WBS against a directory capacity.** The resource
states how many units exist; a claim must fit what every project of the organization holds.
Elastic (an idle project strands nothing), one number to maintain, the startable read stays
true for agents that never touch Dash. Costs: one claim can be refused because of another
project, which raises a visibility rule (S5), and undo in one project can be refused by
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
stays necessary because declared units are not measured bytes; the two never add up (S9).
B remains a later refinement (guaranteed minimum shares) if Dany needs isolation over
elasticity.

## Decisions

Each is **assumed, awaiting Dany**, overrulable by id.

**S1. The directory capacity is authoritative for shared occupancy (assumed, awaiting
Dany).** A new satellite `resource_directory_capacity (resource_id PK → resource, units ≥ 0)`;
a row is stated, its absence unstated, as `docs/capacity.md` defines for capacities. Which
number decides what:

| Number                                | Set by                            | Decides                                                                                                                                      |
| ------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Directory capacity                    | `setDirectoryCapacity`            | the organization-wide claim check; the schedule clamp (S7)                                                                                   |
| Project resource capacity             | `setResourceCapacity` (unchanged) | the project's ceiling in the claim check; the project's pool in the schedule                                                                 |
| Capacity report (`compute-providers`) | Dash reporter                     | nothing; shown beside both; "adopt measured" writes the directory capacity when one is stated (amends `compute-providers` P7 once both land) |

Alternative: a nullable `total_units` column on `resource`. Rejected: a satellite keeps
`resource` reads and the plan export byte-identical and gives `down.sql` one table to guard.

**S2. Occupancy scope is the resource's organization (assumed, awaiting Dany).** For a
resource with a stated directory capacity, the claim check reads every `claim_occupancy` row
naming that resource, joined through `claim → work_item → project_organization` and filtered
to the resource's organization (defence in depth: slice 1 proves a project cannot demand or
state another organization's resource, and the filter makes the count right even if it
could). A legacy resource with no `resource_organization` row cannot take a directory
capacity (`setDirectoryCapacity` refused `legacy_resource`), so its scope stays the project.

**S3. A claim must fit both scopes (assumed, awaiting Dany).** For each asked resource:
the project check as today (project capacity minus the project's other leaves), then, when a
directory capacity is stated, directory capacity minus every other leaf of the organization.
Unstated project capacity skips the first; unstated directory capacity skips the second. The
leaf's own held units never refuse it (R3's held comparison applies in both scopes). The
refusal stays `resources_exhausted`; each shortage gains `scope: 'project' | 'organization'`
naming the scope that bound it (the smaller free wins; on a tie, `organization`). No new
refusal kind, so every reader that knows `resources_exhausted` keeps working. Project
capacities may sum above the directory capacity: they are ceilings, not shares.

**S4. The check stays in the write turn (assumed, awaiting Dany).** The organization-wide
read runs inside the claim batch's transaction under the process-wide coordinator, exactly
where `claim_limit` counts; blue and green serialise on SQLite's `BEGIN IMMEDIATE`. The same
check serves claim, redo of a claim and undo of a release (`refuseOccupancy` stays the one
check, now given both row sets).

**S5. Holders in other projects are named only to readers who may read them (assumed,
awaiting Dany).** A holder carries `projectId` (additive). For each holder in another
project, the reader's access decides: readable (today every member reads every project of
the organization; under `wbs-permissions` the reader's `project.read` grant) gives the full
holder; unreadable collapses into one `elsewhere: { units, claims }` per resource with no
project id, person, run or work item. A machine principal is judged by its own grants
(`wbs-machine-credentials` A23). The directory resource read gives admins occupancy per
project, with the same rule. Alternative: always redact foreign holders. Rejected: inside one
organization today everything is readable, and an operator unblocking a swarm needs the
names.

**S6. The startable read states scope per resource (assumed, awaiting Dany).** Each entry of
`resources` gains `occupancyScope: 'project' | 'organization'`, `directoryCapacity`,
`occupiedElsewhere` and `free` = the smaller of the two scopes' free units; `doesNotFit`'s
`exhausted` gains `scope`. The top-level `occupancyScope` widens to
`'project' | 'organization' | 'mixed'` (`mixed` when listed resources differ). A resource with a
directory capacity but no project capacity is listed (it now constrains). The MCP description
sentence "claims in other projects on the same host are not subtracted" becomes true per
resource.

**S7. Engines level per project, clamped to the directory capacity (assumed, awaiting
Dany).** R5 stands: no schedule reads a claim, an occupancy or another project's plan. A
pool's size is the project capacity, clamped to the directory capacity when both are stated,
or the directory capacity when only it is stated. The canonical input carries the effective
pool size, so the hash moves only where a directory capacity is stated; golden corpus
byte-identical. Consequence, stated not hidden: two projects' schedules may each plan the
whole 16 GB on the same day; the claim path, not the dates, enforces the share.
Alternative: portfolio levelling across the organization. Rejected for v1: one project's
dates would move on another's edit and the hash would span projects.

**S8. Undo, redo, lease expiry and removal cross projects (assumed, awaiting Dany).** An
undo of a release or a redo of a claim in A may be refused `stale_undo` with detail
`resources_exhausted:` because of B; the detail names the scope. A release or lease sweep in
A frees units for B at once. `deleteResource`'s `in_use` counts include the directory
capacity; the cascade drops it (R8a's admin rule already covers removal).
`setDirectoryCapacity` below current occupancy strands nothing: held units stay held, new
claims are refused until it drains (as `wbs-organization-limits` L11).

**S9. Relation to `wbs-resource-release` (assumed, awaiting Dany).** That change keeps
Dash's runtime reservations as the physical authority and says WBS claim occupancy is not
host-wide protection. This change does not contradict it: organization occupancy is still
logical, in declared units, never adds runtime reservations, and is never read by Dash
admission ("No new reserve depends on the WBS projection"). It narrows its sentence "WBS's
project-scoped occupancy is unchanged" to resources without a directory capacity; that
document's owner amends it if both land. A claim WBS admits can still wait at Dash's
admission; the reverse cannot happen.

**S10. The organization's capacity cap bounds directory capacity (assumed, awaiting Dany).**
`maxCapacityUnitsPerResource` (`wbs-organization-limits` L2) refuses `setDirectoryCapacity`
above the cap with `capacity_limit`. For a resource with a stated directory capacity, L2's
sum over project capacities no longer applies (ceilings may overlap); for one without, L2
stays as it is. `claim_limit` and `agent_person_limit` are unchanged.

**S11. Who sets a directory capacity (assumed, awaiting Dany).** Organization admins and
super-admins only, through the directory command route, not journalled, audited like a
limit change: it constrains every project of the organization, as removal does (R8a).
Agents act as at most members, so no agent sets it.

## Migration

`<ts>_add_resource_directory_capacity`: create `resource_directory_capacity` with the
`units` CHECK and the cascade from `resource`; `down.sql` refuses while any row exists.
Nothing else changes shape. An outgoing release ignores the table, so during a blue/green
swap the old process checks per project only; the operator states directory capacities after
the swap completes (runbook line in slice 7), and the new release counts every row the old
one wrote, so the promise converges once the old process stops.

## Risks / Trade-offs

- **A project is refused by work it cannot see.** Mitigated by `elsewhere` counts and the
  scope on the refusal; accepted as the price of elasticity.
- **Hot read on large organizations.** The organization-wide read is one indexed query per
  asked resource inside the write turn; measured in slice 3 against a 50-project fixture.
- **Schedules overpromise across projects (S7).** Accepted for v1; the startable read is
  what agents act on.
- **Declared units still lie** about physical use; Dash measures and admits (S9).
- **Stale foreign occupancy in an open browser** until the next read (no push, non-goal).
