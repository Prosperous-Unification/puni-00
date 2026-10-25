# Verification

Implementation and task reviews are complete. The final combined-fix scoped review approved all findings without new breakage;
final-tree checks and supported boundaries are recorded below.

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

No h2/remote gate or live host enrollment was performed. The local supported
provider and its disposable namespace fixtures are the verification boundary.

## Final whole-branch fixes

The whole-branch review found three defects: Git index flags could hide modified source;
a terminal no-effect acknowledgment regenerated its evidence locator; and planning deletion
before first publication could strand the ordered authority stream. Commit `d92479207`
retains flagged worktrees, reuses the complete original durable proof, and admits immutable
WBS attribution before physical effects or source-sequence allocation. It also corrects the
browser fixture's source/projection revisions. No migrations were changed by this fix.

WBS provisional admission uses the existing resource-use snapshot and immutable registered
history at source revision 0; the runtime-use row is inserted at ordered registration revision 1.
Exact replay remains credential/epoch/account/organization bound and survives planning deletion.
Confirmation preserves newer projection revisions and cleanup requests. A live creator awaiting
admission is not recovered as abandoned; a sealed or dead creator's intent is retried and
verified as never created. Rejected/ambiguous admissions remain charged with no path or source
sequence and cannot strand independently admitted publication. Persistently refused admission
requires operator repair. New creation therefore depends on WBS availability; cleanup of already
admitted resources remains offline-capable.

Both real Git flag regressions failed with released hidden source before the fix. The terminal
race failed with evidence locator /4 instead of /3; the deleted-task smoke failed with registered
sequence 9 HTTP404. Parent sealing stranded a creating child, watcher recovery cancelled a live
creator, and duplicate admission event identity across projects returned200 rather than409.
Each regression was observed failing then passing, with production `Proof:` comments retained.

The combined fixer then ran nine independent production mutations, restoring each in finally:

| Removed or broken check                  | Observed negative                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| Git index-tag guard                      | Both hidden-source fixtures released instead of retaining exact bytes. |
| Original terminal evidence locator       | Composed race failed complete evidence equality.                       |
| Exact admission receipt identity         | Wrong receipt permitted creation.                                      |
| Admission before effects/source sequence | Actual deleted work item stranded registered sequence9 with HTTP404.   |
| Source-0 cleanup-event fence             | Cleanup published before registration instead of an empty outbox.      |
| Immutable admission replay envelope      | Changed declaration returned200 rather than409.                        |
| Ordered confirmation matches admission   | Changed locator after project deletion returned200 rather than409.     |
| Preserve current WBS projection          | Newer revision/pending request was erased.                             |
| Admission epoch                          | Wrong epoch returned200 rather than409.                                |

Earlier runtime mutation coverage independently removed owner/mode, authority binding,
unresolved reservation charging, revision/incarnation, procfs holds, inode identity,
missing-target intent, shared-hardlink, tracked generated-source and parent manifest guards.
Every mutation failed its real fixture and was restored. These complement the four later
shared-storage/descendant-identity mutations and Git prune/restore proof recorded above.

## Independent final-tree gates

