#!/usr/bin/env bash
set -euo pipefail

# The host-wide mutex that keeps two heavy runs (the gate, a release build, an
# agent's `nx run-many -t test`) off the same machine at once.
#
# Mechanism is `mkdir`, not `flock`, on EVERY platform deliberately. `flock` is
# absent from macOS, so a `command -v flock` fallback would silently hand two
# concurrent runs two DIFFERENT mutexes on a host where one run found it and the
# other did not — mutual exclusion that cannot fail because it never engaged.
# `mkdir` is atomic on every POSIX filesystem and has no dependency to be
# missing, so one mechanism holds everywhere.
#
# See {@link resolveHeavyLockPath} for why the path is not $TMPDIR on macOS.

# The one canonical host-wide path for the heavy-work lock.
#
# **No environment override, and that absence is the point.** An earlier cut of
# this took `$WBS_HEAVY_LOCK` so a test could aim two runs at a private mutex —
# and `tool-dagger/src/heavy-lock.test.ts` caught it, because a caller able to
# choose its own lock path is a caller able to opt out of the lock: two heavy
# runs set it differently, take two different mutexes, and both proceed. That is
# the exact failure this file exists to prevent, reintroduced by its own test
# seam.
#
# Tests get their seam from {@link with_heavy_lock}'s first argument instead,
# which is a path they pass explicitly. Production reaches it through
# `bin/with-heavy-lock.sh`, which calls this and takes what it is given.
#
# h2puni's cache dir on Linux, and `/tmp` on macOS — NOT `$TMPDIR`, which macOS
# sets per-user-per-login-session (`/var/folders/…`), so two agents under
# different sessions would take two different locks and both proceed.
resolve_heavy_lock_path() {
  case "$(uname -s)" in
    Linux) printf '%s\n' /home/puni1/.cache/wbs-heavy-work.lock ;;
    Darwin) printf '%s\n' /tmp/wbs-heavy-work.lock ;;
    *)
      printf 'heavy lock: unsupported platform %s\n' "$(uname -s)" >&2
      return 1
      ;;
  esac
}

# True when $1 names a process this user can signal.
#
# `kill -0` reports EPERM as failure too, which would read a live lock holder
# owned by another user as stale. Every heavy run on these hosts is the same
# user, so EPERM here means the PID was recycled by a daemon and the holder we
# recorded is gone either way.
is_process_alive() {
  kill -0 "$1" 2>/dev/null
}

# Nanoseconds since the epoch, as the 19 digits a ticket name sorts by.
#
# The ANSWER is checked, not the exit status, because BSD `date` on macOS does
# not fail on `+%N` — it prints a literal `N`. A ticket named `1758…N-4321` sorts
# before every real ticket, so that host would quietly hold the head of the queue
# for ever. Homebrew coreutils and `python3` are what a Mac can have instead;
# with neither, this refuses rather than queueing in an order it cannot compute.
#
# Proof (observed 2026-09-16): against a PATH whose `date` prints BSD-style
# `1758012345N` and which has no `python3`, dropping the `^[0-9]{19}$` check
# alone still refuses — {@link read_ticket_pid} catches the name it produced,
# with the wrong diagnosis: `queue holds 1758012345N-1701207, which is not a
# <nanoseconds>-<pid> ticket`, exit 70 about the queue rather than the clock.
# Dropping BOTH was watched enqueueing `1758012345N-<pid>` and running anyway —
# `14b: it ran on a ticket it could not order`, exit 0 where the guard gives 70
# (bin/heavy-lock.test.sh, case 14).
read_epoch_nanoseconds() {
  local stamp
  if stamp=$(date +%s%N 2>/dev/null) && [[ $stamp =~ ^[0-9]{19}$ ]]; then
    printf '%s\n' "$stamp"
    return 0
  fi
  if stamp=$(python3 -c 'import time;print(time.time_ns())' 2>/dev/null) &&
    [[ $stamp =~ ^[0-9]{19}$ ]]; then
    printf '%s\n' "$stamp"
    return 0
  fi
  printf 'heavy lock: no nanosecond clock here (date +%%s%%N and python3 time.time_ns both unusable); refusing to queue in an order it cannot compute\n' >&2
  return 70
}

