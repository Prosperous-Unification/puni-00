# Board card identity and columns before richer step status

Research for WBS **010.3.07 / K7**, 2026-09-30. Recommendation for the
010.3.08 design interview with Dany, not an accepted design. No board implementation,
glossary change, ADR or OpenSpec contract is introduced here.

## Current evidence changes the question

The [board research plan](../../superpowers/plans/2026-09-20-wbs-backlog-md-kanban-research.md)
and its [K4 field map](2026-09-20-work-item-to-backlog-task-field-map.md) predate
two accepted decisions:

- [ADR 0031](../../adr/0031-a-step-node-is-a-pair-not-a-work-item.md) makes each
  leaf × step an addressable **step node**. Its identity is the pair of stored
  IDs, encoded as `sn1.<workItemId>.<stepId>`. A **slice** is that node's scheduling
  representation; it is not the identity a board should invent or persist.
- [ADR 0032](../../adr/0032-a-hold-leaves-the-plan-blocked-is-a-reading.md) adds
  readiness and hold alongside progress. A work item's derived status now has
  eight readings: unknown, draft, ready, in progress, blocked by proxy, on hold,
  blocked and done. Step progress still has two stored values, `in_progress`
  and `done`; absence means unknown. See
  [the domain vocabulary](../../../libs/wbs/domain/domain/src/progress.ts) and
  [the response contract](../../../libs/wbs/domain/contracts/src/http/work-item-response.ts).

Consequently, “exactly three work-item statuses” and “nothing to write” in the
September 20 plan are obsolete. Existing `setProgress` and `setStatus` commands
write underlying facts; the latter can affect every leaf beneath a parent.
Neither makes a board drag's intended scope self-evident. Their semantics live in
[the work-item resource](../../../libs/wbs/application/core/src/module/work-item/work-item.resource.ts).

## Options for Dany

| Card grain                                                   | Columns available now                                     | Benefit                                                                           | Cost                                                                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Step node — recommended for the agentic-planning outcome** | Unknown, In progress, Done, from that node's progress     | Shows Plan done while Impl runs; estimates and assignment retain their step scope | More cards; row readiness and hold need separately labelled context                                  |
| Work item                                                    | The eight existing derived work-item statuses             | Compact summary; represents leaves even in projects with no steps                 | One column cannot express several steps' different progress; parent cards overlap leaf scope         |
| Work item in a selected step view                            | Three progress columns for the selected step, leaves only | Smaller board with step detail                                                    | Card subject is effectively the selected step node; changing the step changes its identity and scope |

Recommendation: use **step-node identity** if the board's purpose is the sibling
plan's “planned, now implementing” visibility. Call the card a view of a step
node, not a new work item. Use work-item cards if Dany instead chooses a summary
board first. Do not mix both grains in one column count. This recommendation
does not settle Dany's explicitly reserved card choice.

Before richer step states are accepted, a step-node column means **progress**,
not readiness, dependency eligibility, execution state or an agent queue. An
unstated node belongs in Unknown, never an inferred To do or Ready column.
Show its containing work item's status separately: a Dev node may truthfully
say Done while its work item reads In progress or On hold. Readiness and hold
must not overwrite the node's progress. Proposed Waiting, Failed or Skipped
columns remain part of the [joint status interview](2026-09-20-step-status-and-timestamps.md).

Prefer a read-only first board as an interview proposal. Existing commands make
some writes possible today, but a writable board still needs an explicit
transition policy, scope, confirmation and conflict behavior. In particular,
Blocked by proxy is derived and never a writable destination. Column membership
alone is not a command or evidence that work is eligible to run.

## Shape and invariants for the later specification

1. A board projection names its project, source revision and card grain. Each
   card references either a work-item ID or an existing step-node ID; names,
   work-item numbers, step codes and column positions are display values.
   Rename, renumber and reorder retain step-node identity, as specified by
   [the existing codec](../../../libs/wbs/domain/domain/src/step-node.ts).
2. Build step-node cards from leaves and project steps, **not scheduled slices**.
   Held work is absent from scheduling but must remain visible on the board.
   A node exists without an estimate or progress statement. A parent has no
   nodes; a project with no steps has none. Render that empty condition explicitly
   and link to the work-item view; do not create a synthetic step card.
3. Each included card occupies exactly one column in its chosen grain. Multiple
   nodes of one work item may occupy different columns. Column counts count cards,
   not unique work items or completed deliverables. Step or assignee lanes are a
   separate grouping choice, not additional progress states.
4. Compute work-item status from the complete authorized plan before applying
   display filters, including the full dependency graph. Do not change a card's
   status because its predecessor or sibling is hidden. Use the existing
   [status projection](../../../libs/wbs/application/core/src/service/work-item-statuses.ts).
5. Distinguish legitimate absent progress from a failed or incomplete read.
   Only the former means Unknown. Invalid identities, malformed facts and failed
   loading must not silently manufacture Unknown cards.
6. Display identity does not prescribe storage cardinality. Step-node cards do
   **not** require Backlog subtasks. K4 demonstrates losses in native fields;
   it does not prove that a WBS projection must flatten its extension records.
   Keep native task fields and WBS extensions under their existing
   [storage ownership and stable identity contract](../../twilight-structure/client-repositories.md#storage-ownership).
   A surviving label is not the authoritative identity map. After cutover,
   accepted broker revisions remain the board's authority; native edits are
   candidate imports. Before cutover, use the existing WBS read boundary.
7. A future write targets the same grain the card represents. A node drag must
   not silently call whole-work-item `setStatus`. Re-read membership after the
   accepted command, and surface conflicts; do not persist board-local status.

## Still reserved for the interview

Dany must choose the first card grain, read-only versus writable scope, timing
relative to Backlog cutover, parent inclusion for a work-item board, and initial
lanes. The joint interview must settle any richer step states and their folds,
the owner and mapping of native Backlog statuses, native-versus-WBS conflicting
intent, and the meaning of each allowed drag. Keyboard interaction and conflict
presentation also remain design decisions. This note does not reopen A20 or
ADR 0027, choose a vendor, or authorize implementation of 010.3.10.

## Evidence limits and verification

Read against local `main` at `4bb71e5fdf7f753b9a67ce7dd56abff387ce3a29`;
the worktree was clean at inspection. Current source, contracts, ADRs and
`CONTEXT.md` take precedence over the September 20 descriptions. Also inspected
the sibling agentic-planning research plan and the step-node codec tests.
No deployed environment, fresh Backlog binary or upstream release was checked;
historical Backlog observations remain those of K4. No behavior changed, so no
new tests or R5 safety checks were added. Runtime tests and the host-wide gate
were not run for this research note; repository format and link checks are
reported with the handoff.
