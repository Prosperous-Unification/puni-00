<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-08-31: **the Gantt must always use the assignee's short name.
Currently not always short.**

A bar writes whoever is on it, and `barLabelFor` decides how by measuring the
bar: a wide bar gets the whole name, a narrow one gets initials, a sliver gets
nothing. So one person reads three ways on one chart — `vadym kucherenko` on a
ten-day bar, `VK` on a one-day bar — and a reader scanning a column of bars for
one person has no fixed mark to scan for. The width a bar happens to have is
not a fact about who is on it.

The table already settled this. A folded step cell names its assignee by
`initials.ts`' `initialsOf` and nothing else, for the same reason and in the
same words: _"initials are the same length every time, so the column lines up,
and nothing is lost that the cell's own tooltip and its hover card do not say
in full."_ The chart is the surface where that argument is strongest and the
one place it was never applied.

There is a second fault underneath, and it is why this is not a one-line
change: **`gantt-panel.tsx` has an `initialsOf` of its own** with different
rules. `initials.ts` gives a one-word name its first two letters (`vadym` →
`VA`); the chart's gives it one (`vadym` → `V`). Usernames here are single
words, so the two answers disagree on nearly every person this app has, and a
bar and the cell beside it name the same person differently.

## What Changes

- Every bar names its assignee by `initials.ts`' `initialsOf` — the same short
  name the table uses — whatever width the bar is.
- `gantt-panel.tsx`'s own `initialsOf` is deleted; the chart imports the one.
- The same for the assumed-slice label and the standalone `.svg`, which share
  those functions.

## Non-goals

- A bar too narrow for two characters still writes nothing.
- `poolLabelFor` keeps writing the **team**'s name in full: a team is not an
  assignee and `Platform ×3` has no initials.
- No change to hover cards, tooltips or the export's own columns, which carry
  the full name and are where it is read.

## Constraints

- `initials.ts`' `initialsOf` **throws** on a name with no non-space character.
  The chart's returned `''`. Every call site must decide before it calls.
