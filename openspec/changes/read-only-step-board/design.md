## Context

WBS 010.3.07 → .08 → .09 → .10. Source baseline:
`c5f16573afab47065bd8b6d4dba40755544ca8e3`. Design worktree:
`.worktrees/board-dash-design`, branch `plan/board-dash-boundaries`.
This is a delegated combined brainstorming/grilling/domain-modeling decision
record, not a claim that Dany answered a fresh interview. Standing delegation
allows the recommended reversible defaults; richer status and write semantics
are excluded rather than silently decided.

`ProjectPage` owns the selected `ProjectRuntime`. Its `plan` store contains
`DeliveredPlan.tree.value: PlanRead`, which already carries workItems, steps,
seq and projectRevision. `DeliveredPlan.steps` is a separate resource and must
not feed this projection. `WorkItemView.status` is already computed by the
backend; do not reimplement its eight-state fold in the browser.

## Goals / Non-Goals

Implement the delta's read-only view. No new request, storage, subscription,
backend calculation, drag engine, Backlog mapping or scheduler coupling.

## Decisions

The identity/ownership decision is [ADR 0035](../../../docs/adr/0035-board-cards-project-step-progress.md).
The combined design stress test resolved the remaining branches:

| Question / counterexample                     | Adopted answer                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| One row has Plan done and Dev running         | Two existing step-node cards, in different progress columns.                                  |
| Held work has no scheduled slice              | Enumerate leaves × tree steps, independent of scheduling.                                     |
| A parent looks done                           | No parent card; no overlapping scope in counts.                                               |
| No steps exist                                | Explain the empty board and return to Plan; invent no node.                                   |
| Can dragging mean setStatus?                  | No dragging or mutation in this slice. Future writes need a separate contract.                |
| Native Backlog status disagrees               | Existing WBS reads own this pre-cutover view; no new native importer.                         |
| New steps arrive ahead of the tree            | Use steps from that tree, not DeliveredPlan.steps.                                            |
| Failed input resembles absent progress        | Read failures are rendered; invalid internal facts throw. Only legitimate absence is Unknown. |
| Initial lanes, filters and preference storage | None; Plan/Board selection is page-local and defaults to Plan.                                |
| Mobile and keyboard                           | Text cards and semantic view buttons; stack columns, no hover-only information.               |

Implementation seams:

- Create `apps/wbs/fe-01/src/components/board/step-board.ts` as a pure projection
  over one `PlanRead`. Return column arrays and source seq/projectRevision. Find
  parents from the complete tree before enumerating leaves. Within each column,
  preserve the order obtained by visiting leaves in delivered `workItems` order,
  then visiting that tree's `steps` in array order within each leaf.
  `PlanRead.steps` already carries the backend's `(position, id)` ordering;
  preserve it directly without sorting again or adding position to `StepView`.
  Use `formatStepNodeId`, never a label-derived key. Keep safety invariants
  adjacent to their watched proofs.
- Create `components/board/step-board-view.tsx` for the renderer.
  It reads `ProjectRuntime.plan` through `useSyncExternalStore`, without obtaining
  a client or commands. A small read-only prop surface can be a Pick of project
  ID, plan, isCurrent and reread; do not introduce a new runtime service.
- Modify `components/wbs/project-page.tsx` only to select the surface within its
  existing selected-runtime arm. Switching views must not reopen/close the
  project runtime. Keep existing table-specific controls with Plan.
- Retry through `project.reread(['tree'])`; preserve project-lifetime refusal
  behavior and surface staleResources/treeFailure/connected explicitly.
- Reuse existing status wording; no frontend dependency-graph recomputation.
  Cards contain number, title, step name and separate work-item status only.

## Risks / Trade-offs

Card count grows as leaves × steps. This first view has no drag library or new
virtualization dependency; measure a fixture of 500 leaves × 5 steps and report
render evidence without inventing a performance SLA. If it is unusable, stop
and propose a bounded display strategy instead of silently omitting cards.

Keep the existing Plan surface mounted but hidden/inert while Board is selected
so view changes do not discard table-local drafts or its focus state.
The page integration test must prove switching to Board does not submit edits,
lose an acknowledged command, or create a second project owner. Avoid changes
to the wider plan-feed or edit model; escalate any necessary contract change.

## Migration Plan

No data migration. Ship an additive view. Removing it restores the existing
Plan surface without changing saved project state.

## Open Questions

None for this slice. Richer step states, writable drag policy and Backlog cutover
stay in their own design work and do not block this read-only contract.
