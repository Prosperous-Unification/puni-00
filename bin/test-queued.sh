#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

# shellcheck source=bin/h2puni-gate-lib.sh
# shellcheck disable=SC1091 # Followed only under `shellcheck -x`, which tool-fleet:check does
# not pass; the `source=` directive above names the file for runs that do.
source "$repo_root/bin/h2puni-gate-lib.sh"

# `bun run test:queued <sha>`: the workspace's tests at one commit as one heavy job, under the
# heavy lock on an unenrolled host or as a Dash host job on an enrolled one (`dash-host-jobs` J12).
# Since 2026-11-12 (task 6.12) the job runs in a gate tree, unit `gate_tree`, shared with the gate:
# the type's argument profile is the sha alone, because a tree the job checks out must be pinned
# to a commit, and the launcher checkout's own HEAD is not one the job may move.
# Proof (observed 2026-11-12): removed, no argument died in `resolve_gate_commit` — `47c … refuses
# none: want exit 64, got 1` — and `HEAD HEAD` went on to the lock and ran the payload in this
# checkout — `47c … refuses two: want exit 64, got 65` (bin/heavy-lock.test.sh, case 47).
if [[ $# -ne 1 ]]; then
  printf 'usage: %s <sha>\n' "${0##*/}" >&2
  exit 64
fi

# Resolved once, here, before the job is queued or admitted, so the label and the payload name
# the same commit, as `bin/h2puni-gate.sh` does; a target that names no commit is refused 64.
# Proof (observed 2026-11-12): with this resolution replaced by passing `$1` through,
# `bin/test-queued.sh not-a-commit` took the lock before its payload refused it — `47c: the
# refusal did not name the target, or came after the lock: heavy lock: waited 0s behind 0
# tickets` (bin/heavy-lock.test.sh, case 47).
test_sha=$(resolve_gate_commit "$repo_root" "$repo_root" "$1")
export HEAVY_LOCK_LABEL="test-queued:${test_sha:0:8}"

# Job type `test-queued` in infra/jobs/catalogue.json.
HEAVY_LOCK_JOB_TYPE=test-queued run_heavy_job -- "$repo_root/bin/test-queued-payload.sh" "$test_sha"
