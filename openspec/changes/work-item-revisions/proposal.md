# A work item can say whether it has changed

## Why

Nothing in this tool can tell whether an entity moved between a read and a
write. Every mutation is last-write-wins against whatever it finds, so two
people editing the same row lose one of the two edits silently — no refusal, no
banner, nothing on either screen to say it happened.

Two reviewers, independently, named this the minimum collaborative primitive
and both reached it from the same place: **undo**. An undo is a write computed
from a state that has already been read, so an undo without this fact is the
worst version of the problem — it does not overwrite a newer edit by accident,
it overwrites it by design, restoring a value nobody currently on the plan
asked for.

The consumers are named and neither is in this change:

- **Conditional undo** — reverse a change only if the entity has not moved
  since, and say so plainly when it has.
- **Write preconditions** — a client that holds a row may ask for its edit to
  land only against the row it read.

This change records the fact and nothing else. Recording it separately is
deliberate: the bumps have to be exhaustive across every write path before any
check can rest on them, and a precondition resting on a counter that some
writes forget to move is worse than no precondition at all — it reports safety
it does not have.

## What Changes

- `work_item.revision` and `project.revision`, integers starting at 0, additive
  with a `down.sql`.
- Every write path bumps the entity it changed, **including writes to that
  entity's satellites**: estimates, assignments and dependencies move the work
  items they hang off; a dependency moves both its ends.
- Bumps are `revision = revision + 1` in the same statement or transaction as
  the write, never a value this process worked out.
- The tree read reports each work item's `revision` and the project's; fe-01
  carries both on the wire.

## Non-Goals

- **No enforcement.** No route accepts an expected revision, nothing is refused
  for a stale one, and nothing on screen changes.
- **No undo.** This is its prerequisite.
- **Not a version of the tree.** A revision covers one entity's own stored
  fields and its satellites. It does not cover the number derived for a work
  item, which changes for rows nobody wrote to on any structural edit — a
  counter that followed it would move project-wide and be useless as a
  precondition.
- **No history.** How many times something changed, not what it was.
