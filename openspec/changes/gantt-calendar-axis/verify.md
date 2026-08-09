# Verification — `gantt-calendar-axis`

Branch `change/gantt-calendar-axis`, from `main` @ `75d01a8` (which descends from the plan's
stated base `4f2b583`). All output below is fresh, taken 2026-08-09 on darwin/arm64.

## Commands

| Command                                                      | Result                                          |
| ------------------------------------------------------------ | ----------------------------------------------- |
| `bunx nx format:check --all`                                 | green, no output                                |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | green, 21 projects                              |
| `bunx openspec validate --all --json`                        | `items: 50, passed: 50, failed: 0`              |
| `bunx vitest run --root apps/fe-01 …gantt-geometry.test.ts`  | `Tests 61 passed (61)`                          |
| `bunx vitest run --root apps/fe-01 …gantt-panel.test.tsx`    | `Tests 46 passed (46)`                          |
| `bunx nx test domain`                                        | `30 pass, 0 fail`                               |
| the browser gate, `apps/fe-01/e2e/gantt.spec.ts`             | `7 passed`, twice in a row (see the note below) |

`nx` reported `gw-01:test` as a flaky task in the run-many; it passed. Nothing in this change
touches gw-01.

### The browser gate did not run through `bun run e2e`, and why

`bun run e2e` **silently measured a different checkout.** The committed Playwright config sets
`reuseExistingServer: !isCi`, and ports 3100/3200/4200 were held by a `bun run dev` from
`/Users/danylofedorov/wd/puni/wbs-tool-v1`. Under it, 66 of the 69 browser tests passed against
code this worktree had never built, and the two rewritten gantt assertions failed describing a
chart that checkout does not draw — the axis it served printed `2026-08-14, 2026-08-17` with no
weekend cell between them.

