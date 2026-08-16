<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

`notes/wbs-plan-2026-08-14-mobile-parity.md` §1.3's gap list, item 1: "Delete,
duplicate, freeze/unfreeze one row. The `⋯` `ActionsMenu` lives in the table's
`actions` column. Cards render no menu." **M2** of the plan's split — the
second row, after M1 (`mobile-card-facts`, #64) shipped the read-only facts.

## What Changes

**`plan-cards.tsx` and the shared `actions-menu.tsx` only** — not
`wbs-table.tsx`. The table's own `ActionsMenu` is reused as-is (same button,
same keyboard handling, same ARIA menu pattern) rather than a card growing a
second implementation of it.

- Each card's header gets the same ⋯ button, opening the same three items the
  table offers today: **Duplicate** (always), **Unfreeze** (frozen rows only),
  **Delete** (refused on a frozen row with the table's own sentence, `Frozen —
unfreeze this row before deleting it`). No **Freeze** item — the table has
  none either; freezing is plan-wide, a toolbar action (`api.freeze`), not a
  per-row one, so a card inventing one would be a fourth item the desktop does
  not have.
- `actions-menu.tsx` gains one optional prop, `touchSized`, off by default: it
  grows the ⋯ button to a 44px box. The table's own 40px column is unchanged;
  only the card sets it.
- Which row's menu is open is held inside `PlanCards` itself — cards and the
  table are never both on screen (`plan-renderer.ts`'s breakpoint), so there is
  no second open menu anywhere to stay in step with.

## Non-goals

Indent/outdent/move (M4), the four touch pickers (M3), the Gantt and hover
cards (M5+). No **Freeze** per-row item — see above.

## The wiring gap, stated plainly

`rowActions` is an **optional** prop on `PlanCardsProps`. `wbs-table.tsx` is
two other agents' file tonight, so its `<PlanCards>` call site is not touched
and does not pass real `duplicate`/`unfreeze`/`remove` callbacks — the menu
this change builds is complete and tested in isolation but **not reachable
from a running plan** until that three-line wiring lands, once the file is
free. Recorded as this change's open question for Dany, not silently shipped
as if it worked end to end.
