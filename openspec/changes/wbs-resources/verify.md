## Verification record

Nothing implemented. Drafted 2026-10-20 under Dany's "GO" goal of the same day; R1 to R8 in
design.md are assumed until he reads them. Sources: Claire's design consult and breakdown of
2026-10-17 (PR #571, merged), `docs/capacity.md`, the `wbs-team-claims` change (slice 1
claim table at PR #579), `schedule.ts` ledger and `model.py` cumulative per pool as read on
2026-10-20.

Term collision checked in `CONTEXT.md`: **Hold** already names a work item's on-hold state
and **Lease** is reserved for runtime, so the live units a claim holds are **Occupancy**.

`openspec validate --all --json`: run before each push, result in the PR.

## Slice 4: assignee management (tasks 4.1 to 4.3)

Implemented 2026-10-20 on `feat/wbs-assignee-management`, branched from
`feat/wbs-claims-followups` (a86ed5b43) with `plan/wbs-resources` merged in.

- 4.1 `assignSubtree { workItemId|workItemRef, stepId, personId|personRef|null }` in the
  registry (project scope), `WorkItemService.assignSubtree`: one `assign` compensating command
  per leaf, journalled as one entry (a `batch` when there are several leaves), undo restoring
  each leaf's captured previous assignee. Calendar-affecting like `setAssignee`.
- 4.2 `GET /api/projects/:id/people/:personId/work` (`getApiProjectsByIdPeopleByPersonIdWork`,
  descriptor `readPersonWork` in `@wbs/contracts`), pure fold `findPersonWork` in
  `module/work-item/person-work.ts`. Nested under the project as `startable` is, and under
  `people/:personId` as `GET /api/people/:personId/load` is. Unknown or foreign person: 404
  `unknown_person`. MCP tools 82 to 83 (counted with `toolsFromDocument` over `httpShapes`
  with and without `readPersonWork`); README count and the pinned operation list updated.
- 4.3 `claimWorkItem.assign`: `decideClaim` answers `assignStepIds` (the steps the drafts write
  when `assign`, else none; a subtree claim writes none); the claim writes those assignments in
  the same entry, whose inverse restores the previous assignees before removing the claims. A
  batch holding a claim with `assign: true` enters the calendar preflight; one without does not.

Commands and results (2026-10-20, laptop, `env -u CLAUDECODE`):

- `bunx tsc --build` domain, contracts, core, conformance, store-memory, store-sqlite, be-01,
  mcp-01, fe-01: exit 0.
- `bun test` over 26 files (claim, definitions, plan-command-shapes, command-normalizers,
  claim-command, assignee-calendar, person-work, startable, work-item.resource,
  assignee-commands.db, person-work-scope.db, startable-scope.db, claim-race.db, conformance
  existing, memory and SQLite source-conformance, be-01 person-work, startable and
  claim-identity controllers, app.routes, both OpenAPI tests, mcp-01 generated-document,
  openapi-tools and http, tool-devsync repo-namespacing-handoff): 501 pass, 0 fail.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 258 passed, 0 failed.
- OpenAPI emit (`emit-openapi-cli.ts`) at 748e5ae1b and at this branch, compared
  structurally: one path added, `assignSubtree` added as a command arm (49 from 48) and to
  every `kind` enum, `claimWorkItem` gains the optional `assign` property; no path, arm,
  property or requirement removed. The one non-additive change is the text of
  `claimWorkItem`'s description, which now says what `assign` does.

Both stores: assignSubtree and claim-with-assign run over the memory and the SQLite source in
`assignee-commands.db.test.ts`. They add no store port method (they write through
`DirectoryStore.assign` and read through `assignmentsOf`, `assignmentsFor`,
`assignmentsInProject`, `namesOf` and `ClaimStore.listStampedByProject`), so no conformance
case is new; `directory.assign:scope-replace-clear` and `claims.listStampedByProject:write-instant`
already certify those ports on both stores.

R5 proofs, each watched failing with the fault injected and passing with it removed:

- Previous-assignee capture (`work-item.resource.ts`, `assignSubtree`): `null` in place of the
  captured assignee failed the three undo cases of `assignee-commands.db.test.ts` on both stores
  (6 fail).
- Claim inverse (`work-item.resource.ts`, `claim`): `unassigning` left out failed `claims and
assigns in one entry; undo clears both the claim and the assignment` (claim-command.test.ts).
- `assignStepIds` (`claim.ts`): `[]` in place of the claimed steps failed the decision case and
  the fast-check property `with assign, assigns exactly the steps it claims; without, none`.
- By-person filter (`person-work.ts`): dropping the person filter failed `lists one person's
assignments and claims, and no one else's`.
- `unknown_person` (`personWorkWithin`): removed, `refuses a person the caller's organization
does not hold` answered 500 instead of 404.
- Bounded name read (`personWorkWithin`): `listPeople()` for `namesOf` failed
  `materializes only the person read during a tiny by-person read` on `SCAN person USING INDEX
person_name`.
- Calendar preflight (`plan-commands.feature.ts`): `assignSubtree` left out of the set applied
  `refuses assignSubtree with calendar_range and writes nothing`; the claim arm replaced by
  `false` applied `refuses a claim that assigns past the calendar` (assignee-calendar.test.ts).

Not run: the h2puni gate (the orchestrator gates the merged head), the full Nx suites, fe-01
tests (fe-01 typechecks; no fe-01 source changed).

Spec notes:

- `assignee-management` says `assignSubtree` refuses `not_a_step`; `setAssignee` refuses
  `unknown_step` and no `not_a_step` code exists, so `assignSubtree` refuses `unknown_step`
  "as `setAssignee` does".
- The `wbs-team-claims` registry requirement says the claim "SHALL NOT read or write
  assignments". With `assign: true` it now writes them; this change ADDs `assign` but does not
  MODIFY that requirement, so the two read as conflicting until one of them is amended.
