<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The column

- [x] 1.1 `table-frame.ts`'s `COLUMN_WIDTHS`: `['number', 93]` → `['number',
      105]`. Comment states the reversible/non-reversible split design.md D4
      offered and why this is the one taken. No other constant moves —
      `NUMBER_ENVELOPE_LEVELS`, `DEEPEST_INDENT`, `INDENT_STEP`, `CARET_GUTTER_PX`
      are untouched, and their own JSDoc paragraphs that quoted the old figure
      are corrected to the new one.

## 2. The two new guards

- [x] 2.1 `e2e/layout.spec.ts` grows `two rows a level apart read as two
      different numbers, at depth 5 and 6` — `DEEPER_CLIPPED_PAIR`
      (`030.1.1.1.1` / `030.1.1.1.1.1`, both built by the existing
      `seedDeepBranch`), mirroring the depth-4 case `table-mechanics` already
      proved. **Negative:** at `['number', 93]` this fails the same way the
      depth-4 case failed before that change — both rows draw `030.1.1.1.` —
      reasoned from `table-width-budget`'s own character-by-character
      measurement of this exact pair rather than separately re-watched, since
      the geometry it measured at 2026-08-14 is this pair's.
- [x] 2.2 `e2e/layout.spec.ts` grows `the break moves to depth 6 and 7, and
      this change does not claim to have closed it` — `DEEPEST_CLIPPED_PAIR`
      (`030.1.1.1.1.1` / `030.1.1.1.1.1.1`), asserting the two **do** still
      read alike. Keeps 2.1 from being read as "the fault is gone": design.md
      D4 states widening buys exactly one level, and `deriveNumbers` has no
      bound on depth, so a fixed-width column always has a next depth that
      overruns it.

## 3. Every number the width change moves

- [x] 3.1 Every literal derived from `COLUMN_WIDTHS`'s `number` entry across
      the repo, +12px each, found by grepping for `93`/`1219`/`1123`/`1315`/
      `1247`/`1343`/`1499`/`1055`/`117`/`1471`/`1723` and auditing every hit:
      `table-frame.test.ts` (pinned offsets, `minWidth`/`maxWidth` sums,
      `foldedTableMinWidth`), `wbs-table.test.tsx` (pinned cell offsets,
      `<colgroup>` widths, reset/override assertions), `phases-dialog.test.tsx`
      (the quoted sentence, both singular and plural), `e2e/layout.spec.ts` and
      `e2e/phases.spec.ts` (`declaredLeft('name')`, the quoted sentence, the
      declared `min-width`). Historical `Proof:`/fault citations naming the old
      figures as **what a past watched run observed** are left as the record
      they are, matching this repo's existing convention (e.g. `COLUMN_WIDTHS`'s
      own `169 → 93` note).

## 4. The record

- [x] 4.1 `proposal.md`, this file, `verify.md`. **No `design.md`** —
      `table-width-budget`'s own design.md D4 is the authority this change
      cites rather than repeats. PoC-mode contract, `notes/delivery-modes.md`,
      2026-08-14.
