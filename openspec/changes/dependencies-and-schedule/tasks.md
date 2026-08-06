## 1. The schedule, as pure functions

- [x] 1.1 `expectedDays(estimate)` in `libs/domain`: PERT `(O + 4R + P) / 6`, with tests including a triple where the realistic value is not the midpoint — that is the whole point of weighting it four times.
- [x] 1.2 Failing tests in `apps/be-01/src/service/schedule.test.ts` for the forward pass: a leaf with no predecessor starts at 0, a leaf waits for its predecessor, two predecessors mean the later one wins, a chain of three accumulates.
- [x] 1.3 Failing tests for the backward pass and float: a parallel chain has slack, the long chain has none, and float is `latestStart - earliestStart`.
- [x] 1.4 Failing tests for parents: a parent spans its descendants rather than summing them, and its span is not its rolled-up effort.
- [x] 1.5 Failing tests for edges declared on a parent: expanded to every leaf beneath it, on both sides.
- [x] 1.6 **Negative test:** a cyclic graph throws rather than returning a schedule. Watch it fail with the sort's guard removed.
- [x] 1.7 **Negative test:** an unestimated leaf is reported unestimated, not merely zero. Watch it fail with the flag dropped.
- [x] 1.8 Implement `schedule.ts` — one topological order, a forward pass, a backward pass. No repository, no I/O.

## 2. Storing dependencies

- [x] 2.1 Migration adding `dependency` with its `down.sql`: `id`, `project_id`, `predecessor_id`, `successor_id`, unique on the pair, foreign keys to `work_item`.
- [x] 2.2 `DependencyRepository` against real SQLite, including a dependency whose work item does not exist being rejected by the foreign key.
- [x] 2.3 **Negative test first:** adding an edge that closes a cycle answers 409 `cycle` and writes nothing. Watch it fail with the guard replaced by `if (false)`.
- [x] 2.4 **Negative test:** an edge to an ancestor, a descendant, and to itself all answer 409 `ancestor`. Watch it fail with that check removed.
- [x] 2.5 **Negative test:** an edge naming a work item in another project answers 404. Watch it fail.
- [x] 2.6 `POST /api/work-items/:id/dependencies` and `DELETE /api/work-items/:id/dependencies/:predecessorId`, both broadcasting the tree — a dependency moves every date on screen, so it is a structural change.

## 3. The tree carries the schedule

- [x] 3.1 Failing test in the work-item controller: reading a project returns each work item's `dependsOn`, `earliestStart`, `earliestFinish`, `float` and `critical`.
- [x] 3.2 Thread it through `WorkItemService.tree`, computed on read beside the numbering and the roll-up.
- [x] 3.3 **Negative test:** watched `spanFinish` summed instead of maxed, and both `parents` tests failed — a 4-day branch reported as 7 days long because that is its effort.

## 4. The table

- [x] 4.1 Failing tests in `wbs-table.test.tsx`: a "Depends on" cell lists predecessor numbers; adding one calls the API; removing one calls the API; a refused add shows the reason.
- [x] 4.2 Columns for start, finish and float, with critical rows marked. Effort and span are labelled so they cannot be read as the same thing.
- [x] 4.3 **The schedule columns are excluded, and the dependency input is in.** Start, finish and slack are `<span>`s, not inputs, so the arrow-key grid never sees them — it selects `[data-cell]:not([readonly])` and they are neither. That is right: they are computed and there is nothing to type. The "Add a dependency" box is an input and would join the grid if it carried `data-cell`; it deliberately does not, because Enter there means "add this dependency" and an arrow leaving mid-number would be the same class of interruption the caret rule exists to prevent.

## 5. Gate and verification

- [x] 5.1 `verify.md`: the uncached gate, twelve fault injections, and what none of it covers.
- [x] 5.2 Exercised on dev: a four-item plan with a parallel branch. `Paint` waits for both a 3-day and a 5-day predecessor and starts on day 5 — the longer one — `Sand` is critical and `Strip` shows its two days of slack. A cycle came back 409. Recorded in `verify.md`.
