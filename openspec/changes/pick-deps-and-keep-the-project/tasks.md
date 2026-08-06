## 1. The picker's decisions, pure

- [x] 1.1 `dep-picker.ts` beside `depends-input.ts`:
      `pickerEntries(rows, forRow, typed)` returns the offerable rows —
      everything except the row itself and its current predecessors — filtered
      by case-insensitive substring on number or name, in table order. Failing
      tests first in `dep-picker.test.ts`: filter by number, filter by name,
      exclusion of self and existing deps, empty filter offers everything
      offerable.
- [x] 1.2 **Negative test:** with the exclusion removed, the self-row appears —
      watch the exclusion test fail against that fault before restoring it.

## 2. The picker in the table

- [x] 2.1 Failing tests in `wbs-table.test.tsx`: focusing the Depends on cell
      shows entries carrying number and name; typing narrows them; clicking one
      calls `addDependency` and leaves the input focused and empty with the list
      still available; Enter adds the highlighted entry; Escape closes the list;
      typed `010, 020` + Enter still adds both (the existing tests of the typed
      flow keep passing untouched).
- [x] 2.2 Implement in `wbs-table.tsx`. The list is per-cell, rendered only for
      the focused Depends on input, read through `live` — `columns` must keep
      its `[roles]` dependency list, and the landmine comment there explains
      why. ArrowUp/ArrowDown move the highlight; they must not leak into the
      grid navigation (the Depends input carries no `data-cell`, so they
      cannot). **Negative test:** a stray Enter in an empty cell must add
      nothing — watched failing with the focus handler highlighting the first
      entry.

## 3. The project that stays chosen

- [x] 3.1 Failing tests in a new `project-page.test.tsx` with a fake
      `ProjectApi`: selecting a project stores it; a fresh render with the store
      populated selects it without a click; a stored id absent from the list is
      ignored and nothing is selected. **Negative test:** the absent-id guard
      removed must fail the test — the select's read-back value is no evidence,
      so the test watches whether the deleted project's tree is requested.
- [x] 3.2 Implement in `project-page.tsx`: read the remembered id when the list
      arrives, write it on every selection change, clear it on deselect.

## 4. Rename

- [x] 4.1 `renameProject(id, name)` on `ProjectApi` in `wbs-api.ts`, PATCHing
      `/api/projects/:id`.
- [x] 4.2 Failing tests in `project-page.test.tsx`: Rename swaps the picker for
      an input holding the current name; Enter commits and the picker shows the
      new name with the project still selected; Escape cancels with no request;
      a `forbidden` rejection is shown and the old name stays.
- [x] 4.3 Implement in `project-page.tsx`.

## 5. Gate and verification

- [ ] 5.1 `bunx nx format:check --all`, the run-many gate over test, lint,
      typecheck and build, and `openspec validate --all --json` — recorded in
      `verify.md` with the failure-proof table.
- [ ] 5.2 Deploy to dev, confirm the three behaviours through the real edge as
      far as h1claw can (API-level rename; the picker and persistence need a
      browser — state plainly in `verify.md` what was and was not watched).
