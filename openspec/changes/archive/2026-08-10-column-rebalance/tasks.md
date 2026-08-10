<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

Every width below is picked by a browser and then written into `table-frame.ts`;
none of them is read off the markup. The browser is a local chromium against
this worktree's own stack on ports 3171/3271/4271 — see `verify.md` for why the
committed Playwright config cannot be used on this machine.

## 1. The date columns fit a printed day

- [x] 1.1 A browser test that a dated plan's Start and End cells each draw one
      line — `e2e/layout.spec.ts`, a plan whose days fall off the current year
      and whose last row has no estimate, asserting each cell's day is drawn no
      taller than the same string drawn `nowrap` in the same cell. **Not**
      `getClientRects().length`: that counts fragments, and End's day and its
      marker are two text nodes on one line — see `verify.md`. Non-vacuity
      first: the text is asserted to carry the year and, on the unestimated
      row, the marker, or the check is about `0` and passes at any width;
      negative: `start`/`finish` left at 52, and again at the 84 this change
      was planned with, watched failing both times
- [x] 1.2 `DAY_ENVELOPE` in `table-frame.ts` — the widest day the formatter can
      print with End's marker after it — and `start`/`finish` declared at the
      width a browser measures it to need. Test: the same spec measures **every**
      day `shortIsoDate` can print, in a real Start cell, and asserts the
      declared width is at least the widest of them plus the cell's padding,
      and that no day measures **wider** than `DAY_ENVELOPE` — a width
      comparison rather than a string one, because several days tie exactly and
      a string comparison would pin which tie the loop saw first; negative: the
      declared width set below the measurement, watched failing
- [x] 1.3 The unit numbers re-pinned: `table-frame.test.ts`'s literal width
      table, the three folded/unfolded equations, and the pinned offsets that
      move with Number. Test: `table-frame.test.ts` green with every equation
      re-derived rather than re-guessed

## 2. The Number envelope shrinks

- [x] 2.1 `NUMBER_ENVELOPE` becomes a two-level number and the browser measures
      it at the indent a two-level row is drawn at — the layout spec's envelope
      test, re-pointed at the `030.1` row, which has children and is frozen so
      the expander and the lock are both in the measurement; the cell's own
      `padding-left` is asserted to be `indentFor(levels − 1)`, so the fixture
      cannot drift to another depth; negative: `number` declared narrower than
      the measurement, watched failing
- [x] 2.2 A number past the envelope still clips rather than wraps, and the
      whole number is still in the `title` — the existing browser test, now
      about a row two levels past the envelope rather than one; negative:
      `whiteSpace: 'nowrap'` removed from the Number cell, watched failing
- [x] 2.3 The indent's own assertion re-derived: at the envelope's depth the
      number keeps the larger half of the column, and past it the clip is the
      contract. Test: `table-frame.test.ts`, the indent block

## 3. Everything that quoted the old numbers

- [x] 3.1 `wbs-table.test.tsx`'s declared `<col>` widths, drag arithmetic and
      two table minima; `phases-dialog.test.tsx`'s quoted sentence;
      `e2e/phases.spec.ts`'s two `min-width` literals. Test: the whole fe-01
      suite and the browser gate green
- [x] 3.2 The JSDoc that carries the old numbers as prose — `COLUMN_WIDTHS`'s
      Number comment, `WIDEST_COLUMN`'s "the widest column the table declares
      today", `NUMBER_ENVELOPE` — rewritten to what is true now, with the
      measurement that picked each width named

## 4. Gate and proof

- [x] 4.1 `bunx nx format:check --all`,
      `bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache`
      and `bunx openspec validate --all --json` green — test: the recorded
      output in `verify.md`
- [x] 4.2 The browser gate green, and `verify.md` carrying the failure-proof
      table: every negative above by name, the fault injected, the test that
      observed it failing, and the result
