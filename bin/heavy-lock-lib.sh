#!/usr/bin/env bash
set -euo pipefail

# The host-wide mutex that keeps two heavy runs (the gate, a release build, an
# agent's `nx run-many -t test`) off the same machine at once.
#
# **The mutex is `flock(2)` on the lock path, taken through `perl`, on EVERY
# platform.** It used to be `mkdir "$lock_path.d"`, on the reading that `mkdir`
# is atomic everywhere. The syscall is; the command is not. h2puni's
# /usr/bin/mkdir is uutils coreutils 0.8.0, and two concurrent `mkdir d` there
# both exit 0 — 10 of 300 races on 2026-09-27, 47 of 300 the day before, against
# 0 of 300 for GNU `gnumkdir` — so two gates could both hold the lock and run in
# the shared gate tree at once. {@link acquire_heavy_flock} records the choice.
#
# The directory stays, as a RECORD rather than the mutex: `lock.d/holder` and
# `lock.d/label` are what `status` reports and what a run still on the code
# before this change reads to see that the host is taken. See
# {@link claim_heavy_lock} for that transition.
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
  # Line 2 and only line 2. A ticket also records the command it queued for, and
  # a command containing a line of its own that begins `label ` would otherwise
  # contribute a second label and put a newline through the middle of a `status`
  # line.
  #
  # **The read comes first and its failure is classified afterwards**, because a
  # `-r` test cannot tell a ticket that is GONE from one that is unreadable — it
  # is false for both — and the two are opposites here. A ticket claimed or
  # reclaimed by someone else while this scan runs is what a moving queue looks
  # like; refusing 70 over it made a run fail for having read a queue that was
  # working. Exit 66 says gone, and every caller skips that ticket.
  #
  # Proof (observed 2026-09-16): with the `-r` test in front, a `sed` shim that
  # deletes the ticket it is asked to read — the race made certain rather than
  # rare — was watched failing both the waiting run and the report:
  # `21a … want exit 0, got 70` and `21b … want exit 0, got 70`
  # (bin/heavy-lock.test.sh, case 21).
  local label
  if ! label=$(sed -n '2s/^label //p' "$ticket" 2>/dev/null); then
    [[ -e $ticket ]] || return 66
    printf 'heavy lock: ticket %s is unreadable; refusing to report a waiter it cannot name\n' "$ticket" >&2
    return 70
  fi
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
  # Read first, classify after, and 66 for a ticket that has gone: see
  # {@link read_ticket_label}. This reader is the one every waiting run calls on
  # every ticket on every poll, so it meets a vanishing ticket most often — and
  # refusing 70 there killed the run doing the scanning rather than the queue it
  # was scanning.
  local deadline
  if ! deadline=$(sed -n '4s/^deadline //p' "$ticket" 2>/dev/null); then
    [[ -e $ticket ]] || return 66
    printf 'heavy lock: ticket %s is unreadable; refusing to guess when its owner stops waiting\n' "$ticket" >&2
    return 70
  fi
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
    # `gone` and `unknown` are different facts about a ticket ahead, and the
    # reader of this line is deciding whether to wait for it: one says it has
    # left the queue, the other that it is still in front and cannot be named.
    #
    # Proof (observed 2026-09-16): the single `gone` this replaced was watched
    # describing a ticket that was present, live and simply had no label line —
    # `gave up after 0s behind 1 tickets: gone (pid 2404329)`, which reads as a
    # queue that has emptied rather than one this run is still behind
    # (bin/heavy-lock.test.sh, case 20d).
    ticket_label=$(sed -n '2s/^label //p' "$ticket" 2>/dev/null) || ticket_label=''
    if [[ -z $ticket_label ]]; then
      if [[ -e $ticket ]]; then
        ticket_label=unknown
      else
        ticket_label=gone
      fi
    fi
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
  local now ticket ticket_name ticket_pid ticket_deadline read_status
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
    read_status=0
    ticket_deadline=$(read_ticket_deadline "$ticket") || read_status=$?
    # 66: someone claimed or reclaimed this ticket while the scan was reading it.
    # The queue moved, which is the queue working.
    if [[ $read_status -eq 66 ]]; then
      continue
    fi
    if [[ $read_status -ne 0 ]]; then
      return "$read_status"
    fi
    # A minute past its owner's own deadline. The grace is not politeness: the
    # owner may be inside the `sleep` of its final poll, and reclaiming a ticket
    # from a process that is about to claim with it is how two runs end up
    # believing they are next. 60s is twelve default poll intervals, and
    # {@link with_heavy_lock} refuses a `HEAVY_LOCK_POLL_SECONDS` above 30 so
    # that this stays at least two polls wide.
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

  # Drafts from runs killed mid-write. A SIGKILLed run runs no trap, and no
  # ticket glob matches a dotfile, so without this nothing would ever look at one
  # again: one file per killed run, for ever, on a host nobody cleans by hand.
  # The pid in the name is all this needs — a draft whose owner is alive is a
  # ticket being written right now, and removing it would delete a live run's
  # place in the queue before it took it.
  #
  # Proof (observed 2026-09-16): with this loop absent, a `.draft-` file from an
  # exited pid survived every run — `23b: the draft from a dead pid was left
  # behind for ever` (bin/heavy-lock.test.sh, case 23).
  for ticket in "$queue_dir"/.draft-*; do
    [[ -e $ticket ]] || continue
    ticket_name=${ticket##*/}
    ticket_pid=$(read_ticket_pid "${ticket_name#.draft-}") || return $?
    if ! is_process_alive "$ticket_pid"; then
      printf 'heavy lock: removing draft ticket %s from dead pid %s\n' "$ticket_name" "$ticket_pid" >&2
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
    # this distinction and this matches it on the transient states: the winner
    # between its `mkdir` and its holder write has no holder file YET, and a lock
    # taken before this file grew a queue has no label file at all. It does not
    # match on the corrupt one — a holder file whose contents are not a pid stops
    # `claim_heavy_lock` with exit 70, while this reports it verbatim, because a
    # human reading a report is better served by the bytes than by a refusal. Neither is unknown state; both
    # were being reported as `is unreadable`, exit 70, to a caller whose only
    # crime was running `status` at the wrong microsecond.
    # **Both files are read BEFORE anything is decided about them**, the way
    # {@link claim_heavy_lock} and {@link read_ticket_label} read theirs. A
    # holder that releases between a test and a `cat` takes both files with it,
    # and testing first made the report die on the read — `cat: …/holder: No such
    # file or directory`, exit 1 under `set -e`, from the one command whose whole
    # job is to be safe to run at any moment.
    #
    # Absent is then still not unreadable, which is the other half: an absent
    # holder is a claim in progress (or a release that just happened), an absent
    # label is a holder that predates the queue, and either file present but
    # unreadable is unknown state.
    #
    # Proof (observed 2026-09-16), three faults:
    #   - reading absent as unreadable, which the first cut did, was watched
    #     refusing a lock whose holder had not been written yet and one with no
    #     label file — `18a … want exit 0, got 70`, `18c … want exit 0, got 70`;
    #   - replacing the two unreadable branches with `false` was watched turning
    #     the refusal into `cat: …/holder: Permission denied` and exit 1 with no
    #     report at all — `18e`, `18f … want exit 70, got 1`;
    #   - testing before reading was watched, against a `cat` shim that removes
    #     the file it is asked to read, killing the report outright — `25a … want
    #     exit 0, got 1` (bin/heavy-lock.test.sh, cases 18a-18f and 25).
    local holder_pid='' holder_label='' holder_status=0 label_status=0
    holder_pid=$(cat "$lock_dir/holder" 2>/dev/null) || holder_status=$?
    holder_label=$(cat "$lock_dir/label" 2>/dev/null) || label_status=$?
    if [[ $holder_status -ne 0 && -e $lock_dir/holder ]]; then
      printf 'heavy lock: %s is unreadable; refusing to report a holder it cannot name\n' "$lock_dir/holder" >&2
      return 70
    fi
    if [[ $label_status -ne 0 && -e $lock_dir/label ]]; then
      printf 'heavy lock: %s is unreadable; refusing to report a holder it cannot name\n' "$lock_dir/label" >&2
      return 70
    fi
    if [[ $holder_status -ne 0 || $label_status -ne 0 ]] && [[ ! -d $lock_dir ]]; then
      # The holder released while this was reading it — the whole lock directory
      # is gone, not just the file. There is no holder now, and saying so is the
      # whole truth available.
      #
      # Proof (observed 2026-09-16): with this branch removed, a `cat` shim that
      # removes the lock directory it is asked to read from left the report
      # saying `heavy lock: holder claiming` about a lock nobody holds and nobody
      # is claiming — `25d: a lock whose directory has gone is reported as free,
      # not as being claimed` (bin/heavy-lock.test.sh, case 25c-25d).
      printf 'heavy lock: holder none\n'
    elif [[ $holder_status -ne 0 || -z $holder_pid ]]; then
      # Either the file is not there yet or it is there and still empty. Both are
      # the same instant, and it is the one {@link claim_heavy_lock} answers with
      # 75 rather than calling the lock corrupt — this now matches it on both
      # halves rather than only on the missing file.
      #
      # Proof (observed 2026-09-16): without the `-z` half, a present but empty
      # holder file was reported as `heavy lock: holder pid  label held` — a
      # holder with no pid, from the report, at an instant the claim path already
      # models (bin/heavy-lock.test.sh, case 25f).
      printf 'heavy lock: holder claiming\n'
    else
      if [[ $label_status -ne 0 ]]; then
        holder_label='unlabeled (pre-queue holder)'
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

  local now ticket ticket_name ticket_pid ticket_label ticket_deadline ticket_budget read_status
  now=$(date +%s)
  for ticket in "$queue_dir"/*; do
    [[ -e $ticket ]] || continue
    ticket_name=${ticket##*/}
    ticket_pid=$(read_ticket_pid "$ticket_name") || return $?
    # 66 from either reader: the waiter took the lock, or its ticket was
    # reclaimed, between the listing and the read. It is not in the queue any
    # more, so it does not belong in a report of the queue — and a report that
    # exits 70 because the thing it was reporting on went away is a report nobody
    # can leave running.
    read_status=0
    ticket_label=$(read_ticket_label "$ticket") || read_status=$?
    if [[ $read_status -eq 66 ]]; then
      continue
    fi
    if [[ $read_status -ne 0 ]]; then
      return "$read_status"
    fi
    ticket_deadline=$(read_ticket_deadline "$ticket") || read_status=$?
    if [[ $read_status -eq 66 ]]; then
      continue
    fi
    if [[ $read_status -ne 0 ]]; then
      return "$read_status"
    fi
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

