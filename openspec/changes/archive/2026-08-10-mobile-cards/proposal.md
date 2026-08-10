# The plan reads as cards on a phone, and it is the same plan

## Why

The table is 1106px wide at its narrowest for a two-phase plan, and a phone is 390. Everything about it — the pinned columns, the drag handle, the arrow-key
grid, a toolbar of fourteen controls — is built for a pointer and a keyboard on
a laptop. On a phone it is a page you scroll sideways to read one column of.

This is `M mobile-cards` in
`docs/plans/2026-08-08-phases-gantt-mobile-roadmap.md`, and it is the last of
the presentation lane. `X live-editing-extraction` was built for it: a cell's
unsaved state already belongs to the cell rather than to the thing drawing it,
and the keyboard grid already finds its container by `[data-grid]` rather than
by being a table. This change is the second renderer those two were for.

**The 2026-08-06 "phone cards" kill is superseded by Dany's explicit ask**
(P2.3, "responsive mobile-suitable UI"), and that is recorded here rather than
argued: cards were dropped then because nothing on a phone could be edited
safely while the live-editing state lived in `WbsTable`'s refs. It does not any
more.

## What Changes

**A breakpoint chooses a renderer.** Below 768px of viewport width the plan is
a list of outline cards; at 768 and above it is the table, unchanged. One
component still owns the plan — the state, the commits, the focus intent and
the one `[data-grid]` — and only what it renders at the end swaps.

**A card is a work item you can read and make one edit to at a time.** Its
number and indent, its name and notes in one box, its days, its dates, what it
waits for, and one line per phase carrying the `o/r/p` box and who is on it.
No drag, no keyboard grid, no three-point columns: a phone has neither a
pointer to drag with nor a Tab key to walk a grid with.

**The toolbar folds into a bottom sheet**, on `F shadcn-foundation`'s `Modal`
— which is what holds the page's own keyboard back while it is open.

**Four contracts, each with its own test** (codex #14, agy #11/#12): the cards'
inputs carry the same `data-cell` ids the table's do; the focus lands where a
structural edit asked for it on the card DOM; a draft be-01 refused survives
the breakpoint switch itself, through a real resize; and an open `@` list on a
card owns its keys.

## Non-Goals

- **No new editing.** Dependencies, the team, the not-before date and the three
  points are read-only on a card. They are pickers and a date field, and each
  is its own touch design.
- **No structural editing.** Creating and deleting rows stay in the sheet and
  the desktop table; there is no touch gesture for indent, outdent or move.
- **Nothing about the desktop table.** Its markup, its inline styles and its
  measured geometry are untouched, and the fit matrix is what says so.
- **No orientation or user-agent sniffing.** The question is how wide the
  viewport is, and a 700px window on a laptop gets the same answer as a phone.

## Constraints

- Every existing fe-01 test passes **unedited**, and all 49 browser tests stay
  green: they run at 1400px and wider, where nothing changes.
- Nothing inside the desktop `[data-grid]` gains a utility class. The card
  renderer is new markup and is not the measured grid.

## Capabilities

### Modified Capabilities

- `wbs-domain`: which renderer draws the plan is a fact about the viewport, and
  a cell's identity survives the change of renderer.

## Domain Terms

- outline card
- plan renderer

## Impact

fe-01 only. New `components/wbs/plan-renderer.ts` (the breakpoint) and
`components/wbs/plan-cards.tsx` (the renderer), their tests, and
`e2e/mobile.spec.ts` at 390×844. `wbs-table.tsx` gains the switch, the sheet
and a grid ref that is no longer a `<table>`. No be-01 change, no migration, no
new dependency.
