# A component library the table can live next to

## Why

`T tailwind-spike` put Tailwind v4 in the build and deliberately shipped no
reset: preflight is document-wide, and `table-frame.ts`'s column widths were
measured against a browser's own defaults. It left `base` declared and empty
for "a scoped reset" and three findings for this change to read first.

This is `F shadcn-foundation` in
`docs/plans/2026-08-08-phases-gantt-mobile-roadmap.md`. Four changes are queued
behind it — `H`, `P`, `X`, `M` — and each of them needs a dialog, a button and a
palette that already exist.

## What Changes

**A foundation.** `components.json`, the shadcn token set as CSS custom
properties (`:root` and `.dark`), `--radius`, `--font-sans`, and vendored
`Button`, `Input`, `Label`, `Card` and a `Modal` built on `@radix-ui/react-dialog`.

**A scoped reset.** It lands in the `base` layer `T` left, and every rule in it
carries `:not([data-grid], [data-grid] *)`. `data-grid` goes on the `<table>`.
The table, its inputs, the buttons in its cells, the date box and both pickers
**measure** identically before and after. One thing about them does change, by
inheritance rather than by the reset: their text colour follows the page's
`--foreground` token. That is deliberate and pinned by a browser assertion.

**Chrome adopts it.** Auth screen, toasts, the cheat sheet, the toolbar, the
project picker, the presence panel. Every swap keeps its role, accessible name
and labelling; where no assertion held one of those, the change writes the
assertion rather than claiming it.

**An open modal holds the page's keyboard back.** `?`, Cmd+Z and the command
chords are listened for on `window` and on the cells, and knew nothing about
dialogs. One rule in the modal wrapper, asked of the same predicates the
listeners use.

## Non-Goals

- **No dark mode.** The variables are configured; nothing sets `dark`.
- **No new face.** `--font-sans` is `sans-serif`, the family the table was
  measured in. Changing it moves the `not-before` column and belongs with `H`.
- **Nothing inside `<td>`.** The grid gets tokens by inheritance and no utility
  classes. The ⋯ menu and both pickers keep their own internals.
- **No Radix Select or date picker.** Both would replace a native control's
  accessibility tree and rewrite tests that are the spec.

## Constraints

- `layout.spec.ts` (22) and `keyboard.spec.ts` (8) pass untouched.
- `tailwind.spec.ts`'s two "no reset" assertions guarded an _unscoped_ reset;
  they are reworked, and the fault they existed for is re-armed on the grid side.

## Capabilities

### Modified Capabilities

- `frontend-foundation`: the app has a token palette, a vendored component set,
  and a reset that stops at the editable grid.
- `wbs-domain`: a modal surface holds the page's keyboard while it is open.

## Domain Terms

- chrome
- editable grid
- scoped reset
- modal surface

## Decisions Recorded

`design.md` — the routing matrix (what is vendored, what keeps its internals,
and why), and why Radix was rejected for the ⋯ menu and the pickers.

## Impact

fe-01 only. `styles.css`, `components.json`, five files under
`src/components/ui/`, and the chrome in `app.tsx`, `auth-form.tsx`,
`presence-panel.tsx`, `project-page.tsx`, `toasts.tsx`,
`keyboard-cheat-sheet.tsx` and `wbs-table.tsx`'s toolbar. One new dependency,
`@radix-ui/react-dialog`. No be-01 change, no migration, no deploy change.