# The pid encoded in ticket name $1, or 70 when the name cannot be ordered.
#
# A queue entry that is not `<nanoseconds>-<pid>` is unknown state twice over:
# nothing can say whether it arrived before ours, and nothing says whose it is.
# The tempting reading — "no live pid in the name, so it is dead" — deletes a
# file this code did not write, on the strength of a name it could not parse.
#
# Proof (observed 2026-09-16): replacing this condition with `false` was watched
# taking a stray `note` in the queue directory as a ticket from dead pid `note` —
# `heavy lock: removing ticket note from dead pid note`, the file deleted, exit 0
# where the guard gives 70 (bin/heavy-lock.test.sh, case 12).
read_ticket_pid() {
  local ticket_name=$1
  if [[ ! $ticket_name =~ ^[0-9]{19}-[0-9]+$ ]]; then
    printf 'heavy lock: queue holds %q, which is not a <nanoseconds>-<pid> ticket; refusing to guess its place\n' "$ticket_name" >&2
    return 70
  fi
  printf '%s\n' "${ticket_name##*-}"
}

# The lane label recorded in ticket file $1, or 70 when it cannot be read.
#
# A ticket that exists but cannot be read, or that records no label, is trusted
# state this code wrote and can no longer account for. `status` exists to tell a
# human which lane is holding the host up, and a waiter reported with a blank
# label is the one answer worse than no answer.
#
# Proof (observed 2026-09-16): replacing both refusals with an `unlabeled`
# default was watched reporting `heavy lock: waiter pid 999999 label unlabeled
# age 789539464s` for a ticket whose `label` line had been deleted, and the same
# for a mode-000 ticket — exit 0 twice where the guard gives 70
# (bin/heavy-lock.test.sh, cases 13b and 13c).
read_ticket_label() {
  local ticket=$1
  if [[ ! -r $ticket ]]; then
    printf 'heavy lock: ticket %s is unreadable; refusing to report a waiter it cannot name\n' "$ticket" >&2
    return 70
  fi
  # Line 2 and only line 2. A ticket also records the command it queued for, and
  # a command containing a line of its own that begins `label ` would otherwise
  # contribute a second label and put a newline through the middle of a `status`
  # line.
  local label
  label=$(sed -n '2s/^label //p' "$ticket")
  if [[ -z $label ]]; then
    printf 'heavy lock: ticket %s records no lane label; refusing to report a waiter it cannot name\n' "$ticket" >&2
    return 70
  fi
  printf '%s\n' "$label"
}

# The epoch second at which ticket $1's owner stops waiting, or 70 when the
# ticket does not record one.
#
# **`kill -0` alone cannot decide that a ticket is live.** Pids are recycled: a
# waiter killed with SIGKILL runs no trap, and the pid its ticket names may be
# handed to something unrelated minutes later — after which the ticket looks
# alive for ever and every lane on the host queues behind a ghost. A ticket
# therefore carries the instant its own owner would have given up, and
# {@link remove_dead_tickets} reclaims it a minute past that whatever its pid
# says.
#
# Line 4, for the reason {@link read_ticket_label} takes line 2: the command a
# ticket records is arbitrary text and must not be able to contribute a second
# deadline.
#
# Proof (observed 2026-09-16): replacing the epoch check with a `0` default —
# the shape a reader reaches for when a line is missing — was watched reclaiming
# a ticket from this suite's OWN live pid whose `deadline` line had been deleted:
# `17d … want exit 70, got 0` and `17e: it deleted a ticket whose deadline it
# could not read`, the run claiming the lock ahead of a waiter that was still
# waiting (bin/heavy-lock.test.sh, cases 17d-17e).
read_ticket_deadline() {
  local ticket=$1
  if [[ ! -r $ticket ]]; then
    printf 'heavy lock: ticket %s is unreadable; refusing to guess when its owner stops waiting\n' "$ticket" >&2
    return 70
  fi
  local deadline
  deadline=$(sed -n '4s/^deadline //p' "$ticket")
  if [[ ! $deadline =~ ^[0-9]+$ ]]; then
    printf 'heavy lock: ticket %s records %q as its deadline, not an epoch second; refusing to guess\n' "$ticket" "$deadline" >&2
    return 70
  fi
  printf '%s\n' "$deadline"
}

