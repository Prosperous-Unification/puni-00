## Context

The Name cell's Hover preview is the working model: `hoveredNotes` state in
the table, set on `mouseenter` of the cell's wrapper, cleared on leave with a
same-id guard; the card is an absolutely positioned child of the wrapper; the
`<td>`'s clipping is exempted through `POPOVER_COLUMNS`. Everything else that
folds data away answers with a native `title` — delayed and one line.

## Goals / Non-Goals

**Goals:**

- One primitive (`HoverCard`) with the preview's positioning and role, taking
  arbitrary children; the Hover preview stays what it is (its markdown is its
  own) but shares placement.
- The folded role cell's card: role name, `o / r / p`, final, assignee full
  name, assumed state — the data already on the row's client-side view.
- The depends cell's card: `010 — Strip the old wiring` per dependency, from
  the numbers and names the table already resolves (`numbersOf` has the ids).

**Non-Goals:**

- No delay logic, no portals, no flip-if-clipped; the preview's fixed
  open-below placement is the placement.
- No mobile-face work.

## Decisions

- **One `hoveredCell` state replaces per-surface states** — keyed
  `rowId::columnId` like every other cell identity (the `cellKey` the grid
  already uses), read through `live` so `columns` keeps its one dependency.
  `hoveredNotes` folds into it (the Name cell's key), so one card is open at a
  time across all surfaces by construction.
- **Cards are pointer-transparent** (`pointer-events: none`) except the Name
  preview, which scrolls (`maxHeight` + `overflowY`) and therefore must take
  the wheel. The fix round proved a card that takes the mouse eats clicks
  aimed at the row beneath; a read-only card has no business doing so.
- **`POPOVER_COLUMNS` gains the role and depends columns** — deliberately, at
  the definition, with the comment saying which cards earned them.
- **The folded cell's card reads from `TreeRow`** (estimates by role, final,
  assignees, assumed) — no request on hover; hover shows what the client
  holds, per the intent's "no new data".

## Risks / Trade-offs

- **jsdom can see most of this one** (unlike the clamp): a card's presence,
  its contents, its `pointer-events` style are DOM facts. The instant part —
  no delay — is the absence of a timer, asserted by the card being in the DOM
  synchronously after `mouseEnter` fires in a unit test. Geometry (card not
  clipped by the `<td>`) stays browser-proven in `e2e/`.
- A card over the row below can still occlude _visually_; pointer
  transparency keeps interaction whole, which is the part that broke before.
- The depends cell already opens a picker on click; the card must not render
  while that cell's picker is open (two stacked popovers over one cell).

## Migration Plan

None. `apps/fe-01` render-path only.

## Open Questions

None blocking.
