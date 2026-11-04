#!/usr/bin/env bash
set -euo pipefail

# The admitted half of `bin/test-queued.sh`. Run on its own it holds no lock and no admission,
# so nothing but `run_heavy_job` calls it.
# Proof (observed 2026-11-02): removed, the payload ran (a stub `bunx`) and ignored `extra` —
# `47d … want exit 64, got 0` (bin/heavy-lock.test.sh, case 47).
if [[ $# -ne 0 ]]; then
  printf 'usage: %s (no arguments)\n' "${0##*/}" >&2
  exit 64
fi
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"
exec bunx nx run-many -t test