# The tickets ahead of $2 in queue $1, as `label (pid N)` oldest first.
#
# **A message, not a decision**, and that is why it is the one reader in this
# file that does not refuse over what it cannot read. The refusal it decorates
# has already been decided; a ticket that leaves the queue while this lists it is
# reported as `gone` rather than turned into an exit 70 that would replace a
# correct 75.
describe_tickets_ahead() {
  local queue_dir=$1 ticket_name=$2
  local described='' ticket ticket_name_ahead ticket_label
  for ticket in "$queue_dir"/*; do
    [[ -e $ticket ]] || continue
    ticket_name_ahead=${ticket##*/}
    [[ $ticket_name_ahead < $ticket_name ]] || continue
    ticket_label=$(sed -n '2s/^label //p' "$ticket" 2>/dev/null)
    [[ -n $ticket_label ]] || ticket_label=gone
    if [[ -n $described ]]; then
      described="$described, "
    fi
    described="$described$ticket_label (pid ${ticket_name_ahead##*-})"
  done
  printf '%s\n' "$described"
}

# Create the queue directory $1 if it is absent, or return 70 when it is unusable.
#
# **An unusable queue is not an empty one, and that is the whole guard.** The
# ticket glob over a directory this process cannot read expands to nothing, so
# without this every waiter reads a queue with nobody in it and takes the lock
# the moment `mkdir` succeeds: mutual exclusion still works, and the arrival
# order this file now promises silently does not.
#
# Proof (observed 2026-09-16): replacing both conditions with `false` was
# watched, against a mode-300 queue directory holding an older ticket from a LIVE
# pid, letting the newer run claim the lock ahead of it — it announced `heavy
# lock: waited 0s behind 0 tickets`, wrote its `RAN AHEAD OF THE QUEUE` marker
# and exited 0 where the guard gives 70. On a mode-500 queue the same fault turns
# the refusal into the ticket redirect's own bare `Permission denied` and exit 1
# (bin/heavy-lock.test.sh, cases 10a-10d).
prepare_ticket_queue() {
  local queue_dir=$1
  # Proof (observed 2026-09-16): removing this refusal never lets a run through —
  # the check below catches what it leaves — but it makes the answer wrong. With
  # a plain FILE at the queue path the surviving refusal said `queue directory …
  # is not readable and writable` about something that is not a directory at all,
  # and on a lock whose queue simply did not exist yet it refused every run the
  # same way: 10 of the suite's checks failed, none of them naming what was
  # actually wrong (bin/heavy-lock.test.sh, case 15b).
  if [[ ! -d $queue_dir ]] && ! mkdir -p "$queue_dir" 2>/dev/null; then
    printf 'heavy lock: cannot create the queue directory %s; refusing to claim out of order\n' "$queue_dir" >&2
    return 70
  fi
  if [[ ! -r $queue_dir || ! -w $queue_dir || ! -x $queue_dir ]]; then
    printf 'heavy lock: queue directory %s is not readable and writable; refusing to claim out of order\n' "$queue_dir" >&2
    return 70
  fi
}

# Remove every ticket in $1 whose pid is gone, naming each on stderr.
#
# Whoever sees a dead ticket removes it. A waiter killed with SIGKILL runs no
# trap, and one ticket nobody will ever claim against is a queue that never moves
# again — the starvation this change exists to end, in a worse form.
#
# Proof (observed 2026-09-16): replacing the reclaim with `:` was watched leaving
# a ticket from an exited pid at the head of the queue and refusing the next run
# with `heavy lock: … is held by pid ?`, exit 75 against a lock nobody held
# (bin/heavy-lock.test.sh, case 9).
remove_dead_tickets() {
  local queue_dir=$1
  local now ticket ticket_name ticket_pid ticket_deadline
  now=$(date +%s)
  for ticket in "$queue_dir"/*; do
    # A glob that matches nothing expands to itself; an already-claimed ticket
    # disappears between the glob and this line, which is ordinary.
    [[ -e $ticket ]] || continue
    ticket_name=${ticket##*/}
    ticket_pid=$(read_ticket_pid "$ticket_name") || return $?
    if ! is_process_alive "$ticket_pid"; then
      printf 'heavy lock: removing ticket %s from dead pid %s\n' "$ticket_name" "$ticket_pid" >&2
      rm -f "$ticket"
      continue
    fi
    [[ -e $ticket ]] || continue
    ticket_deadline=$(read_ticket_deadline "$ticket") || return $?
    # A minute past its owner's own deadline. The grace is not politeness: the
    # owner may be inside the `sleep` of its final poll, and reclaiming a ticket
    # from a process that is about to claim with it is how two runs end up
    # believing they are next. 60s is twelve default poll intervals.
    #
    # Proof (observed 2026-09-16): with this branch removed, a ticket from a LIVE
    # pid whose deadline had passed two minutes earlier kept the next run out —
    # `17a … want exit 0, got 75`, refused by `is held by pid ?` about a lock
    # nobody held (bin/heavy-lock.test.sh, case 17).
    if ((now > ticket_deadline + 60)); then
      printf 'heavy lock: removing ticket %s from pid %s, whose wait budget expired %ss ago\n' \
        "$ticket_name" "$ticket_pid" "$((now - ticket_deadline))" >&2
      rm -f "$ticket"
    fi
  done
}