# Take `flock(2)` on the file `$1` through file descriptor 9 of THIS shell,
# returning 0 held, 75 held by someone else, or 70 when it cannot be tried.
#
# **Why `perl`, and why one mechanism.** macOS ships no `flock` command, which is
# why this file once replaced util-linux `flock` with `mkdir`: `bin/h2puni-gate.sh`
# exited 127 on every Mac. A `command -v flock` fallback would hand two runs on
# one host two different mutexes. `perl` is /usr/bin/perl on macOS and is
# `perl-base` (Essential) on Ubuntu, and its `flock` is the `flock(2)` syscall
# wherever `d_flock` is set — which is checked, because without it perl emulates
# `flock` with `fcntl` locks, which belong to the process and would die with
# `perl` itself. It locks the open file description that fd 9 names; perl
# adopts fd 9 with `>&=` rather than duplicating it, so the lock outlives `perl`
# and lasts until this shell closes fd 9 or dies. The kernel releases it on any
# death, SIGKILL included, which is what makes reclaiming a dead holder's record
# safe (see {@link claim_heavy_lock}).
#
# The file is opened for append and never truncated, replaced or removed: a run
# that unlinked it would leave the next claimant locking a different inode from
# the holder. h2puni already has a zero-byte `wbs-heavy-work.lock` from before the
# `mkdir` era, and it serves.
#
# Fd 9 belongs to this library in the shell that sources it. The wrapped command
# runs with it closed (see {@link with_heavy_lock}), so a daemon it leaves
# behind cannot keep the host locked after the run has gone.
#
# Proof (observed 2026-09-27): replacing this function's body with `return 0` —
# the claim back to trusting whatever the directory record says, under a
# `mkdir` that always exits 0 — was watched letting both claimants hold:
# `28a: 2 of two claimants hold the lock under an always-succeeding mkdir
# (claim statuses: 0 0 )` and the same for 28b, the reclaim of a dead holder,
# three runs of three; 28e also ran its command on a host without perl
# (bin/heavy-lock.test.sh, case 28).
acquire_heavy_flock() {
  local lock_file=$1
  if ! exec 9>>"$lock_file"; then
    printf 'heavy lock: cannot open %s for locking; refusing to run unlocked\n' "$lock_file" >&2
    return 70
  fi
  local flock_status=0
  # shellcheck disable=SC2016 # Single quotes are the point: this is perl source.
  perl -MConfig -MFcntl=:flock -e '
    $Config{d_flock} or exit 71;
    open(my $held, ">&=", 9) or exit 72;
    flock($held, LOCK_EX | LOCK_NB) and exit 0;
    exit($!{EWOULDBLOCK} ? 75 : 73);
  ' || flock_status=$?
  case $flock_status in
    0) return 0 ;;
    75) ;;
    71) printf 'heavy lock: this perl has no native flock(2); refusing a lock that would die with perl\n' >&2 ;;
    127) printf 'heavy lock: perl is not installed; it is required for flock(2) on %s\n' "$lock_file" >&2 ;;
    *) printf 'heavy lock: flock(2) on %s failed (perl exit %s); refusing to run unlocked\n' "$lock_file" "$flock_status" >&2 ;;
  esac
  exec 9>&-
  [[ $flock_status -eq 75 ]] && return 75
  return 70
}

