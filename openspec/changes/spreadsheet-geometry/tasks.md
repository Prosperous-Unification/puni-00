# Tasks

Ordered TDD slices. Each negative is watched failing before the line it guards
is believed (R5). Fault ids are the ones the `Proof:` comments in the code name;
`verify.md` holds what each was watched saying.

## 1. The Name column's cap, in the one place a width may live

- [x] `FLEXIBLE_CAP` (420) beside `FLEXIBLE_FLOOR` in `table-frame.ts`, with
      why it is a table width and not a cell `max-width` written where it lives.
- [x] `FrameLayout.maxWidth`, summed from the same resolved columns as
      `minWidth` — an override counting as the column's width at both ends, so a
      dragged Name makes the two equal and there is no cap left to reach.
- [x] `tableWidthStyle` declares `min(100%, maxWidth)` where nothing is dragged
      and the resolved sum where something is.
- [x] `table-frame.test.ts`: `caps the table at the fixed columns plus the Name
      cap` and `lays the cap on the table itself, with the minimum still under
      it`. Faults FAULT-CAP-SUM and FAULT-CAP-FLAT watched.
- [x] `wbs-table.test.tsx`: `lays the Name cap on the table itself, with nothing
      dragged` — the rendered table, and the Name cells still declaring a floor
      and no width.
- [x] `e2e/layout.spec.ts`: `stops the table at the Name cap, and leaves the
      rest of the window empty` at 1920, where the gap is unmistakable rather
      than 40px.

## 2. The assertion the cap supersedes, split rather than dropped

- [x] `gives the name column everything the other columns did not take` becomes
      `…, up to its cap`: the remainder branch at 1280 and the capped branch at
      1512, with a third assertion that the matrix really contains both widths —
      or half the test is a claim nothing reads.
- [x] The two-viewport matrix is unchanged; what changed is what is claimed at
      the wide end.

## 3. The grid's type, and the row height it buys

- [x] `[data-grid] tbody`, its boxes and its buttons at 13px/1.4 in
      `styles.css`, `tbody`-scoped so the phone's cards keep the page's type —
      the same boundary the number's 11px rule already draws.
- [x] `vertical-align: middle` on the same boxes: an `inline-block` on the
      baseline reserves descender room, which was 29.19px of row against a 28px
      budget.
- [x] `e2e/layout.spec.ts`: `sets the grid body's type below the page's own, and
      keeps a row inside its budget` — the cell, the box, the comparison against
      the page, and the row measured on a name typed to one line, because the
      fixture's own names wrap to two. Faults FAULT-GRID-TYPE and FAULT-BASELINE
      watched.
- [x] `e2e/deps-cell.spec.ts`'s `rests an empty cell at its own height while the
      picker is open` compares the box's and the `+`'s **centres**: they are
      different heights now, they sit on one `align-items: center` line, and a
      wrap — the fault it catches — is a whole line apart either way.

## 4. Two headings that are marks

- [x] `ColumnMeta.spokenHeading` declared on the column definition, put on the
      `<th>` as its `aria-label`. An `aria-label` on a `<span>` inside the cell
      was tried first and is not reliably part of the cell's accessible name —
      watched: `getByRole('columnheader', { name: 'Number' })` found nothing.
- [x] `#` over the numbering column, `o`/`r`/`p` over the three points, each
      keeping the word as its `title` as well.
- [x] `ROLE_POINT_WIDTH` 52 → 44, and every total that counts three of them.
- [x] `wbs-table.test.tsx`: the heading list reads `#`, the columnheader is
      named `Number`, and `heads each point with its first letter, and says the
      whole word twice over` replaces the test that asserted the clipped word.
      Fault FAULT-SPOKEN watched.

## 5. The gate

- [x] fe-01 unit suite under a real node on h2puni.
- [x] `bun run e2e` in the Playwright image on h2puni.
- [x] `format:check --all`, `lint`, `typecheck` on h2puni.
- [x] CI green: the whole gate plus `pixels`.
