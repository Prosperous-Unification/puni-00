# One width table, Tab in every cell, and a browser that watches both

## Why

Dany, 2026-08-07, looking at dev: the Name column paints over "Depends on", the
notes box runs into the column beside it, and Tab out of an estimate does
nothing. Three complaints, one cause and one absence.

The cause: **three width systems at once.** The pinned columns carried declared
pixel widths, every other column was laid out `auto` from its content, and the
controls inside the cells asserted widths of their own in `em`. Nothing tied
any of the three together, so the offset Name was pinned at was computed from
numbers the browser had never agreed to lay Number out at. That is the overlap.

The absence: **nothing with a rendering engine had ever seen this table.** 450
unit tests watch the right rules arrive on the right elements, and jsdom lays
nothing out — every one of them passed throughout. A bug about geometry cannot
be caught by a test environment that has no geometry.

Tab is the same story one layer up: the Name cell handled it, no other cell
did, and the pickers and the date box were not in the keyboard grid at all.

## What Changes

**One table of widths, read by everything**

- `table-frame.ts` holds a width per column id. `widthFor` throws
  `UnknownColumnError` on an id nobody sized — a silent fallback is how a
  column comes to be laid out at one width and offset from another.
- The table renders a `<colgroup>` from the columns it is actually showing and
  is `table-layout: fixed` at the total of them. The pinned offsets are prefix
  sums of the same numbers.
- Every control in a cell is `width: 100%` of the cell rather than a width of
  its own, and every cell is `overflow: hidden` as the backstop. What has to
  escape — the dependency listbox, the notes preview — is absolutely positioned
  inside a wrapper that does not clip, and still does.

**Tab moves from every cell**

- Every editable control carries `data-cell`, including the dependency box, the
  team and assignee pickers, and the earliest-start date. Tab and Shift+Tab
  walk that grid from any of them.
- The Name cell keeps its caret-zero indent and outdent. Removing it in favour
  of Alt+Arrow was proposed and rejected: it is the outliner reflex Enter-Tab
  entry is built on.
- Read-only rolled-up figures and the disabled date cell are stepped over — a
  cell that refuses the focus is a keystroke that takes the key and lands
  nothing.

**A browser watches the pixels**

- `apps/fe-01/e2e/layout.spec.ts` drives a real chromium against the real
  three-app stack, seeds a plan through the UI, and measures rectangles:
  adjacency unscrolled, every control inside its cell, the pinned columns at
  their declared offsets before and after a horizontal scroll, and the pinned
  block's right edge probed with `elementFromPoint`. A new CI job, `pixels`,
  runs it and uploads a screenshot of the table on every run.

## Non-Goals

- **No width tuning loop through CI.** The numbers were settled by eye once;
  the screenshot artifact is a diagnostic, not a design surface.
- **No pixel diffing or screenshot baseline.** A baseline fails on a font
  update and passes on the bug.
- **No second browser.** Chromium alone: this is a check about this
  application's geometry, not about engine differences.
- **No header or label polish**, no right-aligned numerics, no `tabular-nums`.
  Off the critical path; its own change if it is wanted.
- **No removal of Tab-at-caret-zero.** A product decision, ten tests, and
  Dany's call to make.
- **The pickers and the date are Tab destinations, not arrow sources.** Left
  and right at the caret's edge do not leave them; they keep their own
  keyboards.

## Capabilities

### New Capabilities

- none

### Modified Capabilities

- `wbs-domain`: the table is laid out by one table of widths, the keyboard
  reaches every field of a row, and a browser proves both on every push.

## Domain Terms

- Width table
- Pinned column
- Keyboard grid
- Layout gate

## Impact

fe-01 (`table-frame.ts`, `wbs-table.tsx`, `creatable-picker.tsx`,
`keyboard-bindings.ts`, new `box-geometry.ts`, new `e2e/layout.spec.ts` and
`playwright.config.ts`, new `tsconfig.e2e.json`, `project.json` targets
`e2e`/`lint`/`typecheck`), root `package.json`, `.github/workflows/ci.yml`
(new `pixels` job; `gate` untouched). No be-01 change, no migration, no deploy
change.
