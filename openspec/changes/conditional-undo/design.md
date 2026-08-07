## Context

`work-item-revisions` gave every work item a counter that moves on every write
that changes what it means, including writes to its estimates, assignments and
dependencies. Nothing checked it. This change is the consumer it was built for.

The shape was prescribed by two reviewers and is not re-argued here: an undo is
a **compensating command** that applies only when every entity the original
command touched still reads the revision that command left it at. What follows
is the part they did not specify.

## Goals / Non-Goals

**Goals:**

- One implementation of "apply a command", used by undo and by redo.
- A refusal that names what stood in the way, on screen.
- Nothing silently lost — not the reader's change, not somebody else's.

**Non-Goals:**

- No client-side stack, no optimistic undo, no offline queue.
- No undo of project-level fields. Rare, visible, and half the surface.

## Decisions

### D1 — The journal write is on the mutation's success path

The change is applied, broadcast, and **then** journalled, in that order, with
no catch around the journal write. A journal write that throws therefore fails
the request for a change that has already happened.

That is the honest option, and the alternatives are worse. Swallowing it is
log-and-continue for a required operation, which R5 forbids outright and whose
symptom is an undo key that quietly skips one change — the least debuggable
failure this feature could have. Journalling before the broadcast would trade an
accurate error for a project full of readers sitting on a tree that has moved.

The consequence is stated rather than hidden: the actor sees a failed request
for a change that landed, refetches, and finds it applied. It is rare (a
`command_journal` insert on the same connection that just committed the
mutation) and it is loud.

### D2 — Undo and redo append nothing

An entry has two directions stored on it: `payload.forward` is what a redo
applies, `inverse` is what an undo applies. Undoing flips `undone` to 1 and
rewrites the entry's preconditions; redoing flips it back.

Journalling an undo as a new forward command would make the undo itself
undoable, and pressing the key twice would toggle one change back and forth
forever instead of walking two changes back. It would also double the stack's
depth consumption for no reader.

A forward mutation deletes this account's undone entries for the project, in the
same transaction as the append. A redo branch describes a future computed
against a plan that has since moved on.

### D3 — Preconditions hold two revision maps, not one

`expected` is what the brief prescribes: the post-command revisions of every
entity touched. `from` is the pre-command revisions of the same entities, and it
exists because **an undo is itself a write**.

Without it, only the first press of the key ever works. Undoing a rename bumps
the row, so the entry below — the rename before it — is checking against a
number this account's own undo has just walked past, and refuses for a reason no
reader could accept.

`from` is what tells that apart from a real conflict. After applying entry E,
the entity holds exactly what the entry below left it holding **if and only if**
`E.from` equals what that entry recorded as `expected` — nobody wrote in
between. Where it matches, the neighbour is re-stamped to the revision the
application produced and stays usable. Where somebody else did write in between,
it does not match, nothing is re-stamped, and that entry refuses when it is
reached. Both halves are tested, and both were watched failing (`verify.md`).

Only the side being walked toward is re-stamped: undoing carries the live
entries below it, redoing carries the undone ones above.

### D4 — Check-then-apply is not atomic, and does not need to be

The precondition check and the application are two steps inside one request,
against one `bun:sqlite` connection. A concurrent mutation could land between
them.

That is the same race any two mutations already have, and the revision machinery
is what makes the outcome consistent rather than the ordering. If a stranger's
write lands between the check and the apply, the undo applies on top of it — and
the undo is an ordinary mutation that bumps the revision, so the stranger's
client refetches and sees a tree that has one more change on it. Nothing is
lost that a plain "two people edited the same row" would not have lost, and the
window is microseconds of in-process synchronous SQLite rather than a network
round trip.

Wrapping the whole thing in one transaction was considered and rejected: an
inverse goes through the service, which broadcasts and reads the tree, and a
transaction spanning a broadcast would hold a write lock across an HTTP call to
gw-01. Blue and green share the file. That trade is not worth closing a window
this small.

Stated rather than hand-waved, because the alternative is a claim about
atomicity that no test in this repo can observe: `bun:sqlite` is synchronous and
in-process, so nothing here can interleave two requests to demonstrate either
version.

