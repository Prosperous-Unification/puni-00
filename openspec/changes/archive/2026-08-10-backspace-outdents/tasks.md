## 1. The key, and the three ways it must stay a backspace

- [x] 1.1 Failing test in `wbs-table.test.tsx`: caret at position 0 of
      `010.1`'s name, Backspace → the rows read `010`, `020`.
- [x] 1.2 Failing-by-fault tests beside it, each watching `api.move`: caret
      mid-text moves nothing; a selection — including one anchored at the
      start — moves nothing; a root row moves nothing. **Negative test:** with
      the `atStart` condition removed, the mid-text test must fail; watch it.
- [x] 1.3 Implement in `onKeyDown` in `wbs-table.tsx`: `caretOf` already
      answers atStart/hasSelection; reuse `outdent`, which already owns the
      move and the focus-follow.

## 2. Gate and verification

- [x] 2.1 Format, the run-many gate, `openspec validate` — recorded in
      `verify.md` with the fault table.
- [x] 2.2 Deploy to dev. The caret position itself is a browser fact; jsdom's
      `setSelectionRange` models it, watching it for real needs Dany's screen —
      say so in `verify.md`.
