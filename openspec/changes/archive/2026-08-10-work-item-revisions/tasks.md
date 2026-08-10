## 1. The column

- [x] 1.1 `20260807090000_add_revisions`: `revision integer NOT NULL DEFAULT 0`
      on `work_item` and on `project`, plus the `down.sql` that drops them and
      says what is lost. Additive, so blue and green share the file safely.
- [x] 1.2 The migration list in `repository/migrate.test.ts` and
      `migrate-down.test.ts`. **Watched failing first:** with the folder on disk
      and the lists unchanged, six tests across the two files failed on the
      order and on `rollbackTo` finding one migration more than the list named.
- [x] 1.3 The columns on `schema.ts` with the rule in JSDoc — what a revision
      is, that satellites move it, and that the derived number does not.
      `revision` on `WorkItem` and `Project` in `repository/index.ts`.

## 2. The bumps, exhaustively

- [x] 2.1 `repository/revision.ts`: `bumpedWorkItem`, `bumpedProject`,
      `bumpWorkItems(writer, ids)`, `bumpProject(writer, id)`. All SQL
      arithmetic, all issuable from a transaction or from the connection, so the
      bump never becomes a second statement outside the write's atomicity.
- [x] 2.2 `WorkItemRepository`: patch, move, `setFrozenNumbers`, and the
      promotions inside `remove`. Respaced siblings deliberately untouched.
- [x] 2.3 `bumpedWorkItemOnReparent`: `remove`'s promotion list mixes genuinely
      reparented children with the former siblings it respaced, so the bump is
      conditional on the parent actually changing — decided in SQL, against the
      row as it was, so it stays one statement.
- [x] 2.4 `EstimateRepository`: `set`, `remove` and `moveAll` in transactions
      that carry the bump; `moveAll` moves both work items.
- [x] 2.5 `DependencyRepository`: `add` and `remove` move both endpoints;
      `removeAllFor` reads which edges it is deleting and moves the surviving
      ends only.
- [x] 2.6 `DirectoryRepository.assign`: set and clear both move the work item.
- [x] 2.7 `ProjectRepository.update` bumps in its own `SET`; `recordOpen`
      deliberately does not, with the reason on the method.
- [x] 2.8 Services: a created work item and a created project start at 0, and a
      duplicated subtree's copies are reset to 0 rather than inheriting.

## 3. The battery

- [x] 3.1 `service/revision.test.ts`: every mutation kind against real SQLite
      through the real repositories and the real services — 25 cases, each
      asserting what moved **and** what did not.
- [x] 3.2 The not-moving cases, which are the point: duplicate leaves the
      original alone, opening a project does not move it, an estimate on one
      work item does not move another, respacing moves nothing, the two levels
      do not move each other.
- [x] 3.3 The arithmetic case: two `EstimateRepository`s on two connections to
      one file leave the counter at 2. States its own limit — bun:sqlite is
      synchronous and in-process, so nothing here observes a lost update.
- [x] 3.4 **Six faults injected and watched failing**, recorded in `verify.md`.

## 4. Exposure

- [x] 4.1 `revision` on the tree's work items (inherited from `WorkItem`, and
      redeclared on `NumberedWorkItem` to say what it means to a reader);
      `projectRevision` on the tree response.
- [x] 4.2 fe-01: `revision` on `WorkItemView`, `projectRevision` on the tree
      response, both threaded through the table's fakes. No UI behaviour change.

## 5. Gate

- [x] 5.1 `format:check --all`, the run-many gate uncached, `openspec validate
--all --json`, recorded in `verify.md` with the fault table.
