## Why

Occupancy is counted per project (`wbs-resources` R3). A directory resource two projects
use, such as one host's 16 GB of RAM or the one exclusive `staging`, is promised once per
project: on dev on 2026-10-25 project A's claims held all 16 GB and project B still read 16
free and admitted a 16 GB claim, and `staging` was held in A and in B at once. Swarms of
agents share machines across projects, so this is the gap that most undermines them.

## What Changes

- **A resource may state a directory capacity:** the units that exist for the whole
  organization. Stating one is opt-in per resource; a resource without one behaves byte for
  byte as today.
- **Claims count occupancy across the organization** against that capacity, inside the
  claim's transaction, beside the existing per-project check. A project's stated capacity
  stays as a ceiling for that project.
- **Refusals and the startable read name holders in other projects** the reader may read,
  and only a count for those it may not.
- **Schedules clamp a pool to the directory capacity** but still level one project at a
  time.
- **The organization's capacity cap bounds the directory capacity.**

## Non-Goals

- Cross-project levelling (a portfolio scheduler), guaranteed per-project shares.
- Physical host admission, measured usage, cleanup: Twilight Dash's, per
  `wbs-resource-release` and `twilight-control-plane`.
- Sharing a resource across organizations.
- Live push of another project's occupancy changes.

## Constraints

- One additive migration with a guarded `down.sql`; blue and green share one SQLite file.
- No directory capacity stated means unchanged claim decisions, startable reads and
  schedule hashes (golden corpus no-op proof).
- No reader learns a project name, person or run from a project it cannot read.
- Every refusal and redaction ships with a production-path negative and a `Proof:` comment.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `resource-directory`: directory capacity and `setDirectoryCapacity`.
- `resource-occupancy`: organization-scoped occupancy, holder visibility.
- `startable-work`: per-resource scope and directory free units.
- `schedule-resources`: pool clamp.
- `organization-limits`: the capacity cap on directory capacity.

## Domain Terms

Directory capacity, Occupancy scope (in `CONTEXT.md`).

## Decisions Recorded

design.md S1 to S11, each assumed until Dany reads them. No ADR yet: S1's choice gets one
if Dany confirms it.

## Impact

`@wbs/domain`, `@wbs/contracts`, `@wbs/core`, `@wbs/store-sqlite`, store-memory, be-01
(migration), mcp-01 by derivation, fe-01, solver wire if S7 holds.
