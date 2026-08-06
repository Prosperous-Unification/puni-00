## 1. The parser, on its own

- [x] 1.1 Failing tests in `estimate-draft.test.ts` for `parseTrioShorthand`:
      `2/3/8`, spaces, decimals, zero, `5` as all three, empty, `2/3`,
      `1/2/3/4`, `1//3`, `garbage`, `two/3/4`, `-1/2/3`, `2 3 8`, and the
      out-of-order trio. Plus the property the whole change rests on: for
      seven trios, `parse('o/r/p')` equals `sendableTrio` of the same three
      boxes, and four refused trios are refused by both.
- [x] 1.2 `parseTrioShorthand` returning `empty | trio | problem` — three
      cases, because "nothing typed" is neither a request nor a mistake and
      the caller has to tell them apart. The three sentences it and
      `trioProblem` say are extracted to one constant each.
      **Negative test:** make it sort the trio instead of refusing it and
      watch `complains about an out-of-order trio instead of sorting it` fail.

## 2. The folded cell

- [x] 2.1 Failing tests in `wbs-table.test.tsx`, roles left folded: one write
      for one trio; the final figure back afterwards; `5`; spaces and
      decimals; `8/3/2` and `2/3` refused and marked; a refused entry through
      a refetch; emptied against a stored trio and against nothing; the cell
      gone while unfolded; a parent not typed into; ArrowDown down the column.
- [x] 2.2 `combinedDraftKey`, `dropDrafts` and `estimateDraftKeys`;
      `forgetTrioDrafts` becomes `forgetEstimateDrafts` and drops all four
      keys of one row and role. **Negative test:** leave the combined key out
      of it and watch the figure never come back.
- [x] 2.3 `combinedValue`, `combinedProblem` and `commitCombinedEstimate`; the
      folded column's cell becomes a `CellInput` for a leaf, with the `!`
      marker and the wrapper's title kept for the reader.
      **Negative test:** send on a two-number entry and watch the two-number
      table test fail.
- [x] 2.4 `data-cell` on the new input so it joins the keyboard grid, and
      select-on-focus so a caret cannot land inside a computed figure.
      **Negative test:** drop `data-cell` and watch the grid test fail.

## 3. One draft per row and role

- [x] 3.1 Failing tests for both directions of last-edit-wins, each set up so
      the _refused_ entry is what remains — a successful write drops every
      draft anyway and would prove nothing.
- [x] 3.2 The two `dropDrafts` calls, one in each commit.
      **Negative tests:** remove each and watch its own test fail.

## 4. Gate and verification

- [x] 4.1 `CONTEXT.md` gains **Trio shorthand**.
- [x] 4.2 Format, the uncached run-many gate, `openspec validate --all --json`
      — recorded in `verify.md` with the fault table.
- [ ] 4.3 Deploy to dev and type a column of estimates in a browser. The
      select-on-focus, the placeholder, and whether `o/r/p` is discoverable at
      all are the parts jsdom cannot see.
