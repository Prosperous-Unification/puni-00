# Estimates are never edited for you, and the project chooses its final figure

## Why

Dany, 2026-08-06, two asks in one breath: "estimate fields be smaller — they
hold numbers", "when inputing estimates they must not autoedit; when they
don't match the lte/gte rules the not matching cells must be highlighted with
error, never edit estimates", and "allow to configure how the final estimate is
calculated: PERT, optimistic, realistic, pessimistic… show the final days
estimate near the opt/rel/pess trio + the final one of QA + Dev".

Today typing `5` into an empty row's optimistic box sends `5 / 5 / 5`. That was
deliberate — be-01 refuses an unordered trio, so without it a row could never be
given its first estimate — but the cure is worse than the disease: two of those
three numbers are the tool's, they read as the estimator's, and the plan is then
built on them.

And the three points are collected only to be averaged one way. A team quoting
a possibility plans on optimistic; a team committing a date plans on
pessimistic. Neither can say so.

## What Changes

**Nothing is repaired, and what cannot be saved says so**

- From: one typed box became three sent numbers, silently reordered.
- To: what is typed stays typed. A trio is sent only once all three read as
  days and `optimistic ≤ realistic ≤ pessimistic`. Until then the boxes that
  are wrong carry `aria-invalid`, a red field and a title saying why — both
  members of a pair that breaks the order (which single box is wrong in
  `5 / 3 / 10` is not answerable), or the empty ones of a half-filled trio,
  since be-01 stores a trio or nothing and an unsaved estimate that looks
  saved is worse than a visible complaint.
- A typed-but-unsent box is a **draft** held by the table, not by the input, so
  a peer's edit refreshing the tree does not swallow it. A row holding a draft
  also refuses the empty-row Backspace, for the same reason.
- Estimate boxes are `4.5em` wide. They hold a number of days.

**The project chooses how its three points become one**

- New `project.estimate_method`, one of `pert` (the default, and what every
  existing project already did), `optimistic`, `realistic`, `pessimistic`.
  Additive, defaulted; patched through the existing `PATCH /api/projects/:id`,
  which already gates writes.
- The tree read carries the project's method, each row's final figure per role,
  and their sum. Both come from one `finalDays` in `libs/domain` — **the same
  call the schedule's durations come from**. The dates and the figure printed
  beside them cannot disagree.
- The table gains a `<role> days` column after each trio, a `Total days`
  column after them all, and a "Plan with" selector in the toolbar.

## Non-Goals

- **No per-reader method.** It is a project setting: two people reading
  different dates off one plan is not a preference, it is a bug.
- **No auto-correcting anything else.** Not names, not notes.
- **No new estimate storage.** The trio is still what be-01 holds; the method
  is applied on read.
- **No per-role method.** Dev on PERT and QA on pessimistic is a distinction
  nobody asked for, and it would make "Total days" two different questions.
