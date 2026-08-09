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

## Decisions — round 3 (codex and agy review)

- **The marker opens the preview; the Name cell closes it.** The two halves are
  deliberately different elements. The preview is the one card that scrolls, so
  reaching it means putting the pointer on it — and the marker is a 7px glyph at
  the cell's top right while the card hangs off the cell's bottom edge, with the
  name box between them. With the leave on the marker that trip unmounted the
  card before the pointer arrived, and a note taller than 320px could not be read
  at all (codex #1). The leave moves to the cell's own wrapper span, which
  contains the marker and the card both, so `mouseleave` fires only once the
  pointer is outside every part of the region.
  Geometry first, and geometry is what this is: no timer, no grace period, and
  the preview's placement — which `e2e/layout.spec.ts` measures — untouched. The
  alternative considered was nesting the card **inside** the marker so their
  boxes touch; that works for a pointer travelling straight down and for nothing
  else, because the corridor between a 7px glyph and the card below it is 7px
  wide and a few pixels of drift land on the textarea. Widening the leave region
  to the cell costs one thing, written into the spec: a preview opened from the
  marker stays open while the pointer is anywhere in that cell. It still opens
  from nowhere but the marker, which is the whole of what Dany asked for.
- **A hover card has a keyboard route, per surface, and the Name cell needs
  none.** Content only a pointer can reach is content withheld from whoever does
  not use one (codex #2).
  - _Folded role cell_: the focus opens the same card through the same
    `hoveredCell`, and the cell's box points `aria-describedby` at it. That box
    is the only focusable thing in the cell — the fold toggle is one button on
    the **column header**, not a control per row — so it is what can carry the
    description. A parent's rolled-up figure has no box and so no keyboard route;
    it is also a sum of the rows under it, every one of which has one.
  - _Depends cell_: **no** focus-opened card, deliberately. The focus there
    already belongs to the dependency picker, which opens on it and offers the
    rows this one could _start_ waiting for — a different list over the same
    110px, and stacking two boxes over one cell is what this design already ruled
    out. The names reach a reader with no pointer as an off-screen description of
    the box instead, built from the same `waitingFor` the card is, through one
    shared `dependsLine`.
  - _Name cell_: **nothing new**, and that is the answer rather than the gap.
    Focusing the textarea already reveals what the preview renders — the name and
    the notes under it, unclamped, in the box itself — and a preview opened by
    focus would be the interruption Dany had just asked to remove, arriving now
    on every Tab through the column.
- **A card that is a description carries no `aria-label`.** A description is
  computed by the accessible-name algorithm over the element it points at, and a
  label beats contents there: `aria-label="Dev for 010"` on the folded role card
  would have replaced the trio it exists to convey with four words. That card
  names itself in its first line instead, where it is both read out and on
  screen. The other cards keep their labels, because nothing describes itself
  with them.
- **The card reads the row, never the draft** (codex #4). `estimateValue` and
  `combinedValue` answer with the pending draft where there is one, which is
  right for a box being typed in and wrong for a card: what the fold hid is the
  estimate be-01 holds — the one the figure beside it is computed from, and the
  one every other reader of the plan sees. Reading the draft made a card say
  `realistic —` beside `Final 3.7 days`, and print `Final 8/3/2 days` where a
  number of days belongs. The draft is not lost: unfolding the role puts it back
  in the box it was typed into, with its complaint, which is the only place it
  can be corrected.
- **A hover is reconciled against the tree it was opened over** (codex #3). A
  card is an absolutely positioned child of one cell and the hover is remembered
  as a row id, so a refresh that moves that row moves the card to a line the
  pointer is not on — and the pointer will not say so, because it has not moved.
  Every read settles `hoveredCell` against the tree that arrived: same parent and
  same position, or the card closes. Same **position**, not merely "still
  exists", because a create above the hovered row moves it down a line without
  touching it. A read that changed nothing must close nothing, or a peer's
  keystroke anywhere on the plan would take the card away mid-sentence.
- **A cell with no card to show writes no hover state** (codex #5). The state
  lives on the table — which is what keeps `columns` off it — so every boundary
  the pointer crosses costs one render of the whole table. A depends cell with no
  dependencies, and a folded cell being typed into, have nothing to open and pay
  nothing; they also stop closing the card open elsewhere as the pointer goes
  past. The repeat case is React's own: the key is a string, so a second
  `mouseenter` on one cell writes the value already there and the render is
  skipped.
- **The `@` guard reads the mention, not its entries** (agy #7). Reading
  `options.length === 0` said the same thing as "no mention open" in every case
  but one, and that one is reachable: a deployment with nobody on it yet answers a bare `@` with no
  entries at all — nobody to match, and no `Add "…"` until something follows the
  `@` — so the card opened over the box being typed in.
- **The row lift stays on the Name column alone** (agy #6, raised as a question
  and answered no). `POPOVER_ROW_LAYER` exists because a pinned cell is
  `position: sticky` **with a z-index** and therefore a stacking context, which
  traps the preview inside it. Neither `depends` nor `<roleId>-final` is pinned,
  so nothing between those cards and the frame establishes one, and each card's
  own `z-index: 20` competes directly with the pinned layer, which is 1.
  Extending the lift would create stacking contexts on those `<td>`s that do not
  exist today and cap their cards at layer 2. Measured rather than argued:
  `e2e/hover-cards.spec.ts` scrolls the frame until the depends column is half
  under the pinned block and compares that overlap with the card open and closed.

## Decisions — round 4 (codex, on the round 3 diff)

- **One guard for the mention, not two.** Round 3 taught the card to read the
  mention and left the cell's `onKeyDown` counting the picker's entries, so on a
  deployment with nobody in it a bare `@` still handed the keyboard back:
  Alt+ArrowDown moved the row and Cmd+Enter made one, under a live mention. The
  branch reads `mentioning` now, the same boolean the card does. The hole
  predates this change — the merge-base has the same entry count — but the two
  guards diverging is this change's doing, and so is the fix. Enter with nothing
  on offer is consumed and takes nothing, rather than falling through to "new
  work item".
- **The focus and the pointer keep separate state, and the card is derived.**
  They are not two writers of one thing: a pointer wandering across another
  cardable cell and off it again ran the hover's guarded clear, and the
  still-focused box was left with no card, no description, and no reason to fire
  a focus event ever again (codex #9). `openCard` is `hoveredCell ?? focusedCell`
  — **the pointer wins while it is on something**, because moving a mouse onto a
  cell is the deliberate act of the moment, and the focus is still where it was
  left when the mouse moves away. One card at a time stays true by construction,
  now for two gestures instead of one, because every surface reads the one
  derived value. `aria-describedby` follows the card's existence, so it is set
  exactly when there is an id to point at.
  `focusedCell` is **not** settled against a refreshed tree, unlike the hover: a
  card that belongs to the focus should follow the focus, and the browser moves
  that with its element whatever the tree did. A row deleted while its box was
  focused leaves a key that no rendered cell can match, which shows nothing.
- **A placement is the line a row is drawn on, not its place among its
  siblings.** Round 3 settled the hover on `parentId` and the sibling index,
  which answers for the row and for nothing above it: a peer moving an
  **ancestor** takes the whole branch elsewhere while every row inside it reports
  the same parent and the same position, so the card travelled with the branch
  and stayed open on a line the pointer was never on (codex #10). The placement
  is now a depth-first walk of the tree the table is about to draw. The parent
  stays in the pair for the move that changes no line — outdenting shifts a row
  left by an indent without moving it — so the new rule is strictly stronger than
  the old one rather than a different one. The walk is over the tree rather than
  the flat read because the flat read is in that order only by be-01's promise,
  and a test fake that reorders less carefully cannot then make the check agree
  with itself.

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
- **One render of the table per hover boundary stays**, and it is the residual
  round 3 accepted rather than removed. `hoveredCell` is table state because
  `columns` must depend on `roles` alone — the remount landmine — so a card
  opening or closing re-renders every cell. That is the cost `hoveredNotes` has
  had since it was written; the two mitigations above take the pointless writes
  out of it, and row memoisation or a wider re-render refactor is a change of its
  own, not this one.
- **A second state is a second thing to keep in step.** `hoveredCell` and
  `focusedCell` are cleared by different events, and the derivation is the only
  place they meet. The guard against them drifting is that no surface reads
  either directly — every one reads `openCard`.
- **The bailout on a repeated `mouseenter` is asserted as a property, not as a
  render count.** jsdom counts no renders, so what is pinned is the predicate
  React uses — that the key is a string and two calls compare `Object.is`-equal.
  A change that made cells re-render on a stationary pointer some other way would
  not be caught here.

## Migration Plan

None. `apps/fe-01` render-path only.

## Open Questions

None blocking.
