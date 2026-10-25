## 0. Dany reads S1 to S11

- [ ] 0.1 Dany confirms or amends design.md S1 to S11, first the choice of alternative A
      (organization-scoped occupancy) over B (shares) and C (Dash admission only), then S5
      (visibility) and S7 (engines). Nothing below starts before 0.1. If A holds, record it
      as an ADR.

## 1. Directory capacity (no claim effect)

- [ ] 1.1 Migration `add_resource_directory_capacity` with the `units >= 0` CHECK, cascade
      from `resource`, guarded `down.sql` — test: forward, back, refusal with one row.
      Fault line: drop the guard and the rollback test deletes a stated capacity.
- [ ] 1.2 `setDirectoryCapacity` on the directory command route: admin and super-admin only,
      `legacy_resource`, not journalled, one `organization_audit` row; resource reads carry
      `directoryCapacity`; `deleteResource` counts and cascades it — test: route tests per
      role on both stores. Fault lines: skip the role check and the member's write lands;
      skip the audit write and the audit test finds no row.
- [ ] 1.3 Prove the S2 invariant: a demand or project capacity naming another
      organization's resource is refused — test: be-01 controller test across two
      organizations. Fault line: accept the foreign id and the test stores the demand. If the
      invariant does not hold today, the fix is part of this slice.

## 2. Domain: both scopes in one check

- [ ] 2.1 `refuseOccupancy` takes the project's rows and the organization's rows for the
      asked resources plus directory capacities; shortages carry `scope`; held units never
      refuse — test: one case per spec scenario (16 GB, staging, ceiling, tie);
      fast-check model run over two projects: organization occupancy never exceeds a stated
      directory capacity after any sequence of claims, releases, undos and redos. Fault
      line: pass only the project's rows and the model run finds the 32-of-16 sequence.
- [ ] 2.2 Unstated directory capacity leaves every decision unchanged — test: the existing
      `claim-occupancy.test.ts` suite unchanged and green. Fault line: treat unstated as 0
      and every claim with a demand is refused.

## 3. Store and command path

- [ ] 3.1 `ClaimStore.organizationOccupancyOf(resourceIds)` on SQLite and memory, joined to
      the resource's organization, read inside the batch's transaction; conformance test.
      Fault line: read on the observation connection instead and the race test below admits
      both claims.
- [ ] 3.2 Cross-project race — test: `claim-occupancy-cross-project-race.db.test.ts`, two
      concurrent claims in A and B asking 10 of 16; exactly one applied. Fault line: skip the
      organization check and both are stored (26 of 16).
- [ ] 3.3 Redo, undo of release and lease sweep through the same check — test: journal round
      trips in `resource-occupancy.db.test.ts` with a second project. Fault line: skip the
      organization rows on the undo path and the undo re-acquires 16 over B's 16.
- [ ] 3.4 Measure the organization-wide read inside the write turn on a 50-project fixture;
      record p50/p99 in verify.md.

## 4. Visibility

- [ ] 4.1 Holder `projectId`; unreadable holders folded into `elsewhere` in the refusal, the
      startable read and the resources read, judged by the reader's access port — test: a
      reader denied project A gets counts and no A identifier (string search over the whole
      body for A's project id, person id, run id and work item id). Fault line: return
      holders unfiltered and the string search finds A's ids. Until `wbs-permissions`
      lands, the test denies through the access port seam; state that in verify.md.

## 5. Startable read and MCP

- [ ] 5.1 Per-resource `occupancyScope`, `directoryCapacity`, `occupiedElsewhere`, `free`;
      `exhausted.scope`; top-level `'project' | 'organization' | 'mixed'`; MCP description
      text — test: contract shape tests and the two spec scenarios. Fault line: compute
      `free` from the project alone and "B sees what A holds" lists B's leaf as startable.

## 6. Engines

- [ ] 6.1 Effective pool size in `ScheduleInput`, canonicaliser and hash; contract bump;
      Fast and CP-SAT read the clamped size — test: golden corpus byte-identical; the
      32-of-16 scenario serialises in both engines. Fault line: hash the project capacity
      instead of the effective size and an edit of the directory capacity serves a stale
      cached schedule.

## 7. Limits, UI, operator

- [ ] 7.1 `capacity_limit` on `setDirectoryCapacity`; L2's sum skips resources with a
      directory capacity — test: both spec scenarios. Fault line: drop the cap check and 65
      over a cap of 64 is stored.
- [ ] 7.2 fe-01: directory capacity in the organization's resources view (admin edit), the
      project settings show "16 of 16 held, 16 in other projects" and `elsewhere` — test:
      rendering tests per role; eye review per the UI acceptance rule.
- [ ] 7.3 Runbook line: state directory capacities only after a blue/green swap completes.
      Operator: state dev's `host ram` and `staging`, rerun the swarm rehearsal check 4
      (`g4-multi.ts`) expecting B refused and `staging` refused in B; record in verify.md.
