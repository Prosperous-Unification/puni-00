## Why

The Board shows every leaf step node's progress but cannot change it. The user has explicitly chosen card moves to update existing step progress. A deliberate move should use that existing planning command path so the Board and Plan describe the same step, with the current delivery, refusal and undo behavior.

## What Changes

- A user can move a Board card among Unknown, In progress and Done by drag or a labeled keyboard and touch control. In progress and Done set the selected step node's progress; Unknown clears its progress statement.
- The card stays in its delivered column until a fresh tree is installed. Cancelled, same-column, stale-subject and withdrawn-runtime gestures send no command. Pending and refused writes remain visible.
- Returning to Plan exposes the existing undo and redo for a Board progress command. An unsent Plan draft remains suspended across the visit.

## Non-Goals

Configurable states, direct attempt/derived-reading/work-item-status writes, Backlog import or precedence, source-conflict resolution, new endpoints or storage, migration, ordering, lanes, filters, offline queue, new undo stack and a generic drag system are outside this change.

## Constraints

Use one selected project runtime and its existing writer, refresh, refusals and journal. Preserve step-node identity and delivered ordering. Unknown is absence, not a stored value. Existing command wire lacks a forward revision precondition, so the local stale-gesture guard makes no server compare-and-swap claim. Two broader product questions about independent facts versus configurable states and cross-source conflicts remain pending; this slice cannot decide them. Use Bun/Nx and the repository's CI and h2puni gate workflow.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `step-progress-board`: rename and replace the blanket read-only interaction rule with a bounded existing-progress write rule and accessible equivalent control.

## Domain Terms

None; Board card, Board column, step node and Progress already exist in `CONTEXT.md`.

## Decisions Recorded

None.

## Impact

The WBS frontend Board, project command facade and focused tests change. Existing backend command kinds and HTTP endpoint remain the write contract.
