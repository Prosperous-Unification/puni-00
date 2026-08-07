# An estimate can be taken back off

## Why

Two independent reviewers called the same thing a data-correction defect: a
trio, once stored against a work item for a role, can be overwritten forever
but never removed. There is no `DELETE`, no `EstimateStore.remove`, and no
gesture in the table that reaches one.

That is not a missing convenience. It is a plan that cannot be corrected. A
role estimated onto the wrong row, a QA figure typed against work QA does not
touch, a leaf re-scoped so its Dev estimate is now somebody else's — every one
of those rolls up into its parents, into `finalTotal`, and into the schedule's
durations and the dates printed beside them. The only escape today is to
overwrite the trio with `0 / 0 / 0`, which is a different claim: zero days of
Dev work is an estimate, and it keeps the role present in every roll-up above
it. "No estimate" and "an estimate of nothing" are opposite states, and the
tool currently offers only the second.

The table already knows how to say it. `sendableTrio` returns null for an
all-empty trio, and `trioProblem` deliberately says nothing about one — a row
nobody has estimated is ordinary and must not glow red. So emptying all three
boxes is already a legal, quiet, complete gesture that means exactly one thing
and currently does nothing at all.

## What Changes

**be-01 can be told to forget a trio**

- `DELETE /api/work-items/:id/estimates/:roleId`, guarded exactly as the `PUT`
  beside it is, and announcing exactly as the `PUT` does so peers refresh.
- Idempotent: clearing an estimate that is not stored is a 200. The estimate is
  what the request addresses, and its absence is the outcome asked for. A
  missing **work item** stays a 404 — a different absence, and the one
  `removeDependency` already reports.
- `EstimateStore.remove(workItemId, roleId)`, keyed on both halves of the
  composite primary key, and `WorkItemService.clearEstimate` shaped like
  `setEstimate`. Roll-ups need no new work: a parent's figures are summed on
  read, never stored.

**Emptying all three boxes clears the trio**

- `ProjectApi.clearEstimate(id, roleId)`, and one new branch in
  `commitEstimate`: when every box of the trio now reads empty **and** be-01
  holds a trio for that row and role, clear it and drop the drafts on success.
- Emptying one or two boxes is unchanged — still a half-filled trio, still
  marked invalid, still nothing sent.

## Non-Goals

- **No weakening of "never auto-edit, never send a partial trio".** Two empty
  boxes do not mean "delete it". Guessing that would be the same class of
  assumption as repairing a trio nobody finished, which is what this table was
  rewritten to stop doing.
- **No delete button.** The gesture is emptying the boxes. A button would be a
  second way to say it, and the two would eventually disagree about what an
  empty box means.
- **No undo.** Re-typing the three numbers is the undo, and a plan under live
  edit has no single history to step back through.
- **No clearing a rolled-up row.** A parent holds no stored estimate to clear,
  and its cells are already read-only.
- **No bulk clear.** Not a whole row's roles at once, not a whole role's
  column. Nobody has asked, and each is a different confirmation question.
