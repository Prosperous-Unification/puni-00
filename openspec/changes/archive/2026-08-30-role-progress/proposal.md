## Why

Dany, 2026-08-18, the day after actuals merged: _"maybe we should augment actual
days by completion status?"_

He is right, and the reason is precise rather than aesthetic. `actual-days`
(#79) shipped **reporting only**, and its design.md D3 says why: the engine
cannot safely read a recorded day because the model cannot express whether the
work is over. `grep -inE "status|done|progress|percent"` over `schema.ts` and
`libs/domain` returned nothing before this change. So an actual of 8 against an
estimate of 5 is a figure nobody can read the tense of — **"took 8 days,
finished, +60%"** and **"8 days so far"** are the same row today, and they mean
opposite things for every successor.

This is the sentence that disambiguates the number. It is **H2b**: it lands
between H2 (`actual-days`, merged) and H3 (the four faces), because a face that
draws a variance has to know which of the two sentences it is drawing.

## What Changes

**One table.** `role_progress (work_item_id, role_id, state, stated_at)`, keyed
on the pair `estimate` and `actual` are keyed on. Per **role**, because actuals
are per role, and two grains for one subject is exactly how "the item says done
and a role has no actual" happens.

**Three states, two of them stored.** `in_progress` and `done` are rows; **not
started is the absence of a row**, never a stored value — the rule
`project_team_capacity` follows and `actual` follows. A `CHECK` on the column
enforces the closed set in the database rather than only in the type. There is
**no `blocked` and no `cancelled`**: each is a question the engine must answer
the day it reads this, and it does not read it yet.

**A work item's state is derived from its roles and never stored.** `agree` and
`stateOf` in `@wbs/domain`: `done` when every role with work on the row says so,
`not_started` when none of them has said anything, `in_progress` for every
disagreement in between. A parent folds from its **children**, so a row nobody
has spoken about keeps its branch off `done`.

**Two routes.** `PUT /work-items/:id/progress/:roleId` with `{state}` and
`DELETE` beside it, refusing `rolled_up` (409) and `unknown_role` (404) exactly
as the estimate and actual routes do, and `invalid_progress` (400) for anything
that is not one of the two storable states — `not_started` included, because the
way to say that is `DELETE`.

**Journalled as `progress` / `clear_progress`** through `WorkItemService.record`,
the seam H1 built — so a statement is undoable and in the plan's history without
a line of new plumbing.

**Statements follow the structure**, exactly as actuals do: down when a leaf
gains its first child, up (as the branch's **fold**) when a parent loses its
last, back with a restored branch, and **not** copied into a duplicate. A role
removal counts them before taking them.

**What `done` makes true, fixed now as a rule:** an actual on a role marked done
is **final** — the whole of what that role spent, not a running count. The change
that lets the engine consume this reads exactly that, and it must not have to
re-litigate the meaning of rows this change wrote.

## Non-goals

**No date moves.** Still reporting only: the engine's input is built from
estimates in `slicesOf` and nothing below it reads this table.
`service/schedule.ts` has an **empty diff**, checked and quoted in verify.md, and
the behavioural half is a watched red — the engine wired to skip a finished
role's slice, every downstream date moving, reverted.

**No actual start or finish dates.** They are the obvious next want and they are
a separate change: a stored date that disagrees with the scheduled one needs a
decision about which of the two a chart draws, and that decision is not this
one's to make. `stated_at` says when the _statement_ was made, which is a fact
about the tool rather than about the world.

**No faces.** Nothing under `apps/fe-01/src/components/wbs/` is touched — the
payload carries `progress` and `state` and nothing draws them yet, which is the
same position `actual-days` left `actuals` in. **No variance**, for that change's
reason: it is derived and belongs to the surface that shows it.

**No WS event.** Statements ride `work_items_changed`, which already carries the
touched item and its ancestors.
