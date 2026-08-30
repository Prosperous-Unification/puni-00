<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

Two P3s C3 (`capacity-ui`, #57) recorded against itself and nobody took. This
change takes the first and answers the second.

**The chart never says the team's size clamped the width.** `widthFor` is
`min(maxParallel, slots)` for work nobody is named on, so a row asking for 3
people from a team of 2 runs at 2 — and no sentence anywhere on the drawing says
so. The card's `3 people in parallel — …` line prints the width it got, never
the number it asked for; at width 1 that line does not print at all, so a row
asking for 3 from a team of 1 has the whole of its clamp said nowhere. The
export can tell you (`People at once` versus `Ran at`) and the `∥` cell's
`title` hints at it, neither of them on the chart whose dates moved.
`docs/capacity.md` states the gap in prose.

## What Changes

**A second line on the bar's card**, wherever the two numbers differ and nobody
is named on the work:

> The team may have 2 at work at once — 3 in parallel not applied

Its own line rather than a clause on the compressed one, because at width 1
there is no compressed line to hang it on. Silent where a person is named: D3
collapses that width to 1 for its own reason and the line above already says so.
`width` **is** the team's size wherever this prints — `min(a, b) < a` means the
answer was `b` — which is what lets it state a number the payload carries no
field for.

`docs/capacity.md` gains the line and loses the paragraph saying it does not
exist.

## Non-goals

**The over-bar `{team} ×{n}` label**, C3's other recorded P3. It reaches every
team-labelled plan rather than capacity ones. Narrowing it to plans that state a
capacity needs the chart to know the capacity, and `ServiceTeamLabel` carries no
size: the payload is assembled in `wbs-table.tsx`, which this change may not
touch. Verdict, evidence and the shape of the fix are in `verify.md`.

The `∥` cell's per-row muting, C3's third open P3. Unrelated surface.
