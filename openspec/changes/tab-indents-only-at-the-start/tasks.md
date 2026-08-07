## 1. Positional Tab

- [x] 1.1 Failing tests in `wbs-table.test.tsx`: Tab mid-text in `010`'s name
      focuses `010`'s first estimate cell with its text selected and requests
      no move; Shift+Tab mid-text in `020`'s name focuses the row above's last
      editable cell; Tab over a selection navigates rather than indents. Each
      watches `api.move`.
- [x] 1.2 Implement in `wbs-table.tsx`: extract the arrow keys' committed-DOM
      grid read into a shared helper; the Tab branch keeps indent/outdent for
      a start-of-text caret and otherwise focuses the adjacent grid cell,
      leaving the key to the browser at the edge. Existing indent/outdent
      tests (empty inputs, caret at zero) must keep passing untouched — they
      are the guard on the "at the start, unchanged" half.
- [x] 1.3 **Negative test:** with the `atStart` gate deleted from the Tab
      branch, the mid-text navigation test must fail (a move request instead
      of a focus change); watch it.

## 2. Gate and verification

- [x] 2.1 Format, the run-many gate, `openspec validate` — recorded in
      `verify.md` with the fault table.
- [x] 2.2 Deploy to dev; the real key in a real caret remains the standing
      browser gap, named in `verify.md`.
