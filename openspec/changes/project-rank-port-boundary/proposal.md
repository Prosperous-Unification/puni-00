## Why

Project rank depends on the concrete project resource solely to describe its project-list reader. This introduces a resource-to-resource K6 edge across modules and couples rank naming to the project's implementation.

## What Changes

Project rank accepts a neutral project-list port expressed using the existing resource access and project values. The composition root continues to supply the project resource. The production K6 oracle must report no rank-to-project resource edge, including through a re-export.

## Non-Goals

Changing HTTP behavior, authorization, rank ordering, transaction ownership, fan-out, rollback, migrations, other K6 findings, rule enforcement or deployment.

## Constraints

Keep `listWithin(actorId, access)` and its existing project values, preserve the mounted composition, and prove the boundary with the production committed-candidate CLI before and after extraction. Run the mounted controller and SQLite rank tests. Full host gating and release remain the coordinating agent's work.

## Capabilities

### New Capabilities

- `project-rank-boundary`: Rank naming reads projects through a neutral application port.

### Modified Capabilities

None.

## Domain Terms

None. Existing Project and Project rank terms apply.

## Decisions Recorded

None. This is a small reversible application boundary extraction.

## Impact

`libs/wbs/application/core`: one neutral port and the rank resource dependency type. `apps/wbs/be-01/src/app.ts` keeps supplying its existing project resource structurally. No runtime dependency or API changes.
