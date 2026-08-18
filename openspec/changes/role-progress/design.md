# design — `role-progress`

Eight decisions. Each names what it refuses, because in every case the refused
option is the one that reads as obvious from outside.

The task this was built to fixed most of the shape in advance. Where the evidence
in the tree contradicted the brief, P6 is the one place it did, and it is argued
there rather than quietly implemented.

## P1. Three states, and only two of them are stored

`in_progress` and `done` are rows. **Not started is the absence of a row.**

Refused: a stored `not_started`. It would be a second spelling of "nobody has
said" — no row, and a row saying nothing — and every reader would have to handle
both. The rule is `project_team_capacity`'s (`schema.ts`), `actual`'s, and the
export's, which has said since it was written that an empty cell means nobody
typed it and never zero.

The corollary is what the API had to be shaped around: **there is no
`set_progress` carrying `not_started`**. The way to say it is `DELETE`, the
command is `clear_progress`, and the route refuses the value with
`invalid_progress` alongside the nonsense. Accepting it would have given two ways
to write one fact through one door.

## P2. No `blocked`, no `cancelled`

Both are real states of real work and both are refused.

**Each extra state is a question the engine must answer the day it starts reading
this table** — what a blocked predecessor does to its successors' floor, whether a
cancelled role's estimate leaves the plan's totals, whether a cancelled item's
children are cancelled. The engine is not reading this yet, so those answers
would be invented now and discovered wrong later, on rows real plans already
hold.

Three states can be added to. A fourth shipped today is a meaning nobody has
agreed, stored on production data, that the next change has to interpret rather
than define.

**Enforced rather than trusted.** Drizzle's `text(..., {enum})` is compile-time
only, so the closed set is a `CHECK` on the column. It is safe across a
blue/green swap because the outgoing release does not know this table exists and
never writes to it. Watched red: the constraint widened to include `'blocked'`,
and `refuses a state outside the three the design has` fails with the row written
instead of rejected.

## P3. Per role, at the actual's grain — and the item's state is derived

Refused: a state per work item. It is what a status report asks for and it is one
number a person types once.

It is refused because **actuals are per role**. A per-item state beside per-role
actuals is a second source of truth about one subject, and the disagreement it
produces is the exact sentence this feature exists to prevent somebody writing by
accident: _the item says done and a role on it has recorded nothing_. Every read
path in the tool already groups by (item, role) — the estimate's key, the slice
key, the export's column group, the roll-up — and this is the fourth thing keyed
that way rather than the first thing keyed differently.

**The item's state is folded on every read and never stored**, for the reason
every derived figure in this tool is derived: two spellings of one fact is what
the codebase refuses everywhere.

## P4. What an item is when its roles disagree: **in progress**

The rule is one line — `agree(a, b)` is `a` when they are equal and
`in_progress` otherwise — and it has three consequences worth stating separately.

**`done` is unanimous.** An item is finished when every role with work on it says
so. Dev finished and QA silent is an unfinished item. The alternative — done as
soon as any role says done — would let a plan report finished work that nobody
has tested, which is precisely the claim a completion state exists to stop
somebody making by accident.

**`not_started` is unanimous too.** One role saying anything at all puts the item
in progress, which is the only reading that is true of every plan it can arise
on.

**Which roles count is the load-bearing part.** The fold runs over _the roles
that have work on the row_ — an estimate, a recorded day, or a statement — and a
role in that set that nobody has spoken about reads as `not_started`. Without
that, a leaf where Dev says done and QA holds an estimate and has said nothing
folds to `{dev: done}` and reads as **finished**, because the only voice in the
fold agreed with itself.

The visible consequence, and it looks like an inconsistency: a branch can report
`progress: {dev: done}` and `state: in_progress` at once. Both are true — Dev has
finished everywhere Dev has work, and the branch has not finished because one of
its rows has never been spoken about. See P6.

## P5. What `done` makes true: an actual on a done role is final

Stated as a rule now, before any row exists under it, because the **next** change
is the one where the engine consumes this: finished roles freeze, and in-progress
roles get `remaining = max(0, estimate − actual)`.

