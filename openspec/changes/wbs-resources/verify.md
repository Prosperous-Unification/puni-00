## Verification record

Slice 1 (tasks 1.1 to 1.4) implemented 2026-10-20 on `feat/wbs-resources-declaration`; see
"Slice 1" below. Drafted 2026-10-20 under Dany's "GO" goal of the same day; R1 to R8 in
design.md are assumed until he reads them. Sources: Claire's design consult and breakdown of
2026-10-17 (PR #571, merged), `docs/capacity.md`, the `wbs-team-claims` change (slice 1
claim table at PR #579), `schedule.ts` ledger and `model.py` cumulative per pool as read on
2026-10-20.

Term collision checked in `CONTEXT.md`: **Hold** already names a work item's on-hold state
and **Lease** is reserved for runtime, so the live units a claim holds are **Occupancy**.

`openspec validate --all --json`: run before each push, result in the PR.

## Slice 2: occupancy on claims (tasks 2.1 to 2.3)

Implemented 2026-10-20 on `feat/wbs-resource-occupancy`, branched from `plan/wbs-resources`
(13bc46dbc) with `feat/wbs-resources-declaration` (775a7a7f, slice 1, PR open) merged in.
R3 and R4 are still assumed; the check lives in one function so either can be overturned there.

How "first claim on a leaf" is recorded: it is not a flag. `claim_occupancy (claim_id FK
claim cascade, resource_id FK resource cascade, units CHECK >= 1, PK (claim_id, resource_id))`
holds one row per claim and resource, and **every** claim row of a leaf carries a copy of the
leaf's whole vector. A leaf holds the largest copy per resource (`leafOccupancyOf`), never the
sum; the project's occupancy is the sum over leaves (`occupancyByResource`). A claim on a leaf
that already holds a claim copies the standing vector and acquires nothing (`acquired: []`),
whatever its `resources` asks; releasing one of two claims leaves the other's copy, releasing
the last takes the last copy by cascade. Rows on the first claim alone would have been freed
when that claim was released first, against "releasing only A's claim first changed nothing".

- 2.1 `libs/wbs/domain/domain/src/occupancy.ts`: `askedUnitsOf` (declared demand raised by the
  claim's `resources`, `below_declared_demand`), `refuseOccupancy` (the one free-units check:
  stated capacity minus other leaves' units must cover the units asked; a leaf already holding
  that many is not asked again; unstated never refuses), `freeUnitsOf`, `occupancyByResource`.
  `decideClaim` places `below_declared_demand` then `resources_exhausted` after
  `already_claimed` (and `alreadyHeld`) and before `inside_subtree_claim`; a subtree claim
  acquires nothing and naming `resources` on one is refused `resources_on_subtree`.
- 2.2 Migration `20261020130000_add_claim_occupancy` (additive) with a `down.sql` refusing while
  rows exist. `ClaimStore.occupancyOf(projectId)` (rows with claim, leaf, person, run) and
  `add(claims, stated, stamp, occupancy)` (`unknown_resource` for a resource gone) on SQLite and
  memory; `WorkItemService.occupancyOf` answers per resource with holders and free units.
  Resource usage counts occupying leaves (`occupancies`), refusing `deleteResource` in use; the
  cascade takes the rows. `findCrossReferences` fails closed on `claim_occupancy_resource`.
- 2.3 `claimWorkItem.resources: { resourceId, units }[]` (boundary: a list of 1 to 50 distinct
  resources, units 1 to 1e9; foreign resources `unknown_resource` before the claim; kind rule
  `exclusive_demand_is_one`). The claim reads demand, capacities and occupancy inside the
  batch's transaction. `add_claims` journals the occupancy rows; the release's inverse carries
  the removed claims' rows. A redo of a claim and an undo of a release pass `refuseOccupancy`
  again and, refused, answer `stale_undo` with detail `resources_exhausted: that needs …`.
  The result gains `acquired`. Contracts: three refusal arms (409), four boundary codes (400),
  the `claimWorkItem` description, `acquired` on results; fe-01's refusal switch lists them.

Commands and results (2026-10-20, laptop, `env -u CLAUDECODE`, explicit `./` paths):

- `bunx tsc --build` domain, contracts, core, conformance, store-memory, store-sqlite, be-01,
  mcp-01, fe-01: exit 0.
- `bun test` over 93 files (every test file this branch changed or added, every file the
  slice 1 merge touched, the claim, assignee, startable, person-work and resource command and
  store tests, the 33 migration-pinned tests, both source conformance suites, be-01 claim,
  startable, person-work and resource controllers, both OpenAPI tests, mcp-01
  generated-document, openapi-tools and http, tool-devsync repo-namespacing-handoff): 1942 pass,
  1 skip (the existing memory stale-undo case of `assignee-commands.db.test.ts`), 0 fail.
  Of these, new: `claim-occupancy.test.ts` 14, `resource-occupancy.db.test.ts` 22 (11 per
  store), `claim-occupancy-race.db.test.ts` 2, `claim-occupancy-schema.db.test.ts` 7, three
  normalizer, one replay and one controller case, and the conformance case
  `claims.occupancy:hold-read-cascade` certified on both stores.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 258 passed, 0 failed.
- OpenAPI emit (`emit-openapi-cli.ts`) before and after, compared structurally: nothing
  removed; added `resources` on the `claimWorkItem` arm, `acquired` on results, the three 409
  and four 400 arms; changed only the `claimWorkItem` description text. No path added, so the
  MCP tool list is unchanged by this slice.
- Merge of slice 1: 52 conflicted files, resolved keeping both sides (migration lists in date
  order, both routes and reads, module indexes unioned, MCP README now 84 tools since slice 1
  and slice 4 each added one read); `person-account-migration.db.test.ts` and the memory
  resource usage (`pinnedCredentials`) needed a fix the merge could not show as a conflict.

R5 proofs, each watched failing with the fault injected and passing with it removed:

- `refuseOccupancy` comparison answering null: the ninth-claim, capacity-0, more-than-declared
  and ordering cases and the fast-check property failed (claim-occupancy.test.ts), and both
  orders of the race test stored the second claim over 6 GB (claim-occupancy-race.db.test.ts).
  The store does not repeat the check: the claim's read inside the coordinator's turn is it.
- The held-units skip removed: a leaf whose capacity was lowered under its units was refused
  its own units. `below_declared_demand` removed: 1 GB of a 2 GB demand claimed. The
  first-claim test (`onTarget.length > 0`) replaced by `false`: a second claim acquired again.
  `resources_on_subtree` removed: the subtree claim dropped the ask.
- Migration: the CHECK, the primary key, each cascade and the down guard removed alone each
  failed its own case of `claim-occupancy-schema.db.test.ts`.
- Stores: SQLite's `unknown_resource` check and memory's `holdsResource` check removed failed
  the certification case; SQLite's occupancy count at 0 failed certification and `refuses
deleting a resource a claim holds`; memory's in-use refusal removed failed certification
  (the stage only a claim held was removed); memory's commit copy of the rows removed failed
  ten memory cases of resource-occupancy.db.test.ts.
- Commands: the release's captured rows replaced by none failed `undo of a release re-acquires
the units` on both stores; `refuseReacquiring` answering null failed the refused-redo case on
  both; holders replaced by `[]` in the batch failed the ninth-claim case on both; the
  service's resource and kind guard skipped failed its case on both; the batch's foreign
  resource check skipped answered 403 `person_not_bound` instead of 404 `unknown_resource`
  (resource-organization.controller.db.test.ts); the crossing arm disabled left the
  occupancy out of `findCrossReferences` (project.db.test.ts); the replay's occupancy parse and
  resource references removed failed their compensating.test.ts cases; the normalizer's
  duplicate refusal removed failed its case.
- Design R5: `leaves the canonical schedule input unchanged by a claim that occupies units`
  (both stores) compares `canonicalScheduleInput` before and after a claim holding 4 GB.

Spec notes: the refusal order, `resources_on_subtree`, stated-0 and the redo surface are now
written in `specs/resource-occupancy/spec.md` (the spec was silent). Two observations, not
changed: `specs/plan-command-registry/spec.md` says the commands add no MCP tool and only the
by-person read adds one, but slice 1's `GET /api/projects/:id/resources` added one too (84 now);
and tasks.md 0.1 says slice 2 waits for Dany's R3 and R4, which this slice proceeded under as
assumed.

Not run: the h2puni gate (the orchestrator gates the plan head), the full Nx suites, fe-01
tests (fe-01 typechecks; only its refusal switch changed).

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

Spec notes (amended on `plan/wbs-resources` in 659654936, merged here):

- `assignee-management` now says `assignSubtree` refuses `unknown_step` and `unknown_person` as
  `setAssignee` does, which is what it refuses.
- The registry delta now MODIFIES the claim requirement: the claim reads and writes no
  assignment unless `assign: true`, which assigns the claimed steps in the same entry and goes
  through `setAssignee`'s calendar preflight; and the commands add no MCP tool while the
  by-person read adds exactly one (82 to 83).

### PR #587 review round (S2 to S4), 2026-10-20

- S2: `assignSubtree` row added to `refuses a foreign service, team, tag, type, person and
predecessor, all or none` (command-organization.controller.db.test.ts): 404 `unknown_person`
  at 1, snapshot unchanged. Watched: with the `assignSubtree` arm removed from
  `directoryReferencesOf` alone the row still answers 404, because the batch's post-command
  crossing check (`assignment_person`) refuses it too; with that check also skipping
  `assignment_person` the row answered 200. Either guard alone holds; the `Proof:` says so.
- S3: `origin/plan/wbs-resources` (659654936) merged; spec notes above rewritten.
- S4: `claimWorkItem` answers `assignedStepIds` (empty for a subtree claim, `alreadyHeld` or
  no `assign`), asserted in claim-command.test.ts. Direct `WorkItemService.assignSubtree` with
  an unknown step answers `unknown_step` on both stores; with the check removed the memory store
  answered ok (SQLite's write refuses on its own). Removing `personWorkWithin`'s admission made
  the stranger case answer 200 with empty lists instead of 404. A multi-leaf `assignSubtree`
  undo after another account reassigned one leaf is refused and changes nothing (SQLite only:
  the memory source keeps no work-item revisions, so the case is skipped there).
  `oneCommandOf`'s parameter is `commands`.
- `bunx tsc --build` (the nine projects): exit 0. `bun test` over 27 files: 533 pass, 1 skip
  (the memory stale-undo case), 0 fail. `openspec validate --all --json`: 258 passed, 0 failed.

## Slice 1: the declaration surface (tasks 1.1 to 1.4)

Run on the laptop 2026-10-20, every test under `env -u CLAUDECODE`, per project and not the
full gate (one other worker shared the laptop). The h2puni gate is recorded at the end.

### What shipped, and the decisions slice 1 had to make

- Migration `20261020120000_add_resources`: `resource` (kind CHECK, unique name, unit label),
  `project_resource_capacity` (whole units from 0, a row is stated), `work_item_resource_demand`
  (whole units from 1, cascading with its work item and resource), and `resource_organization`
  with the legacy bridge and ownership freeze `service_team_organization` carries. `resource`
  joins `OWNED_ROOT_KINDS` and the catalog kinds; the two new dependents join the ownership
  conflict queries the activation preflight runs and the project closure check. `down.sql`
  refuses while any of the three tables holds a row.
- Directory commands `createResource`, `patchResource`, `deleteResource`; project commands
  `setResourceCapacity`, `setDemand`; two new ports, `DemandStore` and `ResourceCapacityStore`,
  over SQLite and memory, certified by six new conformance cases.
- **A duplicate name is refused `taken`, not answered with the held row.** A team create is
  idempotent by name; a resource create answering the held row would hand back a kind and
  unit the caller did not ask for. The spec's "refused as a duplicate team name would be" is
  read as the `taken` refusal a team rename onto a held name gets.
- **Directory resource commands are not journalled**, like every directory command, and
  `setResourceCapacity` is not journalled, exactly as `setCapacity`; `setDemand` is one undoable
  entry. The registry spec's "each … undoable" holds for `setDemand` only.
- **`in_use` carries `usage` and `counts`.** The usage names each row that loses a demand
  (`demand_removed`, its units); `counts` gives demands, capacities and occupancies.
  Occupancies are counted through the directory store's resource usage and answer 0 in both
  stores until the claim occupancy table exists (task 2.2).
- **One read route, so the MCP tool count moves by one (82 to 83).** `GET
/api/projects/:id/resources` answers the caller's resources, the project's stated pairs and
  its demands: the spec's "directory read lists it" and "the project settings read SHALL list
  stated pairs", and the only way an agent can learn resource ids. The five commands add no
  tool; the batch tools carry them.
- **Plan document version 10.** `directory.resources` (the closure the capacities and demands
  name, as every other catalog's), `resourceCapacities` and `demands`, all required at 10; a
  file before 10 that names any is refused. Import resolves resources by name, keeps a held
  resource's unit label, and refuses (`source_refused`, rolled back) one held under another
  kind. Twilight Navigator reads v10 (and still v7 to v9), and Burokrat's plan reference
  admits `planDocumentVersion: 10`; v11 is refused in both.
- **The core test harness (`inMemoryServices`) carries a demand and a resource capacity store**
  over its directory's own resource tables, because the export reads both and an export
  through a service without them throws rather than answering empty lists.

### Commands and results

| Command (cwd)                                                                                                                        | Result             |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `bun test ./src` (libs/wbs/domain/domain)                                                                                            | 1147 pass, 0 fail  |
| `bun test ./src` (libs/wbs/domain/contracts)                                                                                         | 151 pass, 0 fail   |
| `bun test ./src` (libs/wbs/application/core)                                                                                         | 1113 pass, 0 fail  |
| `bun test ./src` (libs/wbs/adapters/store-memory)                                                                                    | 190 pass, 0 fail   |
| `bun test ./src` (libs/wbs/application/conformance)                                                                                  | 35 pass, 0 fail    |
| `bun test ./src` (libs/wbs/adapters/store-sqlite)                                                                                    | 1693 pass, 0 fail  |
| `bun test ./src` (apps/wbs/be-01)                                                                                                    | BE01_COUNTS        |
| `bun test ./src` (apps/wbs/mcp-01)                                                                                                   | 423 pass, 0 fail   |
| `bun test ./src` (apps/twilight-structure/twilight-navigator/cli)                                                                    | 97 pass, 0 fail    |
| `bun test ./src/contracts`, `./src/packaging/build.test.ts` (twilight-burokrat/cli)                                                  | 137 pass; 2 pass   |
| `bun test ./src/progress/record-progress.test.ts` (twilight-dash/cli)                                                                | 68 pass, 0 fail    |
| `TZ=UTC bunx vitest run` over wbs-api, directory-page, refusing-api and the 7 suites importing `plan-refusal`/`refusing-api` (fe-01) | 10 files, 530 pass |
| `bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts` (root)                                                            | 15 pass, 0 fail    |
| `bunx tsc --build` domain, contracts, core, conformance, both stores, be-01, mcp-01, fe-01, Navigator, Burokrat, Dash                | no diagnostics     |
| `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts <migration.sql> <down.sql>`                                                | exit 0             |
| `bunx @fission-ai/openspec@1.12.0 validate wbs-resources --json`                                                                     | 1 passed, 0 failed |

OpenAPI: `bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts` on `09caffb93` and on this
branch, compared structurally (every base key and list entry covered in the new document,
enums widened counting as additions): one path added (`/api/projects/{id}/resources`), no
key or entry removed, and one value changed: the export's `document.version` const 9 to 10,
which is the version bump itself.

Goldens: the v7, v8 and v9 Navigator fixtures are unchanged; a v10 fixture
(`plan-export.v10.json`) is the v9 one with resources added. The core export's zero-fact
golden `61243efa…` still holds for a plan stating no resource facts, read with the three
version-10 lists taken off and the version as 9; the resources export has its own golden
`f8bf291a…`.

### Proofs (each check removed or broken alone, the named test watched failing, restored)

| Check                                                                           | Fault injected                                            | Failing test                                                                                                                                                                |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resource_kind` CHECK, `resource_name` unique, capacity and demand units CHECKs | each removed from a copy of the migration                 | its own case in `resource-schema.db.test.ts`                                                                                                                                |
| demand cascades (work item, resource), capacity cascades (resource, project)    | each `ON DELETE CASCADE` removed                          | `takes a demand with its work item…`, `takes a capacity with its project`                                                                                                   |
| six `resource_organization` triggers                                            | each made `WHEN 0` / write neutered                       | `organization-ownership-freeze.db.test.ts` resource cases, `keeps every catalog side name equal…`                                                                           |
| `down.sql` guard                                                                | guard statements removed                                  | `refuses to reverse add_resources while any resource row exists…` (migration-cli, exited 0)                                                                                 |
| two new ownership conflict queries                                              | each replaced by a query selecting nothing                | `reports a project_resource_capacity / work_item_resource_demand conflict`                                                                                                  |
| project closure arms (`findCrossReferences`)                                    | both resource arms removed                                | `reports a demand and a capacity naming another organization’s resource`                                                                                                    |
| command reference check for a foreign resource                                  | refusal removed                                           | `refuses a foreign resource exactly as an absent one` (200 to a clear naming B's resource)                                                                                  |
| removal in-use refusal (service and memory store together)                      | both answer "unused"                                      | `refuses removing a demanded resource, naming 2 demands, 0 capacities, 0 occupancies`                                                                                       |
| SQLite removal in-use refusal / unique-name branch / both existence reads       | each removed                                              | SQLite certification of `directory.removeResource:in-use-cascade`, `directory.addResource:taken`, `resourceCapacity.set:missing-reference`, `demands.set:missing-reference` |
| memory equivalents                                                              | each removed                                              | memory certification of the same cases                                                                                                                                      |
| revision bump on a demand write / on a cascaded removal                         | `bumpWorkItems` removed                                   | `moves the work item’s revision on every demand write…`, `moves the revision of every row a cascaded removal…`                                                              |
| `foreignReferencesTo` resource arms                                             | both removed                                              | `lists an organization’s resources under their local names, and names foreign reach`                                                                                        |
| `exclusive_demand_is_one`                                                       | kind check removed in `setDemand`                         | `refuses 2 units on an exclusive resource, writing nothing` and the stored-demand property                                                                                  |
| `kind_is_immutable`, resource kind, unit bounds (integer, floor, ceiling)       | each refusal removed                                      | `refuses a patch naming the kind…`, `refuses units below 0 or above the bound…`, the property                                                                               |
| duplicate name refused `taken` (legacy, scoped)                                 | held row answered / local-name check removed              | `declares a host’s RAM…`, `creates a scoped resource under an opaque root name…`                                                                                            |
| resource writes refused on a standalone-built service                           | refusal removed                                           | `run only inside a command batch…`                                                                                                                                          |
| `counts` carried by the batch refusal; usage naming demands                     | counts dropped; demand lookup emptied                     | `refuses removing a demanded resource…`                                                                                                                                     |
| demand journal replay check                                                     | check removed                                             | `refuses a malformed demand replay`                                                                                                                                         |
| memory commit copy of resources                                                 | copy removed                                              | ten of `resource-command.test.ts`'s thirteen cases                                                                                                                          |
| resource read: scoped catalog, access resolution                                | root catalog read / legacy access passed                  | `creates the same name in two organizations…`, `refuses an unbound session and a stranger alike`                                                                            |
| v10 classification: shapes, legacy refusal                                      | each bypassed                                             | `refuses a version-10 file with a malformed…`, `refuses resources in a file older than version 10`                                                                          |
| export: capacities, demands, resource closure                                   | each written empty / unfiltered                           | `exports only the resources its capacities and demands name (wbs-resources)` (and both goldens)                                                                             |
| export reads: isolated service read, shared snapshot read                       | each answering empty lists                                | `exports the organization’s resources… (isolated)` / `(shared)`                                                                                                             |
| `prepareResources`: seven refusals                                              | each removed                                              | its case of `refuses a version-10 file whose resources do not resolve`                                                                                                      |
| import kind comparison                                                          | removed                                                   | `refuses a resource the directory holds under another kind, writing no project` (memory)                                                                                    |
| Navigator v9 schema, v10 deep rejection; Burokrat version literal               | v9 read as v10 / rejection off / 10 omitted / 11 admitted | both v9 positives; `refuses v10 unknown nested key`; the decode and future-version tests                                                                                    |

Property: `holds every stored demand at 1 unit or more, exactly 1 on an exclusive resource,
after any sequence` (fast-check, 40 runs of up to 12 writes with units from -2 to 6, 1.5 and
null, through the command boundary and the runner).

### What slice 1 leaves open

- **Undo of a delete and a duplicate do not carry demands.** A work item's demands go with it
  (both stores), but the delete's journal entry does not capture them, so an undo restores the
  row without its demands, and `duplicateWorkItem` copies none. Restoring them needs
  `SubtreeCopy`/`restore_subtree` to carry demands; not in this slice.
- Saved plans and the canonical schedule input carry no demands (slice 3.1); the tree read
  carries none (the resource read does); fe-01 is task 1.5.
