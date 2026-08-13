# Design

## The shape

Two declarations and one module.

- `TABLE_FRAME.flex`: `1 1 0%` → `0 1 auto`. The frame is its content's height,
  shrunk to the remainder when the content is past it. It is the only shrinkable
  item in the column — the toolbar, the height handle and the panel are all
  `shrink-0` — so "shrunk to the remainder" is exact rather than a share.
- `plan-scroll-link.ts`: `linkPlanScroll(frame, panel)` puts a `scroll` listener
  on each face; whichever fires is the driver and the other follows. It returns
  its own disposer. `wbs-table.tsx` installs it in one effect while both faces
  are on screen.

The arithmetic is three pure functions over a `PlanFace` — `contentTop`, `count`,
`at(index)` — so the part that can be reasoned about is tested without a browser
and the part that cannot is tested only in one.

```
firstShownIndex(driver)          -> the first row whose bottom is under the heading
alignmentMove(driver, follower)  -> px to add to follower.scrollTop, or null
```

`null` is three ordinary facts and no faults: nothing is shown, the follower has
no such row, or the two already agree. The last of those is what makes the link
terminate — see "The echo".

## Why not one scroll container

The obvious reading of "one surface" is one `overflow: auto` box holding both
faces. It cannot be built. The two faces scroll **sideways** for different
reasons — the table for its columns since `unfolding-may-scroll`, the chart for
its calendar — and `overflow-x: auto` forces the other axis to compute to `auto`
as well (`table-frame.ts` records the same rule from the other end). A child that
scrolls horizontally is therefore a scroll container vertically too, and its
vertical scroll is its own whatever its parent does. One box would mean
transform-panning at least one axis by hand, which is a rewrite of the axis
caption, the day picker and every measurement in `e2e/gantt.spec.ts`.

## Why not side by side

The literal answer to "read row N beside bar N" is the MS-Project layout: table
left, chart right, one vertical scroll, two horizontal ones. It is ruled out by
arithmetic that already exists. The folded table's own minimum is about 1245px
(`frameLayout`, and `e2e/layout.spec.ts` measures it at 1280, 1024 and 900); a
chart beside it at 1280 leaves the table roughly 700, and `fits every laptop
width with the roles folded` — the guarantee `unfolding-may-scroll` explicitly
did not weaken — fails at every width in the matrix. Side by side is a different
product, not a layout change.

## Why the link is by row and not by pixel

