## Commands

| Command                                                                       | Expectation                |
| ----------------------------------------------------------------------------- | -------------------------- |
| `bunx nx run-many -t test:unit,lint,typecheck -p wbs-core,wbs-domain`         | exit 0                     |
| `bunx nx run wbs-core:build:portable`                                         | exit 0                     |
| `bunx nx run wbs-be-01:typecheck`                                             | exit 0                     |
| `bunx nx run wbs-be-01:test:unit`                                             | planner-only, exit 0       |
| `bunx nx run tool-devsync:test`                                               | planner-only, exit 0       |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` | strict jq contract exits 0 |
| `bin/h2puni-gate.sh <sha>`                                                    | planner-only, exit 0       |

## Failure proofs

| Check              | Fault injected                    | Test that observed it                      | Result                                                                                                                                          |
| ------------------ | --------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Project write gate | `canEditProject` forced to `true` | `announces nothing for a write it refused` | Failed with the expected `forbidden` value replaced by `ok: true`; 0 passed, 1 failed and 10 filtered out. Restored run: 1 passed and 0 failed. |

## Observations

_(each slice appends its own step-0 baselines, its deltas and the diagnostics it observed here
before handing over. Evidence references are basenames relative to the attempt's evidence
directory.)_

### Slice 1 — 2026-09-22

- Baseline validation items: 112.
- With this change: 113 items, 113 passed and 0 failed, the required baseline plus one.
- Strict validation evidence: `openspec-validation.FeThpd.json`.

### Slice 2 — 2026-09-22

- Domain baseline: 645 passed, 0 failed across 52 files (`slice-2-domain-baseline.log`).
- With `project-ownership.test.ts`: 647 passed, 0 failed across 53 files, the required baseline
  plus two (`slice-2-domain-green.log`).
- Focused ownership test: 2 passed, 0 failed, 3 assertions
  (`slice-2-project-ownership-green.log`).
- Domain unit, lint and type-check targets passed (`slice-2-domain-nx-green.log`).
- The R5 production-path negative belongs to slice 3. Until the six callers use the moved rule,
  forcing it to return `true` has no production path through a service.

### Slice 3 — 2026-09-22

- Step-0 counts: 1 `canEditProject` declaration, 5 service-side imports of `canEdit`, and 1
  `savePlan` import of `canEdit`; the core unit, lint and type-check baseline exited 0
  (`slice-3-step-0-core.log`).
- Calendar marker, Capacity, Priority band, Project, Step, Work item and `savePlan` now use the
  domain write gate. The compatibility alias count is 1. `http/project.routes.ts` remains on the
  alias because it already imports `ProjectService` from that resource.
- The guarded zero-import scan printed `remaining=0`.
- With `canEditProject` forced to return `true`, `announces nothing for a write it refused` failed:
  the expected `{ ok: false, reason: 'forbidden', about: 'project' }` was replaced by an `ok: true`
  marker; 0 passed, 1 failed and 10 were filtered out. Evidence:
  `can-edit-project-always-true.patch`, `can-edit-project-always-true.log`.
- The passing bytes were restored and matched with `cmp`; the focused test then passed 1 test with
  0 failures (`can-edit-project-restored-green.log`).
