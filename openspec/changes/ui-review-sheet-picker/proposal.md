# Toasts over sheets, whole project names, bounded sheet pickers

## Why

The round-4 UI review (puni-plan `ui-review/findings.md`) found three places
where the reader cannot see what the app is saying. On a phone, a refused
Import JSON raised its toast under the Plan actions sheet it was chosen on, so
nothing visibly changed (F-085). The header's project list cut names at its
edge without an ellipsis, and an import's `(imported 15 Oct)` is at the end of
its name, so two imports of one plan read the same on every phone and on a
laptop past about 22 characters (F-086). A long name in a phone reference
sheet's option list made the list wider than the sheet, and scrolling the
active line into view scrolled the whole sheet sideways, cutting its title and
chips (F-092, also the cause of the `reference-cells.spec.ts` phone flake).

## What Changes

- Toasts are drawn above every modal surface and answer a tap while one is
  open; dismissing a toast does not close the surface under it.
- The header's project list wraps a long name onto more lines instead of
  cutting it; the meta still truncates. The closed picker keeps its ellipsis and
  its fact card naming the whole project.
- A picker list on a modal surface is never wider than its box; bottom sheets wrap each
  option's whole name so touch users can read it without a fact card. Compact
  lists retain an ellipsis. Phone rows have symmetric 12px vertical padding
  and a minimum 44px target.

## Non-goals

- No change to a table cell's picker width: in the table the list may still
  outgrow its narrow column.
- No native `title` attributes: the app's own fact card (`data-fact`) is the
  title, as `hints.spec.ts` requires.
- No change to what the toast says or how long it stays.

## Impact

`apps/wbs/fe-01` only: `components/wbs/toasts.tsx`, `components/ui/modal.tsx`,
`components/wbs/creatable-picker.tsx`, `components/wbs/project-page.tsx`,
`styles.css`; e2e `plan-import.spec.ts`, `header.spec.ts`,
`reference-cells.spec.ts`.
