## 0. Readings before any slice

- [ ] 0.1 Dany confirms or amends design.md S1 to S12: first alternative A (organization
      occupancy) over B (shares) and C (Dash admission only), then the S5 carve-out (units
      of a shared resource are an organization fact, an exception to `wbs-permissions`'
      "ungranted is absent"), S7 (clamp, no portfolio levelling) and S10 (limits). If A
      holds, record it as an ADR.
- [ ] 0.2 The owner of `wbs-resource-release` agrees to S9: this change supersedes that
      change's five sentences on claim occupancy and schedule inputs, and whichever change
      lands second amends the other.
- [ ] 0.3 Archive order: `wbs-resources`, `wbs-organization-limits` and `compute-providers`
      are archived before this change, since its MODIFIED deltas need their specs (validate
      reports the archive refusal until then).

## 1. Directory capacity (no claim effect)

- [ ] 1.0 Migration `widen_organization_audit_directory_capacity`: the compatible rebuild of
      `organization_audit` carrying the whole current action and subject-kind vocabulary
      plus `directory_capacity_changed` and `resource`, as
      `20261022140100_widen_organization_audit_compute_providers` did; guarded `down.sql`
      — test: forward keeps every existing row, back refuses with one new-value row,
      migration lint passes. Fault lines: drop one existing action from the rebuilt CHECK
      and the forward test fails on a stored row; drop the guard and the rollback runs over a
      `directory_capacity_changed` row the old CHECK rejects, and the refusal test fails.
- [ ] 1.1 Migration `add_resource_directory_capacity` with the `units >= 0` CHECK, cascade
      from `resource`, guarded `down.sql` — test: forward, back, refusal with one row.
      Fault line: drop the guard and the rollback test deletes a stated capacity.
- [ ] 1.2 `setDirectoryCapacity` on the directory command route: admin and super-admin only;
      `legacy_resource` added to the refusal union (`contracts/src/http/refusal.ts`) and its
      shape; not journalled; one audit row; resource reads carry `directoryCapacity`;
      `deleteResource` counts and cascades it — test: route tests per role on both stores.
      Fault lines: skip the role check and the member's write lands; skip the audit write and
      the audit test finds no row; skip the legacy check and a legacy resource takes a
      capacity.
- [ ] 1.3 `dryRun: true` preview (S12) — test: the spec's preview scenario; nothing written
      (row count and audit count unchanged). Fault line: write before answering and the
      unchanged-count assertion fails.

## 2. Domain: both scopes in one check

- [ ] 2.1 `refuseOccupancy` takes the project's rows and the organization's rows for the
      asked resources plus directory capacities; shortages carry `scope`; held units never
      refuse — test: one case per spec scenario (16 GB, staging, ceiling, tie, two leaves
      in one batch); fast-check model run over two projects: organization occupancy never
      exceeds a stated directory capacity after any sequence of claims, releases, undos and
      redos. Fault line: pass only the project's rows and the model run finds the 32-of-16
      sequence.
- [ ] 2.2 Unstated directory capacity decides as before — test: the existing
      `claim-occupancy.test.ts` suite unchanged and green. Fault line: treat unstated as 0
      and every claim with a demand is refused.

## 3. Store and command path

- [ ] 3.1 `ClaimStore.organizationOccupancyOf(resourceIds)` on SQLite and memory, joined to
      the resource's organization, read on the batch's own connection after the batch took
      its turn, not fenced to one project and not cached by the working plan — conformance
      tests on both stores, including "a working plan rereads organization occupancy after
      its own add". Fault lines: (a) read the organization's occupancy before the batch
      takes its turn and 3.2's race admits both claims; (b) read it on the observation
      connection and a two-claim batch takes 20 of 16; (c) cache it in the working plan and
      the reread case over-admits.
- [ ] 3.2 Cross-project race — test: `claim-occupancy-cross-project-race.db.test.ts`, two
      concurrent claims in A and B asking 10 of 16, on one process and across two
      connections as `delegation-use-race.worker.ts` does; exactly one applied. Fault line:
      skip the organization check and both are stored (20 of 16).
- [ ] 3.3 Source-conformance case for the lock rule (S4): a batch claiming a resource with a
      directory capacity excludes a concurrent batch of another project of the
      organization. Fault line: a conformance fake source that locks per project only
      admits both, and the case fails.