This change's browser proofs were therefore taken through an **uncommitted** copy of the config
on ports 3111/3211/4211 with `reuseExistingServer: false`, starting this worktree's own three
servers (the same ports `gantt-view`'s verify.md used). The file is deliberately not committed;
the hazard is now a landmine in `LLM_README.md` and an entry in `AGENTS.md` under R5.

### Pre-existing browser failures, not this change's

Run against this worktree, three specs this change does not touch fail. Each was re-run at the
base commit `75d01a8` with the same config and **failed identically there**:

- `mobile.spec.ts` › `keeps the focus and the half-typed word when somebody else edits another
card` — `expect(locator).toHaveValue(expected) failed`
- `name-cell.spec.ts` › `a peer's longer name arriving while the cell is focused is whole once
it is left` — `expect(locator).toHaveValue(expected) failed`
- `layout.spec.ts` — one failure per run, a different test each time (`opens the folded role's @
picker…`, `drives the actions menu from the keyboard…`, `lays the heading row out…`), all
  `toBeVisible`/`toHaveValue` timeouts. Flaky at the base as well.

`name-title-body` is mid-flight on this base with its browser proofs outstanding, which is the
likeliest home for the first two. **Not investigated further and not claimed fixed.**

## Failure-proof table

Every check below was watched failing with the named fault injected, then the fault reverted and
the suite watched green again. Messages are quoted as the runner printed them.

### The scale (§1)

| Check                                                     | Fault injected                                                | Observed                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `crosses a daylight-saving boundary as whole days`        | `calendarDaysBetween` parsing both ends as **local** midnight | `1 fail / 29 pass`, `Expected: 2  Received: 1.9583333333333333` under `TZ=America/New_York`                                                      |
| `ends a span that finished on the Friday at the Saturday` | `endOf` aliased to `startOf`                                  | `2 failed \| 51 passed`, both `expected 7 to be 5`; every pre-weekend case stayed green                                                          |
| `begins a Saturday project on the Monday`                 | origin taken as `startDate`, not `addWorkdays(startDate, 0)`  | `2 failed \| 51 passed`: `expected 9 to be 7`, and `refuses a start date that is not a calendar date` on `expected [Function] to throw an error` |

The rounding fault named in `tasks.md` as **not** a valid negative was not run: with the
local-midnight fault in place `Math.round` gives 2 both under `TZ=UTC` and under
`TZ=America/New_York`, so it is a check that cannot fail by arithmetic.

### Every mark, one at a time (§2.2 — eight faults, eight runs)

All eight against `every mark on the chart lands on the calendar day its workday is`, each
failing **that test alone** — `1 failed | 1 passed | 43 skipped` every time.

| Mark          | Fault injected                               | Observed                                                                     |
| ------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| bar           | `x={bar.start}`                              | `expected 5 to be 7`                                                         |
| caret         | `flag.workday` for `flag.x`                  | `expected 'M 5 2.03 L 5.285714285714286 2.09 L 5…' to match /^M 7 /`         |
| tick          | `x1={bar.start}`                             | `expected '5' to be '7'`                                                     |
| label overlay | `left: bar.start * DAY_PX`                   | `expected 'color: rgb(255, 255, 255); left: 152p…' to contain 'left: 208px'` |
| bracket       | `chart.brackets` for `placed.brackets`       | `expected 'M 0 0.5 L 0 0.18 L 7 0.18 L 7 0.5' to contain 'L 9 0.18'`         |
| arrow route   | `toX` reverted to `arrow.toStart`            | `expected 'M 5 1.5 L 5.357142857142857 1.5 L 5.3…' to contain 'L 7 2.5'`     |
| arrow head    | the head alone built from `arrow.toStart`    | `expected 'M 5 2.5 L 4.75 2.375 L 4.75 2.625 Z' to match /^M 7 /`            |
| person link   | `chart.personLinks` for `placed.personLinks` | `expected 'M 5 1.5 L 5 2.5' to be 'M 5 1.5 L 7 2.5'`                         |

### Non-zero area, width, axis, words, no-start-date (§2.3, §3, §4, §5)

| Check                                                                | Fault injected                                                            | Observed                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `refuses to compare a mark that has no area`                         | the area guard removed from `drawnBox`                                    | `expected [Function] to throw an error`; the box handed back was `{ x: 7, width: 0 }`     |
| `draws the width it is given and says the numbers it was sent`       | width taken as `stopOf(bar.start, bar.finish)` — codex 14's fault         | `expected '0' to be '2'`, estimated cases green                                           |
| `gives the SVG a user space of the calendar horizon by the rows`     | axis built from `chart.horizon` while the canvas keeps the calendar one   | `expected …(6) to have a length of 8 but got 6`                                           |
| `puts the weekend on the axis…`                                      | heavy gridline on `offset % WEEK_DAYS === 0`                              | `expected 'stroke-border/40' to be 'stroke-border'` at cell 7                             |
| `puts the weekend on the axis…`                                      | the weekend `<rect>` block deleted                                        | `expected 'nothing on the chart at [data-gantt-w…' to be '1'`                             |
| `prints the workday offsets and no weekend at all…`                  | the scale built unconditionally, so `addWorkdays` is handed `null`        | render threw `Error: not a calendar date: null`                                           |
| `reads the same dates under a bar as the row's Start and End cells`  | finish worded as `addWorkdays(start, endOf(5))` → Monday 2026-08-17       | `expected '012 - Sealing\nDev · Unassigned\n2026…' to contain '2026-08-13 → 2026-08-14'`  |
| `reads the same dates under a bar as the row's Start and End cells`  | finish worded as `addCalendarDays(start, endOf(5))` → Saturday 2026-08-15 | same assertion, same abbreviated message                                                  |
| `marks a zero-day estimate with a tick…`                             | the tick `filter` turned off                                              | `expected 'nothing on the chart at [data-gantt-t…' to be '7'`                             |
| `bands every other row…`                                             | the band `filter` turned off                                              | `expected [] to deeply equal [ '1' ]`                                                     |
| `bands every other row…`                                             | band width from `chart.horizon`                                           | `expected '6' to be '8'`                                                                  |
| `draws every other mark…` (four runs)                                | bracket / arrow / link / flag block deleted in turn                       | `nothing on the chart at [data-gantt-b… / -a… / -p… / -n…`                                |
| `draws every other mark…`                                            | flag `d` built from `flag.rowIndex`                                       | `expected 'M 2 2.03 L 7.285714285714286 2.09 L 7…' to match /^M 7 /`                      |
| `puts the person's name where the bar is…`                           | `left: bar.rowIndex * DAY_PX`                                             | `expected '40px' to be '208px'`                                                           |
| `leaves the successor's left edge alone when the two bars touch`     | `arrowRoute` back to its three-point elbow                                | `the arrow arrives from above the successor's left edge…: expected 10 to be less than 10` |
| `puts the not-before caret clear of the bar that starts on it`       | the caret's old `d`, hanging off the bar's top-left corner                | `the caret is not clear of the bar it belongs to: expected 2.18 to be less than 2.18`     |
| `says which date the caret is holding the row at`                    | the caret's `<title>` emptied                                             | `expected '' to be 'No earlier than 2026-08-20'`                                          |
| `points a filled head at the successor's start`                      | the `<path data-gantt-arrow-head>` deleted                                | `nothing on the chart at [data-gantt-arrow-head="strip->sand"]`                           |
| `drops the summary bracket's legs from its line…`                    | the four points back in their old order                                   | `the bracket's legs do not drop from its line: expected 0.18 to be greater than 0.5`      |
| `declares a canvas wide enough for a route that leaves the schedule` | viewBox back to `0 0 horizon rowCount`                                    | `expected -0.35714285714285715 to be greater than or equal to 0`                          |
| `draws an unestimated slice as a translucent, dashed bar…`           | `ASSUMED_BAR_CLASSES` emptied                                             | `expected false to be true`                                                               |

### A check that could not fail, caught before it shipped

The axis's cell count was first asserted against the canvas it stands over while the canvas was
**sized from the axis's own length** — so the named fault (axis on the workday horizon, canvas on
the calendar one) moved both and was watched **passing**, failing only on a separately written
`viewBox` literal. The canvas is now sized from the placed horizon, the two are computed apart,
and the same fault was then watched failing on `expected …(6) to have a length of 8 but got 6`.
Recorded in `AGENTS.md` under R5.

