<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The reading, re-derived over a set

- [ ] 1.1 `libs/domain/src/effective-team.ts`: `effectiveTeamsOf` answering
      `Map<id, {teamIds, fromId}>` over `TeamsLabelled {id, parentId, teamIds}`.
      `effectiveTeamOf`, `EffectiveTeam` and `TeamLabelled` **deleted**, so all
      six readers are compile errors — design.md D3.
- [ ] 1.2 `effective-team.test.ts` rewritten rather than adapted: the whole set
      is inherited, a non-empty own set beats an ancestor's whole, the nearer
      ancestor wins, an empty set is unstated and inherits, `fromId` names the
      row, a row with nothing above it is absent, an orphan parent answers.
      **Negative for the whole-set rule:** the resolve narrowed to
      `[teamIds[0]]`, watched failing the whole-set test.
- [ ] 1.3 The cycle guard and the memoisation, both re-derived: the cycle test
      asserts the throw (its fault hangs, so it is watched under a test
      timeout), and a new test asserts that a chain of unlabelled rows resolves
      to **the same object** — which is the only observable consequence of the
      memoisation the docstring claims. **Negative:** `found.set(each, resolved)`
      for the walked rows deleted, watched failing on identity.

## 2. The table, the migration and Claim A

- [ ] 2.1 `work_item_team` in `schema.ts` with the JSDoc carrying D1 and D8;
      `workItem.serviceTeamId`'s JSDoc gains its "the join is the read, this is
      the second copy" note naming this change.
- [ ] 2.2 `drizzle/20260814100000_add_work_item_team/migration.sql` — table,
      index, and the seed selecting every non-null `service_team_id` out of
      `work_item`; `down.sql` dropping the table.
- [ ] 2.3 Claim A in `repository/migrate.test.ts`, real SQLite, rolled back to
      `add_project_team_capacity` and forward: one join row per labelled work
      item, none for an unlabelled one, `project_team_capacity` and `person_team`
      row-for-row unchanged. **Negative:** the seed `INSERT` struck, watched
      failing on the empty join; and the `WHERE … IS NOT NULL` struck, watched
      failing on the `NOT NULL` constraint the column shape gives it.
- [ ] 2.4 The cascade, and the outgoing release's own writes: a team removed by
      plain SQL takes its join rows with it and does **not** fail.
      **Negative:** `ON DELETE CASCADE` struck from the migration, watched
      failing on `FOREIGN KEY constraint failed`.

## 3. Reads and writes against real SQLite

- [ ] 3.1 `WorkItemRepository.listByProject` returns `LabelledWorkItem` — the row
      plus `teamIds` ordered by team id (D6). Test: two join rows come back as
      two, in that order.
- [ ] 3.2 `patch` writes the column and the join in one transaction, and clearing
      writes both. **Negative:** the join write deleted, watched failing
      `labels the join as well as the column`; and the join `DELETE` deleted,
      watched failing `clearing a label empties the join too`.
- [ ] 3.3 `insert` writes the join row for a row that arrives labelled — the
      restore/copy parity D2 argues for. Test: a labelled insert reads back with
      its team.
- [ ] 3.4 `SubtreeRepository.insertSubtree` writes join rows for every copied
      row. **Negative:** the derivation deleted, watched failing the duplicated
      branch's team.
- [ ] 3.5 `directory.ts`: `usageRowsIn`, `removeTeam`'s in-use count and
      `projectsLabelled` read the join rather than the column. **Negative:** the
      count narrowed back to the column while the join is written — no red is
      possible while the two agree, so this one is **reasoned, not watched**, and
      says so in `verify.md`.

## 4. be-01 service

- [ ] 4.1 `poolFor(teamIds, teamSizes)` exported from `work-item.service.ts`:
      empty → no pool, one unsized → no pool, one sized → that pool and its
      slots, **more than one → throw** (D4). **Negative:** the throw replaced by
      `teamIds.at(0)`, watched failing `refuses a set the engine cannot spend`.
- [ ] 4.2 `tree()` reads `effectiveTeamsOf` and the payload carries `teamIds` per
      row. `NumberedWorkItem` gains the field with its JSDoc.
- [ ] 4.3 `directoryUsageOfTeam` reads the set both for `label_nulled` (own set)
      and `capacity_released` (effective set). Test: a row whose own set holds
      **two** teams reports `label_nulled` for either of them — the one place a
      set of two is constructible, since the value is a plain argument.
      **Negative:** the membership test narrowed to `teamIds[0] === teamId`,
      watched failing on the second team.
- [ ] 4.4 Claim B: `service/team-sets-identity.test.ts` replaying the committed
      oracle, `teamIds` lifted off and asserted separately as the singleton of
      the row's own `serviceTeamId` (D5). **Negative:** the lifted comparison
      left whole, watched failing on the extra key; and `teamIds` seeded empty in
      the fixture, watched failing on the singleton assertion **and** on 12 of
      the 16 plans' dates.

## 5. fe-01

- [ ] 5.1 `WorkItemView.teamIds`, `TreeRow` through it, and the table's
      `effectiveTeamsOf` read: the cell's own label, the inherited label and its
      `fromRow`, the picker's value, `createPersonFor`'s memberships and the
      Teams dialog's flattened effective sets. **Negative:** the own-set arm of
      `effectiveTeamLabelOf` narrowed to "always inherited", watched failing on
      the cell that carries its own team.
- [ ] 5.2 `plan-export.ts`: `ExportRow.teamIds`, `teamsInForce` over the new
      reading, and the `Team` cell joining the names it resolves. Tests: the
      inherited-from wording is unchanged, and a two-team row prints both
      (the export's row shape is a plain object, so the set is constructible
      here as well).
- [ ] 5.3 Every fe-01 fixture that builds a work item row by hand carries
      `teamIds` — `wbs-table.test.tsx`, `plan-cards.test.tsx`,
      `teams-dialog.test.tsx`, `gantt-panel.test.tsx`, `plan-export.test.ts`,
      `page-shortcuts.test.tsx`.

## 6. The record

- [ ] 6.1 `CONTEXT.md`: **team set** and **effective team set** as terms.
- [ ] 6.2 `verify.md`: the gate's numbers from h2puni, the CI run, and the
      failure-proof table with every fault above and the output it produced.
