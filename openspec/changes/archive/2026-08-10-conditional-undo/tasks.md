## 1. The table

- [x] 1.1 `20260807180000_add_command_journal`: `command_journal` with its
      unique `(project_id, user_id, seq)` index, plus the `down.sql` that drops
      both and says what is lost. Additive — a new table, so blue and green
      share the file safely.
- [x] 1.2 The migration lists in `repository/migrate.test.ts` and
      `migrate-down.test.ts`. **Watched failing first:** with the folder on
      disk and the lists unchanged, six tests across the two files failed on
      the order and on `rollbackTo` finding one migration more than the list
      named — the same real failure the revisions migration produced.
- [x] 1.3 `commandJournal` on `schema.ts` with the rule in JSDoc: what each
      JSON column holds, why the stack is per account, why `seq` is SQL.

## 2. The store

- [x] 2.1 `JournalEntry`, `NewJournalEntry`, `UndoState`, `JOURNAL_DEPTH` and
      `CommandJournalStore` in `repository/index.ts`;
      `CommandJournalRepository` in `repository/command-journal.ts`.
      `append` clears the account's redo branch, inserts with a `seq` SQLite
      chooses inside the statement, and prunes past 50 — one transaction.
      **Test** (`service/undo.test.ts`, against real SQLite): 56 commands leave
      50 entries with the oldest gone; two accounts number their stacks
      separately.
- [x] 2.2 `inMemoryCommandJournal` fixture, keeping every rule its callers
      depend on and stating on the symbol the one it cannot have — a `seq` the
      database chose.

## 3. The vocabulary

- [x] 3.1 `service/compensating.ts`: `CompensatingCommand` with both subtree
      shapes, `Preconditions` holding `expected` **and** `from`, and the
      `readCommand`/`readPayload`/`readPreconditions` readers that throw on a
      command this release has no branch for. `touchedBy` and `quoteName`.
- [x] 3.2 `SubtreeCopy` gains `reparented` and `removedEstimates`, so a restore
      of a promoted deletion — the row back, its children back beneath it, and
      the estimates the deletion handed up taken off again — is one write.
      Existing `insertSubtree` callers updated; the duplication passes empty.

## 4. Recording, inside the mutations

- [x] 4.1 Every reversible mutation in `work-item.service.ts` records after it
      has applied and announced: patch, assign, move, create, duplicate,
      remove (both strategies), setEstimate, clearEstimate, addDependency,
      removeDependency, freeze, unfreeze, unfreezeProject.
      Each captures its before-state from the row list its own guard produced.
      **Tests:** the thirteen restore cases in `service/undo.test.ts`.
- [x] 4.2 The commands that changed nothing record nothing: an empty patch, a
      clear of an estimate that was not there, a removal of an edge that was
      not there, a freeze that pinned nothing.
      **Test:** `records nothing for a clear that had nothing to clear`.
- [x] 4.3 The preconditions are the revisions the mutation **left**, not the
      ones it found. **Negative test:** `expected` set to the before-revisions
      — 26 tests across the service and controller batteries failed. Watched.

## 5. Undo, redo, and the refusals

- [x] 5.1 `WorkItemService.undo`/`redo`/`undoState`, one `walkStack` for both
      directions, and `apply` dispatching every compensating command through
      the ordinary stores. A refusal discards the entry.
      **Tests:** eleven `stale_undo` cases, one per kind, each asserting the
      plan was left alone; `nothing_to_undo` on an empty stack.
      **Negative test:** the precondition check replaced by `null` — 11 tests
      failed across the two batteries. Watched.
- [x] 5.2 `rebase`, which carries the entries below past the write the undo
      just made, and only where the neighbour expects exactly the revision the
      applied command started from.
      **Tests:** `walks back through an account's own consecutive edits`,
      and `stops at the point somebody else wrote`.
      **Negative tests:** `rebase` removed — the first failed; the equality
      condition removed — the second failed. Both watched.
- [x] 5.3 The two guards a revision cannot give: `expectedSubtree` on
      `delete_subtree`, and the sibling-membership check before a placement.
      **Tests:** `refuses to undo a create once a second child sits under it`,
      which asserts the parent's revision has **not** moved — so the subtree
      guard is the only thing that can catch it — and
      `refuses a move whose old neighbour has been deleted`.
- [x] 5.4 `restore_subtree` writes original ids and refuses a collision.
      **Negative tests:** the collision check removed — the test failed with a
      `UNIQUE constraint` error out of the transaction rather than a refusal;
      the root given a fresh id instead — four tests failed, three of them on
      foreign keys. Both watched.
- [x] 5.5 The external dependencies, restored best-effort and reported.
      **Test:** `restores the branch without an edge whose other end has gone`.
- [x] 5.6 Redo: conditional the same way, walking up in the order the undoing
      happened, and cleared by any forward change.
      **Negative test:** the redo-branch delete removed from `append` —
      `loses the redo branch the moment the account edits forward again`
      failed. Watched.

## 6. The routes

- [x] 6.1 `POST /api/projects/:id/undo` and `/redo`, one `answerUndo` for both
      so the two cannot answer differently; `undoable`/`redoable` added to the
      tree read from a separate service call, leaving `tree` account-free.
      **Tests** (`controller/undo.controller.test.ts`, over real SQLite because
      the in-memory stores model no revisions): 401, 404, 403, 409 for each
      refusal with its shape, the success body, and the two tree-read cases.

## 7. fe-01

- [x] 7.1 `undoChord` in `keyboard-bindings.ts` — Ctrl or Meta with Z, Shift
      for redo, never inside an editable element.
      **Tests** (`keyboard-cheat-sheet.test.tsx`): the chord, the editable
      refusal, and the keystrokes it leaves alone.
      **Negative test:** the `isTypingInto` guard removed —
      `leaves ctrl-z alone inside a name cell` failed. Watched.
- [x] 7.2 `UndoResult` on `ProjectApi`, with be-01's two refusals as modeled
      answers rather than thrown codes — the `detail` is the whole value of a
      `stale_undo` and `send` would throw it away.
- [x] 7.3 The table: a window listener, `stepStack`, an info toast on success
      carrying any partial-restore detail, an error toast on each refusal, and
      a reread after both. Undo/Redo buttons disabled from the tree read.
      **Tests** (`wbs-table.test.tsx`): eight, including the partial restore
      and the empty stack.
      **Negative test:** the buttons' `stack` condition dropped —
      `greys the buttons out until be-01 says there is something in that half`
      failed. Watched.
- [x] 7.4 Two registry entries and their `PROVEN_BY` mapping.
      **Watched failing first:** the entries added with nothing mapped to them
      — the cross-check failed naming both.

## 8. Gate

- [x] 8.1 `format:check --all`, the run-many gate uncached, `openspec validate
--all --json`, recorded in `verify.md` with the fault table.