# Take the lock at $lock_dir, or return 75 if someone else holds it.
#
# The mutex is {@link acquire_heavy_flock} on the file `$lock_dir` names without
# its `.d`; `$lock_dir` itself is the holder record, written only while the
# flock is held. Every decision about the record below is therefore made by one
# claimant at a time, and none of it asks `mkdir` whether it won.
#
# **Transition: a record without a flock behind it.** Runs still on the code
# before this change (a gate launched from an older checkout) take the lock by
# `mkdir` alone and hold no flock. Under the flock this treats the record exactly
# as that code did: a live holder, or a record whose holder is not written yet,
# is someone else's lock and is left untouched (75); a holder that is not a pid
# or cannot be read is unknown state (70); only a DEAD holder is reclaimed. Old
# code in turn sees this code's record and refuses. What no change here can
# close is old code racing old code, an old claimer's `mkdir` racing this one's
# record at the instant the directory is created — the uutils window — or an
# old RECLAIMER that read a dead pid, paused, and then removes this code's live
# record. Those end only when every launcher on the host runs this code; the
# rollout is in openspec/changes/exclusive-heavy-lock/proposal.md.
#
# Reclaims a record whose holder is dead — a run killed with SIGKILL leaves the
# directory behind, and refusing every subsequent run until a human removes it
# by hand converts one crash into a wedged host. The flock makes that safe
# between claimants on this code: the dead holder's flock went with it, and a
# second reclaimer waits outside the flock until the first has written its own
# live record.
claim_heavy_lock() {
  local lock_dir=$1
  local holder_file="$lock_dir/holder"

  acquire_heavy_flock "${lock_dir%.d}" || return $?

  # R5: the record exists but is unreadable — that is an unknown state, not a
  # free lock and not a held one. Throw rather than guess in either direction.
  #
  # **Read first, classify after**, the same way {@link read_ticket_label} does
  # and for the same reason: `-r` cannot tell a holder file that is GONE from one
  # that is unreadable, and testing it before the read leaves a window in which
  # the holder releases the lock — `rm -rf` takes the file with it — between the
  # test and the `cat`. The read then comes back empty and the pid check below
  # calls a released lock corrupt.
  #
  # Proof (observed 2026-09-16): with the `-r` test in front, a queueing run was
  # watched losing that race in the ordinary suite, with no fault injected at
  # all — `cat: …bash.d/holder: No such file or directory`, then
  # `holder holds '', not a pid; refusing to guess` and
  # `3a: a queueing run gets its turn: want exit 0, got 70`. Case 24 makes the
  # same window certain with a `cat` shim that removes the holder file before
  # reading it.
  if [[ -e $lock_dir ]]; then
    local holder
    if ! holder=$(cat "$holder_file" 2>/dev/null); then
      if [[ -e $holder_file ]]; then
        printf 'heavy lock: %s exists but is unreadable; refusing to guess\n' "$holder_file" >&2
        exec 9>&-
        return 70
      fi
      # Gone, or never written. A record with no holder under our flock is
      # either a release that just happened or a run on the older code between
      # its `mkdir` and its write — which holds no flock, so the flock says
      # nothing about it. Both are answered by trying again.
      exec 9>&-
      return 75
    fi
    if [[ -z $holder ]]; then
      # Created but not yet written — the same instant as the branch above, seen
      # from the other side of `record_lock_holder`'s redirect.
      exec 9>&-
      return 75
    fi
    # Proof: replacing this condition with `false` was watched reclaiming a lock
    # whose holder file read `not-a-pid` — "reclaiming … from dead pid not-a-pid",
    # then `RAN ON CORRUPT LOCK`, exit 0 where the guard gives 70
    # (bin/heavy-lock.test.sh, case 6).
    if [[ ! $holder =~ ^[0-9]+$ ]]; then
      printf 'heavy lock: %s holds %q, not a pid; refusing to guess\n' "$holder_file" "$holder" >&2
      exec 9>&-
      return 70
    fi
    # Proof: replacing this function's body with `false` was watched letting a
    # second run start while the first still held the lock — `RAN CONCURRENTLY`,
    # exit 0 where the guard gives 75 (bin/heavy-lock.test.sh, case 2). Under the
    # flock this is also what keeps a live holder on the older code, which holds
    # no flock, from being overrun (case 28c-28d).
    if is_process_alive "$holder"; then
      exec 9>&-
      return 75
    fi
    printf 'heavy lock: reclaiming %s from dead pid %s\n' "$lock_dir" "$holder" >&2
    rm -rf "$lock_dir"
  fi

  # `-p` and the `-d` check rather than `mkdir`'s answer: ownership was decided
  # by the flock, and `mkdir`'s exit status is the thing that could not be
  # trusted.
  if ! mkdir -p "$lock_dir" 2>/dev/null || [[ ! -d $lock_dir ]]; then
    printf 'heavy lock: cannot create the holder record %s; refusing to run unrecorded\n' "$lock_dir" >&2
    exec 9>&-
    return 70
  fi
  # A half-written record is removed and the flock let go HERE, because nothing
  # else will: the trap armed while queueing has no lock directory to release,
  # so it would leave the host locked for as long as this shell lives.
  #
  # Proof (observed 2026-09-27): with this unwinding removed, a record directory
  # created without write permission left fd 9 holding the flock after the
  # refusal — `28h: the flock was still held after a refused recording`
  # (bin/heavy-lock.test.sh, case 28g-28h).
  if ! record_lock_holder "$lock_dir" 2>/dev/null; then
    printf 'heavy lock: cannot write the holder record in %s; refusing to run unrecorded\n' "$lock_dir" >&2
    rm -rf "$lock_dir"
    exec 9>&-
    return 70
  fi
}

