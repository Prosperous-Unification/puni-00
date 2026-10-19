## Context

Dany's goal of 2026-10-20: "resource management for WBS works: RAM, disk, other machine
resources, people, agents, claims; a consistent flexible system that runs swarms of agents,
and manages assignees." Two designs already exist and this change joins them:

- Claire's design consult of 2026-10-17 (`notes/resource-claim-release-design-2026-10-17.md`,
  `notes/wbs-resource-claiming-breakdown.md`, merged in PR #571): resources as directory
  entities with a kind, per-project capacity mirroring `projectTeamCapacity`, per-item demand
  as a satellite like `workItemTeam`, both engines levelling demands as pools, deadlock
  impossible because a block acquires its whole vector at one instant. It keeps every live
  hold in Twilight Dash.
- The claims change (`wbs-team-claims`, 2026-10-19): Dany decided that who occupies a step
  now is a WBS record, the `claim`, with no clock. That moved one live fact into WBS.

The consistent system is therefore: WBS declares resources, capacities and demands (plan
data, levelled by the engines) and records occupancy as a consequence of claims (live, but
clockless). Dash keeps everything that needs a clock: leases, heartbeats, reclamation,
measured usage, and writes receipts back. The engines read demands and never a claim; a
claim reads capacities and occupancy and never a schedule.

What exists: `service_team` + `project_team_capacity` + `work_item_team` and the
`capacityProfile`/`reserve`/`jointWindowFor` ledger in `schedule.ts`; one `AddCumulative`
per pool in `model.py`; the `claim` table (slice 1 of claims); `setAssignee` per step and
project-scoped assignment projections. What is missing: the resource trio, occupancy on a
claim, demand in the canonical input, bulk assignment.

## Goals / Non-Goals

**Goals:** a plan states what each leaf consumes; a swarm cannot overcommit a host through
claims; dates foresee contention; an operator assigns a subtree in one command and reads who
holds what by person; the startable read tells an agent what fits right now.

**Non-Goals:** anything with a clock; `renewable` kinds; cross-project levelling or
occupancy; demand inheritance; per-step demand; named units; agents authoring demands
through Dash; done work releasing schedule occupancy (own change).

## Decisions

All drafted under Dany's "GO" of 2026-10-20 and **assumed** until he reads them. They follow
Claire's defaults where she gave one; divergences are named.

**R1. Resource, kind, capacity and demand as Claire defined them.** `resource` (id, name,
kind `exclusive|divisible`, unitLabel) directory-wide and unique by name;
`project_resource_capacity (projectId, resourceId, units)` with the unstated and remembered
states of `docs/capacity.md`; `work_item_resource_demand (workItemId, resourceId, units)` a
satellite that moves the item's revision, units ≥ 1 and exactly 1 for `exclusive`. Machine
resources are declared by the operator per host, for example `h2puni ram (GB)`,
`h2puni tmp disk (GB)`, `h2puni agent slots`; people and agents stay persons and teams.

**R2. Demand is per work item and charged on every step's block.** As `poolIds` rides every
slice today. Divergence from nothing; per-step demand is a later refinement.

**R3. Occupancy is in WBS, checked per project, clockless.** A claim on a leaf acquires the
leaf's whole demand vector atomically: for each demanded resource, the project's stated
capacity minus the units held by claims of the project's other leaves must cover the units,
else `resources_exhausted` naming the resource, the shortfall and the holders. Release of
the last claim on a leaf frees its units; while any claim on the leaf stands the units stay
held (one leaf, one occupancy, however many steps are claimed). An unstated capacity
constrains nothing. Divergence from Claire: she keeps occupancy in Dash; Dany's D1 put the
claim in WBS and an occupancy that does not follow the claim would let a swarm overcommit a
host between two Dash receipts. Cross-project occupancy on one physical host is a known
limit, stated in the startable read's answer, not hidden.

**R4. A claim may ask for more than the plan declared, never less.** `claimWorkItem`
accepts `resources: [{resourceId, units}]`; each entry must name a resource the leaf demands
or add one, and must be ≥ the declared units; the claim then holds the asked units. A later
mid-task expansion is a new claim-time fact, not an edit of a standing occupancy: refused
`resources_exhausted` or accepted whole, never queued (Claire §3, hold-and-wait).

**R5. The engines level demands as pools and never read claims.** `slicesOf` emits the
demand vector per slice; `ScheduleInput`, the canonicaliser and the input hash carry
demands and capacities with a contract bump; `jointWindowFor`/`reserve` take per-resource
units; CP-SAT adds one `AddCumulative` per resource with demand = units. Golden corpus: no
demands, byte-identical schedules. `boundBy` sentences name the resource. Occupancy is not a
schedule input (Claire's falsifier stands).

**R6. Startable work answers fit.** The read lists free units per resource for the project
and, per startable step, whether its leaf's demand fits now; steps that do not fit are listed
apart with the exhausting resource. Team filter unchanged.

**R7. Assignees in bulk, and a claim may assign.** `assignSubtree { workItem, step, person
| null }` writes `setAssignee` for every leaf of the subtree in one journal entry (null
unassigns); a by-person read lists assignments and claims across the project; `claimWorkItem
{ assign: true }` also assigns the claimant to the claimed steps, so "claim = assign" is one
flag, not a rule. Dany's 2026-08-06 rule still holds: labelling is not assigning.

**R8. Usage and removal follow the directory pattern.** Deleting a resource with demands,
capacities or occupancies is refused `in_use` with counts unless cascaded; directory usage
lists them.

## Risks / Trade-offs

- **Per-project occupancy on shared hosts.** Two projects each told "32 GB" can overcommit
  one host. Accepted for v1; the fix is a directory-wide `totalUnits` later.
- **Declared demand lies.** An agent that declares 2 GB and uses 8 is caught by Dash's
  receipts, not by WBS. The claim override (R4) lets an honest agent correct the plan.
- **Stale occupancy.** A dead agent's claim keeps its units until released; same risk and
  same answer as claims (startable read lists silent claims).
- **Engine parity gap.** Between Fast levelling and CP-SAT parity the engines agree on hash
  and differ in quality; ship the parity slice directly behind.
