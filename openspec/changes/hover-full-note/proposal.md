<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

A note is read on hover over its Name cell, and the card it is read in is 320px
tall and 420px wide however much screen is going spare. A work item carrying an
imported Jira description — 2,700 to 5,900 characters — is then read through a
slot showing roughly a tenth of it at a time, on a 1080px screen with 700px
unused below the card. The card scrolls, so nothing is unreachable; the reading
is what is broken.

## What Changes

**Hover preview, height**

- From: 320px, always, whatever the screen and however short the note
- To: as tall as the note needs, capped at the room on its side of the cell and
  at 90% of the window; a note that fits shows whole with no scrollbar
- Impact: non-breaking; a note under 320px is unchanged

**Hover preview, width**

- From: 420px
- To: 640px, still clamped under the window's own width
- Impact: non-breaking

**Hover preview, side**

- From: always below the cell, never flipped — off the bottom of the window for
  a row in the lower half of the table, with no way to reach the rest
- To: below when below has the room, above when above has more
- Impact: non-breaking, and the reason the height cap is safe to raise at all

## Non-Goals

- Every other hover card keeps 320px/420px and keeps opening downward. This is
  the Name cell's preview alone — the one card that scrolls and the only one
  that holds a document.
- No change to what the preview renders, to the notes marker that opens it, or
  to the Name cell at rest.
- No new surface: not a panel, not a modal, not a route.
- No storage or API change.

## Constraints

- The card stays an absolutely positioned child of the cell's wrapper. It is
  not portalled: the pointer trip from the marker to the card crosses the name
  box, and `hover-cards.spec.ts`'s `scrolls a note taller than the preview`
  guards exactly that.
- Placement arithmetic is measured from `getBoundingClientRect`, which jsdom
  answers with zeroes — the arithmetic is a pure function unit-tested on given
  numbers, and the wiring is a browser fact (R5 #14–16).
- The card keeps taking the pointer; it is still the one card that scrolls.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: the Name cell's hover preview is sized to its note and to the
  room around its cell, and opens on whichever side has that room

## Domain Terms

none

## Decisions Recorded

none — reversible, and the alternatives (portalling the card, a docked panel)
were rejected on the constraint above rather than on a lasting principle.

## Impact

`apps/fe-01` only: `hover-card.tsx` (placement and caps), `hover-preview.tsx`
(the wider card), their unit tests, and `e2e/hover-cards.spec.ts`. No be-01,
no gw-01, no migration, no deploy step.
