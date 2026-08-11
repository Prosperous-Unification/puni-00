# design — `dep-waits-on-first-role`

## D1 — The anchor is the first _estimated_ slice in role order

Two readings of "030 needs 020's dev" were offered: the first role in the
project's role order, or a per-project handoff flag seeded to Dev. Dany chose
first-in-order (2026-08-11). Consequence, stated rather than hidden: a project
that reorders its roles reorders what every dependency waits on. That is the
accepted semantics, not a hazard to guard against — role order is already "the
order the work runs in" everywhere else in the engine.

### What the first version got wrong, and why it is recorded here

The first implementation took the first slice **plain**. An independent probe
on 2026-08-11 showed what that costs, and the cost is not a corner:

`slicesOf` gives every leaf a slice for **every role the project lists**,
estimated or not. So in a project whose roles are `[Design, Dev, QA]` — and
`Design` is exactly the sort of role a project lists and a planner never
estimates per task — every leaf's first slice is an empty `Design`, every
anchor is zero days long, and **every dependency in the plan decides nothing**.
Probed: a three-item chain of four-day `Dev` work, which is fifteen calendar
days of plan, came back with all three rows starting on day zero.

That is not "a zero-length anchor clears immediately, applied consistently",
which is how the first version's design.md described it. It is the dependency
graph switching itself off for a whole class of ordinary project. The old text
called the case small; it was total. Recording it here rather than deleting it
is the point — the hazard is the **motivation** for the rule below, and a
design that only states its conclusion invites the next reader to re-derive
the first version.

### The rule

The anchor is the first slice in role order **somebody has estimated**. Dany's
words on being shown the probe: "first in list of project roles, then first
that is estimated". An unestimated role in front of the `Dev` is stepped over;
it never was the handoff anybody meant.

"Estimated" is `days !== null`, which is what `Scheduled.estimated` means
everywhere else in this engine, and what the wire's `estimated` flag carries
for the arrow selection in fe. An explicit **zero** therefore anchors: somebody
saying a role takes no time is a statement, and the engine takes the statement.
Nobody having said anything is the different fact, and it is the one the walk
steps over. Two predicates would be two rules to keep in step across the wire;
there is one.

Where **nothing** on the predecessor is estimated there is no estimated slice
to land on, and the anchor falls through to the work item's **finish**. For a
leaf nobody estimated at all that finish is its own start, so the edge imposes
exactly what the predecessor's own predecessors imposed — the degenerate case,
kept deliberate and specced as a scenario. It is also the only shape in which
the old inert-edge behaviour survives, and there it is correct: a work item
with no work in it genuinely holds nothing up beyond what holds _it_ up.

The counterexample is a regression test rather than a paragraph: `a chain does
not collapse because a project lists a role nobody estimated`
(`schedule-shapes.test.ts`), watched red against the first-slice rule, and the
same rule checked over the thousand-plan corpus in
`schedule-identity.test.ts`.

## D2 — Successor-side attachment is unchanged

The archived `schedule-on-item-role` D2 showed why the successor side must be
the first slice plain, never the first _estimated_ one: an unestimated `Dev`
left without a predecessor is scheduled at day zero and the projection reports
the row starting before the thing it waits for. Nothing in this change touches
that argument; only the predecessor side moves.

The two sides therefore read the estimate differently, and that asymmetry is
the design rather than an oversight. It follows from what each side is _for_.
An arriving edge is a **floor**: it must reach the earliest thing the row
could do, and the earliest thing is its first slice whether or not anybody has
put a number on it. A leaving edge names **the work that had to happen first**:
an empty slice is not work, so it cannot be the thing anybody was waiting for.
Same fact — an unestimated slice is zero days long — read for two different
questions, and the answers differ because the questions do.

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

Two consequences of that, inert today and on the wire, so they are named
rather than discovered later:

A slice behind its work item's anchor often has **no external successor at
all**, and `lateTimes` gives a node with no successors the project's finish.
So a predecessor's trailing roles take a `latestFinish` of the project end,
and the work item's projection — the max of its slices' — reports the same.
Nothing reads `latestFinish` today; the table shows slack and the red row, and
both are computed from `latestStart`, which is unaffected. The moment
something does read it, "this row could finish as late as the project does" is
the answer it will get for any row whose tail is genuinely free, and that
answer is correct rather than a bug to fix.

Second: `projectOntoWorkItems`'s `tiles` test — do a leaf's slices meet end to
end, early **and** late? — was written by `critical-snap` (#41) with the
non-tiling arm as the rare case, reached when a person pulled a work item
apart. Under the anchor rule the late times split with nobody assigned at all,
because the anchor's `latestFinish` is bounded by its successor while its
siblings run to the project end. The non-tiling arm is now ordinary. It is
correct as written — every slice's float is snapped before it gets there, and
the least of snapped numbers is one of them — but it is no longer an exception.

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
exists and now earns its keep — an anchor of no days draws from its own
start, not the end of the workday before it.

fe walks to the anchor the same way be-01 does, off the `estimated` flag the
payload already carries. That is one rule implemented twice, which is a real
cost, and the alternative — `anchorSliceId` on the wire — was weighed again
here and dropped again: it touches the validators, the gateway replay path and
the captured fixture to carry a fact the payload already determines. The two
implementations are held together by a test rather than by inspection (`an
arrow leaves the first estimated role, not the unestimated one in front of
it`), shaped like the engine's own probe.

The hover card moves with it. `predecessor` read "Waits for a dependency to
finish", which was true under the whole-item rule and is false under this one:
it now names the anchor. A card saying "to finish" beside an arrow leaving the
middle of the predecessor is the chart contradicting itself in the one place a
reader looks to resolve it.

## D7 — What the oracle still proves

`schedule-identity.test.ts`'s oracle is the pre-slice engine; its value was
"the refactor moved nothing". This change moves plans _on purpose_, so parity
narrows to where the two rules coincide: no dependencies (nothing to anchor),
or single-role plans (first slice is last slice). Multi-role plans with
dependencies get direct assertions of the new rule instead — including the
property the old rule could never satisfy: growing a predecessor's _later_
slices never moves its successor.

What the narrowing cost is paid back over the **same corpus**, not with fewer
plans. The thousand generated trees, floors and edge sets are the one thing in
the suite nothing else produces, and dropping the multi-role-with-edges runs
would have left them ungenerated rather than merely unproven. So the same
plans run again, checked against the new rule's own invariants instead of
against an engine that no longer agrees with it: every successor starts no
earlier than the latest anchor finish among its predecessors, no slice carries
negative float, and every leaf's projection spans its slices exactly. The
corpus half is asserted too — the run counts the edges whose predecessor's
anchor is _not_ its first slice, and fails if that is zero, because a green
run over plans the walk never fired on would prove nothing about the walk.
