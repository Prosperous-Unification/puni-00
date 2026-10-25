# Verification

Implementation and independent review are in progress. No completion claim is made here.

Base: `830e774d2302d852432c51ded1e1b38e85728f66` (fresh merged main).

Final evidence must include real provider cleanup, command outcomes, live holds, replacement
canaries, preserved work, atomic admission, crash recovery and WBS request/event round trips.
Namespace-isolated tests prove the disposable fixture, not visibility of existing host PIDs.
Record exact commands, results, watched safety negatives and remaining coverage limits below.

## Real WBS–Dash roundtrip (2026-10-25)

The coordinator ran a disposable smoke under an isolated Linux user/PID namespace using
the real composed WBS app, SQLite stores and Dash runtime. The first run exposed a real
protocol defect: a release event retaining the request id from its earlier pending event
was rejected after the pending event acknowledged the request. The backend now accepts
validated causal linkage to an acknowledged request while independently retaining any
newer unacknowledged request. Targeted regressions cover that ordering.

After the fix, the smoke exited 0 and reported:

```json
{
  "verified": true,
  "physicalPathAbsent": true,
  "releasedDiskUnits": 1,
  "reclaimedBytes": null,
  "wbsState": "release_verified",
  "acknowledgedRequest": true,
  "responseLossReplay": true,
  "restartRecovery": true,
  "outageRecovery": true,
  "uniqueReleaseHistory": true
}
```

This proves actual disposable-directory deletion, reservation settlement, request delivery
across ledger reopen, replay after lost acknowledgement, publication after a WBS outage,
and one immutable release history entry. All fixture roots/databases were removed in
finally blocks. The committed smoke path and final-tree command are recorded after review.

## Specification gate

`node_modules/.bin/openspec validate --all --json --no-interactive` exited 0:
288 items passed, 0 failed (270 changes and 18 specifications). This is a structural
specification check; runtime and integration evidence is recorded separately above.

## Runtime review closure and final independent checks

Independent review found three Important issues in the initial runtime: worktree-only
reflog history could become unreachable, Git worktree removal bypassed shared-hardlink
checks, and leader exit stopped escalation against surviving owned children. Commits
`1edc0582e` and `4fe3f8c67` preserve and verify reflog/private-ref objects, apply universal
no-follow shared-storage checks, and persist proven descendants before identity-checked
Linux pidfd signaling. A real prune fixture restores the preserved source. An unrelated
process remains alive when its recorded start identity does not match. Unknown membership
stays blocked. Scoped independent re-review approved all three fixes without new findings.

The implementer ran 31 inner runtime cases/183 assertions and four additional watched
mutations (Git shared-storage inspection, PID-start comparison, session witness, and
leader-exit escalation). An initially weak signal-death assertion was strengthened to
check both exit and signal status, then its mutation was rerun and failed as intended.
All mutated source was restored before the final run.

The coordinator independently ran:

```sh
bun test apps/twilight-structure/twilight-dash/cli/src/resources/runtime.test.ts apps/twilight-structure/twilight-dash/cli/src/cli.test.ts apps/twilight-structure/twilight-dash/cli/src/no-ambient-clock.test.ts --timeout=120000
unshare --user --map-root-user --pid --fork --mount-proc bun apps/wbs/be-01/scripts/resource-cleanup-smoke.ts
```

Results: 31 outer tests passed/143 assertions (including the real namespace suite),
0 failed. The final smoke exited 0 with all fields below true:

```json
{
  "verified": true,
  "physicalPathAbsent": true,
  "blockedRetryRecovered": true,
  "releasedDiskUnits": 1,
  "reclaimedBytes": null,
  "wbsState": "release_verified",
  "acknowledgedRequest": true,
  "responseLossReplay": true,
  "restartRecovery": true,
  "outageRecovery": true,
  "uniqueReleaseHistory": true
}
```

The final combined backend gate passed 273 tests/6483 assertions across 15 files.
Graph-backed ESLint passed on all 45 changed source/test files. Frontend evidence is in
the companion tracking verify record (59 view tests, browser smoke and production build).

## Production build and dependency layout

`NX_DAEMON=false bunx nx run wbs-be-01:build --skip-nx-cache` passed, including its six
dependency tasks, Dash's observation launcher, backend bundle and generated OpenAPI.
The first attempt correctly refused an external build-host path: this isolated worktree
initially borrowed dependencies through a symlink. Bun's CLI preserve-symlinks flag did not
change the build API's behavior. A temporary checkout-local hardlink tree provided the
required physical path layout without reinstalling or duplicating package file contents.
The packaging guard was unchanged. The original dependency symlink was saved for restoration
after final validation; that restoration is recorded in the resource-cleanup section.

The actual Nx typecheck gate passed for seven affected projects and three required module
checks (domain, contracts, core, SQLite, backend, frontend and Dash), with cache bypassed:

```sh
NX_DAEMON=false bunx nx run-many --target=typecheck --projects=wbs-domain,wbs-contracts,wbs-core,wbs-store-sqlite,wbs-be-01,wbs-fe-01,twilight-dash --parallel=1 --skip-nx-cache
```

No h2/remote gate or live dedicated-user enrollment was performed. The local supported
provider and its disposable namespace fixtures are the verification boundary.
