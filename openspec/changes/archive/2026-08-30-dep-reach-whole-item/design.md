# design — `dep-reach-whole-item`

## D1 — the reach is a setting, and `anchorSliceOf` becomes one of its arms

The August rule is not deleted. `dep-waits-on-first-role` argued it carefully
from a real convention, its identity tests exist, and Dany chose to keep it
reachable. So the engine grows one function:

```
reachedSliceOf(reach, predecessorLeaf, slices)
  'whole-item'   → the leaf's last slice in step order
  'anchor-slice' → the leaf's first estimated slice, else its finish   (unchanged)
```

and the edge expansion calls it instead of `anchorSliceOf` directly. Everything
downstream — parent expansion to leaves, successor-side attachment to the first
slice plain, floors, cycles, the item-anchored arithmetic — takes the answer and
does not know which arm produced it.

**Why not a boolean.** `waitsOnWholeItem: true` reads fine until the per-edge
model arrives and a third answer is needed. A named enum with two members takes
a third without every call site becoming a negation.

## D2 — the column is additive and the default is a real change to every plan

```sql
ALTER TABLE project ADD COLUMN dep_reach TEXT NOT NULL DEFAULT 'whole-item';
```

Additive, so an outgoing colour mid-swap keeps reading `project` fine
(`AGENTS.md`, Migrations). `down.sql` drops the column, which is destructive by
definition and is why it lives in its own file.

The default applies to every existing row, so **every plan with a multi-step
predecessor moves on this release**. This is stated in the spec as a requirement
rather than left as a side effect, because it is the change: a project that
wants the August behaviour asks for it.

`dep-waits-on-first-role`'s identity oracle ("no plan that exists today
changes") survives only where the two rules agree — plans with no dependencies
and single-step plans, where the first slice is the last. The multi-step
dependency fixtures are re-derived under `whole-item` and the old figures are
kept as the `anchor-slice` cases, which is what makes the setting's second arm
tested rather than merely present.

## D3 — the read is per project, at the same place the ladder is read

The scheduler already loads project-level configuration (capacity, the priority
ladder) before placing slices. `dep_reach` joins that read. It is **not** a
parameter fe-01 sends: a client-supplied scheduling rule is a rule two clients
can disagree about, and the schedule is the server's answer.

An unrecognised stored value — a hand-edited database, a value from a future
release read by an older one mid-swap — **throws**. It is malformed trusted
data, and R5's rule is that unknown is not OK. Defaulting it to `whole-item`
would schedule a plan by a rule nobody chose and say nothing.

## D4 — the arrow leaves what the reach names

`gantt-geometry.ts` currently routes an arrow from the predecessor's anchor,
which `dep-waits-on-first-role` introduced so that an arrow would not appear to
point backwards in time. Under `whole-item` that reason is gone — the
predecessor's last slice _is_ its finish — so the arrow leaves the projection's
finish, as it did before August.

One origin function, keyed on the same reach value the engine used, so the
drawing cannot disagree with the schedule. The failure this prevents is the one
worth naming: an arrow drawn from the anchor over a schedule computed
whole-item points at a successor that starts much later, and reads as slack that
is not there.

## D5 — the setting's UI is a section of the settings modal, not a new dialog

Two radio options with a sentence each, in `project-config-modal`'s steps
section — it is a statement about how steps chain. This change is therefore
**ordered after** `project-config-modal`; run before it, it would add a fourth
toolbar dialog that change then deletes.

## D6 — why this is an ADR

It reverses a decision recorded three weeks ago, after seeing it drawn, and it
turns a system-wide constant into a project's choice. Hard to reverse (a stored
per-project value), surprising (the August reasoning is still sound and still in
the repo), and it had a real alternative (keep the anchor rule; wait for the
per-edge model). That is the ADR bar in `AGENTS.md` and this clears it.
