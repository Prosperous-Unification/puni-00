## Why

Occupancy is counted per project (`wbs-resources` R3). A directory resource two projects
use, such as one host's 16 GB of RAM or the one exclusive `staging`, is promised once per
project: on dev on 2026-10-25 project A's claims held all 16 GB and project B still read 16
free and admitted a 16 GB claim, and `staging` was held in A and in B at once. Swarms share
machines across projects, so this gap matters most.

## What Changes

- **A resource may state a directory capacity:** the units that exist for the whole
  organization. Opt-in per resource, admin-only, audited, with a dry-run preview.
- **Claims count occupancy across the organization** against it, inside the claim's write
  turn, beside the per-project check, which stays as a ceiling.
- **Refusals and the startable read** show units held in other projects, naming holders
  only where the reader may read the project.
- **Schedule inputs clamp each pool** to the directory capacity; projects still level alone.
- **Organization limits and Adopt measured** follow the directory capacity.

## Non-Goals

- Cross-project levelling (a portfolio scheduler), guaranteed per-project shares.
- Physical host admission, measured usage, cleanup (Twilight Dash's).
- Sharing a resource across organizations.
- Live push of another project's occupancy or schedule changes.

## Constraints

- Two migrations with guarded `down.sql`: an additive table and a compatible rebuild
  widening `organization_audit`; blue and green share one SQLite file.
- No directory capacity stated means unchanged decisions, refusal reasons, unit numbers and
  schedule hashes; reads gain fields only.
- Units held of a shared resource are an organization fact; holder identities never cross
  into a project the reader cannot read.
- Supersedes six sentences of `wbs-resource-release`, which landed first; this change amends
  them with pointers to S9.
- Every refusal and redaction ships with a negative and a `Proof:` comment.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `resource-directory`: directory capacity, `setDirectoryCapacity`, admin occupancy view.
- `resource-occupancy`: organization scope, holder visibility, cross-project undo.
- `startable-work`: per-resource scope and directory free units.
- `schedule-resources`: pool clamp.
- `organization-limits`: cap, usage and clearing.
- `compute-provider`: which capacity Adopt writes.

## Domain Terms

Directory capacity, Occupancy scope (in `CONTEXT.md`).

## Decisions Recorded

design.md S1 to S12, each accepted by Dany on 2026-11-01. S1's choice gets an ADR, now
that it is confirmed.

## Impact

`@wbs/domain`, `@wbs/contracts`, `@wbs/core`, `@wbs/store-sqlite`, store-memory, be-01
(two migrations), mcp-01 by derivation, fe-01. No engine or solver-wire change.
