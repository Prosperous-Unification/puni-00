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
bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$openspec_report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$openspec_report" >/dev/null
rm -f -- "$openspec_report"
trap - EXIT

bunx nx format:check --all
# Proof: dropping this exclusion made gate-entrypoints.test.ts lose the exact-once split and fail
# at `Expected to contain: --exclude=twilight-burokrat`; source lint is invoked below.
bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache --exclude=twilight-burokrat
bunx nx run-many -t test typecheck build -p twilight-burokrat --parallel=2 --skip-nx-cache
bunx nx run twilight-burokrat:lint:source --skip-nx-cache
WBS_RUN_SOLVER_ORPHAN_PROC=1 bunx nx run wbs-be-01:solver-image-smoke