### D5 — A restored row comes back at revision 0

Restoring a deleted branch inserts rows with **the ids they had**. They start
again at 0, exactly as a created or duplicated row does.

The alternative — resuming the count the row had when it was deleted — is
defensible, because the restored content is byte-identical. It was rejected for
what it does to everything else holding a number: a client that read the row at
4, watched it vanish and come back, would be told nothing had changed.

The consequence is deliberate and is the safe direction. A journal entry below
the delete that expected one of those rows at 4 now refuses, and says so. An
undo that cannot be sure is an undo that does not run.

### D6 — Ids are original, and a collision refuses

`restore_subtree` writes the ids the branch had. Nothing in this product
recreates an id, so a collision means something else is using one — and the
answer is a refusal, not a remap. A restore that invented fresh ids would leave
every reference to the branch, journalled and otherwise, aimed at rows that no
longer exist. Watched failing both ways in `verify.md`.

### D7 — Two guards a revision cannot give

**A subtree that has been built on.** Adding a child writes a row of its own and
moves nothing on the parent, so a created row somebody has since built under
still reads at the revision it was created with. `delete_subtree` therefore
carries `expectedSubtree` — every id that was under the root when the command
ran — and refuses when the shape has changed.

**A placement whose neighbour is gone.** `placeAfter` throws on a sibling that
is not in the group, which is right for a caller that made an id up and wrong
for a row somebody deleted while the entry sat on the stack. The applier checks
membership first and refuses as stale instead of answering 500.

### D8 — External dependencies are best-effort, and are not preconditions

An edge with one end outside a deleted branch is restored only if it still can
be: the far end must exist and the ordinary `canDepend` guards must pass. When
one cannot, the branch comes back **without** it and the response says how many
and why.

The far ends are deliberately left out of the preconditions. Making them
preconditions would turn "somebody renamed a neighbour" into a refusal to
restore a whole branch, for a reason that has nothing to do with the branch —
and it would make the partial path unreachable, which is a check that cannot
fail. The deleted rows themselves are absent from the preconditions for a
different reason: nobody can hold a revision for a row that is gone, and D6 is
what guards their absence.

### D9 — The undo state rides on the tree read

No `GET /undo-state`. The controller answers `undoable` and `redoable` beside
the tree, from a separate service call so `tree` itself stays account-free — the
broadcast reuses that read and has nobody to answer for.

The tree is already reread after every change this client makes and every event
from anybody else, which is exactly when the answer can have moved. A second
endpoint would be a second round trip at the same moments.

### D10 — The chord is never handled inside an editable element

Not "handled unless there is an uncommitted draft" — never, period. A browser's
own undo for text somebody is typing is better than anything this table could
offer for a half-typed word, and a shortcut that took Cmd+Z from an input would
lose keystrokes that never reached be-01 at all. Blur first; the table's undo
walks back through changes that have landed.

### D11 — `seq` is assigned by SQLite, inside the insert

`(select coalesce(max(seq), 0) + 1 from command_journal where …)` in the
`INSERT`'s own `VALUES`, the same rule the revision bumps follow. Two be-01
processes share the file during a swap; a maximum read into this process and
written back would let both choose the same number, and the unique index on
`(project_id, user_id, seq)` would refuse the second insert — failing an edit
that had already been applied. SQLite serialises writers, so no two inserts are
ever both choosing.

## Risks / Trade-offs

- **Two tabs of one account share one stack.** Accepted. The alternative is a
  per-tab identity nothing else in this product has, and the failure mode is
  mild: the other tab's Cmd+Z reverses something it did not do, and says what it
  reversed.
- **A no-op write invalidates the entries below it.** Setting an estimate to the
  value it already had bumps the revision — `work-item-revisions` made satellite
  bumps unconditional on purpose — so it breaks the chain for that row. The
  conservative direction, and the alternative is the read-then-write that column
  exists to avoid.
- **50 is a judgement.** Deep enough for a working session, shallow enough that
  the table does not grow without bound on a plan somebody edits every day.
- **Project-level fields are not undoable.** Named in the proposal, not hidden.
