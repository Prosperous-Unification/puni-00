## Context

`schedule-on-item-role` made the slice the unit and left the people out of it:
every slice is placed as early as its predecessors allow, so one person can be
on four of them at once. The plan already knows who is on what — explicitly per
role, and through the assumed assignee when one name covers a whole work item —
and prints dates that ignore it.

The v1 roadmap's algorithm was **replaced before it was written**. Both
reviewers, independently, produced the same counterexample: level at
critical-path times, then re-run the forward pass once, and a dependency push
can land a slice on top of a person's later work that had not overlapped
anything when the overlaps were looked for. One re-run never looks again.

## Goals / Non-Goals

**Goals:**

- One person, one thing at a time — by construction, not by repair.
- A plan with nobody assigned that is byte-identical to the one before this.
- Enough on each slice for a Gantt to draw the wait: what bound it, who, and
  which slice of theirs.

**Non-Goals:**

- The shortest schedule. This is a heuristic and says so.
- Slices on the wire, bars, or the schedule header itself.
- Capacities, part-time people, calendars per person, or a toggle.

## Decisions

### D1 — Deterministic serial list scheduling, named for what it is

One pass. One eligible set. Repeatedly take the highest-priority slice whose
plan predecessors — dependency edges and its work item's own role chain — are
all placed, and put it at the latest of its floors:

- every placed predecessor's finish;
- its work item's manual "not before", on its first slice;
- **the finish of whatever its assignee is already doing.**

Its successors become eligible; the pass moves on; nothing is revisited.

**Non-overlap holds by construction.** A person's next slice is only placed
after their previous one is final, so no two slices of one person can share a
day — there is no re-run to re-open what one pass never opened. That is the
whole of the counterexample above: `r` is placed after `q`, so its floor is
where `q` **actually landed**, not where the critical path said it would.

**It is not optimal.** List scheduling is a heuristic; a different priority rule
can finish a resource-constrained plan sooner, and no priority rule finds the
shortest one in general. What this rule buys instead is determinism — the same
plan schedules the same way every time, which is what somebody reading dates
needs from it.

### D2 — The priority: soonest, then tightest, then the plan's own order

`(critical-path earliest start, least float, work item number, role order)`.

The first two come from **the same pass with the people taken out** — one call
to `placeSlices` with `personOf` returning null, which is the ordinary critical
path. Running it through the same code rather than a second implementation is
what makes "a plan with nobody assigned does not move" true by construction
rather than by inspection.

Soonest-first is the outer rule because least-slack-first idles people: a slice
that cannot begin for three days but has no float would take the queue, leave
its assignee waiting, and push the work that could have started now behind it.
There is a test that measures exactly that: two days lost.

The last two make it total. Two slices that tie on both times are separated by
their work item's number — the row that reads first goes first — and then by
their place in the role order, which two slices of one work item always differ
in. No pair can tie on all four.

### D3 — Termination is structural, and the cycle refusal moved into the pass

The augmented graph is the plan's edges plus the resource edges the pass itself
chooses. It cannot deadlock:

- the plan's edges are the only thing eligibility depends on, and a slice with
  no unplaced plan predecessor always exists while the plan's edges are acyclic;
- a resource edge always runs from a slice **already placed** to one that is
  not, so it can never close a loop or block anything;
- so each turn of the loop places exactly one slice, and there are `V` of them.

The eligible set therefore empties with slices left over only when the plan's
own edges contain a loop — which makes the pass its own cycle detector, and the
`ScheduleCycleError` it throws is the one `tree` catches to leave the rows on
screen without dates. The write path's refusal (`canDepend`, over the expanded
leaf graph) is untouched.

### D4 — Float and critical are recomputed over the augmented graph

The backward pass runs over the resource edges as well as the plan's, backwards
through the placement order — which is a topological order of the augmented
graph, so every successor is settled before the slice it follows.

This is what makes "critical" mean what it says. A slice with a day of slack
against the dependency graph alone has none once the person behind it is
counted: slipping it slips whatever they do next, and that may be what ends the
project. The Gantt's red is then about the plan a person will actually work.

