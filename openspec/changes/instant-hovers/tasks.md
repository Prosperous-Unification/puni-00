<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The primitive, and one hovered cell per table

- [x] 1.1 Extract the Hover preview's placement into a `HoverCard` primitive
      (absolutely positioned child, `role="tooltip"`, popover palette) taking
      children; `pointer-events: none` by default with the Name preview
      opting back in for its scroll; `HoverPreview` renders through it —
      test: existing `hover-preview.test.tsx` suite stays green, plus
      `hover-card.test.tsx` "a card does not take the pointer" (style
      asserted) and "the name preview still scrolls" (its opt-in asserted)
- [x] 1.2 Replace `hoveredNotes` with one `hoveredCell` keyed
      `rowId::columnId`, read through `live`; the Name cell's preview keys by
      its own cell — test: `wbs-table.test.tsx` notes-preview tests stay
      green with the new key. The one-card-at-a-time pair moved into 2.1 with
      the trigger it needs: "leaves one card open when the pointer walks from
      row to row"; negative: the same-cell guard on clear dropped — watched
      failing on the second row's card closed by the first row's mouseleave

## 2. The notes marker opens the preview

- [x] 2.1 The Name cell draws a notes marker at its right edge where, and
      only where, the row has notes; hovering the marker opens the preview and
      hovering the cell body opens nothing. The marker takes no focus, is no
      cell of the keyboard grid, and takes pointer events on its own box —
      test: `wbs-table.test.tsx` "the notes marker opens the preview",
      "the cell body opens nothing", "a row with no notes has no marker";
      negative: the marker rendered unconditionally — watched failing on the
      notes-less row

## 3. The folded role cell's card

- [x] 3.1 Folded role cell renders a `HoverCard` on hover: role name, three
      points, final, assignee full name, assumed state; no request sent;
      `POPOVER_COLUMNS`' comment names the card as a second reason the role
      column may not clip — test: `wbs-table.test.tsx` "the folded figure
      opens into its parts" (card text asserted from a seeded row; fetch spy
      asserts no request); "an assumed assignee says so"; negative: card fed
      the folded cell's draft state instead of the row — watched failing on
      empty points
- [x] 3.2 The truncated assignee's `title` and the fold-help `title` move:
      data leaves the `title` (the card carries it), the action help stays —
      test: "the folded cell's assignee has no title of its own" and the
      fold button keeps its action title

## 4. The depends cell's card

- [x] 4.1 Depends cell renders a `HoverCard` listing number + full name per
      dependency; none when empty; none while the picker is open — test:
      `wbs-table.test.tsx` "numbers become names", "nothing to expand",
      "the picker owns the cell while open"; negative: the picker guard
      dropped — watched failing on card + picker stacked

## 5. Browser proof and gate

- [x] 5.1 `e2e/hover-cards.spec.ts`: instant (card present in the same frame
      as mouse move — no waiting assertions), whole (folded Dev cell card
      shows the trio typed into that row), unclipped (card's box extends past
      the `<td>`), click-through (click a control under the open card and it
      acts), and the Name cell's two rules (the cell body opens nothing, the
      marker opens the rendered preview); negative: `opensAPopover` without
      the role column — watched failing on the clipped card
- [x] 5.2 Re-aim the layout gate's notes-preview overhang test at the marker
      trigger, deliberately; audit the specs in `name-cell.spec.ts` that type
      notes for assertions this change shifts — test: the layout suite green
      with the hover moved to the marker
- [x] 5.3 Full gate + `bun run e2e` on ports 3113/3213/4213 + verify.md with
      the failure-proof table — test: format:check --all, run-many gate,
      openspec validate --all, playwright suite all green

## 6. Round 3: what two reviews found

- [x] 6.1 The preview's leave moves from the marker to the Name cell, so the
      pointer can reach the one card that scrolls.
      Test: unit — the preview survives the pointer crossing the cell, fired as
      a `mouseOut` carrying a `relatedTarget`, which is what React derives a
      leave from; browser — a note taller than the preview is wheeled to its
      last line. Negative for both: the leave handler put back on the marker.
- [x] 6.2 A keyboard route per surface: the folded cell's box opens the card on
      focus and is described by it; the depends box is described by an
      off-screen copy of the same list; the Name cell gets none, and design.md
      says why.
      Negatives: the focus line dropped, the description dropped, and a label
      put back on the card a description points at.
- [x] 6.3 The hovered cell is settled against every tree that lands — same
      parent and position, or the card closes — and an unrelated refresh leaves
      it alone. Negative: the settle deleted from the refresh.
- [x] 6.4 The folded card reads the row's own trio and figure, never the
      pending draft, in two tests because a box's draft and the cell's own
      shorthand cannot coexist.
      Negatives: the two reads put back through the drafting readers.
- [x] 6.5 No hover state written by a cell with no card to show, and the repeat
      case left to React's bailout on an unchanged string.
      Negatives: the guard dropped; the cell key made to return an object.
- [x] 6.6 The folded cell's guard reads the mention rather than its entries, so
      a bare `@` on a deployment with nobody in it opens no card over the box.
      Negative: the guard put back to counting the entries.
- [x] 6.7 The row lift is measured rather than extended: a browser check that a
      card paints over the pinned cell of the row below, once the frame is
      scrolled far enough to put one under the other.
      Negative: the card's own `z-index` removed.

## 7. Round 4: codex on the round 3 diff

- [x] 7.1 Keyboard ownership of a folded cell follows the mention, not the
      picker's entry count — the hole round 3 left when it corrected the card's
      guard alone, and one that predates the change.
      Negative: the branch put back to counting entries, watched moving a row
      and creating one under a bare `@`.
- [x] 7.2 The focus and the pointer keep separate state and the open card is
      derived from both, so a mouse crossing the table cannot take a card and
      its description away from a box that still has the focus.
      Negative: the two states folded back into one.
- [x] 7.3 A hover is settled against the line a row is drawn on rather than its
      place among its siblings, so moving an ancestor closes a card inside the
      branch.
      Negative: the placement put back to counting siblings under a parent.