# How many tickets in $1 arrived before ticket name $2.
#
# String comparison IS the numeric one here: every name starts with exactly 19
# digits, and equal-width digit runs collate the same way in every locale. A
# same-nanosecond tie falls through to the pid, which is arbitrary but total.
count_tickets_ahead() {
  local queue_dir=$1 ticket_name=$2
  local ahead=0 ticket
  for ticket in "$queue_dir"/*; do
    [[ -e $ticket ]] || continue
    if [[ ${ticket##*/} < $ticket_name ]]; then
      ahead=$((ahead + 1))
    fi
  done
  printf '%s\n' "$ahead"
}

# Record who holds $1: the lane label first, then the pid.
#
# That order is load-bearing. A reader takes the pid file as proof that there IS
# a holder and the label as which lane it is, so writing the pid first opens a
# window where a holder exists whose label does not — and there is nothing to
# guess in that window, only something to refuse over.
record_lock_holder() {
  local lock_dir=$1
  printf '%s\n' "${HEAVY_LOCK_LABEL:-unlabeled}" >"$lock_dir/label"
  printf '%s\n' "$$" >"$lock_dir/holder"
}

# Print who holds the lock at $1 and who is queued for it, oldest first.
#
# On stdout, because this is the answer to a question a human asked rather than a
# diagnostic emitted beside other work; the refusals below go to stderr like
# every other refusal in this file.
#
# Reached in production as `bin/with-heavy-lock.sh status`, which supplies
# {@link resolve_heavy_lock_path}'s answer. The path is an argument for the
# reason the top of this file gives at length.
report_heavy_lock_status() {
  local lock_path=${1:?lock path is required}
  local lock_dir="$lock_path.d"
  local queue_dir="$lock_path.queue"

  if [[ ! -d $lock_dir ]]; then
    printf 'heavy lock: holder none\n'
  elif [[ ! -r $lock_dir || ! -x $lock_dir ]]; then
    # R5: a lock directory that exists but cannot be read is an unknown state,
    # and "no holder" is the one report that would send a human to clear a lock
    # that is legitimately held.
    #
    # Proof (observed 2026-09-16): replacing this condition with `false` was
    # watched reporting `heavy lock: holder pid  label ` for a mode-000 lock
    # directory, behind two `cat: … Permission denied` lines — a held lock
    # reported as nobody's, exit 0 where the guard gives 70
    # (bin/heavy-lock.test.sh, case 13a).
    printf 'heavy lock: %s is unreadable; refusing to report a holder it cannot name\n' "$lock_dir" >&2
    return 70
  else
    # **Absent is not unreadable**, and reading them as the same thing made this
    # report refuse over two ordinary states. `claim_heavy_lock` makes exactly
    # this distinction and this now matches it: the winner between its `mkdir`
    # and its holder write has no holder file YET, and a lock taken before this
    # file grew a queue has no label file at all. Neither is unknown state; both
    # were being reported as `is unreadable`, exit 70, to a caller whose only
    # crime was running `status` at the wrong microsecond.
    # Proof (observed 2026-09-16), both directions of the distinction:
    #   - reading absent as unreadable, which is what shipped, was watched
    #     refusing a lock directory whose holder had not been written yet and one
    #     with no label file — `18a … want exit 0, got 70` and `18c … want exit
    #     0, got 70`, a report unusable at exactly the moment it is interesting;
    #   - replacing the two `-r` branches with `false` was watched turning the
    #     refusal into `cat: …/holder: Permission denied` and exit 1, with no
    #     report line at all — `18e … want exit 70, got 1`, `18f … want exit 70,
    #     got 1` (bin/heavy-lock.test.sh, cases 18a-18f).
    local holder_pid holder_label
    if [[ ! -e $lock_dir/holder ]]; then
      printf 'heavy lock: holder claiming\n'
    elif [[ ! -r $lock_dir/holder ]]; then
      printf 'heavy lock: %s is unreadable; refusing to report a holder it cannot name\n' "$lock_dir/holder" >&2
      return 70
    else
      holder_pid=$(cat "$lock_dir/holder")
      if [[ ! -e $lock_dir/label ]]; then
        holder_label='unlabeled (pre-queue holder)'
      elif [[ ! -r $lock_dir/label ]]; then
        printf 'heavy lock: %s is unreadable; refusing to report a holder it cannot name\n' "$lock_dir/label" >&2
        return 70
      else
        holder_label=$(cat "$lock_dir/label")
      fi
      printf 'heavy lock: holder pid %s label %s\n' "$holder_pid" "$holder_label"
    fi
  fi

  [[ -d $queue_dir ]] || return 0
  # Proof (observed 2026-09-16): replacing this condition with `false` was
  # watched reporting a holder and NO waiters for a mode-000 queue directory
  # holding two tickets — exit 0, an empty queue it could not read
  # (bin/heavy-lock.test.sh, case 13d).
  if [[ ! -r $queue_dir || ! -x $queue_dir ]]; then
    printf 'heavy lock: queue directory %s is unreadable; refusing to report a queue it cannot read\n' "$queue_dir" >&2
    return 70
  fi

  local now ticket ticket_name ticket_pid ticket_label ticket_deadline ticket_budget
  now=$(date +%s)
  for ticket in "$queue_dir"/*; do
    [[ -e $ticket ]] || continue
    ticket_name=${ticket##*/}
    ticket_pid=$(read_ticket_pid "$ticket_name") || return $?
    ticket_label=$(read_ticket_label "$ticket") || return $?
    ticket_deadline=$(read_ticket_deadline "$ticket") || return $?
    # The budget is what says whether a waiter is still waiting or is a ticket
    # {@link remove_dead_tickets} is about to reclaim, which is the difference
    # between a queue that is moving and one that is stuck.
    if ((now < ticket_deadline)); then
      ticket_budget="$((ticket_deadline - now))s left"
    else
      ticket_budget=expired
    fi
    # `10#` because a stamp is read as a literal: a leading zero would otherwise
    # make bash treat it as octal and reject the digits 8 and 9.
    printf 'heavy lock: waiter pid %s label %s age %ss budget %s\n' \
      "$ticket_pid" "$ticket_label" "$((now - 10#${ticket_name%%-*} / 1000000000))" "$ticket_budget"
  done
}

