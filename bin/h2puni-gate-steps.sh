#!/usr/bin/env bash
set -euo pipefail

repo=${1:?repository is required}
: "${2:?committed revision is required}"
cd "$repo"

# The gate tree is a long-lived shared checkout, so its node_modules is whatever an earlier gate
# left behind; on 2026-09-20 that was 2026-09-18's install and the first batch 2 group gate failed
# apps/wbs/be-01/src/production-entrypoint.test.ts on `Could not resolve: "di-bag"`. Frozen,
# because a lockfile that disagrees with the manifests is a gate failure, not something to
# resolve on the host.
# Proof: 2026-09-21. Deleting this line made h2puni-gate.test.sh fail ten cases, among them
# `the gate does not install against the frozen lockfile` and `a refused frozen install refuses
# the gate steps: want exit 1, got 0`. Dropping `--frozen-lockfile` failed only the first of
# those; moving the line below the OpenSpec block failed `the install does not precede OpenSpec
# validation (install line '2', validate line '1')`; appending `|| true` failed the second; and
# guarding it with `command -v bun` failed `a missing installer refuses the gate steps: want
# exit 127, got 0`; and validating before exiting 127 when bun is absent failed only
# `the missing installer allowed OpenSpec validation`.
bun install --frozen-lockfile

openspec_report=$(mktemp)
trap 'rm -f -- "$openspec_report"' EXIT
# Proof: h2puni-gate.test.sh injects failed=1, passed="0", passed=1.5 and failed-then-passing
# documents. The loose jq check admitted the latter three and reached Nx; this exact contract
# refuses every injected fault before Nx while retaining the validator JSON in gate output.
# Proof: h2puni-gate.test.sh case 22 observed the obsolete 1.3.0 invocation instead
# of the required 1.12.0 contract; the real gate also rejected three legacy Twilight changes.
# Proof: on 2026-10-20, 1.14.3 validated a disposable change, then rejected the same
# change with `#### Scenario` changed to `### Scenario`: exit 1, failed=1, passed=0.
# Proof: h2puni-gate.test.sh removes the local executable. The earlier bunx
# invocation reached later work; this path exits 127 before Nx can run.
./node_modules/.bin/openspec validate --all --json | tee "$openspec_report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$openspec_report" >/dev/null
rm -f -- "$openspec_report"
trap - EXIT

# Proof: removing this probe made h2puni-gate.test.sh admit missing and exit-74 bubblewrap fixtures into later Nx work.
bwrap --die-with-parent --new-session --unshare-all --uid 1000 --gid 1000 \
  --ro-bind / / --dev /dev --proc /proc /bin/true

bunx nx format:check --all
# Proof: dropping this exclusion made gate-entrypoints.test.ts lose the exact-once split and fail
# at `Expected to contain: --exclude=twilight-burokrat`; source lint is invoked below.
# The Twilight suite runs as CI's `gate_twilight` does: since 2026-10-12 (WBS a81d93a0)
# twilight-dash is excluded beside Burokrat and its targets and lint run in the split below;
# toolchain-pins.test.ts pins the `twilight-dash` half of the exclusion.
# tool-remote-scripts' test target and its test:caddy dependency are skipped here (assumption
# A-GATE-REMOTE-1, `dash-host-jobs` task 6.18, awaiting Dany): its canonical batch runs the remote model family 2.5-4x over its
# fixed budgets on the gate hosts. The 2026-11-08 h2puni gate took 575 min 41 s, 521 min 57 s of
# it in tool-remote-scripts:test, with model cases at 162-178 s against a ~70 s frozen budget and
# two deadline-bound cases failing at ~264 s; on 2026-11-18 both calibrations sat 3+ h in that
# batch. CI's remote jobs stay the authority for the family, but run on a PR only when the plan
# selects the remote partition (always on main), so a green host gate does not cover it. Lint,
# typecheck and build still run below; --excludeTaskDependencies skips the dependency builds the
# first run-many already made in this tree. Revert by dropping `,tool-remote-scripts` and the
# remote-scripts line. See docs/infra/gate-hosts.md.
# Proof (2026-11-18): toolchain-pins.test.ts `runs the h2puni gate with the same Twilight split
# as CI` failed on the pre-6.18 script (`Expected: 1 · Received: 0`) and, with only the line
# below deleted or only its --excludeTaskDependencies dropped, on `Expected to contain: ...`.
# Every run-many below runs at --parallel=1 (assumption A-GATE-PARALLEL-1, `dash-host-jobs` task
# 6.19, awaiting Dany): at --parallel=2 the gate's true peak does not fit a 15 GiB gate host. Dash
# recorded gate peaks of 12.94 GiB (2026-11-17) and 11.79 GiB (2026-11-18) against a 6 GiB
# envelope; on 2026-11-18 two unbounded h4claw calibrations died 59 min in, the cold one losing
# tool-fleet:test beside wbs-be-01's test and typecheck, the warm one with puni1's oom_kill counter
# rising 2 -> 3 and memory.peak at 13.9 GiB. The peak drops to the largest single task's, which
# is still multi-process: --parallel bounds Nx task concurrency only, and vitest in wbs-fe-01:test
# still fans out by nproc. The Nx run grows from ~58 min to an expected ~90. Revert by restoring --parallel=2 on the three lines.
# Proof (2026-11-18): toolchain-pins.test.ts `runs the h2puni gate with the same Twilight split
# as CI` failed on the --parallel=2 script (`Expected: 1 · Received: 0`) and, with only the
# remote-scripts or only the Twilight line back at --parallel=2, on `Expected to contain: ...`.
bunx nx run-many -t test lint typecheck build --parallel=1 --skip-nx-cache \
  --exclude=twilight-burokrat,twilight-dash,tool-remote-scripts
bunx nx run-many -t lint typecheck build -p tool-remote-scripts --parallel=1 --skip-nx-cache \
  --excludeTaskDependencies
bunx nx run-many -t test typecheck build -p twilight-burokrat,twilight-dash --parallel=1 \
  --skip-nx-cache
bunx nx run twilight-burokrat:lint:source --skip-nx-cache
bunx nx run twilight-dash:lint --skip-nx-cache
WBS_RUN_SOLVER_ORPHAN_PROC=1 bunx nx run wbs-be-01:solver-image-smoke
