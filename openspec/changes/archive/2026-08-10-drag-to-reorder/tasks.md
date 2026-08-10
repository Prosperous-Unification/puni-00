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
- [x] 3.2 Exercised on dev against a real project, issuing exactly the moves the drag produces. `into` made Paint a child of Strip; `below` an open parent made Sand its first child at `010.1` rather than landing past the branch; `above` lifted Sand back to `010` at the root. be-01 refused the cycle with 409 `cycle` and the frozen row with 409 `frozen` — the same two rules the client refuses first, confirmed to exist on the other side rather than assumed.

## 4. Found while writing the tests

- [x] 4.1 **The ordering assertion compared three empty strings to three empty strings.** `threeRoots` left the names blank, so every permutation matched and the "dropped above" test passed while the row was actually being made a child. The rows are named now.
- [x] 4.2 **jsdom has no `DragEvent`, so `fireEvent.dragOver(el, {clientY})` silently dropped the coordinate.** `zoneFor` saw `NaN` and every test landed on `into`. The helper dispatches a `MouseEvent` named `dragover`, which carries it.
- [x] 4.3 **The drop recomputed its own zone instead of using the one the marker showed.** Two decisions that could disagree, and the person let go looking at the first. It uses the last `dragover`'s answer.

## 5. Cross review, 2026-08-06 (codex + agy)

Five findings, all real, all fixed. Both reviewers independently found the same
two; each found one the other missed.

- [x] 5.1 **Every socket event remounted every cell, taking the focus and the half-typed value of whoever was mid-word** (both, critical/high). Pre-existing and worse than drag: `columns` depended on `onKeyDown`, which reaches `flat` through `indent`/`outdent`, and `flat` is rebuilt by every refresh — so the comment warning about `flexRender` remounts sat directly above the dependency list causing them. `roles` was the other half: every read allocated a fresh array. Cells now read their callbacks through a ref, `columns` depends on `roles` alone, and `roles` is replaced only when its content differs. Both halves have a fault injection.
- [x] 5.2 **A drag could outlive its gesture** (both, high). The browser does not reliably fire `dragend` on a source node replaced mid-drag, so `dragging` could stay set forever — after which moving the pointer over the table drew drop markers and a click moved a row nobody had picked up. A drag is now cancelled when the tree changes under it, with a message.
- [x] 5.3 **A peer's edit between pickup and release could silently change the move** (codex, medium). `planMove` read the newest tree, so "below 010" could resolve to a different parent than the one on screen at pickup. The same cancellation in 5.2 closes it — the conservative answer, since a drag lasts a second or two.
- [x] 5.4 **Dropping below an open parent landed past its whole subtree** (agy, medium), several rows from where the marker was drawn. Below a row whose children are showing now means "first child", which is the gap the line was in. The table tells the planner whether the branch is open; the planner stays pure.
- [x] 5.5 **The frozen test was the third one passing for the wrong reason** (both, medium/high). It fired a `drop` with no `dragstart`, so `dropOn` returned on its null check and the frozen rule was never reached — deleting that rule left it passing. Hiding the handle on frozen rows had also made the refusal unreachable through the UI at all. The handle stays and explains itself (`aria-disabled`, a title naming the freeze), the drop refuses with the reason, and the test drags for real.
- [x] 5.6 **D4 overstated the client/server equivalence.** Both reviewers checked it by hand and found no divergence. It is now asserted instead: for every row, target, zone and expansion state, a plan this function emits never resolves to a parent that descends from the row being moved — which is be-01's rule, verbatim.
