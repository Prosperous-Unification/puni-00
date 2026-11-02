#!/usr/bin/env bash
set -euo pipefail

# The admitted half of `bin/publish-release.sh`: builds and publishes the release of this
# checkout's HEAD through tool-dagger. The sha is read here, inside the lock or the admission,
# so it names the commit the build reads. Run on its own it holds no lock and no admission, so
# nothing but `run_heavy_job` calls it.
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"
sha=$(git rev-parse HEAD)
exec env WBS_SHA="$sha" bun run tools/tool-dagger/src/main.ts "$@"