So: **an actual on a role marked `done` is the whole of what that role spent**,
not a running count. Recording more days afterwards restates that total rather
than adding to it. A role marked `done` with no actual at all means "finished,
days unknown" — the estimate is what the engine will have to use, and that is a
decision for that change, not this one.

**Not enforced as a refusal**, deliberately. Refusing `setActual` on a done role
would make correcting a typo require un-finishing the work, and it would tie two
write paths together for a rule that is about interpretation rather than about
integrity. The rule lives in the schema comment, in the route's description, in
this file and in the spec delta — four places the next change reads before it
writes.

## P6. The item state folds over **children**, not over the parent's role map

This is the one place the implementation deviates from the obvious reading, and
it was found by a red test rather than by argument.

`foldByRole` — the traversal `rollUp` and `rollUpActuals` share — only combines
the roles its children actually hold. A child with no estimate, no recorded day
and nothing said contributes **no key at all**. So a branch of two whose first
child is finished and whose second is empty folds to `{dev: done}`, and reading
the branch's state off that map answers `done`: a claim about the empty child
that nobody made, and the same failure P4 refuses one level down.

So the per-role map is folded through `foldByRole` (for the payload) and the item
state is folded **recursively over the children** (for the reading). A leaf's
state is its own role map; a parent's is `agree` across its children's states.
`agree` is associative, commutative and idempotent, so no traversal of the tree
changes what a branch reads as.

Refused: filling every leaf's map with every role in the project so the per-role
fold sees the empty child. That would make `progress` on the wire carry
`not_started` for roles nobody has ever mentioned — a payload asserting silence
about work that does not exist — and it would break P1's single spelling on the
one surface a client actually reads.

## P7. `role_id` does not cascade; `work_item_id` does

Copied deliberately from `estimate` and `actual`, and the asymmetry is argued on
`role` in `schema.ts`.

**`role_id`, no cascade.** A statement is somebody's, about their own work, so a
role removal must _count_ it before taking it. The missing cascade is what makes
a role delete that forgot to say so fail loudly instead of quietly turning
finished work back into work nobody has started. `RoleRepository.remove` deletes
these rows explicitly inside its transaction, and `RoleUsageRows` gains a
`progress` count — so an unconfirmed removal of a role holding **only** a
statement is refused, which is the case that makes the count load-bearing rather
than decorative.

**`work_item_id`, cascade.** Blue and green share one SQLite file while green
migrates; the outgoing release knows nothing about this table and its plain
`DELETE FROM work_item` must not hit a constraint it cannot see. The same
argument `dependency` and `actual` make.

## P8. Statements follow the structure, or they lie silently

The moves and what each owes, one table over from `actual-days`' D6:

| move                        | actuals                    | statements                                       |
| --------------------------- | -------------------------- | ------------------------------------------------ |
| leaf gains its first child  | handed **down**            | the same, or the row is invisible and comes back |
| parent loses its last child | handed **up** as the total | handed **up** as the **fold**                    |
| branch deleted, then undone | restored with the branch   | restored with the branch                         |
| branch duplicated           | **not** copied             | **not** copied                                   |

Three of the four are the actuals' argument in a stronger tense. The hand-down:
a `done` left on a row that has just gained a child is not merely invisible, it
is a claim that reappears the day somebody deletes the child, over work the plan
has moved on from. The duplicate: a copied `done` hands the plan a branch that
reports itself finished the moment it appears.

The hand-up is the one that differs in kind. What comes up is the branch's
**folded reading** — `agree` across the rows below, not the rows themselves —
because a deleted child that is itself a parent holds no rows of its own.
`not_started` is skipped rather than written, per P1: the parent inherits the
estimates and the actuals beside it, so the roles nobody spoke about are still
work on the row and still keep it in progress. The reading survives the delete
without a row ever spelling silence.

## What this change does not decide

- **Whether the engine may read this.** P5 fixes what `done` means; the change
  that acts on it re-baselines `live-plan-identity.test.ts` and the capacity
  oracle, and that cost belongs to that decision.
- **Actual start and finish dates.** A separate change: a stored date that
  disagrees with the scheduled one needs a decision about which the chart draws.
- **What a face does with any of this.** H3.
- **Whether a snapshot freezes the state.** It should, and the column is not in
  the brief's `plan_snapshot_figure` because the brief predates this table. H4
  owes it one more column.
