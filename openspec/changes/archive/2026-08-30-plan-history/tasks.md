## 1. The table, and the migration that adds it

- [x] 1.1 `plan_event` in `schema.ts`: per project, `work_item_id` and `role_id`
      without foreign keys, `project_id` and `user_id` cascading, two indexes.
      The JSDoc says what it is **and what it is not** — neither `event_log` nor
      `command_journal`.
- [x] 1.2 `drizzle/20260817120000_add_plan_event/{migration,down}.sql`. **Stamp
      chosen against every folder on disk first** — three days past the newest —
      and the down script drops both indexes with the table.
- [x] 1.3 `migrate.test.ts`, five cases: the table arrives empty (a history
      begins when it begins), the outgoing release can still delete a project,
      the outgoing release can still delete an account, an event survives the
      deletion of its work item, and the rollback takes the history and leaves
      the plan — including `command_journal`, so nobody loses an undo key.
      **Negatives:** each cascade struck in turn, and a cascading foreign key
      _added_ to `work_item_id`. All three watched — verify.md F1–F3, and F2's
      first version was vacuous.
- [x] 1.4 The rollback ordering lists in `migrate.test.ts` and
      `migrate-down.test.ts` gain the new stamp, newest first.

## 2. The stamp collision, made mechanical

- [x] 2.1 `duplicateMigrationStamps` in `migrate-down.ts`, called from
      `readMigrationFolders`, refusing two folders that share one stamp and one
      whose prefix is not a number.
- [x] 2.2 **Negative:** a fixture directory holding `20260814100000_first` and
      `20260814100000_second` — the literal 2026-08-14 collision — asserted to
      throw from both `readMigrationFolders` and `rollbackTo`, watched failing
      with the check removed (verify.md F4). Plus the pure function's own cases,
      including the non-numeric prefix.

## 3. The write, in the transaction that already exists

- [x] 3.1 `CommandJournalStore.append(entry, event)`; the `plan_event` insert
      added to `CommandJournalRepository.append`'s transaction, after the prune
      and deliberately outside it.
- [x] 3.2 `repository/command-journal.test.ts`, new file, against real SQLite:
      both rows written together; **neither** written when the history row is
      refused; the history keeps a command the fifty-deep stack has evicted; the
      history keeps a command whose redo branch was deleted; one project's
      history holds both accounts' commands.
      **Negatives:** the insert moved out of the transaction, and the prune
      widened to reach `plan_event`. Both watched — F5, F6.
- [x] 3.3 `inMemoryCommandJournal` records the events in a list the depth rule
      cannot reach, so a service test can see an evicted entry's event.

## 4. The seam

- [x] 4.1 `subjectOf` in `compensating.ts`: which row and role a command was
      aimed at — the successor for a dependency, the root for a subtree, nothing
      at all for a freeze. Deliberately not `touchedBy`.
- [x] 4.2 `WorkItemService.record` passes the event: same instant as the journal
      entry, id of its own, `before` from the inverse and `after` from the
      forward.
- [x] 4.3 `service/plan-history.test.ts`, seven cases: the trio that was
      replaced, the row and role named, the clear that records nothing when
      there was nothing to clear, every journalled kind, the dependency's
      successor and the freeze's absent row, one instant, two ids.
      **Negative:** the event dropped on the way in, watched taking five of the
      seven red (F7).
- [x] 4.4 `service/undo.test.ts` gains the gap, asserted: an undo records
      nothing, and the event of a command whose journal entry a later write threw
      away is still there. design.md D4.

## 5. The read

- [x] 5.1 `PlanEventRepository` — `listFor` and `pruneOlderThan`, and **no
      `append`**, so H2 cannot add a second write path by accident.
- [x] 5.2 `repository/plan-event.test.ts`, seven cases against real SQLite:
      one project's events newest first, the tie broken by id, the work-item
      filter excluding plan-wide events, the kind list and the list that names
      nothing, the commands parsed, malformed JSON throwing, and the prune's
      exclusive boundary. **Negatives:** the tie-break struck (its first version
      could not see it — verify.md F8), and the empty-list arm replaced by a bare
      `inArray` (F9).
- [x] 5.3 `HistoryService` — the project read first, so an absent project is
      `not_found` and not an empty history. No write method at all.
- [x] 5.4 `GET /api/projects/:id/history` with `?workItemId=` and `?kind=`
      declared as a query schema, so the committed OpenAPI document carries them.
- [x] 5.5 `controller/history.controller.test.ts`, six cases.
      **Negatives:** the comma split removed, the blank-segment filter removed,
      and the project check removed. All three watched — F10, F11, F12.

## 6. Retention

- [x] 6.1 `PLAN_EVENT_RETENTION_DAYS = 365` and `runPlanEventRetention`, a
      function of its own rather than a mode of `runRetention`.
- [x] 6.2 `RetentionTimer` sweeps both on one tick and reports `Swept`;
      `planEvents` and `planEventRetentionDays` are **required** options.
      Wired in `services.ts` against the same store the route reads.
- [x] 6.3 Three cases: both tables swept on one tick, the 365-day boundary
      exactly (an event a day short stays), and a failed history sweep leaving
      the schedule running. **Negative:** the history sweep deleted (F13).

## 7. The record

- [x] 7.1 `proposal.md`, `design.md` (seven decisions), this file, the spec
      delta, and `verify.md` with the R5 fault table and the CLI transcripts.
- [x] 7.2 `CONTEXT.md` gains **Plan event** and **Plan history**.
- [x] 7.3 The OpenAPI document regenerated and committed.
