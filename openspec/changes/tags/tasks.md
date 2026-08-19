## 1. The tables, and the migration that adds them

- [x] 1.1 `tag` and `workItemTag` in `schema.ts`. `tag` global — **no project
      column**, mirroring `service_team`, with `name` `NOT NULL` and a unique
      index on it so a rename can answer `taken`. `work_item_tag` keyed on
      `(work_item_id, tag_id)`, **both sides cascading** — unlike
      `role_progress`, where `role_id` deliberately does not, because a tag is a
      label and deleting the label should take the labelling with it. JSDoc says
      what the table is **not**: not a pool, not a size, not anything a date
      reads.
- [x] 1.2 `drizzle/20260819120000_add_tag/{migration,down}.sql`. **Check the stamp
      against every existing directory before writing it** — #60 and #61 both
      stamped `20260814100000`, `migrationsToRollback` filters on a strict
      `created_at >`, and `rollbackTo` therefore reversed nothing, silently, with
      both tables still present.
- [x] 1.3 The rollback test: down, then up, then a row survives the round trip.
      **Watched red** — revert the `down.sql` `DROP` and it must fail.

## 2. The read path

- [x] 2.1 `repository/work-item.ts`: join `work_item_tag`, return `tagIds` per
      row beside `teamIds`. One query, not N.
- [x] 2.2 `effectiveTagsOf` beside `effectiveTeamsOf`, both over one shared walk
      in `effective-label.ts`. Override, per dimension,
      independently; blank means inherit. **Watched red** — make it union
      instead of override and the inheritance case must fail.
- [x] 2.3 A row with tags and no teams inherits the ancestor's teams and
      overrides the ancestor's tags, and the mirror case. Both asserted.

## 3. The write path, and the undo journal

- [x] 3.1 `controller/work-item.controller.ts`: `tagIds?: string[]` on the patch
      payload. Unknown tag id → `unknown_tag`, the refusal shape the team write
      already makes.
- [x] 3.2 `service/work-item.service.ts`: the journalled before-value is **the
      whole prior set**, not a scalar. **Watched red** — write it as a scalar and
      the two-tag undo must fail. This is the seam a scalar habit silently loses
      data at.
- [x] 3.3 Undo and redo of a tag change, over real SQLite rather than the
      in-memory store — the store cannot model a cascade, which is how a restore
      case passed under the very fault it was written for in #79.

## 4. The directory

- [ ] 4.1 `GET/POST /api/tags`, `PATCH /api/tags/:id` (rename, 409 `taken`
      carrying the surviving name), `DELETE /api/tags/:id[?cascade=1]`. Global —
      no project in the path or the query.
- [ ] 4.2 `directoryUsageOfTag`: `label_removed` per item, **no
      `capacity_released` arm and no date effect**. Same 409-then-`?cascade=1`
      shape as `removeTeam`.
- [ ] 4.3 **Watched red on the empty diff:** a test that fails if deleting a tag
      moves any date in the plan.

## 5. The filter

- [ ] 5.1 `tree-search.ts`: `tagIds` on `FilterCriteria` and `NO_FACETS`,
      `RowFacets` gains the **effective** tag list, one predicate in
      `narrowTree`. `filterWords` gains its label.
- [ ] 5.2 **Watched red** — point the predicate at the row's own stored tags
      instead of the effective reading and the inherited-tag case must fail.
      This is the class of bug this repo has shipped twice.
- [ ] 5.3 The facet control beside the seven `filter-facets` shipped.

## 6. The rest of fe-01

- [ ] 6.1 The tag cell in `wbs-table.tsx` — a multi-select, independent of Teams.
- [ ] 6.2 `plan-cards.tsx`: the `↳` inherited chip, per dimension.
- [ ] 6.3 `plan-export.ts`: a `Tags` column, `; `-joined, RFC4180-quoted.
- [ ] 6.4 `directory-page.tsx`: a Tags section beside Teams, **with no capacity
      column and no membership chips**. That absence is the model rule made
      visible.
- [ ] 6.5 `lib/wbs-api.ts`: `tagIds` on the wire types.
- [ ] 6.6 The table-width budget rule — a new column has to be paid for or
      exempted, and the exemption must name what it exempts.

## 7. The empty diffs, asserted

- [ ] 7.1 `service/schedule.ts` — empty diff. **Watched red:** wire the scheduler
      to read a tag, every downstream date moves, revert.
- [x] 7.2 `libs/domain` — **the scheduling surface** has an empty diff, not the
      whole library. Corrected 2026-08-19: `effectiveTeamsOf` lives here and both
      apps import it, so the tag reading has to live beside it; what a tag is not
      is anything below `slicesOf`. Asserted by 7.1's fault rather than by a
      second test.
- [ ] 7.3 `gantt-geometry.ts` — tags reach the hover text and nothing that
      computes a position. `barColorOf` unchanged.

## 8. The gate and the record

- [ ] 8.1 Full gate on h2puni, with the bun version beside every count.
- [ ] 8.2 `design.md` — the decisions above with their alternatives.
- [ ] 8.3 Spec deltas: `wbs-domain` (the dimension, its inheritance) and
      `wbs-api` (the routes, the payload). **Lead every requirement body with its
      `SHALL`** — `openspec validate` reads only the first line.
- [ ] 8.4 `verify.md` with the R5 fault table and citations.
- [ ] 8.5 CI green at the head.
