# design — `actual-days`

Seven decisions. Each names what it refuses, because in every case the refused
option is the one that reads as obvious from outside.

## D1. Its own table, not a fourth column on `estimate`

One row already exists per (work item, role). A `days` column beside the trio
would be no migration risk, no second store, no second read in `tree`.

**Refused for two reasons, and the first is fatal on its own.** `estimate`'s
three columns are `NOT NULL` (`schema.ts:359-361`), so recording a real actual
against work nobody estimated would mean inventing a trio — a guess the tool
made up, indistinguishable afterwards from one a person typed. And the two facts
are written by different people at different times: an estimate before the work,
an actual after it. One row holding both makes each write a read-modify-write of
the other's numbers, and the loser of two concurrent writes loses somebody's
figure rather than their own.

**Consequence, stated:** two tables with the same key and the same structural
rules, which is a drift risk. It is answered by shape rather than by care —
`ActualStore` has the same five methods as `EstimateStore` in the same order, and
the roll-up is one generic fold both call.

## D2. Per role, not per work item

An actual per item is one number a person types once, and it is what a status
report asks for.

**Refused: it is a second spelling of a total that must then agree with the
per-role estimates, and would not.** Every read path in the tool groups by
(item, role) — the estimate's key, the slice key (`work-item.service.ts:141`),
the export's per-role column group, the roll-up. A per-item actual sitting beside
per-role estimates cannot answer "who overran, Dev or QA?", which is the question
this feature exists for; and the moment somebody asks it, the fix is this table
with the old column left behind disagreeing with it.

## D3. Reporting only. The scheduler does not read this

Feeding actuals into the plan means the engine reads one instead of a final at
`work-item.service.ts:141`. To do that safely it must distinguish:

- "took 8 days, **finished**" → the successors' floor is real and should move;
- "8 days logged **so far**" → the remaining work is unknown, and substituting 8
  for the 5-day estimate asserts the work is over.

**Nothing in the schema tells those apart.** `grep -in "status|done|completed|
progress|percent"` over `repository/schema.ts` and `libs/domain/src/*.ts` returns
nothing, and that was re-checked in this tree before a line was written. Adding a
completion state is its own change — started and finished dates, who closes an
item, what a partly-done parent reports — and it drags the Gantt, the critical
path and the capacity leveller with it.

Second argument, cheaper and just as real: `service/live-plan-identity.test.ts`
and the capacity oracle exist to prove no shipped change moved a real plan's
dates. Reporting-only keeps them green **by construction**, and this change adds
the same claim as an assertion of its own (`service/actual.test.ts`, _moves no
date_) rather than resting on it.

**What is lost, plainly:** the plan does not self-correct. An item that overran
by three days leaves its successors on the old dates until a person re-estimates.
The tool reports the drift; it does not act on it. The mitigation is H3's — the
variance per row and one line in the project header — and it is not optional
there, because a number nobody acts on is a feature nobody uses.

## D4. Absence is the absence of a row; zero is a statement

`days` is `NOT NULL` and there is no "unstated" value. Clearing deletes the row.

Refused: a nullable `days`, which would give two spellings of "nobody has said" —
no row, and a row holding null — and every reader would have to handle both. The
rule is `project_team_capacity`'s (`schema.ts:405-411`) and the export's, which
has said since it was written that an empty cell means nobody typed it, never
zero.

The corollary is the one that needs saying out loud: **0 is accepted and stored.**
"This took no days" is a sentence somebody can mean — work that turned out
unnecessary, a role that was not needed after all — and refusing it would push
that person into leaving the cell blank, which says something else. The undo of a
first recording is therefore `clear_actual` and not `set_actual 0`.

## D5. A duplicate copies estimates and not actuals

`SubtreeCopy` carries both, and for a duplication the actuals are empty.

An estimate describes work; a copy of the work has the same description. An
actual records a week that happened; the copy's week has not. Copying them would
tell the plan a fortnight nobody has worked was already spent, and the copy would
appear with a variance the moment H3 draws one.

**Refused alternative: copy both for symmetry.** Symmetry between two facts that
mean different things is how a plan comes to assert something nobody said.

## D6. Actuals follow the structure, or they are lost silently

The three structural moves and what each owes:

| move                             | estimates                     | actuals                                            |
| -------------------------------- | ----------------------------- | -------------------------------------------------- |
| leaf gains its first child       | handed **down** to the child  | the same, or the row is invisible — see below      |
| parent loses its last child      | handed **up** from the totals | the same, or the days are gone with the cascade    |
| branch deleted, then undone      | restored with the branch      | restored with the branch                            |
| branch duplicated                | copied                        | **not** copied — D5                                 |

The hand-down is not tidiness. A parent's figures are the sum of its
descendants', so a row left on a work item that has just gained a child is
stored, unreadable by every face, and back on screen the day the child is
deleted. The hand-up is sharper still: `actual.work_item_id` cascades, so without
it the branch's recorded days are simply gone the moment its last child goes —
while the estimates beside them survive on the parent, which is the drift this
whole change is written not to have.

**Consequence:** `CompensatingCommand` grows `set_actual`, `clear_actual`, and
three fields on the subtree commands (`setActuals`, `actuals`, `removedActuals`).
That is the cost of the two moves above being correct, and it is why they are
in H2 rather than deferred: every one of them is a silent loss, and silent is the
class this repo has been bitten by.

## D7. `role_id` does not cascade; `work_item_id` does

Copied deliberately from `estimate`, and the asymmetry is argued on `role` in
`schema.ts:274-281`.

**`role_id`, no cascade.** An actual is somebody's typing about work that has
already happened, so a role removal must *count* it before taking it. The missing
cascade is what makes a role delete that forgot to say so fail loudly instead of
quietly emptying the plan. `RoleRepository.remove` deletes actuals explicitly
inside its transaction, and `RoleUsageRows` gains an `actuals` count so an
unconfirmed removal of a role holding **only** actuals is refused — the case that
makes the count load-bearing rather than decorative.

**`work_item_id`, cascade.** Blue and green share one SQLite file while green
migrates; the outgoing release knows nothing about this table and its plain
`DELETE FROM work_item` must not hit a constraint it cannot see. The same
argument `dependency` makes (`schema.ts:542-546`).

## What this change does not decide

- **Whether an undo should be recorded in the history.** H1 left that open and
  nothing here closes it: `actual` and `clear_actual` are recorded the same way
  every other kind is, and an undo of one appends nothing, exactly as an undo of
  an estimate appends nothing.
- **What a face does with a variance.** `actual − final` is derived, never
  stored, and blank when either side is absent. H3.
- **Whether a snapshot freezes the actual.** It does, and the column is already
  in the brief's `plan_snapshot_figure` (§5). H4.
