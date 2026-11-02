## 0. Readings and landing order

- [x] 0.1 Dany confirms or amends design.md S1 to S12: first alternative A (organization
      occupancy) over B (shares) and C (Dash admission only), then the S5 carve-out (units
      of a shared resource are an organization fact, an exception to `wbs-permissions`'
      "ungranted is absent"), an explicit waiver of R5's production-path negative for the
      S5 redaction until a grant can deny, S7 (clamp, no portfolio levelling) and S10
      (limits). If A holds, record it as an ADR. Done 2026-11-01: Dany accepted S1 to S12
      whole, alternative A and the S5 carve-out included, and that acceptance waives R5's
      production-path negative for the S5 redaction until a grant can deny. The S1 ADR is
      still owed.
- [ ] 0.2 (Its sentences are amended in this branch with pointers to S9, since it landed first
      in #735; the agreement is still open.) The owner of `wbs-resource-release` agrees to S9: this change supersedes that
      change's six sentences on claim occupancy and schedule inputs, and whichever change
      lands second amends the other.
- [ ] 0.3 Archive order: `wbs-resources`, `wbs-organization-limits` and `compute-providers`
      are archived before this change, since its MODIFIED deltas need their specs (validate
      reports the archive refusal until then).
- [ ] 0.4 Landing order with `wbs-work-packages` (#698, project → work package): if it lands
      first, every slice here takes its renames (routes, fields, `projectId` on holders);
      if this lands first, #698's rename sweep covers this change's names.

## 1. Directory capacity (no claim effect)

- [x] 1.0 Migration `widen_organization_audit_directory_capacity`: the compatible rebuild of
      `organization_audit` carrying the whole current action and subject-kind vocabulary
      plus `directory_capacity_changed` and `resource`, as
      `20261022140100_widen_organization_audit_compute_providers` did; guarded `down.sql`
      — test: the forward test seeds one row per existing action and subject kind and finds
      each after the rebuild; back refuses with one new-value row; migration lint passes.
      Fault lines: drop one existing action from the rebuilt CHECK and the seeded row fails
      the forward test; drop the guard and the rollback runs over a
      `directory_capacity_changed` row the old CHECK rejects, and the refusal test fails.
- [x] 1.1 Migration `add_resource_directory_capacity` with CHECK
      `typeof(units) = 'integer' AND units >= 0`, cascade from `resource`, guarded
      `down.sql` — test: forward, back, refusal with one row; a text `'16'` is refused.
      Fault lines: drop the guard and the rollback test deletes a stated capacity; drop the
      `typeof` half and the text row is stored.
- [x] 1.2 `setDirectoryCapacity` on both `POST /api/directory/commands` and
      `POST /api/projects/:id/commands`, through one check: admin or super-admin in their own
      session or own MCP session; `forbidden` for other roles, machine principals and MCP
      consent delegations acting as an agent (both capped at member by `organizationRoleOf`); `organization_required` for a legacy resource; not
      journalled; one audit row; resource reads carry `directoryCapacity`; `deleteResource`
      counts and cascades it — test: route tests per role on both routes and both stores,
      including "an admin's agent over MCP is refused forbidden" and "an admin's own MCP session
      is applied". Fault lines: skip the role check and the member's write lands; answer the
      stored role in place of `organizationRoleOf` and the admin's agent writes 16; skip the audit write and the audit test finds no row; skip the
      organization check and a legacy resource takes a capacity.
- [x] 1.3 Announce (S7): every applied `setDirectoryCapacity` publishes `directory_changed`
      through `DirectoryService.announce` to each project that demands, states or holds the
      resource — test: the spec's roll-up scenario. Fault line: skip the announce and a
      space roll-up serves the stale dates scheduled against 32. (Built: the publication to
      every project that states or demands the resource, proven on the memory twin; the
      roll-up half of the scenario needs the clamp of 6.1 and is proven there. Review S3-1,
      2026-11-01: a project holding it only through a claim's `resources` is told too, on
      both stores, proven by the holder case of `directory-capacity.controller.db.test.ts`
      and the `directory.setDirectoryCapacity:state-clear-remove` certification.)
- [x] 1.4 Preview endpoint `POST /api/organization/resources/:resourceId/directory-capacity/preview`
      (S12), admin only — test: the spec's preview scenario; row count and audit count
      unchanged; a member and an admin's agent refused `forbidden`. Fault line: write
      before answering and the unchanged-count assertion fails.
- [x] 1.5 Route inventory: add both new routes to `ORGANIZATION_ROUTE_INVENTORY`
      (`apps/wbs/be-01/src/testing/organization-route-inventory.ts`) with their policies
      — test: `organization-context.controller.db.test.ts`. Fault line: register a route
      without its inventory entry and the inventory test fails. (Built for the preview; the
      occupancy route's entry lands with 4.2, which adds the route.)

## 2. Domain: both scopes in one check

- [x] 2.1 `refuseOccupancy` takes the project's rows and the organization's rows for the
      asked resources plus directory capacities; shortages carry `scope`; held units never
      refuse — test: one case per spec scenario (16 GB, staging, ceiling, tie, two leaves
      in one batch); fast-check model run over two projects: organization occupancy never
      exceeds a stated directory capacity after any sequence of claims, releases, undos and
      redos. Fault line: pass only the project's rows and the model run finds the 32-of-16
      sequence.
- [x] 2.2 Unstated directory capacity decides as before — test: the existing
      `claim-occupancy.test.ts` suite unchanged and green. Fault line: treat unstated as 0
      and every claim with a demand is refused.

## 3. Store and command path

- [x] 3.1 `ClaimStore.organizationOccupancyOf(resourceIds)` on SQLite and memory, joined to
      `project_organization` so each row carries its project's organization, read on the
      batch's own connection after the batch took its turn; exposed unfenced and read
      through by the working plan — conformance tests on both stores, including "a working
      plan sees its own batch's earlier claim in organization occupancy". Fault lines:
      (a) read the organization's occupancy before the batch takes its turn and 3.2's race
      admits both claims; (b) read it on the observation connection and a two-claim batch
      takes 20 of 16 (the second claim does not see the first's uncommitted row).
- [x] 3.2 Cross-project race — test: `claim-occupancy-cross-project-race.db.test.ts`, two
      concurrent claims in A and B asking 10 of 16, in one process and across two
      connections as `delegation-use-race.worker.ts` does; exactly one applied. Fault line:
      skip the organization check and both are stored (20 of 16).
- [x] 3.3 Amend ADR 0015 with the rule "a check that reads across projects needs the
      source's lock to cover the organization"; add the source-conformance case: a batch
      claiming a resource with a directory capacity excludes a concurrent batch of another
      project of the organization. Fault line: a conformance fake source that locks per
      project only admits both, and the case fails. (Built as case (m), which proves the
      store-wide turn every source has: `UnitOfWork.run` takes no key, so the per-project
      fault cannot be expressed until a source keys its coordinator; the ADR says so. Its
      fault line is a memory coordinator granting every turn at once.)
- [x] 3.4 Redo, undo of a release, undo of a cascading release (leaf by leaf, all or
      nothing), undo of a delete (`withClaimsRestored`), lease sweep — test: journal round
      trips in `resource-occupancy.db.test.ts` with a second project, one per spec
      scenario. Fault lines: skip the organization rows on the undo path and the undo
      re-acquires 16 over B's 16; check only the first leaf of a cascade and the second
      leaf's claims return over capacity.
- [ ] 3.5 Measure on a fixture of 50 projects with 20 standing claims each: a claim batch's
      p99 latency with a directory capacity stated against the same batch without one, 200
      runs each. Pass: the organization read adds at most 5 ms at p99 and at most 25 % to the
      batch's p99. Fail: either bound crossed; then an index on
      `claim_occupancy (resource_id, claim_id)` or a per-resource sum query comes first.
      Recorded in verify.md.

## 4. Visibility

- [ ] 4.1 Port method `OrganizationAccess.mayReadProjectWithin(project, actorId, access)`,
      in `mayEditProjectWithin`'s argument order, `project` carrying its `organizationId`;
      production body true for every project of the caller's organization; holder
      `projectId`; unreadable holders folded into `hiddenHolders: { units }` in the refusal
      and the startable read — test: a test double of the port denies project A, and the
      reader gets units only (string search over the whole body for A's project, person,
      run and work item ids). Fault line: return holders unfiltered and the string search
      finds A's ids. No production-path negative exists until a `wbs-permissions` grant can
      deny (waived in 0.1, 2026-11-01); the negative moves to the production path in the
      `wbs-permissions` slice that replaces the method's body. Follow-up (review S3-4):
      `previewDirectoryCapacityWithin` hardcodes `hiddenProjects: { count: 0, units: 0 }`
      and names every project; it must route through the read grant when `wbs-permissions` lands.
- [ ] 4.2 `GET /api/organization/resources/:resourceId/occupancy` (S12) with
      `releasableBy` — test: the two spec scenarios; a member and an admin's agent
      refused `forbidden`. Fault lines: skip the role check and the member reads other
      projects' holders; answer `claimant_or_admin` for a restricted project and the
      restricted scenario fails.

## 5. Startable read, resources read, MCP

- [ ] 5.1 Per-entry `occupancyScope`, `directory`, the organization-scope `capacity`,
      `occupied` and `free`; listed only when demanded or stated; `exhausted.scope`;
      top-level `occupancyScope` kept `'project'` — test: contract shape tests, the spec
      scenarios, and the old-shape parse ("An old client reads a shared resource"); the
      no-directory-capacity case compares fit, occupied and free projections, not whole
      bodies. Fault lines: compute `free` from the project alone and "B sees what A holds"
      lists B's leaf as startable; emit a new top-level literal and the old-shape parse
      fails.
- [ ] 5.2 Descriptions: `startable-shapes.ts` (drop "claims in other projects … are not
      subtracted", say which entries count across the organization) and the project
      resources read in `resource-shapes.ts` ("a resource absent here is unstated and
      constrains nothing" becomes true only without a directory capacity); the project
      resources read gains `directoryCapacity` and `directory` totals, no holders — test:
      the MCP tool-description snapshot moves by exactly these sentences.

## 6. Schedule input

- [ ] 6.1 `effectivePoolSizesOf(projectCapacities, directoryCapacities, demandedResourceIds)`
      in `@wbs/domain`, called at every site that builds a schedule input: the four
      `canonicalScheduleParts` callers in `work-item.resource.ts`,
      `store-sqlite/src/saved-plan-capture.ts`, `store-sqlite/src/chain-snapshot.ts`, the
      twins in `store-memory/src/source.ts`, `module/saved-plans/saved-plan-schedule.ts` and
      `domain/src/publication-guard.ts`; `PlanInputReads` gains `directoryCapacities` read on
      the capture snapshot. No contract bump and no engine change — test: golden corpus
      byte-identical; the 32-of-16 scenario serialises in Fast and CP-SAT and changes the
      hash; a directory capacity of 0 clamps to 0; a saved plan keeps its captured clamp.
      Fault lines: leave `saved-plan-capture` unclamped and the saved plan's hash differs
      from the live hash; hash the unclamped capacity and an edit of the directory capacity
      serves a stale cached schedule.

## 7. Limits, adoption, UI, operator

- [ ] 7.1 Limits (S10): `capacity_limit` on `setDirectoryCapacity` with `declared: 0`;
      per-project units ≤ cap alone while a directory capacity is stated; clearing above the
      summed cap refused with `declared: <sum>, asked: 0` unless `confirm: true`; usage
      entries carry `countedFrom` — test: the spec scenarios. Fault lines: drop the cap
      check and 65 over 64 is stored; drop the clear check and an unconfirmed clear leaves 96
      over 64.
- [ ] 7.2 Adopt measured writes `setDirectoryCapacity` when one is stated (MODIFIED
      `compute-provider`) — test: the adoption scenario and its Undo. Fault line: keep
      writing `setResourceCapacity` and the test finds a project capacity written and the
      directory capacity unchanged.
- [ ] 7.3 fe-01: the organization's resources view shows and, for admins only, edits the
      directory capacity with the preview before a lowering or clearing, and the occupancy
      read with `releasableBy`; project settings show "16 of 16 held, 16 in other projects"
      — test: rendering tests per role; eye review per the UI acceptance rule. Fault line:
      render the edit control whatever the role and the member and viewer rendering tests
      find it.
- [ ] 7.4 Runbook line in `docs/runbook-prod-deploy.md` and `docs/runbook-dev-deploy.md`:
      state directory capacities only after a blue/green swap completes. Operator: state
      dev's `host ram` and `staging`, rerun the swarm rehearsal check 4 (`g4-multi.ts`)
      expecting B refused and `staging` refused in B; record in verify.md.
      (Runbook lines written, with the audit rollback's manual completion command; the
      operator half waits for a dev deploy.)
