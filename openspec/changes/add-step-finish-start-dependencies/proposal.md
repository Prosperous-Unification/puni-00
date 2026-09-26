## Why

Work-item dependencies wait at a project-wide reach point, so a planner cannot express a Dev-to-Dev handoff while later QA runs independently. The current predecessor/successor pair also cannot hold several distinct step relationships.

## What Changes

- Add explicit whole-work-item or selected-step endpoints and finish-to-start (FS) relationships. Parent endpoints constrain all descendant leaves.
- Preserve existing project-reach dependencies until a planner edits one. Add typed persistence, commands, history, duplication, import/export, saved plans, snapshots and MCP support.
- Schedule the same expanded slice relationships in Fast and optimized CP-SAT. Add a compact picker with one-click Whole→Whole FS, endpoint customization, accessible chips and step-boundary Gantt arrows.

## Non-Goals

SS, FF, start-to-finish, lag, split work and arbitrary cyclic relationships are outside this stage. The follow-on `add-start-and-finish-dependency-types` change adds SS and FF.

## Constraints

Unestimated slices have zero schedule duration although their chart placeholders remain visible. Existing `depReach`, especially dynamic `anchor-slice`, retains its meaning for legacy links. The migration is additive and ships with `down.sql`; compatible readers precede typed writes. A rollback that would hide typed links must refuse and give an explicit recovery path.

## Capabilities

### Modified Capabilities

- wbs-domain: typed endpoint FS semantics, validation and editing.
- plan-command-registry: typed mutations and legacy command compatibility.
- plan-import: versioned dependency import/export and duplication.
- live-plan-snapshot: frozen typed links and live publication.
- scheduler-optimization: expanded FS edges and independent validation.

## Domain Terms

Dependency endpoint, relationship type and All descendants are defined in `CONTEXT.md`.

## Decisions Recorded

Use a separate typed command family so omitted endpoint fields in existing `addDependency`/`removeDependency` continue to create and remove legacy project-reach links. See `design.md`.

## Impact

Shared contracts, domain graph, command and history services, SQLite adapters, import/export, snapshots, MCP, frontend dependency picker and Gantt, Fast and solver wire/cache. One additive migration pair is required during implementation.