### The browser (§6.2)

| Check                                                                                | Fault injected                             | Observed                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `draws a bar at the pixel its calendar day says…`                                    | the pixel left multiplying the raw workday | `… is not 8 calendar days from the plan's first day: Expected <= 1, Received 56`                                                            |
| the same, with the plan narrowed to one week (`1/1/1`) and the fixture guard removed | the same fault                             | the pixel loop **passed**; the test then failed on the weekend cell not existing (`locator('[data-axis-day="5"]')`, `element(s) not found`) |

The second row is the vacuity `tasks.md` warned about, and it is the reason `PAST_THE_WEEKEND`
exists. One correction to the task's premise, measured rather than assumed: the **original**
`2/4/6` fixture also catches the fault, because a new project lists two roles and the unestimated
QA slice lands at workday 8 — past the weekend by accident of the fixture rather than by design.
The widened estimate puts the _estimated_ bar itself past the weekend, so the check no longer
depends on that accident.

## Not verified

- **§7.3 — dev deploy and a hand-driven Chrome at laptop width and 390×844, with Dany looking.**
  Not done. This agent did not deploy to dev, and the human review that slice asks for has not
  happened. Everything above is a local browser run.
- The committed `bun run e2e` path is **unverified for this change** — see the note above. What
  was run is the same spec files through a config on other ports; the committed config was
  observed measuring another checkout entirely.
- The three pre-existing browser failures listed above were confirmed pre-existing and otherwise
  left alone.
- Nothing was pushed, merged, or deployed.
