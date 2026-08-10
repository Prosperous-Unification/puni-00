# The shape of the chart

Four decisions. The first is the reviewed coordinate contract; the other three
are what it costs to keep.

## 1. The SVG's user space is workdays, and nothing in it is text

One `<svg>` per panel: `viewBox="0 0 <horizon> <rowCount>"`,
`preserveAspectRatio="none"`, CSS size `horizon × DAY_PX` by
`rowCount × ROW_PX`. The x unit **is** one workday and the y unit is one row,
so a bar is `<rect x={earliestStart} width={duration} y={rowIndex + inset}>`
— the engine's numbers, unconverted. That is what makes the jsdom layer able
to assert `x`/`width` _strictly equal_ engine output (codex #15): there is no
pixel arithmetic to drift.

The cost: non-uniform scaling distorts glyphs and stroke widths. So the SVG
holds geometry only — bars, brackets, arrows, links, flags, weekday gridlines
— with `vector-effect="non-scaling-stroke"` on strokes. Every word lives in
HTML: row labels in a sticky-left column, calendar labels in an axis row above
the chart, positioned by the same `DAY_PX` the SVG is sized by. Hover reasons
are SVG `<title>` children — unaffected by scale, readable in jsdom.

**Rejected:** computing pixel x in React (`x = start * DAY_PX`). It reads more
familiar and it is exactly the contract the reviews struck down — the test
would assert derived pixels against derived pixels, and the unit drifts the
day someone rounds.

## 2. A pure geometry module in front of the component

`gantt-geometry.ts` takes what the renderer already has — the shown rows (id,
depth, leaf-ness, projection, `startNoEarlierThan` offset), the slices, the
dependency edges — and returns plain data: label rows, bars (with slice id,
critical, estimated, floor words), brackets, dependency arrows, person links,
not-before flags, the horizon. No DOM, no React; its tests need neither.

Person links resolve `resourcePredecessorId` against the payload's slices; a
dangling id **throws** `GanttDataError` (R5: malformed trusted data), which
the render lets reach the error boundary. A link or arrow with a hidden end
(collapsed branch, search) is a modeled absence, not an error: the mark is
skipped. Dependency arrows join shown rows only.

## 3. Slices leave be-01 as an array under the engine's own ids

`tree()` stops discarding `planned.slices`: each entry serialises as
`{ id, workItemId, roleId, personId, duration, estimated, earliestStart,
earliestFinish, latestStart, latestFinish, float, critical, boundBy,
resourcePredecessorId }`, `id` being the engine's own key, treated as opaque
on both sides — `resourcePredecessorId` is looked up, never taken apart,
exactly as `schedule.ts` documents. Additive; on `scheduleError` the array is
empty, same as the schedule fields already degrade.

fe-01 needs calendar math for the axis (today it renders be-01's strings).
The workday module in `libs/domain` is pure and dependency-free; fe-01
imports **that module**, not the lib's index barrel, which re-exports
arktype-touching validators the browser bundle deliberately excludes
(`wbs-api.ts:1-9`). The finish label uses the same `ceil − 1` nudge as
`datesOf` so the axis and the Start/End columns cannot disagree — asserted by
a test that compares them, not by this sentence.

## 4. The panel is below the plan, and the plan stays the editor

A toolbar toggle mounts `GanttPanel` under the renderer, inside `WbsTable`'s
section: the frame splits vertically, each half scrolling itself, the page
never sideways. The panel reads the same `shownRows` the renderer draws —
same model, same expansion, same search — so tree-mirroring is identity, not
synchronisation.

Click-to-row reuses the machinery the faces share: find the row's name cell
with `cellIn(grid, { rowId, columnId: 'name' })`, focus it, and
`scrollIntoView` behind the same jsdom guard the pickers use. It works on the
cards face because the cells are the same cells — M's contract.

`d3-scale` stays out unless hand-rolled scales get fiddly; if it comes in,
the implementor logs it in `verify.md` (the plan's own condition).