# Release what a run took, then run the caller's own EXIT trap `$4`, reporting
# every failure and letting none of them stop the rest.
#
# **Isolation is the whole point, and it is what `set -e` takes away.** The trap
# used to be one list — `rm -rf <lock>; rm -f <tickets>; eval <caller>` — so a
# failing `rm` aborted the trap where it stood: the caller's cleanup never ran
# AND the shell exited 1 instead of with the status the run had produced. Watched
# turning a real 75 into a 1. A trap is the last chance to clean up; a step of it
# that fails is a fact to report, not a reason to skip the other steps.
#
# This is the one place in this file that reports and continues instead of
# refusing, and the alternatives are worse rather than merely inconvenient: there
# is no caller left to hand an error to, and exiting non-zero here would destroy
# the run's own verdict. A lock directory that could not be removed is recovered
# by the next run through {@link claim_heavy_lock}'s dead-pid reclaim, and a
# ticket that could not be removed expires on its own budget, so both failures
# have an owner. Returns 0 so that bash exits with the status it was already
# exiting with (measured: a trap that returns 0 keeps the 75; one that fails
# under `set -e` replaces it with 1).
#
# The release runs BEFORE the caller's trap, not after: a caller trap that calls
# `exit` would otherwise skip the lock release entirely, and the lock is the part
# of this that other processes on the host are waiting for.
#
# Proof (observed 2026-09-16): restoring the unisolated list
# (`rm -rf <lock>; rm -f <tickets>; eval <caller>`) was watched, against a run
# whose lock directory could not be removed because its parent had lost write
# permission, turning the run's own exit 42 into 1, skipping the caller's EXIT
# trap, and saying nothing at all — `22a … want exit 42, got 1`,
# `22b: a release that could not finish skipped the caller's EXIT trap`,
# `22c: the release did not say what it could not remove`
# (bin/heavy-lock.test.sh, case 22).
release_heavy_lock() {
  local lock_dir=$1 ticket_path=$2 ticket_draft=$3 caller_exit_command=${4:-}
  # The record goes while the flock is still held, and the flock goes after it:
  # the other order lets the next claimant take the flock, find this run's
  # record with this run's live pid in it, and refuse.
  if [[ -n $lock_dir ]]; then
    if ! rm -rf "$lock_dir"; then
      printf 'heavy lock: could not remove %s; the next run reclaims it from this pid\n' "$lock_dir" >&2
    fi
    exec 9>&-
  fi
  if ! rm -f "$ticket_path" "$ticket_draft"; then
    printf 'heavy lock: could not remove ticket %s; it expires on its own budget\n' "$ticket_path" >&2
  fi
  if [[ -n $caller_exit_command ]]; then
    eval "$caller_exit_command" ||
      printf 'heavy lock: the exit trap this run inherited failed (status %s)\n' "$?" >&2
  fi
  return 0
}

