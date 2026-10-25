## Why

The undo journal is keyed by (project, account). A machine or consent credential is pinned to an
agent person but acts as its human's account (`principal.ts`, `credentialPinOf`), and undo and
redo are generated MCP tools. So a consented agent's undo pops its own human's browser edits, two
API keys bound to one account undo each other's edits, an agent's edit clears its human's redo
branch, and a busy agent's fifty edits evict its human's history.

## What Changes

**One stack per acting person**

- From: one undo stack per (project, account).
- To: one per (project, account, acting person). The acting person is the agent person a machine
  or consent credential is pinned to, and none for an account acting as itself
  (`actingPersonOf`). Append, the redo-branch clear, the fifty-deep prune, the stack read, the
  undo/redo flip and the undoable/redoable answer all read that stack alone.

**Migration `20261026120000_add_command_journal_person`**

- A nullable `command_journal.person_id` referencing `person(id)` with `ON DELETE CASCADE`.
  Additive: every existing entry is its account's own.
- `down.sql` refuses while any entry has a person, naming the count and the pinned completion
  statement `DELETE FROM command_journal WHERE person_id IS NOT NULL`.

## Non-Goals

- Resolving an upstream credential pair to a person through the operator link: the retired M2M
  path; an upstream pair acts as its account, as lease renewal already reads it.
- Separate stacks for two credentials pinned to the same person: they share that person's stack,
  so a rotated key keeps its history.
- The plan history, which stays per project.

## Constraints

- Blue and green share SQLite mid-swap. The outgoing colour writes `person_id` NULL, so an agent
  edit it journals lands on its human's stack, and its pair-keyed reads, clear and prune can still
  reach an agent entry until it stops. The `seq` stays numbered by (project, account), so the two
  colours never collide on the unique index.
