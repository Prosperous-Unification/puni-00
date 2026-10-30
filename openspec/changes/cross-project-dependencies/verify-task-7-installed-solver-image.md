# Bounded tasks 7.3/7.4 installed solver image acceptance

2026-10-23. Source base: `de89f662d`. Isolated clone:
`/tmp/puni-connected-image-acceptance`. Parent tasks 7.3/7.4 remain open.

The image client now dispatches two connected questions in addition to baseline
and shared-person. Both smoke modes require four authenticated supervisor binds,
using independent UUID attempt tokens and the existing owned-resource cleanup.
The connected fixture uses production request construction and outcome evaluation.
Its feasible B stage pins A=0..1 and C=2..3 and requires B=1..2. The fractional
question preserves A.finish=0.2, B.duration=1, C.start=1.2, Q=48 and lower=10,
upper=9. The validated contradictory request is sent to the child; acceptance
requires solver-proven boundary evidence. No direct prepared terminal is used.

A new regression exposed an existing adapter defect: connected revalidation
refused every builder-prepared contradiction before comparing canonical bytes.
It now permits a validated contradictory request through the same exact canonical
comparison and wire revalidation. Forged foreign placement still refuses.

## Observed local validation

- `bun test apps/wbs/be-01/scripts/solver-image-scenario.test.ts apps/wbs/be-01/scripts/connected-solver-image-scenario.test.ts libs/wbs/domain/contracts/solver/src/connected-solver-outcome.test.ts libs/wbs/domain/contracts/solver/src/revalidate-solver-result.test.ts`:
  70 pass, 0 fail, 184 assertions.
- `bun test apps/wbs/be-01/scripts/solver-image-smoke.test.ts`:
  42 pass, 0 fail, 143 assertions. The sandbox refuses Unix socket listening
  (`EPERM`); this focused fake-Docker test was rerun outside that sandbox.
- Focused ESLint over six changed TypeScript files: exit 0. The module-boundary
  rule explicitly skipped because no cached Nx project graph existed; this is
  not evidence for module-boundary validation.
- `openspec validate cross-project-dependencies --json`: 1 passed / 0 failed,
  retaining existing long-requirement warnings.
- `shellcheck -s bash apps/wbs/be-01/scripts/solver-image-smoke.sh` and
  `bash -n apps/wbs/be-01/scripts/solver-image-smoke.sh`: exit 0.

## Observed negative proofs

- Before connected binds existed, the expanded fake-Docker suite had 36 pass /
  6 fail: both client inventories and all four connected failure injections.
- Removing only the feasible bind: 0 pass / 4 fail in the selected built/supplied
  inventory and feasible-client-fault cases. Removing only the fractional bind:
  0 pass / 4 fail in the corresponding selected cases. Both edits were restored.
- Bypassing `verifyConnectedImageResponse`: 0 pass / 5 fail, including local/foreign
  scope, wrong input/question hashes, malformed output, unknown/ordinary infeasible,
  invalid B placement and forged external pins. The validator was restored.
- Before the canonical contradiction adapter fix, the new actual-child regression
  had 10 pass / 1 fail: expected boundary-infeasible, received failed. Restoring
  canonical comparison still refuses forged foreign pins. Independently bypassing
  that comparison made the actual-child fractional regression fail (0 pass /
  1 fail), admitting the forged request instead of internal-error. It was restored.

## Local packet limit before host acceptance

No Docker image was built or run in this bounded local packet. No image digest is
claimed. The actual authenticated installed-image run and a disposable image whose
Python boundary-infeasible branch is relabeled remain unverified. The parent is
coordinating an isolated h2puni checkout after its existing heavy-lock gate and
architecture review. No build on h1claw, production activation, services,
coordinator, migrations or Python implementation changes occurred. Configured
broad Nx checks and the canonical exact-head host gate remain pending coordination.

After integration as feature commit `fb544208a`, the serial uncached
`bunx nx run-many -t lint typecheck -p wbs-be-01,wbs-contracts --parallel=1
--skip-nx-cache --outputStyle=static` passed both projects and the backend
module prerequisite. The isolated source checkout used the earlier
`de89f662d` base and its first configured backend typecheck failed at a
pre-existing `string | undefined` test fixture; the current feature tree
already contains its explicit guard in `791a6b305`. This integrated run
establishes the combined tree's typecheck without changing the image packet.
The actual image and exact-head host gate remain pending.

## Exact-SHA installed image run on h2puni

The isolated host worktree `/home/puni1/puni-00-image-pr630-NbbxmTG0` checked
out pushed `08b2fe31da9f6e852d867ed677187676aa030146`, installed the frozen
Bun lockfile and acquired the canonical heavy lock with label `image:08b2fe31`
without a waiter. With `WBS_RUN_SOLVER_ORPHAN_PROC=1`, uncached configured
`wbs-be-01:solver-image-smoke` exited 0 in 2m51s. Its actual built image
authenticated and accepted the baseline, shared-person, connected-feasible and
connected-fractional child binds; the real-Docker orphan subprocess suite then
passed 3 tests / 15 assertions. The script removed its owned image tags and
containers before success. This proves the installed Python child and launcher
for that exact source revision, not merely the fake-Docker shell suite.

The first queued exact-SHA full gate was canceled during OpenSpec validation
so the installed-Python negative could take the host lock next; it reported
272/272 valid changes/specs before cancellation, but no host-gate verdict is
claimed.

## Actual installed-Python fault image (same pinned source)

Under a second canonical heavy-lock holder
`pr630-installed-image-negative:08b2fe31` (PID 3469757, no queue wait), a
disposable baseline image built from the exact host worktree and was pushed
only to an owned loopback registry. Its digest
`sha256:345f8cb0e34eaf6add282422155b0a250fb5a897087db227904fc215c0a16f16`
passed supplied-image smoke: all four authenticated child binds. The
installed module was proven to be
`/usr/local/lib/python3.14/site-packages/wbs_solver/solve.py` with the
expected source SHA-256
`c0445fffd95761160b2dfd30669cd411cfd42b067157146e87268f8b4893b347`.

A derivative image changed exactly the installed branch that emits
`boundary-infeasible` to ordinary `infeasible`, after validating that original
hash and path. Its separate loopback digest
`sha256:51fd02ebcf63b014854c1c1fcb81a9648616af95fe621f843b03a87aabcfbda5`
passed baseline, shared-person and connected-feasible binds, then the supplied
smoke exited 1 at the intended connected-fractional assertion:
`connected image expected solver-proven boundary-infeasible: failed`. No
fractional acceptance, launcher internal error or cleanup error was present.
The installed mutated module SHA-256 was
`71460fe0b353313c21a1691ca17b28b6e6b8d8d32411ff113ccae182661d350b`.

The owned registry container and volume, both digest references, all four
owned tags and probe containers were individually inspected absent after the
run. The wrapper exited 0 only after those cleanup checks. Full command/log
evidence remains under `/tmp/pr630-installed-negative-08b2fe31` on h2puni;
the parent independently read both smoke logs, module hashes, exact failure and
cleanup inventory. Build cache is not claimed erased. This proves the
production-path negative for image acceptance. It does not close optimizer
publication, cache/retry or the full exact-head host gate obligations under
tasks 7.3/7.4.
