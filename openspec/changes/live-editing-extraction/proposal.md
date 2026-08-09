# A cell's live state stops belonging to the box it is typed into

## Why

The collaborative machinery — the value the server last sent, the word somebody
is halfway through, the request still out, the draft be-01 refused, the focus a
structural edit asked for — lives in `WbsTable` refs and `CellInput` refs today.
`M mobile-cards` is a **second renderer** at a breakpoint, and a phone turned
sideways unmounts the first one. Every ref goes with it.

`P phases-ui` already met half of this: a phase change unmounts every cell, so
the refused draft was moved out of the component and keyed on the cell. The
other half is that a card is not a `<table>`, and `editableGrid` found its grid
with `closest('table')` — under a card renderer every arrow key would have found
no grid and quietly done nothing (agy #11).

This is `X live-editing-extraction` in
`docs/plans/2026-08-08-phases-gantt-mobile-roadmap.md`, and it is a **pure
refactor**: the 692 fe-01 tests and the 47 browser tests are the spec, and they
pass unchanged.

## What Changes

**`live-editing.ts` owns a field.** `LiveField`, keyed `rowId::columnId`, holds
the baseline, the typed flag, the refusal and the submission record, and runs
the commit pipeline that rules 1–5 describe. `CellInput` keeps what is genuinely
about an `<input>`: which of the two elements to render, how tall a textarea
grows, and which browser events mean typed and left. `FocusIntent` joins it —
where a structural edit asked the focus to go, and whether the reader has since
moved on.

**`editable-grid.ts` owns the grid.** `editableGrid`, `focusAdjacentCell` and
the rest find their container by `[data-grid]`, which the table has carried
since `F shadcn-foundation`, instead of by being a table.

**A refused draft survives the renderer.** Not only the remount `P` covered:
type, be refused, swap the component doing the rendering, and the text is in the
box. That is the one contract here that is new rather than moved, and it has its
own tests on two faces of one field.

## Non-Goals

- **No second renderer.** The cards are `M`. This changes nothing on screen.
- **No wider preservation.** A new face inherits the held refusal and nothing
  else; `shown`, `typed` and `sent` are re-derived from the server value it is
  handed, exactly as the component's refs were when they died with it. Carrying
  them across would change rules 2 and 5 and nothing tests that.
- **No estimate drafts.** They are `WbsTable` state keyed `rowId::roleId::point`
  and feed rendering, not the commit pipeline; moving them is a render-behaviour
  change, not a lifetime one.

## Constraints

- Every existing fe-01 test passes **unedited**. They are the spec.
- `e2e/layout.spec.ts`, `keyboard.spec.ts`, `tailwind.spec.ts`, `header.spec.ts`
  and `phases.spec.ts` — 47 tests — pass untouched.
- Nothing inside `[data-grid]` changes shape: the fit matrix is measured against
  it.

## Capabilities

### Modified Capabilities

- `wbs-domain`: a cell's unsaved state belongs to the cell, not to the thing
  drawing it.

## Domain Terms

- live field
- refused draft
- face
- focus intent

## Impact

fe-01 only. New `components/wbs/live-editing.ts` and
`components/wbs/editable-grid.ts`; `cell-input.tsx` loses everything but the
box; `wbs-table.tsx` loses the grid helpers and the two focus refs. New
`live-editing.test.tsx`. No be-01 change, no migration, no new dependency, no
browser spec added.
