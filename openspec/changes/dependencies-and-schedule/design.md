# Design

## D1 — Effort and span are different numbers, and the table must show both

The roll-up already gives a parent the sum of its descendants' estimates. That is
**effort**: how many days of work are inside this branch. It is not how long the
branch takes, because two children with no dependency between them run at the
same time.

So a parent gets no duration of its own. Its earliest start is the earliest of
anything beneath it and its earliest finish the latest — a **span** derived from
its children's schedule, not from its own rolled-up total. A branch holding 12
days of effort across three independent children spans 5 days, and both numbers
are true and useful and must not be conflated. They sit in different columns and
the header says which is which.

## D2 — A leaf's duration is the sum of its roles, and that is an assumption

`(O + 4R + P) / 6` per role, summed. Summing assumes Dev finishes before QA
starts, which is the common case and the conservative one; a team that runs them
together will see a schedule slightly longer than reality, which is the harmless
direction for a plan.

Modelling it properly needs to know who does what and when, which needs
assignees, which is a non-goal. The assumption is stated on the function so the
next person changing it knows it is a choice rather than an oversight.

A leaf nobody has estimated has a duration of zero, and the schedule says so
per work item rather than silently pretending it takes no time. The table can
then mark it, because a zero that means "instant" and a zero that means "nobody
looked" are the same number and opposite facts.

## D3 — Day offsets, not dates

Everything is a whole-number offset from the project's day zero. A calendar
brings weekends, holidays, part-days and timezones, and every one of those is a
decision this change does not need to make in order to answer "what is waiting on
what, and which chain is the long one".

Day zero is not stored anywhere. `earliestStart: 0` means "as soon as the project
starts", which is true whenever that is.

## D4 — Forward pass, backward pass, float

Standard critical-path method, on the graph of leaves:

- **Forward.** A work item's earliest start is the latest earliest-finish of its
  predecessors, or 0 if it has none. Its earliest finish is that plus its
  duration.
- **Backward.** The project's finish is the greatest earliest finish. A work
  item's latest finish is the earliest latest-start of its successors, or the
  project finish if it has none; its latest start is that minus its duration.
- **Float** is `latestStart - earliestStart`. Zero float means moving this work
  item moves the whole project — that is the critical path.

Both passes are one topological walk, and the topological sort is where a cycle
would surface. It cannot: the edge that would close a cycle is refused at write
time. The sort still throws if it ever sees one, because a schedule computed from
a cyclic graph is silently wrong in a way no reader could detect, and a database
restored from somewhere else is not a thing to trust.

## D5 — Dependencies are between leaves, but may be _declared_ on any work item

Saying "the whole of 010 must finish before 020 starts" is exactly what a planner
wants to write, and forcing them to draw an edge from every leaf under 010 would
be tedious and wrong the moment a leaf is added.

So an edge on a parent is expanded when the schedule is computed: every leaf
under the predecessor must finish before every leaf under the successor starts.
Stored as written, expanded on read — the same shape as numbering and roll-up,
and for the same reason: one place to be right.

An edge between a work item and its own ancestor or descendant is refused. A
parent already spans its children; asking it to wait for one of them is asking it
to start after itself.

## D6 — The cycle guard is at the write, and the sort throws anyway

`POST /api/work-items/:id/dependencies` refuses an edge that would make the graph
cyclic — walking the existing edges from the successor to see whether it can
already reach the predecessor. That is the check a person needs, at the moment
they can still do something about it.

The topological sort keeps its own throw. It is not redundant: the write guard
protects the edges this app creates, and the sort protects the computation from
any graph it is handed, including one that arrived in a restored database or
through a future bulk import. A cheap assertion at the boundary of an expensive
silent wrongness.
