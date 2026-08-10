## 1. be-01 remembers what each account opened

- [x] 1.1 Failing test in `project.test.ts` (repository): `listFor(userId)`
      orders opened-first by recency, then never-opened by creation, and
      carries `lastOpenedAt` per account. **Negative test:** SQLite's
      NULLs-last-on-DESC is the rule the order rests on; a project nobody
      opened must sort after one that was, watched failing with the
      `createdAt` tiebreak removed.
- [x] 1.2 `project_access` table in `schema.ts`, migration + `down.sql`
      (additive: new table only, nothing existing altered).
- [x] 1.3 `ProjectStore.listFor` and `recordOpen`; `ProjectRepository`
      implements both with one left join and one upsert.
- [x] 1.4 Failing test in `project.controller.test.ts`: `POST /:id/opened`
      answers 401 unauthenticated, 404 for an unknown id, 204 otherwise, and
      a restricted project owned by someone else is recordable.
- [x] 1.5 `ProjectService.open`, and `list` taking the caller's id; controller
      route wired.

## 2. fe-01's picker searches

- [x] 2.1 Failing tests for a pure `matchingProjects` in `project-picker.ts`:
      case-insensitive substring on the name, order preserved, empty query
      offers everything.
- [x] 2.2 Failing tests in `project-page.test.tsx`: typing narrows;
      ArrowDown+Enter selects and the table appears; the entries keep be-01's
      order; choosing records the open; a restored project records too.
- [x] 2.3 Replace the `<select>` with the combobox, reusing the Depends on
      picker's ARIA shape; `ProjectSummary.lastOpenedAt` and `openProject` in
      `wbs-api.ts`.

## 3. Gate and verification

- [x] 3.1 Format, the run-many gate, `openspec validate`, migration lint —
      recorded in `verify.md` with the fault table.
- [x] 3.2 Deploy to dev. The dropdown's pixels need Dany's screen; say so.
