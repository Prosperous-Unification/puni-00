# Bounded baseline fixture repairs — 2026-10-23

Base: `f0d9b95c3` (`docs(wbs): record reviewed MCP parity evidence`), isolated
clone `/tmp/puni-fixture-repair`, branch `fix/cross-project-baseline-fixtures`.
This restores existing test prerequisites; production code and assertions are
unchanged. Parent implementation tasks remain at their existing status.

## Observed red and separate prerequisite repairs

```sh
bun test apps/wbs/be-01/src/controller/cross-project-startable.controller.db.test.ts \
  libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts --timeout=30000
```

At the exact base: **24 pass, 7 fail, 163 assertions**, exit 1.
Six controller cases fail in `beforeEach` at the external relationship insert
with `SQLiteError: external_dependencies_inactive`:

- remote unfinished FS is excluded from startable and refused by claim until completion
- FF permits start and exposes the unmet finish prerequisite in the startable response
- local claim redo reevaluates prerequisites after undo instead of replaying a new start
- SS observes ended unsuccessful attempts while unknown prerequisites refuse atomically
- local all-step claims keep atomic meaning while explicit first-step claims and release undo preserve history
- manual progress and historical attempts remain observations with unmet local prerequisites

`OrganizationHarness.activate()` activates organization isolation only. The
working `testing/connected-transfer-fixture.ts` separately seeds synthetic trusted
dependency persistence. Importing the existing `seedDependencyAuthority` helper
and calling it immediately after `activate()` restores that same prerequisite.
With only this change, the complete controller file returns **6 pass, 0 fail,
39 assertions**, exit 0.

The remaining failing case, `borrowed service claim sees staged remote completion
and collects its normal announcement`, throws `a bound claim was added under
scoped access without organization limits` at the accepted claim. Its source
omitted `organizationDefaultLimits`, so `openSqliteSource` never constructed the
real `OrganizationLimitGaugeRepository` for the borrowed command scope.
Passing defaults of **50 agent persons, 200 concurrent claims, 10,000 capacity
units per resource** restores the real gauge. Scoped access, the transaction,
and the scheduler-throwing assertion remain intact. The complete live-plan file
then returns **25 pass, 0 fail, 155 assertions**, exit 0.

These are observed production-path missing-prerequisite negatives from the
unchanged baseline, not new safety checks or proofs of runtime activation.
No product guard was removed or weakened; no new guard needs an R5 mutation proof.
Baseline log: `/tmp/puni-fixture-red.log`; separate green logs:
`/tmp/puni-fixture-authority.log`, `/tmp/puni-fixture-limits.log`.

## Fresh verification

```sh
bun test apps/wbs/be-01/src/controller/cross-project-startable.controller.db.test.ts \
  libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts \
  libs/wbs/adapters/store-sqlite/src/read-snapshot-lifetime.db.test.ts \
  libs/wbs/adapters/store-sqlite/src/connected-plan-capture.db.test.ts \
  libs/wbs/domain/domain/src/execution-eligibility.test.ts --timeout=30000
```

**68 pass, 0 fail, 346 assertions**, exit 0. This includes the live-plan execution
observation cases, borrowed staged completion, detached capture, borrowed owner
lifetime, and the domain execution eligibility suite. No latent failure appeared
after the repaired setup in these complete files. Log:
`/tmp/puni-fixture-green.log`.

- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json --pretty false`: exit 0,
  no diagnostics.
- `bunx tsc --noEmit -p libs/wbs/adapters/store-sqlite/tsconfig.spec.json --pretty false`:
  exit 0, no diagnostics.
- Scoped ESLint on both edited test files: exit 0. The first run warned that
  module-boundary checks lacked the Nx graph; generate it with
  `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/puni-fixture-project-graph.json`
  (exit 0), then rerun lint for the final result.
- `bunx prettier --check` on both edited tests: exit 0.
- `./node_modules/.bin/openspec validate cross-project-dependencies --json`:
  **1 passed, 0 failed**, exit 0; existing long-requirement warnings remain.
- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: exit 0, checked 1801 installs
  across 1648 packages. Initial installation without `BUN_TMPDIR` failed EROFS;
  that invocation is not successful evidence.
- `bun run tools/tool-git-hooks/src/install.ts`: exit 0, explicitly installed
  pre-commit, prepare-commit-msg, and commit-msg hooks. Normal commit hooks run
  on the fixture and evidence changes. Pre-commit lint, format, plaintext-secrets
  and private-nesting passed; both attribution hooks passed. Tool Wiki returned
  exit 0 with `status: inactive`, `certified: false`, because the external
  activation root is not provisioned; this is not Tool Wiki certification.
  Migration lint, website migration lint and doc-caps were explicitly skipped
  because no staged paths matched. `git diff --check` and the staged equivalent
  exited 0.

## Limits

This packet does not establish a complete cross-project feature gate, production
runtime compatibility or activation, migration rollback-ledger correctness,
MCP parity, or deployment. Full Nx tests/lint/typecheck/build, host gate,
standalone CI secrets/migration lint, browser tests and deployment were not run.
The normal pre-commit checks cover staged paths only. No primary checkout was
edited, and no push was performed.
