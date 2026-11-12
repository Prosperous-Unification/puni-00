#!/usr/bin/env bash
set -euo pipefail

# The admitted half of `bin/test-queued.sh <sha>` (`dash-host-jobs` task 6.12): the test half of
# the gate, run as the gate payload runs its steps. The tree is this checkout on an unenrolled
# host and the gate tree the admission handed the job on an enrolled one ({@link
# resolve_gate_tree}); the commit is checked out there and the tree returned to its resting
# commit after an enrolled run ({@link run_pinned_checkout}). Run on its own it holds no lock and
# no admission, so nothing but `run_heavy_job` calls it.

checkout=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

# shellcheck source=bin/h2puni-gate-lib.sh
# shellcheck disable=SC1091 # Followed only under `shellcheck -x`; see bin/h2puni-gate.sh.
source "$checkout/bin/h2puni-gate-lib.sh"

# Proof (observed 2026-11-12): removed, no argument died in `resolve_gate_commit` — `47d … refuses
# none: want exit 64, got 1` — and `<sha> extra` ignored the word and checked the sha out —
# `47d … refuses two: want exit 64, got 65` (bin/heavy-lock.test.sh, case 47).
if [[ $# -ne 1 ]]; then
  printf 'usage: %s <sha>\n' "${0##*/}" >&2
  exit 64
fi

# An Nx daemon left running would keep its cwd in the gate tree, a pool unit that settlement
# then finds held; the gate launcher exports the same for the same steps.
export NX_DAEMON=false

# Judged here, never inherited, exactly as bin/h2puni-gate-payload.sh judges it.
# Proof (observed 2026-11-12): with `resolve_gate_tree` replaced by the checkout, three
# launchers.test.ts cases failed: the enrolled payload without an admission and the unenrolled one
# with an inherited DASH_JOB_UNIT_GATE_TREE each exited 0 where 64 is expected, and `test-queued
# runs pinned in an admitted gate tree` found the tests run in the launcher checkout.
enrollment=$(read_host_pool_enrollment)
tree=$(resolve_gate_tree "$checkout" "$enrollment" bin/test-queued.sh)
settle=keep
if [[ $enrollment == enrolled ]]; then
  settle=restore
fi
pinned=$(resolve_gate_commit "$tree" "$checkout" "$1")

# The install is the gate steps' first step (bin/h2puni-gate-steps.sh carries its reason and
# proofs): the steps script takes no step list and cannot source a library under its PATH-stubbed
# fixture, so the one command is repeated rather than its body.
run_pinned_checkout "$tree" "$pinned" "$settle" \
  bash -c 'set -euo pipefail; bun install --frozen-lockfile; exec bunx nx run-many -t test'
