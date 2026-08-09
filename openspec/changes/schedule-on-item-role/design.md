## Context

Today's engine (`service/schedule.ts`) is a critical-path pass over **leaves**.
A leaf's duration is `durationsOf`: every role's final figure, summed, with the
comment saying out loud that summing _assumes_ Dev finishes before QA starts
and that modelling it properly needs assignees.

That assumption is now the thing we need to model. Resource leveling gives a
person one slice at a time; a Gantt bar is drawn per slice; both need the sum
turned back into the sequence it was standing for.

The unit was settled by the reviewed roadmap: **the slice — one work item and
one role — is the universal unit, with one planner and one adapter.** The
dual-unit alternative (items when unassigned, slices when assigned) was
rejected by both reviewers because node identity would change under a plan the
moment somebody was named on it.

What this change must not do is move a single number. Every plan that exists
today must come out of the new engine bit for bit as it goes in.

## Goals / Non-Goals

**Goals:**

- One planner, over slices, whose output the work item's row is projected from.
- Identical numbers for every plan that has no resource constraint — which,
  until S2, is every plan.
- A role order that is stored rather than inferred.

**Non-Goals:**

- Resource leveling, assignees, per-person queues. Next change.
- Slices on the wire, in the table, or in the export.
- A control for reordering roles.

## Decisions

### D1 — The slice is the node; the intra-item chain is an edge, not a sum

A leaf holding `Dev` and `QA` is two nodes, `Dev` before `QA`, in the project's
role order. `duration = sum of roles` becomes a path of that length rather than
a single node of it. A parent has no slices, exactly as it has no duration
today: its numbers are a span over what is beneath it.

An unestimated slice is a node of zero length. It waits for whatever its item
waits for and imposes no wait of its own, which is what makes an unestimated
`Dev` in front of an estimated `QA` order `QA` after `Dev`'s predecessors —
the rule the roll-ups already use, now applied to time.

### D2 — A dependency attaches to the first and last slice, and only those

`A → B` becomes one slice edge: A's **last** slice to B's **first**, both in
role order. The roadmap phrases it as "A's last _estimated_ slice finishes
before B's first _estimated_ slice starts", and for the predecessor side the
two are the same statement: a trailing unestimated slice is zero-length and
chained, so it finishes exactly when the last estimated one does.

On the successor side they are **not** the same statement, and the literal
reading is wrong. Take `B` with an unestimated `Dev` and an estimated `QA`,
waiting on `A`. Attach the edge to `QA` — the first _estimated_ slice — and
`Dev` is left with no predecessor at all: it is scheduled at day zero, and the
projection below (`Start = min slice start`) reports `B` as starting before the
thing it waits for. Attaching to the first slice and letting the intra-item
chain carry the wait to the rest is both what the roadmap's own unestimated-
slice rule says and the only reading that keeps the row's start where it is
today. There is a test named for that shape.

Because edges only ever touch an item's ends, **cycles remain a property of the
leaf graph**: the intra-item chains are acyclic and private to one item, so
adding them cannot close a loop that `expandToLeaves` + `hasCycle` did not
already see. The dependency write path is untouched.

### D3 — Contiguity, and why the projection collapses to today's numbers

Under S1 nothing constrains a slice except its own item's chain and the edges
at that item's ends. So for an item starting at `base`, with slice durations
`d₀…dₙ` and running offsets `p₀=0, pᵢ₊₁=pᵢ+dᵢ`:

- forward: no slice but the first has an external predecessor, so slice `i`
  starts at `base + pᵢ` and the item finishes at `base + total`;
- backward: no slice but the last has an external successor, so with the item's
  late finish `ceiling`, slice `i` starts late at `ceiling - (total - pᵢ)`.

Both chains are tight. The slices are **contiguous**: they tile the item's span
with no gap, which is exactly the single node today's engine schedules. That is
the whole identity argument, and it is why S2 — where a person's queue can push
one slice and leave a gap behind it — is where the two engines genuinely part.

### D4 — The projection, and the two fields that are derived rather than aggregated

A work item's row is read off its slices:

| row field                     | from its slices |
| ----------------------------- | --------------- |
| duration                      | sum             |
| estimated                     | any             |
| earliestStart / latestStart   | min             |
| earliestFinish / latestFinish | max             |
| float                         | least           |
| critical                      | any             |

`float` and `critical` are **computed from the projected endpoints** —
`latestStart - earliestStart`, and `=== 0` — rather than aggregated over the
slices' own floats and flags. Under D3's contiguity every slice of an item has
the same float, so the two definitions are the same number in arithmetic. They
are not the same number in floating point, and the difference is visible: slack
is a column and critical is a red row.

`(A + p) - (B + p)` differs from `A - B` for **59%** of pairs drawn from the
PERT finals of integer trios (measured, 3.6M samples). A slice one place along
the chain would therefore report a float one bit under its item's, `min` would
take it, and a row whose slack has always read `0` would start reading
`-1.1e-16` — for a change whose whole promise is that nothing moves.

