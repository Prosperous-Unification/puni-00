#!/usr/bin/env bash
# Negative tests for the host-wide heavy-work lock.
#
# Every case here has been watched FAILING with its guard deliberately broken;
# the injected fault and what it printed are recorded in the `Proof:` comment
# beside the guard in `heavy-lock-lib.sh`. Cases 2, 5, 6 and 8-14 carry a proof —
# the rest are contract checks. Case 8 is the odd one: its fault is not an
# injected one but the code that shipped, which served whichever waiter polled
# first.
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
  # All three knobs are forwarded EXPLICITLY. A `VAR=x run_locked …` prefix sets
  # them for this function, but POSIX leaves it unspecified whether a function
  # call's prefix is exported to commands the function then runs — and bash does
  # not export it, so the queueing cases silently ran with the default 0 and were
  # refused instead of queueing. The two added here would fail the same way: the
  # arrival-order case is meaningless if its second waiter polls at the default
  # rate, and the status case has nothing to read if the labels never arrive.
  # shellcheck disable=SC2016 # Single quotes are the point: this string is a
  # script for the inner shell, whose `$1` and `$@` are its own arguments and
  # must not be expanded here.
  local inner='source "$1"; shift; with_heavy_lock "$@"'
  HEAVY_LOCK_WAIT_SECONDS="${HEAVY_LOCK_WAIT_SECONDS:-0}" \
    HEAVY_LOCK_POLL_SECONDS="${HEAVY_LOCK_POLL_SECONDS:-5}" \
    HEAVY_LOCK_LABEL="${HEAVY_LOCK_LABEL:-unlabeled}" \
    "$sh" -c "$inner" heavy-lock-test "$lock_lib" "$lock" -- "$@"
}

# The queue report, through the same lock-path seam every case above uses.
#
# `bin/with-heavy-lock.sh status` is the production route and takes no path, so
# running THAT here would report on the canonical host-wide lock — the one a real
# gate may be holding while this suite runs. Case 11 pins the wiring by reading
# the wrapper instead.
run_status() {
  local sh=$1 lock=$2
  # shellcheck disable=SC2016 # Single quotes are the point: `$1`/`$@` belong to
  # the inner shell, not to this one.
  local inner='source "$1"; shift; report_heavy_lock_status "$@"'
  "$sh" -c "$inner" heavy-lock-status-test "$lock_lib" "$lock"
}

