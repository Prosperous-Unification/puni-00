## 1. The table, and the migration that adds it

- [x] 1.1 `actual` in `schema.ts`: `(work_item_id, role_id)` primary key, `days`
      and `recorded_at` `NOT NULL`, `work_item_id` cascading and `role_id`
      deliberately not. The JSDoc says what absence means and what the table is
      **not** — not a column on `estimate`, not a number the scheduler reads.
- [x] 1.2 `drizzle/20260817130000_add_actual/{migration,down}.sql`. **Stamp
      checked against all eighteen folders on disk first**, and against
      `duplicateMigrationStamps`, which H1 made mechanical. The down script drops
      the index with the table.
- [x] 1.3 `migrate.test.ts`, five cases: the table arrives empty (nobody has
      recorded a day), the outgoing release can still delete a work item, a role
      that still holds recorded days cannot be deleted, a second row for one pair
      is refused, and the rollback takes the actuals and leaves every estimate.
      **Negatives:** the cascade struck from `work_item_id`, and a cascade
      _added_ to `role_id` — verify.md F1 and F2.
- [x] 1.4 The rollback ordering lists in `migrate.test.ts` and
      `migrate-down.test.ts` gain the new stamp, newest first, and
      `does nothing when the target is already the newest applied` now names it.

## 2. The store

- [x] 2.1 `ActualRepository`, the same five methods as `EstimateRepository` in
      the same order, each write bumping the work item's revision in its own
      transaction.
- [x] 2.2 `moveAll` bumps **only when a row moved** — it runs on every create
      that gives a leaf its first child, and almost no plan has actuals.
      `changes()` inside the transaction, not a read-then-write.
      **Negative:** bumped unconditionally, watched — verify.md F3.
- [x] 2.3 `repository/actual.test.ts`, ten cases against real SQLite: the
      replace-and-restamp, both halves of the delete's key, the idempotent
      remove, a stored zero, role order, project isolation, the revision bumps,
      the conditional bump, the work-item cascade and the role's refusal.

## 3. The write path

- [x] 3.1 `WorkItemService.setActual` / `clearActual`, cloned from the estimate
      pair: `rolled_up`, `unknown_role`, `not_found`, `forbidden`, idempotent
      clear, and the clear of nothing recording nothing.
- [x] 3.2 Journalled through `record` as `actual` / `clear_actual` — so the plan's
      history and the undo stack both get it from the seam H1 built.
      `set_actual` / `clear_actual` added to `CompensatingCommand`, `COMMANDS`,
      `touchedBy`, `subjectOf` and `apply`.
- [x] 3.3 The inverse of a **first** recording is `clear_actual`, never
      `set_actual 0`. **Negative:** verify.md F5.
- [x] 3.4 `PUT` / `DELETE /work-items/:id/actuals/:roleId`, hand-parsed body,
      `invalid_actual` for anything not a finite number at or above zero, and the
      OpenAPI document regenerated.

## 4. The roll-up and the payload

- [x] 4.1 `foldByRole` in `roll-up.ts` — one recursion, generic over the figure —
      with `rollUp` and `rollUpActuals` as its two callers.
- [x] 4.2 `actuals` on every work item in `tree()`: its own if a leaf, the sum of
      its descendants' otherwise, and a role nobody recorded **absent**.
- [x] 4.3 The two identity oracles lift the new key and **assert it empty**
      rather than dropping it — the shape `team-sets` established for a payload
      that gained a field. **Negative:** verify.md F6.

## 5. The structure

- [x] 5.1 Hand-down on a first child, hand-up on a last child's deletion, restore
      with a branch, **no copy** into a duplicate.
- [x] 5.2 `setActuals`, `actuals` and `removedActuals` on the subtree commands,
      and `SubtreeCopy` written and unwound in `SubtreeRepository`'s one
      transaction. **Negatives:** verify.md F7 and F8.
- [x] 5.3 `RoleRepository.remove` counts actuals, refuses an unconfirmed removal
      that would take one, and deletes them explicitly.
      **Negative:** verify.md F9.

## 6. The record

- [x] 6.1 `proposal.md`, `design.md` (seven decisions), this file, and the spec
      delta.
- [x] 6.2 `verify.md`: the stamp and its collision check, up and down through the
      real CLIs, the full gate with the bun version, the fault table, and the
      empty diff on `service/schedule.ts` as a claim that was checked.
