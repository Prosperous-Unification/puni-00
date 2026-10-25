<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

`assignSubtree` takes the assignment of a claimed step away from its holder without
notice (issue #669, F6), as `assignee-management` asks: it "SHALL NOT read team labels or
claims". The holder's by-person read then lists the claim without the assignment, and a
swarm coordinator cannot tell which running agents it displaced.

## What Changes

- No new refusal; the same writes, journal entry and undo.
- Its result gains `reassignedClaimedSteps`, in tree order: one entry for each leaf step
  whose assignee the command changed while the claim on that step is held by someone
  other than the new assignee. Each entry names `workItemId`, `stepId`,
  `previousPersonId` (null where there was none) and `holder: { claimId, personId,
runId }`; the `claim_step` unique index allows one step claim per step, so there is one
  holder. A step assigned to its own holder, or whose assignee did not change, is not
  listed.
- The list reflects the claims at the command's position in its batch: a claim or
  release earlier in the same batch counts, a later one does not.
- The claims are read once, after the writes; a service built without a claim store throws.
- The `assignSubtree` description (MCP batch tool and OpenAPI) says so.

## Decisions (assumed, 2026-10-24)

- Report, not refuse: bulk reassignment is legitimate; the listing lets the coordinator
  release or notify.
- Only a claim on that very step counts. A subtree claim holds no step, and a claim on
  another step of the leaf is not displaced.
- The holder is named by claim id, person id and run, not by name: the binding carries no
  organization access to resolve names under, and the run tells a coordinator which
  agent run was displaced.

## Non-goals

- A redo reassigns again without listing; any command in between clears the redo stack,
  so the original apply already reported it.
- Any change to `setAssignee`, which writes one step the caller names directly.
- Releasing, notifying or refusing on the holder's behalf.
- F1, F5 and F7 of issue #669.

## Constraints

- No migration; no new store method (the claim store's `listByProject` already exists).
- Additive on the wire: `reassignedClaimedSteps` is optional in the applied-results
  schema, as `assignedStepIds` is.
- Archive after `wbs-resources`: the delta modifies a requirement that change adds, so until
  then openspec reports "Archive would refuse … target spec does not exist".
