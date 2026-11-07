#!/usr/bin/env bash
# Negative tests for `bin/gate-launcher-refresh.sh` (`dash-host-jobs` 6.9). Each guard's injected
# fault and what it printed are in the `Proof:` comment beside it in the script.
#
# A fixture origin and launcher clone under a scratch directory, a fake `systemctl` first on
# PATH that logs its arguments, and real processes whose working directory is the checkout stand
# in for the jobs launched from it. No host path is read or written.
set -uo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
refresh="$repo_root/bin/gate-launcher-refresh.sh"

failures=0
fail() {
  printf '  FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}
pass() { printf '  ok: %s\n' "$1"; }
expect_status() {
  if [[ $1 == "$2" ]]; then pass "$3 (exit $2)"; else fail "$3: want exit $1, got $2"; fi
}
expect_equal() {
  if [[ $1 == "$2" ]]; then pass "$3"; else fail "$3: want '$1', got '$2'"; fi
}

if [[ $(uname -s) != Linux ]]; then
  printf 'gate launcher refresh: skipped on %s; it reads /proc\n' "$(uname -s)"
  exit 0
fi

scratch=$(mktemp -d "${TMPDIR:-/tmp}/gate-launcher-refresh-test.XXXXXX")
sleepers=()
cleanup() {
  local pid
  for pid in "${sleepers[@]}"; do kill "$pid" 2>/dev/null; done
  rm -rf "$scratch"
}
trap cleanup EXIT

fixture_git() { git -c user.name=test -c user.email=test@invalid -c commit.gpgsign=false "$@"; }
origin="$scratch/origin.git"
author="$scratch/author"
launcher="$scratch/launcher"
git init -q --bare --initial-branch=main "$origin"
git clone -q "$origin" "$author" 2>/dev/null
printf 'one\n' >"$author/tracked"
printf 'stable\n' >"$author/stable"
fixture_git -C "$author" add tracked stable
fixture_git -C "$author" commit -qm one
git -C "$author" push -q origin main
git clone -q "$origin" "$launcher"
git -C "$launcher" checkout -q --detach origin/main

# Publish one more commit on origin's main; prints its sha.
advance_origin() {
  printf '%s\n' "$1" >>"$author/tracked"
  fixture_git -C "$author" commit -qam "$1"
  git -C "$author" push -q origin main
  git -C "$author" rev-parse HEAD
}
launcher_head() { git -C "$launcher" rev-parse HEAD; }

mkdir -p "$scratch/fake-bin"
cat >"$scratch/fake-bin/systemctl" <<'FAKE'
#!/bin/sh
printf '%s\n' "$*" >>"$REFRESH_TEST_SYSTEMCTL_LOG"
exit "${REFRESH_TEST_SYSTEMCTL_STATUS:-0}"
FAKE
cat >"$scratch/fake-bin/bun" <<'FAKE'
#!/bin/sh
printf '%s in %s\n' "$*" "$PWD" >>"$REFRESH_TEST_BUN_LOG"
if [ -n "${REFRESH_TEST_BUN_FAILS_ON:-}" ] && grep -qx "$REFRESH_TEST_BUN_FAILS_ON" bun.lock; then exit 1; fi
exit 0
FAKE
chmod +x "$scratch/fake-bin/systemctl" "$scratch/fake-bin/bun"
systemctl_log="$scratch/systemctl.log"
bun_log="$scratch/bun.log"

# Run the refresh as the timer's service does, with `$@` as its arguments.
run_refresh() {
  REFRESH_TEST_SYSTEMCTL_LOG=$systemctl_log REFRESH_TEST_BUN_LOG=$bun_log PATH="$scratch/fake-bin:$PATH" \
    bash "$refresh" "$@"
}
# A process working in directory $1 until killed; leaves its pid in `$sleeper`.
start_worker() {
  (cd "$1" && exec sleep 300) &
  sleeper=$!
  sleepers+=("$sleeper")
  # Until the subshell has changed directory and become `sleep`.
  local polls=0
  while [[ $(readlink "/proc/$sleeper/cwd" 2>/dev/null) != "$1" && $polls -lt 200 ]]; do
    sleep 0.05
    polls=$((polls + 1))
  done
}

printf 'gate launcher refresh\n'
start_head=$(launcher_head)
target=$(advance_origin two)

# 1. A process working in the checkout refuses the move: 75, named, nothing moved or restarted.
rm -f "$systemctl_log"
start_worker "$launcher"
status=0
run_refresh "$launcher" >/dev/null 2>"$scratch/stderr" || status=$?
expect_status 75 "$status" '1: a process in the checkout refuses the move'
if grep -q "refusing to move $launcher from $start_head to $target while a job may run from it: $sleeper sleep" "$scratch/stderr"; then
  pass '1: the refusal names the checkout, both commits and the process'
else fail "1: the refusal did not name them: $(cat "$scratch/stderr")"; fi
expect_equal "$start_head" "$(launcher_head)" '1: the checkout did not move'
if [[ -e $systemctl_log ]]; then fail '1: the watch was restarted'; else pass '1: the watch was not restarted'; fi
kill "$sleeper" 2>/dev/null
wait "$sleeper" 2>/dev/null

# 1b. A process in a subdirectory of the checkout works in it too.
mkdir -p "$launcher/bin"
start_worker "$launcher/bin"
status=0
run_refresh "$launcher" >/dev/null 2>&1 || status=$?
expect_status 75 "$status" '1b: a process in a subdirectory of the checkout refuses the move'
kill "$sleeper" 2>/dev/null
wait "$sleeper" 2>/dev/null

# 2. Idle: the checkout moves to origin/main and the watch is restarted with try-restart.
rm -f "$systemctl_log"
status=0
run_refresh "$launcher" >"$scratch/stdout" 2>"$scratch/stderr" || status=$?
expect_status 0 "$status" '2: an idle checkout is moved'
expect_equal "$target" "$(launcher_head)" '2: the checkout is at origin/main'
expect_equal "--user try-restart dash-resources-watch.service" "$(cat "$systemctl_log" 2>/dev/null)" \
  '2: the watch was restarted, only if it was running'
if grep -q "moved $launcher from $start_head to $target" "$scratch/stdout"; then pass '2: the move is logged'
else fail "2: the move was not logged: $(cat "$scratch/stdout")"; fi

# 3. Already current: nothing moves and the watch is left alone, even beside a worker.
rm -f "$systemctl_log"
start_worker "$launcher"
status=0
run_refresh "$launcher" >"$scratch/stdout" 2>&1 || status=$?
expect_status 0 "$status" '3: a current checkout is left alone'
if [[ -e $systemctl_log ]]; then fail '3: the watch was restarted for nothing'; else pass '3: the watch was not restarted'; fi
kill "$sleeper" 2>/dev/null
wait "$sleeper" 2>/dev/null

# 4. The watch unit's own process runs from the checkout by design and does not block the move.
target=$(advance_origin three)
start_worker "$launcher"
status=0
# shellcheck disable=SC2016 # Single quotes are the point: a script for the inner shell.
REFRESH_TEST_SYSTEMCTL_LOG=$systemctl_log PATH="$scratch/fake-bin:$PATH" REFRESH_TEST_WATCH_PID=$sleeper \
  bash -c 'source "$1"
read_process_cgroup() {
  if [[ $1 == "$REFRESH_TEST_WATCH_PID" ]]; then
    printf "/user.slice/user-1000.slice/user@1000.service/app.slice/dash-resources-watch.service\n"
  fi
}
refresh_launcher_checkout "$2"' refresh-test "$refresh" "$launcher" >/dev/null 2>"$scratch/stderr" || status=$?
expect_status 0 "$status" '4: a watch process in the checkout does not block the move'
expect_equal "$target" "$(launcher_head)" '4: the checkout is at origin/main'
kill "$sleeper" 2>/dev/null
wait "$sleeper" 2>/dev/null

# 5. Local changes to a tracked file are never moved over, even where git would carry them along
# (origin never changes `stable`).
target=$(advance_origin four)
before=$(launcher_head)
printf 'local edit\n' >>"$launcher/stable"
status=0
run_refresh "$launcher" >/dev/null 2>"$scratch/stderr" || status=$?
expect_status 65 "$status" '5: a dirty checkout is refused'
expect_equal "$before" "$(launcher_head)" '5: the dirty checkout did not move'
git -C "$launcher" checkout -q -- stable

# 6. Usage, and 7. a path that is not the top of a work tree.
status=0
run_refresh >/dev/null 2>&1 || status=$?
expect_status 64 "$status" '6a: no checkout is a usage error'
status=0
run_refresh launcher >/dev/null 2>&1 || status=$?
expect_status 64 "$status" '6b: a relative checkout is a usage error'
status=0
run_refresh "$launcher/bin" >/dev/null 2>"$scratch/stderr" || status=$?
expect_status 70 "$status" '7: a subdirectory of a checkout is refused'
status=0
run_refresh "$scratch/missing" >/dev/null 2>&1 || status=$?
expect_status 70 "$status" '7b: a missing checkout is refused'

# 8. A restart that fails after the move is reported, with the command that completes it.
status=0
REFRESH_TEST_SYSTEMCTL_STATUS=1 run_refresh "$launcher" >/dev/null 2>"$scratch/stderr" || status=$?
expect_status 70 "$status" '8: a failed watch restart is reported'
expect_equal "$target" "$(launcher_head)" '8: the checkout moved before the restart'
if grep -q 'restart it by hand: systemctl --user restart dash-resources-watch.service' "$scratch/stderr"; then
  pass '8: the refusal names the restart to run'
else fail "8: the refusal did not name the restart: $(cat "$scratch/stderr")"; fi

if [[ -e $bun_log ]]; then fail "2-8: an install ran without a lockfile change: $(cat "$bun_log")"
else pass '2-8: no install ran while bun.lock stayed the same'; fi

# 10. A move across a lockfile change runs the checkout's frozen install before the restart; a
# failed install is reported and the watch is not restarted onto it.
printf 'lock one\n' >"$author/bun.lock"
fixture_git -C "$author" add bun.lock
fixture_git -C "$author" commit -qm lock
git -C "$author" push -q origin main
target=$(git -C "$author" rev-parse HEAD)
rm -f "$systemctl_log"
status=0
run_refresh "$launcher" >/dev/null 2>"$scratch/stderr" || status=$?
expect_status 0 "$status" '10: a move across a lockfile change succeeds'
expect_equal "install --frozen-lockfile in $launcher" "$(cat "$bun_log" 2>/dev/null)" \
  '10: the frozen install ran in the checkout'
expect_equal "--user try-restart dash-resources-watch.service" "$(cat "$systemctl_log" 2>/dev/null)" \
  '10: the watch was restarted after the install'
printf 'lock two\n' >"$author/bun.lock"
fixture_git -C "$author" commit -qam lock-two
git -C "$author" push -q origin main
rm -f "$systemctl_log" "$bun_log"
before=$(launcher_head)
status=0
REFRESH_TEST_BUN_FAILS_ON='lock two' run_refresh "$launcher" >/dev/null 2>"$scratch/stderr" || status=$?
expect_status 70 "$status" '10b: a failed frozen install is reported'
expect_equal "$before" "$(launcher_head)" '10b: the checkout returned to the commit the watch runs'
expect_equal "install --frozen-lockfile in $launcher
install --frozen-lockfile in $launcher" "$(cat "$bun_log" 2>/dev/null)" '10b: the old commit was installed again'
if [[ -e $systemctl_log ]]; then fail '10b: the watch was restarted onto a failed install'
else pass '10b: the watch was not restarted'; fi
if grep -q "returned it to $before with its install, and the next run retries" "$scratch/stderr"; then
  pass '10b: the refusal says the next run retries'
else fail "10b: the refusal did not say so: $(cat "$scratch/stderr")"; fi
rm -f "$bun_log"
status=0
REFRESH_TEST_BUN_FAILS_ON='lock.*' run_refresh "$launcher" >/dev/null 2>"$scratch/stderr" || status=$?
expect_status 70 "$status" '10c: a failed install and a failed return are reported'
if grep -q 'and so did the return to' "$scratch/stderr"; then pass '10c: the refusal names both failures'
else fail "10c: the refusal did not name both: $(cat "$scratch/stderr")"; fi
git -C "$launcher" checkout -q --detach "$before"

# 9. A fetch that fails is refused, not treated as current.
git -C "$launcher" remote set-url origin "$scratch/no-such-origin.git"
status=0
run_refresh "$launcher" >/dev/null 2>"$scratch/stderr" || status=$?
expect_status 70 "$status" '9: a failed fetch is refused'

# 11. A checkout with no HEAD commit is refused before anything moves.
unborn="$scratch/unborn"
git init -q --initial-branch=main "$unborn"
git -C "$unborn" remote add origin "$origin"
status=0
run_refresh "$unborn" >/dev/null 2>"$scratch/stderr" || status=$?
expect_status 70 "$status" '11: a checkout without a HEAD commit is refused'
if grep -q "$unborn has no HEAD commit" "$scratch/stderr"; then pass '11: the refusal names the checkout'
else fail "11: the refusal did not name it: $(cat "$scratch/stderr")"; fi
if git -C "$unborn" rev-parse --verify --quiet HEAD >/dev/null; then fail '11: the unborn checkout moved'
else pass '11: the unborn checkout did not move'; fi

printf '\n'
if [[ $failures -gt 0 ]]; then
  printf '%d check(s) failed\n' "$failures" >&2
  exit 1
fi
printf 'all gate launcher refresh checks passed\n'
