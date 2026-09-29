## Why

Work-item dependencies wait at a project-wide reach point, so a planner cannot express a Dev-to-Dev handoff while later QA runs independently. The current predecessor/successor pair also cannot hold several distinct step relationships.

## What Changes

- Add typed finish-to-start (FS) relationships whose endpoints are a whole work item, one step node (`010.dev`) or one step in all descendant leaves. Whole→Whole is last→first; parent selectors constrain every resolved pair.
- Preserve existing project-reach dependencies until a planner edits one. Validate legacy writes, estimate-driven anchor changes and structural/history mutations against the combined graph. Add typed persistence, commands, history, duplication, import/export, saved plans, snapshots and MCP support.
- Schedule the same expanded slice relationships in Fast and optimized CP-SAT. Add a compact picker with one-click Whole→Whole FS, same-step preselection from a step cell, endpoint customization, accessible chips and step-boundary Gantt arrows.

## Non-Goals

SS, FF, start-to-finish, lag, split work and arbitrary cyclic relationships are outside this stage. The follow-on `add-start-and-finish-dependency-types` change adds SS and FF.

## Constraints

Archive `unestimated-steps-take-no-schedule-time` and then `address-step-nodes` first; the latter supplies step node IDs, references, the graph seam and hand-down mappings. Unestimated slices have zero schedule duration although their chart placeholders remain visible. Existing `depReach`, especially dynamic `anchor-slice`, retains its meaning for legacy links. The migration is additive and ships with `down.sql`; compatible readers precede typed writes. A rollback that would hide typed links must refuse and give an explicit recovery path.

## Capabilities

### Modified Capabilities

- wbs-domain: typed endpoint FS semantics, validation and editing.
- plan-command-registry: typed mutations and legacy command compatibility.
- plan-import: versioned dependency import/export and duplication.
- live-plan-snapshot: working-plan visibility after typed mutations.
- saved-plans: historical capture and read/display of typed links.
- scheduler-optimization: expanded FS edges and independent validation.

## Domain Terms

Dependency endpoint, Step node, Step reference, Relationship type and All descendants are defined in `CONTEXT.md`.

## Decisions Recorded

Use a separate typed command family so omitted endpoint fields in existing `addDependency`/`removeDependency` continue to create and remove legacy project-reach links. See `design.md`.

## Impact

Shared contracts, domain graph, command and history services, SQLite adapters, import/export, snapshots, MCP, frontend dependency picker and Gantt, Fast and solver wire/cache. One additive migration pair is required during implementation.
