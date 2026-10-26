## Why

The undo journal was keyed by (project, account). A machine or consent credential is pinned to an
agent person but acts as its human's account, and undo and redo are generated MCP tools. So a
consented agent's undo popped its human's browser edits, two agents' keys on one account undid
each other's edits, an agent's edit cleared its human's redo, and a busy agent evicted its human's
history.

## What Changes

**One stack per acting person.** Supersedes the archived conditional-undo requirement "The stack
is one account's own, on the server" (per account per project).

- From: one undo stack per (project, account).
- To: one per (project, account, acting person): the agent person of a machine or consent
  credential, none otherwise (`actingPersonOf`, exhaustive over the credential kind). Append, the
  redo clear, the 50-deep prune, the stack read, the flip and the undo state read that stack alone.

**Migration `20261026120000_add_command_journal_person`**

- Nullable `person_id → person(id) ON DELETE CASCADE`, indexes `(project_id, user_id, person_id,
seq)` and `(person_id)`. Additive.
- `down.sql` deletes every agent entry, then drops the column, so the automatic deploy abort needs
  no manual step. Undo entries are disposable (`plan_event` keeps the history), and dropping the
  column without the delete would move agent entries onto their humans' stacks.

## Non-Goals

- Resolving an upstream pair to a person through the operator link (the retired M2M path).
- Per-credential stacks. The key is the person: two concurrent consents or two keys pinned to one
  agent person share its stack and can undo, or clear the redo of, each other's edits.
- Re-attributing old entries: agent entries journalled before the migration stay on their human's
  stack until they are undone, cleared or pruned away.
- The plan history, which stays per project.

## Risks

- **Mid-swap.** The outgoing colour writes `person_id` NULL, so an agent edit it journals lands on
  its human's stack. It also reads, clears the redo of and prunes by (project, account) alone:
  until it stops, its undo can reach an agent entry, its append clears agents' redo, and its
  `max(seq) - 49` prune, counting agents' rows, can delete the human's own older entries
  (pinned in `command-journal.db.test.ts`). `seq` stays per (project, account), so the two
  colours never collide on the unique index.
- **Rollback** discards agents' undo stacks; their humans' stacks are untouched.