# Take the lock at $lock_dir, or return 75 if someone else holds it.
#
# Reclaims a lock whose recorded holder is dead — a run killed with SIGKILL
# leaves the directory behind, and refusing every subsequent run until a human
# removes it by hand converts one crash into a wedged host.
claim_heavy_lock() {
  local lock_dir=$1
  local holder_file="$lock_dir/holder"

  if mkdir "$lock_dir" 2>/dev/null; then
    record_lock_holder "$lock_dir"
    return 0
  fi

  # R5: the lock exists but is unreadable — that is an unknown state, not a free
  # lock and not a held one. Throw rather than guess in either direction.
  if [[ ! -r $holder_file ]]; then
    if [[ -e $holder_file ]]; then
      printf 'heavy lock: %s exists but is unreadable; refusing to guess\n' "$holder_file" >&2
      return 70
    fi
    # No holder file yet: the winner is between its mkdir and its write.
    return 75
  fi

  local holder
  holder=$(cat "$holder_file")
  # Proof: replacing this condition with `false` was watched reclaiming a lock
  # whose holder file read `not-a-pid` — "reclaiming … from dead pid not-a-pid",
  # then `RAN ON CORRUPT LOCK`, exit 0 where the guard gives 70
  # (bin/heavy-lock.test.sh, case 6).
  if [[ ! $holder =~ ^[0-9]+$ ]]; then
    printf 'heavy lock: %s holds %q, not a pid; refusing to guess\n' "$holder_file" "$holder" >&2
    return 70
  fi

  # Proof: replacing this function's body with `false` was watched letting a
  # second run start while the first still held the lock — `RAN CONCURRENTLY`,
  # exit 0 where the guard gives 75 (bin/heavy-lock.test.sh, case 2).
  if is_process_alive "$holder"; then
    return 75
  fi

  printf 'heavy lock: reclaiming %s from dead pid %s\n' "$lock_dir" "$holder" >&2
  rm -rf "$lock_dir"
  if mkdir "$lock_dir" 2>/dev/null; then
    record_lock_holder "$lock_dir"
    return 0
  fi
  # Another run reclaimed it first. It holds the lock; we do not.
  return 75
}

