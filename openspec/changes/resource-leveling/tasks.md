## 1. The person is on the planner's input

- [ ] 1.1 `Slice.personId` — resolved by the caller, never derived here — and
      `work-item.service` resolving it per slice from the assignments: the
      role's own assignee, or the assumed one when exactly one role is named.
      Test: a work item with one assignee has that person on every slice; one
      with two has each role's own; one with none has nobody.
- [ ] 1.2 **Negative test, watched failing:** the assumed assignee dropped from
      the adapter, and the implicit person's second slice stops queueing.

## 2. Serial list scheduling

- [ ] 2.1 The eligible set, the priority order (CPM earliest start, least
      float, work item number, role order) and the floors (predecessors,
      not-before, the assignee's last finish). Tests: two work items on one
      person run one after the other, in priority order; a person's slice waits
      for a dependency and a person at once, whichever is later; an unassigned
      plan is untouched; `doesEveryPhase` queues both roles of one work item
      behind another.
- [ ] 2.2 The binding floor and the resource predecessor on every slice —
      `boundBy`, `resourcePredecessorId`, `personId`. Test: the slice pushed by
      a person names the slice that person was busy with; a slice whose person
      floor merely ties a dependency is bound by the dependency, not the person.
- [ ] 2.3 **Negative tests, watched failing:** the person floor dropped from
      the placement, and two slices of one person overlap; the eligible set
      taking any slice rather than the highest-priority one, and the placement
      order stops being the priority order.

## 3. The v1 counterexample

- [ ] 3.1 The plan the replaced algorithm got wrong, as a named test: a person
      holding three slices where fixing the first overlap pushes the second
      into the third, which did not overlap it at CPM time. Asserted as
      numbers and as "no two slices of one person overlap".
- [ ] 3.2 **Negative test, watched failing:** the person floor taken from the
      CPM finish of that person's previous slice instead of where it was
      actually placed — which is what one forward re-run over stale numbers
      does, and is the exact fault the roadmap replaced the algorithm over.

## 4. Float and critical through people

- [ ] 4.1 The backward pass runs over the augmented graph, resource edges
      included. Test: a slice with slack on the dependency graph alone has none
      once the person behind it is counted, and the row goes critical.
- [ ] 4.2 The projection stops deriving float from the row's endpoints when a
      person has pushed its slices apart. Test: a work item whose `QA` was
      pushed away from its `Dev` reports the least of its slices' slack, not
      the difference of its ends.
- [ ] 4.3 **Negative test, watched failing:** the projection left deriving from
      the endpoints, and a row with a critical slice reports slack and no red.

## 5. The plan says how much of it is queueing

- [ ] 5.1 `waitingForPerson` on the tree — the number of work items holding a
      slice a person is the reason for. Test: zero on an unassigned plan, and
      the count of the work items that queue on an assigned one; a failed
      schedule reports zero rather than a stale number.
- [ ] 5.2 fe-01 is not edited, and the count reaches the wire through the
      existing spread in the controller — the controller suite, unchanged.

## 6. Identity: leveling is invisible when it does not bind

- [ ] 6.1 The differential from `schedule-on-item-role` — a thousand seeded
      plans through the previous engine and this one — passes unchanged with
      every slice carrying no person, and the captured live plan does too.
- [ ] 6.2 **Perturbation, watched failing:** slices with no person treated as
      one person's queue, and the differential goes red — proof that those
      thousand plans really go through the leveler rather than around it.

## 7. The perf budget

- [ ] 7.1 A benchmark fixture — 200 work items, 2–3 roles, dependencies — and
      the pass asserted under 10ms inside the ordinary `bun test` run.
- [ ] 7.2 **Negative run, watched failing:** the eligible set scanned linearly
      instead of held in a heap, or the fixture grown, so the assertion is
      shown to be one that can fail rather than a number nobody measures.

## 8. Vocabulary and the gate

- [ ] 8.1 `CONTEXT.md` gains the terms as they resolve; `design.md` carries the
      algorithm's name, its termination argument, its complexity and its
      refusal to claim optimality.
- [ ] 8.2 The format check, the run-many gate and the OpenSpec validation,
      recorded in `verify.md` with the failure-proof table. No e2e: this
      change is server-only.
