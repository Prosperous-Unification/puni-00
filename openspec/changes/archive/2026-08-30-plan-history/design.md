# design — `plan-history`

Seven decisions. Each names what it refuses, because in every case the refused
option is the one that looks cheaper from outside.

## D1. The history is a second table, not a widened `command_journal`

The journal already holds a kind, a label, a forward command, a compensating
command carrying the before-state, and a timestamp — everything a history row
needs. Widening it (dropping the prune, dropping the redo-branch delete, keying
per project) would give one table and no new writes.

**Refused, because those five properties are the undo stack's contract, not its
accidents.** The prune is what stops the table growing without bound per account;
the redo-branch delete is what stops a redo re-applying a command computed
against a plan that has moved on; the per-account key is what stops one person's
undo reversing another's edit (`schema.ts:577-581`). Every one of them would have
to go for the journal to be a history, and each removal breaks undo in a way a
user feels.

**Consequence, stated:** two tables hold overlapping data, and a reader must be
told which is which. That is what the JSDoc on `plan_event` is for, and it is why
this change adds one to `command_journal` too.

## D2. The insert lives inside the journal's transaction, as a second argument

`record` is called **after** the mutation and after the broadcast, deliberately
(`work-item.service.ts`'s own note: a journal write that throws fails the request
for a change that already happened, and the alternative is a project full of
readers on a tree that has moved). Adding a second `await` there widens that
window: the journal could commit and the history could fail, leaving a plan with
an undo key for a change absent from its record.

So `CommandJournalStore.append(entry, event)` takes both and writes both in the
one transaction it already opens. The alternatives, both refused:

- **A `PlanEventStore.append` called from `record`.** Reads well, and is exactly
  the failure above. Store methods are async, so a transaction cannot be handed
  across one.
- **A third store owning both tables.** One class, two names, and every existing
  caller of `journal.append` rewritten for a change that adds one statement.

`PlanEventRepository` therefore has **no `append` at all**, so a second write path
cannot be added by accident by whoever writes H2.

## D3. `work_item_id` and `role_id` carry no foreign key

Three options, and only one of them is a history:

|                  | on delete                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| cascade          | the estimate history of a row vanishes the moment somebody deletes the row — precisely when they would ask for it |
| restrict         | deleting a work item starts failing once anybody has edited it                                                    |
| **no reference** | the event outlives its subject and still names it                                                                 |

The same argument `work_item.frozen_number` already makes for a number that has
left the tool, and the same one the brief makes for `plan_snapshot_figure`'s
denormalised names (§5). The label is stored rather than re-derived for this
reason too: `estimate “Strip the roof”` still reads after the row is gone.

`project_id` and `user_id` **do** cascade, and that is not a tidiness decision —
it is the blue/green swap window. Two be-01 processes share one SQLite file while
green migrates; the outgoing release knows nothing about this table and its plain
`DELETE FROM project` would hit a constraint it cannot see and answer 500. The
argument `dependency` and `project_priority_band` both make.

## D4. Undo and redo record nothing, and that is a hole this change leaves open

Undo and redo flip `command_journal.undone` in place and append nothing — by
design, because an undo that was itself journalled would be undoable and the key
would toggle one change forever. The history is written from `record`, which they
do not call. So:

> An estimate set to 8 and then undone leaves one event reading "set to 8", and
> no event saying it was taken back. The plan reads 5.

Every event is **true about its own moment**; the _sequence_ is incomplete. That
is a real limitation, it is asserted as a test rather than only written here
(`service/undo.test.ts`, `records the command, and records nothing at all for
undoing it`), and it is the one thing a reader of the history will be surprised
by.

**Not closed here, deliberately.** Closing it means writing from the undo path as
well — a second write site, in a method whose atomic unit today is a single
`UPDATE`, so `flip` would have to grow the same second-argument shape `append`
just grew. That is perhaps thirty lines. What it is _not_ is obvious: an undo is
arguably a command in its own right (kind `undo`, before and after swapped), or
arguably a correction that should retract the event it reverses. Those are
different histories and H5 — the reading surface — is what makes the difference
visible. **Open question for Dany, in verify.md §Open.**

## D5. Retention by age, never by count

The event log is pruned by count because it is a resume buffer: a client away
long enough is refused, which is a modelled answer. A history pruned by count
would evict this morning's estimate changes over this afternoon's — the exact
property that disqualifies `command_journal` (D1). So: 365 days, a constant, on
the sweep that already runs every ten minutes.

`RetentionTimer` therefore gains the store and the window as **required**
options, not optional ones. `runRetention` sat with no production caller at all
for a whole change once; an optional store here would be the same failure one
layer up, and a table growing forever in the file the domain lives in looks
exactly like a healthy one from outside.

The brief (§7 risk 1) adds the sentence the UI owes the user when H5 exists:
snapshots are the permanent record, the log is the recent one.

## D6. A read route of its own, not a field on the plan's payload

The capacities and the priority ladder ride in `GET /work-items` because they are
read _with_ the dates computed from them, and a second request would be a second
moment (`WorkItemService.tree`'s own argument). Neither applies here: nothing on
screen is stale because an edit was recorded, and a plan edited all week would put
a thousand rows nobody asked for into every tree read.

`?kind=` takes a comma-separated list so "the history of estimate changes" is one
request rather than two answers a client merges and re-sorts. An unrecognised
kind answers nothing rather than 400 — the column is a string precisely so H2's
`actual` needs no migration, so there is no closed set to check a name against.
A `?kind=` naming nothing is **no filter**, not a filter nothing satisfies: a
client that built its query string from an empty box must not be told the plan
has no history.

## D7. `before` and `after`, not `forward` and `inverse`

The columns hold the two commands `record` already builds. For the estimate kinds
that pair genuinely is the before and after of the figure, which is R5's question,
and `before`/`after` is what a reader of a history wants to see. For a structural
command — a create, whose `before` is `delete_subtree` — the names are looser: it
is the compensating command, which is the only before-state that exists.

Named for the question rather than for the mechanism, and the JSDoc on the table
states the mechanism exactly. Both columns are `NOT NULL` (the brief has them
nullable): every row comes from `record`, which always holds both, so a nullable
column would be a state nothing can write.

## Not decided here

- What a history looks like on screen (H5), and whether an event's `before`/`after`
  are turned into a sentence there or by a later route.
- Whether the retention window is configurable. It is a constant now; a knob
  nobody sets is a knob nobody keeps correct.
