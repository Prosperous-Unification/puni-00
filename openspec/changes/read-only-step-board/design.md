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

## Task 2.1 draft suspension boundary

Source inspection after task 1.2 found that keeping Plan mounted is insufficient:
`cell-input.tsx` calls `LiveField.leave()` on blur, which submits changed text.
Suppressing that call alone loses the draft when `LiveField.sync()` receives a
different server value after focus moves away. `usePlanKeyboardEffects` also
registers window undo/redo listeners that remain active beneath an inert surface.
This amendment implements the existing no-write/preserve-draft contract; it does
not change ordinary Plan editing or introduce a new saving policy.

Use a small Plan interaction scope owned by the selected runtime's mounted
surface, below the existing live-runtime arm. An opt-in UI context/registration
may connect the page's view controls, table keyboard effects and editable fields.
Do not create a second runtime, feed, global draft cache or persistent preference.
The scope holds suspended unsent drafts by existing stable cell identity; their
typed text and original shown baseline are distinct from the latest server value.
Do not mark them refused or place them in `heldRefusals`.

| Transition                                 | Required behavior                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dirty Plan field to Board selector         | Capture the draft synchronously when the selector receives direct focus before the field's leave handler or hidden/inert transition can submit. Cover pointer-down/focus/click and selector focus without activation. A click-only state update is too late. Native traversal through intermediate Plan controls keeps ordinary commit-on-blur. |
| Plan to Board                              | Keep Plan mounted, hidden and inert. Suppress switch-caused leave/flush and disable its window shortcuts and mutation portals. Board and Plan retain one runtime/feed.                                                                                                                                                                          |
| Delivery while suspended                   | Record the latest server value but retain the draft text and original baseline. Untouched fields follow server values normally. Board shows the authoritative delivered plan, not unsent edits.                                                                                                                                                 |
| Board to Plan, or selector focus abandoned | Do not submit or release the hold merely because Plan is visible. An unfocused suspended draft survives further deliveries. Refocusing the field resumes its existing explicit commit, ordinary leave or abandon behavior; do not invent automatic retry or conflict resolution.                                                                |
| Hidden field face remounts                 | A surviving cell identity recovers its suspended draft and baseline across step-column or responsive-renderer remounts. Keep existing submission-generation/refusal protection; do not reconstruct an already-sent edit as a new unsent command.                                                                                                |
| Existing request settles                   | Preserve existing completion ordering and refusal handling. An acknowledged command reaches Board through the normal plan delivery; switching must not cancel, resend or manufacture it.                                                                                                                                                        |
| Cell identity is deleted                   | Remove its suspended entry using authoritative row/step existence, never viewport visibility. Never apply it to a replacement identity.                                                                                                                                                                                                         |
| Runtime withdrawn                          | Dispose the scope without submission or transfer to the next runtime, including a later reopening of the same project. Existing project-retirement behavior remains authoritative.                                                                                                                                                              |

Implement the narrow opt-in field operation and tests alongside `LiveField` and
`CellInput`, preserving their existing ordinary-blur behavior outside this scope.
The scope may retain a suspended field across a face remount or retain a precise
draft record; in either case its baseline and submission guards must remain
coherent. Do not copy the whole edit engine into the page. Read `live-editing.test.tsx`,
`plan-cells.test.tsx`, `use-estimate-drafts.ts` and `plan-keyboard.test.tsx` before
touching their boundaries. Hidden Plan must not create invisible modal controls
or react to global undo/redo/help keys; suppress those listeners explicitly.

Use real focus transitions in mounted tests; `fireEvent.click` alone does not
reproduce the browser's preceding blur. Browser task 2.2 exercises dirty-field
pointer switching, direct selector focus with a dirty field, and actual
Tab/Shift+Tab/Enter/Space selection after ordinary commit. In Chromium,
Shift+Tab from the dirty name field first focuses an estimate disclosure among
the intervening Plan controls and commits on that ordinary blur; it is not a
dirty selector handoff. Preserve that traversal and test the direct-focus
suspension boundary separately.
Ordinary Plan editing, rejected-draft recovery and already-issued commands remain
regressions to preserve. Any need to alter their general policy requires another
bounded design decision before implementation.

## Migration Plan

No data migration. Ship an additive view. Removing it restores the existing
Plan surface without changing saved project state.

## Open Questions

None for this slice. Richer step states, writable drag policy and Backlog cutover
stay in their own design work and do not block this read-only contract.