### D5 — A slice with no length takes no place in a queue

Nobody is busy for zero days. An unestimated slice neither waits for its
assignee nor makes them busy — without that rule, an empty `QA` belonging to
somebody queues behind everything else they are doing and drags its work item's
finish along with it: a work item that ends on day 3 reported as ending on day
5 because a slice with nothing in it was placed there. Every project seeds two
roles, so this is the ordinary case rather than a corner.

### D6 — A tie is not a person waiting

The floors are compared latest-wins, and a tie keeps the reason named first:
predecessor, then role order, then the manual floor, then the person. So
`boundBy: 'person'` means the assignee was **strictly** the latest floor.

The reason is the count: an assignee who comes free exactly as the dependency
clears is holding nothing up, and counting that row into "N tasks wait for a
person" would inflate the one number the header says out loud.

### D7 — The anchor moves when a person pulls a work item apart

`schedule-on-item-role` places every slice of a work item from one anchor —
`base + offsets[i]` — because `(base + a) + b` is not `base + (a + b)` in
doubles and `datesOf` reads a finish through `Math.ceil`, so one bit is a whole
day on screen. That rests on the slices **tiling** the work item's span, which
leveling is precisely what breaks.

So the anchor is kept while they tile and moves to the first slice that does
not: `start === anchor.start + (offsets[i] - offsets[anchor.at])` decides,
exactly. With nobody assigned that test never fails, the anchor never moves, and
the arithmetic is the same expression with the same operands as before —
identity is structural rather than argued. The late times are anchored from the
other end by the same rule.

### D8 — The projection reports the least slack, and reads it off the ends where it can

A work item's slack is the least any of its slices has, and it is critical when
any of them is — the rule `schedule-on-item-role`'s spec already stated.

Where its slices tile, that least slack **is** the first slice's, and the
projected endpoints are that slice's own two numbers, so they are read from
there: taking a minimum over slices whose floats are equal in arithmetic and not
in doubles is what made a row with no slack report `-1.1e-16` (seed 256, in the
differential). Where a person has pulled the slices apart, the ends no longer
describe one continuous piece of work — a row can hold a critical `QA` and a
slack `Dev` — and the minimum is the only honest answer.

Tiling is read off the numbers (`start_i === finish_{i-1}`, early and late),
which is exactly the condition under which the anchor above was kept.

### D9 — Complexity

`O(V log V + E′)` for the placement, with `V` slices and `E′` the plan's slice
edges plus the resource edges (at most one per slice). The `log V` is the binary
heap the eligible set is kept in; a sorted array rescanned for the first
eligible slice is `O(V²)`, which is why there is a heap rather than a sort. Both
passes and both backward passes are that same shape, so the whole engine is.

Ahead of it, unchanged from before, `expandToLeaves` is `O(E × L²)` in the worst
case — an edge declared between two branches expands to every pair of leaves
beneath them. That is the pre-existing cost, and it is what the benchmark
fixture deliberately contains.

Measured: 600 slices, 220 rows, 60-odd edges, eight people, **2.9ms**; the
budget asserted in CI is 10ms.

## Risks / Trade-offs

- **The heuristic can be beaten.** A plan where a different order finishes
  sooner is easy to construct, and this will not find it. Stated in the spec so
  nobody reads the dates as a bound.
- **Leveling is always on.** There is no toggle, on the argument that an
  unassigned plan is provably unchanged — proven by the thousand-plan
  differential and the captured live plan, both of which now run through the
  leveled engine and were watched going red when slices with no person were
  made to share a queue.
- **One person's queue is global to the project.** Somebody assigned across two
  phases serialises them, which is true and may still surprise a reader who
  thinks of the phases as independent. `waitingForPerson` and the per-slice
  `boundBy` are what make it visible rather than mysterious; the Gantt draws it.
- **`resourcePredecessorId` is set only when the person binds.** The resource
  edge exists either way and the backward pass uses it; the id is for drawing,
  and an arrow for a wait that did not happen would be a lie in ink.
