# Backend fixture reconciliation for CI 39882705993

The failed PR gate ran the pushed `e86fdfb10` lineage. Its captured output reports
55 backend failures, 3 skips and 2 errors across 4,026 tests (2,833.87 s).
This isolated triage starts at `3fbdf7928`, after intervening mounted fixture
repairs. It covers the first 24 failures, through the pinned-person claims;
shared live/tree/load projections are owned by a separate lane.

The complete 55-name extraction is `/tmp/puni-ci-backend-old-failures.txt`.
The original captured output is `/tmp/puni-ci-39882705993-failed.log`.
No full old-head gate was rerun and no h2/h4 host gate is claimed here.

## Reproduced causes and repairs

- Six swarm scenarios still failed at `3fbdf7928`: all seven delegated claims
  returned `409 prerequisites_unmet`, because the explicit Dev/QA request included
  an unstarted QA whose Dev workflow predecessor had not finished. Later cases
  depended on the missing race winners. The rehearsal now authors QA and Review
  as already in progress through real `setProgress` commands. Their claims resume
  existing execution, preserving two worker steps, independent Review assignments,
  resource demand, occupancy, fencing, split and promotion assertions.
- Nine identity/pinned-credential cases and one resource undo case still failed on
  the same whole-leaf prerequisite rule. Identity/resource fixtures now explicitly
  claim the first runnable step. The pinned superagent still claims its subtree
  without a step selection, then delegates the child's first step.
- Five migration rollback expectations omitted later migrations. The person suite
  already knew the cross-project additions but omitted the optimization certificate
  migration; the other four omitted the cross-project suffix as well. Each now
  checks the complete reverse-ordered migration names from its copied fixture
  directory with exact stdout equality. Existing guarded rollback and table/audit
  assertions remain in force.
- The tier oracle reported seven misclassifications: two real SQLite tests lacked
  `.db.test.ts`, and five controller suites called the shared database openers
  `openFixture`/`seedIncidents`. The writer suite gets the database suffix. The
  connected publication suite moves from the sealed Optimization module to the
  backend service tests and gets the suffix; only imports and its migration URL
  change. Its placement also caused all 13 checked-module import violations.
  The tier oracle recognizes both shared openers; module import rules stay intact.
- The mounted worker protocol case still exhausted its 10 s outer test budget
  during two real worker startups. In isolation the unmodified case completed in
  9.66 s with `--timeout=30000`; its explicit outer budget is now 30 s, matching
  adjacent multi-process cases. Per-operation 10 s deadlines remain unchanged.

## Focused verification

Run these commands from `apps/wbs/be-01` unless a root command is specified.
Socket-dependent tests require a runner allowed to bind localhost; a sandbox-only
attempt hit `EPERM: listen` and is not counted as a product failure.

```sh
bun test ./src/person-account-migration.db.test.ts ./src/organization-limits-audit-migration.db.test.ts ./src/machine-credential-audit-migration.db.test.ts ./src/machine-credential-migration.db.test.ts ./src/trusted-issuer-audience-migration.db.test.ts ./src/test-tiers.test.ts ./src/module-boundaries.test.ts ./src/service/saved-plan-connected-writer.db.test.ts ./src/service/connected-optimization-publication.db.test.ts --timeout=10000
```

50 pass, 0 fail, 235 assertions, 110.37 s. Original red evidence:
`/tmp/puni-backend-cluster-one.log` and `/tmp/puni-backend-cluster-two.log`.
Green evidence: `/tmp/puni-backend-migration-tier-green.log`.

```sh
bun test ./src/controller/claim-identity.controller.db.test.ts ./src/controller/resource-organization.controller.db.test.ts ./src/controller/cross-project-startable.controller.db.test.ts --timeout=10000
```

47 pass, 0 fail, 433 assertions, 23.31 s. Includes the separate refusal of a
new whole-leaf claim with an unfinished workflow prerequisite, explicit first-step
success, release undo, and isolated/shared governed prerequisite matrices.
Evidence: `/tmp/puni-backend-identities-final.log`.

```sh
bun test ./src/test-tiers.test.ts ./src/module-boundaries.test.ts ./src/service/saved-plan-connected-writer.db.test.ts ./src/service/connected-optimization-publication.db.test.ts --timeout=10000
```

After final import sorting: 27 pass, 0 fail, 147 assertions, 12.76 s.
Evidence: `/tmp/puni-backend-boundaries-final.log`.

```sh
bun test ./src/swarm-rehearsal.boot.db.test.ts ./src/controller/browser-lifecycle.mounted-process.db.test.ts --timeout=10000
```

19 pass, 0 fail, 321 assertions, 113.26 s, including all swarm scenarios and the
complete mounted worker/browser lifecycle suite.
Evidence: `/tmp/puni-backend-swarm-protocol-final.log`.

Root command `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json` exited 0.
Targeted ESLint over all changed TypeScript tests exited 0 after generating the Nx
project graph; no module-boundary skip warnings remained. Initial lint without a
graph warned that its boundary rule was skipped; that run is not accepted evidence.

## Watched negative

The separate existing `local all-step claims keep atomic meaning while explicit
first-step claims and release undo preserve history` test passed before injection.
Replacing only production `!admission.started && !admission.canStart` with `false`
made it fail: expected `409 prerequisites_unmet`, received `200` with two claim IDs
(0 pass, 1 fail, 3.59 s). The guard was restored with no production diff, then the
complete 27-case prerequisite suite passed in the 47-test command above.
Evidence: `/tmp/puni-backend-blocked-claim-fault.log` and
`/tmp/puni-backend-identities-final.log`. The rehearsal's continuation setup does
not turn genuinely new blocked claims green.

The original tier check itself supplied the negative for the omitted shared
openers: five database suites were reported as opening no database. The original
module check supplied the negative for publication-test placement: 13 actual
repository/schema/hash import violations. No safety check was removed or weakened.

Full Nx test/build gates and h2/h4 SHA gates were intentionally not run by this
focused lane. Shared projection failures and generated capability reconciliation
are outside this lane's edits.
