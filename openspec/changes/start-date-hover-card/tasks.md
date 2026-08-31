<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The card replaces the tooltip

- [x] 1.1 `startCellProps` returns the card's triggers instead of a `title`, and
      the Start cell renders a `HoverCard` from a positioned wrapper. Tests:
      `wbs-table.test.tsx` `opens the Start cell's own card on hover, and on
focus, and closes it again`, and the rewritten `makes the Start cell
itself the surface`. Negatives: `onMouseEnter` deleted, watched failing on
      `Unable to find role="tooltip" and name "Start of 010"`; `onFocus`
      deleted, watched failing on the same message **after** the hover half had
      passed, which is why the two gestures are asserted apart.
- [x] 1.2 The `<td>` points `aria-describedby` at the open card, asserted
      against the card's **own** id rather than a literal — two spellings of one
      id is a description that refers to nothing. Negative: the attribute given
      `` `start-${row.number}` ``, watched failing on `expected 'start-010' to be
'start-w1'`.

## 2. It is instant, and it is not the browser's

- [x] 2.1 `e2e/hover-cards.spec.ts` `opens the Start cell's sentence in the same
breath, and carries no title` — one read, never a retry, because
      `toBeVisible` would wait ten seconds for a card that opens on a timer.
      Negative: `title: said` put back, watched failing on
      `expect(received).toBeNull() · Received: "Starts with the project"`.

## 3. The card is not cut off

- [x] 3.1 `start` joins `POPOVER_COLUMNS`. Test: `paints the Start cell's card
past the edge of a 52px column`, by screenshot rather than geometry — a
      clipped box still reports its full rectangle. Negative: `'start'` removed
      from the set, watched failing on `the strip below the Start cell looks the
same with the card open · expected true to be false`.

## 4. Nothing that read the tooltip loses the fact

- [x] 4.1 The sentence stays at rest as `data-start-said`, because
      `gantt-panel.test.tsx`'s `columnDay` and `e2e/gantt.spec.ts`'s fixture both
      read the whole day out of this cell and neither can hover. Both readers
      updated; `gantt-panel.test.tsx` 160 passed.

## 5. Gate

- [x] 5.1 fe-01's jsdom suite, the whole browser gate, lint, typecheck, format.
      Results in `verify.md`.
