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

# Take the lock at $lock_dir, or return 75 if someone else holds it.
#
# Reclaims a lock whose recorded holder is dead — a run killed with SIGKILL
# leaves the directory behind, and refusing every subsequent run until a human
# removes it by hand converts one crash into a wedged host.
claim_heavy_lock() {
  local lock_dir=$1
  local holder_file="$lock_dir/holder"

  if mkdir "$lock_dir" 2>/dev/null; then
    printf '%s\n' "$$" >"$holder_file"
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
    printf '%s\n' "$$" >"$holder_file"
    return 0
  fi
  # Another run reclaimed it first. It holds the lock; we do not.
  return 75
}

# Run `command [arg ...]` while holding the host-wide heavy-work lock.
#
# Refuses immediately with exit 75 when another run holds it, preserving the
# contract `bin/h2puni-gate.sh` and `bin/publish-release.sh` were written
# against. Set `$HEAVY_LOCK_WAIT_SECONDS` to queue instead of refusing — that is
# what several agents sharing one Mac want, where refusing just moves the
# thrashing into a retry loop.
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

  local deadline=$((SECONDS + ${HEAVY_LOCK_WAIT_SECONDS:-0}))
  local claim_status
  while true; do
    claim_status=0
    claim_heavy_lock "$lock_dir" || claim_status=$?
    [[ $claim_status -eq 0 ]] && break
    [[ $claim_status -ne 75 ]] && return "$claim_status"
    if ((SECONDS >= deadline)); then
      printf 'heavy lock: %s is held by pid %s\n' "$lock_dir" "$(cat "$lock_dir/holder" 2>/dev/null || echo '?')" >&2
      return 75
    fi
    sleep 5
  done

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
  # shellcheck disable=SC2064 # Expanding now is the point: see above. A
  # single-quoted trap defers to exit time, where `lock_dir` is out of scope and
  # `set -u` aborts the trap, leaking the lock on every run. Watched happening.
  trap "rm -rf $quoted_lock_dir" EXIT INT TERM

  local run_status=0
  "$@" || run_status=$?
  return "$run_status"
}
