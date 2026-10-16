# Tasks

1. [x] Toasts portalled above modals on a layer token; a tap on a toast does not close the modal (F-085) — `e2e/plan-import.spec.ts`.
2. [x] Header project list wraps whole names; tests reworded from clipped to wrapped (F-086) — `e2e/header.spec.ts`.
3. [x] Bottom-sheet picker names wrap whole without horizontal panning; a modal surface bounds its list and phone block rows keep symmetric 12px padding and a 44px minimum (F-092) — `e2e/reference-cells.spec.ts`.

4. [x] Preserve native table-edge scrolling; reconcile #504 wrapping with #515 bounds and move static row padding into CSS, with watched clipping/padding/scroll negatives.
5. [x] Review round (#515): a toast tap is decided before either outside hook reaches the caller, so Project settings stays open — `e2e/project-settings.spec.ts`.
6. [x] Portalled cards and the wait ring on `--layer-card` / `--layer-card-ring` above modals (F-131) — paint probe in `e2e/reference-cells.spec.ts` (on main's wrapped line).
7. [x] Keyboard shortcuts sheet on `--layer-modal` (F-133) — `e2e/plan-import.spec.ts`.
8. [x] Phone project list at the window's width less margins (F-130) — `e2e/header.spec.ts`; `project-dropdown-details` delta amended to wrap.
