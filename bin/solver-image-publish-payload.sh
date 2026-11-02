#!/usr/bin/env bash
set -euo pipefail

# The admitted half of `bin/solver-image-publish.sh`: the candidate's own tool-dagger builds the
# `be` tier from the candidate root and publishes it. Run on its own it holds no lock and no
# admission, so nothing but `run_heavy_job` calls it.
# Proof (observed 2026-11-02): with the 40-hex test removed, `abc` reached the build command as
# WBS_SHA — `47b … want exit 64, got 0`; with the absolute-path test removed, a relative
# SOLVER_PUBLISH_BUN ran and failed on `Module not found` — `47e … want exit 64, got 1`
# (bin/heavy-lock.test.sh, case 47).
if [[ $# -ne 1 || ! $1 =~ ^[0-9a-f]{40}$ ]]; then
  printf 'usage: %s <40-hex sha>\n' "${0##*/}" >&2
  exit 64
fi
for variable in SOLVER_PUBLISH_BUN SOLVER_PUBLISH_ROOT; do
  value=${!variable:-}
  if [[ $value != /* ]]; then
    printf 'solver image publish: %s is %q; it must be an absolute path\n' "$variable" "$value" >&2
    exit 64
  fi
done
cd "$SOLVER_PUBLISH_ROOT"
exec env WBS_SHA="$1" "$SOLVER_PUBLISH_BUN" run "$SOLVER_PUBLISH_ROOT/tools/tool-dagger/src/main.ts" be
