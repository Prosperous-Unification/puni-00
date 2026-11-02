#!/usr/bin/env bash
set -euo pipefail

# The admitted half of `bin/test-queued.sh`. Run on its own it holds no lock and no admission,
# so nothing but `run_heavy_job` calls it.
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"
exec bunx nx run-many -t test
