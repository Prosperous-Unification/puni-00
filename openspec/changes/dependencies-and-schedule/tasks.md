## 1. The schedule, as pure functions

- [ ] 1.1 `expectedDays(estimate)` in `libs/domain`: PERT `(O + 4R + P) / 6`, with tests including a triple where the realistic value is not the midpoint — that is the whole point of weighting it four times.
- [ ] 1.2 Failing tests in `apps/be-01/src/service/schedule.test.ts` for the forward pass: a leaf with no predecessor starts at 0, a leaf waits for its predecessor, two predecessors mean the later one wins, a chain of three accumulates.
- [ ] 1.3 Failing tests for the backward pass and float: a parallel chain has slack, the long chain has none, and float is `latestStart - earliestStart`.
- [ ] 1.4 Failing tests for parents: a parent spans its descendants rather than summing them, and its span is not its rolled-up effort.
- [ ] 1.5 Failing tests for edges declared on a parent: expanded to every leaf beneath it, on both sides.
- [ ] 1.6 **Negative test:** a cyclic graph throws rather than returning a schedule. Watch it fail with the sort's guard removed.
- [ ] 1.7 **Negative test:** an unestimated leaf is reported unestimated, not merely zero. Watch it fail with the flag dropped.
- [ ] 1.8 Implement `schedule.ts` — one topological order, a forward pass, a backward pass. No repository, no I/O.

## 2. Storing dependencies

- [ ] 2.1 Migration adding `dependency` with its `down.sql`: `id`, `project_id`, `predecessor_id`, `successor_id`, unique on the pair, foreign keys to `work_item`.
- [ ] 2.2 `DependencyRepository` against real SQLite, including a dependency whose work item does not exist being rejected by the foreign key.
- [ ] 2.3 **Negative test first:** adding an edge that closes a cycle answers 409 `cycle` and writes nothing. Watch it fail with the guard replaced by `if (false)`.
- [ ] 2.4 **Negative test:** an edge to an ancestor, a descendant, and to itself all answer 409 `ancestor`. Watch it fail with that check removed.
- [ ] 2.5 **Negative test:** an edge naming a work item in another project answers 404. Watch it fail.
- [ ] 2.6 `POST /api/work-items/:id/dependencies` and `DELETE /api/work-items/:id/dependencies/:predecessorId`, both broadcasting the tree — a dependency moves every date on screen, so it is a structural change.

## 3. The tree carries the schedule

- [ ] 3.1 Failing test in the work-item controller: reading a project returns each work item's `dependsOn`, `earliestStart`, `earliestFinish`, `float` and `critical`.
- [ ] 3.2 Thread it through `WorkItemService.tree`, computed on read beside the numbering and the roll-up.
- [ ] 3.3 **Negative test:** the roll-up total and the span are different numbers and both are reported. Watch a test fail if the span is computed by summing.

## 4. The table

- [ ] 4.1 Failing tests in `wbs-table.test.tsx`: a "Depends on" cell lists predecessor numbers; adding one calls the API; removing one calls the API; a refused add shows the reason.
- [ ] 4.2 Columns for start, finish and float, with critical rows marked. Effort and span are labelled so they cannot be read as the same thing.
- [ ] 4.3 The new cells join the arrow-key grid, or are deliberately excluded and the reason is written down.

## 5. Gate and verification

- [ ] 5.1 `verify.md`: the uncached gate and the failure-proof table.
- [ ] 5.2 Exercise it on dev: build a small plan with a parallel branch and confirm the critical path is the chain that is actually longer.
