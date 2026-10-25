<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. assignSubtree reports the claimed steps it reassigns (issue #669 F6)

- [x] 1.1 The applied-results wire schema gains optional `reassignedClaimedSteps`
      (`workItemId`, `stepId`, `previousPersonId: string | null`,
      `holder: { claimId, personId, runId: string | null }`). Test in
      `work-item-shapes.test.ts`: an entry is accepted; one without `holder`, with a
      numeric `previousPersonId`, a holder without `claimId` or a holder list is refused.
      Negative: the field absent from the schema.
- [x] 1.2 `findReassignedClaimedSteps` lists in tree order, only claims on the assigned
      step, only a changed assignee, only a holder other than the new assignee.
      `WorkItemService.assignSubtree` answers `{ reassignedClaimedSteps }`, read from the
      claim store after the writes (throwing without one); the batch binding and
      `AppliedCommand` carry the one exported `ReassignedClaimedStep` type. Tests:
      `reassigned-claimed-steps.test.ts` (tree order), `assignee-commands.db.test.ts`
      (memory and SQLite: listed with its holder, own holder, clear to null, unchanged
      assignee, subtree claim and another step, undo), and step 9 of
      `swarm-end-to-end.db.test.ts` at the HTTP level. Negatives: each filter and the sort
      removed (verify.md).
- [x] 1.3 The `assignSubtree` description names `reassignedClaimedSteps` and `holder`
      in place of "claims are not read".

## 2. Archive

- [ ] 2.1 Archive after `wbs-resources`: the delta modifies a requirement that change adds.
