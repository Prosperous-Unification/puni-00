<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The primitive, and one hovered cell per table

- [ ] 1.1 Extract the Hover preview's placement into a `HoverCard` primitive
      (absolutely positioned child, `role="tooltip"`, popover palette) taking
      children; `pointer-events: none` by default with the Name preview
      opting back in for its scroll; `HoverPreview` renders through it —
      test: existing `hover-preview.test.tsx` suite stays green, plus
      `hover-card.test.tsx` "a card does not take the pointer" (style
      asserted) and "the name preview still scrolls" (its opt-in asserted)
- [ ] 1.2 Replace `hoveredNotes` with one `hoveredCell` keyed
      `rowId::columnId`, read through `live`; the Name cell's preview keys by
      its own cell — test: `wbs-table.test.tsx` notes-preview tests stay
      green with the new key; "one card at a time" (hovering a second surface
      removes the first card); negative: the same-id guard on clear dropped —
      watched failing on a card surviving its own mouseleave

## 2. The folded role cell's card

- [ ] 2.1 Folded role cell renders a `HoverCard` on hover: role name, three
      points, final, assignee full name, assumed state; no request sent;
      `POPOVER_COLUMNS` gains the role column with a comment — test:
      `wbs-table.test.tsx` "the folded figure opens into its parts" (card
      text asserted from a seeded row; fetch spy asserts no request);
      "an assumed assignee says so"; negative: card fed the unfolded-only
      draft state instead of the row — watched failing on empty points
- [ ] 2.2 The truncated assignee's `title` and the fold-help `title` move:
      data leaves the `title` (the card carries it), the action help stays —
      test: "the folded cell's assignee has no title of its own" and the
      fold button keeps its action title

## 3. The depends cell's card

- [ ] 3.1 Depends cell renders a `HoverCard` listing number + full name per
      dependency; none when empty; none while the picker is open — test:
      `wbs-table.test.tsx` "numbers become names", "nothing to expand",
      "the picker owns the cell while open"; negative: the picker guard
      dropped — watched failing on card + picker stacked

## 4. Browser proof and gate

- [ ] 4.1 `e2e/hover-cards.spec.ts`: instant (card present in the same frame
      as mouse move — no waiting assertions), whole (folded Dev cell card
      shows the trio typed into that row), unclipped (card's box extends past
      the `<td>`), click-through (click a control under the open card and it
      acts); negative: `POPOVER_COLUMNS` without the role column — watched
      failing on the clipped card
- [ ] 4.2 Full gate + `bun run e2e` on ports 3113/3213/4213 + verify.md with
      the failure-proof table — test: format:check --all, run-many gate,
      openspec validate --all, playwright suite all green
