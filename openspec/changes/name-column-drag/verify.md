# verify — `U1 name-column-drag`

Branch `change/name-column-drag`, from `main` at `c9dd3fc`.

## What was built

The Name column is draggable. `widthFor` resolves a flexible column's override
before the width table and keeps throwing for flexible-without-override;
`floorFor` grew an explicit flexible arm returning `FLEXIBLE_FLOOR` — the
recorded injected fault of `column-widths-drag/verify.md` row 4, adopted as
behaviour, that negative retired by name; `sizableColumn` admits `name`;
`ResolvedColumn` says both answers (`width`, the resolution; `colWidth`, the
`<col>`'s) so a dragged Name enters the minimum, the folded minimum and the
pinned cell while its `<col>` stays silent; `pinnedGeometryFor` keys its
refusal on flexibility rather than a missing width; `flexibleCellStyle` floors
the cell at the override. `wbs-table.tsx` renders the handle on every leaf
column, measures an undragged Name's from-width from the header cell at
pointerdown, and reads a stored `name` entry under the same claim rules with
Name's own bounds `[FLEXIBLE_FLOOR, WIDEST_COLUMN]`. Reset stays
`forgetWidthOverrides`. Excess-width design: the dragged width rides as
`width` + `min-width` on the Name cells against an unsized `<col name>`.

## Commands

All run from this worktree, 2026-08-10. This machine cannot launch Chromium
(`libatk-1.0.so.0` missing), so the browser layer runs only in CI's `pixels`
job — no local browser claim is made anywhere in this file.

| Command                                                     | Result                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| `bunx nx format:check --all`                                | pass, no output                                            |
| `bunx nx run-many -t test lint typecheck --parallel=2`      | `Successfully ran targets test, lint, typecheck for 21 projects` (nx flags `gw-01:test` flaky; it passed) |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json`     | 19 items, 19 valid, 0 invalid                              |
| `bunx vitest run` in `apps/fe-01`                           | 45 files, 1076 tests, all passing                          |
| CI `gate` on the PR head                                    | recorded below once observed                               |
| CI `pixels` on the PR head                                  | recorded below once observed                               |

## Failure proof

Every row was watched: the fault injected, the named test observed failing
with the message quoted, the fault reverted, the test observed passing again.
jsdom rows were watched locally; browser rows are watched in CI and recorded
here only once observed. Each shipped guard carries a `Proof:` comment beside
the line it protects.

The plan named three injected-fault classes for this change; they are rows
1, 9 and 11 below.

| #   | Guarded line                                                       | Injected fault                                                                 | Test that observed it                                                                                                  | Observed failure                                                                                          |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | `floorFor`'s flexible arm (named fault 1)                          | the arm removed                                                                | `table-frame.test.ts` — `resolves a dragged width for the flexible column, and a floor of its own` (and `has a floor that does not move with the plan…`) | `UnknownColumnError: No declared width for column "name"` out of the floor lookup                          |
| 2   | `widthFor`'s flexible-override arm                                 | the arm removed                                                                | `table-frame.test.ts` — `resolves a dragged width for the flexible column…`                                             | `UnknownColumnError: No declared width for column "name"` with the override in force                       |
| 3   | `frameLayout` keeping `colWidth` silent for a flexible column      | `colWidth` handed the override                                                 | `table-frame.test.ts` — `lays out, adds up, folds and pins a dragged Name…` (and `still refuses a column pinned behind the flexible one…` beside it) | `expected 300 to be undefined`, and `expected [Function] to throw an error`                                |
| 4   | the minimum counting the override in place of `FLEXIBLE_FLOOR`     | the flexible arm made to count `FLEXIBLE_FLOOR` regardless                     | `table-frame.test.ts` — `lays out, adds up, folds and pins a dragged Name…`                                             | `expected 1007 to be 1107` — the folded minimum 100px short of the table on screen                         |
| 5   | `pinnedGeometryFor`'s refusal keyed on flexibility                 | keyed back on `resolved.width === undefined`                                   | `table-frame.test.ts` — `still refuses a column pinned behind the flexible one, override or not`                        | `expected [Function] to throw an error` — `depends` pinned behind a dragged Name at a plausible offset     |
| 6   | the pinned cell carrying the resolved width                        | re-pointed at `resolved.colWidth`                                              | `table-frame.test.ts` — `lays out, adds up, folds and pins a dragged Name…`                                             | `expected { left: 117, width: undefined } to deeply equal { left: 117, width: 300 }`                       |
| 7   | `flexibleCellStyle` flooring the cell at the override              | the override dropped from the floor                                            | `table-frame.test.ts` — `lays out, adds up, folds and pins a dragged Name…`                                             | `expected { minWidth: 200 } to deeply equal { minWidth: 300 }`                                             |
| 8   | `sizableColumn`'s flexible arm                                     | the arm deleted                                                                | `table-frame.test.ts` — `says which ids can be sized at all…`                                                           | `expected false to be true`                                                                                |
| 9   | the storage range check judging a `name` entry (named fault 2)     | the check bypassed for `name` — the sanitizer trusting a flexible entry        | `wbs-table.test.tsx` — `drops a stored Name width outside Name's own bounds, each end on its own`                       | `expected '150px' to be ''` — a hand-edited 150 laid onto the Name cells below the floor no drag can pass  |
| 10  | `resizeHandleFor` rendering the handle on every leaf column        | the retired undefined-width suppression restored                               | `wbs-table.test.tsx` — `offers a handle on every column, the Name column included`                                      | `expected [ 'drag', 'number', 'depends', …(13) ] to deeply equal [ 'drag', 'number', 'name', …(14) ]`      |
| 11  | the `<colgroup>` reading `colWidth` (named fault 3, jsdom half)    | the colgroup re-pointed at `column.width` — `<col name>` sized from the override | `wbs-table.test.tsx` — `lays a remembered Name width on the Name cells, and leaves its <col> silent`                    | `expected '300px' to be ''`                                                                                |
| 12  | the Name drag gesture itself (browser)                             | to be watched in CI: the handle's pointer handlers removed, rendered and inert | `e2e/layout.spec.ts` — `widens the Name column by dragging its header edge, with its <col> silent`                      | recorded once observed in CI                                                                               |
| 13  | the excess-width design (named fault 3, browser half)              | to be watched in CI: `<col name>` sized from the override                      | `e2e/layout.spec.ts` — `keeps every other column on its envelope while Name holds a dragged width`                      | recorded once observed in CI                                                                               |

## The task-5 branch decision

The plan requires the e2e measurement at 1512×982 to decide between the
cell-width design and the table-width-sum fallback, with the losing branch
deleted. The cell-width design is the one implemented; the decision is
recorded here once CI's `pixels` job has run the measurement.

## Not verified

- **Dany looks at it on dev** (tasks 6.2): the feel of a dragged Name is a
  judgement call; not doable from this worktree.
- **Touch and pen pointers**: unchanged from `column-widths-drag` — the only
  pointer any test drives is Chromium's mouse.