Copying `scrollTop` from one face to the other is one line and wrong. The two
faces do not have the same row heights: a chart row is a declared 28px, a table
row is 26.19px in this font (measured), and a wrapped name makes it 46. Pixels
would drift by a row every twenty and would be _wrong from the first row_ on any
plan with a wrapped name — which is the audit's next finding down the list
("Wrapped-name row goes 46px vs 28px, its Gantt row doesn't, alignment lost from
that row down"). Rows are the unit both faces agree on, so rows are the unit.

Within a row, the fraction is carried rather than rounded away: the follower
shows the same row cut by the same **proportion** of its own height. Rounding to
whole rows would step the chart a row at a time under a smooth scroll; carrying
the pixels instead would push a 28px chart row entirely under its axis when the
table's row is 46. The fraction is inside the mate's height by construction, so
there is no clamp and no state where the two faces show different rows.

## Why the pairing is checked

Row _i_ of the table is row _i_ of the chart. That is the invariant the whole
change stands on and it is pinned from both ends already
(`gantt-panel.test.tsx`: "draws exactly the rows a search narrowed the plan to",
"leaves a collapsed branch's children off the chart"). The link uses it for
**position** — the index, which is what keeps a scroll event to about ten rect
reads instead of five hundred — and then **checks the id** before moving
anything. A mismatch does nothing at all. That is not defensive coding: the two
faces are rendered by two commits and there is a tick where they legitimately
disagree, and a link that guessed across it would scroll the chart to somebody
else's bar, which is the fault this change exists to remove.

## The echo, and why there is no flag for it

Writing the follower's `scrollTop` fires the follower's own scroll event, which
asks for the reverse alignment. That answer is `null` — they now agree — so the
bounce dies after one measurement. The one case that would not die is a follower
that could not go where it was put: clamped at the end of its own scroll range,
its echo would drag the driver back to where the chart ran out, and a plan would
refuse to scroll past its chart's last row. Re-reading `scrollTop` after the
write is what separates the two: a write that moved nothing will not echo, so no
echo is claimed for it, and a face pinned at its end is left free to drive.

**What that costs, measured.** The frame's own trailing room — `paddingBottom:
13rem`, the picker room — is scrollable extent the panel has no counterpart for,
so the last rows of a long plan are reachable in the frame and not under the
axis. With 60 rows at 28px, a 400px frame against a 350px panel and both at
their own maximum, the table's first shown row is 53 and the best the chart can
reach is 47: six rows apart, and the gap is
`(panelH − (frameH − 208)) / rowHeight`. It only exists at the very end of a
plan, it closes on the way back up, and on `main` the two faces were that far
apart everywhere — but it is an exception to "scrolling either one brings the
other to the row it is showing", and the spec delta now says so rather than
claiming the requirement flat. Cross-review, 2026-08-12. Giving the panel the
same trailing room is the other half of the choice and is not taken here: it is
208px of white under every chart, for a state a reader leaves by scrolling.

## What the frame stopped guaranteeing

The frame was as tall as the window whatever it held, and three things had
quietly come to depend on that.

1. **A hover card's room.** `roomForCard` measured the window. A card is an
   absolutely positioned child of its cell and is clipped by the frame, so on a
   four-row plan it was placed 320px down a frame that ends 200px down and the
   half a reader has to point at to scroll it was not painted. It now measures
   the window **and** the frame, which is the box that actually clips it. That is
   a correctness fix the old layout was hiding, not a cost of this one.
2. **"The plan gives up what the chart takes."** Dragging the chart taller used
   to shrink the frame by the same amount. On a short plan the chart now grows
   into the dead space first and the frame only after — the assertion in
   `e2e/gantt.spec.ts` is replaced by what it was really about: the section they
   share does not grow and the page does not scroll.
3. **A test that needed a full frame.** `gives a long note the room below rather
than 320px of it` was measuring a two-row plan against a window-tall frame. It
   fills the frame first now, and says why.

## What is left between the two faces

On a short plan the gap is the frame's own picker room (13rem, so a dependency
list on the last row has somewhere to open) plus whatever of the 20rem floor a
three-row plan does not fill — 217px measured at 1280×900, against 553px with
the growth put back. Both are space something asked for and both are named where
they are declared. The floor stays because it is what keeps a window too short
for a plan honest, and it stops binding at about four rows.

## Invariants this change had to hold, and how

| invariant                                        | how it is held                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Row-for-row correspondence between the faces     | Used as the mechanism and checked by id before every move; asserted per case in `e2e/plan-surface.spec.ts` (`toHaveCount(rows)`)                                                                                                                                                                                                                                               |
| Keyboard walk and cell focus                     | The link writes `scrollTop` and never calls `focus` or `scrollIntoView`; the browser case walks fifteen cells with Ctrl+J and asserts the focus is still in the cell it walked to                                                                                                                                                                                              |
| The frame is what scrolls, and the page does not | `flex-shrink: 1` kept; both browser cases assert `pageOverflow === 0`, and the no-shrink fault turns five of six red. `table-frame.ts` carries the one exception this does not remove and does not worsen: a window too short for the 20rem floor plus the chrome scrolls the page, as it did before this change — `0 1 auto` never grows the frame past what `1 1 0%` made it |
| `unfolding-may-scroll`'s sideways scroll         | `scrollLeft` is never read or written; the browser case unfolds a role, scrolls the frame sideways and asserts both faces keep their own sideways position                                                                                                                                                                                                                     |
| The chart's month caption                        | Follows from the same: the caption is computed from the panel's `scrollLeft`                                                                                                                                                                                                                                                                                                   |
| The folded fit at every laptop width             | Untouched — nothing here changes a width                                                                                                                                                                                                                                                                                                                                       |
