#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

# shellcheck source=bin/heavy-lock-lib.sh
source "$repo_root/bin/heavy-lock-lib.sh"

# `bun run test:queued`: the workspace's tests as one heavy job, under the heavy lock on an
# unenrolled host or as a Dash host job on an enrolled one (`dash-host-jobs` J12). The payload is
# a script of its own because the `test-queued` profile takes no arguments.
HEAVY_LOCK_JOB_TYPE=test-queued run_heavy_job -- "$repo_root/bin/test-queued-payload.sh"
