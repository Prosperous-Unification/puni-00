# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      bun:test (be-01, gw-01, libs, tools)   597 pass  0 fail
      fe-01 (vitest)                          71 pass  0 fail

$ bunx @fission-ai/openspec@1.3.0 validate --all
✓ change/drag-to-reorder
Totals: 6 passed, 0 failed (6 items)
```

## Every check, and the fault that broke it

| Check                                                        | Fault injected                                                            | What the run reported                                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A frozen row cannot be dragged (`drag-drop.ts`)              | the `frozenNumber !== null` refusal deleted                               | only `refuses to move a frozen row` failed                                                                                                                       |
| A row cannot be dropped inside itself (`drag-drop.ts`)       | the `isWithin` refusal deleted                                            | three failed: the drop onto itself, the drop into its own subtree in all three zones, and the only-child case, which then reported a move instead of `unchanged` |
| A no-op drop sends nothing (`drag-drop.ts`)                  | the `unchanged` refusal replaced with a fall-through                      | only `refuses a drop that resolves to where the row already is` failed                                                                                           |
| The zone steers the drop (`wbs-table.tsx`)                   | `dropOn(row.original.id, dropHint.zone)` replaced with a literal `'into'` | two failed: `puts the row above the target when dropped on its top quarter` and `sends nothing when a row is dropped where it already is`                        |
| A collapsed branch opens when dropped into (`wbs-table.tsx`) | the `setExpanded(expandBranch(...))` call deleted                         | only `opens a collapsed branch it is dropped into` failed                                                                                                        |

## Two tests that were passing for the wrong reason

Both were caught here, before review, and both are the same species of fault R5
exists for.

**The ordering assertion compared nothing to nothing.** `threeRoots()` created
three rows and left their names blank, so `['', '', '']` matched every
permutation of itself — the "dropped above" test passed while the row was
actually being made a _child_. The rows are named `Strip`, `Sand` and `Paint` now.

**jsdom silently drops the coordinate.** `fireEvent.dragOver(el, {clientY})`
degrades to a plain `Event` because jsdom has no `DragEvent`, so `clientY` was
`undefined`, `zoneFor` saw `NaN`, and every test aimed at every zone landed on
`into`. The helper dispatches a `MouseEvent` named `dragover` instead, which
carries it; React dispatches on the type either way. Found by printing what the
handler actually received, after the arithmetic had been proven correct in
isolation twice.

The drop now uses the zone the last `dragover` computed rather than recomputing
its own — so the marker on screen and the move that happens are one decision,
not two that can disagree.

## What this does not cover

- **A real browser.** Every assertion here is jsdom, which does not implement
  drag at all — the events are synthesised and the row geometry is pinned by
  hand. What is proven is that the right zone produces the right move; what is
  not is that a real pointer produces the right zone.
- **Touch and pen.** Stated as a non-goal. The browser's drag events do not fire
  for a finger, and nothing here changes that. The keyboard path — Tab and
  Shift+Tab — is unaffected and remains the accessible way to restructure.
- **Autoscroll while dragging past the edge of the window.** A long breakdown
  cannot be dragged from bottom to top in one gesture; collapse the branches in
  between, or use the keyboard.
- **A drag interrupted by someone else's edit.** The tree refetches under the
  drag and the plan is computed from whatever `flat` held at drop time. be-01
  refuses a move whose `afterId` no longer exists, so the worst case is a failed
  request with its reason shown, not a wrong move.
