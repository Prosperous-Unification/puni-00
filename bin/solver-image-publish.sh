#!/usr/bin/env bash
set -euo pipefail

# `tools/tool-devsync/src/solver-binding-runtime.ts` publishes the solver image of a prepared
# candidate through this launcher of the live checkout: `solver-image-publish.sh <sha>`, with the
# candidate's Bun and root in `$SOLVER_PUBLISH_BUN` and `$SOLVER_PUBLISH_ROOT`. It runs from its
# own checkout because, on an enrolled host, Dash reads the job catalogue at the HEAD of the
# checkout it is started in, and the candidate root need not be a Git checkout at all.
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

# shellcheck source=bin/heavy-lock-lib.sh
source "$repo_root/bin/heavy-lock-lib.sh"

if [[ $# -ne 1 ]]; then
  printf 'usage: %s <sha>\n' "${0##*/}" >&2
  exit 64
fi
HEAVY_LOCK_JOB_TYPE=solver-image-publish run_heavy_job -- \
  "$repo_root/bin/solver-image-publish-payload.sh" "$1"
