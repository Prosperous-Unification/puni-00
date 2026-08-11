# verify — gantt-declutter

Run 2026-08-11, branch `change/gantt-declutter`, worktree
`~/wd/puni/wt-gantt-declutter` off `origin/main` at `01a6bed`.

## Commands

| Command                                                      | Result                                                                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                                 | pass, after `prettier --write` on the three touched files and `tasks.md`                                                            |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | pass — `Successfully ran targets test, lint, typecheck, build for 21 projects`                                                      |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json`      | 26 items, 26 passed                                                                                                                 |
| `bun run e2e`                                                | **NOT RUN.** Chromium will not launch on this host: `chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0`. |

`apps/fe-01` vitest: 1100 passed across 45 files; `gantt-panel.test.tsx` 90,
one above the count it started at — five cases added (three about the switch,
one about a hand-off, one about a caret with no bar under it), four deleted with
the marks they described, and three rewritten.

Every figure in this file is from the re-run after the cross-review fixes
(caret filter, the `localStorage` write moved out of the state updater, and the
stale doc comments), not from the first pass.

**On the browser gate.** Ports 3100/3200/4200 were checked with `ss -ltnp` and
were clear, so `LLM_README.md`'s `reuseExistingServer` landmine is not what
stopped this: the three dev servers started fine and the browser itself could
not. Installing Playwright's system libraries is a change to the box rather than
to this branch, so it was not made. **Every e2e edit in this change is therefore
unwatched — CI's `pixels` job is its first browser run.** Three of its cases
assert marks this change removes, and they were rewritten blind against the
selectors the panel now emits.

## What the chart draws, measured

A fresh ten-leaf, two-phase plan — one parent, ten leaves, Dev estimated and QA
not on every leaf, nine finish-to-start dependencies — rendered through
`GanttPanel` and its marks counted. Once with `gantt-panel.tsx` from
`origin/main` and once with this branch's, everything else identical.

| Mark                      | Before |  After |
| ------------------------- | -----: | -----: |
| Rows (`data-gantt-label`) |     11 | **11** |
| Bars                      |     20 |     10 |
| On-bar labels             |     20 |     10 |
| Parent brackets           |      1 |      0 |
| Arrows + heads            |     18 |      0 |
| **Drawn marks**           | **59** | **20** |

The row count is the one that must not move, and it does not: the chart draws a
row per row of the plan, the parent's included and empty.

## Failure proofs (R5)

Every fault injected on the real production call path, watched failing, then
reverted. Each `Proof:` comment beside the code quotes the same output.

| #   | Check                                            | Injected fault                                                                     | Observed failure                                                                                                                                                                                                                   |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A stored arrows answer must be a boolean         | the type check replaced by `claimed === true \|\| (typeof claimed === 'string' …)` | `2 failed \| 90 passed` — `refuses a stored answer that is not a boolean…` on `expected 'true' to be 'false'`, `refuses storage that is not JSON at all…` on `expected '{not json' to be null`                                     |
| 2   | The arrows open **off**                          | `useState(rememberedArrows)` → `useState(true)`                                    | `9 failed \| 83 passed` — `opens with no arrows at all…` on `expected 'true' to be 'false'`, and five geometry cases on the helper's `the arrows switch was pressed and no arrow was drawn`                                        |
| 3   | The answer is written when the switch is pressed | the `localStorage.setItem` in `onClick` deleted                                    | `1 failed \| 89 passed` — `opens with the arrows a fresh panel is remounted onto` on `expected 'false' to be 'true'` (re-watched after the write moved out of the state updater)                                                   |
| 4   | A parent's row draws no mark                     | the ghost rect's `placed.brackets` block put back                                  | `3 failed \| 86 passed` — `draws no mark of its own on a parent's row`, `leaves a zero-projection parent's row empty…`, `puts the bar, the caret, the tick…` on `expected <rect …(6)></rect> to have a length of +0 but got 1`     |
| 5   | A parent's **row** stays on the chart            | `rowCount` and the label rail taken from the rows something is drawn on            | `7 failed \| 85 passed` — the two above on `expected …(2) to have a length of 3 but got 2`, and five of `the chart mirrors the plan` on lists missing `010 - Hull`                                                                 |
| 6   | Only costed slices are drawn                     | `drawnBars` given `placed.bars` whole                                              | `4 failed \| 85 passed` — `draws no mark at all for a slice nobody estimated`, `draws the width it is given…`, `marks a zero-day estimate with a tick…`, `draws no hand-off line…`, each on an `SVGElement` where null is asserted |
| 7   | A hand-off to an undrawn slice is not drawn      | `drawnLinks` given `placed.personLinks` whole                                      | `1 failed \| 88 passed` — `draws no hand-off line to a slice that is not drawn`                                                                                                                                                    |
| 8   | A caret needs a bar to stand over                | `drawnFlags` given `placed.notBeforeFlags` whole                                   | `1 failed \| 89 passed` — `draws no not-before caret on a row that draws no bar`, on an `SVGElement` where the parent's caret is asserted null                                                                                     |

Two things about the shape of these. Faults 4 and 5 are the two halves of one
requirement pulling in opposite directions — the mark must go and the row must
stay — and neither test can pass while the other's fault is in. And the helper
that asks for the arrows (`askForTheArrows`) throws when the press draws nothing,
which is why fault 2 took five geometry cases with it rather than leaving them
quietly measuring an empty chart.

## Not watched

- **Every e2e assertion in this change.** See the browser-gate note above. The
  cases rewritten are `draws the arrow head and the caret where they can be
seen` (bracket measurements out, row-count alignment in), `paints an arrow
that routes off either end of the schedule` (arrows asked for first), and two
  new ones: `opens with the arrows off, and keeps the answer through a reload`
  and `draws a bar for the work somebody costed, and none for the rest`.
- The **absence** assertions on `[data-gantt-bracket]` can only be broken by
  putting the drawing back, which is fault 4 above. There is no other fault that
  makes a mark nothing draws appear, and a check about a removal cannot have one.

## CI's first browser run

`pixels` on the first push: **1 failed, 123 passed**. Every rewritten and new
case in `gantt.spec.ts` passed in Chromium, including both about the switch.

The failure was a case this change did not touch — `flips a surface above a bar
that has no room below it` — and it failed for the change's own reason: its
fixture adds sixteen roots nobody estimates, so the tall chart it builds used to
end in thirty-two ghost bars and now ends in **empty rows**. The last bar on the
chart is `010.2`'s, up at row 2, and the surface asserted at the bottom of the
window never opened there. The fixture now costs those extra rows
(`costedExtras`), which is what "a bar with no room below it" has to mean on a
chart that only draws costed work.

## Coordination

`gantt-geometry.ts` carries no logic change here — the only edits to it are five
doc comments that described brackets and assumed spans as **drawn**, which they
have not been since this change (`GanttRow`, `GanttRow.leaf`, `PlacedBar`,
`PlacedBracket`, `ASSUMED_UNESTIMATED_WORKDAYS`). Not one number it computes
moved. `change/dep-waits-on-first-role` is moving the arrow anchors in that file;
the two meet only in `arrowRoute`'s inputs, and this change alters no route — it
decides whether routes are drawn at all, and starts at "no".
