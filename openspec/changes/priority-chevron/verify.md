# verify — `priority-chevron`

All three slices implemented. Every figure below was read off a run in this
worktree on 2026-08-31; nothing here is derived, and what was not run says so.

## Commands

| Command                                                             | Result                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `E2E_PORT_SHIFT=1900 bunx playwright test` (the whole browser gate) | **268 passed / 0 failed in 7.3m, exit 0**                  |
| `… priority-ramp`                                                   | **5 passed** (9.4s) — three new cases and the two palettes |
| `bunx nx test fe-01`                                                | **2000 passed** over 64 files, exit 0                      |
| `bunx nx lint fe-01`                                                | 0 errors, 1 pre-existing warning                           |
| `bunx nx typecheck fe-01`                                           | exit 0 — `tsc --build --force`, both projects              |
| `bunx nx format:check --all`                                        | exit 0                                                     |
| `bunx openspec validate priority-chevron --json`                    | 1 passed / 0 failed                                        |
| `bin/h2puni-gate.sh`                                                | **not run** — exits 127 on this macOS host                 |

The browser gate was run **twice**, and the second run is the one this figure
comes from. The first (268 passed, 7.3m) was taken on a tree whose
`priority-chevron.tsx` lint then rejected — `jsdoc/check-param-names` wants
`rank.rank`/`rank.ink` for `@param` on a destructured props object — so the
JSDoc moved onto `PriorityChevronProps` and the gate was re-run on the tree that
is being committed. A gate figure that is true about a file that was then edited
is the "checksums verified against the local build" fault of 2026-08-05 in
miniature, and this is why it is stated rather than reused.

`tool-bootstrap:test` is excluded and **was not run**: pre-existing timeout on
this host, recorded in `teams-and-assignees/verify.md`.

## Failure proofs (R5)

| Check                                       | Fault injected                                              | Observed failure                                                                                    | Watched         |
| ------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------- |
| five ranks are five **drawings**            | every `GLYPH_POINTS` entry set to `up`'s single polyline    | `expected 1 to be 5` — **and the five-names line beside it stayed green**                           | jsdom, 08-31    |
| the shapes land on the right rungs          | `GLYPH_SHAPES` reversed                                     | `expected [ Array(5) ] to deeply equal [ 'up-double', 'up', 'level', …(2) ]` — 1 failed \| 4 passed | jsdom, 08-31    |
| the glyph does not swallow the cell's click | `pointerEvents: 'none'` deleted                             | `a click on the glyph did not reach the cell underneath it · expect(locator).toBeVisible() failed`  | Chromium, 08-31 |
| an unprioritised row shows none             | `paint !== null &&` dropped, glyph given `paint?.rank ?? 0` | `expect(locator).toHaveCount(expected) failed · Expected: 0 · Received: 1`                          | Chromium, 08-31 |
| the widest priority is not clipped          | the 2px gap put back (10px of leading room)                 | `the widest priority is clipped by its own cell · Expected: <= 0 · Received: 1`                     | Chromium, 08-31 |

## The vacuity this change was written around

"Five ranks show five glyphs" is satisfiable by five identical drawings under
five different `data-priority-glyph` values — a column of one shape, and a
reader none the wiser. So the assertion is on the polylines and not only on the
names, and the injection above was watched leaving the names line **green**
while the geometry line went red. The names still carry their own case, because
a table transposed by one rung would satisfy the geometry check and be wrong on
every row.

The browser case has the mirror of the same problem: with the glyph deleted
outright, a click at its coordinates lands on the input underneath and the list
still opens. The glyph's 8×8 box is therefore asserted **before** the click, and
the click is aimed at that box's own centre.

## The check that changed the design

`shares the 48px column with the widest priority anybody can type` failed the
first time it was run. The glyph shipped with a 2px gap — 10px off a 48px
column that `table-frame.ts` budgets as "four digits and the 8px of padding" —
and `9999` clipped by one pixel. The non-goal says the column does not grow to
pay for a glyph, so the **gap** went: the digits are right-aligned and supply
their own air at every width but the widest, and the `viewBox` insets its
polylines by a unit on each side, so nothing reads as flush. The measurement is
written into `PRIORITY_GLYPH_ROOM_PX` and into `table-frame.ts` beside the 48.

One pixel of slack is not much, and the budget is now measured on every run
rather than believed.
