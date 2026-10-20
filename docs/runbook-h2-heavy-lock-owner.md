# Who holds h2puni's heavy lock?

Run this from a machine with the `h2puni` SSH alias. It only reads the host's
canonical lock status, process table and checkout. Run it again whenever you need
a current answer; a prior report is not a reservation or a live ownership claim.

```sh
ssh h2puni 'bash -s' <<'SH'
set -euo pipefail
lock_status=/home/puni1/wbs-t267/bin/with-heavy-lock.sh
before=$($lock_status status)
printf '%s\n' "$before"
line=${before%%$'\n'*}
case "$line" in
  'heavy lock: holder none') exit 0 ;;
  'heavy lock: holder claiming')
    printf 'Holder claim is in progress; rerun to identify the process.\n' >&2
    exit 75
    ;;
esac
if [[ $line =~ ^heavy\ lock:\ holder\ pid\ ([0-9]+)\ label\ (.+)$ ]]; then
  pid=${BASH_REMATCH[1]}
else
  printf 'Unrecognized holder status; do not infer an owner.\n' >&2
  exit 70
fi
if ! process=$(ps -p "$pid" -o lstart=,pid=,ppid=,user=,stat=,args=); then
  printf 'Recorded holder PID %s is gone; status may have changed:\n' "$pid" >&2
  $lock_status status >&2
  exit 75
fi
if ! started=$(ps -p "$pid" -o lstart=); then
  printf 'Recorded holder PID %s exited during lookup; status now:\n' "$pid" >&2
  $lock_status status >&2
  exit 75
fi
if ! checkout=$(readlink -f "/proc/$pid/cwd"); then
  printf 'Cannot read holder PID %s cwd; status now:\n' "$pid" >&2
  $lock_status status >&2
  exit 70
fi
printf 'Process: %s\nCheckout cwd: %s\n' "$process" "$checkout"
source_known=0
if root=$(git -C "$checkout" rev-parse --show-toplevel 2>/dev/null) &&
   sha=$(git -C "$checkout" rev-parse --verify HEAD 2>/dev/null) &&
   refs=$(git -C "$checkout" for-each-ref --points-at="$sha" --format='%(refname:short)' refs/heads refs/remotes); then
  printf 'Repository: %s\nHEAD: %s\n' "$root" "$sha"
  if [[ -n $refs ]]; then
    printf 'Local refs at HEAD:\n%s\n' "$refs"
  else
    printf 'Local refs at HEAD: none (a detached or unfetched branch is possible)\n'
  fi
  source_known=1
else
  printf 'Git checkout/HEAD/refs: unknown; do not infer fleet from this process.\n' >&2
fi
after=$($lock_status status)
after_line=${after%%$'\n'*}
if ! current_started=$(ps -p "$pid" -o lstart=) ||
   [[ $after_line != "$line" || $current_started != "$started" ]]; then
  printf 'Holder changed or exited during lookup; discard attribution and rerun. Current status:\n%s\n' "$after" >&2
  exit 75
fi
if [[ $source_known -eq 1 ]] && [[ $(git -C "$checkout" rev-parse --verify HEAD) != "$sha" ]]; then
  printf 'Checkout HEAD changed during lookup; rerun.\n' >&2
  exit 75
fi
printf 'Holder recheck: %s\n' "$after_line"
if [[ $source_known -ne 1 ]]; then
  exit 70
fi
SH
```

The first line comes from `bin/with-heavy-lock.sh status`, the canonical status
reader for the host-wide `flock` protocol. It reads the lock record and lists
waiters in queue order. `holder none` means the record showed no holder at that
instant; `holder claiming` means the record is still being written. Exit 75
means the holder may have changed during the lookup, so rerun.
Exit 70 means the process or source could not be identified; do not convert that
to “no holder.” The final status and process-start check reduce the chance of
attributing a gate that exited while being inspected. They are two snapshots,
not an atomic view of a moving host.

For a gate, the process arguments name the requested SHA. Its checkout can
still show a previous HEAD while the gate starts. The gate log's
`h2puni gate: running on <sha>` line confirms which SHA it actually checked out
under the lock; do not call the requested SHA tested before that marker appears.

For fleet attribution, `task-*` is Claire's branch namespace. `integration/*`,
`batch-10/*`, `ui-review/*`, `feat/*`, `refactor/*`, `docs/*`, `wip/*` and `plan/*`
belong to the other fleet under the current coordination contract. A detached
HEAD, no matching ref, multiple conflicting refs or an unrecognized prefix leave
fleet attribution unknown. The `puni1` Unix account and `dany-fedorov` GitHub
author are shared; neither identifies a human or an agent. The queue's label
names the run, not an individual.

You may look up a branch's PR with:

```sh
gh pr list --repo Prosperous-Unification/puni-00 --state all \
  --head <branch> --json number,headRefName,headRefOid,url,state
```

Compare `headRefOid` with the holder's
exact `HEAD`: PRs can move after a gate starts, and several refs or PRs can point
to related commits. A branch or PR association alone cannot prove which commit
the running gate is testing.
