# Tasks

Ordered TDD slices. Each negative watched failing before the line it guards is
believed (R5). The one fault every slice below is watched against is named once:
**the old router** — `routeArrow`'s body replaced by the route this change
removed, the plain elbow whenever `toX - fromX >= 2 * approach` and the jog
otherwise, reading no bars at all.

## 1. The fault, written down as a test first

- [x] `keeps every arrow of the A10 plan out of every bar`, on A10's own fixture
      — `010` 3d, `020` 2d and `030` 4d on it, `040` 2d on both.
- [x] Its oracle written apart from the router: `runsInside` branches on the two
      cases a route can have rather than sharing one overlap formula, so a wrong
      reading inside `routeArrow` cannot make the assertion agree with it.
- [x] Watched failing on the old router:
      `expected [ '020->040 run 2 crosses 030-dev' ] to deeply equal []`.

## 2. `routeArrow` in `gantt-geometry.ts`

- [x] `ArrowPoint`, `ArrowClearance`, `ROW_MIDDLE` moved out of the panel.
- [x] `runCrossesBar`: the run's **closed** box against the bar's **open**
      rectangle. A vertical run has no width, so an overlap asked for as
      positive area would find none and every descent would read as clear.
- [x] Candidate columns nearest the ideal turn first — the turn itself, and one
      approach clear of either edge of every bar on the rows crossed — each
      tried as the plain elbow, then banded stepping out, then banded leaving on
      the anchor's own edge.
- [x] A last column left of every bar on those rows, which the banded route
      always clears. The bounded exception — a start already inside another bar
      of its own row — named in the JSDoc rather than searched for.
- [x] `keeps every arrow of the A10 plan out of every bar on a calendar too`:
      the weekend makes `030` two days wider, so it is a second reading.

## 3. The routes that must not have moved

- [x] `still draws the plain elbow when the column it turns at is clear` — three
      runs, unchanged.
- [x] `leaves the three arrows nothing stands under exactly where they were` —
      exact corners for the three A10 arrows that already jogged.
- [x] `dodges into the band beside the row it cannot descend through` — exact
      corners, because "it clears" is also true of a route round the whole
      chart.
- [x] `leaves on the anchor's own edge when the next role stands against it` —
      the shape `dep-waits-on-first-role` made real.
- [x] `goes left of everything when the rows in between leave no column`.
- [x] `dodges the same way for an arrow that climbs the chart`.
- [x] `every run is horizontal or vertical`, and
      `arrives at the successor's start from its left, so the head points right`.
- [x] Watched: the strictness fault — `runCrossesBar`'s four `>`/`<` widened to
      `>=`/`<=`, so touching an edge counts — fails 4, the plain-elbow and
      exact-corner tests among them.

## 4. The sweep

- [x] A seeded generator: 3–7 leaves, one or two roles each, some unestimated,
      dependencies pointing backwards through the build order, and the rows
      **shuffled** so an arrow climbs as often as it descends. Seeded per plan
      so a failure names the plan.
- [x] 400 plans on the workday axis and the same 400 on a calendar.
- [x] The old router kept in the test file as the sweep's **control**, asserted
      to find crossings before the router is asserted to find none — a green
      sweep over a generator that produced nothing crossable is a check that
      cannot fail. Control finds 1323 and 1225.
- [x] The sweep asserted non-empty: >400 arrows, arrows in over half the plans.

## 5. The panel

- [x] `arrowRoute` takes the drawn bars and calls `routeArrow`; the route-picking
      it used to do is gone. `ROW_MIDDLE` imported rather than declared twice.
- [x] `draws no arrow through a bar, off the marks it actually drew` — read off
      the document, which is the only assertion that can see the panel handing
      the router the wrong bars, inset or approach.
- [x] Watched: the panel passing `[]` for its bars fails that test **alone**,
      with `gantt-geometry.test.ts` entirely green — the two are not the same
      check twice.

## 6. Gate

Run on CI, not on the author's box — `AGENTS.md` bars builds and suites there.

- [x] `Format` (`nx format:check`) — success
- [x] `Gate` (test, lint, typecheck, build) — success
- [x] `OpenSpec` (`validate --all`) — success
- [x] `pixels` job (browser layout gate) — success
- [x] `verify.md`
