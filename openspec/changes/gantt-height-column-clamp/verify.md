# verify — `gantt-height-column-clamp`

Slices 1, 2 and 4 are implemented **and now run in a browser**. Slice 4 grew a
second half (4.2) that the browser found. Slices **3 and 5 are not implemented**
and not ticked; 3 is now refused on measurement rather than on argument, and 5
belongs to `unified-scroll-docking`. Slice 6 is partly run.

Everything below marked "measured" or "watched" is Chromium output from
2026-08-30, run as `CI=1 E2E_PORT_SHIFT=900 bunx playwright test --config
apps/fe-01/playwright.config.ts …` from the workspace root — the shifted ports
being the whole point, because 3100/3200/4200 were held by a dev server and
`reuseExistingServer: !isCi` would have measured that checkout
(`LLM_README.md`'s landmine).

## The fault, as first measured

Chrome, 2026-08-29, `localhost:4200`, viewport 963px, one project with the chart
shown. Kept for the record; the browser gate's own figures are below it.

| Quantity                                       | Measured                                               |
| ---------------------------------------------- | ------------------------------------------------------ |
| plan column                                    | top 49, bottom 955 → 906px                             |
| toolbar / table `min-height` / handle / footer | 68 / 320 / 6 / 24 = 418                                |
| room actually available for the panel          | **488**                                                |
| `clampedGanttHeight` cap (`0.8 × 963`)         | **770**                                                |
| drag 1 (up 178px): panel                       | 159.71 → 337.71 — and `handleTop` **unchanged at 569** |
| drag 2 (up 419px): panel                       | 757, bottom at **1200** vs column bottom **955**       |
| `document.scrollHeight` after drag 2           | 963 — unchanged, no scrollbar                          |
| overhang unreachable                           | **245px**                                              |

## The layout, measured in the gate

Chromium, 1400×900 (the project's viewport), the three-row fixture
`seedPlan` builds, read out of the live DOM. `section[data-slice-count]` is the
column.

| Child (in order)                   | Height    | `min-height` | `flex-shrink` | `margin-bottom` |
| ---------------------------------- | --------- | ------------ | ------------- | --------------- |
| plan toolbar                       | 68        | `auto`       | 0             | 6               |
| table frame (`[data-table-frame]`) | 320       | `320px`      | 1             | 0               |
| dock slack (`GANTT_DOCK_SLACK`)    | 312 → 0   | `0px`        | 1             | 0               |
| height handle                      | 6         | `auto`       | 0             | −6              |
| **the panel**                      | 113 → 425 | `auto`       | 0             | 0               |
| footer                             | 24        | `auto`       | 1             | 0               |
| toast stack                        | 0         | `0px`        | 1 (`fixed`)   | 0               |

- column: top 49, bottom **892**, height **843**; no padding, no border.
- what the others keep: `6 + 68 + 320 + 0 + 0 + 24` = **418**
  (the frame at its `320px` floor, the dock slack at its `0px` one, the handle's
  6px cancelled by its −6 margin, the footer at the height it stands at because
  its `min-height` is `auto`, the toast stack skipped for being `fixed`).
- **room = 843 − 418 = 425**, which is exactly the `max-height` the panel is
  given and exactly the height a maximal drag settles at.
- at rest: panel 113, `max-height` `360px` — `max-h-[40vh]` of a 900px window,
  which is the untouched default share.
- after `dragTheEdge(-400)`: panel **425**, `max-height` **425px**, bottom
  **868** against a column bottom of 892, and
  `document.documentElement.scrollHeight − clientHeight` = **0**.

Other windows, same fixture:

| Window   | Column | Room / panel after a maximal drag    |
| -------- | ------ | ------------------------------------ |
| 1400×900 | 843    | 425                                  |
| 1400×700 | 643    | 225                                  |
| 1400×500 | 443    | **25** — see the open finding below  |
| 768×900  | 843    | 389 (the toolbar takes a second row) |

## What was changed

Unchanged from the 2026-08-29 write-up:

- `clampedGanttHeight(px, availablePx)` caps at `min(GANTT_CEILING_PX,
availablePx)`; `GANTT_VIEWPORT_SHARE` is deleted.
- `ganttRoomInColumn(column, panel)` answers the room off the live boxes and
  never from a constant, `null` meaning "nothing has been laid out".
- The handle measures the room once per gesture, at `pointerdown`.
- `appliedGanttHeight(claim, room)` re-clamps the claim without rewriting it.
- The panel's `max-height` is the measured room, falling back to `100%`.
- The panel keeps `shrink-0` — and that is now a measured decision, below.

Added this session, in `apps/fe-01/src/components/wbs/wbs-table.tsx` (the only
source file touched, 16 lines, all inside the existing measuring layout effect):

- **the `ResizeObserver` observes every child of the column as well as the
  column** (task 4.2). Without it, a child that changes height while the column
  does not is never noticed, and the panel is left drawn against a stale room.

## Commands

| Command                                                  | Result                                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `bunx nx run fe-01:typecheck --skip-nx-cache`            | **pass** at 20:37 with this change in place; **fails now**, on another agent's in-flight lines — see below |
| `bunx nx run fe-01:lint --skip-nx-cache`                 | **pass** — 0 errors, 1 pre-existing warning (`wbs-table.tsx:4326`, `useMemo` deps, untouched)              |
| `bunx nx run fe-01:test --skip-nx-cache`                 | **pass** — 61 files, **1954 passed**, 0 failed                                                             |
| `CI=1 E2E_PORT_SHIFT=900 … playwright test … gantt`      | **pass** — 46 passed, 1 skipped (`dragging up moves the boundary up`, `test.fixme`)                        |
| `CI=1 E2E_PORT_SHIFT=900 … playwright test` (whole gate) | **243 passed, 1 skipped, 4 failed** — all four accounted for below                                         |
| `bunx prettier --write` on both changed files            | applied                                                                                                    |
| `bunx openspec validate gantt-height-column-clamp`       | `Change 'gantt-height-column-clamp' is valid`                                                              |
| `bin/h2puni-gate.sh`                                     | **not run** — exits 127 on this host                                                                       |
| `openspec validate --all --json`                         | **not run**                                                                                                |

### The two typecheck errors are not this change's either

The tree grew a great deal of `estimate-weights-and-rounding` between the run
above and the end of the session, and `fe-01:typecheck` now reports two errors,
neither on a line this change wrote:

```
apps/fe-01/src/components/wbs/project-settings-modal.tsx(418,42): error TS2339: Property 'estimating' does not exist on type '{ teams: … priorities: … steps: … }'.
apps/fe-01/src/components/wbs/wbs-table.tsx(11,38): error TS2307: Cannot find module '@wbs/domain/estimate' or its corresponding type declarations.
```

The second is a missing path mapping rather than a missing module:
`tsconfig.base.json` maps `@wbs/domain/estimate`, `apps/fe-01/tsconfig.app.json`
carries its **own** `paths` block, and that block has not been given the entry.
`domain:typecheck` is green. Both belong to the change adding that import.

**One hazard to record, because it is this session's own.** To prove the three
estimate failures below were not this change's, `wbs-table.tsx` was reverted to
`HEAD` with `git checkout --`, four tests were run against it, and the file was
put back from a snapshot taken moments earlier. Another agent edits that file
concurrently, and an edit made inside that ~40s window would have been
overwritten by the restore. Nothing suggests one was — the snapshot carries that
agent's `pertWeights` / `estimateRounding` work — but the window existed and is
better written down than assumed away.

### The four browser failures are not this change's

Three of them are the estimate arithmetic another agent has uncommitted in
`libs/domain/src/estimate.ts` and `apps/be-01/src/repository/`, and they were
watched failing with **this change's `wbs-table.tsx` reverted to `HEAD`**:

- `layout.spec.ts` → `holds a trio and its figure on one line of a folded step cell`
- `layout.spec.ts` → `stands a parent’s figure in the same slot as its leaves’`
- `mobile.spec.ts` → `types a whole estimate on a card without a slash, and it survives a reload`
  (`expect(locator).toHaveText` on `Final 3.7 days`)

The fourth, `keyboard.spec.ts` → `a held Ctrl+D arms once and never deletes`, is
a **flake**: it failed once in the whole-gate run and passed on re-run both with
this change's `wbs-table.tsx` and with `HEAD`'s. Recorded rather than dismissed;
it is not this change's line, and it is not reliably reproducible either way.

## Failure proofs (R5)

Every row had the named fault injected on its own, the test run, the failure
read off the terminal, and the fault reverted. The quoted strings are that run's
output — none is written from an expectation.

| Check                                                  | Fault injected                                                                        | Test that saw it                                                               | Observed                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| the cap is the column's room                           | `Math.min(GANTT_CEILING_PX, 0.8 * window.innerHeight)` restored                       | `caps at the room it is given` (jsdom)                                         | `expected 614.4000000000001 to be 488` — **yes**, 2026-08-29                                                                          |
| a column nothing laid out is not a column with no room | the handle's fallback removed (`roomPx: room ?? 0`)                                   | `follows the pointer while dragged, and remembers where it was let go` (jsdom) | `expected '84px' to be '450px'` — **yes**, 2026-08-29                                                                                 |
| an unresolvable length is 0, not NaN                   | `lengthPx` reduced to a bare `Number.parseFloat`                                      | `answers nothing where nothing has been laid out` (jsdom)                      | `expected NaN to be null` — **yes**, 2026-08-29                                                                                       |
| the ceiling is the column                              | `maxHeight: '80vh'` restored                                                          | `the panel's ceiling is its column, not the window` (jsdom)                    | `expected '80vh' to be '488px'` — **yes**, 2026-08-29                                                                                 |
| a re-clamp does not swallow the unmeasured case        | `clampedGanttHeight(claimPx, roomPx ?? 0)`                                            | `draws the claim unclamped while nothing has measured the column` (jsdom)      | `expected 84 to be 700` — **yes**, 2026-08-29                                                                                         |
| **the panel stays in its column**                      | the viewport cap **alone**                                                            | `stays inside the column it lives in` (Chromium)                               | **PASSED** — the measured `max-height` held it at 425. 2026-08-30                                                                     |
| **the panel stays in its column**                      | `maxHeight: '80vh'` **alone**                                                         | `stays inside the column it lives in` (Chromium)                               | **PASSED** — the measured clamp held the height at 425. 2026-08-30                                                                    |
| **the panel stays in its column**                      | **both together** — the regime this change replaced                                   | `stays inside the column it lives in` (Chromium)                               | `the chart is drawn past the bottom of its column · Expected: <= 893 · Received: 956` — **yes**, 2026-08-30                           |
| **the room is measured, not derived**                  | `ganttRoomInColumn` → `columnHeight − (68 + 6 + 320 + 0 + 24)`                        | `re-measures the room when the toolbar wraps under a new control` (Chromium)   | `Expected: <= 893 · Received: 904` — **yes**, 2026-08-30                                                                              |
| **the room is measured, not derived**                  | the same derived sum                                                                  | `stays inside the column it lives in` (Chromium)                               | **PASSED** — 1400×900 is the one size where the constants are exactly right. 2026-08-30                                               |
| **the room is re-measured on a child's resize**        | the per-child `observe` loop deleted (the column alone observed — what shipped)       | `re-measures the room when the toolbar wraps under a new control` (Chromium)   | `the chart is drawn past the bottom of its column after the toolbar wrapped · Expected: <= 893 · Received: 904` — **yes**, 2026-08-30 |
| **a re-clamp does not rewrite the claim**              | `setGanttHeightPx` + `rememberGanttHeight` on the measured room, in the layout effect | `a wider window gives the dragged height back` (Chromium)                      | `the chart did not get the dragged height back · Expected: 425 · Received: 225` — **yes**, 2026-08-30                                 |
| **a re-clamp does not rewrite the claim**              | the same fault                                                                        | `a height dragged in a tall window is clamped in a short one` (Chromium)       | `expect(received).toEqual(expected) … − "425" + "225"` — **yes**, 2026-08-30                                                          |
| the re-clamp's **height** half                         | `appliedGanttHeight` removed, the raw claim passed to the panel                       | `a height dragged in a tall window is clamped in a short one` (Chromium)       | **PASSED** — the honest hole, written up below. 2026-08-30                                                                            |
| the panel does not split an over-constraint            | `shrink-0` dropped from the non-full-screen arm                                       | `does not split an over-constraint with the table frame` (jsdom)               | `expected false to be true` — **yes**, 2026-08-29; and now measured in Chromium, below                                                |
| the boundary follows the pointer                       | —                                                                                     | `dragging up moves the boundary up`                                            | **NO — `test.fixme`; slice 5 is not this change's**                                                                                   |

### Two checks that would have been vacuous, and are not now

1. **Containment is a conjunction.** `stays inside the column it lives in` can
   only fail when _both_ the clamp and the `max-height` are the viewport's; each
   half alone is contained by the other. A `Proof:` naming one of them would
   have named a fault the line never sees — the `name-links-and-height` failure
   mode, one change earlier. The three injections are written into the test.
2. **The derived-room negative had to be run at 768, not at 1400.** At the
   project's own viewport the constants `68 + 6 + 320 + 0 + 24` come to exactly
   the 418 the measurement does, so the derived sum passes the containment test
   it was supposed to fail. The negative is only a check at a width where a
   child's real height differs from its constant.

## The finding on slice 3, decided in a browser

`shrink-0` was dropped from the non-full-screen arm and three cases measured in
Chromium on 2026-08-30. `frame` is `[data-table-frame]`; the long plan is
`seedPlan(page, …, { extraRows: 16 })`.

| Case                           | Shipped (`shrink-0`)                 | `shrink-0` dropped                             |
| ------------------------------ | ------------------------------------ | ---------------------------------------------- |
| 3 rows, 1400×900, drag −400    | panel **425**, frame 320, bottom 868 | panel **425**, frame 320, bottom 868           |
| 20 rows, 1400×900, **at rest** | panel **360** (40vh), frame 385      | panel **279.55**, frame 465.45                 |
| 20 rows, 1400×900, drag −400   | panel **425**, frame 320, bottom 868 | panel **242.38**, frame **502.63**, bottom 868 |
| 3 rows, 768×900, drag −400     | bottom **904** vs column 892         | bottom **868** — contained                     |

The 2026-08-29 reasoning is **right, and it understated the cost**. It predicted
the panel landing 67px short of a 512px drag; the browser says **182.62px short
of a 425px drag** on any plan longer than the frame's own 20rem floor, and — the
part the reasoning never anticipated — the shrinkable panel also collapses the
_default_ share from 360 to 279.55 before anything is dragged at all, because
the frame's basis is its whole content and it simply takes the space.

The one thing a shrinkable panel did fix is the last row: the 12px overhang at 768. That is fixed by **4.2** instead, by re-measuring, and at no cost to any
gesture. So `shrink-0` stays, the delta spec's "the panel SHALL be able to give
space back" is met by the re-clamp, and the jsdom guard
`does not split an over-constraint with the table frame` now has a browser
measurement behind it rather than a spec reading.

## The finding on slice 5, unchanged and untouched

`shrink-0` is not what stops the boundary following the pointer, and dropping it
does not fix that symptom: `flex-shrink` is consulted only for _negative_ free
space, and the symptom is positive leftover sitting below the panel. Where that
leftover goes is `unified-scroll-docking`'s decision — its follow-up has since
put an explicit `GANTT_DOCK_SLACK` spacer in the column to hold it, which is why
the panel now docks to the column's bottom. Whether the boundary should move
with the pointer is that change's question. The assertion stays `test.fixme` and
was not touched this session.

## Open findings this session's measurements turned up

1. **The floor does not win over the `max-height`.**
   `clampedGanttHeight`'s JSDoc says a column shorter than `GANTT_MIN_PX` (84px)
   gets a panel at the floor, "clipped by the column". Measured at 1400×500: the
   column has 443px, the room is 25, and the panel is drawn **25px tall** —
   `height: 84px` with `max-height: 25px`. The delta spec's scenario _the floor
   wins over the cap_ is therefore false in a browser, and `stops at the floor,
and is still there to be dragged back open` never sees it because at 900px
   there is room to spare. Not fixed here: raising the `max-height` to the floor
   puts the panel back outside its column, which is the fault this change
   exists for, so the two requirements genuinely conflict on a very short
   column and the resolution is a decision, not a patch.
2. **`appliedGanttHeight`'s clamping is not observable in a browser.** With it
   removed and the raw claim handed to the panel, every Chromium assertion here
   stays green, because the panel's `max-height` is the same measured room and
   clamps the drawn height identically. Its jsdom cases assert the _value_ of
   `style.height`, which is a fact about the call rather than about the layout.
   By the house rule — _delete the guard whose removal you cannot see_ — it is a
   candidate for deletion; it is left in place because what it uniquely buys is
   that the claim in state is never the clamped number, and deciding that is
   worth its own slice rather than a drive-by.

## Skipped or unavailable checks

- `bin/h2puni-gate.sh` — **not run**; it exits 127 on this host.
- `openspec validate --all --json` — **not run**. `openspec validate
gantt-height-column-clamp` was, and says valid.
- The whole browser gate was run on `E2E_PORT_SHIFT=900`, never on
  3100/3200/4200, which a dev server held throughout.
- **The `max-h-[40vh]` default share is untouched, and it is outside the column
  at a short window before anything is dragged.** The inline `max-height:
roomPx` is written only once a height exists, so while `heightPx` is `null`
  the panel is bounded by that `vh` and by nothing else. Measured at 1400×900 it
  is 360 against a room of 425 and the panel sits at 113, inside. Measured at
  1400×500: the column is 443, its other children keep 418, and the panel's own
  content is 113 — the column is over-constrained by 88 with nothing left able
  to shrink, and the panel's bottom stands at **556 against a column bottom of
  492**, at rest. That is a third face of this change's fault living in the arm
  it did not touch; no scenario here covers it, and no test pins it.
