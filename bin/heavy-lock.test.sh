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
lock_lib="$repo_root/bin/heavy-lock-lib.sh"

# The library's own entry point, given the lock path as its first argument.
#
# **Not `bin/with-heavy-lock.sh` with an environment override**, which is what
# this suite did until `tool-dagger/src/heavy-lock.test.ts` pointed out that a
# caller able to choose its own lock path is a caller able to opt out of the
# lock. The production wrapper takes no path and no override; the seam is this
# argument, which only a test passes.
run_locked() {
  local sh=$1 lock=$2
  shift 2
  # `HEAVY_LOCK_WAIT_SECONDS` forwarded explicitly. A `VAR=x run_locked …` prefix
  # sets it for this function, but POSIX leaves it unspecified whether a function
  # call's prefix is exported to commands the function then runs — and bash does
  # not export it, so the queueing cases silently ran with the default 0 and were
  # refused instead of queueing.
  # shellcheck disable=SC2016 # Single quotes are the point: this string is a
  # script for the inner shell, whose `$1` and `$@` are its own arguments and
  # must not be expanded here.
  local inner='source "$1"; shift; with_heavy_lock "$@"'
  HEAVY_LOCK_WAIT_SECONDS="${HEAVY_LOCK_WAIT_SECONDS:-0}" \
    "$sh" -c "$inner" heavy-lock-test "$lock_lib" "$lock" -- "$@"
}
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
  run_locked "$sh" "$lock" true || status=$?
  expect_status 0 "$status" "1a: a plain run succeeds"
  if [[ -d $lock.d ]]; then fail "1b: the lock leaked"; else pass "1b: the lock is released"; fi

  # Case 2 — the guard is `is_process_alive`. Broken, the second run starts.
  run_locked "$sh" "$lock" sleep 6 &
  local holder_job=$!
  sleep 1
  status=0
  run_locked "$sh" "$lock" true || status=$?
  expect_status 75 "$status" "2: a concurrent run is refused"
  wait "$holder_job"
  if [[ -d $lock.d ]]; then fail "2b: the lock leaked"; else pass "2b: the lock is released"; fi

  run_locked "$sh" "$lock" sleep 6 &
  holder_job=$!
  sleep 1
  local started=$SECONDS
  status=0
  HEAVY_LOCK_WAIT_SECONDS=60 run_locked "$sh" "$lock" true || status=$?
  local waited=$((SECONDS - started))
  expect_status 0 "$status" "3a: a queueing run gets its turn"
  # 3s against a 6s holder. The queueing run polls every 5s, so a genuine queue
  # cannot come back under ~5 — but the holder is a real process and a loaded host
  # can be slow to start it, which shortens the window without meaning anything.
  # A run that did not queue at all returns in milliseconds, so 3 still separates
  # the two cases by an order of magnitude.
  if [[ $waited -ge 3 ]]; then pass "3b: it waited ${waited}s for the holder"; else fail "3b: it waited only ${waited}s, so it did not queue"; fi
  wait "$holder_job"

  status=0
  run_locked "$sh" "$lock" bash -c 'exit 42' || status=$?
  expect_status 42 "$status" "4: the wrapped command's exit code is forwarded"

  # Case 5 — the guard is the `-w` check. Broken, this spins out the whole
  # budget and then lies about who holds the lock.
  local readonly_dir="${TMPDIR:-/tmp}/wbs-heavy-lock-ro.$$"
  mkdir -p "$readonly_dir" && chmod 500 "$readonly_dir"
  started=$SECONDS
  status=0
  HEAVY_LOCK_WAIT_SECONDS=15 run_locked "$sh" "$readonly_dir/lock" true || status=$?
  waited=$((SECONDS - started))
  expect_status 70 "$status" "5a: an unwritable lock directory throws"
  # 10s, not 5, against a 15s budget. The fault this watches turned a 0s exit-70
  # into a **16s** spin, so anything below the budget still catches it — and the
  # tighter bound was load-sensitive: this suite runs on a machine that may have a
  # full Nx gate on it, where a "0s" operation can take several. A negative whose
  # verdict depends on how busy the host is reports on the host, not on the code.
  if [[ $waited -lt 10 ]]; then pass "5b: it threw at once rather than spinning (${waited}s)"; else fail "5b: it spun ${waited}s against a lock nobody can take"; fi
  chmod 700 "$readonly_dir" && rm -rf "$readonly_dir"

  # Case 6 — the guard is the pid-format check. Broken, it reclaims a lock whose
  # holder it could not read and runs anyway.
  mkdir -p "$lock.d" && printf 'not-a-pid\n' >"$lock.d/holder"
  status=0
  run_locked "$sh" "$lock" true || status=$?
  expect_status 70 "$status" "6: a holder file that is not a pid throws"
  rm -rf "$lock.d"

  mkdir -p "$lock.d" && printf '999999\n' >"$lock.d/holder"
  status=0
  run_locked "$sh" "$lock" true || status=$?
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
