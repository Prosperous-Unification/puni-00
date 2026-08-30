## Why

Dany, 2026-08-13 (`notes/wbs-scope-2026-08-13-wave6.md` §R6): _"I want to be able
to track fact days near the estimate of completion"_.

The plan holds guesses and nothing else. Every figure in it — the trio, the
final, the roll-up, the bar — describes what somebody expected before the work
happened, and there is nowhere to put what it actually took. So the plan cannot
be checked against reality, and the question the tool exists to answer next
("did we estimate this well?") has no data behind it.

`notes/wbs-brief-2026-08-14-r5-r6-history.md` §6 splits R5/R6 into five changes.
This is **H2**, and it lands second by the one ordering the brief calls
non-negotiable: H1's history seam shipped as #76, so an actual is recorded in the
plan's history for free rather than through a write path built twice.

## What Changes

**One table.** `actual (work_item_id, role_id, days, recorded_at)`, keyed on the
pair the estimate is keyed on. Per **role**, not per item — "who overran, Dev or
QA?" is the question actuals are for. Its own table rather than a column on
`estimate`, because work nobody estimated still takes days and `estimate`'s three
columns are `NOT NULL`.

**Unstated is the absence of a row, never a zero** — the rule
`project_team_capacity` follows and the export has always followed. Clearing
deletes. A stored `0` is a person saying the work took no days, which is a
different sentence and a rarer one.

**Two routes.** `PUT /work-items/:id/actuals/:roleId` with `{days}` and `DELETE`
beside it, refusing `rolled_up` (409) and `unknown_role` (404) exactly as the
estimate routes do, and `invalid_actual` (400) for anything that is not a finite
number of days at or above zero.

**Journalled as `actual` / `clear_actual`** through `WorkItemService.record`, the
seam H1 built — so recording days is undoable and in the plan's history without a
line of new plumbing.

**Rolled up like an estimate.** A parent's recorded days are the sum of its
descendants', computed on read, through the same fold the estimates use — one
recursion, generic over the figure, so the two cannot drift.

**Actuals follow the structure.** They move down when a leaf gains its first
child and up when a parent loses its last, they come back with a restored branch,
and they are **not** copied into a duplicate. A role removal counts them before
taking them.

## Non-goals

**No date moves.** R6 is reporting only: the engine's input is built from
estimates in `slicesOf` and nothing below it reads this table. The model has no
completion state anywhere, so it cannot tell "took 8 days, finished" from "8 days
so far, still running" — and the two mean opposite things for every successor.
`service/schedule.ts` has an **empty diff**.

The four faces and the export columns (H3), snapshots (H4), the history view
(H5). No variance anywhere: it is `actual − final`, derived on read, and it
belongs to the surface that shows it. No new WS event — actuals ride
`work_items_changed`, which already carries the touched item and its ancestors.
