## 1. The removal, and everything that vetoes it

- [x] 1.1 Failing test in `wbs-table.test.tsx`: two empty root rows, caret in
      `020`'s Name, Backspace → the rows read `010`, and `010`'s Name holds
      the focus.
- [x] 1.2 Failing-by-fault tests beside it, each watching `api.remove`: text
      in the Name input (uncommitted) removes nothing; notes remove nothing;
      an estimate removes nothing; a child removes nothing; a dependency
      removes nothing; a nested empty row outdents and removes nothing.
      **Negative test:** with the empty-Name condition removed from the guard,
      the text-in-the-input test must fail; watch it.
- [x] 1.3 Implement in `onKeyDown` in `wbs-table.tsx`: the Backspace branch
      already owns caret-at-zero; a root row falls through to the emptiness
      check and `api.remove`, with the row above (from `flat`) named in
      `focusNext` first.

## 2. Gate and verification

- [x] 2.1 Format, the run-many gate, `openspec validate` — recorded in
      `verify.md` with the fault table.
- [x] 2.2 Deploy to dev. The caret is a browser fact; jsdom models
      `setSelectionRange`, the real key needs Dany's screen — say so in
      `verify.md`.
