<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

The swarm end-to-end test (PR #666) found that `assignSubtree` takes the assignment of a
claimed step away from its holder without refusal or notice (issue #669, F6). That is
what `assignee-management` asks today: the command "SHALL NOT read team labels or
claims". The holder's by-person read then lists the claim without the assignment, and a
swarm coordinator that reassigned a subtree cannot tell which running agents it just
displaced.

## What Changes

- `assignSubtree` still succeeds wherever it succeeded before: no new refusal, and the
  same writes, journal entry, undo and redo.
- Its result gains `reassignedClaimedSteps`: one entry for each leaf step whose assignee
  the command changed while a claim on that step is held by someone other than the new
  assignee. Each entry names `workItemId`, `stepId`, `previousPersonId` (null where there
  was none) and `holderPersonIds`, the distinct holders of claims on that step. A step
  assigned to its own holder, or whose assignee did not change, is not listed. Entries
  come in leaf order (the tree order the command writes in).
- The command reads the project's claims once, after its writes; team labels stay unread.
- The `assignSubtree` description (MCP batch tool and OpenAPI) says so.

## Decisions (assumed, 2026-10-24)

- Report, not refuse: refusing would break the coordinator's bulk reassignment, which is
  legitimate; the listing lets it release or notify instead.
- Only step claims count. A subtree claim on an ancestor holds no step and assigns none
  (`claimWorkItem` with `assign` writes no step for it), so it is not listed.
- Holders are named by person id only: the binding carries no organization access to
  resolve names under, and `getApiPeople` resolves them.

## Non-goals

- Any change to `setAssignee`, which writes one step the caller names directly.
- Releasing, notifying or refusing on the holder's behalf.
- F1, F5 and F7 of issue #669.

## Constraints

- No migration; no new store method (the claim store's `listByProject` already exists).
- Additive on the wire: `reassignedClaimedSteps` is optional in the applied-results
  schema, as `assignedStepIds` is.
- Archive after `wbs-resources`: the delta modifies a requirement that change adds, so until
  then openspec reports "Archive would refuse … target spec does not exist".
