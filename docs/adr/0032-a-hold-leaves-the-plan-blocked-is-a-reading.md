# A hold leaves the plan; blocked is a reading

**Status:** accepted, 2026-09-28 (WBS 010.4.14). Change:
`openspec/changes/add-work-item-statuses`.

A planner can put a leaf **on hold** or mark it **blocked**. We store both as one nullable
`work_item.hold` column beside a nullable `work_item.readiness`, never as a stored row status
and never in `step_progress`. **On hold** removes the held leaves, and every ancestor whose
leaves are all held, from the schedule input before either engine runs: their slices, the
legacy and typed dependencies touching them, and their not-before and deadline entries.
**Blocked** changes nothing the engines read: a blocked leaf keeps its duration, person,
pools, floors and successors, and its bar is where the forecast puts it. A successor of held or
blocked work reads **blocked by proxy**, derived from the full dependency graph on every read.

Removing input rather than teaching `schedule()` and the solver a new kind of node keeps the
scheduler contract, the solver wire and Python unchanged; only the canonical input hash moves,
and only for plans holding something. A resumed row returns to what it read before, because the
hold sits beside readiness and progress rather than replacing them.

## Considered Options

- **One `stated_status` column.** Rejected: putting a ready row on hold would erase its
  readiness, so resuming could only return it to unknown.
- **A hold table.** Rejected: a hold has no identity to edit apart from its leaf.
- **Holds as a third `step_progress` state.** Rejected: that table's CHECK cannot widen without
  a rebuild, and a hold is not a step's statement.
- **Blocked pins its last placement.** Rejected: a stored date that is neither constraint nor
  fact, stale the moment a predecessor slips (ADR 0022, ADR 0024).
- **Blocked keeps nodes but drops its person and pool slots.** Rejected: other work flows into
  its slot, so it does not keep its place.
- **Held leaves as zero-duration nodes.** Rejected: they would still transmit precedence.
- **Cascading holds to successors.** Rejected: the successors must stay visible and scheduled.
- **An inherited parent hold.** Rejected: a third inheritance rule and two spellings of one
  hold; a parent write acts on every leaf beneath instead.

## Consequences

- An older image would schedule held work as if nothing were held, so rollback and the swap
  refuse code that cannot read the stored hold values.
- A held row has no schedule and no dates on the wire; a parent's bracket spans its unheld
  leaves only.
- Per-step-node holds (010.4.13.3) will slot in as row hold or node hold without changing this.
