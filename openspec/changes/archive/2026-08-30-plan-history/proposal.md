## Why

Dany, 2026-08-13 (`notes/wbs-scope-2026-08-13-wave6.md` §R5): _"I need to be able
to save current state as a snapshot; so that later I can examine the history of
estimates changes"_. This change is the **second half of that sentence** and none
of the first.

The plan records nothing durable today. `command_journal` looks like a history
and is not one, in five ways: it is per (project, **account**), pruned to fifty,
its append deletes that account's redo branch, undo and redo write nothing to it,
and entries are re-stamped and discarded in place. Both facts were re-verified in
this tree before a line was written — `command-journal.ts:44-79`, `index.ts:853`.
So half of R5 exists as a _vocabulary_ — the command shape, the before-state, the
label sentence, the seam that writes them — and none of it as a _record_.

`notes/wbs-brief-2026-08-14-r5-r6-history.md` §6 splits R5/R6 into five changes.
This is **H1**, the keystone: everything after it is cheaper, and H2's actuals
must not ship first or the write seam gets built twice.

## What Changes

**One table.** `plan_event`, append-only, per project, one row per journalled
command: the kind, the sentence `record` already builds, the work item and role
it was aimed at, and the forward and compensating commands as `after` and
`before`. `work_item_id` carries no foreign key — a history that cannot outlive
its subject is not one.

**One extra `INSERT`, in a transaction that already exists.**
`CommandJournalStore.append` takes the event as a second argument, so a command
cannot become undoable without also becoming history. All fifteen journalled
kinds are recorded; a sixteenth is free.

**One read route.** `GET /api/projects/:id/history?workItemId=&kind=`, newest
first; `?kind=estimate,clear_estimate` is the estimate history in one request.

**Retention by age, never by count** — 365 days, on the existing `RetentionTimer`
tick. Pruning a history by count is deletion of the thing being asked for.

**A mechanical stamp check.** `readMigrationFolders` now refuses two folders
sharing one stamp, which on 2026-08-14 made `rollbackTo` reverse nothing and
report success.

## Non-goals

`actual_days` (H2), the four faces (H3), snapshots (H4), the reading surface
(H5). No WS event: nothing on screen is stale because an edit was recorded. **No
event for an undo** — see design.md D4, and the open question it leaves.
