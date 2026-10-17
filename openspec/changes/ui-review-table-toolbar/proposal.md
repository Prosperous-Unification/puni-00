# Plan table and toolbar: one ink per estimate, honest words, and surfaces that fit

## Why

Rounds 5 to 7 of the WBS UI/UX review (puni-plan `ui-review/findings.md`) left a set of small table,
toolbar and chrome defects open. After decision D10, an empty Estimate cell's `o/r/p` was darker
than a filled cell's resting trio, and the trio fell under 4.5:1 on a banded or lit row
(F-113, F-114). The desktop toolbar shared the name `Plan` with the nav link and the Plan · Board
button (F-115). An error toast over a sheet could not be dismissed by keyboard (F-132). A
reconnect told the compare panel's reader that the plan _had_ changed (F-135). The Views Save hint
hid its overwrite (F-136). An all-unestimated lane stack cropped to `020 · 2 s…` (F-139). Past the
indent cap, the drop line started inside the number (F-143). A pressed toggle wore the primary
action's paint (F-147). The phone home card cut every import to `Review fixture (impo…` (F-156).
An Export / Import choice opened a hint card over the table (F-159). On the Board the nav marked
`Plan` beside an unpressed `Plan` (F-169). On a short plan the grid's Customize editor ran past
the table's frame (F-176) and had no browser check (F-177).

## What Changes

- An Estimate cell's resting trio, a parent's rolled-up trio and every grid placeholder share
  `--quiet-ink` at the trio's size. Placeholders are italic.
- The desktop toolbar is named `Plan actions`, and the page nav's first link is `Project`.
- While a modal surface is open and an error toast shows, Escape takes the newest error first.
- Saved plans report a stream resettle on its own hook (`onResettled`, `livePlanResettles`). A
  comparison staled only by resettles says `The connection dropped while this comparison was on
screen; the plan may have changed.`
- The Views Save hint adds `A name a view already has replaces that view.`
- Lane stacks write the fact first: `020 · no estimate ×2`, `010 · no estimate on 1 of 2`.
- The drop line starts at the capped Number indent of the landing depth.
- A pressed toggle is filled with `--pressed` / `--pressed-foreground`, a slate blue that is
  neither the primary nor the outline face.
- The home card wraps project names whole below 768 px, with the last-opened words under them.
- The Export / Import menu returns focus to its summary quietly (`focusQuietly`), with no hint card.
- The desktop Customize editor floats over the table frame (`position: fixed`), below or above
  its cell, or clamped into the window.

## Non-goals

- No be-01 change. No change to the phone's Customize sheet or to other hint behaviour.

## Impact

`apps/wbs/fe-01` only. The `ui-review-shell-a11y`, `ui-review-gantt-directory` and
`gantt-legibility` deltas' toolbar name and stack wording now point here.
