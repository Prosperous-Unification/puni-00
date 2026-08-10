# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      fe-01 (vitest)   279 pass  0 fail  (264 before, 15 new — and the existing
                                          modified-arrow test narrowed to
                                          Ctrl and Meta)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
25 items, 0 invalid — alt-arrows-move-rows valid
```

The validator refused the first spec draft: `must contain SHALL or MUST`, on a
requirement whose SHALL was on the paragraph's second line. It reads the first
line only. Reworded, not weakened.

## The checks, and the faults that broke them

Every fault below was injected into `wbs-table.tsx`, watched failing with
`vitest run -t "moving rows with alt and the arrows"`, and reverted. The block
holds 15 tests; the counts are out of those.

| Check                                    | Fault injected                                                              | What the run reported                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `event.preventDefault()` in `onAltMove`  | the line removed                                                            | 9 failed, `expected true to be false` — the browser would still have typed into the field                       |
| the sibling edges in `moveAmongSiblings` | `swapWith` clamped by `% siblings.length`, so it wraps                      | 2 failed: `at the first sibling…` sent `['w1', null, 'w2']`, `at the last sibling…` sent `['w3', null, 'w1']`   |
| the column the focus lands in            | `landOn` hard-coded to `'name'` in `indent`, `outdent`, `moveAmongSiblings` | 2 failed: the Name `<textarea>` had the focus where the Dev `<input>` was expected                              |
| the refocus effect                       | the cell found and `focus()` not called                                     | the same 2 failed, with the focus on `<body>`                                                                   |
| the frozen refusal                       | the `frozenNumber` branch removed                                           | `refuses to move a frozen row and says why` failed — the move `['w1', null, 'w2']` was sent                     |
| the busy drop                            | `if (busy) return;` removed                                                 | `drops a second alt+down while the first is in flight` failed — 2 moves asked for                               |
| the modifier and IME guard               | narrowed to `!event.altKey`                                                 | `leaves a composing alt arrow, and one with a second modifier, alone` failed — the grid ate Ctrl/Meta/composing |

## The check that could not fail, and what fixed it

The refocus effect was the interesting one. Written and tested first, it passed
**with the `focus()` call deleted**: jsdom keeps the focus on a node React moves
between rows, so the assertion was observing a focus that had never been lost.
A real browser drops it — moving a node detaches and reinserts it — which is the
entire reason the effect exists.

Both focus tests now call `dropTheFocusAsABrowserWould()` after the keystroke,
which blurs the active cell, models the browser, and turns the assertion into
one about the focus being _put back_. With that line the effect's deletion fails
them; without it, it does not. Watched both ways.

## What changed underneath, and what proved it did not break

`focusNext` was a row id read by the Name cell's `onAttach`. It is now a
`CellRef`, with two consumers: `onAttach` still claims the Name column at attach
time — that is the only way to win the race a newly created row has, and
`focuses a newly created row so the next keystroke lands in it` is its test —
and an effect on `workItems` lands every other column from the committed DOM.
Enter, Tab, Backspace and Delete all still name the Name column, and their tests
were untouched and stayed green.

## What is not watched here

- **The macOS keys themselves.** That Alt+Left in a text field is word-jump, and
  that an un-prevented Alt+arrow also inserts a character, is why the handler
  `preventDefault`s. jsdom has neither behaviour; what is asserted is that the
  key is taken. The trade-off is stated in the proposal.
- **Whether the refocus lands where the eye is.** No layout in jsdom, so a row
  moved below the fold is focused but possibly off screen. The browser's own
  focus scrolling should handle it; unverified.
- **A held key against a real server.** The busy rule is proved against a move
  whose promise the test holds open. Real latency, and how many repeats a real
  keyboard sends inside one round trip, is dev's to show.
- **A stale tree.** `api.move` is sent ids read from the rendered tree, and be-01
  refuses an `afterId` that is not a sibling of the group. That refusal is
  be-01's own tested behaviour; the keyboard path was not exercised against a
  tree that changed mid-keystroke.
