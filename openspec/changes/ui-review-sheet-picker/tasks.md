# Tasks

1. [x] Toasts portalled above modals on a layer token; a tap on a toast does not close the modal (F-085) — `e2e/plan-import.spec.ts`.
2. [x] Header project list wraps whole names; tests reworded from clipped to wrapped (F-086) — `e2e/header.spec.ts`.
3. [x] Bottom-sheet picker names wrap whole without horizontal panning; a modal surface bounds its list and phone block rows keep symmetric 12px padding and a 44px minimum (F-092) — `e2e/reference-cells.spec.ts`.

4. [x] Preserve native table-edge scrolling; reconcile #504 wrapping with #515 bounds and move static row padding into CSS, with watched clipping/padding/scroll negatives.

5. [x] Reconcile #515 review fixes: intercept toast taps before both outside callbacks; keep Project settings open; add desktop and nested phone regressions.
6. [x] Place portalled cards and wait rings above modal surfaces, and keyboard shortcuts on the modal layer; add mouse fact-card and standing-toast paint probes.
7. [x] Widen the phone project list within viewport margins; preserve wrapped names and amend `project-dropdown-details` to the implemented rule.
8. [ ] Verify this reconciliation in hosted CI, including the new mouse fact-card probe and R5 mutation runs; local browser/full suites are deferred after host OOM.
