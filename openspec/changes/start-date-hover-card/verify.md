# verify — `start-date-hover-card`

All five slices implemented. Every figure below was read off a run in this
worktree on 2026-08-31; nothing here is derived, and what was not run says so.

## Commands

| Command                                                             | Result                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `E2E_PORT_SHIFT=1900 bunx playwright test` (the whole browser gate) | **270 passed / 0 failed in 7.0m, exit 0**                  |
| `… hover-cards`                                                     | **23 passed** (34.0s) — the two new cases among them       |
| `… gantt`                                                           | **47 passed** (2.3m) — the fixture this change had to move |
| `bunx nx test fe-01`                                                | **2001 passed** over 64 files, exit 0                      |
| `bunx nx lint fe-01`                                                | 0 errors, 1 pre-existing warning                           |
| `bunx nx typecheck fe-01`                                           | exit 0 — `tsc --build --force`, both projects              |
| `bunx nx format:check --all`                                        | exit 0                                                     |
| `bunx openspec validate start-date-hover-card --json`               | 1 passed / 0 failed                                        |
| `bin/h2puni-gate.sh`                                                | **not run** — exits 127 on this macOS host                 |

`tool-bootstrap:test` is excluded and **was not run**: pre-existing timeout on
this host, recorded in `teams-and-assignees/verify.md`.

## The whole gate was the only thing that could see this

**The first whole-gate run of this change failed 43 of 270 cases**, and every
new case in it was green. `e2e/gantt.spec.ts`'s `seedPlan` reads a row's own
start day back out of the table to type it in as a not-before date, and it read
it from the `title` this change deletes: the fixture threw
`010.2's Start cell reads null, which has no date to hold it at` before it had
built a plan, and the failures landed in `gantt.spec.ts` cases about the pointed
row, the docked chart and the standalone `.svg` — files and subjects with
nothing to do with the Start column.

Both filtered runs used while writing this change were green. `hover-cards` was
green, `wbs-table.test.tsx` was green, and `gantt-panel.test.tsx` was green
because its own `columnDay` had already been moved. Nothing but running
everything could have said so, which is `LLM_README.md`'s landmine and R5 #21's
sentence: **a check written from the change's own words can still be blind to
what the change breaks — run everything, not the new test.**

Both readers are on `data-start-said` now, and the reasoning is written into
`gantt.spec.ts` beside the read, because the next person to remove a
presentational attribute from this cell needs to know a fixture depends on it.

## Failure proofs (R5)

| Check                                     | Fault injected                                          | Observed failure                                                                               | Watched         |
| ----------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------- |
| the card opens on the pointer             | `onMouseEnter` deleted from `startCellProps`            | `Unable to find role="tooltip" and name "Start of 010"`                                        | jsdom, 08-31    |
| the card opens on the keyboard            | `onFocus` deleted                                       | the same message, reached only **after** the hover half had passed                             | jsdom, 08-31    |
| the description names the card            | `aria-describedby` given `` `start-${row.number}` ``    | `expected 'start-010' to be 'start-w1'`                                                        | jsdom, 08-31    |
| it is **not** the browser's tooltip       | `title: said` put back on the `<td>`                    | `expect(received).toBeNull() · Received: "Starts with the project"`                            | Chromium, 08-31 |
| it opens in the frame the pointer arrives | (the same `onMouseEnter` deletion, read once, no retry) | `no card in the frame the mouse arrived on the Start cell · expected 0 to be 1`                | Chromium, 08-31 |
| the card is not cut off by its column     | `'start'` removed from `POPOVER_COLUMNS`                | `the strip below the Start cell looks the same with the card open · expected true to be false` | Chromium, 08-31 |

The two gestures are asserted apart rather than as one "the card opens", because
`onFocus`'s deletion is invisible to a case that has already hovered. The
clip check is a screenshot and not a rectangle for the reason the folded step
cell's own case gives: a clipped box still reports its full geometry, and a card
takes no pointer so `elementFromPoint` cannot see it either.

## What is measurable about "instant", and what is not

A native tooltip is drawn by the browser and is not in the DOM, so no test can
compare its delay against this card's. Two observable things stand in for it,
and both are asserted: the cell carries **no** `title` at all (so there is no
native tooltip to be slow), and the card is open in the **first frame read**
after the pointer arrives — one read, never a `toBeVisible` retry, because a
retry would wait ten seconds for a card that opens on a timer and call it a
pass. That is `hover-cards.spec.ts`' own rule for the folded cell, reused.
