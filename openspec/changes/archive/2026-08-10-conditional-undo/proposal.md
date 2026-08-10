# Undo that refuses rather than overwrites

## Why

There is no undo. A mistyped rename, a delete on the wrong row, a branch
duplicated by accident — all of them are permanent, and the delete takes the
estimates and assignees with it.

Both reviewers demolished the obvious version. An inverse-operation stack
applied blind is not last-writer-wins by accident but **by design**: it puts
back a value nobody currently on the plan asked for, computed from a state that
was read minutes ago, on a tool where somebody else is editing the same rows
live. Their worked examples all had the same shape — A edits, B edits, A
undoes, B's edit is gone with nothing on either screen saying so.

They prescribed the same answer: a **conditional compensating command**. The
undo applies only if every entity the original command touched still holds the
revision that command left it with. Otherwise it refuses, out loud, naming what
changed. `work-item-revisions` shipped the counter this rests on for exactly
this consumer.

## What Changes

- **A command journal** — `command_journal`, per account per project, the last
  50 commands, holding what happened, the compensating command that reverses it,
  and the post-command revisions of everything it touched.
- **`POST /api/projects/:id/undo` and `/redo`.** Success answers what it undid.
  409 `nothing_to_undo` for an empty stack; 409 `stale_undo` naming the row that
  moved, after which that entry is **discarded** — it can never apply again and
  keeping it would jam the stack.
- **Undoable:** field patches, estimate set and clear, assignment set and clear,
  dependency add and remove, move, create, delete, freeze, unfreeze, duplicate.
- **Redo is conditional the same way**, and any forward change of this account's
  clears their redo branch for that project.
- **Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z**, never inside a box being typed in — there
  undo is the browser's. Toolbar Undo/Redo buttons, greyed from the tree read.

## Non-Goals

- **Project rename, restriction, method and start date are not undoable.** They
  are rare, visible on screen, and excluding them halves the surface.
- No undo of somebody else's change: the stack is per account.
- No merge, no three-way resolution, no "undo anyway". A refusal is final.

## Constraints

- Migration additive with a `down.sql`; blue and green share one SQLite file.
- An inverse goes through the same service paths as any mutation, so revisions
  bump, broadcasts fire and the invariants hold.

## Capabilities

### New Capabilities

- none

### Modified Capabilities

- `wbs-domain`: a command can be reversed, on the condition that nothing it
  touched has moved.

## Domain Terms

- Command journal
- Compensating command
- Precondition
- Stale undo

## Decisions Recorded

`design.md` — the journal on the mutation's success path, check-then-apply
under concurrency, why undo entries are not journal entries themselves, and why
a restored row comes back at revision 0. No ADR: every one of them is reversible
inside this change.

## Impact

be-01 (`repository/command-journal.ts`, `repository/schema.ts`,
`service/compensating.ts`, `service/work-item.service.ts`,
`controller/work-item.controller.ts`, one migration), fe-01 (`wbs-api.ts`,
`wbs-table.tsx`, `keyboard-bindings.ts`). No deploy change.
