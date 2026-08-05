## 1. The plan, as a pure function

- [x] 1.1 Failing tests in `apps/fe-01/src/components/wbs/drag-drop.test.ts` for `zoneFor`: the top quarter is `above`, the bottom quarter is `below`, everything between is `into`, and the boundaries land on the side the spec says.
- [x] 1.2 Failing tests for `planMove`: into a row, above a sibling, below a row in another branch, into a childless row, and into a collapsed branch.
- [x] 1.3 **Negative test:** a frozen row refuses, with `frozen`. Watch it fail with the check removed.
- [x] 1.4 **Negative test:** a drop inside the dragged row's own subtree refuses, with `cycle`, for all three zones. Watch it fail with the descent check removed.
- [x] 1.5 **Negative test:** a drop that resolves to the position already held refuses with `unchanged`. Watch it fail with that comparison removed.
- [x] 1.6 Implement `drag-drop.ts`. It imports nothing from React and touches no event.

## 2. The table

- [x] 2.1 Failing tests in `wbs-table.test.tsx`: dragging a row onto another calls `move` with the parent and preceding sibling `planMove` decided; a refused drop calls nothing and puts the reason on screen.
- [x] 2.2 Give every row a drag handle and the drop handlers, and show where the row would land while a drag is over it.
- [x] 2.3 A frozen row is not draggable at all, as well as refused on drop — a handle that cannot work should not invite the attempt.
- [x] 2.4 Dropping into a collapsed branch expands it, so the row is not dropped somewhere invisible. `expandBranch` handles TanStack's two shapes for that state — the boolean `true` meaning everything is open, and the record meaning a specific set.

## 3. Gate and verification

- [x] 3.1 `verify.md`: the uncached gate and the failure-proof table.
- [ ] 3.2 Exercise it on dev against a real project.

## 4. Found while writing the tests

- [x] 4.1 **The ordering assertion compared three empty strings to three empty strings.** `threeRoots` left the names blank, so every permutation matched and the "dropped above" test passed while the row was actually being made a child. The rows are named now.
- [x] 4.2 **jsdom has no `DragEvent`, so `fireEvent.dragOver(el, {clientY})` silently dropped the coordinate.** `zoneFor` saw `NaN` and every test landed on `into`. The helper dispatches a `MouseEvent` named `dragover`, which carries it.
- [x] 4.3 **The drop recomputed its own zone instead of using the one the marker showed.** Two decisions that could disagree, and the person let go looking at the first. It uses the last `dragover`'s answer.
