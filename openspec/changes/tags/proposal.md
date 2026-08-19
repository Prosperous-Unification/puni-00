## Why

Dany, 2026-08-19: _"Ok let's add tags - might be useful."_

This reverses an assumption I made on 2026-08-16 and a recommendation I wrote on
2026-08-17. Both said the same thing: the team label is already a global,
user-extensible, inherited, exportable grouping axis, `filter-facets` (#77) made
it filterable, and a second parallel label buys little for three days. That was
advice about sequencing, not a claim the feature is wrong, and the sequencing
call is his. It is made.

The need is real and predates the recommendation. R2-5 designed a second label
dimension (then called `service`), and `notes/decisions.md:85` dropped it
pointing at R10. R10's brief §6 then ranked three ways to answer it and put "a
real tag dimension, 3 days" third. This change is that third answer, built.

What a tag is for, said plainly: a team says **who does the work**, and the
scheduler spends its capacity. A tag says **what kind of thing this is** —
`regulatory`, `tech-debt`, `q3-must-have` — and the scheduler must never read it.
The two questions are different, an item answers both at once, and today it can
only answer the first.

## What Changes

**Two tables, additive only.** `tag (id, name)` — a global directory, no project
column, exactly as `service_team` is global — and `work_item_tag (work_item_id,
tag_id)`, the join, cascading on both sides. Blue and green share one SQLite
file, so nothing is renamed and nothing is dropped.

**A tag has no pool, no size and no effect on any date.** This is the defining
absence and it is load-bearing in three places: `service/schedule.ts` has an
empty diff, `libs/domain` has an empty diff, and the directory page renders tags
in a section with **no capacity column and no membership chips**. That visible
absence is why tags are a sibling section rather than a second tab of the Teams
one — a reader who sees no capacity column learns the model rule without being
told it.

**Inheritance is override, per dimension, independently** — R2's Q4, confirmed
there and unchanged here. A row with tags and no teams inherits its ancestor's
teams and overrides its ancestor's tags. Blank means inherit; there is no third
"deliberately none" state, exactly as there is none for teams. Inheritance is a
**reading, never a write**: `effectiveTagsOf` computes it over the tree the way
`effectiveTeamsOf` already does, and nothing is stored denormalised.

**The filter gains one facet.** `FilterCriteria` (`tree-search.ts:66`) grows
`tagIds: readonly string[]` beside the seven `filter-facets` shipped, `NO_FACETS`
grows its empty entry, and `narrowTree` gains one predicate against the
**effective** reading — never the row's own stored labels, which is the
stored-versus-effective bug this repo has shipped twice.

**The undo journal carries whole sets.** A set-valued field's before-value is the
prior set, not a scalar. This is the one seam where a scalar habit silently loses
data, and it is why the write path gets its own watched red.

**One export column**, `Tags`, `; `-joined and RFC4180-quoted, beside `Teams`.

## Impact

- **Prod mode**, mandatory: this adds `apps/be-01/drizzle/**`. See
  `notes/delivery-modes.md`.
- **Affected specs:** `wbs-domain` (the tag dimension and its inheritance),
  `wbs-api` (the directory routes and the patch payload).
- **Affected code:** `apps/be-01` schema, repository, controller, service,
  directory-usage; `apps/fe-01` `wbs-table.tsx`, `plan-cards.tsx`,
  `plan-export.ts`, `directory-page.tsx`, `tree-search.ts`, `lib/wbs-api.ts`.
- **Deliberately untouched:** `apps/be-01/src/service/schedule.ts`,
  `libs/domain/**`, `gantt-geometry.ts`'s geometry (tags reach the hover text and
  nothing that computes a position), `person_team`, and every capacity route.
  Each of those empty diffs is an assertion, and F-numbers below watch them.

## Non-goals

- **Tags do not colour the bar.** `barColorOf` stays first-team-by-name. A bar
  already carries a person as a colour and a priority as a cap; a third meaning
  on one small rectangle stops it meaning anything.
- **No inline tag creation from the item's picker.** R2 §5 notes it as a
  half-day addition with its own questions (what a typo creates, whether it
  undoes as one action or two, what a concurrent `taken` does mid-typing). The
  directory page is the surface this ships.
- **No grouping the chart by tag.** That is chart layout, priced at 2–3 days
  beside R8, and it interacts with the assignee lanes.
