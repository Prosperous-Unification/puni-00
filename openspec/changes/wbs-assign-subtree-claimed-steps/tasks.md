<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. assignSubtree reports the claimed steps it reassigns (issue #669 F6)

- [x] 1.1 The applied-results wire schema gains optional `reassignedClaimedSteps`
      (`workItemId`, `stepId`, `previousPersonId: string | null`, `holderPersonIds`).
      Test in `work-item-shapes.test.ts`: the arm accepts an entry and refuses one with a
      missing `holderPersonIds`. Negative: the field absent from the schema.
- [x] 1.2 `WorkItemService.assignSubtree` answers `{ reassignedClaimedSteps }`, read from
      the project's step claims after the writes; the batch binding and `AppliedCommand`
      carry it. Tests in `assignee-commands.db.test.ts` (memory and SQLite): a claimed step
      reassigned to `kat` is listed with its holder; the same step assigned to its holder
      `claire` is not; undo leaves the claim and restores no assignee. Negative: the
      listing returns every claimed leaf without the holder or change filter.
- [x] 1.3 The `assignSubtree` description names `reassignedClaimedSteps` in place of
      "claims are not read".

## 2. Archive

- [ ] 2.1 Archive after `wbs-resources`: the delta modifies a requirement that change adds.
