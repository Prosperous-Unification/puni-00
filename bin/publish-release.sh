#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

# shellcheck source=bin/heavy-lock-lib.sh
# shellcheck disable=SC1091 # Followed only under `shellcheck -x`, which tool-fleet:check does
# not pass; the `source=` directive above names the file for runs that do.
source "$repo_root/bin/heavy-lock-lib.sh"

# The outer launcher: the build itself is `bin/publish-release-payload.sh`, run under the heavy
# lock on an unenrolled host or as a Dash host job on an enrolled one (`dash-host-jobs` J12). The
# `release-build` profile takes no arguments, so on an enrolled host Dash refuses any with 64.
# Job type `release-build` in infra/jobs/catalogue.json.
HEAVY_LOCK_JOB_TYPE=release-build run_heavy_job -- "$repo_root/bin/publish-release-payload.sh" "$@"
