## Why

Swarms of agents will build from one WBS plan, and the plan must say what they consume:
machine resources (RAM, disk, worktrees, slots), people and agents. Today WBS levels one
resource type, a team's slots, and the claims change records who occupies a step. Nothing
records that a step needs 4 GB on h2puni, nothing stops twelve agents from claiming steps
that together need 48 GB, and the schedule cannot foresee that contention. Assignees are set
one step at a time.

## What Changes

- **Resources are plan data.** A directory `resource` with a kind (`exclusive` or
  `divisible`) and a unit label; a per-project capacity like a team's; a per-work-item
  demand. Commands, undo, export and the plan document carry them.
- **A claim occupies its demand.** `claimWorkItem` acquires the leaf's whole demand vector
  atomically against the project's free units, or is refused `resources_exhausted` naming
  the resource and the holders. Release frees it. No clock in WBS.
- **The schedulers level demands.** Both engines treat each resource as a pool, dates move
  under contention, and the blocking resource is named.
- **Assignees are managed in bulk.** Assign a step of every leaf of a subtree to a person in
  one command, read assignments by person, and let a claim also assign when asked.
- **Startable work reads free units** and lists only steps whose demand fits.

## Non-Goals

- Leases, heartbeats, expiry, preemption, measured usage: Twilight Dash's runtime, read back
  later as receipts.
- `renewable` resources (hours per period), cross-project leveling, demand inheritance down
  the tree, per-step demands, named exclusive units.
- Whether done work releases its schedule occupancy: filed as its own change.

## Constraints

- Additive migrations with guarded `down.sql`.
- Demands and capacities enter the canonical schedule input and its hash; no demands means
  byte-identical schedules (golden corpus no-op proof).
- A block's whole vector is acquired at one instant, never incrementally, in planning and
  in claims alike.
- Every refusal ships with a production-path negative and a `Proof:` comment.

## Capabilities

### New Capabilities

- `resource-directory`: resources, kinds, per-project capacity, per-item demand.
- `resource-occupancy`: claims acquire and release resource units.
- `schedule-resources`: both engines level demands and explain waits.
- `assignee-management`: subtree assignment, by-person reads, claim-assigns.

### Modified Capabilities

- `plan-command-registry`: resource and demand commands, `assignSubtree`, claim `resources`.
- `startable-work`: free units and demand fit.

## Domain Terms

Resource, Resource kind, Resource capacity, Demand, Occupancy (in `CONTEXT.md`).

## Decisions Recorded

design.md R1 to R8, drafted under "GO" on 2026-10-20; all marked assumed until Dany reads.

## Impact

Domain, contracts, core, store-sqlite, solver-py, be-01, mcp-01 by derivation, fe-01.
