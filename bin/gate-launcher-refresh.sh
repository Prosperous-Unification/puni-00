#!/usr/bin/env bash
set -euo pipefail

# The systemd unit whose processes run from the launcher checkout by design: it reads the job
# catalogue there and is restarted once the checkout has moved.
watch_unit=dash-resources-watch.service

# The cgroup v2 path of process $1, or nothing when it has exited. Tests redefine this function
# in their own shell to place a process in the watch unit, which they cannot start.
read_process_cgroup() {
  local line
  line=$(grep -m 1 '^0::' "/proc/$1/cgroup" 2>/dev/null) || return 0
  printf '%s\n' "${line#0::}"
}

# Print `<pid> <command>` for every live process of this account working in checkout $1 (its
# working directory is $1 or under it), except the processes of {@link watch_unit}.
#
# That is what "a job launched from the checkout" is: Dash reads the catalogue and the payload's
# revision from the checkout holding the launcher's working directory (`catalogue.ts`), every
# launcher stays alive as the outer shell of its job (J13), and the ledger records no checkout
# for a job (`launcherSha` is null). Other accounts are not read: git refuses a checkout that
# another account owns, so no launcher of theirs runs from this one. A process of this account
# whose working directory the kernel refuses to it is skipped: `/proc/<pid>/cwd` needs ptrace
# read access, which fails only for a process more privileged than the account (non-dumpable
# like `ssh-agent`, or holding capabilities it lacks, like `systemd --user`) or one already
# leaving, and no launcher (bash, Bun or git started by the account) is either.
#
# Proof (observed 2026-11-05): refusing 70 on an unreadable working directory instead refused
# every run on this workstation, first over `ssh-agent` (`cannot read the working directory of
# pid 10816`), then over `systemd --user` (pid 2226, `CapEff 0000000800000000`) —
# `2: an idle checkout is moved: want exit 0, got 70` (bin/gate-launcher-refresh.test.sh).
list_checkout_workers() {
  local checkout=$1 entry pid cwd cgroup
  for entry in /proc/[0-9]*; do
    pid=${entry#/proc/}
    [[ $pid != "$$" && -O $entry ]] || continue
    cwd=$(readlink "$entry/cwd" 2>/dev/null) || continue
    [[ $cwd == "$checkout" || $cwd == "$checkout"/* ]] || continue
    cgroup=$(read_process_cgroup "$pid")
    # Proof (observed 2026-11-05): removed, the watch's own process refused the move —
    # `4: a watch process in the checkout does not block the move: want exit 0, got 75`
    # (bin/gate-launcher-refresh.test.sh, case 4).
    [[ $cgroup != */"$watch_unit" ]] || continue
    printf '%s %s\n' "$pid" "$(cat "$entry/comm" 2>/dev/null || printf '?')"
  done
}

# Move the launcher checkout $1 to `origin/main` while no job runs from it, then restart
# {@link watch_unit} (`dash-host-jobs` 6.9, S6D-A4). Run hourly by `gate-launcher-refresh.timer`,
# which the `gate_host` role enables on an enrolled host; docs/infra/gate-hosts.md.
#
# A checkout already at `origin/main` is left alone and the watch is not restarted. The watch is
# restarted with `try-restart`, so one that is not running (before `ops pool init`) stays
# stopped. A restart mid-hold is what the unit is built for: `KillMode=process` keeps the
# concurrent-mode guard holder alive across it (S6B-A8).
#
# Accepted window: a launcher that starts between the scan and the checkout sees the old or the
# new commit whole, since git replaces files rather than rewriting them, and Dash refuses 64 a
# job whose checkout moved while it waited (`ops job run`), so the worst case is a loud rerun.
#
# Exit codes: 0 moved or already current; 64 usage, not one absolute path; 65 local changes to
# tracked files, never moved over; 70 not the top of a Git work tree, or a failed fetch,
# checkout, frozen install (run when `bun.lock` changed) or restart; 75 a process works in the
# checkout, which the timer retries an hour later.
refresh_launcher_checkout() {
  if [[ $# -ne 1 || $1 != /* ]]; then
    printf 'usage: gate-launcher-refresh.sh /absolute/launcher/checkout\n' >&2
    return 64
  fi
  # Out of the checkout first, so this process never counts as working in it.
  cd /
  local checkout top
  if ! checkout=$(cd "$1" 2>/dev/null && pwd -P) ||
    ! top=$(git -C "$checkout" rev-parse --show-toplevel 2>/dev/null) || [[ $top != "$checkout" ]]; then
    printf 'gate launcher refresh: %s is not the top of a Git work tree\n' "$1" >&2
    return 70
  fi
  # Proof (observed 2026-11-05): removed, a checkout with an edited tracked file was moved with
  # the edit carried along — `5: a dirty checkout is refused: want exit 65, got 0`
  # (bin/gate-launcher-refresh.test.sh, case 5).
  if [[ -n $(git -C "$checkout" status --porcelain --untracked-files=no) ]]; then
    printf 'gate launcher refresh: %s has local changes to tracked files; refusing to move over them\n' \
      "$checkout" >&2
    return 65
  fi
  if ! git -C "$checkout" fetch -q origin; then
    printf 'gate launcher refresh: git fetch origin failed in %s\n' "$checkout" >&2
    return 70
  fi
  local head target
  # `set -e` is inert here (the caller runs this with `|| status=$?`), so the read is checked.
  # Proof (observed 2026-11-05): with the check dropped, a checkout with no HEAD commit moved on
  # with an empty head — `11: a checkout without a HEAD commit is refused: want exit 70, got 0`
  # (bin/gate-launcher-refresh.test.sh, case 11).
  if ! head=$(git -C "$checkout" rev-parse --verify --quiet 'HEAD^{commit}'); then
    printf 'gate launcher refresh: %s has no HEAD commit\n' "$checkout" >&2
    return 70
  fi
  if ! target=$(git -C "$checkout" rev-parse --verify --quiet 'origin/main^{commit}'); then
    printf 'gate launcher refresh: %s has no origin/main after the fetch\n' "$checkout" >&2
    return 70
  fi
  if [[ $head == "$target" ]]; then
    printf 'gate launcher refresh: %s is already at origin/main %s\n' "$checkout" "$target"
    return 0
  fi
  local workers
  workers=$(list_checkout_workers "$checkout") || return $?
  # Proof (observed 2026-11-05): with this refusal removed, the checkout moved under a process
  # working in it — `1: a process in the checkout refuses the move: want exit 75, got 0`
  # (bin/gate-launcher-refresh.test.sh, case 1).
  if [[ -n $workers ]]; then
    printf 'gate launcher refresh: refusing to move %s from %s to %s while a job may run from it: %s\n' \
      "$checkout" "$head" "$target" "$(printf '%s' "$workers" | paste -sd ';' -)" >&2
    return 75
  fi
  if ! git -C "$checkout" checkout -q --detach "$target"; then
    printf 'gate launcher refresh: git checkout of %s failed in %s\n' "$target" "$checkout" >&2
    return 70
  fi
  printf 'gate launcher refresh: moved %s from %s to %s\n' "$checkout" "$head" "$target"
  # The checkout's one frozen install follows its lockfile, or Dash restarts on modules the new
  # commit does not pin.
  # Proof (observed 2026-11-05): removed, a move across a lockfile change restarted the watch on
  # the old install — `10: the frozen install ran in the checkout: want 'install
  # --frozen-lockfile in <checkout>', got ''` (bin/gate-launcher-refresh.test.sh, case 10).
  # A failed install returns the checkout to the commit the watch still runs, with that commit's
  # install, so the next run retries the whole move instead of finding the head current.
  # Proof (observed 2026-11-05): with the return replaced by `true`, the checkout stayed on the
  # commit whose install failed — `10b: the checkout returned to the commit the watch runs`
  # failed (bin/gate-launcher-refresh.test.sh, case 10b).
  if ! git -C "$checkout" diff --quiet "$head" "$target" -- bun.lock; then
    if ! (cd "$checkout" && bun install --frozen-lockfile); then
      if git -C "$checkout" checkout -q --detach "$head" && (cd "$checkout" && bun install --frozen-lockfile); then
        printf 'gate launcher refresh: the frozen install of %s failed in %s; returned it to %s with its install, and the next run retries\n' \
          "$target" "$checkout" "$head" >&2
      else
        printf 'gate launcher refresh: the frozen install of %s failed in %s, and so did the return to %s; check it out, run bun install --frozen-lockfile there, then systemctl --user restart %s\n' \
          "$target" "$checkout" "$head" "$watch_unit" >&2
      fi
      return 70
    fi
  fi
  # Proof (observed 2026-11-05): with the status ignored, a failed restart exited 0 —
  # `8: a failed watch restart is reported: want exit 70, got 0`
  # (bin/gate-launcher-refresh.test.sh, case 8).
  if ! systemctl --user try-restart "$watch_unit"; then
    printf 'gate launcher refresh: %s moved, but restarting %s failed; restart it by hand: systemctl --user restart %s\n' \
      "$checkout" "$watch_unit" "$watch_unit" >&2
    return 70
  fi
}

# One compound command at the end: bash parses all of it, and so has read the whole file, before
# the checkout holding the file moves.
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  status=0
  refresh_launcher_checkout "$@" || status=$?
  exit "$status"
fi