After all production mutations were restored, the coordinator repeated the runtime/CLI command
and real composed smoke shown above: **31 outer tests passed, 143 assertions**, zero failures
(44.57s), containing all **36 real namespace runtime cases**. The smoke exited0 and returned:

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
  "uniqueReleaseHistory": true,
  "terminalRaceReplay": true,
  "admittedDeletionRecovery": true,
  "uncertainAdmissionRecovery": true,
  "rejectedAdmissionDoesNotBlockStream": true
}
```

This covers actual deletion, a real open-file hold, retry, exact original proof after
restart/response loss, and a surviving replacement canary. Work-item/resource deletion use
production commands; project deletion uses the existing orphan database fixture because this
increment has no public project-delete route. Provider-only tests stub the admission HTTP
transport; this smoke exercises the real WBS app, routes and SQLite stores.

Final graph-backed `bunx eslint` passed all **47 changed TypeScript/TSX files**. The actual
seven-project Nx typecheck command above passed with its three module gates (2m2s), and the
actual backend build passed with all six dependencies (2.4s), cache bypassed. Full OpenSpec
validation passed **288/288**, zero failures. Backend, frontend and browser evidence is in the
companion tracking record. Normal commit hooks passed; the Tool Wiki activation check is
inactive/not certified because its external activation root is absent. No remote h2/full
monorepo gate, live enrollment or real Claude/Codex workload was run.

## Decisions and resource cleanup

The earlier tracking-first scope was superseded by the user's explicit choice of tracking plus
Dash runtime; both are implemented. The durable-admission ruling trades availability of new
work during WBS outages for immutable authorized attribution before effects. WBS does not
become the physical capacity authority. Unsupported provider kinds, transfers, recovery across
authority rotation, hard quotas and native unwrapped harness interception remain outside this
local rollout; the CLI runbook states the managed creation boundary.

After successful final type/build/test/lint checks, the coordinator removed only the temporary
checkout-local hardlink dependency tree and restored its saved original `node_modules` symlink
to `/home/df/wd/puni/puni-00/node_modules`. The main dependency file inode/content remained
untouched. No dependencies were installed. Final task artifact cleanup and review closure are
recorded below; the source branch/worktree remains available for review.

## Final review and cleanup closure

The scoped re-review of `449146ec1..d92479207` approved all four findings: flagged Git source
is retained, terminal evidence is reused exactly, admission precedes effects and survives
planning deletion, and browser revisions agree. It found no new breakage and no newly deferred
observations. This is code review plus the execution evidence above, not live-host certification.
The interrupted-removal fixture constructs a durable crash state; it is not an independent
power-loss or kill-at-every-instruction proof.

The coordinator removed the recorded `/tmp` implementation/probe/mutation helpers and logs,
worktree build outputs (about100MiB), Nx/Vite caches, browser screenshots/reports/JUnit, and this
plan's unique ignored SDD workspace. No `dash-resources-*` or `wbs-dash-roundtrip-*` fixture
directories remained. The original shared dependency symlink is restored; no shared package
contents or unrelated sibling plan files were removed. The isolated source worktree stays
on `feat/wbs-resource-release` for review. Normal documentation commit hooks and a final clean
status check complete the handoff; no global runtime/service was installed or activated.

## Existing-account amendment (2026-10-25)

At the user's request, the current Unix account is the supported setup; no separate account
is required. Managed creation no longer scans all same-user processes as a precondition.
The three cleanup-time inspections remain in force. An inaccessible process records its PID
in the blocker, preserves the target and reservation, and allows an explicit retry after access
is resolved. The runbook now uses owner-only directories under `$HOME` without sudo/useradd.

The new real-process regression starts a non-dumpable Python process and independently observes
EACCES reading its mappings. The isolated namespace runner drops CAP_SYS_PTRACE via `setpriv`
so privileged inspection cannot conceal that failure. Against the prior implementation, the
test failed at the dedicated-user startup refusal (two assertions). After the amendment it
passed 12 assertions: creation and command execution succeeded, cleanup stayed blocked with
its PID, output survived, capacity stayed charged, no verified release was published, and
retry after the process exited removed the target and settled one reservation.

A watched mutation returning immediately from `inspectHolds` made the regression fail with
expected `blocked`, received `released`; the target was removed. The production guard was
restored before final checks, and its adjacent Proof comment records the observed failure.
No safety override or ignored inspection failure was added.

Final commands and observations:

```sh
bun test apps/twilight-structure/twilight-dash/cli/src/resources/runtime.test.ts apps/twilight-structure/twilight-dash/cli/src/cli.test.ts apps/twilight-structure/twilight-dash/cli/src/no-ambient-clock.test.ts --timeout=120000
unshare --user --map-root-user --pid --fork --mount-proc setpriv --bounding-set=-sys_ptrace bun apps/wbs/be-01/scripts/resource-cleanup-smoke.ts
NX_DAEMON=false bunx nx run twilight-dash:typecheck --skip-nx-cache
bunx eslint apps/twilight-structure/twilight-dash/cli/src/resources/runtime.ts apps/twilight-structure/twilight-dash/cli/src/resources/runtime.test.ts
node_modules/.bin/openspec validate dash-resource-cleanup --strict --no-interactive
```

Runtime/CLI: 31 outer tests, 143 assertions, zero failures (35.87s), including all 37 real
namespace cases. The composed smoke exited0 with every boolean proof true, including actual
removal, blocker retry, terminal replay, planning-deletion admission recovery and uncertain
admission recovery. Dash typecheck passed (4.9s), scoped lint passed, and strict OpenSpec
validation passed. Formatting and whitespace checks passed. The focused independent reviewer
approved the seven-file code/spec/runbook diff without findings; no test suite was rerun by the
reviewer. No backend/UI production code or public protocol changed, so the previous broad
backend/browser/build evidence was not unnecessarily repeated.

A disposable subprocess probe also confirmed the ordinary account still sees its protected
process as its own UID while mapping reads return EACCES. It was terminated and reaped. No
accounts, services or live resource roots were created. This task's temporary evidence, Nx
cache and typecheck outputs are removed after recording these results; the original shared
node_modules symlink and source branch remain.
