#!/usr/bin/env bash
# Negative tests for the host-wide heavy-work lock.
#
# Every case here has been watched FAILING with its guard deliberately broken;
# the injected fault and what it printed are recorded in the `Proof:` comment
# beside the guard in `heavy-lock-lib.sh`. Cases 2, 5 and 6 are the three that
# carry a proof — the rest are contract checks.
#
# Runs the whole suite under bash 3.2 (macOS `/bin/bash`) as well as whatever
# `bash` resolves to, because the first two bugs in this file were a trap that
# only leaked under `set -u` and a `${var@Q}` that is a syntax error on 3.2.
set -uo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
runner="$repo_root/bin/with-heavy-lock.sh"
failures=0

fail() {
  printf '  FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

pass() { printf '  ok: %s\n' "$1"; }

expect_status() {
  local want=$1 got=$2 what=$3
  if [[ $got -eq $want ]]; then pass "$what (exit $got)"; else fail "$what: want exit $want, got $got"; fi
}

run_suite() {
  local sh=$1
  local lock
  lock="${TMPDIR:-/tmp}/wbs-heavy-lock-test.$$.$(basename "$sh")"
  rm -rf "$lock"*
  printf '\n== %s\n' "$("$sh" --version | head -1)"

  local status

  status=0
  WBS_HEAVY_LOCK=$lock "$sh" "$runner" -- true || status=$?
  expect_status 0 "$status" "1a: a plain run succeeds"
  if [[ -d $lock.d ]]; then fail "1b: the lock leaked"; else pass "1b: the lock is released"; fi

  # Case 2 — the guard is `is_process_alive`. Broken, the second run starts.
  WBS_HEAVY_LOCK=$lock "$sh" "$runner" -- sleep 6 &
  local holder_job=$!
  sleep 1
  status=0
  WBS_HEAVY_LOCK=$lock "$sh" "$runner" -- true || status=$?
  expect_status 75 "$status" "2: a concurrent run is refused"
  wait "$holder_job"
  if [[ -d $lock.d ]]; then fail "2b: the lock leaked"; else pass "2b: the lock is released"; fi

  WBS_HEAVY_LOCK=$lock "$sh" "$runner" -- sleep 6 &
  holder_job=$!
  sleep 1
  local started=$SECONDS
  status=0
  HEAVY_LOCK_WAIT_SECONDS=60 WBS_HEAVY_LOCK=$lock "$sh" "$runner" -- true || status=$?
  local waited=$((SECONDS - started))
  expect_status 0 "$status" "3a: a queueing run gets its turn"
  if [[ $waited -ge 4 ]]; then pass "3b: it waited ${waited}s for the holder"; else fail "3b: it waited only ${waited}s, so it did not queue"; fi
  wait "$holder_job"

  status=0
  WBS_HEAVY_LOCK=$lock "$sh" "$runner" -- bash -c 'exit 42' || status=$?
  expect_status 42 "$status" "4: the wrapped command's exit code is forwarded"

  # Case 5 — the guard is the `-w` check. Broken, this spins out the whole
  # budget and then lies about who holds the lock.
  local readonly_dir="${TMPDIR:-/tmp}/wbs-heavy-lock-ro.$$"
  mkdir -p "$readonly_dir" && chmod 500 "$readonly_dir"
  started=$SECONDS
  status=0
  HEAVY_LOCK_WAIT_SECONDS=15 WBS_HEAVY_LOCK="$readonly_dir/lock" "$sh" "$runner" -- true || status=$?
  waited=$((SECONDS - started))
  expect_status 70 "$status" "5a: an unwritable lock directory throws"
  if [[ $waited -lt 5 ]]; then pass "5b: it threw at once rather than spinning (${waited}s)"; else fail "5b: it spun ${waited}s against a lock nobody can take"; fi
  chmod 700 "$readonly_dir" && rm -rf "$readonly_dir"

  # Case 6 — the guard is the pid-format check. Broken, it reclaims a lock whose
  # holder it could not read and runs anyway.
  mkdir -p "$lock.d" && printf 'not-a-pid\n' >"$lock.d/holder"
  status=0
  WBS_HEAVY_LOCK=$lock "$sh" "$runner" -- true || status=$?
  expect_status 70 "$status" "6: a holder file that is not a pid throws"
  rm -rf "$lock.d"

  mkdir -p "$lock.d" && printf '999999\n' >"$lock.d/holder"
  status=0
  WBS_HEAVY_LOCK=$lock "$sh" "$runner" -- true || status=$?
  expect_status 0 "$status" "7: a lock held by a dead pid is reclaimed"

  rm -rf "$lock"*
}

# /bin/bash is 3.2 on macOS and is what a `#!/usr/bin/env bash` script gets when
# no newer bash is on PATH, so it is never skipped. The modern bash is probed by
# path rather than through `command -v bash`, which resolves to /bin/bash inside
# this script and silently ran the 3.2 suite twice.
run_suite /bin/bash
for modern_bash in /opt/homebrew/bin/bash /usr/local/bin/bash; do
  if [[ -x $modern_bash ]]; then
    run_suite "$modern_bash"
    break
  fi
done

printf '\n'
if [[ $failures -gt 0 ]]; then
  printf '%d check(s) failed\n' "$failures" >&2
  exit 1
fi
printf 'all heavy-lock checks passed\n'
