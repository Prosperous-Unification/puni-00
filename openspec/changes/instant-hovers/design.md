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
- **The role and depends columns are named in `POPOVER_COLUMNS` for the cards
  too** — `depends` is already in the set and a folded role's `<roleId>-final`
  already matches by suffix, both for the pickers they open. What this change
  owes them is the record: the comment at the definition says the cards are
  now a second reason those two `<td>`s must not clip, so a later change that
  moves a picker out of one of them cannot take the exemption with it. The
  browser negative injects exactly that (the suffix branch removed) and
  watches the card get clipped.
- **The folded cell's card reads from `TreeRow`** (estimates by role, final,
  assignees, assumed) — no request on hover; hover shows what the client
  holds, per the intent's "no new data".
- **The big preview moves behind a notes marker; the compact cards do not.**
  Two rules, and the difference is size: a folded role's card and a depends
  card are a few lines over a 96px or 110px cell, so the cell itself is the
  trigger and a mouse crossing them loses nothing. The Name preview is a
  rendered document up to 420px wide and 320px tall over the rows below, and
  the Name column is the widest thing on the way to anywhere — Dany,
  2026-08-09: a preview on every pass of the mouse is too disruptive. It
  opens from a marker at the cell's right edge instead, drawn only where the
  row has notes.
- **The marker is the "this row has notes" affordance `name-title-body` ruled
  out**, and that non-goal is superseded rather than forgotten: with the notes
  clipped at rest and the trigger no longer the whole cell, a row with notes
  has to say so or its notes are unreachable by anyone not already looking
  for them.
- **The marker is not a control.** No `tabIndex`, no `data-cell`, no click
  handler: the keyboard grid is a matrix of cells, and a focus stop inside the
  Name cell would put a Tab between a name and the next column. It takes
  pointer events on its own small box only, so a click aimed at the textarea
  lands there everywhere else in the cell.

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