count_queued_tickets() {
  local lock=$1 queued=0 ticket
  for ticket in "$lock.queue"/*; do
    [[ -e $ticket ]] && queued=$((queued + 1))
  done
  printf '%s\n' "$queued"
}

# Block until the lock at $1 is held, or fail saying it never was.
#
# `claim_heavy_lock` writes its pid AFTER `mkdir`, so waiting on the directory
# alone would let the next waiter queue against a holder that has not recorded
# itself yet.
await_lock_held() {
  local lock=$1 polls=0
  while [[ ! -s $lock.d/holder ]]; do
    if [[ $polls -ge 100 ]]; then
      fail "no holder appeared at $lock.d in 10s"
      return 1
    fi
    sleep 0.1
    polls=$((polls + 1))
  done
}

# Block until $2 tickets are queued at lock $1, or fail saying how many there are.
#
# **Arrival order is what these cases assert, so arrival is OBSERVED rather than
# inferred from a sleep.** A waiter launched a second after another one still
# stamps the older ticket if the host is slow enough to start it — and then the
# case fails for a reason that is about the host, not the lock.
await_queued_tickets() {
  local lock=$1 want=$2 polls=0
  while [[ $(count_queued_tickets "$lock") -lt $want ]]; do
    if [[ $polls -ge 100 ]]; then
      fail "waited 10s for $want tickets at $lock.queue and saw $(count_queued_tickets "$lock")"
      return 1
    fi
    sleep 0.1
    polls=$((polls + 1))
  done
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

  # Case 8 — arrival order, and the reason the poll rates differ.
  #
  # A arrives first and polls every 5s; B arrives a second later and polls every
  # 1s. The holder releases at ~4s, while A is still inside its first sleep and B
  # is not — so under the poll-first lottery B takes the lock it queued for
  # second, every time. Watched doing exactly that before the queue existed
  # ("8: waiters are served in arrival order: want 'a b ', got 'b a '"), which is
  # what makes this case a negative rather than a hopeful race.
  local order_log="$lock.order"
  rm -f "$order_log"
  run_locked "$sh" "$lock" sleep 4 &
  holder_job=$!
  await_lock_held "$lock"
  HEAVY_LOCK_WAIT_SECONDS=60 HEAVY_LOCK_LABEL=a \
    run_locked "$sh" "$lock" bash -c 'printf "%s\n" "$1" >>"$2"' arrival-a a "$order_log" &
  local first_waiter=$!
  await_queued_tickets "$lock" 1
  HEAVY_LOCK_WAIT_SECONDS=60 HEAVY_LOCK_POLL_SECONDS=1 HEAVY_LOCK_LABEL=b \
    run_locked "$sh" "$lock" bash -c 'printf "%s\n" "$1" >>"$2"' arrival-b b "$order_log" &
  local second_waiter=$!
  await_queued_tickets "$lock" 2
  wait "$holder_job" "$first_waiter" "$second_waiter"
  local arrival_order
  arrival_order=$(tr '\n' ' ' <"$order_log")
  if [[ $arrival_order == 'a b ' ]]; then
    pass "8: waiters are served in arrival order"
  else
    fail "8: waiters are served in arrival order: want 'a b ', got '$arrival_order'"
  fi

  # Case 9 — the guard is `remove_dead_tickets`. A waiter killed with SIGKILL
  # runs no trap, so its ticket outlives it; leave that ticket in place and the
  # queue never moves again, which is the starvation this change exists to end,
  # in a worse form. The stamp is 19 digits and older than any real one, so this
  # ticket is unambiguously ahead of the run below.
  local stderr_log="$lock.stderr"
  local dead_ticket_name=1000000000000000000-999999
  mkdir -p "$lock.queue"
  printf 'pid 999999\nlabel dead\nstarted 2001-09-09T01:46:40Z\ncommand sleep\n' \
    >"$lock.queue/$dead_ticket_name"
  status=0
  run_locked "$sh" "$lock" true 2>"$stderr_log" || status=$?
  expect_status 0 "$status" "9a: a dead waiter's ticket does not hold the queue"
  if [[ -e $lock.queue/$dead_ticket_name ]]; then
    fail "9b: the dead ticket was left in the queue"
  else
    pass "9b: the dead ticket was removed"
  fi
  if grep -q "removing ticket $dead_ticket_name from dead pid 999999" "$stderr_log"; then
    pass "9c: the removal named the ticket it removed"
  else
    fail "9c: the removal did not name the ticket: $(cat "$stderr_log")"
  fi

  # Case 10 — the guard is `prepare_ticket_queue`, and the mode is 300 rather
  # than 000 deliberately: a WRITE-ONLY queue is the dangerous one. The ticket
  # still gets written, and the glob over a directory this process cannot read
  # expands to nothing — so the run reads a queue with nobody in it and claims
  # the lock straight over the older live ticket sitting there. Mutual exclusion
  # still works; the arrival order this file promises silently does not. The
  # planted ticket names this suite's own pid, which is alive, so it cannot be
  # dismissed as dead.
  local ahead_marker="$lock.ahead-marker"
  local live_ticket_name="1000000000000000000-$$"
  rm -f "$ahead_marker"
  printf 'pid %s\nlabel planted\nstarted 2001-09-09T01:46:40Z\ncommand sleep\n' "$$" \
    >"$lock.queue/$live_ticket_name"
  chmod 300 "$lock.queue"
  status=0
  run_locked "$sh" "$lock" bash -c 'printf "RAN AHEAD OF THE QUEUE\n" >"$0"' "$ahead_marker" \
    2>"$stderr_log" || status=$?
  expect_status 70 "$status" "10a: an unreadable queue directory throws"
  if grep -q "queue directory $lock.queue is not readable and writable" "$stderr_log"; then
    pass "10b: the refusal named the queue directory"
  else
    fail "10b: the refusal did not name the queue directory: $(cat "$stderr_log")"
  fi
  if [[ -e $ahead_marker ]]; then
    fail "10c: it ran ahead of a queue it could not read"
  else
    pass "10c: it never ran ahead of a queue it could not read"
  fi
  # And the other half of the same guard: a queue it can read but not write is
  # equally unusable, and without the check the ticket redirect fails with a bare
  # `Permission denied` and exit 1 — a lock failure reported as a command failure.
  chmod 500 "$lock.queue"
  status=0
  run_locked "$sh" "$lock" true 2>"$stderr_log" || status=$?
  expect_status 70 "$status" "10d: an unwritable queue directory throws"
  chmod 700 "$lock.queue" && rm -f "$lock.queue/$live_ticket_name"

  # Case 11 — `status` is the only way a queued lane can see why it is waiting.
  # The pids are matched as digits rather than against `$!`: bash may exec the
  # inner shell in place of the subshell it forked, and a case that asserts which
  # of the two pids it got is asserting an optimisation, not the report.
  HEAVY_LOCK_LABEL=holder run_locked "$sh" "$lock" sleep 5 &
  holder_job=$!
  await_lock_held "$lock"
  HEAVY_LOCK_WAIT_SECONDS=60 HEAVY_LOCK_LABEL=first run_locked "$sh" "$lock" true &
  first_waiter=$!
  await_queued_tickets "$lock" 1
  HEAVY_LOCK_WAIT_SECONDS=60 HEAVY_LOCK_POLL_SECONDS=1 HEAVY_LOCK_LABEL=second \
    run_locked "$sh" "$lock" true &
  second_waiter=$!
  await_queued_tickets "$lock" 2
  local queue_report
  queue_report=$(run_status "$sh" "$lock")
  local holder_pattern='^heavy lock: holder pid [0-9]+ label holder$'
  local first_pattern='^heavy lock: waiter pid [0-9]+ label first age [0-9]+s$'
  local second_pattern='^heavy lock: waiter pid [0-9]+ label second age [0-9]+s$'
  if [[ $(printf '%s\n' "$queue_report" | sed -n 1p) =~ $holder_pattern ]]; then
    pass "11a: status names the holder and its lane"
  else
    fail "11a: status did not name the holder and its lane: $queue_report"
  fi
  if [[ $(printf '%s\n' "$queue_report" | sed -n 2p) =~ $first_pattern ]]; then
    pass "11b: the waiter that arrived first is listed first, with its age"
  else
    fail "11b: the first waiter is not listed first: $queue_report"
  fi
  if [[ $(printf '%s\n' "$queue_report" | sed -n 3p) =~ $second_pattern ]]; then
    pass "11c: the waiter that arrived second is listed second, with its age"
  else
    fail "11c: the second waiter is not listed second: $queue_report"
  fi
  local reported_lines
  reported_lines=$(printf '%s\n' "$queue_report" | grep -c '^heavy lock: ')
  if [[ $reported_lines -eq 3 ]]; then
    pass "11d: status prints one line per entry"
  else
    fail "11d: status printed $reported_lines lines for a holder and two waiters: $queue_report"
  fi
  wait "$holder_job" "$first_waiter" "$second_waiter"
  # The wiring, read off the wrapper: production takes no lock path, so the only
  # thing this suite can check about it is that `status` reaches the report with
  # the canonical path and nothing else.
  if grep -qF 'report_heavy_lock_status "$(resolve_heavy_lock_path)"' "$repo_root/bin/with-heavy-lock.sh"; then
    pass "11e: bin/with-heavy-lock.sh status reports on the canonical lock"
  else
    fail "11e: bin/with-heavy-lock.sh does not report on the canonical lock"
  fi

  # Case 12 — the guard is `read_ticket_pid`. The tempting reading of a name it
  # cannot parse is "no live pid in there, so it is dead", which deletes a file
  # this code did not write on the strength of a name it could not read.
  printf 'stray\n' >"$lock.queue/note"
  status=0
  run_locked "$sh" "$lock" true 2>"$stderr_log" || status=$?
  expect_status 70 "$status" "12a: an unorderable name in the queue throws"
  if [[ -e $lock.queue/note ]]; then
    pass "12b: it left the file it could not identify alone"
  else
    fail "12b: it deleted a file it could not identify"
  fi
  rm -f "$lock.queue/note"

  # Case 13 — what `status` refuses. A report is read by a human deciding whether
  # to clear a lock by hand, so "nobody holds it" about a lock it could not read,
  # or a blank label for a waiter it could not read, is the one answer worse than
  # an error.
  rm -rf "$lock.d"
  mkdir -p "$lock.d" && printf '999999\n' >"$lock.d/holder" && printf 'held\n' >"$lock.d/label"
  chmod 000 "$lock.d"
  status=0
  run_status "$sh" "$lock" >/dev/null 2>"$stderr_log" || status=$?
  expect_status 70 "$status" "13a: status throws on a lock directory it cannot read"
  chmod 700 "$lock.d" && rm -rf "$lock.d"
  printf 'pid 999999\nstarted 2001-09-09T01:46:40Z\ncommand sleep\n' \
    >"$lock.queue/$dead_ticket_name"
  status=0
  run_status "$sh" "$lock" >/dev/null 2>"$stderr_log" || status=$?
  expect_status 70 "$status" "13b: status throws on a ticket that records no lane label"
  printf 'pid 999999\nlabel dead\nstarted 2001-09-09T01:46:40Z\ncommand sleep\n' \
    >"$lock.queue/$dead_ticket_name"
  chmod 000 "$lock.queue/$dead_ticket_name"
  status=0
  run_status "$sh" "$lock" >/dev/null 2>"$stderr_log" || status=$?
  expect_status 70 "$status" "13c: status throws on a ticket it cannot read"
  chmod 600 "$lock.queue/$dead_ticket_name" && rm -f "$lock.queue/$dead_ticket_name"
  printf 'pid 999999\nlabel dead\nstarted 2001-09-09T01:46:40Z\ncommand sleep\n' \
    >"$lock.queue/$dead_ticket_name"
  chmod 000 "$lock.queue"
  status=0
  run_status "$sh" "$lock" >/dev/null 2>"$stderr_log" || status=$?
  expect_status 70 "$status" "13d: status throws on a queue directory it cannot read"
  chmod 700 "$lock.queue" && rm -f "$lock.queue/$dead_ticket_name"

  # Case 14 — the guard is the 19-digit check in `read_epoch_nanoseconds`. BSD
  # `date` does not fail on `+%N`; it prints a literal `N`. A ticket named
  # `1758012345N-<pid>` sorts before every real ticket, so that host would hold
  # the head of the queue for ever while every check here still passed.
  local clockless_bin="${TMPDIR:-/tmp}/wbs-heavy-lock-clockless.$$.$(basename "$sh")"
  rm -rf "$clockless_bin"
  mkdir -p "$clockless_bin"
  local clockless_tool clockless_tool_path
  # `bash` is on this PATH for the PAYLOAD's sake, not the library's: without it
  # the run reaches its command and dies 127, and the marker below would then be
  # absent for a reason that has nothing to do with the clock.
  for clockless_tool in bash mkdir dirname cat rm sleep sed; do
    clockless_tool_path=$(type -P "$clockless_tool")
    if [[ -z $clockless_tool_path ]]; then
      fail "14: this image has no $clockless_tool, so the clockless PATH cannot be built"
    else
      ln -s "$clockless_tool_path" "$clockless_bin/$clockless_tool"
    fi
  done
  printf '#!/bin/sh\nprintf "1758012345N\\n"\n' >"$clockless_bin/date"
  chmod 755 "$clockless_bin/date"
  local clockless_marker="$lock.clockless-marker"
  rm -f "$clockless_marker"
  status=0
  PATH="$clockless_bin" run_locked "$sh" "$lock" \
    bash -c 'printf "RAN ON AN UNORDERABLE TICKET\n" >"$0"' "$clockless_marker" \
    2>"$stderr_log" || status=$?
  expect_status 70 "$status" "14a: a host with no nanosecond clock throws"
  if [[ -e $clockless_marker ]]; then
    fail "14b: it ran on a ticket it could not order"
  else
    pass "14b: it never ran on a ticket it could not order"
  fi
  if compgen -G "$lock.queue/*" >/dev/null; then
    fail "14c: it left a ticket it could not order: $(ls "$lock.queue")"
  else
    pass "14c: it queued no ticket it could not order"
  fi
  rm -rf "$clockless_bin"

  # Case 15 — the other half of `prepare_ticket_queue`: a queue path that is not a
  # directory. 15b is the assertion with teeth. Removing the refusal does not let
  # a run through — the readability check catches whatever it leaves behind — but
  # it makes every answer wrong: a plain file is refused as a directory that is
  # `not readable and writable`, and a lock whose queue has yet to be created is
  # refused the same way. A refusal that names the wrong thing sends the next
  # agent to chmod a path that needed removing.
  rm -rf "$lock.queue"
  printf 'not a queue\n' >"$lock.queue"
  status=0
  run_locked "$sh" "$lock" true 2>"$stderr_log" || status=$?
  expect_status 70 "$status" "15a: a queue path that is not a directory throws"
  if grep -q "cannot create the queue directory $lock.queue" "$stderr_log"; then
    pass "15b: the refusal named the path it could not use"
  else
    fail "15b: the refusal did not name the path: $(cat "$stderr_log")"
  fi
  rm -f "$lock.queue"

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
