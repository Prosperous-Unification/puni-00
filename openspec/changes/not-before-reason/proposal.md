## Why

Dany asked for a `blocked` state, and then decided against it — _"Yeah let's not
do blocked"_, 2026-08-18. The argument is recorded in the workspace's
`notes/decisions.md` and it is worth restating, because it is the argument that
shapes this change rather than a reason this change has to work around.

`blocked` is **orthogonal** to the three completion states `role-progress` (#80)
shipped, not a fourth sibling: a role can be in progress _and_ blocked. The
engine already models being held back four ways — a dependency anchor, an
assignee's queue, a team's pool, and a not-before floor — and the chart already
names which of them binds each bar, so a manual `blocked` would be a second
vocabulary for one picture. It only moves a date if it carries an until-date, and
**blocked-with-a-date is `startNoEarlierThan`, which has existed since
2026-08-06**. And nothing clears it: work does not un-block itself in a database,
so the flag goes stale and a plan reads _stopped_ about something that shipped
last week.

What survives all of that is the half nobody could say: **the date carries the
when, and nothing carries the why.** A row held until the 12th is a bar with a
caret on it and a sentence saying it is held, and no way at all to write down
_waiting on client sign-off_. That is what this change adds, and it is the whole
of what it adds.

## What Changes

**One nullable column.** `work_item.start_no_earlier_than_reason`, beside the
date it explains. No state, no flag, no propagation rule, no second thing that
holds a row back — the date is the whole of the constraint and this is the whole
of the explanation.

**Meaningless without a date, and refused without one.** The pair may be neither,
the date alone, or both. Words with no floor to be words about appear on no
surface (the chart says them only where the not-before is the **binding** floor)
and nothing clears them — which is the `blocked`-with-no-date shape this change
exists instead of. `isOrphanedNotBeforeReason` in `@wbs/domain` is the rule and
`WorkItemStore.patch` refuses it inside the transaction that would write it, as
`not_before_reason_needs_a_date`, 400. So **clearing the date means clearing the
words in the same request** — refused rather than cascaded, because a write that
silently deletes somebody's sentence is the worse of the two answers.

**Deliberately not a `CHECK`.** The obvious enforcement is a table constraint,
and it is what `role_progress_state` did one migration ago. It is refused here
because `work_item` is a table the **outgoing release writes**: `UPDATE work_item
SET start_no_earlier_than = NULL` is a statement blue runs today, and against a
row green has explained it would fail a constraint blue cannot see and answer 500
for the length of a swap window. The migration argues it and a watched red holds
it.

**Bounded at 200 characters**, checked at the controller — the width of a
sentence a hover card and a CSV cell can carry. `LONGEST_BAND_LABEL`'s shape one
module over. A blank is stored as `null`, trimmed, so there is one spelling of
"nobody has said".

**Two surfaces, both where the date's effect is already explained.** The bar's
floor sentence when the not-before is the **binding** floor — _"Held by its
start-no-earlier-than date — waiting on client sign-off"_, in
`capacityFloorWords`' and `personFloorWords`' voice rather than a third register
— and the row's Not before cell. It survives export as a column of its own,
`Not before because`, beside the date and escaped exactly as `Notes` is.

**Undoable for free.** The patch journal already carries the field: `fieldsOf`
and `revertTo` name it, and an inverse names **both** halves of any pair the
forward patch named, which is what keeps every undo legal against the rule above.

## Non-goals

**No date moves.** `service/schedule.ts` has an **empty diff**, checked and
quoted in verify.md, and the behavioural half is a watched red — the engine wired
to read the reason, every downstream date moving, reverted. This is words about a
floor the engine already had.

**No status, no flag, and nothing that reads as blocked-with-no-date.** Dany
rejected that twice. There is no field whose value means "held" — the date means
that, as it always has — and the words cannot exist without it.

**No propagation.** A reason does not reach a child, a successor, or a parent's
roll-up. It is a fact about one row's own floor and it stays on that row.

**No new refusal on any request that exists today.** Every plan on the server has
a null reason, so no client's current patch can meet the pair rule; the check is
asked only where a patch names one of the two fields.

## Owed, in a file this change did not own

`wbs-table.tsx` was another agent's while this was written, and it is where the
tree read becomes both a chart row and an export row. **Three edits are owed
there**, and until they land the column is stored, served, exported blank and
drawn on no bar:

1. `ganttPlan`'s row literal: `notBeforeReason: row.original.startNoEarlierThanReason`.
2. `planForExport`'s row literal: `startNoEarlierThanReason: row.original.startNoEarlierThanReason`.
3. The Not before cell: show the reason, let somebody type one, and send
   `{ startNoEarlierThan: null, startNoEarlierThanReason: null }` when the date is
   cleared — a bare `{ startNoEarlierThan: null }` on an explained row is now a 400.

The two row fields are optional on `GanttRow` and `ExportRow` for exactly this
reason: a missing line should be a feature nobody can see, not a build nobody can
run.
