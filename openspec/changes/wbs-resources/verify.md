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

## Slice 3: the engines level demands (tasks 3.1 to 3.3)

Run on the laptop 2026-10-20 on `feat/wbs-resource-levelling` (branched from
`plan/wbs-resources` 13bc46dbc with `feat/wbs-resources-declaration` merged in), every Bun
test under `env -u CLAUDECODE`, per project and per file, not the full gate.

### What shipped

- **3.1** `chargedDemandsOf` (`@wbs/domain`) turns stored demands into each leaf's vector;
  `slicesOf` puts it on every step's slice (`Slice.demands`, absent when empty).
  `ScheduleInput.resourceCapacities` and `schedule()`'s eleventh argument carry the stated
  capacities; the canonicaliser hashes a slice's `demands` and `resourceCapacities` only
  when non-empty, so a plan stating neither keeps its exact string. The live read, the
  restart pump (`scheduleInput`), arrange, the shared snapshot (`PlanInputReads.demands`,
  `.resourceCapacities`, read by both stores' capture) and the publication guard all pass
  them. `SCHEDULER_CONTRACT_VERSION` 16 to 17; `CACHE_DTO_VERSION` 3 to 4.
- **3.2** Fast: a block's claim list is its team pools at `width` and its resources at their
  units; `jointWindowFor`, `reserve`, the weighted replay, the pinned-start refusals and the
  chronological resource edges all read that one list, so the whole vector is acquired at
  one instant. A start a resource pool bound reads `boundBy: 'capacity'`,
  `capacityTeamId: null` and `capacityResource: { resourceId, units }` (absent otherwise).
- **3.3** Solver wire 4 (`solver-wire.v4.json`, both copies): every slice carries `demands`
  and the request carries `resources`, both required; invariant (10) is checked by the Bun
  builder and by `validate.py`. `model.py` clause 4 adds one `add_cumulative` per resource
  with demand = units over the slice's one interval. The re-validator sweeps each resource
  (`pool-overcapacity` naming it). `wbs-solver` 0.2.0 to 0.3.0, so `contractVersion` is
  `17+0.3.0`; the supervisor protocol admits wire 4. Fixtures `valid-staging-resource`,
  `valid-divisible-resource` (built by the Bun builder, pinned byte for byte in
  `resource-wire.test.ts`) and `invalid-zero-demand-units`.
- The R5 falsifier: `moves neither the schedule key nor a date when a leaf is claimed`
  (`resource-schedule.test.ts`, through `claimWorkItem`).

### Golden corpus no-op proof

`fast-golden-corpus.json` and `solver-quantum-golden-corpus.json` changed their
`contractVersion` line only (16 to 17); every case is byte-identical (`git diff` shows one
line each). `keeps every golden corpus case byte for byte, no resource stated` replays the
corpus with the eleventh argument supplied empty, and its twin with a remembered capacity
nothing demands. The canonical string of a plan with `demands: []` and an empty capacity map
equals the string without them (`keeps the bytes of a plan that states no demand and no
capacity`). The honest limit: the hash of a no-resource plan is unchanged on purpose, and the
contract bump is what evicts rows cached under 16.

### Decisions this slice had to make (assumed; R1 to R8 unchanged)

- **A demand above the stated capacity is clamped to it**, as `width` is clamped to its
  narrowest team, so the block holds the whole pool rather than never fitting. A stated
  capacity of **0 therefore constrains nothing in the schedule**, which reads against
  resource-directory's "a stated 0 means the plan may use none": a block that may never
  start has no date. Flagged for Dany; the claim path (slice 2) is where "none" can bite.
- **Each step's block acquires and releases on its own** (R2 read literally, as team slots
  do), so two leaves on a capacity-1 resource interleave step by step (`080.25` Dev, `090`
  Dev, `080.25` QA, `090` QA in `resource-schedule.test.ts`). Blocks never overlap, which
  is the spec's scenario; a leaf does not keep the resource across its steps.
- `boundBy` stays `'capacity'`; the resource is named by the new optional
  `capacityResource`. The HTTP slice contract admits it (additive); fe-01 shows no resource
  words until 3.4.
- The wire keeps `poolIds`/`width`/`pools` for teams and adds `demands`/`resources` beside
  them, rather than Claire's single per-pool demand list: one new cumulative loop, no
  change to the team clause.
- `WorkItemServiceOptions.demands` and `.resourceCapacity` are required now (every plan read
  levels demands); 26 test fixtures that built the service without them were given the
  SQLite repositories or `testResourceStores`.
- Done work: nothing reads progress; a step stated done still holds its units as it still
  holds its team slots (proposal non-goal). Documented on `Slice.demands`.