# Trap the release of `$1` (empty while still queueing), ticket `$2` and draft
# `$3`, chaining on exit the caller's own EXIT trap `$4` as `trap -p EXIT`
# printed it.
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
# `$4` arrives exactly as `trap -p EXIT` printed it: `trap -- 'CMD' EXIT`, with
# CMD quoted by bash itself. The wrapper is stripped back to that quoted CMD and
# passed through as one word, so this never re-parses a quoting bash already got
# right. `trap -p` exists in bash 3.2.
#
# **INT and TERM release and then EXIT**, and the exit is the whole point.
#
# A trap handler that only cleans up does not stop a run: bash defers a trapped
# signal until the foreground child returns, runs the handler, and then CONTINUES
# the script. Watched on h2puni on 2026-09-16, pid 4049358: a waiter sent
# `kill -TERM` ran its release, deleted its own ticket, and went straight back
# into the wait loop as a waiter with no ticket — free to claim ahead of everyone
# who still had one. The cleanup mechanism broke the ordering it exists to
# protect, and `kill` stopped nothing. `bin/heavy-lock.test.sh` case 27a-27d is
# that observation, made deterministic.
#
# The conventional statuses, 128 + the signal number, because a caller reading an
# exit status has to be able to tell a signalled run from a refused one (75) or a
# broken one (70).
#
# The EXIT trap is cleared first. The handler runs the release INCLUDING the
# caller's chained command and then exits, so leaving EXIT armed would run both a
# second time — `rm` twice is harmless, but a caller's own cleanup is not ours to
# run twice.
#
# A HOLDER's command is not cut short, and that is a decision rather than an
# accident of bash's deferral: the command is the work the lock exists to
# serialise, and killing it from in here would abandon a checkout or a build in a
# state nobody chose. A caller that wants the command dead signals the process
# group. Case 27e-27g pins that the release and the exit still follow it.
#
# Proof (observed 2026-09-16): with the handler that shipped — release, no exit —
# a TERM'd waiter was watched surviving and taking the lock the holder released:
# `27a … want exit 143, got 0`, `27b: it took 5s to leave, which is not one
# poll`, and `27d: the signalled waiter claimed the lock after it was told to
# stop`. Also `27e`/`27h`/`27i … got 0` for a holder, an INT and a caller script.
# The same fault leaves the EXIT trap armed behind the handler, and the caller's
# own cleanup was watched running twice — `27j: the caller's own EXIT trap ran 2
# times`, which is what `trap - EXIT` above prevents
# (bin/heavy-lock.test.sh, case 27).
#
# Proof (observed 2026-09-16): replacing the chain with the plain
# `trap "rm -rf …" EXIT INT TERM` that shipped was watched leaving the gate
# fixture's mktemp directory behind after a gate refused 75 while queued —
# `FAIL: a gate refused while queued leaked its trusted-launcher directory`
# (bin/h2puni-gate.test.sh, case 33).
install_release_trap() {
  local lock_dir=$1 ticket_path=$2 ticket_draft=$3 caller_exit_trap=$4
  local release
  release="release_heavy_lock $(printf '%q' "$lock_dir") $(printf '%q' "$ticket_path")"
  release="$release $(printf '%q' "$ticket_draft")"
  if [[ -n $caller_exit_trap ]]; then
    local caller_exit_command=${caller_exit_trap#trap -- }
    caller_exit_command=${caller_exit_command% EXIT}
    release="$release $caller_exit_command"
  fi
  # shellcheck disable=SC2064 # Expanded now, deliberately: the paths are
  # function-locals that are out of scope by the time the trap runs, and under
  # `set -u` a deferred expansion aborts the trap and leaks what it was to
  # remove. `printf %q` rather than `${var@Q}`, which is a syntax error on the
  # bash 3.2 macOS ships.
  trap "$release" EXIT
  # shellcheck disable=SC2064 # Expanded now, deliberately: see above.
  trap "trap - EXIT; $release; exit 130" INT
  # shellcheck disable=SC2064 # Expanded now, deliberately: see above.
  trap "trap - EXIT; $release; exit 143" TERM
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
# **The exit codes a caller can see**, because scripts branch on them:
#   - the command's own status when it ran,
#   - `75` another run holds the lock, or a live ticket is ahead of this one,
#   - `70` state this cannot make sense of — an unwritable lock parent, an
#     unusable queue, a holder or ticket that is present and unreadable, no
#     nanosecond clock,
#   - `64` usage: no `--`, or a `HEAVY_LOCK_POLL_SECONDS` outside 1-30,
#   - `130` and `143` this run was sent INT or TERM; the lock and ticket are
#     released before it goes.
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

  # Validated here, at the boundary, and bounded by more than taste: a ticket is
  # reclaimed 60 seconds past its owner's deadline
  # ({@link remove_dead_tickets}), which is only safe while the owner's own last
  # claim attempt lands within one poll of that deadline. A 300-second poll would
  # put a live waiter's final attempt four minutes past the instant everyone else
  # considers its ticket expired, and two runs would each believe they were next.
  # 30 is that grace halved.
  #
  # `10#` on the comparison, and it is the whole guard rather than a nicety: bash
  # arithmetic reads a leading zero as OCTAL, so a plain `((poll_seconds > 30))`
  # lets `031` past as 25 and then hands `sleep` the string `031`, which every
  # `sleep` reads as 31 — the bound defeated by notation. `08` is worse: it is not
  # a legal octal number, the comparison errors out, and an errored comparison is
  # a false one, so the guard passes.
  #
  # Zero is refused as well, and not for tidiness: a zero interval turns the wait
  # loop into a busy spin on the lock directory for the whole budget — half an
  # hour of `mkdir` and `date` per gate on a host that is already contended.
  #
  # Proof (observed 2026-09-16): with the check absent, `abc` and `300` were both
  # accepted in silence — `26a`/`26c … want exit 64, got 0`, the first surviving
  # only until the run had to wait, where `sleep abc` ends it with an unnamed 1.
  # With the check present but without `10#`, `031` and `08` were watched passing
  # too — `26e`/`26f … want exit 64, got 0`, the latter printing
  # `((: 08: value too great for base` on its way through — and `0` was accepted
  # before this refused it (`26h`) (bin/heavy-lock.test.sh, case 26).
  local poll_seconds=${HEAVY_LOCK_POLL_SECONDS:-5}
  if [[ ! $poll_seconds =~ ^[1-9][0-9]*$ ]] || ((10#$poll_seconds > 30)); then
    printf 'heavy lock: HEAVY_LOCK_POLL_SECONDS is %q; it must be a whole number of seconds from 1 to 30, written without a leading zero, because a queued ticket is reclaimed 60s past its deadline and a zero interval spins\n' \
      "$poll_seconds" >&2
    return 64
  fi

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
  # Not what stops an unlocked run — the flock file cannot be opened in an
  # unwritable parent, and {@link acquire_heavy_flock} refuses 70. What this
  # adds is a refusal that names the parent before a ticket is written. It was
  # load-bearing under the `mkdir` claim, whose failed `mkdir` read as "someone
  # else holds the lock", slept out the whole budget, and reported `held by pid ?`.
  #
  # Proof (observed 2026-09-16, against the `mkdir` claim): replacing this
  # condition with `false` was watched turning a `HEAVY_LOCK_WAIT_SECONDS=15` run
  # against a chmod-500 directory from a 0s exit-70 into a 16s spin ending in
  # `held by pid ?` (bin/heavy-lock.test.sh, case 5, which still pins 70 at once).
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
  install_release_trap '' "$ticket_path" "$ticket_draft" "$caller_exit_trap"
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
      # Someone arrived first and is still alive. Their turn, even if the lock
      # is free for us right now — that instant is exactly the lottery.
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
    # Production leaves it at 5; the value was validated and bounded at the top of
    # this function, where the reason for the bound is written down.
    sleep "$poll_seconds"
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
  # The ticket paths are passed here too, although the claim above already
  # removed the ticket: this trap replaces the waiting one, and leaving them out
  # would mean a run interrupted between the two removals keeps its place in a
  # queue it has already left. The caller's own EXIT trap is chained by
  # {@link install_release_trap} rather than replaced.
  install_release_trap "$lock_dir" "$ticket_path" "$ticket_draft" "$caller_exit_trap"

  # Fd 9 closed for the command: it holds this run's flock, and a daemon the
  # command leaves behind (an Nx daemon, a watcher) would otherwise keep the
  # host locked after this run has released its record and gone.
  #
  # In a subshell rather than as `"$@" 9>&-`, because bash applies that
  # redirection to a FUNCTION by saving fd 9 on another descriptor in this very
  # shell: a function command that calls `exit` then runs the release trap with
  # fd 9 already closed and the saved copy still holding the flock, all through
  # the caller's own cleanup.
  #
  # Proof (observed 2026-09-27): with `"$@" 9>&-` restored, a function command
  # that exits was watched leaving the flock held while the caller's EXIT trap
  # ran — `28j: the flock was held during the caller's cleanup`
  # (bin/heavy-lock.test.sh, case 28i-28j).
  local run_status=0
  (
    exec 9>&-
    "$@"
  ) || run_status=$?
  return "$run_status"
}

# The checkout this library belongs to: the launcher's own, whose Dash runs an enrolled job.
heavy_lock_checkout=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

# The host pool configuration whose presence enrolls a Linux host (`dash-host-jobs` J12).
#
# **Fixed, with no environment override**, for the reason {@link resolve_heavy_lock_path}
# gives: a caller able to name its own enrollment is a caller able to opt out of it. Tests reach
# the enrolled branch by redefining this function in their own shell, or inside a mount
# namespace where this path is a fixture.
resolve_host_pool_config_path() {
  printf '%s\n' /home/puni1/.config/dash/host-pool.json
}

# The host pool's managed root, which the gate host role writes into the configuration as
# `root` (`dash-host-jobs` slice 6a assumption S6-A1). Fixed for the reason above: the ledger
# under it is what proves a host was enrolled when its configuration has gone missing.
resolve_host_pool_root() {
  printf '%s\n' /home/puni1/.local/share/dash/host-pool
}

# The ledger Dash keeps under {@link resolve_host_pool_root}, `<root>/.dash/resources.sqlite`.
resolve_host_pool_ledger_path() {
  printf '%s/.dash/resources.sqlite\n' "$(resolve_host_pool_root)"
}

# The Dash entrypoint of this library's own checkout: an enrolled job is admitted by the Dash of
# the launcher's revision, which also reads the job catalogue at that checkout's HEAD.
resolve_dash_entrypoint() {
  printf '%s/apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts\n' "$heavy_lock_checkout"
}

# `present` or `absent` for path $1, or 70 when this account cannot tell.
#
# `[[ -e ]]` is false both for a path that does not exist and for one behind a directory this
# account cannot search, and the two are opposites here: an absent ledger lets a host run on the
# legacy lock, a hidden one may be an enrolled host's. So the deepest ancestor that exists must
# be a searchable directory before an absence is believed.
#
# Proof (observed 2026-11-02): replacing the refusal with `absent` let `run_heavy_job` run on
# the legacy lock beside a ledger behind a mode-000 directory — `41: … want exit 70, got 0`
# (bin/heavy-lock.test.sh, case 41).
read_path_presence() {
  local path=$1
  if [[ -e $path || -L $path ]]; then
    printf 'present\n'
    return 0
  fi
  local ancestor=${path%/*}
  while [[ -n $ancestor && ! -e $ancestor ]]; do
    ancestor=${ancestor%/*}
  done
  [[ -n $ancestor ]] || ancestor=/
  if [[ -d $ancestor && -x $ancestor ]]; then
    printf 'absent\n'
    return 0
  fi
  printf 'heavy job: cannot tell whether %s exists: %s is not a searchable directory\n' \
    "$path" "$ancestor" >&2
  return 70
}

# `enrolled` or `unenrolled`, or 70 when the host's enrollment is unknown (`dash-host-jobs` J12).
#
# Enrolled is a Linux host whose {@link resolve_host_pool_config_path} exists; it must then be a
# readable file naming {@link resolve_host_pool_root} as its root. A host whose configuration is
# missing beside an existing ledger was enrolled and is now broken, and running it on the legacy
# lock would let its jobs overlap the ones Dash still holds: 70, naming both.
#
# Proof (observed 2026-11-02): with the ledger check removed, `run_heavy_job` took the legacy
# lock beside a ledger whose configuration was gone — `40a … want exit 70, got 0`; with the
# readability check removed, a mode-000 configuration was still refused, by `jq`, but as one
# that `names no root` — `40c: the refusal did not say the configuration is unreadable`; with
# the root check removed, a configuration naming another root reached Dash — `40e … want exit
# 70, got 0` (bin/heavy-lock.test.sh, case 40).
read_host_pool_enrollment() {
  if [[ $(uname -s) != Linux ]]; then
    printf 'unenrolled\n'
    return 0
  fi
  local config ledger root config_presence ledger_presence configured_root
  config=$(resolve_host_pool_config_path)
  ledger=$(resolve_host_pool_ledger_path)
  root=$(resolve_host_pool_root)
  config_presence=$(read_path_presence "$config") || return $?
  if [[ $config_presence == absent ]]; then
    ledger_presence=$(read_path_presence "$ledger") || return $?
    if [[ $ledger_presence == present ]]; then
      printf 'heavy job: host pool configuration %s is missing beside the ledger %s; restore the configuration (this host is enrolled) rather than run on the legacy lock\n' \
        "$config" "$ledger" >&2
      return 70
    fi
    printf 'unenrolled\n'
    return 0
  fi
  if [[ ! -f $config || ! -r $config ]]; then
    printf 'heavy job: host pool configuration %s is not a readable file\n' "$config" >&2
    return 70
  fi
  # Proof (observed 2026-11-02): removed, the host without `jq` was still refused 70, but as a
  # configuration that `names no root` — `46c: the refusal did not name jq`
  # (bin/heavy-lock.test.sh, case 46).
  if ! command -v jq >/dev/null 2>&1; then
    printf 'heavy job: jq is not on PATH; it reads the root of the host pool configuration %s\n' "$config" >&2
    return 70
  fi
  if ! configured_root=$(jq -er '.root | strings' "$config" 2>/dev/null); then
    printf 'heavy job: host pool configuration %s names no root\n' "$config" >&2
    return 70
  fi
  if [[ $configured_root != "$root" ]]; then
    printf 'heavy job: host pool configuration %s names root %s, not %s, where this launcher looks for the ledger\n' \
      "$config" "$configured_root" "$root" >&2
    return 70
  fi
  printf 'enrolled\n'
}

# Run `command [arg ...]` as a heavy job of type `$HEAVY_LOCK_JOB_TYPE` (`dash-host-jobs` J12,
# J13): the production entry every launcher calls.
#
# On an enrolled host ({@link read_host_pool_enrollment}) the job goes to the Dash of this
# checkout, `ops job run`, which admits it from the host pool and runs it measured. Anywhere
# else it takes the host-wide lock exactly as {@link with_heavy_lock} always has. **No variable
# selects the mechanism**: the fixed configuration path does, and {@link with_heavy_lock} with
# its explicit path stays the fixture primitive that takes no enrollment decision.
#
# Proof (observed 2026-11-02): letting `HEAVY_LOCK_MECHANISM=legacy` choose the lock was
# watched taking the legacy lock on an enrolled host — `42b … want 'dash', got 'legacy'`
# (bin/heavy-lock.test.sh, case 42).
#
# The exit codes are {@link with_heavy_lock}'s and Dash's own (J13): the command's status when
# it ran, 128 + signal when it was signalled; `64` usage, no `$HEAVY_LOCK_JOB_TYPE`, or (Dash) an
# uncatalogued type or arguments outside its profile; `70` an unknown enrollment, a missing tool
# or a host that cannot measure the job; `73` an envelope the empty pool cannot hold; `75` no
# room within the wait budget; `129`, `130`, `143` interrupted before the command started.
run_heavy_job() {
  # Proof (observed 2026-11-02): with the refusal reduced to an optional `--`, a command without
  # it ran through Dash — `46d … want exit 64, got 0` (bin/heavy-lock.test.sh, case 46).
  if [[ ${1:-} != -- || $# -lt 2 ]]; then
    printf 'usage: run_heavy_job -- command [arg ...]\n' >&2
    return 64
  fi
  shift
  # Required on every host, enrolled or not, so a launcher that forgot its type fails where it
  # is written rather than on the first host that enrolls.
  # Proof (observed 2026-11-02): with this refusal removed, `run_heavy_job -- true` with no type
  # ran on the legacy lock and reached Dash as `--type ''` on an enrolled host — `43a`/`43b …
  # want exit 64, got 0` (bin/heavy-lock.test.sh, case 43).
  local job_type=${HEAVY_LOCK_JOB_TYPE:-}
  if [[ ! $job_type =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
    printf 'heavy job: HEAVY_LOCK_JOB_TYPE is %q; a launcher names its job type from infra/jobs/catalogue.json\n' \
      "$job_type" >&2
    return 64
  fi
  # Inside an admitted job the payload already runs on that job's admission, measured in its
  # scope; asking again would queue behind its own enclosing job (`dash-host-jobs` 6.10, S6D-A1).
  # Set-but-empty counts as set, so a cleared variable is refused as malformed, not ignored.
  # Proof (observed 2026-11-05): with this branch removed, a launcher inside a fake admitted job
  # asked Dash again under the outer label — `49a: the payload runs under the derived label: want
  # 'gate:abc/test-queued', got 'gate:abc'`, Dash's argv `--label gate:abc`
  # (bin/heavy-lock.test.sh, case 49).
  if [[ -n ${DASH_JOB_ID+set} ]]; then
    local nested_status=0
    run_nested_heavy_job "$job_type" "$@" || nested_status=$?
    return "$nested_status"
  fi
  local enrollment
  enrollment=$(read_host_pool_enrollment) || return $?
  if [[ $enrollment == unenrolled ]]; then
    local legacy_status=0
    with_heavy_lock "$(resolve_heavy_lock_path)" -- "$@" || legacy_status=$?
    return "$legacy_status"
  fi
  run_enrolled_heavy_job "$job_type" "$@"
}

# Seconds a nested call waits for `ops job admission` before refusing (review of #876 F2): one
# Bun start and one SQLite read take well under a second, so a minute only says Dash is stuck.
# Fixed, like the paths above; tests shorten it by redefining this function in their own shell.
resolve_admission_timeout_seconds() {
  printf '60\n'
}

# The cgroup v2 path of this shell, the `0::` line of `/proc/self/cgroup`, or 70 when that file is
# unreadable or has no such line. Tests reach {@link run_nested_heavy_job}'s admitted branch by redefining this function in
# their own shell, as they do the fixed paths: no variable names a cgroup.
read_own_cgroup() {
  local line
  if [[ ! -r /proc/self/cgroup ]]; then
    printf 'heavy job: /proc/self/cgroup is unreadable; cannot tell which Dash job this process runs in\n' >&2
    return 70
  fi
  if ! line=$(grep -m 1 '^0::' /proc/self/cgroup); then
    printf 'heavy job: /proc/self/cgroup has no cgroup v2 entry; cannot tell which Dash job this process runs in\n' >&2
    return 70
  fi
  printf '%s\n' "${line#0::}"
}

# Run `command [arg ...]`, a launcher's payload of type $1, inside the admitted Dash job that
# `DASH_JOB_ID` names, under the label `<outer label>/<type>` (`dash-host-jobs` 6.10, S6D-A1).
#
# **No lock and no admission of its own.** The enclosing job holds the host for it: its scope
# measures and caps the nested work, and Dash attributes every process carrying its
# `DASH_JOB_ID`. Asking again would queue behind that same job, as the observe-mode ticket and
# the concurrent-mode admission both would, so a nested `test:queued` used to wait out its
# budget under the outer job's own label. The derived label is what the payload's
# `HEAVY_LOCK_LABEL` carries and what the one stderr line names; no holder record, ticket or
# receipt is written, because no hold is taken (the receipts `release-pin.ts`,
# `scoping-rollback.ts` and `fleet-check` read carry no label).
#
# **Placement, then admission.** `DASH_JOB_ID` is an environment variable anyone can set, and a
# variable that skips the lock is an opt-out ({@link resolve_heavy_lock_path}). So the id must
# have a job id's shape and this process must run in a scope named `dash-job-<id>.scope` ({@link
# read_own_cgroup}); otherwise 70. That refuses an inherited or hand-set `DASH_JOB_ID` outside
# such a scope, and a launcher that inherited one unsets it before calling (`puni-pr-00`'s
# `build-release.sh` does, before its `run_heavy_job`). A scope of that name proves placement
# only: `systemd-run --user --scope --unit dash-job-<id>` makes one for any id. So the ledger is
# asked last, through `ops job admission` of this checkout's Dash, which reads it without a
# lock: the job must be launched, its payload not yet exited and its leader alive (task 6.10a,
# S6E-A3). On an unenrolled host there is no ledger and so no admitted job: 70.
#
# **A type that declares an exclusive unit is refused, 70.** Its unit is either the enclosing
# job's, in use by the payload that started this one, or not held at all; re-labelling cannot
# make either sound. Today that is every type but `test-queued`.
#
# The payload runs as a foreground child and its status is returned; a signal reaches it through
# the job's scope, which Dash signals as a whole. Exit codes: the payload's, 64 for a type the
# catalogue does not name, 70 for an identity outside its scope, a catalogue that cannot be read,
# a type with an exclusive unit, an unenrolled host, a Dash that cannot answer, or no running job.
#
# Proof (observed 2026-11-05): with the scope comparison replaced by `false`, a `DASH_JOB_ID`
# naming another job's scope ran the payload unlocked — `49d … want exit 70, got 0`; with the
# exclusive-unit refusal removed, a nested `solver-image-publish` ran inside the gate's job —
# `49f … want exit 70, got 0` (bin/heavy-lock.test.sh, case 49). Observed 2026-11-05: with the
# running-job comparison replaced by `false`, a forged scope with no such job ran the payload
# unlocked — `49h … want exit 70, got 0`; with the unenrolled refusal removed, the unenrolled
# host asked a Dash with no ledger — `49k … want exit 70, got 0`; with the answer's job id and
# type unchecked, an answer about another running job ran it — `49i … another-job: want exit 70,
# got 0`.
run_nested_heavy_job() {
  local job_type=$1
  shift
  local job_id=$DASH_JOB_ID
  if [[ ! $job_id =~ ^[0-9a-f-]{36}$ ]]; then
    printf 'heavy job: DASH_JOB_ID is %q, not a Dash job id; unset it to run %s as a job of its own\n' \
      "$job_id" "$job_type" >&2
    return 70
  fi
  local cgroup scope="dash-job-$job_id.scope"
  cgroup=$(read_own_cgroup) || return $?
  if [[ $cgroup != */"$scope" && $cgroup != */"$scope"/* ]]; then
    printf 'heavy job: DASH_JOB_ID is %s, but this process runs in cgroup %s, outside that job'\''s scope %s; unset it to run %s as a job of its own\n' \
      "$job_id" "$cgroup" "$scope" "$job_type" >&2
    return 70
  fi
  local catalogue="$heavy_lock_checkout/infra/jobs/catalogue.json" matches exclusive
  if ! command -v jq >/dev/null 2>&1; then
    printf 'heavy job: jq is not on PATH; it reads the exclusive units of %s from %s\n' "$job_type" "$catalogue" >&2
    return 70
  fi
  if ! matches=$(jq -e --arg type "$job_type" '[.jobs[] | select(.id == $type)] | length' "$catalogue" 2>/dev/null); then
    printf 'heavy job: cannot read the job types of %s\n' "$catalogue" >&2
    return 70
  fi
  if [[ $matches == 0 ]]; then
    printf 'heavy job: %s is not a job type in %s\n' "$job_type" "$catalogue" >&2
    return 64
  fi
  if [[ $matches != 1 ]] ||
    ! exclusive=$(jq -er --arg type "$job_type" \
      '.jobs[] | select(.id == $type) | .envelope.exclusive | if type == "array" then join(",") else error("no exclusive list") end' \
      "$catalogue" 2>/dev/null); then
    printf 'heavy job: %s does not declare %s exactly once with an exclusive unit list\n' "$catalogue" "$job_type" >&2
    return 70
  fi
  local outer_label=${HEAVY_LOCK_LABEL:-unlabeled}
  if [[ -n $exclusive ]]; then
    printf 'heavy job: %s declares the exclusive unit %s; inside dash job %s (%s) it would share that job'\''s unit or hold none, so it runs only as a job of its own, outside %s\n' \
      "$job_type" "$exclusive" "$job_id" "$outer_label" "$outer_label" >&2
    return 70
  fi
  local enrollment
  enrollment=$(read_host_pool_enrollment) || return $?
  if [[ $enrollment == unenrolled ]]; then
    printf 'heavy job: DASH_JOB_ID is %s, but this host is not enrolled in a Dash host pool, so no Dash job admitted it; unset it to run %s on the legacy lock\n' \
      "$job_id" "$job_type" >&2
    return 70
  fi
  local entrypoint answer running query_status=0 limit
  entrypoint=$(resolve_dash_entrypoint)
  if [[ ! -f $entrypoint ]] || ! command -v bun >/dev/null 2>&1 || ! command -v timeout >/dev/null 2>&1; then
    printf 'heavy job: cannot ask Dash whether job %s is running: the entrypoint %s, bun or timeout is missing\n' \
      "$job_id" "$entrypoint" >&2
    return 70
  fi
  # The Dash of this library's own checkout answers: inside a gate that is the candidate commit,
  # which is why the command opens the ledger read-only and refuses another schema version.
  limit=$(resolve_admission_timeout_seconds)
  answer=$(timeout --kill-after=5 "$limit" \
    bun "$entrypoint" ops job admission --config "$(resolve_host_pool_config_path)" --job "$job_id" \
    </dev/null) || query_status=$?
  # Proof (observed 2026-11-05): without `timeout`, a Dash that never answers held the nested
  # call; the jobs suite, bounded at 90 s from outside, ended 124 before printing `49j`. With 124
  # folded into the generic refusal, `49j: the refusal did not say Dash timed out … (exit 124)`
  # (bin/heavy-lock.test.sh).
  if [[ $query_status == 124 || $query_status == 137 ]]; then
    printf 'heavy job: Dash did not say within %ss whether job %s is running; %s does not run on its admission\n' \
      "$limit" "$job_id" "$job_type" >&2
    return 70
  fi
  if [[ $query_status != 0 ]]; then
    printf 'heavy job: Dash could not say whether job %s is running (exit %s); %s does not run on its admission\n' \
      "$job_id" "$query_status" "$job_type" >&2
    return 70
  fi
  if ! running=$(jq -er --arg id "$job_id" \
    'if .job == $id and (.running | type) == "boolean" then (.running | tostring) else error("malformed") end' \
    <<<"$answer" 2>/dev/null); then
    printf 'heavy job: Dash answered %q for job %s, not an admission answer\n' "$answer" "$job_id" >&2
    return 70
  fi
  if [[ $running != true ]]; then
    printf 'heavy job: DASH_JOB_ID is %s and this process runs in its scope, but the host pool ledger has no running job %s (%s); a scope of that name is not an admission; unset it to run %s as a job of its own\n' \
      "$job_id" "$job_id" "$(jq -r '"state " + (.state // "none" | tostring)' <<<"$answer")" "$job_type" >&2
    return 70
  fi
  local nested_label="$outer_label/$job_type"
  printf 'heavy job: %s runs inside dash job %s on that job'\''s admission; no lock or admission of its own\n' \
    "$nested_label" "$job_id" >&2
  local payload_status=0
  HEAVY_LOCK_LABEL=$nested_label "$@" || payload_status=$?
  return "$payload_status"
}

# Run `command [arg ...]` through `ops job run --type $1` and return its status (J13).
#
# **An outer shell, not an `exec`**: the caller's own `EXIT` trap (the gate's trusted-launcher
# cleanup) runs once, when the caller exits with this status. Dash runs in the background and
# this shell waits for it, so a signal sent to the launcher alone is forwarded to Dash at once
# rather than deferred until Dash ends, as bash defers a trap behind a foreground child; Dash
# refuses the job before its gate opens or forwards the signal to the payload after.
#
# The wait and poll budgets reach Dash as flags and only as flags: both are removed from Dash's
# environment, and with it the payload's. The gate keeps `HEAVY_LOCK_WAIT_SECONDS` unexported for
# that reason, and a budget a nested heavy run inherited would make it wait half an hour where its
# caller asked it to refuse.
#
# Proof (observed 2026-11-02): with the `env -u` removed, an exported `HEAVY_LOCK_WAIT_SECONDS`
# reached the payload — `44c … want 'unset unset', got '1800 7'`; with the forwarding trap removed, a TERM
# to the launcher left Dash running until it ended — `45b … want 'TERM', got ''`
# (bin/heavy-lock.test.sh, cases 44 and 45).
run_enrolled_heavy_job() {
  local job_type=$1
  shift
  local entrypoint
  entrypoint=$(resolve_dash_entrypoint)
  # Proof (observed 2026-11-02): removed, a checkout without the entrypoint handed `bun` a path
  # that does not exist — `46a … want exit 70, got 0` against the fake Dash
  # (bin/heavy-lock.test.sh, case 46).
  if [[ ! -f $entrypoint ]]; then
    printf 'heavy job: the Dash entrypoint %s is missing from this checkout; this host is enrolled and runs heavy jobs only through Dash\n' \
      "$entrypoint" >&2
    return 70
  fi
  # Proof (observed 2026-11-02): removed, `env` reported `‘bun’: No such file or directory` —
  # `46b … want exit 70, got 127` (bin/heavy-lock.test.sh, case 46).
  if ! command -v bun >/dev/null 2>&1; then
    printf 'heavy job: bun is not on PATH; this host is enrolled and runs heavy jobs only through Dash (%s)\n' \
      "$entrypoint" >&2
    return 70
  fi
  local saved_traps dash_status dash_pid='' pending_signal=''
  saved_traps=$(trap -p INT TERM HUP)
  # Installed before Dash starts, so a signal in between is held and forwarded once it has a
  # pid rather than lost. The handlers read this function's locals when they run, which bash's
  # dynamic scope allows while the function is still executing.
  # shellcheck disable=SC2016 # Single quotes are the point: expanded when the signal arrives.
  trap 'if [[ -n $dash_pid ]]; then kill -INT "$dash_pid" 2>/dev/null; else pending_signal=INT; fi' INT
  # shellcheck disable=SC2016 # Single quotes are the point: see above.
  trap 'if [[ -n $dash_pid ]]; then kill -TERM "$dash_pid" 2>/dev/null; else pending_signal=TERM; fi' TERM
  # shellcheck disable=SC2016 # Single quotes are the point: see above.
  trap 'if [[ -n $dash_pid ]]; then kill -HUP "$dash_pid" 2>/dev/null; else pending_signal=HUP; fi' HUP
  # `<&0` keeps the caller's stdin: without job control bash gives a background command
  # /dev/null instead.
  env -u HEAVY_LOCK_WAIT_SECONDS -u HEAVY_LOCK_POLL_SECONDS \
    bun "$entrypoint" ops job run \
    --type "$job_type" \
    --config "$(resolve_host_pool_config_path)" \
    --wait-seconds "${HEAVY_LOCK_WAIT_SECONDS:-0}" \
    --poll-seconds "${HEAVY_LOCK_POLL_SECONDS:-5}" \
    --label "${HEAVY_LOCK_LABEL:-unlabeled}" \
    -- "$@" <&0 &
  dash_pid=$!
  if [[ -n $pending_signal ]]; then
    kill "-$pending_signal" "$dash_pid" 2>/dev/null
  fi
  # `wait` returns early, above 128, whenever a trapped signal arrives; Dash is still running
  # then, and its own status is what this returns. 127 says the pid is no longer this shell's
  # child (recycled after bash reaped Dash), which ends the loop rather than spinning on it. The
  # last `wait` on an ended child reads the status bash kept for it, so a signal landing as Dash
  # exits cannot replace that status.
  while kill -0 "$dash_pid" 2>/dev/null; do
    wait "$dash_pid" && break
    [[ $? -ne 127 ]] || break
  done
  dash_status=0
  wait "$dash_pid" || dash_status=$?
  trap - INT TERM HUP
  eval "$saved_traps"
  return "$dash_status"
}
