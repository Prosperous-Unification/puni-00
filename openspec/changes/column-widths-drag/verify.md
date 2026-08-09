# verify — `T1 column-widths-drag`

Branch `change/column-widths-drag`, rebased onto `main` at `e9a1308` after main
moved three commits during the work. Not pushed, not merged.

## What was built

`FrameLayoutState` gained `columnWidthOverrides?: Map<string, number>`, so a
dragged width reaches the `<colgroup>`, the table minimum, the folded minimum
the Phases dialog quotes and the pinned offsets from **one** `frameLayout`
call. `table-frame.ts` gained `defaultWidthFor` (the width table's own answer,
which the reset returns a column to), `floorFor`, `clampColumnWidth`,
`sizableColumn` and `WIDEST_COLUMN = 600` — the one constant the drag clamp and
the stored-width check both read. `wbs-table.tsx` gained the
`wbs.columnWidths.<projectId>` key read as a claim, a hand-rolled
`ColumnResizeHandle` on every header whose column declares a width, and a
`Reset column widths` control in the table renderer's own branch — deliberately
not in `toolbarControls`, which the phone's Plan actions sheet renders.

## Commands

All run from this worktree, 2026-08-09.

| Command                                                                      | Result                                       |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| `bunx nx format:check --all`                                                 | pass, no output                              |
| `bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache` | `Successfully ran targets … for 21 projects` |
| `bunx openspec validate --all --json`                                        | 57 items, 57 passed, 0 failed                |
| `bunx playwright test --config=tmp/pw-shifted.config.ts`                     | **90 passed** (86 on main + this change's 4) |
| `bunx vitest run` in `apps/fe-01`                                            | 43 files, 955 tests, all passing             |

`bun run e2e` was **not** used: `reuseExistingServer: !isCi` makes it measure
whatever holds 3100/3200/4200, which on this machine is another checkout
(LLM_README landmine). `tmp/pw-shifted.config.ts` is the repository config with
this worktree's `repoRoot` and ports 3131/3231/4231, so the three servers under
test are this tree's own. `bun run dev:setup` was run first; `apps/be-01/.env`
carries `JWT_SIGNING_KEY_CURRENT`.

## Failure proof

Every row was watched. The fault was injected, the named test observed failing
with the message quoted, the fault reverted, and the test observed passing
again. Each is also recorded in a `Proof:` comment beside the line it guards.

| #   | Guarded line                                                            | Injected fault                                                                                       | Test that observed it                                                                                                                                 | Observed failure                                                                                      |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `frameLayout` pinning from the widths it resolved                       | pinned arm re-pointed at `defaultWidthFor`                                                           | `table-frame.test.ts` — `lays out, adds up, folds and pins from the one number it resolved`                                                           | `expected { left: 24, width: 169 } to deeply equal { left: 24, width: 209 }`                          |
| 2   | `phases-dialog.tsx` resolving the project's real role ids               | ids replaced by `phase0`…`phaseN` from `roles.length`                                                | `phases-dialog.test.tsx` — `quotes a phase's dragged width, because it resolved that phase's own column`                                              | `expected 'PhasesPhasesThe phases every work ite…' to contain '≥1167px'`                              |
| 3   | `floorFor` taking the narrower of 36 and the column's own default       | floor pinned to a flat `NARROWEST_COLUMN`                                                            | `table-frame.test.ts` — `clamps a drag to this column's own floor and to the one shared ceiling` (and `has a floor that does not move with the plan`) | `expected 36 to be 24`                                                                                |
| 4   | `widthFor` resolving the default before any override                    | flexible short-circuit `return FLEXIBLE_FLOOR` in `floorFor`                                         | `table-frame.test.ts` — `refuses the flexible column a width and a floor alike, override or not`                                                      | `expected function to throw an error, but it didn't`                                                  |
| 5   | the handle rendered only where a width is declared                      | handle rendered for every leaf column                                                                | `wbs-table.test.tsx` — `offers a handle on every column that declares a width, and on none that does not`                                             | `expected [ 'drag', 'number', 'name', …(14) ] to deeply equal [ 'drag', 'number', 'depends', …(13) ]` |
| 6   | `isWidthOverrides` whole-key guard                                      | guard deleted                                                                                        | `wbs-table.test.tsx` — `drops storage that is not a set of column widths, key and all`                                                                | `TypeError: Cannot convert undefined or null to object`, thrown out of the mounting render            |
| 7   | `sizableColumn` per-entry id check                                      | check deleted                                                                                        | `wbs-table.test.tsx` — `drops an entry naming a column nothing can size, and keeps the one beside it`                                                 | `UnknownColumnError: No declared width for column "serviec"` out of the render                        |
| 8   | the `[floorFor, WIDEST_COLUMN]` range check                             | check deleted                                                                                        | `wbs-table.test.tsx` — `drops a width outside the range a drag can produce…`                                                                          | `expected '1000000000px' to be '169px'`                                                               |
| 9   | the same range check, against a non-finite width                        | check deleted                                                                                        | `wbs-table.test.tsx` — `drops a width that is not a finite number, and keeps the one beside it`                                                       | `expected '' to be '56px'`, with the table's `min-width` reading `NaNpx`                              |
| 10  | the range check reading `WIDEST_COLUMN` rather than a number of its own | ceiling replaced by a literal `500`                                                                  | `wbs-table.test.tsx` — `applies a width dragged as far right as it goes, on the reload after it`                                                      | `expected '169px' to be '600px'`                                                                      |
| 11  | `widthFor`'s override-over-plan precedence                              | precedence reversed, plan width first                                                                | `wbs-table.test.tsx` — `freezes a width that would otherwise move with the plan`                                                                      | `expected '56px' to be '110px'`                                                                       |
| 12  | the reset forgetting rather than snapshotting                           | reset re-written to store the widths resolved now                                                    | `wbs-table.test.tsx` — `resets to the width resolved now, not to the one that held when it was dragged`                                               | `expected '110px' to be '84px'`                                                                       |
| 13  | the reset offered only with an override in force                        | `widthOverrides.size > 0` removed                                                                    | `wbs-table.test.tsx` — `offers the reset only while there is a width to reset`                                                                        | `expected <button …(3)></button> to be null`                                                          |
| 14  | `columns` depending on `[roles, unfoldedRoles]` alone                   | `widthOverrides` added to the dep array                                                              | `wbs-table.test.tsx` — `changes a width without rebuilding a single cell of the table`                                                                | `expected <body><div>…(1)</div></body> to be <textarea …(5)></textarea>`                              |
| 15  | the reset outside `toolbarControls`                                     | reset moved into `toolbarControls`                                                                   | `plan-cards.test.tsx` — `offers no width control at all, because a card has no columns`                                                               | `expected <button …(2)></button> to be null` — the control on the sheet at 390px                      |
| 16  | the drag gesture itself                                                 | the handle's `pointerdown`/`pointermove`/`pointerup` handlers removed, leaving it rendered and inert | `e2e/layout.spec.ts` — `widens a column by dragging its header edge, and moves every pin behind it`                                                   | `Expected "209px", Received "169px"` — **and all 955 jsdom tests stayed green under the same fault**  |
| 17  | the write on drag commit                                                | `rememberWidthOverrides` call removed from `commit`                                                  | `e2e/layout.spec.ts` — `still has the width it was dragged to after the browser is reloaded`                                                          | `Expected "209px", Received "169px"`, after the reload only                                           |
| 18  | the reset forgetting, measured in a browser                             | reset re-written to store a snapshot                                                                 | `e2e/layout.spec.ts` — `gives every column back to the width the layout resolves for it now`                                                          | `Expected "169px", Received "209px"`                                                                  |

Row 16 is the point of the browser half and is recorded as the
fourteenth/fifteenth failure's shape: `offers a handle on every column that
declares a width` can see the strip arrive and can never see it do nothing,
because jsdom performs no default action for a pointer event. The fault named
in `tasks.md` 6.1 — the pinned offsets summing defaults — was **not** used,
because row 1 already catches it in jsdom and a browser-only proof has to be a
fault jsdom cannot see.

## A check that could not fail, found and not shipped

`tasks.md` 3.2 asked for three per-entry rules, each its own line with its own
negative. The middle one, `if (!Number.isFinite(width)) continue;`, was written
and its negative watched with the line deleted — and **passed**: 14 of 14 cases
green. `1e999` is the only non-finite width JSON can express, it parses to
`Infinity`, and `Infinity` is above every ceiling exactly as `-Infinity` is
below every floor; JSON has no `NaN` for the third case. The line was deleted
rather than believed, per this change's standing rule and `P phases-ui`'s
sanitizer before it. The range check refuses both, and both storage cases now
watch that one line (rows 8 and 9). Recorded in `AGENTS.md` under R5; it did
not ship, so the shipped tally stays at seventeen.

## Not verified

- **7.2, Dany looks at it on dev.** Not done. The branch is unpushed and
  unmerged, and `bin/dev-deploy.sh` runs from h1claw against a pushed checkout.
  The widths themselves — 36px floor, 600px ceiling, 6px grab strip — are a
  judgement call about a table and no test can settle them.
- **`gw-01:test` is flaky on this machine and unrelated to this change.** Nx
  labels it flaky itself. `fan-out.integration.test.ts`'s `shows each socket
only the names in the project it subscribed to` waits 3s for a roster
  (`untilRostered`) and misses it under load: on this branch it failed twice and
  passed twice across four runs of `bunx nx run gw-01:test --skip-nx-cache`, and
  the full gate run recorded above was green. gw-01 shares no code with fe-01
  and this change touches only `apps/fe-01`.
- **Two browser tests flake under a full-suite run, on `main` as much as here.**
  `gantt.spec.ts`'s `draws the arrow head, the caret and the bracket where they
can be seen` and `name-cell.spec.ts`'s `a peer's longer name arriving while
the cell is focused is whole once it is left` each failed on some full runs
  and passed in isolation. Both were reproduced on `main` with none of this
  change applied (a full run there failed on exactly those two), so they are
  pre-existing and not this change's. The final two full runs on this branch
  were 89/90 and 90/90.
- **Touch and pen pointers.** The handle sets `touch-action: none` and takes
  pointer capture, so a touch drag should behave as a mouse drag does, but the
  only pointer any test drives is Chromium's mouse. Below 768px the plan is
  cards and there are no columns to drag at all, which is most of why this is
  not urgent.
- **A second concurrent drag.** The handler refuses a `pointermove` whose
  `pointerId` is not the one it was grabbed with; nothing exercises two
  pointers at once.