- Saved plan bodies still carry no demands (slice 1's open item); a capture's own schedule
  levels them because the capture reads them.

### Commands and results (fresh, after the last edit)

| Command (cwd)                                                                        | Result                    |
| ------------------------------------------------------------------------------------ | ------------------------- |
| `bun test ./src` (libs/wbs/domain/domain)                                            | 1169 pass, 1 skip, 0 fail |
| `bun test ./` (libs/wbs/domain/contracts, http and solver)                           | 491 pass, 0 fail          |
| `bun test ./src` (libs/wbs/application/core)                                         | 1128 pass, 0 fail         |
| `bun test ./src` (store-memory / conformance / runtime-portable / supervisor-proto)  | 193 / 35 / 34 / 12 pass   |
| `bun test ./src` (apps/wbs/mcp-01)                                                   | 423 pass, 0 fail          |
| `bun test` over 39 be-01 files (every touched test, OpenAPI, resource controllers)   | 780 pass, 0 fail          |
| `bun test` over 9 store-sqlite files (touched, capture, chain, fanout, cache)        | 201 pass, 0 fail          |
| `PATH=.venv-solver/bin:$PATH bunx nx run wbs-solver-py:test --skip-nx-cache`         | Ran 258 tests, OK         |
| `bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts` (root)          | 15 pass, 0 fail           |
| `bunx tsc -p <tsconfig.lib/spec/app>.json --noEmit` over 11 projects and be-01 tools | no diagnostics            |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                             | 258 passed, 0 failed      |

`.venv-solver` is the worktree's own solver environment from `tools/dev/solver-setup-cli.ts`
(gitignored); nothing was installed globally. **`tsc --build` is not evidence for be-01**:
it reported be-01 up to date while 26 of its test files no longer typechecked, because be-01
has no project reference to core and only its own inputs were older than its outputs. Every
typecheck above is `tsc -p … --noEmit`.

### Proofs (each fault injected alone, the named test watched failing, restored)

| Check                                               | Fault                        | Failing test (result)                                                                               |
| --------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| resource claims in `claimsOf`                       | resource half `[]`           | five `schedule-resources.test.ts` cases (staging both paths, 32 GB, vector, pinned overlap)         |
| `capacityResource` absent when unbound              | `null` on every slice        | both corpus byte cases and the staging case                                                         |
| `capacityResource` named                            | `null` for a resource        | the five cases naming a resource                                                                    |
| `refuseMalformedDemands`                            | call removed                 | `refuses a demand below one unit, a resource named twice and an unsorted vector`                    |
| `chargedDemandsOf` unstated skip                    | demand charged unclamped     | `leaves a demand on an unstated capacity unconstrained`                                             |
| canonical `demands` entry                           | left out                     | `hashes a demand…` (1 key for 5 plans), `moves the key when a demand edit moves a placement` (39/2) |
| canonical `resourceCapacities` entry                | left out                     | `hashes a resource capacity` (40/1)                                                                 |
| `slicesOf` vector                                   | `{}`                         | `serialises two leaves on the one staging environment and names it`                                 |
| `canonicalScheduleParts` capacities                 | left out                     | both levelling cases of `resource-schedule.test.ts` threw `no capacity for resource`                |
| isolated tree read demands                          | `[]`                         | `levels a demanded resource (isolated)` (resource-schedule.controller.db.test.ts)                   |
| SQLite capture demands                              | `[]`                         | `levels a demanded resource (shared)`; isolated twin passed                                         |
| memory capture demands and capacities               | `[]`                         | `captures demands and resource capacities detached from later memory writes`                        |
| runtime-portable forwards capacities                | `NO_CAPACITIES`              | `hands the resource capacities to Fast`, `forwards all … Fast arguments`                            |
| builder `demands` / `resources` / no-capacity throw | `[]` / `{}` / skip           | `resource-wire.test.ts` golden bytes, carried vector, no-capacity refusal (3, 2 and 1 fail)         |
| re-validator resource sweep / capacity presence     | loop emptied / check emptied | staging and divisible overload cases accepted (50/2); unstated resource accepted (51/1)             |
| supervisor admits wire 4                            | list back to 1 to 3          | `carries resource demands and capacities on solver wire 4 unchanged`                                |
| `model.py` resource cumulative                      | loop over `{}`               | `test_resources.py`: staging and 32 GB at makespan 10, vector overlap (3/13); parity cases (3 fail) |
| `validate.py` invariant (10)                        | loop over `[]`               | the four invariant cases, `RequestRejected not raised` (4/13)                                       |

Not a check, recorded so it is not mistaken for one: `projectSharedTree` hands the snapshot's
demands to the canonical seam, but the shared schedule was computed on the snapshot; `[]`
there changed no test.

### Not run, and why

- The h2puni gate (the orchestrator gates the plan head), the full Nx suites, the whole
  be-01 and store-sqlite suites (39 and 9 files instead), fe-01 tests (fe-01 typechecks; no
  fe-01 source changed; 3.4 is not this slice).
