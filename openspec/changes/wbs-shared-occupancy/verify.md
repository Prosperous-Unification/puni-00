## Verification record

Drafted 2026-10-25 as an OpenSpec proposal only; nothing is implemented. S1 to S12 in
design.md are assumed, awaiting Dany. Amended the same day after two Fable reviews of PR #737
(first pass: eight S2 and eight S3 findings; second pass at `882ca2169`: three S2 and the
S3 list).

Sources read on 2026-10-25 on `main` at `2ca06fcf1`: `wbs-resources` (proposal, design R1 to
R8a, `resource-occupancy`, `startable-work` and `schedule-resources` specs, tasks),
`compute-providers` (proposal, P3 to P7, `compute-provider` spec), `wbs-organization-limits`
(proposal, L1, L2, `organization-limits` spec), `wbs-permissions` (proposal),
`wbs-team-claims` (D5), `wbs-claim-leases` (L7), ADR 0015, `space.resource.ts`
(`RollUpCache.keyOf`), `directory.resource.ts` (`announce`), domain and core
`organization-access.ts` (`canEditProjectInOrganization`, `mayEditProjectWithin`,
`mayRemoveResourceInOrganization`), store-sqlite `organization-access.ts` (delegations keep
their role, `delegated: true`), `saved-plan-capture-values.ts` (`PlanInputReads`),
`organization-limits-shapes.ts`, `organization-route-inventory.ts`,
`libs/wbs/domain/domain/src/occupancy.ts`, `canonical-schedule-input.ts`,
`libs/wbs/adapters/store-sqlite/src/claim.ts` (`occupancyOf`), `schema.ts` (`resource`,
`project_resource_capacity`, `claim_occupancy`, `resource_organization`), `gate.ts`
(`WriteCoordinator`), `command-references.ts` 103 to 123, `working-plan.resource.ts`
(`assertProject`, the lazy claim-store reads), the claim, release and `withClaimsRestored`
paths in `work-item.resource.ts`, `startable-shapes.ts`, `refusal.ts`, and the audit
migrations `20261022140100_widen_organization_audit_compute_providers`. Read only, not on
`main` and not modified: `openspec/changes/wbs-resource-release` in the main checkout
(proposal lines 23 and 32, design lines 39 and 181 to 182, `resource-release` spec lines 126
to 127).

Evidence of the gap: the swarm rehearsal of 2026-10-25, check 4 (`g4-multi.ts`,
`evidence.log` phases 4a to 4c, outside the repo): B read `host ram [16, 0, 16]` while A held
16; a 16 GB claim in B answered 200; `staging` was claimed in A and B at once.

Already proven on `main`, not re-tasked: a plan cannot name another organization's resource
(`refuses a foreign resource exactly as an absent one`, `refuses a claim asking for a foreign
resource exactly as an absent one`, `resource-organization.controller.db.test.ts`).

Known gaps, stated:

- The S5 redaction has no production-path negative until a `wbs-permissions` grant can deny
  a project; task 4.1's negative runs through the access port seam only.
- `openspec validate` reports that archive would refuse the MODIFIED deltas of
  `startable-work`, `schedule-resources`, `organization-limits` and `compute-provider`
  until those capabilities' main specs exist (task 0.3).

## Commands

Run on the worktree with this change staged, 2026-10-25:

- `./node_modules/.bin/openspec validate wbs-shared-occupancy --strict` → `Change
'wbs-shared-occupancy' is valid`, exit 0, plus four `[INFO]` lines that archive would refuse
  the MODIFIED deltas until their capabilities' main specs exist (task 0.3).
- `./node_modules/.bin/openspec validate --all --json` → exit 0, totals
  `{ items: 290, passed: 290, failed: 0 }`.
- `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`
  → exit 0; its one `reviewDebt` entry (`libs/wbs/adapters/store-memory/src/README.md`, 51
  entries over 40) predates this change.
