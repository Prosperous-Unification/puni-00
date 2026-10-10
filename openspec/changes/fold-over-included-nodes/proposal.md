## Why

A leaf folds its status over "the steps it holds work for", so a blank, silent QA node does
not keep a leaf from reading `done` — which is how human steps hid as whole work items (WBS
020.10 Q7). The fix needs **participation** (a node `included` unless explicitly `skipped`),
which WBS 010.4.13.3 (`configure-project-step-workflows`) stores.

**BLOCKED** on 010.4.13.3, owned by another session (Codex, `integrate/board-after-spaces`).
Nothing in this change is started until participation is on `main`.

## What Changes

- A leaf's progress fold runs over its **included** nodes of **every** project step: `done` is
  unanimous over them; any `in_progress`, or a mix, reads `in_progress`; nothing said reads
  `unknown`. Skipped nodes are absent from the fold.
- A leaf keeps at least one included node: skipping the last is refused `409
last_included_node`.
- The node reading `skipped` is produced from stored participation.
- `verify.md` lists every leaf on the dev store whose status moves; rows marked `done` from the
  row menu do not move because the menu writes every node.
- CONTEXT's **Status** entry is rewritten and **Participation** is added, as the glossary delta
  defers them to this change.

## Non-Goals

Storing participation (010.4.13.3); a skipped node's schedule effect (010.4.13.3's zero-time bridge);
an all-skipped leaf reading `done`; changing the parent fold.

## Constraints

Depends on `configure-project-step-workflows` storing participation and on
`step-node-readings`. The MODIFIED requirement's heading lives in the unarchived
`add-work-item-statuses`; archive that change first or this one's archive cannot find it.
Readings on existing plans move; the moved list is a deliverable, not a
surprise. No migration of its own. Teams who leave optional steps blank today must skip them
explicitly after this lands; the dev-store report is what tells them which.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: the leaf fold's step set, the last-included-node refusal, the skipped reading.

## Domain Terms

Status (rewritten), Participation.

## Decisions Recorded

[ADR 0046](../../../docs/adr/0046-a-leaf-folds-over-its-included-step-nodes.md).

## Impact

`@wbs/core` (`roll-up.ts`, `work-item.resource.ts`), `@wbs/domain` (`node-reading.ts`), the
participation command owned by 010.4.13.3 (one refusal added), fe-01 (the skipped glyph is already
in place), `CONTEXT.md`.
