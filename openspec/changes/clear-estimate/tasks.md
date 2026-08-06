## 1. be-01 can forget a trio

- [x] 1.1 Failing repository test against real SQLite
      (`apps/be-01/src/repository/estimate.test.ts`, harness copied from
      `directory.test.ts`): a survivor for each half of the composite key, and
      a second clear that takes nothing away. **Negative test:** narrow the
      delete to the role alone and watch it fail.
- [x] 1.2 `EstimateStore.remove(workItemId, roleId)` on the interface, the
      drizzle repository and the in-memory fixture.
- [x] 1.3 Failing service tests in `service/estimate.test.ts`: clears one role,
      idempotent, `forbidden` on a restricted project, `not_found` for a
      missing work item, and the narrow announce with its ancestors.
- [x] 1.4 `WorkItemService.clearEstimate`, shaped like `setEstimate` —
      `contextFor` for authorisation, `announceWorkItem` for the broadcast.
- [x] 1.5 Failing controller tests in `controller/work-item.controller.test.ts`:
      401 with the trio surviving, double-delete both 200, the trio gone from
      the tree read, the other role untouched, and a parent's rolled-up figure
      dropping to what is left. **Negative test:** skip the store call and
      watch them fail.
- [x] 1.6 `DELETE /api/work-items/:id/estimates/:roleId`, guarded as the PUT is.

## 2. The table clears what was emptied

- [x] 2.1 Failing test for `isTrioEmpty` in `estimate-draft.test.ts`: true only
      when every box is blank, whitespace included.
- [x] 2.2 `isTrioEmpty` exported, and `sendableTrio` reading through it so the
      two cannot drift.
- [x] 2.3 Failing tests in `wbs-table.test.tsx`: three boxes emptied calls
      `clearEstimate` and drops the drafts; two boxes emptied calls nothing and
      keeps the invalid marks; an already-empty row sends nothing.
- [x] 2.4 `ProjectApi.clearEstimate` on the interface and `httpProjectApi`; the
      clear branch in `commitEstimate`, with `forgetTrioDrafts` split out so the
      write and the clear drop drafts the same way. **Negative test:** fire the
      clear on any emptied box and watch the two-box test fail.
- [x] 2.5 The Backspace emptiness veto reads `row.estimates`, so it lifts by
      itself once the clear lands — checked by the existing tests around it
      still passing, unchanged.

## 3. Gate and verification

- [x] 3.1 Format, the uncached run-many gate, `openspec validate --all --json`
      — recorded in `verify.md` with the fault table.
- [ ] 3.2 Deploy to dev and empty three boxes in a browser. Two peers on one
      project, one clearing and the other watching the figure drop, is the part
      jsdom cannot see.