Parents are untouched: their span is computed over the **projected leaves** by
the same code as before, so their identity is structural rather than argued.

### D5 — Slice arithmetic is anchored on the item's base, for the same reason

A textbook forward pass sets `finish = start + duration` per node. For slice
`i > 0` that is `((base + d₀) + d₁)`, where today's engine computes
`base + (d₀ + d₁)`. Those are different doubles: with `base = 3.6666666666666665`
and `d₀ = d₁ = 0.16666666666666666`, today gives exactly `4` and a per-node
accumulation gives `3.9999999999999996` — and `datesOf` reads the finish
through `Math.ceil(finish) - 1`, so a bit like that one is a whole day on
screen the moment it lands the other side of an integer.

So each slice's finish is `base + pᵢ₊₁`, taken from the item's running offsets,
and its late start is `ceiling - (total - pᵢ)`. The predecessor `max` and the
successor `min` are ordinary CPM; only the two additions are anchored. The item
therefore finishes at `base + total`, which is the expression today's engine
evaluates, with the same two operands in the same order.

### D5a — What "identical" is a claim about, and the order that makes it one

`total` is summed in **role order**. `durationsOf` summed in the order the
estimate rows arrived in, and until this change nothing ordered them:
`EstimateRepository.listByProject` had no `ORDER BY`, so the order was the query
planner's to pick. Floating-point addition is commutative and **not**
associative, so:

- **Two addends: identical, whatever the order.** `a + b` is `b + a` to the bit.
- **Three or more: not identical across orders.** Valid PERT finals exist whose
  totals come out `10` one way and `10.000000000000002` the other, and a finish
  is read through `Math.ceil(finish) - 1`, so those two are a different **day**
  on the screen.

So the claim is scoped to what can actually be in a database, and the order is
fixed so that it stays scoped:

1. **Every project in any released database holds at most `Dev` and `QA`.** The
   write path for a third role is `role-crud`, which is this change's base
   branch and ships in the same release train. So every plan that exists today
   is a two-addend plan, and its identity holds regardless of the order the old
   engine's totals were summed in. The differential proves that rather than
   asserting it: for the two-role corpus it hands the previous engine a
   **shuffled** sum, and the run is green. Make that corpus three-role and the
   run goes red — the class is real, and the test can see it.
2. **From three roles on, the order is defined rather than inherited.**
   `EstimateRepository.listByProject` now orders by the role's position, the
   adapter slices in the same order, and the spec says so. There is no earlier
   number for a three-role plan to differ from, because there are no three-role
   plans until this release. A second differential covers that corpus with both
   sides summed in role order.

The `ORDER BY` is the load-bearing half. Without it a three-role project's
finish would depend on the query planner, and a plan could change the day it
ends because SQLite chose a different index.

### D6 — Role order is a column, because the seed order is not readable

The roadmap left the choice open: `role.position`, or infer the order the
rows were seeded in. The schema comment on `RoleRepository.listByProject` says
role order is not a contract yet and that "`role.position` arrives with the
schedule change that needs one".

It is not merely uncontracted, it is already wrong. `SELECT id, project_id,
name FROM role WHERE project_id = ?` plans as `SEARCH role USING INDEX
role_project_name (project_id=?)` and returns rows in **name** order — observed
against `bun:sqlite` directly. Today's `Dev, QA` looks like insertion order by
the coincidence that `D` sorts before `Q`; a project that adds `Analysis`
tomorrow gets it back first, and its estimates would run before the dev work.

So: an additive `position integer NOT NULL DEFAULT 0`, backfilled from `rowid`
so existing projects keep the order they were seeded in, every read ordered by
it, and new roles appended at `max + 10`. The default is not decoration —
during a swap the outgoing release inserts roles with no `position` column in
its `INSERT`, and without a default that insert fails against the migrated
file.

## Risks / Trade-offs

- **The identity claim is only as good as its oracle.** Three run: the whole
  existing fixture suite, unchanged, through the new planner; a randomised
  differential against the previous engine, copied verbatim into the test as
  the oracle; and a captured live response from a real project, asserted field
  by field. All three can be made red by perturbing the engine, and were.
- **Slices are computed for every project on every read**, including projects
  with no assignees that will never need them. It is one map entry per leaf per
  role rather than per leaf; the hundred-branch fixture still schedules 2,000
  leaves well inside its budget.
- **`ScheduleResult.slices` has no reader outside the planner and its tests**
  until S2. It is the engine's own output rather than a hook left for later —
  the projection is derived from it, and deleting it would mean deriving the
  row's numbers from something that no longer exists.
- **A project with no roles at all** — reachable now that roles can be removed
  — gets one role-less slice per leaf, so the plan still schedules instead of
  losing every row. The alternative, throwing, would take a whole project off
  the screen for a state a person can reach with two clicks.