- [ ] 3.4 Redo, undo of a release, undo of a cascading release (leaf by leaf, all or
      nothing), undo of a delete (`withClaimsRestored`), lease sweep — test: journal round
      trips in `resource-occupancy.db.test.ts` with a second project, one per spec
      scenario. Fault lines: skip the organization rows on the undo path and the undo
      re-acquires 16 over B's 16; check only the first leaf of a cascade and the second
      leaf's claims return over capacity.
- [ ] 3.5 Measure the organization-wide read inside the write turn on a 50-project fixture;
      record p50 and p99 in verify.md.

## 4. Visibility

- [ ] 4.1 Production `mayReadProjectWithin(access, projectId)` on
      `ports/organization-access.ts`, true for every project of the caller's organization
      today; holder `projectId`; unreadable holders folded into `elsewhere: { units }` in
      the refusal, the startable read and the resources read — test: through the port seam,
      a reader denied project A gets units only (string search over the whole body for A's
      project, person, run and work item ids). Fault line: return holders unfiltered and the
      string search finds A's ids. No production-path negative exists until a
      `wbs-permissions` grant can deny; verify.md records that, and the negative moves to the
      production path in the `wbs-permissions` slice that replaces the predicate's body.
- [ ] 4.2 Admin per-project occupancy view with holding claims and who may release them
      (S12) — test: the spec scenario, member refused `forbidden`. Fault line: skip the role
      check and the member reads other projects' holders.

## 5. Startable read and MCP

- [ ] 5.1 Per-resource `occupancyScope`, `directoryCapacity`, `occupiedElsewhere`, `free`;
      listed only when demanded or stated; `exhausted.scope`; top-level
      `'project' | 'organization' | 'mixed'`; MCP description text — test: contract shape
      tests and the spec scenarios; the no-directory-capacity case compares fit, occupied
      and free projections, not whole bodies. Fault line: compute `free` from the project
      alone and "B sees what A holds" lists B's leaf as startable.

## 6. Schedule input

- [ ] 6.1 `effectivePoolSizesOf(projectCapacities, directoryCapacities)` in `@wbs/domain`,
      called at every site that builds a schedule input: the four `canonicalScheduleParts`
      callers in `work-item.resource.ts`, `store-sqlite/src/saved-plan-capture.ts`,
      `store-sqlite/src/chain-snapshot.ts`, the twins in `store-memory/src/source.ts`,
      `service/saved-plan-schedule.ts`, `module/saved-plans/saved-plan-schedule.ts` and
      `domain/src/publication-guard.ts`. No contract bump and no engine change:
      `resourceCapacities` is already hashed — test: golden corpus byte-identical; the
      32-of-16 scenario serialises in Fast and CP-SAT and changes the hash; a directory
      capacity of 0 clamps to 0. Fault lines: leave `saved-plan-capture` unclamped and the
      saved plan's hash differs from the live hash; hash the unclamped capacity and an edit of
      the directory capacity serves a stale cached schedule.

## 7. Limits, adoption, UI, operator

- [ ] 7.1 Limits (S10): `capacity_limit` on `setDirectoryCapacity`; per-project units ≤ cap
      alone while a directory capacity is stated; clearing above the summed cap refused
      unless `confirm: true`; usage read reports the directory capacity with `source` —
      test: the spec scenarios. Fault lines: drop the cap check and 65 over 64 is stored;
      drop the clear check and an unconfirmed clear leaves 96 over 64.
- [ ] 7.2 Adopt measured writes `setDirectoryCapacity` when one is stated (MODIFIED
      `compute-provider`) — test: the adoption scenario and its Undo. Fault line: keep
      writing `setResourceCapacity` and the test finds a project capacity written and the
      directory capacity unchanged.
- [ ] 7.3 fe-01: the organization's resources view shows and, for admins only, edits the
      directory capacity with the dry-run preview before a lowering or clearing; project
      settings show "16 of 16 held, 16 in other projects" — test: rendering tests per role;
      eye review per the UI acceptance rule. Fault line: render the edit control whatever
      the role and the member and viewer rendering tests find it.
- [ ] 7.4 Runbook line: state directory capacities only after a blue/green swap completes.
      Operator: state dev's `host ram` and `staging`, rerun the swarm rehearsal check 4
      (`g4-multi.ts`) expecting B refused and `staging` refused in B; record in verify.md.
