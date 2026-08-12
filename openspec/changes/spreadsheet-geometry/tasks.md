# Tasks

Ordered TDD slices. Each negative is watched failing before the line it guards
is believed (R5). The fault numbers are `verify.md`'s.

## 1. The Name column's cap, in the one place a width may live

- [x] `FLEXIBLE_CAP` (420) beside `FLEXIBLE_FLOOR` in `table-frame.ts`, with why
      it is a table width rather than a cell `max-width` written where it lives.
- [x] `FrameLayout.maxWidth`, summed from the same resolved columns as the
      minimum. An override counts as the column's width at both ends, so a
      dragged Name makes the two equal and there is no cap left to reach.
- [x] `tableWidthStyle` declares the capped width where nothing is dragged and
      the resolved sum where something is.
- [x] Two unit negatives in `table-frame.test.ts`, on the sum and on the
      declaration. Faults 1 and 2, watched.
- [x] One jsdom negative on the rendered table, in `wbs-table.test.tsx`: the
      declaration is there and the Name cells still declare a floor and no
      width.
- [x] One browser negative in `e2e/layout.spec.ts`, at 1920, where the gap the
      cap leaves is unmistakable rather than 40px.

## 2. The assertion the cap supersedes, split rather than dropped

- [x] The Name-takes-the-remainder test gains a capped branch and keeps its
      remainder branch, with a third assertion that the viewport matrix really
      holds both a narrow and a wide width — or half of it is a claim nothing
      reads.
- [x] The matrix itself is unchanged; what changed is what is claimed at its
      wide end.

## 3. The grid's type, and the row height it buys

- [x] The grid body and its boxes at 13px over a 1.4 line, scoped to `tbody` so
      the phone's cards keep the page's type — the boundary the number's 11px
      rule already draws. The buttons are **not** in the rule: typing them was
      one commit of this branch and it blinded the reset guard's only oracle in
      CI (run `31617201732`), so they keep the platform's 13.33px. `verify.md`
      records what that cost.
- [x] The boxes off the baseline. An inline-block on the baseline reserves
      descender room, which was 29.19px of row against a 28px budget.
- [x] One browser negative for both: the cell, the box, the comparison against
      the page's own type, and the row measured on a name typed to one line —
      the fixture's own names wrap to two. Faults 3 and 4, watched.
- [x] The deps cell's one-line assertion compares centres rather than tops. The
      box and the `+` are different heights now and sit on one centred line; a
      wrap, which is the fault it catches, is a whole line apart on either
      measure.

## 4. Two headings that are marks

- [x] `ColumnMeta.spokenHeading` on the column definition, put on the `<th>` as
      its `aria-label`. An `aria-label` on a span inside the cell was tried
      first and is not reliably part of the cell's accessible name.
- [x] `#` over the numbering column and one letter over each estimate point,
      each keeping the word as its `title` as well.
- [x] The point columns 52px to 44, and every total that counts three of them.
- [x] The unit tests: the heading list, the accessible names, and the test that
      asserted the clipped word replaced by one that asserts the letter. Faults
      5 and 6, watched.

## 5. The gate

- [x] fe-01's unit suite under a real node on h2puni.
- [x] The browser suite in the Playwright image on h2puni.
- [x] `format:check`, `lint` and `typecheck` on h2puni.
- [x] CI green: the whole gate plus the pixels job.
