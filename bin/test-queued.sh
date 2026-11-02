#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

# shellcheck source=bin/heavy-lock-lib.sh
# shellcheck disable=SC1091 # Followed only under `shellcheck -x`, which tool-fleet:check does
# not pass; the `source=` directive above names the file for runs that do.
source "$repo_root/bin/heavy-lock-lib.sh"

# `bun run test:queued`: the workspace's tests as one heavy job, under the heavy lock on an
# unenrolled host or as a Dash host job on an enrolled one (`dash-host-jobs` J12). The payload is
# a script of its own because the `test-queued` profile takes no arguments.
# Proof (observed 2026-11-02): removed, `bin/test-queued.sh extra` ignored the word and went on to
# the lock, refused here for the absent canonical lock — `47c … want exit 64, got 70`
# (bin/heavy-lock.test.sh, case 47).
if [[ $# -ne 0 ]]; then
  printf 'usage: %s (no arguments; the test-queued profile takes none)\n' "${0##*/}" >&2
  exit 64
fi
HEAVY_LOCK_JOB_TYPE=test-queued run_heavy_job -- "$repo_root/bin/test-queued-payload.sh"
