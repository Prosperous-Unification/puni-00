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

## Slice 5: startable fit (task 5.1)

Implemented 2026-10-20 on `feat/wbs-startable-fit`, stacked on `feat/wbs-resource-occupancy`
(PR #590 at 6cb0404fa, review fixes included) with `plan/wbs-resources` at e52b0aeae merged.

### What shipped, and the decisions 5.1 had to make

- `GET /api/projects/:id/startable` answers, beside `leaves`, `claimed` and `subtreeClaims`:
  `doesNotFit` (otherwise startable leaves whose demand does not fit, each with `fits: false`
  and `exhausted: { resourceId, name, unitLabel, asked, free, shortfall }`), `resources`
  (`{ resourceId, name, unitLabel, kind, capacity, occupied, free }` per stated capacity, in
  resource-id order) and `occupancyScope: 'project'`; every row of `leaves` carries
  `fits: true`. The endpoint description says occupancy is counted within the project only.
- **Unstated capacity is not listed** (not `capacity: null`): `docs/capacity.md` makes
  unstated the absence of a pair, constraining nothing, and `freeUnitsOf` already omits it.
  A stated 0 is listed and excludes any demand on it.
- **What fits means.** Fit asks `refuseOccupancy` what a `claimWorkItem` with no `resources`
  ask would carry, as `decideClaim` builds it after the PR #590 review: an unheld leaf its
  declared demand, a leaf some claim already holds its standing copy
  (`expandedUnitsOf(held, null)`), so a held leaf always fits, even when its demand was
  raised past the free units afterwards. `exhausted` is the first refused resource in
  resource-id order; `free` there excludes the leaf's own copy, the list's `free` does not.
- **Grouping is per leaf**, as `leaves` is: one leaf's demand covers all its steps (R2), so
  "steps listed apart" lists the leaf with its startable step ids under `doesNotFit`. The team
  filter applies to it as to `leaves`; `claimed` and `subtreeClaims` are unchanged.
- **Wire shape.** The four fit fields are optional on the wire for an outgoing be-01 mid-swap,
  as `PersonView.accountId` was; be-01's own answer is held to them by
  `startable-organization.controller.db.test.ts`. No endpoint added: the MCP tool count is
  unchanged; the OpenAPI document gains fields only.
- **Reads.** `startableWithin` reads capacities, demands and occupancy once each per project;
  the resource catalog only when a capacity is stated (the organization's under scoped access,
  the root `listResources()` under legacy access, the one `SCAN resource` in the plan).

Merge note: the first merge of `origin/plan/wbs-resources` into PR #590's slice had to name
occupancy holders beyond the near claims (`claimantNamesWithin` read only those), or
`claim-occupancy-race.db.test.ts` threw `names an absent person`; PR #590's review fixes then
carried the same resolution, and that merge took its side whole.

### Commands and results (worktree `/home/df/wd/puni/wt-startable-fit`)

- `env -u CLAUDECODE bun test ./libs/wbs/application/core/src/module/work-item/startable.test.ts`:
  16 pass, 0 fail.
- `env -u CLAUDECODE bun test ./libs/wbs/adapters/store-sqlite/src/startable-scope.db.test.ts`:
  3 pass, 0 fail.
- `env -u CLAUDECODE bun test ./apps/wbs/be-01/src/controller/startable-organization.controller.db.test.ts`:
  5 pass, 0 fail.
- `env -u CLAUDECODE bun test ./libs/wbs/domain/contracts/src/http/startable-shapes.test.ts`:
  2 pass, 0 fail.
- The four above with `claim-command.test.ts`, `claim-race.db.test.ts`,
  `claim-occupancy-race.db.test.ts`, `resource-occupancy.db.test.ts`: 93 pass, 0 fail.
- `env -u CLAUDECODE bun test ./apps/wbs/mcp-01/src/ ./apps/wbs/be-01/src/app.routes.test.ts
./libs/wbs/domain/contracts/src/`: 581 pass, 0 fail.
- `bunx tsc -p <config> --noEmit` for the lib and spec configs of contracts, core,
  conformance, store-memory, store-sqlite, be-01, mcp-01 and fe-01's app and spec: all exit 0.
- `env -u CLAUDECODE bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts`:
  15 pass, 0 fail (after `git add` of the new test file).
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 263 passed, 0 failed.
- Not run: the h2puni gate (the brief excludes it) and full Nx suites.

### Proofs (each check broken alone, the named test watched failing, restored)

- Fit check: `exhaustedOf` answering null failed `lists a leaf whose demand exceeds the free
units apart, with its shortfall`, `excludes any demand on a stated capacity of 0` and `keeps
the team filter on the leaves that do not fit` (startable.test.ts).
- Own-occupancy exemption: the declared demand asked of a held leaf too failed `fits a held
leaf whose demand was raised past the free units` (startable.test.ts).
- One occupancy read per project: the occupancy read once per row in `startableWithin`
  counted 32 `claim_occupancy` reads in `reads capacities, demands and occupancy once each,
whatever the number of leaves` (startable-scope.db.test.ts).
- Mid-swap wire: the four fit fields made required failed `reads a startable answer from a
release that knows no fit, as mid-swap` (startable-shapes.test.ts).

## Slice 2: occupancy on claims (tasks 2.1 to 2.3)

Implemented 2026-10-20 on `feat/wbs-resource-occupancy`, branched from `plan/wbs-resources`
(13bc46dbc) with `feat/wbs-resources-declaration` (775a7a7f, slice 1, PR open) merged in.
R3 and R4 are still assumed; the check lives in one function so either can be overturned there.

How "first claim on a leaf" is recorded: it is not a flag. `claim_occupancy (claim_id FK
claim cascade, resource_id FK resource cascade, units CHECK >= 1, PK (claim_id, resource_id))`
holds one row per claim and resource, and **every** claim row of a leaf carries a copy of the
leaf's whole vector. A leaf holds the largest copy per resource (`leafOccupancyOf`), never the
sum; the project's occupancy is the sum over leaves (`occupancyByResource`). A claim on a leaf
that already holds a claim copies the standing vector and acquires nothing (`acquired: []`)
unless its `resources` asks for more (review round 1, below); releasing one of two claims
leaves the other's copy, releasing the last takes the last copy by cascade. Rows on the first claim alone would have been freed
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

### Slice 2, review round 1 (PR #590 at 5d13cdeca)

`origin/plan/wbs-resources` at f3790cdaf (claims hand-down, PR #589) merged in first: 12
conflicted files, resolved keeping both sides; the claim's name read now also names the
occupancy holders (`resources_exhausted` names holders on other leaves, beyond the claim's
lineage).

- S1: `refuseReacquiring` folds leaf by leaf: each admitted leaf's rows join the occupancy
  snapshot before the next leaf of the same entry is checked. `undo of a cascading release
re-acquires leaf by leaf, refused once the second leaf no longer fits` (both stores):
  capacity 8, a subtree claim with delegated claims on X and Y (4 each), release, another
  account claims a third leaf (4), undo → `stale_undo` `resources_exhausted: …`, occupancy
  still 4. Watched failing before the fix and again with the admitted rows left out of the
  snapshot (undo answered ok, over capacity).
- S2-a: an `add_claims` entry without `occupancy` (claims slice 1, a release's undo, an
  outgoing colour mid-swap) reads as holding nothing; the field is optional on the command and
  every new entry writes it. `reads a claim replay written before occupancy as holding
nothing` (compensating.test.ts) and `undoes a release and redoes a claim journalled before
claim occupancy` (claim-race.db.test.ts, the field stripped from both journal columns by
  SQL) both failed with absence refused. Journal vocabulary admission: the swap's replay
  capability check (`tools/tool-deploy/src/k8s/replay-capability.ts`, runbook "Step blockage
  rollback") counts only `replace_blockage`, `move_progress_v1` and `delete_state_v1`.
  `add_claims`, `remove_claims`, `move_claims` and `set_demand` are not admission-checked
  today: an image older than the claims change fails such an undo or redo at `readCommand`
  as an unknown command, and an image with claims but not occupancy replays `add_claims`
  ignoring `occupancy` (the swap rule above covers it). Not added here.
- S2-b: on a held leaf a later claim's `resources` raises the standing copy: each entry at
  least what the leaf holds (`below_held_occupancy` otherwise), the larger copy checked by
  `refuseOccupancy` and written as that claim's copy; `acquired` is the difference. Order:
  `below_declared_demand`, `below_held_occupancy`, `resources_exhausted`. Tests: three domain
  cases, and on both stores `expands a held leaf's units on a later claim's ask, or refuses it`
  (capacity 8: acquired 4, occupancy 8; capacity 6: `resources_exhausted` asked 8 free 6) and
  `refuses a later claim asking for less than its leaf holds`. The `claimWorkItem` description
  states the rule and lists `steps_on_subtree`, `resources_on_subtree` and `no_steps` in its
  first-match order. The spec sentence on second claims is left to the plan branch.
- S3(1): mid-swap and rollback losses are in the migration header and in the runbook's "Team
  claims swap window and rollback" with the rule "no claim redo, and no release undo, from the
  outgoing colour during the swap window": an outgoing-colour claim acquires nothing and later
  claims on that leaf copy the empty vector; an outgoing-colour redo re-adds claims without
  rows; after an image rollback nothing reads or writes the table. None overcommits WBS's own
  check; all are silently missing occupancy.
- S3(2): a leaf gaining its first child (create) hands its `work_item_resource_demand` rows to
  the child, journalled as `set_demand` steps (forward: child set, parent cleared; inverse:
  parent restored before the child's delete); occupancy rows stay on the claims, which move in
  place. `hands a leaf's demand down to its first child, keeping the occupancy, and back on
undo` (both stores) failed with the write, the inverse and the redo steps each removed. A
  move that makes a leaf a parent is not changed here (a move under a claimed leaf is refused
  `destination_claimed` by PR #589; demands on a move are untouched, as before).
- Commands (2026-10-20, laptop, `env -u CLAUDECODE`): `bunx tsc --build` on the nine projects
  (fe-01 included): exit 0. `bun test` over 99 files (the 93 of the first run that remain plus
  every WBS test file the plan merge or this round changed, and the handoff test): 2101 pass,
  1 skip (the existing memory stale-undo case), 0 fail. Not run: the non-WBS test files the
  plan merge carried in (twilight-burokrat packaging and policy, tool-wiki, twilight-dash), 15 of
  which fail here without their build artifacts (`packed tarball is absent`); not this change's.
  `openspec validate --all --json`: 263 passed, 0 failed.
- S3(3): the occupancy read is service-level (`WorkItemService.occupancyOf`) until slice 5's
  startable fit exposes free units; no route now, so no MCP tool.

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
full gate (one other worker shared the laptop).

h2puni gate on `775a7a7f91e7e86c8acb7d5164bd62e246524dec`:

- Worker-clone run (`~/gate-resources-decl-775a7a7f.log`) printed `h2puni gate: running on
775a7a7f91e7e86c8acb7d5164bd62e246524dec` and ended `GATE_EXIT=1` on a clone artefact: the
  clone was blobless (`--filter=blob:none`), and all 27 failures were in
  `twilight-burokrat` `root-migration.test.ts` reading a historical blob (`git cat-file
2bc8742b…: bad file`). Every other task passed; the file passes locally (32 pass, 0 fail).
- Full-clone run (`~/gate-resources-decl-775a7a7f-r2.log`) ended `GATE_EXIT=75`: the
  three-hour heavy-lock queue budget expired before it ran.
- Shared-tree run pending: `~/gate-resources-decl-775a7a7f-tbf2.log`.

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

| Command (cwd)                                                                                                                        | Result                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `bun test ./src` (libs/wbs/domain/domain)                                                                                            | 1147 pass, 0 fail            |
| `bun test ./src` (libs/wbs/domain/contracts)                                                                                         | 151 pass, 0 fail             |
| `bun test ./src` (libs/wbs/application/core)                                                                                         | 1113 pass, 0 fail            |
| `bun test ./src` (libs/wbs/adapters/store-memory)                                                                                    | 190 pass, 0 fail             |
| `bun test ./src` (libs/wbs/application/conformance)                                                                                  | 35 pass, 0 fail              |
| `bun test ./src` (libs/wbs/adapters/store-sqlite)                                                                                    | 1693 pass, 0 fail            |
| `bun test ./src` (apps/wbs/be-01)                                                                                                    | 2930 pass, 0 fail (2933 ran) |
| `bun test ./src` (apps/wbs/mcp-01)                                                                                                   | 423 pass, 0 fail             |
| `bun test ./src` (apps/twilight-structure/twilight-navigator/cli)                                                                    | 97 pass, 0 fail              |
| `bun test ./src/contracts`, `./src/packaging/build.test.ts` (twilight-burokrat/cli)                                                  | 137 pass; 2 pass             |
| `bun test ./src/progress/record-progress.test.ts` (twilight-dash/cli)                                                                | 68 pass, 0 fail              |
| `TZ=UTC bunx vitest run` over wbs-api, directory-page, refusing-api and the 7 suites importing `plan-refusal`/`refusing-api` (fe-01) | 10 files, 530 pass           |
| `bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts` (root)                                                            | 15 pass, 0 fail              |
| `bunx tsc --build` domain, contracts, core, conformance, both stores, be-01, mcp-01, fe-01, Navigator, Burokrat, Dash                | no diagnostics               |
| `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts <migration.sql> <down.sql>`                                                | exit 0                       |
| `bunx @fission-ai/openspec@1.12.0 validate wbs-resources --json`                                                                     | 1 passed, 0 failed           |

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

- ~~**Undo of a delete and a duplicate do not carry demands.**~~ Closed by the follow-up below.
- Saved plans and the canonical schedule input carry no demands (slice 3.1); the tree read
  carries none (the resource read does); fe-01 is task 1.5.

## Slice 1 follow-up: demands and claims through delete, undo and duplicate

Branch `feat/wbs-demand-journal` (worktree `/home/df/wd/puni/wt-demand-journal`), on
`feat/wbs-startable-fit` with `feat/wbs-resource-levelling` and `plan/wbs-resources` merged.
Closes the gap PR #585's review found and the claims change's whole-change review recorded.

### What shipped, and the decisions it had to make

- **`SubtreeCopy.demands`** (required, so every writer states it) and
  **`RestoreSubtree.demands`** (optional: an older journal recorded none and restores none).
  Both stores write them inside the subtree write: SQLite inserts `work_item_resource_demand`
  rows in the same transaction; memory writes through its demand store and throws on any answer
  but `written`.
- **Delete** reads the project's demands before the cascade and the inverse `restore_subtree`
  carries the removed rows' demands (the whole branch on a cascade, the one row on a
  promotion). **Redo** needs nothing new: the delete's cascade takes them again on both stores.
- **Duplicate** copies the subtree's demands to the copies (same resources, same units), in
  the `SubtreeCopy` and in the journalled `restore_subtree`, so redo of a duplicate brings
  them back and undo takes them with the copies.
- **A restore whose demanded resource was deleted since** is refused before writing, as
  `stale_undo` with `a resource it demanded is no longer in the directory.`.
- **The journal decoder** validates a restore's `demands` (whole units from 1, a non-empty
  resource id, a row the restore writes), and `referencesOf` names their resources, so an
  organization-scoped replay checks them like a `set_demand`'s.
- **Claims are carried, but not through `SubtreeCopy`.** The delete's inverse becomes
  `batch [restore_subtree, add_claims { claims, stated: [], occupancy }]`. `add_claims` is the
  vocabulary the undo of a release already uses: `ClaimStore.add` writes claims and occupancy
  in one transaction and answers `taken` / `unknown_resource`, and its replay already runs
  `refuseReacquiring`, so a restored claim that no longer fits answers `stale_undo` with
  `resources_exhausted:` detail. Copying that into both stores' subtree writes would have been
  a second claim writer with its own refusals. The batch runs inside the replay's outer
  transaction, so a refused `add_claims` rolls the restore back too (ADR 0007).
- **Which claims a delete takes:** every claim on a removed row, and every claim delegated
  under one of those, transitively (the parent reference cascades), so a promoting delete's
  children get back the claims delegated under the removed parent's subtree claim. Ordered
  parents first, the order the parent reference needs.
- **Two new `add_claims` replay guards** (they also cover the existing undo of a release and
  redo of a claim): a delegated claim goes back only under a parent claim still held, and only
  for a person the directory still holds. Both were foreign-key 500s on SQLite and silent
  successes on memory.
- **The core harness** (`inMemoryServices`) now cascades demands when a row is removed, as
  `bindStores` and SQLite do.
- **Pin:** `writeRoots` in `organization-bridge.db.test.ts` is asserted to write one root per
  `OWNED_ROOT_KINDS` entry, in order, including `resource`.

### Commands and results (fresh, after the last edit)

All with `env -u CLAUDECODE`, from the worktree root, explicit `./` paths; no full suites and
no h2puni gate (laptop, other workers running).

| Command                                                                                                                                                                                                                                                                                                                                                                     | Result                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `bun test ./libs/wbs/adapters/store-sqlite/src/resource-occupancy.db.test.ts` (memory and SQLite)                                                                                                                                                                                                                                                                           | 52 pass, 0 fail             |
| `bun test` over the 57 core files in `module/work-item`, `module/plan-commands`, `module/plan-import`, `service`, `testing`                                                                                                                                                                                                                                                 | 828 pass, 0 fail            |
| `bun test` over 13 store files (resource-occupancy, organization-bridge, organization-ownership, work-item, working-plan-order, both `faults.test.ts`, both source-conformance files, claim-race, claim-occupancy-race, step-blockage-activation, memory-source)                                                                                                            | 406 pass, 0 fail            |
| `bun test` over 19 conformance and be-01 files (step.controller, certification, case-manifest, existing, undo, undo.controller, command-organization, typed-dependency-copy, delete/duplicate/restore-step-parallel, step-node-attempt, step-node-blockage, revision, plan-commands, priority-band-identity, capacity-migration-identity, resource-schedule, migration-cli) | 529 pass, 0 fail            |
| `bun test` over core `module/step` and memory step test files                                                                                                                                                                                                                                                                                                               | 35 pass, 0 fail             |
| `bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                                                                                                                                                                                                                                                                                                        | 15 pass, 0 fail             |
| `bunx tsc -p <tsconfig.lib.json and tsconfig.spec.json> --noEmit` for core, store-memory, store-sqlite, conformance, be-01                                                                                                                                                                                                                                                  | no diagnostics (10 configs) |
| `bunx eslint` over every changed `.ts` file                                                                                                                                                                                                                                                                                                                                 | no problems                 |
| `bunx @fission-ai/openspec@1.12.0 validate wbs-resources --json`                                                                                                                                                                                                                                                                                                            | 1 passed, 0 failed          |

### Proofs (each fault injected alone, the named test watched failing on the stores named, restored)

| Check                                              | Fault injected                            | Failing test                                                                                                                                                                                 |
| -------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| delete's restore carries the removed rows' demands | list emptied                              | `undo of a delete puts the demands back exactly…`, `undo of a cascading delete puts every row’s demands back` (memory, SQLite)                                                               |
| duplicate copies demands                           | the copy's list emptied                   | `duplicate copies the demands with the subtree…` (memory, SQLite)                                                                                                                            |
| `applyRestore` passes demands to the subtree write | `[]` passed                               | the delete-undo and duplicate cases (memory, SQLite)                                                                                                                                         |
| SQLite subtree write inserts demands               | insert skipped                            | the same two cases, SQLite only                                                                                                                                                              |
| memory subtree write writes demands                | loop skipped                              | the same two cases, memory only                                                                                                                                                              |
| restore refuses a deleted resource                 | refusal off                               | `refuses an undo of a delete whose demanded resource was deleted since` (SQLite: FOREIGN KEY failure; memory: `unknown_resource` thrown)                                                     |
| claims carried by the delete's inverse             | `restore` answered alone                  | `undo of a delete puts the claims and their occupancy back…`, `refuses an undo of a delete resources_exhausted…`, `undo of a promoting delete puts back the subtree claim…` (memory, SQLite) |
| delegation closure                                 | closure skipped                           | `undo of a promoting delete puts back the subtree claim and the claims delegated under it` (memory, SQLite)                                                                                  |
| parent-claim guard on `add_claims`                 | guard off                                 | `refuses an undo of a delete once the claim it was delegated under was released` (SQLite: FOREIGN KEY failure; memory: answered ok)                                                          |
| claimant guard on `add_claims`                     | guard off                                 | `refuses an undo of a delete once the claimant was removed from the directory` (SQLite: FOREIGN KEY failure; memory: answered ok)                                                            |
| step guard in `applyRestore`                       | refusal removed                           | `refuses an undo of a delete once a step its claims and progress name was removed` (SQLite: FOREIGN KEY failure; memory still refused by the `add_claims` guard)                             |
| step guard in the `add_claims` replay              | both step refusals removed                | the same case (SQLite: FOREIGN KEY failure; memory: `progress for unknown step` thrown)                                                                                                      |
| memory step removal takes the project's step       | removal skipped                           | the same case, memory only (answered ok)                                                                                                                                                     |
| decoder: restored demands                          | call removed                              | `refuses a malformed restored demand` (compensating.test.ts)                                                                                                                                 |
| `referencesOf`: restored demands' resources        | loop removed                              | `names the resources a restore’s demands name` (compensating.test.ts)                                                                                                                        |
| harness demand cascade                             | cascade removed                           | `takes a removed row’s demands, so a row put back without them reads none` (harness.test.ts)                                                                                                 |
| root-kind pin                                      | resource insert dropped from `writeRoots` | `writes one root of every owned kind…` (organization-bridge.db.test.ts, length 8 vs 9)                                                                                                       |

The `resources_exhausted` path is `refuseReacquiring`, reused, not new; its existing proof
stands, and the new case watched it answer the undo of a delete.

### What it leaves open

- ~~**A restored claim on a step removed since.**~~ Reproduced in review of `de196126b` and
  wider than claims: claim leaf 0, delete it, `steps.remove(…, cascade)` answers ok, and the
  undo threw a FOREIGN KEY failure on SQLite (the `restore_subtree` progress write, before
  `add_claims`) and silently restored the progress and two claims onto the removed step on
  memory. Only estimates were guarded (`estimateStepsOf`). Now guarded: `applyRestore` and the
  `add_claims` replay refuse `stale_undo` (`step <id> has been removed from this project
since.`) for any step `referencesOf` reads off the command (progress, assignments, attempts,
  blockages, claims). Memory needed one more change: its step removal now also takes the step
  off the project's own step list, as SQLite's single `step` table does; before, the service's
  `projects.stepsOf` read kept listing a removed step.
- **The conformance suite's `subtrees.insertSubtree:complete-copy` case carries no demand**
  (its seed declares no resource); both stores' demand writes are proved through the runner
  cases above instead.
- S4, recorded: **`inMemoryStores` (`in-memory-source.ts`)** passes its demand store to the
  subtree write but, like before, does not cascade demands or claims on removal; only
  `bindStores` (the memory source) and the core harness do.
- S4, recorded: **the harness cascade ignores an overriding demand store**: `inMemoryServices`
  cascades its own resource tables, so a caller passing `demands` over other tables gets no
  cascade.
- S4, recorded: **`apps/wbs/be-01/tools/capture-capacity-oracle.ts` is dead code** excluded from
  every tsconfig; its `inMemorySubtrees` call was left as it was.
- **PR #582's activation test** iterates `OWNED_ROOT_KINDS`, but its fixture seeds no
  `resource` (nor `saved_plan`) row, so those iterations compare 0 with 0. When it lands beside
  this change it should seed one row of each kind and assert a non-zero mapped count per kind;
  the constant itself is pinned here.

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
  `capacityResource`. The HTTP slice contract admits it (additive), and the tree read
  carries `resourceLabels` (one `{ id, name, unitLabel }` per resource a displayed bar
  names, under the organization's names) so fe-01 can say it; see "Task 3.4" below.
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

| Check                                               | Fault                        | Failing test (result)                                                                                                             |
| --------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| resource claims in `claimsOf`                       | resource half `[]`           | seven `schedule-resources.test.ts` cases (7/7: staging both paths, 32 GB, both vector cases, pinned overlap, no-capacity refusal) |
| `capacityResource` absent when unbound              | `null` on every slice        | both corpus byte cases and the staging case                                                                                       |
| `capacityResource` named                            | `null` for a resource        | the five cases naming a resource                                                                                                  |
| `refuseMalformedDemands`                            | call removed                 | `refuses a demand below one unit, a resource named twice and an unsorted vector`                                                  |
| `chargedDemandsOf` unstated skip                    | demand charged unclamped     | `leaves a demand on an unstated capacity unconstrained`                                                                           |
| canonical `demands` entry                           | left out                     | `hashes a demand…` (1 key for 5 plans), `moves the key when a demand edit moves a placement` (39/2)                               |
| canonical `resourceCapacities` entry                | left out                     | `hashes a resource capacity` (40/1)                                                                                               |
| `slicesOf` vector                                   | `{}`                         | `serialises two leaves on the one staging environment and names it`                                                               |
| `canonicalScheduleParts` capacities                 | left out                     | both levelling cases of `resource-schedule.test.ts` threw `no capacity for resource`                                              |
| isolated tree read demands                          | `[]`                         | `levels a demanded resource (isolated)` (resource-schedule.controller.db.test.ts)                                                 |
| SQLite capture demands                              | `[]`                         | `levels a demanded resource (shared)`; isolated twin passed                                                                       |
| memory capture demands and capacities               | `[]`                         | `captures demands and resource capacities detached from later memory writes`                                                      |
| runtime-portable forwards capacities                | `NO_CAPACITIES`              | `hands the resource capacities to Fast`, `forwards all … Fast arguments`                                                          |
| builder `demands` / `resources` / no-capacity throw | `[]` / `{}` / skip           | `resource-wire.test.ts` golden bytes, carried vector, no-capacity refusal (3, 2 and 1 fail)                                       |
| re-validator resource sweep / capacity presence     | loop emptied / check emptied | staging and divisible overload cases accepted (50/2); unstated resource accepted (51/1)                                           |
| supervisor admits wire 4                            | list back to 1 to 3          | `carries resource demands and capacities on solver wire 4 unchanged`                                                              |
| `model.py` resource cumulative                      | loop over `{}`               | `test_resources.py`: staging and 32 GB at makespan 10, vector overlap (3/13); parity cases (3 fail)                               |
| `validate.py` invariant (10)                        | loop over `[]`               | the four invariant cases, `RequestRejected not raised` (4/13)                                                                     |

Not a check, recorded so it is not mistaken for one: `projectSharedTree` hands the snapshot's
demands to the canonical seam, but the shared schedule was computed on the snapshot; `[]`
there changed no test.

### Not run, and why

- The h2puni gate (the orchestrator gates the plan head), the full Nx suites, the whole
  be-01 and store-sqlite suites (targeted files instead), the whole fe-01 suite (the files
  3.4 touches ran; see "Task 3.4").

### After merging `plan/wbs-resources` 75d6bf61f (claims handdown)

Four conflicts, each two additions kept side by side (fe-01 refusal cases, the
conformance case lists). Two type errors the merge surfaced were fixed: slice 1's
`resource-command.test.ts` claim-store wrapper gained `moveAll`, and
`startable-scope.db.test.ts` (already failing to typecheck on the plan head) states
`assign: false`. Re-run: `tsc -p … --noEmit` over 14 configs clean; domain 1169 pass /
1 skip, contracts 491, core 1135, store-memory 193, conformance 35, seven store-sqlite
files 185, six be-01 files 244; 0 fail everywhere.

### Task 3.4 (sentence half) and the review fixes of PR #591

fe-01 refused `boundBy: 'capacity'` with `capacityTeamId: null` as malformed and replaced the
whole Gantt with its fault banner, so the first plan stating a resource capacity and a demand
lost its chart. Fixed on this branch:

- be-01's tree read carries `resourceLabels` (`{ id, name, unitLabel }` per resource a
  displayed bar names): the isolated read labels from the root catalog and `treeWithin`
  relabels under the organization's names, as it does assignees; the shared read labels from
  the snapshot's own catalog (`PlanInputReads.resources`, read by both stores' capture under
  the caller's scope). Absent when no bar names a resource. A named resource the read cannot
  label throws.
- fe-01: `SliceView.capacityResource`, `ChartRead.resourceLabels`,
  `GanttPlan.resourceLabels`. The capacity arm of `floorWordsOf` names a resource's wait
  ("Waits for staging to free 1 env — after strip (Dev)"), which the chart's hover and the
  table's start reason (`startFloorByRow`) both read; a capacity floor with neither team nor
  resource still throws "names no team"; an unlabelled resource throws in the chart and
  leaves only that row's reason blank in the table. The per-resource facet is open (the
  tree read carries no demands to filter by).
- `resource-schedule.controller.db.test.ts` parses the body through `getWorkItems`, the
  reader fe-01's client parses this route with, and asserts the labels in both modes.
- The package copies of `solver-wire.v2.json` and `.v3.json` are restored (the wire 4
  rename had reached v3's `$id` and v2's quantum comment there only); `test_schema_copy.py`
  now asserts every `solver-wire.v*.json` pair is byte-identical.
- The builder's capacity-below-1 and demand-above-capacity refusals have tests and Proofs;
  the clamp in `chargedDemandsOf` has its Proof; the `claimsOf` row above is corrected to
  seven cases.

Proofs (watched 2026-10-20): the fe resource branch disabled, 217/2 in
gantt-geometry.test.ts; the unlabelled throw softened to words, 218/1; the scoped relabel
left as root labels, `levels a demanded resource (isolated)` failed; the shared labels left
off, its shared twin failed; the builder's two refusals disabled, one case each; the clamp
removed, 13/1; a package v3 `$id` set to v4, the new schema-pair case failed naming
`solver-wire.v3.json`.

Runs after the last edit: `tsc -p … --noEmit` over 16 configs, 0 errors. Domain 1169 pass /
1 skip, contracts 493, core 1135, store-memory 193, conformance 35, runtime-portable 34,
mcp-01 423, five store-sqlite files 142, eight be-01 files 242; 0 fail everywhere.
`TZ=UTC bunx vitest run` over ten fe-01 files (gantt-geometry, plan-chart-input,
gantt-panel, gantt-panel-fill, plan-chart-seam, plan-table, wbs-api, plan-refresh,
project-page, attempt-actions): 808 pass. `bunx nx run wbs-solver-py:test` with the
worktree venv on PATH: Ran 259 tests, OK.
