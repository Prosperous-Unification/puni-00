# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      bun:test (be-01, gw-01, libs, tools)   597 pass  0 fail
      fe-01 (vitest)                          77 pass  0 fail

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
| A peer's edit does not take the focus (`wbs-table.tsx`)      | `roles` replaced unconditionally on every refresh                         | only `does not take the focus or the half-typed value` failed — the input had been unmounted and remounted under the cursor                                      |
| …and neither does a changed callback (`wbs-table.tsx`)       | `onKeyDown` put back in the `columns` dependency list                     | the same one test failed, for the same reason: `columns` is a new array, so every cell is a new component type                                                   |
| A drag does not outlive its gesture (`wbs-table.tsx`)        | the effect cancelling a drag on a tree change deleted                     | only `is cancelled rather than left holding a row nobody picked up` failed, and the stale drag moved a row on the next click                                     |
| A frozen row really is refused (`drag-drop.ts`)              | the `frozen` refusal deleted                                              | `refuses to drag a frozen row and says why` failed — the same test that used to survive this exact fault                                                         |

## Three tests that were passing for the wrong reason

Two were caught before review and one by both reviewers. All three are the same
species of fault R5 exists for, and the third is the most instructive: it was in
the list of proofs this document already claimed.

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

**The frozen test never started a drag.** It fired `drop` with no `dragstart`
before it, so `dropOn` returned on its `draggedId === null` check and the frozen
rule was never reached; deleting that rule left the test green. Hiding the handle
on frozen rows had also made the refusal unreachable through the UI entirely, so
there was nothing to prove. The handle stays and explains itself now, and the
test drags for real. Both reviewers found this independently.

The drop now uses the zone the last `dragover` computed rather than recomputing
its own — so the marker on screen and the move that happens are one decision,
not two that can disagree.

## Against the running dev deployment

The moves the drag produces, issued at `dev.wbs.bulletpoints.club` on `817db23`
against dev's SQLite:

```
[move] start: 010 Strip | 020 Sand | 030 Paint
[move] paint into strip: 010 Strip | 010.1 Paint | 020 Sand
[move] sand below open strip: 010 Strip | 010.1 Sand | 010.2 Paint
[move] sand above strip: 010 Sand | 020 Strip | 020.1 Paint
[move] strip into its own child paint: 409 {"error":"cycle"}
[move] frozen row moved: 409 {"error":"frozen"}
[move] PASS
```

The last two matter most: they are the two rules the client also refuses, and
this is the proof that the copy is guarding something real rather than standing
in for a server rule that had quietly changed.

## What this does not cover

- **A real browser.** Every assertion here is jsdom, which does not implement
  drag at all — the events are synthesised and the row geometry is pinned by
  hand. What is proven is that the right zone produces the right move; what is
  not is that a real pointer produces the right zone.
- **Touch and pen.** Stated as a non-goal. The browser's drag events do not fire
  for a finger, and nothing here changes that. The keyboard path — Tab and
  Shift+Tab — is unaffected and remains the accessible way to restructure.
- **A real drag surviving a real re-render.** The gesture is cancelled when the
  tree changes under it, which is asserted in jsdom. Whether a browser would have
  cancelled it anyway, by replacing the source node, is not something jsdom can
  show — that asymmetry is why cancelling is the conservative choice rather than
  a guess about `dragend`.
- **Autoscroll while dragging past the edge of the window.** Unchanged: a long
  breakdown cannot be dragged bottom to top in one gesture.
