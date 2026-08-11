# design — `dep-waits-on-first-role`

## D1 — The anchor is the first slice in role order, not a flagged role

Two readings of "030 needs 020's dev" were offered: the first role in the
project's role order, or a per-project handoff flag seeded to Dev. Dany chose
first-in-order (2026-08-11). Consequence, stated rather than hidden: a project
that reorders its roles reorders what every dependency waits on. That is the
accepted semantics, not a hazard to guard against — role order is already "the
order the work runs in" everywhere else in the engine.

A predecessor whose first slice is unestimated has a zero-length anchor: the
dependency clears the moment the predecessor's own predecessors do. That is
the same zero-length rule slices already follow, applied consistently, and it
is specced as a scenario so it is a decision rather than an accident.

## D2 — Successor-side attachment is unchanged

The archived `schedule-on-item-role` D2 showed why the successor side must be
the first slice plain, never the first _estimated_ one: an unestimated `Dev`
left without a predecessor is scheduled at day zero and the projection reports
the row starting before the thing it waits for. Nothing in this change touches
that argument; only the predecessor side moves.

## D3 — Parent expansion keeps its shape

An edge on a parent still expands to every leaf pair; each expanded edge then
applies the new rule: every predecessor leaf's **anchor** finishes before every
successor leaf's first slice starts. "The whole of 010 before 020" becomes
"all of 010's first-role work before any of 020" — the reading Dany's own
scheduler used, extended to branches, which it never had.

## D4 — Cycles remain a property of the leaf graph

The old argument was "edges only touch an item's ends". The new edges touch
first slices on both sides — still only slices at an item's boundary, and the
intra-item chains are still private, forward-only paths within one item. Any
cycle among slice nodes must therefore cross items only along expanded edges,
and projecting it item-by-item yields a cycle in the leaf graph — which
`expandToLeaves` + `hasCycle` at the write path already refuse. The write path
is untouched.

## D5 — The item-anchored arithmetic survives

The forward pass anchors every slice at `base + offsets[i]`, justified by "no
slice but the first has an external predecessor". That invariant is preserved:
this change moves where external edges _leave_, not where they _arrive_ — an
outgoing edge imposes no floor on the slice it leaves from. What changes is
the old corollary "only the last slice has an external successor"; the
backward pass (`lateTimes`) never assumed it — it walks the adjacency as
built — so late starts, float and `critical` follow the new edges with no
further change. A predecessor's QA can now be non-critical while its Dev is
critical, which is exactly the point.

## D6 — The arrow anchor is selected in fe, not added to the wire

The payload already carries every placed slice (id, workItemId, start,
finish), the full row set, and the roles in engine order. Choosing the anchor
is _selection_ over those numbers — the predecessor's first slice; for a
parent, the latest-finishing anchor among its leaves — not arithmetic, so the
"engine's numbers verbatim" rule holds. Adding `anchorFinish` to the wire
instead was considered and dropped: it duplicates onto the payload a fact the
payload already determines, and would touch validators, the gateway replay
path and the captured fixture for no second reader.

`GanttDependencyArrow.fromStart`/`fromFinish` become the anchor's span; the
calendar reading of a zero-length span (`fromStart === fromFinish`) already
exists and now earns its keep — an unestimated anchor draws from its own
start, not the end of the workday before it.

## D7 — What the oracle still proves

`schedule-identity.test.ts`'s oracle is the pre-slice engine; its value was
"the refactor moved nothing". This change moves plans _on purpose_, so parity
narrows to where the two rules coincide: no dependencies (nothing to anchor),
or single-role plans (first slice is last slice). Multi-role plans with
dependencies get direct assertions of the new rule instead — including the
property the old rule could never satisfy: growing a predecessor's _later_
slices never moves its successor.
