#!/usr/bin/env bash
set -euo pipefail

# The admitted half of the gate (`dash-host-jobs` J15): `bin/h2puni-gate.sh <sha>` resolves the
# sha, labels the lane and runs this through `run_heavy_job`, under the heavy lock on an
# unenrolled host or as a Dash host job on an enrolled one. It takes the sha alone, the `gate`
# type's argument profile; the trusted wiki launcher copy arrives as
# `$H2PUNI_GATE_TRUSTED_LAUNCHER`, empty when no activation is provisioned.
#
# The tree it gates is this checkout on an unenrolled host and the gate tree the admission
# handed it on an enrolled one; {@link resolve_gate_tree} owns that choice. Run on its own it
# holds no lock and no admission, so nothing but `run_heavy_job` calls it.

checkout=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

# shellcheck source=bin/h2puni-gate-lib.sh
# shellcheck disable=SC1091 # Followed only under `shellcheck -x`; see bin/h2puni-gate.sh.
source "$checkout/bin/h2puni-gate-lib.sh"

if [[ $# -ne 1 ]]; then
  printf 'usage: %s <sha>\n' "${0##*/}" >&2
  exit 64
fi

# Judged here, under the lock or the admission, and never taken from the environment: an
# inherited verdict would let any caller name the host unenrolled and gate the launcher checkout
# with no admission (slice 6a review G1). A host enrolled while a gate is queued therefore makes
# this payload refuse 64; enrollment drains the queue first (J12).
# Proof (observed 2026-11-02): reading an inherited `HEAVY_JOB_ENROLLMENT` here made `the
# enrolled payload ignores an inherited verdict` (launchers.test.ts) exit 0 where 64 is expected.
enrollment=$(read_host_pool_enrollment)
tree=$(resolve_gate_tree "$checkout" "$enrollment")
settle=keep
if [[ $enrollment == enrolled ]]; then
  settle=restore
fi
pinned=$(resolve_gate_commit "$tree" "$checkout" "$1")

# shellcheck disable=SC2016 # Single quotes are the point: `$1`-`$4` belong to the inner shell.
run_pinned_checkout "$tree" "$pinned" "$settle" \
  bash -c 'set -euo pipefail; if [[ -n "$1" ]]; then bash "$1" committed "$2" "$3"; else printf "%s\n" "{\"schemaVersion\":1,\"status\":\"inactive\",\"certified\":false,\"reason\":\"external activation marker is not provisioned\"}"; fi; exec bash "$4" "$2" "$3"' \
  h2puni-preserved-wiki "${H2PUNI_GATE_TRUSTED_LAUNCHER:-}" "$tree" HEAD \
  "$tree/bin/h2puni-gate-steps.sh"
