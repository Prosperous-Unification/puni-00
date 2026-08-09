# A project's roles can be added, renamed and removed

## Why

The schema was built for per-project roles and never given a write path.
`schema.ts` says so out loud: "there is no write path for a role today beyond
creating the project". Every project therefore has exactly the two roles the
seed wrote, `Dev` and `QA`, for ever. Dany's P1 ask is that phases are
configurable per project, and the estimate groups follow.

## What Changes

**`/api/projects/:id/roles`: add, rename, remove**

- Names are unique within a project, enforced by the index rather than by
  asking first: two people adding `Design` at once both pass a
  check-then-insert. A second one is `taken`, a 409.
- Removal **refuses by default** and says what would be lost: how many
  estimates, how many explicit assignments, and **which work items would change
  their assumed assignee**. With exactly one assignment a work item's assumed
  assignee is derived, so removing a role can silently promote somebody to
  covering every phase, or take the assumption away. Naming those work items is
  what makes the confirmation informed. `cascade=true` on a second, explicit
  call removes it.
- A role nothing points at is removed without a confirmation: there is nothing
  to be warned about.

**One transaction, and revisions as the guard**

`estimate.role_id` has no cascade, so a bare role delete hits the foreign key
and answers 500 today. The removal deletes the estimates explicitly, in the
same transaction as the cascade-covered assignments, the role row, the
project's revision bump and a revision bump on **every affected work item** —
so a stale journal precondition refuses instead of undoing against a plan whose
phases have changed. An estimate written between the count and the confirmed
removal is deleted by that transaction; it is never orphaned and never a 500.

**Typed durable role events**

`role_added`, `role_renamed` and `role_removed` go through the sequencer and
the replay buffer after the transaction commits, so a client that reconnects
replays them and re-reads the project.

## Non-Goals

- **No UI.** The phases dialog is its own change, built once in shadcn.
- **Not journalled**, like the project's start date. Removing a role is not
  undoable; the revision bumps are what protect the entries already in the
  stack.
- **No role order** and no migration. `role.position` arrives with the schedule
  change that needs it.
