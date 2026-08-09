## 1. The person is on the planner's input

- [x] 1.1 `Slice.personId` — resolved by the caller, never derived here — and
      `work-item.service` resolving it per slice from the assignments: the
      role's own assignee, or the assumed one when exactly one role is named.
      Test: a work item with one assignee has that person on every slice; one
      with two has each role's own; one with none has nobody.
- [x] 1.2 **Negative test, watched failing:** the assumed assignee dropped from
      the adapter, and the implicit person's second slice stops queueing.

## 2. Serial list scheduling

- [x] 2.1 The eligible set, the priority order (CPM earliest start, least
      float, work item number, role order) and the floors (predecessors,
      not-before, the assignee's last finish). Tests: two work items on one
      person run one after the other, in priority order; a person's slice waits
      for a dependency and a person at once, whichever is later; an unassigned
      plan is untouched; `doesEveryPhase` queues both roles of one work item
      behind another.
- [x] 2.2 The binding floor and the resource predecessor on every slice —
      `boundBy`, `resourcePredecessorId`, `personId`. Test: the slice pushed by
      a person names the slice that person was busy with; a slice whose person
      floor merely ties a dependency is bound by the dependency, not the person.
- [x] 2.3 **Negative tests, watched failing:** the person floor dropped from
      the placement, and nine leveling tests fail with two slices of one person
      on the same days; the priority's first two comparisons dropped, and a
      person is put on a slice she cannot begin for three days.
- [x] 2.4 **Unplanned, found by the controller test:** every project seeds two
      roles, so an assigned work item carries an unestimated `QA` belonging to
      the same person. Queued, it sat behind everything else they were doing
      and dragged the row's finish with it — a work item ending on day 3
      reported as ending on day 5. A slice of no length now takes no place in a
      queue; negative test watched failing.

## 3. The v1 counterexample

- [x] 3.1 The plan the replaced algorithm got wrong, as a named test: a person
      holding three slices where fixing the first overlap pushes the second
      into the third, which did not overlap it at CPM time. Asserted as
      numbers and as "no two slices of one person overlap".
- [x] 3.2 **Negative test, watched failing:** the person floor taken from the
      CPM finish of that person's previous slice instead of where it was
      actually placed — which is what one forward re-run over stale numbers
      does, and is the exact fault the roadmap replaced the algorithm over.

## 4. Float and critical through people

- [x] 4.1 The backward pass runs over the augmented graph, resource edges
      included. Test: a slice with slack on the dependency graph alone has none
      once the person behind it is counted, and the row goes critical.
- [x] 4.2 The projection stops deriving float from the row's endpoints when a
      person has pushed its slices apart. Test: a work item whose `QA` was
      pushed away from its `Dev` reports the least of its slices' slack, not
      the difference of its ends.
- [x] 4.3 **Negative test, watched failing:** the projection left deriving from
      the endpoints, and a row with a critical slice reports slack and no red.

## 5. The plan says how much of it is queueing

- [x] 5.1 `waitingForPerson` on the tree — the number of work items holding a
      slice a person is the reason for. Test: zero on an unassigned plan, and
      the count of the work items that queue on an assigned one; a failed
      schedule reports zero rather than a stale number.
- [x] 5.2 fe-01 is not edited, and the count reaches the wire through the
      existing spread in the controller — the controller suite, unchanged.

## 6. Identity: leveling is invisible when it does not bind

- [x] 6.1 The differential from `schedule-on-item-role` — a thousand seeded
      plans through the previous engine and this one — passes unchanged with
      every slice carrying no person, and the captured live plan does too.
- [x] 6.2 **Perturbation, watched failing:** slices with no person treated as
      one person's queue, and the differential goes red — proof that those
      thousand plans really go through the leveler rather than around it.

## 7. The perf budget

- [x] 7.1 A benchmark fixture — 200 work items, 2–3 roles, dependencies — and
      the pass asserted under 10ms inside the ordinary `bun test` run.
- [x] 7.2 **Negative run, watched failing, twice:** the fixture at four times
      the size read 18.6ms, and the eligible set scanned linearly instead of
      held in a heap read 32.3ms. It measures 2.9ms.

## 8. What the review found

- [x] 8.1 **HIGH, codex:** a late start reconstructed by subtracting a duration
      from a finish it was added to put `-2.2e-16` of slack on both slices of a
      person's queue that ends the project, and took the red off both rows.
      Fixed by the tight-path rule — a slice that cannot move takes its late
      start from the early pass — scoped to plans that hold a queue so the
      unassigned ones still answer bit for bit what the previous engine did.
      Assigned-PERT test watched failing first; the scoping watched failing
      too, at seed 2 of the differential.
- [x] 8.2 **MEDIUM, codex:** the fence of `written(...)` guards on maps the
      pass had just filled could not be made to fire. The passes now run over
      node indices, so those reads are array offsets the type carries and the
      guards are gone rather than tested. The two that remain — `slicesOf` and
      `endsOf` — are both watched failing; `endsOf`'s fault made the plan
      answer "dependency cycle" for a graph with one edge in it.
- [x] 8.3 **LOW, codex:** adjacency was built by rewriting an array per edge,
      which is `O(E²)` with shared endpoints — and a plan's endpoints are
      shared by design. Pushed onto the nodes instead. The benchmark went from
      2.9ms to 1.5ms, and the negative run had to grow from four times the
      fixture to eight to still fail.

## 9. Vocabulary and the gate

- [x] 9.1 `CONTEXT.md` gains the terms as they resolve; `design.md` carries the
      algorithm's name, its termination argument, its complexity and its
      refusal to claim optimality.
- [x] 9.2 The format check, the run-many gate and the OpenSpec validation,
      recorded in `verify.md` with the failure-proof table. No e2e: this
      change is server-only.