- `bunx prettier --check openspec/changes/wbs-shared-occupancy CONTEXT.md` → "All matched
  files use Prettier code style!", exit 0.

## What must be observed before each slice is called done

Each task's fault line, watched failing with the check removed, with its `Proof:` comment
beside the check and the command output recorded here.

## Implementation record (branch `feat/wbs-shared-occupancy-1`, built on assumed S1 to S12)

All commands run in the worktree with `env -u CLAUDECODE` (the Bun output tests misreport
under `CLAUDECODE=1`). Only targeted files ran; the full suites are CI's.

### Slice 1.0 and 1.1: the two migrations

`20261025100000_widen_organization_audit_directory_capacity` and
`20261025100100_add_resource_directory_capacity`, each with a guarded `down.sql`.

- `bun test apps/wbs/be-01/src/directory-capacity-migration.db.test.ts` → 8 pass, 0 fail.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts` over both folders' four files →
  exit 0; `migration-lint.test.ts` gained `accepts the directory capacity audit rebuild`.
- Every test pinning the newest migration or listing the reversal order (45 files: be-01
  migration tests and store-sqlite `*.db.test.ts`) gained the two names; run together →
  750 pass, 3 fail, the three table-list expectations (`calendar-marker-migration`,
  `organization-records`, `optimized-schedule-cache`), which then gained
  `resource_directory_capacity` → 54 pass, 0 fail.

R5 proofs, each fault injected into the file, the test run, the file restored:

| Fault                                                               | Observed                                                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `compute_provider_removed` dropped from the forward rebuild's CHECK | `keeps one row of every earlier action and subject kind through the rebuild` failed: `runMigrations` threw on the copy |
| audit `down.sql` guard filter replaced by `WHERE 0`                 | `refuses rollback over one directory capacity audit row` failed: the narrow table's `CHECK constraint failed: action`  |
| `typeof` half of the table CHECK removed                            | `refuses a negative or a text directory capacity` failed: `'sixteen'` was stored                                       |
| table `down.sql` guard comparison made `>= 0`                       | `refuses rollback over a stated directory capacity, keeping it` failed: the rollback exited 0                          |
| forward fk guard `CHECK (violations = 0)` made `CHECK (1)`          | `accepts the directory capacity audit rebuild` failed: `contains destructive statement: DROP TABLE`                    |

A text `'16'` is not refused by the database: the column's INTEGER affinity stores it as
16 (as `project_resource_capacity` does). The CHECK's `typeof` refuses text that is not an
integer; the command boundary refuses every non-integer before SQL.

### Slice 2: both scopes in one check

`refuseOccupancy` and `ClaimRequest` take `directoryCapacities` and `organizationOccupancy`
(required, so no caller can forget them); a shortage carries `scope` exactly when its
resource states a directory capacity, so a resource with none refuses byte for byte as
before (the reading of "no change" this slice takes; S3's `scope: 'project'` appears on
the ceiling case under a stated directory capacity). The existing suites changed only by
the two empty inputs added to their request builders; no assertion moved.

- `bun test libs/wbs/domain/domain/src/claim-shared-occupancy.test.ts
libs/wbs/domain/domain/src/claim-occupancy.test.ts libs/wbs/domain/domain/src/claim.test.ts`
  → 83 pass, 0 fail.
- `bunx nx run-many -t typecheck -p wbs-domain wbs-core --skip-nx-cache` → exit 0.

| Fault                                                          | Observed                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| the organization scope skipped in `refuseOccupancy`            | `claim-shared-occupancy.test.ts` 3 pass, 5 fail; the model run's counterexample: directory 0, one claim of 1 in project 0 |
| the model run passing the project's rows as the organization's | counterexample `directory 12`: a claim of 1 in project 1, then 12 in project 0 (13 of 12)                                 |
| an unstated directory capacity read as 0                       | `claim-occupancy.test.ts` 6 pass, 12 fail                                                                                 |