# Install `$1` as the EXIT/INT/TERM action, running the caller's own EXIT trap
# `$2` after it on exit.
#
# **The caller's EXIT trap is not ours to throw away.** `bin/h2puni-gate.sh`
# installs `trap 'rm -rf -- "$trusted_launcher_dir"' EXIT` before it ever reaches
# this file, and a plain `trap … EXIT` here replaces it. Before the queue existed
# that was bounded: the replacement happened only after the lock was claimed, so
# a gate refused at its budget still ran its own cleanup. A queueing run sets its
# trap BEFORE it waits, so without this chaining every gate that exits 75 at its
# 30-minute budget — or is interrupted while queued — leaves an mktemp directory
# behind on a host several lanes share, for ever.
#
# `$2` arrives exactly as `trap -p EXIT` printed it: `trap -- 'CMD' EXIT`, with
# CMD quoted by bash itself. The wrapper is stripped back to that quoted CMD and
# re-run through `eval`, so this never re-parses a quoting bash already got
# right. `trap -p` exists in bash 3.2.
#
# INT and TERM get the release only. A handled signal does not end the shell by
# itself, so the caller's EXIT trap still runs when it finally exits; running it
# from here as well would run it twice.
#
# Proof (observed 2026-09-16): replacing the chain with the plain
# `trap "$release_command" EXIT INT TERM` that shipped was watched leaving the
# gate fixture's mktemp directory behind after a gate refused 75 while queued —
# `FAIL: a gate refused while queued leaked its trusted-launcher directory`
# (bin/h2puni-gate.test.sh, case 33).
install_release_trap() {
  local release_command=$1 caller_exit_trap=$2
  if [[ -z $caller_exit_trap ]]; then
    # shellcheck disable=SC2064 # Expanded now, deliberately: the paths are
    # function-locals that are out of scope by the time the trap runs, and under
    # `set -u` a deferred expansion aborts the trap and leaks what it was to
    # remove. See the note in with_heavy_lock.
    trap "$release_command" EXIT INT TERM
    return 0
  fi
  local caller_exit_command=${caller_exit_trap#trap -- }
  caller_exit_command=${caller_exit_command% EXIT}
  # shellcheck disable=SC2064 # Expanded now, deliberately: see above.
  trap "$release_command; eval $caller_exit_command" EXIT
  # shellcheck disable=SC2064 # Expanded now, deliberately: see above.
  trap "$release_command" INT TERM
}

# Run `command [arg ...]` while holding the host-wide heavy-work lock.
#
# Refuses immediately with exit 75 when another run holds it, preserving the
# contract `bin/h2puni-gate.sh` and `bin/publish-release.sh` were written
# against. Set `$HEAVY_LOCK_WAIT_SECONDS` to queue instead of refusing — that is
# what several agents sharing one Mac want, where refusing just moves the
# thrashing into a retry loop.
#
# **Waiting is a QUEUE, not a race.** Every run leaves a ticket in
# `$lock_path.queue` named `<nanoseconds>-<pid>` before it tries to claim, and
# claims only as the oldest live ticket. The `mkdir` lottery this replaced went
# to whichever waiter's poll happened to land first, which is how a browser gate
# on h2puni waited 50 minutes while four jobs that arrived after it went ahead —
# the wait a waiter has already served bought it nothing, so the more lanes a
# host has, the likelier one starves.
#
# Every claim reports `heavy lock: waited <n>s behind <k> tickets` on stderr,
# including `waited 0s behind 0 tickets`: only this function knows either number,
# and a line that appears exactly when a run was delayed is a line nobody can
# grep for to find the runs that were not.
#
# Throws (does not run unlocked) when the lock's parent directory is not
# writable: a heavy run that believes it is serialised while it is not is the
# exact failure this file exists to prevent.
with_heavy_lock() {
  local lock_path=${1:?lock path is required}
  shift
  if [[ ${1:-} != -- || $# -lt 2 ]]; then
    printf 'usage: %s -- command [arg ...]\n' "${0##*/}" >&2
    return 64
  fi
  shift

  # Captured BEFORE this function installs any trap of its own, so that both of
  # its traps chain the CALLER's trap rather than each other.
  local caller_exit_trap
  caller_exit_trap=$(trap -p EXIT)

  local lock_dir="$lock_path.d"
  local lock_parent
  lock_parent=$(dirname "$lock_dir")
  if [[ ! -d $lock_parent ]]; then
    printf 'heavy lock: %s does not exist\n' "$lock_parent" >&2
    return 70
  fi
  # Not what stops an unlocked run — `mkdir` already fails on an unwritable
  # parent and the claim returns 75. What this stops is the DIAGNOSIS being a
  # lie: without it a queueing run reads its own failed `mkdir` as "someone else
  # holds the lock", sleeps out its whole budget, and reports `held by pid ?`
  # about a lock nobody has and nobody can ever take.
  #
  # Proof: replacing this condition with `false` was watched turning a
  # `HEAVY_LOCK_WAIT_SECONDS=15` run against a chmod-500 directory from a 0s
  # exit-70 into a 16s spin ending in `held by pid ?` — a 30-minute budget would
  # have spun 30 minutes (bin/heavy-lock.test.sh, case 5).
  if [[ ! -w $lock_parent ]]; then
    printf 'heavy lock: %s is not writable; refusing to run unlocked\n' "$lock_parent" >&2
    return 70
  fi

  local queue_dir="$lock_path.queue"
  prepare_ticket_queue "$queue_dir" || return $?

  # The ticket goes in BEFORE the first claim attempt, so a run that takes a free
  # lock is ordered against a waiter that arrives during that same instant rather
  # than jumping it.
  #
  # The start time is read BEFORE the stamp the ticket is named after, so a
  # ticket can never claim to have started after the instant it was ordered by.
  local ticket_started
  ticket_started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local ticket_stamp
  ticket_stamp=$(read_epoch_nanoseconds) || return $?
  local ticket_name="$ticket_stamp-$$"
  # Derived from the stamp this ticket is ORDERED by rather than from a second
  # clock reading: the two cannot then disagree, and the queue needs no more
  # clock than the one it already refused to run without. `10#` because a stamp
  # is read as a literal and a leading zero would make bash read it as octal.
  local ticket_deadline=$((10#$ticket_stamp / 1000000000 + ${HEAVY_LOCK_WAIT_SECONDS:-0}))
  local ticket_path="$queue_dir/$ticket_name"
  # Written under a DOT name and renamed into place. `> "$ticket_path"` creates
  # the file and `printf` fills it, so a reader landing between the two saw a
  # ticket with no label and refused it as malformed — a refusal caused by
  # nothing but timing. `*` does not match a dotfile and `mv` within one
  # directory is atomic, so a ticket under its real name is always a complete
  # ticket. A draft left by a run killed mid-write is invisible to every glob
  # here and is removed by this run's own trap.
  local ticket_draft="$queue_dir/.draft-$ticket_name"

  # Expanded into the trap string now, and quoted with `printf %q` rather than
  # `${var@Q}`, for the two reasons the release trap below records: a deferred
  # expansion reads a dead function-local under `set -u`, and `@Q` is a syntax
  # error on the bash 3.2 macOS ships. A leaked ticket is worse than a leaked
  # lock — the lock is reclaimed from its dead pid, but a ticket nobody removes
  # holds the head of the queue until it expires.
  #
  # Set BEFORE the ticket is written, so a run interrupted mid-write leaves
  # neither the draft nor the ticket behind.
  #
  # Proof (observed 2026-09-16): installing `true` in place of the removal was
  # watched leaving the ticket of a run REFUSED at its wait budget in the queue —
  # `16d: a refused run left 1 ticket(s) in the queue`, where it would have gone
  # on ordering waiters behind a process that had already given up
  # (bin/heavy-lock.test.sh, case 16d).
  local quoted_ticket_paths
  quoted_ticket_paths="$(printf '%q' "$ticket_path") $(printf '%q' "$ticket_draft")"
  install_release_trap "rm -f $quoted_ticket_paths" "$caller_exit_trap"
  printf 'pid %s\nlabel %s\nstarted %s\ndeadline %s\ncommand %s\n' \
    "$$" "${HEAVY_LOCK_LABEL:-unlabeled}" "$ticket_started" "$ticket_deadline" "$*" >"$ticket_draft"
  mv "$ticket_draft" "$ticket_path"

  local enqueued_at=$SECONDS
  local deadline=$((SECONDS + ${HEAVY_LOCK_WAIT_SECONDS:-0}))
  local claim_status tickets_ahead
  local tickets_ahead_at_arrival=
  while true; do
    remove_dead_tickets "$queue_dir" || return $?
    tickets_ahead=$(count_tickets_ahead "$queue_dir" "$ticket_name") || return $?
    if [[ -z $tickets_ahead_at_arrival ]]; then
      tickets_ahead_at_arrival=$tickets_ahead
    fi
    claim_status=0
    if [[ $tickets_ahead -eq 0 ]]; then
      claim_heavy_lock "$lock_dir" || claim_status=$?
    else
      # Someone arrived first and is still alive. Their turn, even if `mkdir`
      # would succeed for us right now — that instant is exactly the lottery.
      #
      # Proof (observed 2026-09-16): this branch is the whole change, and the
      # code without it is what shipped. Against a holder released while the
      # first waiter's five-second poll slept and the second's one-second poll
      # did not, the second waiter took the lock it queued for second —
      # `8: waiters are served in arrival order: want 'a b ', got 'b a '`
      # (bin/heavy-lock.test.sh, case 8).
      claim_status=75
    fi
    [[ $claim_status -eq 0 ]] && break
    [[ $claim_status -ne 75 ]] && return "$claim_status"
    if ((SECONDS >= deadline)); then
      # **The refusal names the reason it refused.** A waiter that gives up
      # because someone was ahead of it used to report `is held by pid ?`: the
      # lock is free at that instant, nobody holds it, and the one fact that
      # explains the refusal — who is in front, and which lane they are — was the
      # fact the message did not carry.
      #
      # Proof (observed 2026-09-16): printing the holder line unconditionally,
      # which is what shipped, was watched reporting
      # `heavy lock: /tmp/…bash.d is held by pid ?` for a run refused behind one
      # live ticket (bin/heavy-lock.test.sh, case 20b).
      if [[ $tickets_ahead -gt 0 ]]; then
        printf 'heavy lock: gave up after %ss behind %s tickets: %s\n' \
          "$((SECONDS - enqueued_at))" "$tickets_ahead" \
          "$(describe_tickets_ahead "$queue_dir" "$ticket_name")" >&2
      else
        printf 'heavy lock: %s is held by pid %s\n' "$lock_dir" "$(cat "$lock_dir/holder" 2>/dev/null || echo '?')" >&2
      fi
      return 75
    fi
    # `HEAVY_LOCK_POLL_SECONDS` exists so a test can make two waiters poll at
    # different rates and pin WHO gets the lock rather than who woke up first.
    # Production leaves it at 5.
    sleep "${HEAVY_LOCK_POLL_SECONDS:-5}"
  done

  # Out of the queue the moment the lock is ours: the ticket's only job is to
  # order waiters, and a holder that kept its own would block every one of them
  # for as long as it holds — a gate's fifteen minutes.
  #
  # Proof (observed 2026-09-16): removing this line was watched leaving the
  # holder's own ticket in the queue for the whole run (`tickets while held: 1 ->
  # 1789542873547664968-1922461`, the holder's own pid) — `16e: a run holding the
  # lock kept its own ticket, which blocks every waiter behind it`. The release
  # trap still cleans it afterwards, which is why 16b alone cannot see this
  # (bin/heavy-lock.test.sh, case 16e).
  rm -f "$ticket_path"
  printf 'heavy lock: waited %ss behind %s tickets\n' \
    "$((SECONDS - enqueued_at))" "$tickets_ahead_at_arrival" >&2

  # Released on every exit path including SIGINT/SIGTERM. `exec` cannot be used
  # here for that reason: an exec'd command leaves no shell to run the trap, and
  # the lock outlives the run it was protecting.
  #
  # The path is expanded NOW, into the trap string. A single-quoted trap defers
  # the expansion to exit time, when `lock_dir` is a dead function-local — under
  # `set -u` that aborts the trap and leaks the lock on every run.
  #
  # `printf %q` rather than `${lock_dir@Q}`: macOS ships bash 3.2 as /bin/bash,
  # where `@Q` is a syntax error that likewise leaks the lock on every run.
  local quoted_lock_dir
  quoted_lock_dir=$(printf '%q' "$lock_dir")
  # The ticket paths are removed here too, although the claim above already
  # removed the ticket: this trap replaces the waiting one, and leaving them out
  # would mean a run interrupted between the two `rm`s keeps its place in a queue
  # it has already left. The caller's own EXIT trap is chained by
  # {@link install_release_trap} rather than replaced.
  install_release_trap "rm -rf $quoted_lock_dir; rm -f $quoted_ticket_paths" "$caller_exit_trap"

  local run_status=0
  "$@" || run_status=$?
  return "$run_status"
}
