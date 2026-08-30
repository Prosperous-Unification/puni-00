<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The column is stored

- [x] 1.1 The migration `20260811100000_add_priority`: `work_item.priority`,
      `integer`, **nullable with no default**, and its `down.sql`. Two cases in
      `migrate.test.ts`: the outgoing release's `INSERT`, which does not name
      the column, still runs against the migrated schema; and a work item
      written before the column existed comes forward with no priority.
      Negatives: `integer NOT NULL DEFAULT 1` — both watched failing on
      `Received: 1`; a bare `integer NOT NULL` — the outgoing release's
      statement itself watched failing. `Proof:` in `migration.sql`.
- [x] 1.2 `WorkItem.priority` and `WorkItemPatch.priority` in
      `repository/index.ts`, the column in `schema.ts`, the field in the
      repository patch's "names nothing" guard and in the in-memory fixture.
      The migration order pins in `migrate-down.test.ts` move with it.

## 2. The engine places by priority

- [x] 2.1 `schedule.ts`: `goesFirst` compares priority ahead of everything it
      compared before — unset as `+Infinity` — read off the rows rather than
      passed as a second map, so there is no copy to fall out of date with the
      tree. Tests in a new `schedule-priority.test.ts`: two work items on one
      person invert their start order; a priority beats an unset one; priority
      is asked before float and float still decides between equals. Negative:
      the priority comparison deleted — eight tests watched failing.
- [x] 2.2 `priorityByLeaf`: a priority written on any row reaches every leaf
      beneath it, **most specific first** — the leaf's own over any ancestor's,
      the nearer ancestor over the further. Tests: a parent's priority reaches a
      leaf that has none; a leaf's own beats its parent's in **both**
      directions; the nearer of two ancestors wins. Negative: the expansion
      written as the floor rule (`Math.min` over every ancestor that applies) —
      the last two watched failing. `Proof:` on the function.
- [x] 2.3 The constraints, in the same file: a priority-1 work item still waits
      for its predecessor (`boundBy: 'predecessor'`) and still respects its
      floor (`boundBy: 'notBefore'`); a work item's own roles stay in role
      order; a slice nobody has estimated still takes no place in the queue,
      whatever its priority. Negative: the top priority freed of its
      predecessors and its floor — "start earlier" read as a pin — three
      watched failing.
- [x] 2.4 The regression: a contention-heavy fixture — three people queueing, a
      dependency, a floor, a two-level parent, a split work item and an
      unestimated slice — with **no priority anywhere**, pinned field by field
      against the numbers this engine gave on `main` @ `94ed488`. Negative: the
      unset default written as the slice's own placed finish rather than
      `+Infinity` — watched failing.

## 3. The write path refuses what is not a priority

- [x] 3.1 `asOptionalPriority` in `work-item.controller.ts`: an integer of 1 or
      more, `null` clears, absent leaves — anything else a 400
      `priority_must_be_a_whole_number_from_1`. Tests in
      `work-item.controller.test.ts`: `0`, `-1`, `1.5`, `'2'`, `true` and
      `1e20` each refused with the stored value unchanged; `42` and `1_000_000`
      accepted and echoed; `null` clears. Negative: the throw deleted — every
      refusal watched answering 200 and storing the value. `Proof:` beside it.
- [x] 3.2 The read path and undo: `tree` hands the rows to `schedule`, which
      reads their priorities; `fieldsOf` and `revertTo` name `priority`. Tests
      in `work-item.service.test.ts` (a PATCH inverts two work items' dates end
      to end; a priority on a phase reaches the leaf beneath it) and
      `undo.test.ts` (a replaced priority comes back; a rename undone does not
      carry a priority somebody else set in between; the first priority a work
      item ever had undoes to `null`, not to 1). Negative: each of the two
      lines deleted in turn — both undo tests watched failing.

## 4. The column is on screen

- [x] 4.1 fe-01: a `priority` column between Depends on and the service team —
      48px in `table-frame.ts`, header `Prio` on one line, **blank at rest**, a
      `CellInput` carrying the table's own Tab, arrow and command-key wiring;
      `wbs-api.ts` carries the field on the row and in `patch`. Tests in
      `wbs-table.test.tsx`: every cell blank on a plan with no priorities;
      typing sends the number; emptying sends `null`; a number be-01 will
      refuse is still sent; text that is not a number at all is refused here,
      with a sentence, because JSON would carry it as the `null` that clears.
      Negatives: the empty-box branch deleted, a placeholder added, and the
      `NaN` guard disabled — one test each, watched failing.
- [x] 4.2 The Gantt hover card: `GanttRow.priority` through `GanttBar` into
      `barFacts`, one line, only where a priority is set. Test in
      `gantt-panel.test.tsx`: a bar whose work item carries 2 says so, and one
      whose work item carries none says nothing about priority, in one render.
      Negative: the null check dropped — watched failing on `Priority null`.
      `Proof:` beside the line.
- [x] 4.3 `plan-export.ts` gains a Priority column beside Not before, blank
      where none is set, and `CONTEXT.md` gains **Priority**.

## 5. Gate

- [x] 5.1 `bunx nx format:check --all`, `bunx nx run-many -t test lint
typecheck` and `bunx @fission-ai/openspec@1.3.0 validate --all` green;
      results and the failure-proof table in `verify.md`. `build` and the
      browser gate are CI's — neither runs on this host.
