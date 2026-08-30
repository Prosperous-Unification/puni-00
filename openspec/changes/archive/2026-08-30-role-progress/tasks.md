## 1. The rule both apps share

- [x] 1.1 `libs/domain/src/progress.ts`: `RoleState` (the two storable states),
      `ItemState` (those plus `not_started`), `isRoleState`, `agree` and
      `stateOf`. The JSDoc argues why `done` is unanimous and why absence is not
      a value. Exported from `index.ts`.
- [x] 1.2 `progress.test.ts`, eleven cases including the associativity sweep over
      all 27 triples — the property that lets a branch be folded from its
      children rather than from every role beneath it. **Negatives:** `agree`
      written to prefer `done`, and `stateOf` reading an empty collection as
      `done`.

## 2. The table, and the migration that adds it

- [x] 2.1 `roleProgress` in `schema.ts`: `(work_item_id, role_id)` primary key,
      `state` and `stated_at` `NOT NULL`, `work_item_id` cascading and `role_id`
      deliberately not, plus a `CHECK` naming the two storable states. The JSDoc
      says what absence means, what `done` makes true, and what the table is
      **not** — not a date, not a number the scheduler reads.
- [x] 2.2 `drizzle/20260818010000_add_role_progress/{migration,down}.sql`.
      **Stamp checked against all nineteen folders on disk first**, and against
      `duplicateMigrationStamps`. The down script drops the index with the table
      and says plainly what the rollback restores: the ambiguity, never a figure.
- [x] 2.3 `migrate.test.ts`, six cases: the table arrives empty, the `CHECK`
      refuses a fourth state, the outgoing release can still delete a work item,
      a role that has been said to be done cannot be deleted, a second row for
      one pair is refused, and the rollback takes the statements and leaves both
      figures. **Negatives:** the cascade struck from `work_item_id`, a cascade
      _added_ to `role_id`, and the `CHECK` widened — verify.md F1, F2, F3.
- [x] 2.4 The rollback ordering lists in `migrate.test.ts` and
      `migrate-down.test.ts` gain the new stamp, newest first, and
      `does nothing when the target is already the newest applied` now names it.

## 3. The store

- [x] 3.1 `RoleProgressRepository`, the same four methods as `ActualRepository`
      in the same order, each write bumping the work item's revision in its own
      transaction, and `moveAll` bumping **conditionally** for that class's
      measured reason.
- [x] 3.2 `RoleProgressStore`, `StoredProgress` and `ProgressKey` in
      `repository/index.ts`; `RoleUsageRows.progress` and `RoleRemoval.progress`;
      `SubtreeCopy.progress` and `.removedProgress`.
- [x] 3.3 `role-progress.test.ts`, ten cases against real SQLite, including the
      `CHECK`, the two-halves delete guard with a survivor for each half, role
      order, the cascade and the missing cascade.

## 4. The write path

- [x] 4.1 `WorkItemService.setProgress` and `.clearProgress`: `rolled_up` and
      `unknown_role` cloned from `setActual`, the clear idempotent and unrefused
      on a rolled-up row, and no history row at all for clearing what nobody
      said.
- [x] 4.2 Journalled as `progress` / `clear_progress` through `record`, with the
      first statement's inverse a `clear_progress` rather than a `set_progress`
      carrying a third value.
- [x] 4.3 `CompensatingCommand` grows `set_progress` and `clear_progress`;
      `DeleteSubtree.setProgress`, `RestoreSubtree.progress` and
      `.removedProgress`; `touchedBy` and `subjectOf` handle both.
- [x] 4.4 `apply` writes both kinds, re-checking the role and the leafness, and
      stamping `statedAt` **now** rather than carrying the original.
- [x] 4.5 The structural moves in `create`, `remove` (both branches) and
      `duplicate`, and the subtree write in `SubtreeRepository.insertSubtree`.
- [x] 4.6 `RoleRepository.usageOf` and `.remove` count and delete the statements
      inside the transaction that decides.
- [x] 4.7 `PUT`/`DELETE /work-items/:id/progress/:roleId`, `parseProgress`
      refusing `not_started` with the nonsense, and the OpenAPI description
      saying what `done` makes true. `openapi.json` regenerated.

## 5. The read path

- [x] 5.1 `rollUpProgress` — `foldByRole` with `agree` — over the candidate set
      `workedRolesOf` builds from the estimates, the actuals and the statements.
- [x] 5.2 `rollUpItemStates`, folded over the **children** rather than over the
      parent's own role map: design.md P6, and it exists because a red test
      found the alternative claiming a branch was finished over an untouched row.
- [x] 5.3 `tree()` carries `progress` (roles reading `not_started` omitted) and
      `state`. Handed to nothing that schedules.
- [x] 5.4 The two identity oracles lift both new keys and **assert** them —
      `{}` and `not_started` on all sixteen captured plans — rather than dropping
      them.

## 6. The record

- [x] 6.1 `proposal.md`, `design.md` (eight decisions), this file, and the spec
      delta under `specs/wbs-domain/`.
- [x] 6.2 `verify.md`: the stamp and its collision check, up and down through the
      real CLIs, the empty diff on `schedule.ts` as a checked claim, the gate
      with `bun 1.3.14` beside every count, the CI run, and the fault table.
