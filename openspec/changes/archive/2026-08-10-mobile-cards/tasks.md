# Tasks

Six slices, in order. Each names the test that proves it and the fault that
test was watched failing under; the whole table is in `verify.md`.

## 1. The breakpoint

- [x] `components/wbs/plan-renderer.ts`: `rendererForWidth(width)` — pure, with
      `CARDS_BELOW` beside it — and `useRendererForViewport()`, which feeds it
      `window.innerWidth` through `useSyncExternalStore` on `resize`.
- [x] **Test** — `plan-renderer.test.ts`: 767 is cards, 768 is the table, and
      the hook follows a resize both ways.
- [x] **Negative** — the comparison flipped to `<=`; the `resize` subscription
      returning an unsubscribed store.

## 2. The cards, and the cells they render

- [x] `components/wbs/plan-cards.tsx`: `PlanCards` over the row model the table
      already built — number at depth, the name-and-notes box, days, dates,
      what it waits for, one line per phase with the `o/r/p` box and the
      assignee. `data-grid` on the list, `data-cell` on every box.
- [x] `wbs-table.tsx` renders one or the other; `gridElement` becomes an
      `HTMLElement` ref.
- [x] **Test** — `plan-cards.test.tsx`: the phone gets cards and no table, the
      laptop the table and no cards, and every `data-cell` the cards draw is
      one the table draws too.
- [x] **Negative** — a card's `cellKey` prefixed so it is a cell of its own;
      `data-grid` taken off the list.

## 3. The focus, on the card DOM

- [x] The Name box calls `FocusIntent.landOnAttached`, as the table's does; the
      list carries the grid ref, so the readiness walk and `land` read the
      committed cards; the sheet refuses Radix's focus restore when a control on
      it acted, because that restore is on a timer and lands after the refetch.
- [x] **Test** — `plan-cards.test.tsx`: a work item added from the sheet leaves
      the focus in the new card's name box, and the readiness badge carries the
      caret into an unestimated card's figure box.
- [x] **Negative** — `onCloseAutoFocus` removed; `gridRef` dropped from
      `PlanCards`. **Not** `data-grid`, which turned out not to be what the
      focus reads at all — `verify.md` has that finding.

## 4. The refused draft, across a real resize

- [x] Nothing to write: this is `X`'s contract met by the production renderers.
- [x] **Test** — `plan-cards.test.tsx`: type into the table's box, be-01
      refuses, resize the window to 390, the card shows what was refused.
- [x] **Negative** — `takeNode`'s restore deleted, watched from this test.

## 5. The picker on a card, and the sheet's keyboard

- [x] The card's figure box opens the `@` list from `onTyped` and routes Enter
      and Escape to it, exactly as the folded cell does.
- [x] **Test** — `plan-cards.test.tsx`: Enter assigns the first person offered
      and leaves the figure alone; Escape closes and strips nothing; `?` on the
      open sheet opens no cheat sheet.
- [x] **Negative** — the Enter branch removed; the sheet's body rendered
      outside `ModalContent`.

## 6. The toolbar sheet, and the pixels

- [x] One toolbar node, rendered in the row above the table or inside
      `ModalContent side="bottom"` under a control the cards show.
- [x] **Test** — `plan-cards.test.tsx`: the sheet holds the toolbar, and the
      phases dialog opens from inside it.
- [x] **Browser** — `e2e/mobile.spec.ts` at 390×844: nothing scrolls sideways,
      every tappable control on a card is at least 44px, a name typed on a card
      reaches be-01 and comes back, and a peer's edit mid-word takes neither
      the focus nor the half-typed value.
