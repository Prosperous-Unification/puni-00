<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The ⋯ button reaches 44px without moving the table's

- [x] 1.1 `actions-menu.tsx`: optional `touchSized` prop on `ActionsMenuProps`,
      default `false`. When true, the button's inline style adds
      `minWidth`/`minHeight: 44` and centers the glyph. Test: `grows the ⋯
      button to a 44px tap target only when asked to` — asserts the style is
      absent by default and present when the prop is set.

**No new guard.** A style branch on an existing prop, not a state the menu
could silently drop — the lighter contract's own rule for a layout change.

## 2. The menu on a card

- [x] 2.1 `CardRowActionHandlers` (`duplicate`, `unfreeze`, `remove`, optional
      `busy`) and `rowActions?: CardRowActionHandlers` on `PlanCardsProps`.
      Absent, no ⋯ button renders at all. Test: `prints no ⋯ button at all
when the caller has not wired row actions`.
- [x] 2.2 `cardRowActions(row, handlers)`: the same three items
      `wbs-table.tsx`'s own `ActionsMenu` usage builds — same ids, same
      labels, same order, same refusal sentence on a frozen row. Tests:
      `offers Duplicate and Delete on a row that is not frozen`, `adds
Unfreeze, and refuses Delete with the table's own sentence, on a frozen
      row`.
- [x] 2.3 Which row's menu is open, held as `PlanCards`' own state (not a
      prop) — cards and the table never coexist. Test: `keeps at most one
card's menu open at a time`.
- [x] 2.4 Wiring: each item's `run` calls the right handler with the right
      argument (`duplicate`/`unfreeze` take the row id, `remove` takes the
      row), and a refused item calls nothing. Tests: `duplicates and unfreezes
      by the row id, and deletes by the row itself`, `does not delete a frozen
row through the menu — the refusal actually refuses`.
- [x] 2.5 The button is `touchSized`. Test: `grows the ⋯ button to a 44px tap
      target, the phone floor every card control keeps`.

## 3. The record

- [x] 3.1 `proposal.md`, this file, the delta spec, `verify.md`. **No
      `design.md`** — PoC-mode contract, 2026-08-14. `verify.md` also carries
      the wiring gap as an open question, since it is the one thing this
      change cannot prove by itself.

## Left undone, on purpose

No `wbs-table.tsx` edit: the real `duplicateRow`/`api.unfreeze`/`deleteRow`
callbacks are not passed from the table's `<PlanCards>` call site, so the menu
this change builds cannot be exercised from a running plan tonight. See
`verify.md`'s open question.
