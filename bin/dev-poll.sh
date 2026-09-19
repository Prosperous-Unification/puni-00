#!/usr/bin/env bash
# Authoritative dev poller. Its installed shell stays outside the checkout that
# sync.ts resets; every tick streams the target commit's candidate loader.
set -euo pipefail

SRC=${WBS_DEV_SRC:-/home/puni1/wbs-dev/src}
BIN=${WBS_DEV_BIN:-/home/puni1/wbs-dev/bin}
BUN=${WBS_DEV_BUN:-/home/puni1/wbs-dev/bin/bun}
BUN_VERSION_FILE=${WBS_DEV_BUN_VERSION_FILE:-/home/puni1/wbs-dev/bin/bun-version}
CONTAINER=${WBS_DEV_CONTAINER:-wbs-dev-src}
LOG=${WBS_DEV_LOG:-/home/puni1/wbs-dev/logs/deploy.log}
STATE=${WBS_DEV_STATE:-/home/puni1/wbs-dev/state}
REHEARSAL=${WBS_DEV_REHEARSAL:-0}
LOCK="$STATE/poll.lock"
LAST_PROVEN="$STATE/last-proven"
LAST_SYNCED="$STATE/last-synced"

read_served_commit() {
  local response body http_status status_count commit_count
  response=$(docker exec "$CONTAINER" curl -sS -m 5 -w '\n%{http_code}' \
    http://127.0.0.1:3100/health 2>/dev/null) || return 1
  http_status=${response##*$'\n'}
  body=${response%$'\n'*}
  [ "$http_status" = 200 ] || return 1

  status_count=$(printf '%s' "$body" | grep -oE '"status"[[:space:]]*:[[:space:]]*"ok"' | wc -l)
  commit_count=$(printf '%s' "$body" | grep -oE '"commit"[[:space:]]*:[[:space:]]*"[0-9a-f]{40}"' | wc -l)
  [ "$status_count" -eq 1 ] && [ "$commit_count" -eq 1 ] || return 1
  printf '%s' "$body" |
    sed -nE 's/.*"commit"[[:space:]]*:[[:space:]]*"([0-9a-f]{40})".*/\1/p'
}

poll_main() {
  local BUN_VERSION local_sha remote_sha last_proven last_synced served attempt proven_tmp synced_tmp
  local -a sync_args
  if ! read -r BUN_VERSION < "$BUN_VERSION_FILE"; then
    echo "refusing: missing managed Bun version file at $BUN_VERSION_FILE; reinstall the poller pair per docs/runbook-dev-deploy.md" >&2
    return 1
  fi

  mkdir -p "$STATE"
  # This outer lock covers fetch, candidate extraction, sync and the served-code
  # proof. sync.ts holds its separate deploy lock around reset/install/restart.
  exec 9>"$LOCK"
  flock -n 9 || return 0

  cd "$SRC"
  git fetch -q origin main
  local_sha=$(git rev-parse HEAD)
  remote_sha=$(git rev-parse refs/remotes/origin/main)
  last_proven=$(cat "$LAST_PROVEN" 2>/dev/null || true)
  last_synced=$(cat "$LAST_SYNCED" 2>/dev/null || true)
  if [ -z "$last_synced" ]; then
    synced_tmp="$LAST_SYNCED.tmp.$$"
    printf '%s\n' "$local_sha" > "$synced_tmp"
    mv "$synced_tmp" "$LAST_SYNCED"
    last_synced=$local_sha
  fi
  [ "$local_sha" = "$remote_sha" ] && [ "$last_proven" = "$local_sha" ] && \
    [ "$last_synced" = "$local_sha" ] && return 0

  {
    echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ${local_sha:0:7} -> ${remote_sha:0:7}"

    if [ "$local_sha" != "$remote_sha" ] || [ "$last_synced" != "$remote_sha" ]; then
      if [ "$local_sha" = "$remote_sha" ] && [ "$last_synced" != "$remote_sha" ]; then
        echo "--- retrying incomplete sync from ${last_synced:0:7}"
        git reset --hard --quiet "$last_synced"
      fi
      sync_args=()
      if [ "$REHEARSAL" = 1 ]; then
        sync_args=(--source "$SRC" --container "$CONTAINER" --state "$STATE" --rehearsal)
      fi
      # Read the loader from remote_sha, not from the installed poller generation.
      # A later repaired target supplies its recovery path before checkout moves.
      git show "$remote_sha:bin/dev-poll-sync.sh" |
        bash -s -- "$SRC" "$BIN" "$BUN" "$remote_sha" "$BUN_VERSION" "${sync_args[@]}"
      synced_tmp="$LAST_SYNCED.tmp.$$"
      printf '%s\n' "$remote_sha" > "$synced_tmp"
      mv "$synced_tmp" "$LAST_SYNCED"
    fi

    served=''
    for attempt in 1 2 3 4 5 6; do
      served=$(read_served_commit || true)
      if [ "$served" = "$remote_sha" ]; then
        echo "--- serving ${remote_sha:0:7} (health, attempt ${attempt})"
        proven_tmp="$LAST_PROVEN.tmp.$$"
        printf '%s\n' "$remote_sha" > "$proven_tmp"
        mv "$proven_tmp" "$LAST_PROVEN"
        break
      fi
      sleep "${WBS_DEV_PROOF_RETRY_SECONDS:-10}"
    done
    if [ "${served:-}" != "$remote_sha" ]; then
      echo "!!! checkout is at ${remote_sha:0:7}, /health still says '${served:-<unreadable>}'"
      return 1
    fi
  } >> "$LOG" 2>&1
}

if [ "${DEV_POLL_SOURCE_ONLY:-0}" != 1 ]; then
  poll_main
fi
